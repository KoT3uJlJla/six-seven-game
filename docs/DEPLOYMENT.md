# Production deployment

Production stack:

- Frontend: Cloudflare Pages
- Backend: Render Web Service
- Database: MongoDB Atlas

## MongoDB Atlas

Create a cluster and a database named `six-seven-game`.
Create a database user and copy the MongoDB connection string for Render.

## Render backend

Create a new Render Web Service from this repository.

Settings:

```text
Root Directory: backend
Runtime: Node
Build Command: npm install
Start Command: npm start
```

Environment variables:

```text
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
BOT_TOKEN=your_botfather_token
JWT_SECRET=long_random_secret
FRONTEND_ORIGINS=https://your-cloudflare-pages-domain.pages.dev,https://your-custom-domain.com
INIT_DATA_MAX_AGE_MS=86400000
MAX_TPS=18
MAX_SCORE=160
```

Health check:

```text
GET /api/health
```

## Cloudflare Pages frontend

Deploy the repository root to Cloudflare Pages.

Settings:

```text
Build command: exit 0
Build output directory: .
```

Add a Cloudflare Pages environment variable:

```text
SIX_SEVEN_API_BASE=https://your-render-service.onrender.com
```

The `_worker.js` file injects `api-client.js` into the static HTML and passes this API URL to the frontend.

## Telegram BotFather

Point the Mini App URL to the Cloudflare Pages production URL.
The backend verifies Telegram `initData` server-side using `BOT_TOKEN`, then returns a JWT used by the frontend API bridge.

## Current backend API

```text
POST /api/auth/telegram
GET  /api/me
POST /api/me/side
POST /api/matches/finish
GET  /api/leaderboard/players
GET  /api/leaderboard/guilds
POST /api/guilds/create
POST /api/guilds/join
POST /api/guilds/leave
GET  /api/shop/catalog
POST /api/shop/equip
GET  /api/health
```

The current frontend still keeps local UI state for instant responsiveness. The backend is now the production authority for users, matches, leaderboards, guilds, referrals, rewards and anti-cheat flags.
