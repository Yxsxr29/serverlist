# Final City Discord Bot v1

Discord Slash-Command Bot für Final City FiveM Spielerlisten.

## Features

- `/finalcity` zeigt aktuelle Online-Spieler
- `/finalcity suche:madrazo` filtert Namen case-insensitive per `includes()`
- Pagination mit Buttons bei vielen Spielern
- SQLite History mit `first_seen`, `last_seen`, `online_since`, `offline_since`
- Automatisches Löschen von Offline-Namen nach X Tagen
- Docker-ready für VPS

## Setup lokal

```bash
cp .env.example .env
```

Dann `.env` bearbeiten:

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=...
```

Dependencies installieren:

```bash
npm install
```

Slash Commands registrieren:

```bash
npm run register
```

Bot starten:

```bash
npm start
```

## Setup mit Docker

```bash
cp .env.example .env
```

`.env` bearbeiten, dann:

```bash
docker compose build
```

Slash Command einmalig registrieren:

```bash
docker compose run --rm finalcity-bot npm run register
```

Bot starten:

```bash
docker compose up -d
```

Logs ansehen:

```bash
docker compose logs -f
```

## Discord Bot Rechte

Im Discord Developer Portal brauchst du:

- Bot Token
- Application ID / Client ID
- Guild ID deines Servers

Beim Invite mindestens:

- `bot`
- `applications.commands`

Bot Permissions:

- Send Messages
- Embed Links
- Use Slash Commands
- Read Message History

## Hinweise

Der Bot speichert keine eindeutigen Personen-Identifier, weil der Cfx Endpoint keine Identifier liefert. Namen können sich ändern. Deshalb behandelt die DB jeden Namensstring als eigenen Eintrag.
