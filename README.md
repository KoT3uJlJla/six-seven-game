# 67 — Telegram Mini App

Version: **v0.1.19 — Auto Client Language**

PvP tap-game based on the **"six seven"** brainrot meme. Pick a side. Tap to win.

## v0.1.16 Fonts reverted

This build reverts the v0.1.14 VK Sans experiment back to the previous Google font stack while keeping the later UI fixes:

- 6/7 side choice stays explicit.
- 6.7-second battle and `3 → 2 → SIX SEVEN!` countdown stay.
- Battle hands keep the correct vertical meme movement.
- Telegram shame / raid loop stays.
- Shop entry stays obvious.
- Result screen now has only three actions: Shame, Raid Chat, Home.
- Removed visible Social Shame Card / copy / story / rematch UI from results.
- Global War and Daily Curse are hidden from the home UI until there is a real backend reason to show them.
- Telegram Chat War is shown only when Telegram provides a real chat context.
- Duplicate side chip on the home screen was removed; the selected side is already obvious in buttons and the big FIGHT CTA.
- Result screen now adds a win/loss taunt and current win/shame streak.
- Shop, Top and Profile have a one-tap HOME button in the header.
- Home hands now work as identity: the player's selected side always uses the equipped skin, while the opposite hand rotates through available hand assets every 6.7 seconds.
- Fight CTA hint moved under the button to reduce visual clutter.
- Shop/Top/Profile headers were realigned for a cleaner release-ready layout.
- Countdown overlay no longer shows an ugly white rectangle; it now blends into the battle stage.
- Top screen renders only Top-100. If the player is lower, their position is shown separately.
- Added a five-level Telegram referral ladder: 1 → 6 → 67 → 670 → 6700 refs with a share-first influencer hook.
- Added Guilds: create, join, leave, invite with Telegram `startapp=g_<guildId>_<side>` links.
- Added anti-hopper protection: 24h loyalty lock after joining/creating and 12h cooldown after leaving.
- Added Guild leaderboard tab inside Top with fake guilds for visual testing.
- Added Guild reward economy: Top 1/2/3, Top 10, Top 100 and lucky #67 reward tiers.
- Guild score now grows from battle performance; wins add extra guild score.


## v0.1.19 Auto Client Language

- Detects Telegram/client/device language on every launch.
- Russian client/device language -> Russian UI.
- Any other language -> English UI.
- Saved language no longer overrides the detected client language.
- Desktop guard text uses the same language detection.

## What's inside

```
six-seven-app/
├── index.html        # Entry point — all screens markup
├── styles.css        # Design tokens + animations
├── app.js            # Game logic, navigation, state, bot opponent
├── assets/
│   ├── hand.png      # default skin (blue sleeve)
│   ├── clown.png     # Joker skin (rare)
│   ├── devil.png     # Demon skin (epic)
│   └── robo.png      # Cyborg skin (legendary)
└── README.md
```

## Tech stack & why

- **Vanilla JS + HTML + CSS** — fast cold start on 4G (critical for TMA), zero build step, ~25 KB of code.
- **Telegram WebApp SDK** — `tg.HapticFeedback` makes the tap feel real, `tg.BackButton` for native navigation, `tg.expand()` for full-screen.
- **LocalStorage** — instant persistence for the prototype. Move to your backend when you add real PvP.
- **Google Fonts (Archivo Black + Bungee + Space Grotesk)** — bold display, loud digits, clean body.
- **CSS-only animations** — hands bob, sparks float, digits pop, timer ring drains. No JS animation libs needed.

## Run locally

