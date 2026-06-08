# six-seven-game — authoritative PvP patch kit

Этот набор файлов накладывается поверх текущего репозитория `KoT3uJlJla/six-seven-game`.
Он не заменяет `index.html`, `styles.css` и `assets`: общий визуальный дизайн остаётся текущим.

## Что заменяется / добавляется

- `app.js` — чистый клиентский refactor без локального подсчёта результата матча.
- `server.js` — локальный HTTP + WebSocket сервер.
- `server/` — модули authoritative matchmaking, PvP, DB, static serving.
- `package.json` — `npm run dev` и `npm start` теперь запускают сервер, а Vite оставлен как `npm run client:dev`.

## Установка

```bash
git clone https://github.com/KoT3uJlJla/six-seven-game.git
cd six-seven-game
cp app.js app.legacy.js
cp package.json package.legacy.json
cp -R /path/to/this/patch/* .
npm start
```

Открой две вкладки на `http://localhost:3000`, выбери разные стороны и нажми бой. Если за 6.7 секунды сервер не найдёт человека, он создаст server-side бота.

## Ключевые гарантии

- Matchmaking window: ровно 6700 мс.
- Источник истины: backend + JSON DB `data/six-seven-db.json`.
- Сервер задаёт `startsAt`, `endsAt`, финальный score, winner, rewards, weekly score.
- Клиент не может увеличить score напрямую: он только отправляет `tap` события.
- Все участники одного match получают один и тот же `match_result` из серверной записи.
- Боевые эффекты локальные и мгновенные, но не влияют на результат.

## Production TODO

JSON DB подходит для localhost и однопроцессного MVP. Для реального запуска нужно заменить DB на PostgreSQL, вынести queue/matches в Redis или single-writer game worker, добавить Telegram `initData` validation, device/user anti-cheat profile, idempotency для платежей и админку выплат.

## Проверено в контейнере

- `node --check app.js server.js server/*.js` — OK.
- `/api/health` отвечает.
- Human-vs-human smoke test: два WebSocket клиента получили один `matchId`, одинаковый финальный score record и один winner/tie state.
- Bot fallback smoke test: одиночный клиент получил `match_start` примерно через 6.7 сек с `bot: true`, затем `match_result` после 6.7 сек раунда.
