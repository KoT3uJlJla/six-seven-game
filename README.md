# 67 — Telegram Mini App

Server-authoritative PvP tap game based on the "six seven" meme. Player chooses side `6` or `7`, waits through a 6.7-second matchmaking window, then plays a 6.7-second real-time tap round.

## Current build

**v0.2.1 — authoritative backend + optimized frontend**

- Matchmaking window is exactly **6.7 seconds**. If no live opponent is paired inside the window, backend creates a server-side bot.
- PvP score is counted on the backend. The frontend sends only tap events and renders server snapshots/results.
- Match result is finalized once on the backend and persisted to `data/six-seven-db.json`.
- Weekly Top-100 and global 6-vs-7 war counters are read from backend state.
- Home-screen taps spawn random `6`/`7` floaters tinted by selected side.
- Battle effects are capped and optimized for mobile WebViews; low-power devices get lighter FX.
- Runtime has no external backend dependency: the WebSocket server is implemented with Node built-ins.

## Run

```bash
npm start
# http://localhost:3000
```

Optional:

```bash
PORT=8080 SIX_SEVEN_DB=/var/lib/six-seven/db.json npm start
npm run check
```

## Project layout

```text
index.html      # existing screen markup
styles.css      # existing visual design
app.js          # optimized authoritative frontend client
server.mjs      # HTTP API, static hosting, WebSocket PvP, JSON DB
assets/         # hand and digit skins
```

## Realtime protocol

Client → server:

- `hello` — identifies player profile.
- `matchmaking:join` — enters queue with selected side and cosmetics.
- `matchmaking:cancel` — leaves queue.
- `tap` — sends one tap event. Score is not trusted from the client.

Server → client:

- `matchmaking:queued` — queue ticket with exact deadline.
- `match:found` — authoritative match schedule and participants.
- `match:score` — server score snapshot every 67 ms.
- `match:result` — final persisted match result and updated player state.

## Production notes

The JSON DB is sufficient for MVP/local testing. Before TG Stars prize payouts, replace it with PostgreSQL/Redis, validate Telegram `initData`, add bot-token payment flows, add anti-multiaccount checks, and move weekly payout snapshots to a locked admin job.