```bash
cd six-seven-app
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy as a Telegram Mini App

1. **Host the static files** on any HTTPS hosting:
   - **Vercel:** drag the folder into vercel.com → deploy.
   - **Cloudflare Pages:** connect a GitHub repo, point at this folder.
   - **GitHub Pages:** push to a public repo, enable Pages on main branch.
2. **Create a bot** in Telegram via [@BotFather](https://t.me/BotFather):
   - `/newbot` → get a token.
   - `/newapp` → attach a Mini App, paste your HTTPS URL.
3. **Add a Menu Button:**
   - `/mybots` → select bot → `Bot Settings` → `Menu Button` → set URL to your hosted Mini App.
4. Send `/start` to the bot, tap the menu button — you're in.

## How the game works

### Screens

- **Home** — idiot-proof flow: pick 6/7, smash the giant FIGHT button, optional Telegram context cards. The selected-side hand keeps the equipped skin; the opposite hand rotates every 6.7 seconds.
- **Matchmaking** — animated ring, status lines ("Calling all SIXES…"), 3-stage flow ending in match.
- **Battle** — `3 → 2 → SIX SEVEN!` countdown, **6.7-second** tap window. Each tap:
  - +1 to your score
  - flips alternating hand up/down
  - spawns a floating "SIX!" / "SEVEN!"
  - updates VS-bar between players
  - fires haptic light pulse
- **Result** — verdict (VICTORY / DEFEAT / DRAW), winning side, reward stars.
- **Shop** — two tabs: HANDS (skins) and DIGITS (color styles). Rarity color-coded.
- **Top** — weekly leaderboard with prize-pool (TG Stars + gifts placeholder for now).
- **Profile** — stats, side preference, rank progression (RECRUIT → STREET FIGHTER → CONTENDER → CHAMPION → LEGEND).

### Tap-game logic

- Player taps anywhere on the stage or the yellow CTA → `myScore++`.
- Bot opponent simulates 4–9 TPS with random burst delays (`scheduleBotTap` in `app.js`).
- The bot's behavior is currently fake — replace with WebSocket-driven real opponent before launch.

### Customization

- Equipped hand skin is read at battle start (`setHandSkin`). Add new entries to `HAND_CATALOG` in `app.js`, drop the PNG in `assets/`.
- Digit styles work the same way via `DIGIT_CATALOG`. To actually apply the gradient to the in-battle digit, wire `state.digitStyle` into the render function.


## Referral ladder

The app now includes a five-level Telegram referral system for growth tests:

1. **Scout** — 1 ref
2. **Gang Starter** — 6 refs
3. **Raid Captain** — 67 refs
4. **Mob Leader** — 670 refs
5. **Alpha Mob Boss** — 6700 refs

The prototype generates `startapp=r_<code>_<side>` links and uses first-touch attribution on the invited device. For production, move referral counting and rewards to a backend so influencers cannot spoof counts locally.

## Guild system

The prototype now includes a client-side Guild layer for Telegram growth tests:

- Players can create a Guild, join fake Guilds from the Guild leaderboard, leave a Guild, and share an invite link.
- Invite links use `startapp=g_<guildId>_<side>` and preserve side attribution.
- Anti-hopper rules are represented in UI: joining/creating starts a 24h loyalty lock; leaving starts a 12h cooldown.
- Weekly reward design is visible in the Top → Guilds tab:
  - #1: 6700 reward pool + Founder chest / aura crown
  - #2: 3000 reward pool
  - #3: 1500 reward pool
  - #67: 670 meme jackpot
  - Top 10 / Top 100 get smaller aura rewards

For launch, move Guild membership, contribution, cooldowns and reward payout to backend. LocalStorage is only for prototyping the UI/flow.

## v0.1.2 Telegram social setup

This build adds Telegram-first viral mechanics:

- **SHAME A 6/7** — opens Telegram share with a challenge link.
- **RAID A CHAT** — uses `Telegram.WebApp.switchInlineQuery` when available, with share fallback.
- **COPY FLEX LINK** — copies a `startapp` challenge link.
- **STORY** — calls `Telegram.WebApp.shareToStory` if you provide an HTTPS story asset.
- **Incoming duel links** — parses compact params like `d_6_67_abcd12`, auto-picks the defending side, and shows an incoming challenge card.
- **Local chat war** — uses `chat_instance` when available and keeps a local 6-vs-7 score for that chat context. Move this to the backend before launch.

Production config before loading `app.js`:

```html
<script>
  window.SIX_SEVEN_BOT_USERNAME = 'your_bot_username';
  window.SIX_SEVEN_APP_NAME = 'your_app_short_name'; // optional, for /bot/app?startapp=... links
  window.SIX_SEVEN_STORY_URL = 'https://cdn.example.com/six-seven-story-card.png'; // optional
