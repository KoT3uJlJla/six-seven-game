import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { corsHeaders } from './security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = path.join(ROOT, 'dist');
const MAX_JSON_BYTES = 32 * 1024;
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.ico', 'image/x-icon'],
]);

function write(res, status, headers, body = '') {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(req, res, config, status, payload) {
  const cors = corsHeaders(req, config);
  write(res, status, {
    ...cors.headers,
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  }, JSON.stringify(payload));
}

function methodAllowed(req, res, config, methods) {
  if (methods.includes(req.method)) return true;
  sendJson(req, res, config, 405, { ok: false, error: 'method_not_allowed' });
  return false;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_JSON_BYTES) {
        reject(Object.assign(new Error('payload_too_large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('bad_json'), { statusCode: 400 }));
      }
    });
  });
}

async function handleApi(req, res, gameServer, config, url) {
  const cors = corsHeaders(req, config);
  if (!cors.allowed) return sendJson(req, res, config, 403, { ok: false, error: 'origin_not_allowed' });
  if (req.method === 'OPTIONS') return write(res, 204, cors.headers);

  try {
    if (url.pathname === '/api/health') {
      if (!methodAllowed(req, res, config, ['GET'])) return;
      return sendJson(req, res, config, 200, { ok: true, serverTs: Date.now() });
    }

    if (url.pathname === '/api/top') {
      if (!methodAllowed(req, res, config, ['GET'])) return;
      return sendJson(req, res, config, 200, {
        ok: true,
        top: gameServer.db.getTopPlayers(100),
        globalWar: gameServer.db.getGlobalWar(),
        serverTs: Date.now(),
      });
    }

    if (url.pathname.startsWith('/api/matches/')) {
      if (!methodAllowed(req, res, config, ['GET'])) return;
      const id = decodeURIComponent(url.pathname.slice('/api/matches/'.length));
      const match = gameServer.db.getMatch(id);
      return sendJson(req, res, config, match ? 200 : 404, match ? { ok: true, match } : { ok: false, error: 'match_not_found' });
    }

    if (url.pathname === '/api/me') {
      if (!methodAllowed(req, res, config, ['GET'])) return;
      return sendJson(req, res, config, 200, { ok: true, player: gameServer.getMe(req), serverTs: Date.now() });
    }

    if (url.pathname === '/api/shop/buy') {
      if (!methodAllowed(req, res, config, ['POST'])) return;
      const body = await readJson(req);
      return sendJson(req, res, config, 200, { ok: true, player: gameServer.buyShopItem(req, body), serverTs: Date.now() });
    }

    if (url.pathname === '/api/shop/equip') {
      if (!methodAllowed(req, res, config, ['POST'])) return;
      const body = await readJson(req);
      return sendJson(req, res, config, 200, { ok: true, player: gameServer.equipShopItem(req, body), serverTs: Date.now() });
    }

    if (url.pathname === '/api/referral/claim') {
      if (!methodAllowed(req, res, config, ['POST'])) return;
      const body = await readJson(req);
      return sendJson(req, res, config, 200, { ok: true, ...gameServer.claimReferral(req, body), serverTs: Date.now() });
    }

    return sendJson(req, res, config, 404, { ok: false, error: 'not_found' });
  } catch (error) {
    const status = Number(error.statusCode || 500);
    const code = error.code || (status === 401 ? 'unauthorized' : 'server_error');
    return sendJson(req, res, config, status, { ok: false, error: code });
  }
}

function serveStatic(req, res, config, url) {
  if (!config.serveStatic) {
    write(res, 404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'Not Found');
    return;
  }

  const indexPath = path.join(DIST_ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) {
    write(res, 404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'Not Found');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    write(res, 405, { allow: 'GET, HEAD' }, 'Method Not Allowed');
    return;
  }

  let requested = '/index.html';
  try {
    requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  } catch {
    write(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'Bad Request');
    return;
  }

  const normalized = path.normalize(requested).replace(/^([.][.][\\/])+/, '');
  const filePath = path.join(DIST_ROOT, normalized);
  if (!isInside(DIST_ROOT, filePath)) {
    write(res, 403, { 'content-type': 'text/plain; charset=utf-8' }, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      write(res, 404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }, 'Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'content-type': MIME.get(ext) || 'application/octet-stream',
      'cache-control': filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=86400' : 'no-store',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

export function createHttpHandler(gameServer, config = gameServer.config) {
  return (req, res) => {
    let url;
    try {
      url = new URL(req.url || '/', 'http://six-seven.internal');
    } catch {
      return write(res, 400, { 'content-type': 'text/plain; charset=utf-8' }, 'Bad Request');
    }

    if (url.pathname.startsWith('/api/')) {
      void handleApi(req, res, gameServer, config, url);
      return;
    }

    serveStatic(req, res, config, url);
  };
}
