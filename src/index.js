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
  removeFactionById,
  getSpectates,
  getSpectate,
  addSpectate,
  setSpectateMessageId,
  getSpectateById,
  removeSpectateById
} = require('./db');

const {
  buildPlayersEmbed,
  buildPaginationRow,
  buildFactionsEmbed,
  buildFactionRemoveRows,
  buildSpectateEmbed,
  buildSpectateList
} = require('./embeds');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

let lastServerStatus = null;
let isPolling = false;

function buildSpectatePayload(spectate) {
  return {
    embeds: [buildSpectateEmbed({
      search: spectate.search,
      players: getOnlinePlayers(spectate.search),
      serverStatus: lastServerStatus
    })],
    allowedMentions: { parse: [] }
  };
}

async function updateSpectates() {
  for (const spectate of getSpectates(config.spectateChannelId)) {
    try {
      const channel = await client.channels.fetch(spectate.channel_id);
      if (!channel || !channel.isTextBased() || !channel.messages) {
        console.warn(`[SPECTATE] Channel ${spectate.channel_id} ist nicht verfügbar.`);
        continue;
      }

      const payload = buildSpectatePayload(spectate);

      if (spectate.message_id) {
        try {
          const message = await channel.messages.fetch(spectate.message_id);
          await message.edit(payload);
          continue;
        } catch (error) {
          if (error.code !== 10008) throw error;
        }
      }

      const message = await channel.send(payload);
      setSpectateMessageId(spectate.id, message.id);
    } catch (error) {
      console.error(`[SPECTATE] Fehler bei #${spectate.id}:`, error.message);
    }
  }
}

async function pollFinalCity() {
  if (isPolling) return;

  isPolling = true;

  try {
    const server = await fetchFinalCity();

    lastServerStatus = server;

    syncOnlinePlayers(server.players);

    const deleted = cleanupOldOffline(config.deleteOfflineAfterDays);

    await updateSpectates();

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

async function handleSpectate(interaction) {
  const search = interaction.options.getString('string', true).trim();
  const existing = getSpectate(config.spectateChannelId, search);

  if (existing) {
    await interaction.reply({
      content: `Für \`${existing.search}\` läuft bereits ein Spectate in <#${config.spectateChannelId}>.`,
      ephemeral: true
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = await client.channels.fetch(config.spectateChannelId);
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply('Der konfigurierte Spectate-Channel ist nicht verfügbar.');
    return;
  }

  const temporarySpectate = { search };
  const message = await channel.send(buildSpectatePayload(temporarySpectate));

  addSpectate({
    guildId: interaction.guildId,
    channelId: config.spectateChannelId,
    messageId: message.id,
    search,
    createdBy: interaction.user.id
  });

  await interaction.editReply(
    `Spectate für \`${search}\` wurde in <#${config.spectateChannelId}> gestartet.`
  );
}

function spectateListPayload(page = 0) {
  const { embed, rows } = buildSpectateList({
    spectates: getSpectates(config.spectateChannelId),
    page
  });
  return { embeds: [embed], components: rows };
}

async function replyWithSpectateList(interaction, page = 0, update = false) {
  const payload = spectateListPayload(page);
  if (update) await interaction.update(payload);
  else await interaction.reply({ ...payload, ephemeral: true });
}

async function handleSpectateRemoveButton(interaction, idRaw, pageRaw) {
  const spectate = getSpectateById(Number(idRaw));
  if (!spectate || spectate.channel_id !== config.spectateChannelId) {
    await interaction.update(spectateListPayload(Number(pageRaw) || 0));
    return;
  }

  removeSpectateById(spectate.id);

  if (spectate.message_id) {
    const channel = await client.channels.fetch(spectate.channel_id).catch(() => null);
    if (channel?.isTextBased()) {
      const message = await channel.messages.fetch(spectate.message_id).catch(() => null);
      if (message) await message.delete().catch(() => null);
    }
  }

  await interaction.update(spectateListPayload(Number(pageRaw) || 0));
}

client.once('ready', async () => {
  console.log(`Bot eingeloggt als ${client.user.tag}`);

  await pollFinalCity();

  setInterval(pollFinalCity, config.pollIntervalSeconds * 1000);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const allowedCommands = [
        'finalcity', 'addfrak', 'fraks', 'fraksremove', 'spectate', 'spectatelist'
      ];

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


      if (interaction.commandName === 'spectate') {
        await handleSpectate(interaction);
        return;
      }


      if (interaction.commandName === 'spectatelist') {
        await replyWithSpectateList(interaction);
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


      if (mode === 'spectateremove') {
        await handleSpectateRemoveButton(interaction, pageRaw, encodedSearch);
        return;
      }

      if (mode === 'spectatelist') {
        await replyWithSpectateList(interaction, Number(pageRaw) || 0, true);
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
