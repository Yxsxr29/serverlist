const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { fetchFinalCity } = require('./fivem');

const {
  syncOnlinePlayers,
  cleanupOldOffline,
  getOnlinePlayers,
  getHistoryPlayers,
  addFaction,
  getFactions,
  getFactionById,
  removeFactionById
} = require('./db');

const {
  buildPlayersEmbed,
  buildPaginationRow,
  buildFactionsEmbed,
  buildFactionRemoveRows
} = require('./embeds');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastServerStatus = null;
let isPolling = false;

async function pollFinalCity() {
  if (isPolling) return;

  isPolling = true;

  try {
    const server = await fetchFinalCity();

    lastServerStatus = server;

    syncOnlinePlayers(server.players);

    const deleted = cleanupOldOffline(config.deleteOfflineAfterDays);

    console.log(
      `[POLL] ${new Date().toISOString()} | online=${server.players.length} | clients=${server.clients}/${server.maxClients} | cleanup=${deleted}`
    );
  } catch (error) {
    console.error('[POLL] Fehler:', error.message);
  } finally {
    isPolling = false;
  }
}

function isAllowedChannel(interaction) {
  if (!config.allowedChannelId) return true;
  return interaction.channelId === config.allowedChannelId;
}

async function replyWithPlayers(
  interaction,
  {
    page = 0,
    search = '',
    mode = 'online',
    update = false
  } = {}
) {
  const showHistory = mode === 'history';

  const players = showHistory
    ? getHistoryPlayers(search)
    : getOnlinePlayers(search);

  const {
    embed,
    page: safePage,
    totalPages
  } = buildPlayersEmbed({
    players,
    page,
    search,
    showHistory,
    serverStatus: lastServerStatus
  });

  const row = buildPaginationRow({
    page: safePage,
    totalPages,
    search,
    mode
  });

  const payload = {
    embeds: [embed],
    components: [row]
  };

  if (update) {
    await interaction.update(payload);
  } else {
    await interaction.reply(payload);
  }
}

async function replyWithFactions(interaction) {
  const factions = getFactions();
  const onlinePlayers = getOnlinePlayers();

  const embed = buildFactionsEmbed({
    factions,
    onlinePlayers,
    serverStatus: lastServerStatus
  });

  await interaction.reply({
    embeds: [embed]
  });
}

async function replyWithFactionRemove(interaction) {
  const factions = getFactions();

  if (!factions.length) {
    await interaction.reply({
      content: 'Es sind keine Fraktionen gespeichert.',
      ephemeral: true
    });
    return;
  }

  const rows = buildFactionRemoveRows(factions);

  await interaction.reply({
    content: 'Wähle eine Fraktion aus, die entfernt werden soll:',
    components: rows,
    ephemeral: true
  });
}

async function handleAddFaction(interaction) {
  const tag = interaction.options.getString('string', true).trim();

  if (!tag) {
    await interaction.reply({
      content: 'Bitte gib einen gültigen Fraktions-String an.',
      ephemeral: true
    });
    return;
  }

  try {
    addFaction(tag);

    await interaction.reply({
      content: `Fraktion \`${tag}\` wurde hinzugefügt.`,
      ephemeral: true
    });
  } catch (error) {
    const isDuplicate =
      String(error.message || '').includes('UNIQUE') ||
      String(error.code || '').includes('SQLITE_CONSTRAINT_UNIQUE');

    await interaction.reply({
      content: isDuplicate
        ? `Die Fraktion \`${tag}\` existiert bereits. Groß-/Kleinschreibung wird ignoriert.`
        : `Fehler beim Hinzufügen: ${error.message}`,
      ephemeral: true
    });
  }
}

async function handleFactionRemoveButton(interaction, factionIdRaw) {
  const factionId = Number(factionIdRaw);

  if (!Number.isFinite(factionId)) {
    await interaction.update({
      content: 'Ungültige Fraktion.',
      components: []
    });
    return;
  }

  const faction = getFactionById(factionId);

  if (!faction) {
    await interaction.update({
      content: 'Diese Fraktion existiert nicht mehr.',
      components: []
    });
    return;
  }

  removeFactionById(factionId);

  await interaction.update({
    content: `Fraktion \`${faction.tag}\` wurde entfernt.`,
    components: []
  });
}

client.once('ready', async () => {
  console.log(`Bot eingeloggt als ${client.user.tag}`);

  await pollFinalCity();

  setInterval(pollFinalCity, config.pollIntervalSeconds * 1000);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const allowedCommands = ['finalcity', 'addfrak', 'fraks', 'fraksremove'];

      if (!allowedCommands.includes(interaction.commandName)) {
        return;
      }

      if (!isAllowedChannel(interaction)) {
        await interaction.reply({
          content: 'Dieser Command ist in diesem Channel nicht erlaubt.',
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === 'addfrak') {
        await handleAddFaction(interaction);
        return;
      }

      if (interaction.commandName === 'fraks') {
        await replyWithFactions(interaction);
        return;
      }

      if (interaction.commandName === 'fraksremove') {
        await replyWithFactionRemove(interaction);
        return;
      }

      if (interaction.commandName === 'finalcity') {
        const search = interaction.options.getString('suche') || '';
        const history = interaction.options.getBoolean('history') || false;
        const mode = history ? 'history' : 'online';

        await replyWithPlayers(interaction, {
          page: 0,
          search,
          mode
        });

        return;
      }
    }

    if (interaction.isButton()) {
      const [prefix, mode, pageRaw, encodedSearch = ''] = interaction.customId.split(':');

      if (prefix !== 'fc') {
        return;
      }

      if (!isAllowedChannel(interaction)) {
        await interaction.reply({
          content: 'Dieser Button ist in diesem Channel nicht erlaubt.',
          ephemeral: true
        });
        return;
      }

      if (mode === 'frakremove') {
        await handleFactionRemoveButton(interaction, pageRaw);
        return;
      }

      const page = Number(pageRaw) || 0;
      const search = decodeURIComponent(encodedSearch);

      await replyWithPlayers(interaction, {
        page,
        search,
        mode,
        update: true
      });
    }
  } catch (error) {
    console.error('[INTERACTION] Fehler:', error);

    const message = 'Es ist ein Fehler aufgetreten. Prüfe die Bot-Logs.';

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: message,
        ephemeral: true
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: message,
        ephemeral: true
      }).catch(() => {});
    }
  }
});

client.login(config.discordToken);