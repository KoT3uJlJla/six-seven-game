# Code review — six-seven-game

## Critical findings

1. Current public repo is a static/local prototype. README describes Vanilla JS + localStorage and explicitly says backend, WebSocket matchmaking, authoritative scoring, PostgreSQL and Redis are future work.
2. Matchmaking is a client animation that resolves into `beginBattle()` after several 900 ms status steps, not after a fixed 6.7 second server search window.
3. Battle scoring and bot scoring are fully client-side. `onTap()` increments `BATTLE.myScore`, bot timeouts increment `BATTLE.enemyScore`, and `endBattle()` writes stats/rewards locally.
4. The hot battle path creates many DOM nodes and forces reflow to restart animations. This is the likely iPhone heat source: class toggle + `offsetWidth`, multiple short intervals, confetti/sticker node churn, and global `touchend` with `passive:false`.
5. Leaderboard/global war are simulated client-side, which prevents fair weekly Top-100 rewards.

## Implemented direction in this patch

- Server-authoritative WebSocket protocol.
- 6.7 s queue tickets with bot fallback only on server deadline.
- DB-backed final match records.
- Server score broadcasts every 67 ms.
- Local-only FX for instant feel; score and result come from server.
- Low-power mode for iPhone/low-core devices.
- Capped DOM FX pools and Web Animations API instead of forced layout flushes.
- Home-screen random 6/7 digit floaters tinted by selected side.

## Protocol

Client -> server:

- `hello`: `{ playerId, name, side, hand, digit }`
- `queue`: `{ side, name, hand, digit }`
- `cancel_queue`: `{}`
- `tap`: `{ matchId, seq, clientTs }`
- `get_top`: `{}`

Server -> client:

- `hello_required`
- `player_state`
- `queue_state`
- `queue_cancelled`
- `match_start`
- `match_live`
- `score_update`
- `jackpot`
- `match_result`
- `top_state`
- `tap_rejected`

## Anti-cheat baseline

- Monotonic per-match tap sequence.
- Server-side round time window validation.
- Per-player `maxTapRatePerSecond` cap.
- Result finalization is idempotent by match id.

## Performance baseline

- No local bot simulation on client.
- No local 50 ms result loop that finalizes matches.
- `requestAnimationFrame` drives visible timer only.
- FX pool cap: 38 nodes normal, 18 low-power.
- Passive pointer listeners where preventDefault is not required.
- `touch-action: manipulation` replaces global double-tap prevention.
