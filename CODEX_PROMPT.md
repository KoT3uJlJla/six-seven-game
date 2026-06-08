You are working in https://github.com/KoT3uJlJla/six-seven-game.

Goal: fix the broken realtime PvP hotfix without changing the visual design.

Current symptoms:
1. The UI constantly shows that server connection is lost.
2. Battles are not found, even against bot.
3. The matchmaking timer does not move and stays static.
4. The matchmaking Cancel button does not reliably work.
5. FPS is low on the matchmaking screen, especially around the animated rings.

Required fixes:

- Keep backend/DB as the source of truth for match results.
- Keep the 6.7s matchmaking window. If no real opponent is found after 6.7s, backend must create a bot opponent.
- Do not revert to client-authoritative scoring.
- Do not change the overall current design or layout.

Implementation requirements:

1. Fix frontend WebSocket origin handling.
   - In app.js, RealtimeClient must support `window.SIX_SEVEN_WS_URL` and `localStorage['six-seven::ws-url']`.
   - If opened from localhost/127.0.0.1 on any port other than 3000, it should connect to `ws://localhost:3000/ws` automatically. This fixes Vite frontend on 5173 + backend on 3000.
   - Otherwise use same-origin `/ws`.

2. Fix RealtimeClient lifecycle.
   - Do not call the close handler twice from both `error` and `close`.
   - Add bounded reconnect backoff.
   - Keep an outbox for safe messages, but do not keep stale `queue` / `cancel_queue` messages after user cancels matchmaking.
   - Add `dropQueued(types)`.
   - Make `send(payload, { queueIfClosed })` support non-queued cancel.

3. Fix matchmaking UI.
   - Start a local 6.7s countdown immediately when `startMatchmaking()` is called, before `queue_state` arrives.
   - When server `queue_state` arrives, switch the countdown to server `searchEndsAt` / `serverTs`.
   - Use `setTimeout(..., 100)` or equivalent for countdown text, not requestAnimationFrame.
   - Cancel must immediately return to home and clear local timers.
   - If a late `match_start` arrives after cancel, ignore it.

4. Fix performance on matching screen.
   - Add CSS/runtime CSS overrides so `.matching__ring` uses `contain: layout paint`, ring elements use `will-change: transform, opacity`, and low-power / reduced-motion devices do not run all three pulsing rings.
   - Do not add heavy DOM effects to matchmaking.

5. Verify:
   - `node --check app.js server.js server/*.js`
   - Start `node server.js`.
   - Connect one WebSocket client, send hello, queue, verify `queue_state` immediately and `match_start` with `bot: true` after about 6700ms.
   - Connect a second client, queue then cancel, verify `queue_cancelled` and no later `match_start` for the cancelled queue.

Commit message:
`Fix realtime matchmaking connection and low-power search UI`
