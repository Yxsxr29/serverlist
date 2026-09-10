const axios = require('axios');
const config = require('./config');

function isAnonymizedPlayer(player) {
  return player &&
    String(player.name || '') === 'Player' &&
    Number(player.id) === 0 &&
    Number(player.ping) === 0;
}

function playersUrlFromData(data) {
  if (config.fivemPlayersUrl) return config.fivemPlayersUrl;

  const endpoint = Array.isArray(data.connectEndPoints)
    ? data.connectEndPoints.find(Boolean)
    : '';

  if (!endpoint) return '';

  const baseUrl = /^https?:\/\//i.test(endpoint)
    ? endpoint
    : `http://${endpoint}`;

  return `${baseUrl.replace(/\/$/, '')}/players.json`;
}

async function fetchAuthenticatedPlayers(data) {
  if (!config.fivemPlayersToken) {
    throw new Error(
      'Cfx liefert nur anonymisierte Spielernamen. Setze FIVEM_PLAYERS_TOKEN auf den sv_playersToken des Gameservers.'
    );
  }

  const url = playersUrlFromData(data);
  if (!url) {
    throw new Error(
      'Kein direkter Players-Endpunkt gefunden. Setze FIVEM_PLAYERS_URL, z.B. http://IP:30120/players.json.'
    );
  }

  const response = await axios.get(url, {
    timeout: 15000,
    headers: {
      'Accept': 'application/json',
      'X-Players-Token': config.fivemPlayersToken
    }
  });

  if (!Array.isArray(response.data)) {
    throw new Error('Der authentifizierte players.json-Endpunkt lieferte keine Spielerliste.');
  }

  if (response.data.length && response.data.every(isAnonymizedPlayer)) {
    throw new Error('Der Gameserver hat den FIVEM_PLAYERS_TOKEN nicht akzeptiert.');
  }

  return response.data;
}

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

  const publicPlayers = Array.isArray(data.players) ? data.players : [];
  const clients = Number(data.clients || 0);
  const publicListIsAnonymized = publicPlayers.length > 0 &&
    publicPlayers.every(isAnonymizedPlayer);

  let players = publicPlayers;
  if (publicListIsAnonymized) {
    players = await fetchAuthenticatedPlayers(data);
  } else if (clients > 0 && publicPlayers.length === 0) {
    throw new Error(
      `Cfx meldet ${clients} Spieler, liefert aber keine Spielerliste. Datenbank wird nicht verändert.`
    );
  }

  return {
    hostname: data.hostname || 'FINAL CITY',
    clients,
    maxClients: Number(data.sv_maxclients || data.svMaxclients || 0),
    players,
    lastSeen: data.lastSeen || null
  };
}

module.exports = { fetchFinalCity };
