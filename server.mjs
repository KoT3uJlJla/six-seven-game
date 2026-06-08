import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CFG = Object.freeze({
  port: Number(process.env.PORT || 3000),
  roundMs: 6700,
  matchmakingMs: 6700,
  startDelayMs: 950,
  tickMs: 67,
  tapCapPerSec: 35,
  dbFile: process.env.SIX_SEVEN_DB || path.join(ROOT, 'data', 'six-seven-db.json'),
});

const HANDS = ['hand', 'clown', 'cube', 'spanch', 'devil', 'roblox', 'robo'];
const DIGITS = ['classic', 'clown', 'devil', 'robo'];
const SHOP = {
  hands: { hand: 0, clown: 500, cube: 700, spanch: 1200, devil: 1500, roblox: 2400, robo: 3000 },
  digits: { classic: 0, clown: 650, devil: 1100, robo: 1700 },
};
const PRIZES = { 1: 2400, 2: 1400, 3: 900, 67: 694 };
for (let i = 4; i <= 10; i++) PRIZES[i] = 200;
for (let i = 11; i <= 25; i++) PRIZES[i] = 85;
for (let i = 26; i <= 50; i++) PRIZES[i] = 40;
for (let i = 51; i <= 100; i++) if (i !== 67) PRIZES[i] = 19;

const RIVALS = ['ZenBoy', 'Ksu_Lab', 'NoChill', 'CR1S', 'mishakek', 'Bruh666', 'Lola.exe', 'taptap', 'Vibez', 'pluh', 'GYAT', 'Spectre', 'Cooked67', 'AuraDebt', 'BloxKid'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };

const now = () => Date.now();
const uid = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const pick = list => list[Math.floor(Math.random() * list.length)] || list[0];
const side = value => Number(value) === 7 ? 7 : 6;
const opp = value => side(value) === 7 ? 6 : 7;
const cleanId = value => String(value || '').replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 72) || uid('guest');
const cleanName = value => String(value || 'Alpha67').replace(/[<>]/g, '').trim().slice(0, 24) || 'Alpha67';
const cleanHand = value => HANDS.includes(String(value)) ? String(value) : 'hand';
const cleanDigit = value => DIGITS.includes(String(value)) ? String(value) : 'classic';

