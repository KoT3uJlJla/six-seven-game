import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { authenticateTelegram, isAllowedOrigin, verifyTelegramInitData } from '../server/security.js';

function telegramHash(params, token) {
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  return crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
}

const token = '123456:TEST_TOKEN';
const now = Math.floor(Date.now() / 1000);
const params = new URLSearchParams({
  auth_date: String(now),
  query_id: 'AAHdF6IQAAAAAN0XohDhrOrc',
  user: JSON.stringify({ id: 667, first_name: 'Alpha67', username: 'sixseven' }),
});
params.set('hash', telegramHash(params, token));

const config = {
  production: true,
  jwtSecret: 'hardening-secret',
  telegramBotToken: token,
  telegramAuthMaxAgeSeconds: 86400,
  allowedOrigins: ['https://sixseven-a2f.pages.dev'],
};

const verified = verifyTelegramInitData(params.toString(), config, now * 1000);
assert.equal(verified.telegramId, '667');

const identity = authenticateTelegram(params.toString(), config);
assert.match(identity.playerId, /^u_[a-f0-9]{24}$/);
assert.match(identity.referralCode, /^r[a-f0-9]{12}$/);
assert.equal(identity.playerId.includes('667'), false);

const badParams = new URLSearchParams(params);
badParams.set('hash', '00');
assert.throws(() => verifyTelegramInitData(badParams.toString(), config, now * 1000), /invalid Telegram initData hash/);

assert.equal(isAllowedOrigin('https://sixseven-a2f.pages.dev', config), true);
assert.equal(isAllowedOrigin('https://evil.example', config), false);
assert.equal(isAllowedOrigin('', config), false);

const staticSource = fs.readFileSync('server/static.js', 'utf8');
assert.match(staticSource, /!config\.serveStatic/);
assert.equal(staticSource.includes(' ? DIST_ROOT : ROOT'), false);
assert.equal(staticSource.includes('const root = publicRoot()'), false);

const appSource = fs.readFileSync('src/app.js', 'utf8');
assert.match(appSource, /initData: telegramInitData\(\)/);
assert.equal(appSource.includes('playerId: PLAYER_ID'), false);
assert.equal(appSource.includes('state.referrals.sent += 1'), false);
assert.match(appSource, /return telegramBotDeepLink\(param\)/);
assert.equal(appSource.includes('return telegramAppLink(param)'), false);
assert.equal(appSource.includes('spawnFloater('), false);
assert.equal(appSource.includes('phraseStorm('), false);

const workerSource = fs.readFileSync('_worker.js', 'utf8');
assert.equal(workerSource.includes('release-image-rescue'), false);

console.log('hardening checks passed');
