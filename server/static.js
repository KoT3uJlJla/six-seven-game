import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_ROOT = path.join(ROOT, 'dist');
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

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function publicRoot() {
  return fs.existsSync(path.join(DIST_ROOT, 'index.html')) ? DIST_ROOT : ROOT;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function createHttpHandler(gameServer) {
  return (req, res) => {
    const url = new URL(req.url || '/', 'http://six-seven.internal');
    if (url.pathname === '/api/health') {
      return sendJson(res, 200, { ok: true, serverTs: Date.now() });
    }
    if (url.pathname === '/api/top') {
      return sendJson(res, 200, { ok: true, top: gameServer.db.getTopPlayers(100), globalWar: gameServer.db.getGlobalWar(), serverTs: Date.now() });
    }
    if (url.pathname.startsWith('/api/matches/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/matches/'.length));
      const match = gameServer.db.getMatch(id);
      return sendJson(res, match ? 200 : 404, match ? { ok: true, match } : { ok: false, error: 'match not found' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' });
      return res.end('Method Not Allowed');
    }

    const root = publicRoot();
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const normalized = path.normalize(requested).replace(/^([.][.][\/])+/, '');
    const filePath = path.join(root, normalized);
    if (!isInside(root, filePath)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }

    fs.stat(filePath, (statError, stat) => {
      if (statError || !stat.isFile()) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
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
  };
}
