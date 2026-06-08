import crypto from 'node:crypto';

function timingSafeEqualHex(a, b) {
  const left = Buffer.from(String(a || ''), 'hex');
  const right = Buffer.from(String(b || ''), 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hmacHex(secret, value, length = 32) {
  return crypto.createHmac('sha256', secret).update(String(value)).digest('hex').slice(0, length);
}

export function publicPlayerId(secret, telegramId) {
  return `u_${hmacHex(secret, `player:${telegramId}`, 24)}`;
}

export function referralCode(secret, telegramId) {
  return `r${hmacHex(secret, `referral:${telegramId}`, 12)}`;
}

export function verifyTelegramInitData(initData, config, nowMs = Date.now()) {
  const raw = String(initData || '').trim();
  if (!raw) throw new Error('missing Telegram initData');
  if (!config.telegramBotToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');

  const params = new URLSearchParams(raw);
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw new Error('missing Telegram initData hash');
  params.delete('hash');

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate) throw new Error('missing Telegram auth_date');
  const ageSeconds = Math.floor(nowMs / 1000) - authDate;
  if (ageSeconds < -60 || ageSeconds > config.telegramAuthMaxAgeSeconds) {
    throw new Error('expired Telegram initData');
  }

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(config.telegramBotToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!timingSafeEqualHex(computedHash, receivedHash)) throw new Error('invalid Telegram initData hash');

  const user = JSON.parse(params.get('user') || '{}');
  if (!user.id) throw new Error('Telegram user id is missing');
  return {
    telegramId: String(user.id),
    name: String(user.first_name || user.username || 'Alpha67').slice(0, 24),
    username: user.username ? String(user.username) : '',
    authDate,
  };
}

export function makeDevIdentity(seed, config) {
  const value = String(seed || 'local-dev-player');
  const id = `dev_${hmacHex(config.jwtSecret, value, 24)}`;
  return {
    playerId: id,
    publicId: id,
    referralCode: `r${hmacHex(config.jwtSecret, `dev-ref:${value}`, 12)}`,
    name: 'LocalDev',
  };
}

export function authenticateTelegram(initData, config) {
  const verified = verifyTelegramInitData(initData, config);
  const playerId = publicPlayerId(config.jwtSecret, verified.telegramId);
  return {
    playerId,
    publicId: playerId,
    referralCode: referralCode(config.jwtSecret, verified.telegramId),
    name: verified.name,
    username: verified.username,
  };
}

export function isAllowedOrigin(origin, config) {
  const value = String(origin || '').trim();
  if (!value) return !config.production;
  try {
    const normalized = new URL(value).origin;
    return (config.allowedOrigins || []).includes(normalized);
  } catch {
    return false;
  }
}

export function corsHeaders(req, config) {
  const origin = req.headers.origin || '';
  if (!origin) return { allowed: true, headers: {} };
  if (!isAllowedOrigin(origin, config)) return { allowed: !origin && !config.production, headers: {} };
  return {
    allowed: true,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'access-control-allow-headers': 'Content-Type, X-Telegram-Init-Data, X-Six-Seven-Dev-Player, Authorization',
      'access-control-max-age': '86400',
      vary: 'Origin',
    },
  };
}
