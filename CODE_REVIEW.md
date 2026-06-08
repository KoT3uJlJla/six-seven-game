# Code review: Six Seven Game

## Summary

The previous build was a strong visual prototype, but the gameplay loop was mostly client-authoritative. Scores, weekly totals, global war, guild contribution, referral progress and bot battles were stored or simulated in `localStorage`. That made it impossible to guarantee identical match results for two clients, and it also allowed score spoofing by editing client state.

This update keeps the existing single-page design and asset structure, but moves real-time battle authority to a Node backend with WebSocket matchmaking and a JSON persistence layer for localhost development.

## Main issues found

1. **No authoritative PvP source of truth.** Battle results were calculated on the client, so two devices could disagree about the same match.
2. **No real matchmaking clock.** The UX implied search, but there was no backend queue with a strict 6.7-second fallback window.
3. **Local-only leaderboard and economy.** Weekly scores, rewards, inventory and global war were not persisted by a server.
4. **Timer mismatch risk.** The HTML still had static timer text; the round must be driven by server `startsAt` / `endsAt`, not by the DOM or local clock alone.
5. **Heat risk on iOS.** Heavy CSS animations, large numbers of DOM floaters and haptic calls on every tap can keep the compositor and main thread busy during rapid tapping.
6. **Effects had no strict budget.** Brainrot effects were fun, but needed caps, pooling and adaptive degradation to keep 60 FPS.

## Implemented fixes

### 1. 6.7-second matchmaking window

`server.mjs` now owns the matchmaking queue. When a player joins:

- the server first tries to pair them with the oldest opposite-side ticket;
- if nobody is found, the ticket remains queued for exactly `6700ms`;
- after the deadline, the server creates a bot match.

The client receives `deadlineAt` from the backend and displays the countdown. It does not decide when to use a bot.

### 2. Authoritative PvP sync

The backend is now the only source of truth for live battle state:

- clients send only tap intents via WebSocket;
- the server validates match ID, player slot, round timing and tap rate;
- the server increments scores;
- the server broadcasts `match:score` snapshots every 67ms;
- the server finalizes once, persists the DB record and sends the same `match:result` to all human participants.

The persisted DB record is stored in `data/six-seven-db.json` and includes match participants, scores, winner, jackpots and completion timestamp.

### 3. Main-menu 6/7 tap feedback

Tapping the home screen now spawns a random `6` or `7`. The floater uses the currently selected team color and glow, so the same interaction reinforces team identity without changing the existing layout.

### 4. Cleaner structure

The update avoids runtime monkey-patching of existing functions. The app has clear blocks for state, backend API client, WebSocket client, screen rendering, battle flow, shop/top/profile/social helpers and performance-safe FX helpers.

`server.mjs` separates HTTP API, persistence, static serving, WebSocket sessions, matchmaking, battle scoring and finalization.

### 5. Lower device heat

The client now uses a performance budget:

- haptic calls are throttled;
- active floaters are capped;
- battle FX are reduced on iOS, low-core devices or `prefers-reduced-motion`;
- hidden-tab rendering is paused via `visibilitychange`;
- screen-filling effects use short-lived transform/opacity animations, not layout-heavy DOM mutations.

### 6. More battle effects without FPS collapse

Battle now has capped but dense effects:

- score floaters;
- meme kicker words;
- exact-67 jackpot overlay;
- short visual burst;
- final-rush messaging.

The effect system is bounded, so repeated taps cannot create an unbounded DOM leak.

## Weekly prize pool

The weekly leaderboard API exposes a 10,000 TG Stars prize pool:

- #1: 2,400
- #2: 1,400
- #3: 900
- #4-10: 200 each
- #11-25: 85 each
- #26-50: 40 each
- #67: 694
- other #51-100 ranks: 19 each

Total: 10,000.

## Local run

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000
```

For live PvP testing, open two browser tabs or two devices on the same host, choose opposite sides and press the fight CTA. If no live opponent joins within 6.7 seconds, the server supplies a bot.

## Files changed

- `server.mjs` — authoritative WebSocket/HTTP backend, matchmaking, scoring, DB persistence.
- `app.js` — client rewritten to consume backend truth, preserve current design, add optimized effects.
- `package.json` — adds `start`, `check`, and `ws` dependency.
- `CODE_REVIEW.md` — this review and implementation notes.

## Production follow-up

For deployment beyond localhost, replace JSON persistence with PostgreSQL/Redis, verify Telegram `initData` on every HTTP/WS request, add a proper coin ledger, and implement real Telegram Stars invoice/payout flows.
