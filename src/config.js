require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.includes('PASTE_YOUR')) {
    throw new Error(`Fehlende .env Einstellung: ${name}`);
  }
  return value;
}

function optional(name, fallback = '') {
  return process.env[name] || fallback;
}

function numberValue(name, fallback) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  // HIER ANPASSEN in .env: Discord Bot Token
  discordToken: required('DISCORD_TOKEN'),

  // HIER ANPASSEN in .env: Application/Client ID
  discordClientId: required('DISCORD_CLIENT_ID'),

  // HIER ANPASSEN in .env: Guild/Server ID
  discordGuildId: required('DISCORD_GUILD_ID'),

  // OPTIONAL in .env: Nur diesen Channel erlauben. Leer = alle Channels.
  allowedChannelId: optional('ALLOWED_CHANNEL_ID', ''),

  // Final City ist aktuell z5ejb5. Kannst du in .env ändern.
  fivemServerId: optional('FIVEM_SERVER_ID', 'z5ejb5'),

  // Cfx API Base URL. Normalerweise nicht ändern.
  cfxSingleUrl: optional('CFX_SINGLE_URL', 'https://frontend.cfx-services.net/api/servers/single'),

  pollIntervalSeconds: numberValue('POLL_INTERVAL_SECONDS', 30),
  deleteOfflineAfterDays: numberValue('DELETE_OFFLINE_AFTER_DAYS', 10),
  playersPerPage: numberValue('PLAYERS_PER_PAGE', 25),

  // HIER ANPASSEN in .env falls du einen anderen DB-Pfad willst.
  databasePath: optional('DATABASE_PATH', './data/finalcity.sqlite')
};
