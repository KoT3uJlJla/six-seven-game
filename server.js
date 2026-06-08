import http from 'node:http';
import { GAME_CONFIG } from './server/config.js';
import { GameDatabase } from './server/database.js';
import { GameServer } from './server/game-server.js';
import { handleUpgrade } from './server/realtime.js';
import { isAllowedOrigin } from './server/security.js';
import { createHttpHandler } from './server/static.js';

const db = new GameDatabase(GAME_CONFIG.dbFile, {
  fallbackFilePath: GAME_CONFIG.dbFallbackFile,
  allowFallback: GAME_CONFIG.allowFileDb,
});
const gameServer = new GameServer(db, GAME_CONFIG);
const httpServer = http.createServer(createHttpHandler(gameServer, GAME_CONFIG));

httpServer.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://six-seven.internal');
  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!isAllowedOrigin(req.headers.origin || '', GAME_CONFIG)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  handleUpgrade(req, socket, head, peer => gameServer.attach(peer, req));
});

httpServer.listen(GAME_CONFIG.port, () => {
  console.log(`Six Seven Game server listening on port ${GAME_CONFIG.port}`);
  console.log(`DB: ${db.filePath}${db.usedFallback ? ' (fallback)' : ''}`);
});

process.on('SIGINT', () => httpServer.close(() => process.exit(0)));
process.on('SIGTERM', () => httpServer.close(() => process.exit(0)));
