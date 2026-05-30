const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const { fetchFinalCity } = require('./fivem');
const {
  syncOnlinePlayers,
  cleanupOldOffline,
  getOnlinePlayers,
  getHistoryPlayers
} = require('./db');
const { buildPlayersEmbed, buildPaginationRow } = require('./embeds');

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
  // HIER ANPASSEN in .env: ALLOWED_CHANNEL_ID leer lassen, wenn der Command überall gehen soll.
  if (!config.allowedChannelId) return true;
  return interaction.channelId === config.allowedChannelId;
}

async function replyWithPlayers(interaction, { page = 0, search = '', mode = 'online', update = false } = {}) {
  const showHistory = mode === 'history';
  const players = showHistory ? getHistoryPlayers(search) : getOnlinePlayers(search);

  const { embed, page: safePage, totalPages } = buildPlayersEmbed({
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

client.once('ready', async () => {
  console.log(`Bot eingeloggt als ${client.user.tag}`);

  // Direkt beim Start einmal pollen, damit /finalcity sofort Daten hat.
  await pollFinalCity();

  // HIER ANPASSEN in .env: POLL_INTERVAL_SECONDS, Standard 30 Sekunden.
  setInterval(pollFinalCity, config.pollIntervalSeconds * 1000);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'finalcity') return;

      if (!isAllowedChannel(interaction)) {
        await interaction.reply({
          content: 'Dieser Command ist in diesem Channel nicht erlaubt.',
          ephemeral: true
        });
        return;
      }

      const search = interaction.options.getString('suche') || '';
      const history = interaction.options.getBoolean('history') || false;
      const mode = history ? 'history' : 'online';

      await replyWithPlayers(interaction, { page: 0, search, mode });
      return;
    }

    if (interaction.isButton()) {
      const [prefix, mode, pageRaw, encodedSearch = ''] = interaction.customId.split(':');
      if (prefix !== 'fc') return;

      if (!isAllowedChannel(interaction)) {
        await interaction.reply({
          content: 'Dieser Button ist in diesem Channel nicht erlaubt.',
          ephemeral: true
        });
        return;
      }

      const page = Number(pageRaw) || 0;
      const search = decodeURIComponent(encodedSearch);

      await replyWithPlayers(interaction, { page, search, mode, update: true });
    }
  } catch (error) {
    console.error('[INTERACTION] Fehler:', error);

    const message = 'Es ist ein Fehler aufgetreten. Prüfe die Bot-Logs.';

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(config.discordToken);