class Store {
  constructor(file) {
    this.file = file;
    this.data = { version: 2, players: {}, matches: {}, globalWar: { six: 0, seven: 0 }, updatedAt: now() };
    this.load();
  }
  load() {
    try {
      if (fs.existsSync(this.file)) this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      try { fs.renameSync(this.file, `${this.file}.broken-${now()}`); } catch {}
    }
    this.data.players ||= {};
    this.data.matches ||= {};
    this.data.globalWar ||= { six: 0, seven: 0 };
    this.save();
  }
  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.data.updatedAt = now();
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
  player(profile = {}) {
    const id = cleanId(profile.playerId);
    const base = { wins: 0, losses: 0, ties: 0, best: 0, totalTaps: 0, currentStreak: 0, streakType: 'none' };
    if (!this.data.players[id]) {
      this.data.players[id] = { id, name: cleanName(profile.name), side: side(profile.side), hand: cleanHand(profile.hand), digitStyle: cleanDigit(profile.digitStyle), coins: 250, inventory: { hands: ['hand'], digits: ['classic'] }, stats: { ...base }, weeklyScore: 0, createdAt: now(), updatedAt: now() };
    }
    const player = this.data.players[id];
    player.name = cleanName(profile.name || player.name);
    player.side = side(profile.side || player.side);
    player.hand = cleanHand(profile.hand || player.hand);
    player.digitStyle = cleanDigit(profile.digitStyle || player.digitStyle);
    player.inventory = { hands: Array.from(new Set(['hand', ...(player.inventory?.hands || [])])), digits: Array.from(new Set(['classic', ...(player.inventory?.digits || [])])) };
    player.stats = { ...base, ...(player.stats || {}) };
    player.coins = Number(player.coins || 0);
    player.weeklyScore = Number(player.weeklyScore || 0);
    player.updatedAt = now();
    this.save();
    return player;
  }
  buy(playerId, kind, itemId) {
    const bucket = kind === 'digits' ? 'digits' : 'hands';
    if (!(itemId in SHOP[bucket])) throw new Error('Unknown item');
    const player = this.player({ playerId });
    if (player.inventory[bucket].includes(itemId)) return player;
    const price = SHOP[bucket][itemId];
    if (player.coins < price) throw new Error('Not enough coins');
    player.coins -= price;
    player.inventory[bucket].push(itemId);
    this.save();
    return player;
  }
  equip(playerId, kind, itemId) {
    const bucket = kind === 'digits' ? 'digits' : 'hands';
    const player = this.player({ playerId });
    if (!player.inventory[bucket].includes(itemId)) throw new Error('Item not owned');
    if (bucket === 'hands') player.hand = cleanHand(itemId);
    else player.digitStyle = cleanDigit(itemId);
    this.save();
    return player;
  }
  finalize(match) {
    if (this.data.matches[match.id]?.status === 'complete') return this.data.matches[match.id];
    const scores = { ...match.scores };
    const slots = match.participants.map(part => part.slot);
    const winner = scores[slots[0]] === scores[slots[1]] ? null : (scores[slots[0]] > scores[slots[1]] ? slots[0] : slots[1]);
    const record = { id: match.id, status: 'complete', bot: match.bot, createdAt: match.createdAt, startsAt: match.startsAt, endsAt: match.endsAt, completedAt: now(), scores, winnerSlot: winner, jackpots: { ...match.jackpots }, participants: match.participants.map(part => ({ slot: part.slot, playerId: part.playerId, name: part.name, side: part.side, hand: part.hand, digitStyle: part.digitStyle, bot: part.bot })), playerStates: {} };
    this.data.matches[match.id] = record;
    for (const part of match.participants) {
      if (part.bot || !part.playerId) continue;
      const player = this.player(part);
      const score = Number(scores[part.slot] || 0);
      const win = winner === part.slot;
      const tie = winner === null;
      player.stats.totalTaps += score;
      player.stats.best = Math.max(player.stats.best, score);
      if (win) { player.stats.wins++; player.stats.currentStreak = player.stats.streakType === 'win' ? player.stats.currentStreak + 1 : 1; player.stats.streakType = 'win'; }
      else if (tie) { player.stats.ties++; player.stats.currentStreak = 0; player.stats.streakType = 'tie'; }
      else { player.stats.losses++; player.stats.currentStreak = player.stats.streakType === 'lose' ? player.stats.currentStreak + 1 : 1; player.stats.streakType = 'lose'; }
      player.coins += win ? 50 + Math.floor(score * 0.8) : (tie ? 20 : 10);
      player.weeklyScore += score + (win ? 50 : tie ? 10 : 0) + (score === 67 ? 67 : 0);
      if (part.side === 7) this.data.globalWar.seven += score + (win ? 20 : 0);
      else this.data.globalWar.six += score + (win ? 20 : 0);
      player.updatedAt = now();
      record.playerStates[part.slot] = player;
    }
    this.save();
    return record;
  }
  top(limit = 100) {
    return Object.values(this.data.players).sort((a, b) => (b.weeklyScore || 0) - (a.weeklyScore || 0) || a.name.localeCompare(b.name)).slice(0, limit).map((player, index) => ({ rank: index + 1, id: player.id, name: player.name, side: player.side, score: player.weeklyScore || 0, prizeStars: PRIZES[index + 1] || 0 }));
  }
  war() { return { six: Number(this.data.globalWar.six || 0), seven: Number(this.data.globalWar.seven || 0) }; }
}

const store = new Store(CFG.dbFile);
const sessions = new Map();
const tickets = new Map();
const matches = new Map();

