const Database = require('better-sqlite3');
const config = require('./config');
const fs = require('fs');
const path = require('path');

const dbDir = path.dirname(config.databasePath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(config.databasePath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS players (
  name TEXT PRIMARY KEY,
  normalized_name TEXT NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  online_since TEXT,
  offline_since TEXT,
  currently_online INTEGER NOT NULL DEFAULT 0,
  last_player_id INTEGER,
  last_ping INTEGER
);

CREATE INDEX IF NOT EXISTS idx_players_normalized_name ON players(normalized_name);
CREATE INDEX IF NOT EXISTS idx_players_currently_online ON players(currently_online);
CREATE INDEX IF NOT EXISTS idx_players_last_seen ON players(last_seen);

CREATE TABLE IF NOT EXISTS factions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL,
  normalized_tag TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_factions_normalized_tag ON factions(normalized_tag);
`);

function nowIso() {
  return new Date().toISOString();
}

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function syncOnlinePlayers(players) {
  const now = nowIso();
  const onlineNames = new Set(players.map((p) => String(p.name || '').trim()).filter(Boolean));

  const tx = db.transaction(() => {
    const existingStmt = db.prepare('SELECT name, currently_online FROM players WHERE name = ?');

    const insertStmt = db.prepare(`
      INSERT INTO players (
        name, normalized_name, first_seen, last_seen, online_since, offline_since,
        currently_online, last_player_id, last_ping
      ) VALUES (?, ?, ?, ?, ?, NULL, 1, ?, ?)
    `);

    const updateOnlineStmt = db.prepare(`
      UPDATE players
      SET last_seen = ?, currently_online = 1, last_player_id = ?, last_ping = ?
      WHERE name = ?
    `);

    const updateReappearedStmt = db.prepare(`
      UPDATE players
      SET last_seen = ?, online_since = ?, offline_since = NULL,
          currently_online = 1, last_player_id = ?, last_ping = ?
      WHERE name = ?
    `);

    for (const p of players) {
      const name = String(p.name || '').trim();
      if (!name) continue;

      const existing = existingStmt.get(name);
      const id = Number.isFinite(Number(p.id)) ? Number(p.id) : null;
      const ping = Number.isFinite(Number(p.ping)) ? Number(p.ping) : null;

      if (!existing) {
        insertStmt.run(name, normalizeName(name), now, now, now, id, ping);
      } else if (existing.currently_online) {
        updateOnlineStmt.run(now, id, ping, name);
      } else {
        updateReappearedStmt.run(now, now, id, ping, name);
      }
    }

    const currentlyOnline = db.prepare('SELECT name FROM players WHERE currently_online = 1').all();
    const markOfflineStmt = db.prepare(`
      UPDATE players
      SET currently_online = 0, offline_since = ?
      WHERE name = ?
    `);

    for (const row of currentlyOnline) {
      if (!onlineNames.has(row.name)) {
        markOfflineStmt.run(now, row.name);
      }
    }
  });

  tx();
}

function cleanupOldOffline(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const stmt = db.prepare(`
    DELETE FROM players
    WHERE currently_online = 0
      AND last_seen < ?
  `);
  return stmt.run(cutoff).changes;
}

function getOnlinePlayers(search = '') {
  const normalizedSearch = normalizeName(search);

  if (normalizedSearch) {
    return db.prepare(`
      SELECT * FROM players
      WHERE currently_online = 1
        AND normalized_name LIKE ?
      ORDER BY name COLLATE NOCASE ASC
    `).all(`%${normalizedSearch}%`);
  }

  return db.prepare(`
    SELECT * FROM players
    WHERE currently_online = 1
    ORDER BY name COLLATE NOCASE ASC
  `).all();
}

function getHistoryPlayers(search = '') {
  const normalizedSearch = normalizeName(search);

  if (normalizedSearch) {
    return db.prepare(`
      SELECT * FROM players
      WHERE normalized_name LIKE ?
      ORDER BY currently_online DESC, last_seen DESC
    `).all(`%${normalizedSearch}%`);
  }

  return db.prepare(`
    SELECT * FROM players
    ORDER BY currently_online DESC, last_seen DESC
  `).all();
}

function addFaction(tag) {
  const cleanTag = String(tag || '').trim();

  if (!cleanTag) {
    throw new Error('Fraktions-String darf nicht leer sein.');
  }

  const normalizedTag = normalizeName(cleanTag);
  const now = nowIso();

  return db.prepare(`
    INSERT INTO factions (tag, normalized_tag, created_at)
    VALUES (?, ?, ?)
  `).run(cleanTag, normalizedTag, now);
}

function getFactions() {
  return db.prepare(`
    SELECT *
    FROM factions
    ORDER BY tag COLLATE NOCASE ASC
  `).all();
}

function getFactionById(id) {
  return db.prepare(`
    SELECT *
    FROM factions
    WHERE id = ?
  `).get(id);
}

function removeFactionById(id) {
  return db.prepare(`
    DELETE FROM factions
    WHERE id = ?
  `).run(id);
}

module.exports = {
  syncOnlinePlayers,
  cleanupOldOffline,
  getOnlinePlayers,
  getHistoryPlayers,
  normalizeName,
  addFaction,
  getFactions,
  getFactionById,
  removeFactionById
};