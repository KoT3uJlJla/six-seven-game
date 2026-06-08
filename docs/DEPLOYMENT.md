# Deployment

## Cloudflare Pages

Use the repository root.

```text
Build command: npm install && npm run build
Build output directory: dist
```

Set environment variables:

```text
SIX_SEVEN_API_BASE=https://your-node-service.onrender.com
SIX_SEVEN_BOT_USERNAME=your_bot_username
SIX_SEVEN_APP_NAME=your_mini_app_short_name
```

`_worker.js` injects these values into the HTML before the app bundle starts.

## Node Realtime Server

Deploy the repository root to Render, Railway, Fly, or any Node host that satisfies `^20.19.0 || >=22.12.0`.

```text
Build command: npm install
Start command: npm start
```

Environment:

```text
PORT=10000
NODE_VERSION=22
SIX_SEVEN_DB=/var/lib/six-seven/six-seven-db.json
```

Health check:

```text
GET /api/health
```

Realtime endpoint:

```text
GET /ws
```

## Telegram BotFather

Set the Mini App URL to the Cloudflare Pages production URL, not the Node backend URL. The client receives the backend URL from the Worker-injected `SIX_SEVEN_API_BASE`.

## Data Notes

The current JSON database is suitable for MVP state and quick iteration. Before paid Telegram Stars payouts, move persistence to a durable database, validate Telegram `initData` server-side, and snapshot weekly leaderboard rewards in an admin job.