function sendJson(res, code, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { 'content-type': MIME['.json'], 'content-length': data.length });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 1_000_000) reject(new Error('too_large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('bad_json')); } });
  });
}
async function api(req, res, url) {
  try {
    if (url.pathname === '/api/health') return sendJson(res, 200, { ok: true, serverNow: now(), config: { roundMs: CFG.roundMs, matchmakingMs: CFG.matchmakingMs } });
    if (url.pathname === '/api/config') return sendJson(res, 200, { matchmakingMs: CFG.matchmakingMs, roundMs: CFG.roundMs, prizePoolStars: 10000 });
    if (url.pathname === '/api/global-war') return sendJson(res, 200, store.war());
    if (url.pathname === '/api/leaderboard/weekly') return sendJson(res, 200, { prizePoolStars: 10000, prizes: PRIZES, players: store.top(100) });
    if (url.pathname === '/api/me') return sendJson(res, 200, { player: store.player({ playerId: url.searchParams.get('playerId'), name: url.searchParams.get('name'), side: url.searchParams.get('side') }) });
    if (req.method === 'POST' && url.pathname === '/api/profile') return sendJson(res, 200, { player: store.player(await readBody(req)) });
    if (req.method === 'POST' && url.pathname === '/api/shop/buy') { const body = await readBody(req); return sendJson(res, 200, { player: store.buy(body.playerId, body.kind, body.itemId) }); }
    if (req.method === 'POST' && url.pathname === '/api/shop/equip') { const body = await readBody(req); return sendJson(res, 200, { player: store.equip(body.playerId, body.kind, body.itemId) }); }
    return sendJson(res, 404, { error: 'not_found' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'bad_request' });
  }
}
function staticFile(req, res, url) {
  let target = decodeURIComponent(url.pathname);
  if (target === '/' || target === '') target = '/index.html';
  const file = path.normalize(path.join(ROOT, target));
  if (!file.startsWith(ROOT)) return sendJson(res, 403, { error: 'forbidden' });
  fs.readFile(file, (error, buffer) => {
    if (error) {
      return fs.readFile(path.join(ROOT, 'index.html'), (fallbackError, html) => {
        if (fallbackError) return sendJson(res, 404, { error: 'not_found' });
        res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-store' });
        res.end(html);
      });
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': path.basename(file) === 'index.html' ? 'no-store' : 'public, max-age=86400' });
    res.end(buffer);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);
  return staticFile(req, res, url);
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/ws') return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

function send(session, payload) {
  if (!session || session.ws.readyState !== WebSocket.OPEN) return;
  try { session.ws.send(JSON.stringify({ serverNow: now(), ...payload })); } catch {}
}
function removeTicket(ticketId, reason = 'cancelled') {
  const ticket = tickets.get(ticketId);
  if (!ticket) return;
  clearTimeout(ticket.timeout);
  tickets.delete(ticket.id);
  const session = sessions.get(ticket.sessionId);
  if (session?.ticketId === ticket.id) session.ticketId = '';
  if (reason !== 'matched') send(session, { type: 'matchmaking:cancelled', reason });
  if (ticket.pairId) {
    const pair = tickets.get(ticket.pairId);
    if (pair) {
      clearTimeout(pair.timeout);
      tickets.delete(pair.id);
      const other = sessions.get(pair.sessionId);
      if (other?.ticketId === pair.id) other.ticketId = '';
      if (reason !== 'matched') send(other, { type: 'matchmaking:cancelled', reason: 'opponent_cancelled' });
    }
  }
}
function clearTickets(sessionId) { for (const ticket of [...tickets.values()]) if (ticket.sessionId === sessionId) removeTicket(ticket.id, 'disconnected'); }
function participant(session, slot) {
  const profile = session.profile;
  return { slot, sessionId: session.id, playerId: cleanId(profile.playerId), name: cleanName(profile.name), side: side(profile.side), hand: cleanHand(profile.hand), digitStyle: cleanDigit(profile.digitStyle), bot: false, tapTimes: [] };
}
function botFor(sideValue, slot) {
  return { slot, sessionId: '', playerId: '', name: pick(RIVALS), side: side(sideValue), hand: pick(HANDS), digitStyle: pick(DIGITS), bot: true, botPower: 0.85 + Math.random() * 0.38, tapTimes: [] };
}
function matchView(match, sessionId) {
  return { id: match.id, startsAt: match.startsAt, endsAt: match.endsAt, durationMs: CFG.roundMs, scores: { ...match.scores }, youSlot: match.participants.find(part => part.sessionId === sessionId)?.slot || null, participants: match.participants.map(part => ({ slot: part.slot, name: part.name, side: part.side, hand: part.hand, digitStyle: part.digitStyle, bot: part.bot })), sequence: match.sequence };
}
function broadcast(match, payload) { for (const part of match.participants) if (part.sessionId) send(sessions.get(part.sessionId), payload); }
function findOpponent(sideValue, ownSessionId) {
  return [...tickets.values()].filter(ticket => ticket.side === opp(sideValue) && !ticket.pairId && ticket.sessionId !== ownSessionId && ticket.deadlineAt >= now()).sort((a, b) => a.enqueuedAt - b.enqueuedAt)[0] || null;
}
function sendQueued(ticket, deadlineAt, opponentFound = false) {
  send(sessions.get(ticket.sessionId), { type: 'matchmaking:queued', ticketId: ticket.id, deadlineAt, matchmakingMs: Math.max(0, deadlineAt - ticket.enqueuedAt), opponentFound });
}
function takeTicket(ticketId) {
  const ticket = tickets.get(ticketId);
  if (!ticket) return null;
  clearTimeout(ticket.timeout);
  tickets.delete(ticket.id);
  const session = sessions.get(ticket.sessionId);
  if (session?.ticketId === ticket.id) session.ticketId = '';
  return { ticket, session };
}
function resolveSingle(ticketId) {
  const entry = takeTicket(ticketId);
  if (!entry?.session || entry.session.activeMatchId) return;
  createMatch([participant(entry.session, 'a'), botFor(opp(entry.session.profile.side), 'b')], true);
}
function resolvePair(aId, bId) {
  const a = takeTicket(aId);
  const b = takeTicket(bId);
  const aReady = a?.session && !a.session.activeMatchId;
  const bReady = b?.session && !b.session.activeMatchId;
  if (aReady && bReady) return createMatch([participant(a.session, 'a'), participant(b.session, 'b')], false);
  const remaining = aReady ? a.session : (bReady ? b.session : null);
  if (remaining) createMatch([participant(remaining, 'a'), botFor(opp(remaining.profile.side), 'b')], true);
}
function queue(session, profile) {
  clearTickets(session.id);
  if (session.activeMatchId) return send(session, { type: 'error', code: 'active_match' });
  session.profile = { playerId: cleanId(profile.playerId), name: cleanName(profile.name), side: side(profile.side), hand: cleanHand(profile.hand), digitStyle: cleanDigit(profile.digitStyle) };
  store.player(session.profile);
  const ticket = { id: uid('ticket'), sessionId: session.id, side: session.profile.side, enqueuedAt: now(), deadlineAt: now() + CFG.matchmakingMs, pairId: '', timeout: null };
  const found = findOpponent(ticket.side, session.id);
  if (found) {
    clearTimeout(found.timeout);
    found.pairId = ticket.id;
    ticket.pairId = found.id;
    tickets.set(ticket.id, ticket);
    session.ticketId = ticket.id;
    const deadlineAt = Math.max(found.deadlineAt, ticket.deadlineAt);
    const timeout = setTimeout(() => resolvePair(found.id, ticket.id), Math.max(0, deadlineAt - now()));
    found.timeout = timeout;
    ticket.timeout = timeout;
    sendQueued(found, deadlineAt, true);
    sendQueued(ticket, deadlineAt, true);
    return;
  }
  ticket.timeout = setTimeout(() => resolveSingle(ticket.id), CFG.matchmakingMs);
  tickets.set(ticket.id, ticket);
  session.ticketId = ticket.id;
  sendQueued(ticket, ticket.deadlineAt, false);
}
function createMatch(parts, bot = false) {
  const createdAt = now();
  const match = { id: uid('match'), bot, status: 'countdown', createdAt, startsAt: createdAt + CFG.startDelayMs, endsAt: createdAt + CFG.startDelayMs + CFG.roundMs, participants: parts, scores: Object.fromEntries(parts.map(part => [part.slot, 0])), jackpots: Object.fromEntries(parts.map(part => [part.slot, false])), sequence: 0, interval: null, endTimer: null, botTimers: [] };
  matches.set(match.id, match);
  for (const part of parts) {
    const session = sessions.get(part.sessionId);
    if (session) { session.activeMatchId = match.id; session.ticketId = ''; send(session, { type: 'match:found', match: matchView(match, session.id) }); }
  }
  match.interval = setInterval(() => scoreTick(match), CFG.tickMs);
  match.endTimer = setTimeout(() => finalize(match.id), Math.max(0, match.endsAt - now() + 35));
  for (const part of parts.filter(item => item.bot)) scheduleBot(match, part.slot, Math.max(0, match.startsAt - now()));
}
function scoreTick(match) {
  if (!match || match.status === 'complete') return;
  if (now() >= match.startsAt && now() < match.endsAt) match.status = 'live';
  broadcast(match, { type: 'match:score', matchId: match.id, scores: { ...match.scores }, sequence: match.sequence, startsAt: match.startsAt, endsAt: match.endsAt });
}
function applyTap(match, slot, bot = false) {
  const ts = now();
  if (!match || match.status === 'complete' || ts < match.startsAt || ts >= match.endsAt) return false;
  const part = match.participants.find(item => item.slot === slot);
  if (!part) return false;
  if (!bot) {
    part.tapTimes = (part.tapTimes || []).filter(tapTs => ts - tapTs < 1000);
    if (part.tapTimes.length >= CFG.tapCapPerSec) return false;
    part.tapTimes.push(ts);
  }
  match.status = 'live';
  match.scores[slot] = Number(match.scores[slot] || 0) + 1;
  match.sequence++;
  if (match.scores[slot] === 67) match.jackpots[slot] = true;
  return true;
}
function scheduleBot(match, slot, delay) {
  const timer = setTimeout(() => {
    if (!match || match.status === 'complete' || now() >= match.endsAt) return;
    if (now() >= match.startsAt) applyTap(match, slot, true);
    const part = match.participants.find(item => item.slot === slot);
    const base = 70 + Math.random() * 95;
    const rush = now() > match.endsAt - 1300 ? 0.78 : 1;
    scheduleBot(match, slot, Math.max(48, base * rush / Number(part?.botPower || 1)));
  }, delay);
  match.botTimers.push(timer);
}
function finalize(matchId) {
  const match = matches.get(matchId);
  if (!match || match.status === 'complete') return;
  match.status = 'complete';
  clearInterval(match.interval);
  clearTimeout(match.endTimer);
  for (const timer of match.botTimers) clearTimeout(timer);
  scoreTick(match);
  const record = store.finalize(match);
  for (const part of match.participants) {
    const session = sessions.get(part.sessionId);
    if (!session) continue;
    session.activeMatchId = '';
    send(session, { type: 'match:result', match: record, player: part.playerId ? store.player(part) : null });
  }
  setTimeout(() => matches.delete(match.id), 30000);
}

wss.on('connection', ws => {
  const session = { id: uid('session'), ws, ticketId: '', activeMatchId: '', profile: null };
  sessions.set(session.id, session);
  send(session, { type: 'hello:required', sessionId: session.id, config: { roundMs: CFG.roundMs, matchmakingMs: CFG.matchmakingMs } });
  const sync = setInterval(() => send(session, { type: 'server:sync' }), 2000);
  ws.on('message', raw => {
    let message;
    try { message = JSON.parse(String(raw)); } catch { return send(session, { type: 'error', code: 'bad_json' }); }
    if (message.type === 'hello') {
      session.profile = { playerId: cleanId(message.playerId), name: cleanName(message.name), side: side(message.side), hand: cleanHand(message.hand), digitStyle: cleanDigit(message.digitStyle) };
      return send(session, { type: 'hello:ack', sessionId: session.id, player: store.player(session.profile) });
    }
    if (message.type === 'matchmaking:join') return queue(session, message.profile || message);
    if (message.type === 'matchmaking:cancel') return removeTicket(session.ticketId, 'cancelled');
    if (message.type === 'tap') {
      const match = matches.get(message.matchId || session.activeMatchId);
      if (!match || match.id !== session.activeMatchId) return;
      const part = match.participants.find(item => item.sessionId === session.id);
      if (part && applyTap(match, part.slot, false)) send(session, { type: 'tap:ack', matchId: match.id, slot: part.slot, sequence: match.sequence });
      return;
    }
    return send(session, { type: 'error', code: 'unknown_type' });
  });
  ws.on('close', () => { clearInterval(sync); clearTickets(session.id); sessions.delete(session.id); });
  ws.on('error', () => {});
});

server.listen(CFG.port, () => console.log(`Six Seven authoritative server: http://localhost:${CFG.port}`));
