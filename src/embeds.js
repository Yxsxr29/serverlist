const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const config = require('./config');

function formatTime(iso) {
  if (!iso) return '-';

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function chunkPlayers(players, page, perPage) {
  const totalPages = Math.max(1, Math.ceil(players.length / perPage));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * perPage;

  return {
    page: safePage,
    totalPages,
    items: players.slice(start, start + perPage)
  };
}

function buildPlayerLine(player, index, showHistory) {
  const status = player.currently_online ? '🟢' : '⚫';

  const ping =
    player.last_ping !== null && player.last_ping !== undefined
      ? `${player.last_ping}ms`
      : '-';

  const id =
    player.last_player_id !== null && player.last_player_id !== undefined
      ? player.last_player_id
      : '-';

  if (showHistory) {
    const since = player.currently_online
      ? `online seit ${formatTime(player.online_since)}`
      : `offline seit ${formatTime(player.offline_since || player.last_seen)}`;

    return `**${index}.** ${status} ${player.name}\nID: \`${id}\` • Ping: \`${ping}\` • ${since}`;
  }

  return `**${index}.** ${status} ${player.name} — ID: \`${id}\` • Ping: \`${ping}\``;
}

function buildPlayersEmbed({
  players,
  page = 0,
  search = '',
  showHistory = false,
  serverStatus = null
}) {
  const perPage = config.playersPerPage;

  const chunk = chunkPlayers(players, page, perPage);
  const offset = chunk.page * perPage;

  const title = search
    ? `Final City Spieler: Suche "${search}"`
    : 'Final City Spieler';

  const description = chunk.items.length
    ? chunk.items
        .map((p, i) => buildPlayerLine(p, offset + i + 1, showHistory))
        .join('\n\n')
    : 'Keine Spieler gefunden.';

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description.slice(0, 4000))
    .setColor(0x2ecc71)
    .setFooter({
      text: `Seite ${chunk.page + 1}/${chunk.totalPages} • Treffer: ${players.length}`
    })
    .setTimestamp(new Date());

  if (serverStatus) {
    embed.addFields({
      name: 'Serverstatus',
      value: `Online: **${serverStatus.clients}/${serverStatus.maxClients || '?'}**`,
      inline: true
    });
  }

  return {
    embed,
    page: chunk.page,
    totalPages: chunk.totalPages
  };
}

function buildPaginationRow({
  page,
  totalPages,
  search = '',
  mode = 'online'
}) {
  const disabled = totalPages <= 1;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`fc:${mode}:${page - 1}:${encodeURIComponent(search)}`)
      .setLabel('Zurück')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 0),

    new ButtonBuilder()
      .setCustomId(`fc:${mode}:${page + 1}:${encodeURIComponent(search)}`)
      .setLabel('Weiter')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages - 1)
  );
}

function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase();
}

function buildFactionsEmbed({
  factions,
  onlinePlayers,
  serverStatus = null
}) {
  const embed = new EmbedBuilder()
    .setTitle('🏛️ Final City Fraktionen')
    .setColor(0x3498db)
    .setTimestamp(new Date());

  if (!factions.length) {
    embed.setDescription('Es wurden noch keine Fraktionen gespeichert.');
    return embed;
  }

  for (const faction of factions) {
    const count = onlinePlayers.filter((player) =>
      normalizeForCompare(player.name).includes(faction.normalized_tag)
    ).length;

    embed.addFields({
      name: faction.tag,
      value: `👥 ${count}`,
      inline: true
    });
  }

  if (serverStatus) {
    embed.addFields({
      name: '📊 Gesamt Online',
      value: `${serverStatus.clients}/${serverStatus.maxClients || '?'}`,
      inline: false
    });
  }

  return embed;
}

function buildFactionRemoveRows(factions) {
  const rows = [];
  const maxButtonsPerRow = 5;

  for (let i = 0; i < factions.length; i += maxButtonsPerRow) {
    const row = new ActionRowBuilder();

    const chunk = factions.slice(i, i + maxButtonsPerRow);

    for (const faction of chunk) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`fc:frakremove:${faction.id}`)
          .setLabel(faction.tag.slice(0, 80))
          .setStyle(ButtonStyle.Danger)
      );
    }

    rows.push(row);
  }

  return rows;
}

module.exports = {
  buildPlayersEmbed,
  buildPaginationRow,
  buildFactionsEmbed,
  buildFactionRemoveRows
};