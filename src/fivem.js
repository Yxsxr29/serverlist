const axios = require('axios');
const config = require('./config');

async function fetchFinalCity() {
  const url = `${config.cfxSingleUrl}/${config.fivemServerId}`;

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      // Normaler Browser User-Agent. Falls Cfx irgendwann strenger wird, hier anpassen.
      'User-Agent': 'Mozilla/5.0 FinalCityDiscordBot/1.0',
      'Accept': 'application/json'
    }
  });

  const data = response.data?.Data;
  if (!data) {
    throw new Error('Cfx Antwort enthält kein Data Objekt.');
  }

  return {
    hostname: data.hostname || 'FINAL CITY',
    clients: Number(data.clients || 0),
    maxClients: Number(data.sv_maxclients || data.svMaxclients || 0),
    players: Array.isArray(data.players) ? data.players : [],
    lastSeen: data.lastSeen || null
  };
}

module.exports = { fetchFinalCity };
