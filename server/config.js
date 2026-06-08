const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://sixseven-a2f.pages.dev',
  'http://localhost:5173',
  'http://localhost:8788',
  'http://localhost:3000',
]);

function parseList(value, fallback = []) {
  const items = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  return items.length ? items : [...fallback];
}

function firstEnv(names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function isProductionRuntime() {
  return process.env.NODE_ENV === 'production' || process.env.RENDER === 'true';
}

const production = isProductionRuntime();
const jwtSecret = process.env.JWT_SECRET || '';
const telegramBotToken = firstEnv(['TELEGRAM_BOT_TOKEN', 'SIX_SEVEN_BOT_TOKEN', 'BOT_TOKEN', 'TG_BOT_TOKEN']);
const allowDevAuth = !production && process.env.SIX_SEVEN_DEV_AUTH !== '0';
const allowFileDb = !production || process.env.SIX_SEVEN_ALLOW_FILE_DB === '1';
const dbFile = process.env.SIX_SEVEN_DB || `${process.env.SIX_SEVEN_DATA_DIR || '.six-seven-data'}/six-seven-db.json`;
const dbFallbackFile = process.env.SIX_SEVEN_DB_FALLBACK || `${process.env.TMPDIR || '/tmp'}/six-seven-db.json`;

if (production && !jwtSecret) {
  throw new Error('JWT_SECRET is required in production');
}

if (production && !telegramBotToken) {
  throw new Error('TELEGRAM_BOT_TOKEN is required in production. Accepted env names: TELEGRAM_BOT_TOKEN, SIX_SEVEN_BOT_TOKEN, BOT_TOKEN, TG_BOT_TOKEN');
}

if (production && !process.env.DATABASE_URL && !allowFileDb) {
  throw new Error('DATABASE_URL is required in production unless SIX_SEVEN_ALLOW_FILE_DB=1 is explicitly set');
}

export const GAME_CONFIG = Object.freeze({
  port: Number(process.env.PORT || 3000),
  production,
  jwtSecret: jwtSecret || 'six-seven-dev-secret',
  telegramBotToken,
  telegramAuthMaxAgeSeconds: Number(process.env.TELEGRAM_AUTH_MAX_AGE_SECONDS || 86400),
  allowDevAuth,
  allowFileDb,
  allowedOrigins: Object.freeze(parseList(process.env.ALLOWED_ORIGINS, DEFAULT_ALLOWED_ORIGINS)),
  serveStatic: process.env.SERVE_STATIC === '1',
  matchmakingMs: 6700,
  roundMs: 6700,
  startDelayMs: 1200,
  scoreBroadcastMs: 67,
  maxTapRatePerSecond: 35,
  botMinDelayMs: 72,
  botMaxDelayMs: 172,
  botFinalRushMultiplier: 0.78,
  dbFile,
  dbFallbackFile,
});

export const RIVAL_NAMES = Object.freeze([
  'ZenBoy', 'Ksu_Lab', 'NoChill', 'CR1S', 'mishakek', 'Bruh666', 'Lola.exe',
  'taptap', 'Vibez', 'huh_what', 'pluh', 'GYAT', 'Spectre', 'KleoX', 'g0blin',
  'Cooked67', 'AuraDebt', 'BloxKid', 'SevenLord', 'SixBoss'
]);

export const HAND_IDS = Object.freeze(['hand', 'clown', 'cube', 'spanch', 'devil', 'roblox', 'robo']);
export const DIGIT_IDS = Object.freeze(['classic', 'clown', 'devil', 'robo']);

export const SHOP_CATALOG = Object.freeze({
  hands: Object.freeze([
    { id: 'hand', price: 0 },
    { id: 'clown', price: 500 },
    { id: 'cube', price: 700 },
    { id: 'spanch', price: 1200 },
    { id: 'devil', price: 1500 },
    { id: 'roblox', price: 2400 },
    { id: 'robo', price: 3000 },
  ]),
  digits: Object.freeze([
    { id: 'classic', price: 0 },
    { id: 'clown', price: 400 },
    { id: 'devil', price: 1200 },
    { id: 'robo', price: 2500 },
  ]),
});