</script>
```

Without `SIX_SEVEN_BOT_USERNAME`, challenge links fall back to the current URL with `tgWebAppStartParam`, which is useful for local testing but not for production Telegram deep links.

## Backend you'll need before launch

The current prototype runs entirely client-side. For a real product you'll need:

1. **WebSocket matchmaking** — Node.js + `ws` or `socket.io`. Queue players by chosen side, pair opposing sides.
2. **Authoritative score** — clients send tap events, server counts and validates (anti-cheat: cap TPS at ~12, reject impossible bursts).
3. **PostgreSQL** — users, inventory, weekly_scores, transactions (coins ledger).
4. **Redis** — global war counters (atomic INCR), online matchmaking queue, weekly leaderboard sorted set (`ZADD`, `ZREVRANGE`).
5. **Cron** — weekly reset Sunday 23:59 UTC: snapshot top 100, payout TG Stars/gifts via Bot API, zero out `weekly_score`.
6. **TG Stars integration** — use `sendInvoice` with `XTR` currency for coin packs; payout winners via in-bot Stars transfer.
7. **CDN for assets** — serve PNGs from Cloudflare/Bunny to keep tap latency low.

### Suggested REST/WS endpoints

```
POST /api/auth/telegram        # verify initData, return JWT
GET  /api/me                   # profile, inventory, coins
GET  /api/shop                 # current catalog with prices
POST /api/shop/buy             # purchase item, server-validates
GET  /api/leaderboard/weekly   # top 100 + my position
WS   /ws/match                 # matchmaking + live battle
GET  /api/global-war           # real global side counters
```

### Anti-cheat must-haves

- Server-counted scores; client UI is just visual.
- TPS cap per request batch.
- One active battle per user at a time.
- Validate `initData` hash on every WS connect.

## Monetization hooks (already wired or easy to add)

- **Coin packs** — buy ⭐ via TG Stars (`sendInvoice`).
- **Premium skins** — `LEGENDARY` rarity items priced in coins or TG Stars directly.
- **Battle pass** — weekly XP track. Easy to add: a third shop tab with reward tiers.
- **Clan wars** (referenced in original spec) — group players, accumulate clan score, payout to clan leader.

## Notes on UX choices

- **Haptic on every tap** — the single biggest reason this game will feel addictive on phones.
- **Tap zone is huge (full stage + yellow CTA)** — fast-tap games need forgiving hit targets.
- **3-2-1 countdown** — prevents accidental early taps and primes the player.
- **Floating "SIX!" / "SEVEN!" particles** — instant feedback, dopamine on every tap.
- **VS-bar slides live** — competitive tension visible at all times.
- **Hand alternation** — matches the original meme gesture exactly: one up, one down, repeat.

## Known limitations of the prototype

- Bot opponent is fake (random TPS). Real PvP needs the backend above.
- Global war numbers are simulated — they drift but don't reflect real choices.
- Leaderboard is generated client-side from `RIVAL_NAMES`.
- No real payment integration yet — TG Stars buttons are placeholders.
- Digit style is owned/equipped in state but not yet applied visually in battle (good 30-min extension).

## License

Assets in `assets/` are provided by the project owner. Code is yours to build on.


## v0.1.3 UI changes

- Bottom nav simplified to **HOME / FIGHT / SHOP**.
- Shop has an obvious top-right button plus a dedicated tabbar entry.
- Home now has one huge primary CTA: **FIGHT FOR 6/7**.
- Global war card is hidden on Home to reduce overload; Telegram chat/social cards stay compact.
- Hero hand skins randomly shuffle every 4–7 seconds independently on each side. This is cosmetic only and does not change the equipped battle skin.


## v0.1.11
- Result screen Home button is locked for 3 seconds with a visible countdown to prevent misclicks.
