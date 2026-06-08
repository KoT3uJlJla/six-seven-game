# Six Seven hotfix v2

This hotfix keeps the current visual design and server-authoritative architecture, but fixes the broken battle-search UX and the most likely WebSocket origin issue.

## Changes

- Frontend now supports `window.SIX_SEVEN_WS_URL` and `localStorage['six-seven::ws-url']` for a separate backend URL.
- Localhost/Vite fallback: when the frontend is opened from `localhost:5173`, `localhost:5174`, etc., WebSocket connects to `localhost:3000/ws` instead of the Vite server.
- Matchmaking countdown starts immediately on click and is later corrected by server time when `queue_state` arrives.
- Cancel clears queued `queue` frames, sends `cancel_queue` only when possible, and immediately returns to home.
- Late `match_start` after cancel is ignored.
- Matching rings are reduced on low-power devices and use `contain`, `will-change`, and no forced JS frame loop.
- Realtime reconnect now avoids duplicate error/close handling and uses bounded backoff.

## Production note

If the frontend and backend are on different domains, add this before `app.js` in `index.html`:

```html
<script>
  window.SIX_SEVEN_WS_URL = 'wss://YOUR_BACKEND_DOMAIN/ws';
</script>
```

For localhost with `npm start`, no extra config is needed.
For localhost with Vite frontend on `5173` and backend on `3000`, no extra config is needed after this hotfix.
