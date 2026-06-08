# 67 - Telegram Mini App

Server-authoritative PvP tap game for Telegram Mini Apps. A player picks side `6` or `7`, waits through a 6.7-second matchmaking window, then plays a 6.7-second real-time tap battle.

## Current Build

`v0.3.0` is a clean rebuild:

- Client code lives in small ES modules under `src/`.
- The visual layer stays in `index.html`, `styles.css`, and `assets/`.
- React, Framer Motion, legacy runtime patches, release scripts, duplicate backends, and bundled zip artifacts were removed.
- Matchmaking uses the backend first and always falls back to a bot after the search window if no live player is available.
- The matching screen shows only the countdown.
- The Mini App resolves the production API from `window.SIX_SEVEN_API_BASE`; localhost is only a local development fallback.
- Cloudflare Worker injects config only. It does not inject runtime hotfix scripts.

## Stack

- Frontend: Vite + native ES modules
- Backend: Node ESM using built-in HTTP/WebSocket primitives
- Persistence: JSON file database for MVP state
- Hosting: Cloudflare Pages for Mini App assets, Render or another Node host for the realtime server

## Run Locally

```bash
npm install
npm run dev
```

Open the local URL printed by the server. Localhost is only for development; Telegram production should point to the Cloudflare Pages URL.

## Build

```bash
npm run build
npm run check
```

When `dist/index.html` exists, `server.js` serves the built client. Without `dist`, it serves the source files for development.

## Layout

```text
index.html        # Mini App markup and screen structure
styles.css        # Existing visual design plus runtime state classes
src/              # Clean client runtime modules
server/           # Realtime game server, DB, static handler
server.js         # Node entrypoint
_worker.js        # Cloudflare Pages config injection
assets/           # Hands, digits, share assets
```

## Realtime Protocol

Client to server:

- `hello` identifies the player profile and cosmetics.
- `queue` enters the live matchmaking queue.
- `cancel_queue` leaves matchmaking.
- `tap` sends one tap event; score is counted on the server.
- `get_top` requests leaderboard state.

Server to client:

- `hello_required` asks the client to identify itself.
- `player_state` returns profile, leaderboard, global war, and config.
- `queue_state` returns the authoritative matchmaking deadline.
- `match_start` schedules a battle.
- `match_live` opens the tap window.
- `score_update` streams score snapshots.
- `match_result` returns the final persisted result.

## Production Config

Cloudflare Pages should expose:

```text
SIX_SEVEN_API_BASE=https://your-node-realtime-service.example.com
SIX_SEVEN_BOT_USERNAME=your_bot_username
SIX_SEVEN_APP_NAME=your_mini_app_short_name
```

The backend accepts:

```text
NODE_VERSION=22
PORT=3000
SIX_SEVEN_DB=data/six-seven-db.json
```
