import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const MONGODB_URI = process.env.MONGODB_URI || '';
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}
if (!BOT_TOKEN) {
  console.warn('[boot] BOT_TOKEN is missing. Telegram initData auth will fail until configured.');
}

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '256kb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 60_000, max: 240, standardHeaders: true, legacyHeaders: false }));
app.use(cors({
  origin(origin, cb) {
    if (!origin || FRONTEND_ORIGINS.length === 0 || FRONTEND_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: false,
}));

await mongoose.connect(MONGODB_URI, {
  autoIndex: true,
  serverSelectionTimeoutMS: 10_000,
});

const now = () => Date.now();
const dayMs = 24 * 60 * 60 * 1000;
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
const sideOf = v => Number(v) === 7 ? 7 : 6;

function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function parseInitData(initData) {
  return Object.fromEntries(new URLSearchParams(initData || ''));
}

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) throw Object.assign(new Error('BOT_TOKEN is not configured'), { status: 500 });
  if (!initData) throw Object.assign(new Error('initData is required'), { status: 401 });

  const params = parseInitData(initData);
  const hash = params.hash;
  if (!hash) throw Object.assign(new Error('initData hash is missing'), { status: 401 });
  delete params.hash;

  const dataCheckString = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw Object.assign(new Error('Invalid Telegram initData'), { status: 401 });
  }

  const authDate = Number(params.auth_date || 0) * 1000;
  const maxAgeMs = Number(process.env.INIT_DATA_MAX_AGE_MS || 24 * 60 * 60 * 1000);
  if (authDate && now() - authDate > maxAgeMs) {
    throw Object.assign(new Error('Telegram initData expired'), { status: 401 });
  }

  const user = JSON.parse(params.user || '{}');
  if (!user.id) throw Object.assign(new Error('Telegram user is missing'), { status: 401 });
  return { params, user };
}

function signUser(user) {
  return jwt.sign({ sub: String(user.telegramId), side: user.side }, JWT_SECRET, { expiresIn: '30d' });
}

function authRequired(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw Object.assign(new Error('Bearer token required'), { status: 401 });
    req.auth = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    err.status = err.status || 401;
    return next(err);
  }
}

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, index: true, required: true },
  username: String,
  firstName: String,
  lastName: String,
  languageCode: String,
  side: { type: Number, enum: [6, 7], default: 6 },
  coins: { type: Number, default: 250 },
  weeklyScore: { type: Number, default: 0, index: true },
  best: { type: Number, default: 0 },
  totalTaps: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  ties: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  streakType: { type: String, default: 'none' },
  referralCode: { type: String, unique: true, sparse: true, index: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  referralAccepted: { type: Number, default: 0 },
  referralSent: { type: Number, default: 0 },
  guildId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guild', default: null, index: true },
  guildJoinedAt: { type: Date, default: null },
  guildLockedUntil: { type: Date, default: null },
  guildCooldownUntil: { type: Date, default: null },
  ownedHands: { type: [String], default: ['hand'] },
  ownedDigits: { type: [String], default: ['classic'] },
  hand: { type: String, default: 'hand' },
  digitStyle: { type: String, default: 'classic' },
}, { timestamps: true });

const guildSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 24 },
  tag: { type: String, required: true, uppercase: true, trim: true, maxlength: 5, index: true },
  side: { type: Number, enum: [6, 7], default: 6, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  score: { type: Number, default: 0, index: true },
  members: { type: Number, default: 1 },
  invites: { type: Number, default: 0 },
  week: { type: String, default: () => weekKey(), index: true },
}, { timestamps: true });

guildSchema.index({ week: 1, score: -1 });

const matchSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  side: { type: Number, enum: [6, 7], required: true },
  myScore: { type: Number, required: true },
  enemyScore: { type: Number, required: true },
  result: { type: String, enum: ['win', 'lose', 'tie'], required: true },
  durationMs: { type: Number, default: 6700 },
  tapsPerSecond: Number,
  coinsReward: Number,
  guildScore: Number,
  suspicious: { type: Boolean, default: false, index: true },
  reason: String,
  week: { type: String, default: () => weekKey(), index: true },
}, { timestamps: true });

const referralEventSchema = new mongoose.Schema({
  inviterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  inviteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  code: String,
  side: Number,
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Guild = mongoose.model('Guild', guildSchema);
const Match = mongoose.model('Match', matchSchema);
const ReferralEvent = mongoose.model('ReferralEvent', referralEventSchema);

function serializeGuild(guild) {
  if (!guild) return null;
  return {
    id: String(guild._id),
    name: guild.name,
    tag: guild.tag,
    side: guild.side,
    score: guild.score,
    members: guild.members,
    invites: guild.invites,
  };
}

function serializeUser(user, guild = null) {
  return {
    id: String(user._id),
    telegramId: user.telegramId,
    name: user.firstName || user.username || 'Alpha67',
    username: user.username || '',
    side: user.side,
    coins: user.coins,
    weeklyScore: user.weeklyScore,
    hand: user.hand,
    digitStyle: user.digitStyle,
    ownedHands: user.ownedHands,
    ownedDigits: user.ownedDigits,
    stats: {
      wins: user.wins,
      losses: user.losses,
      ties: user.ties,
      best: user.best,
      totalTaps: user.totalTaps,
      currentStreak: user.currentStreak,
      streakType: user.streakType,
    },
    referrals: {
      code: user.referralCode,
      accepted: user.referralAccepted,
      sent: user.referralSent,
      referredBy: user.referredBy ? String(user.referredBy) : '',
    },
    guild: guild ? {
      ...serializeGuild(guild),
      joinedAt: user.guildJoinedAt?.getTime?.() || 0,
      lockedUntil: user.guildLockedUntil?.getTime?.() || 0,
      cooldownUntil: user.guildCooldownUntil?.getTime?.() || 0,
    } : null,
  };
}

async function getMe(req) {
  const user = await User.findOne({ telegramId: String(req.auth.sub) });
  if (!user) throw Object.assign(new Error('User not found'), { status: 401 });
  return user;
}

async function getUserGuild(user) {
  if (!user.guildId) return null;
  return Guild.findById(user.guildId);
}

function makeReferralCode(telegramId) {
  return `u${Number(telegramId).toString(36)}`;
}

async function seedGuildsIfNeeded() {
  const existing = await Guild.countDocuments({ ownerId: { $exists: true }, week: weekKey() });
  if (existing >= 20) return;
  const botUser = await User.findOneAndUpdate(
    { telegramId: 'system-guild-bot' },
    { $setOnInsert: { telegramId: 'system-guild-bot', firstName: 'System', referralCode: 'system' } },
    { upsert: true, new: true }
  );
  const names = [
    ['Skibidi Raiders', 'SKIB', 7], ['67 Cult', 'CULT', 6], ['Aura Farmers', 'AURA', 6], ['Brainrot Mafia', 'BROT', 7],
    ['Sigma Tappers', 'SIGM', 6], ['Mango Squad', 'MNGO', 7], ['Cooked Council', 'COOK', 6], ['Sahur Legion', 'SAHR', 7],
    ['No Chill Six', 'NCS', 6], ['Seven Syndicate', 'S7N', 7], ['NPC Crushers', 'NPC', 6], ['Bonk Factory', 'BONK', 7]
  ];
  for (let i = 0; i < names.length; i++) {
    const [name, tag, side] = names[i];
    await Guild.findOneAndUpdate(
      { tag, week: weekKey() },
      { $setOnInsert: { name, tag, side, ownerId: botUser._id, members: 67 + i * 13, score: 45000 - i * 2600, invites: 10 + i, week: weekKey() } },
      { upsert: true }
    );
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'six-seven-backend', week: weekKey(), mongo: mongoose.connection.readyState });
});

app.post('/api/auth/telegram', async (req, res, next) => {
  try {
    const { initData, side, refCode, guildId } = req.body || {};
    const { user: tgUser } = verifyTelegramInitData(initData);
    const telegramId = String(tgUser.id);

    const set = {
      username: tgUser.username || '',
      firstName: tgUser.first_name || 'Alpha67',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code || '',
    };
    const setOnInsert = {
      telegramId,
      side: sideOf(side),
      referralCode: makeReferralCode(telegramId),
      coins: 250,
    };

    let user = await User.findOneAndUpdate({ telegramId }, { $set: set, $setOnInsert: setOnInsert }, { upsert: true, new: true });

    if (side) user.side = sideOf(side);

    if (refCode && !user.referredBy) {
      const inviter = await User.findOne({ referralCode: String(refCode) });
      if (inviter && String(inviter._id) !== String(user._id)) {
        const created = await ReferralEvent.findOneAndUpdate(
          { inviteeId: user._id },
          { $setOnInsert: { inviterId: inviter._id, inviteeId: user._id, code: String(refCode), side: sideOf(side) } },
          { upsert: true, new: true, rawResult: true }
        );
        if (created?.lastErrorObject?.upserted) {
          user.referredBy = inviter._id;
          user.coins += 67;
          inviter.referralAccepted += 1;
          inviter.referralSent += 1;
          inviter.coins += 17;
          await inviter.save();
        }
      }
    }

    if (guildId && !user.guildId) {
      const guild = await Guild.findById(guildId);
      if (guild) {
        user.guildId = guild._id;
        user.guildJoinedAt = new Date();
        user.guildLockedUntil = new Date(now() + dayMs);
        guild.members += 1;
        guild.invites += 1;
        await guild.save();
      }
    }

    await user.save();
    const guild = await getUserGuild(user);
    res.json({ token: signUser(user), user: serializeUser(user, guild) });
  } catch (err) { next(err); }
});

app.get('/api/me', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    const guild = await getUserGuild(user);
    res.json({ user: serializeUser(user, guild) });
  } catch (err) { next(err); }
});

app.post('/api/me/side', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    user.side = sideOf(req.body?.side);
    await user.save();
    const guild = await getUserGuild(user);
    res.json({ user: serializeUser(user, guild) });
  } catch (err) { next(err); }
});

app.post('/api/matches/finish', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    const myScore = clamp(req.body?.myScore, 0, 500);
    const enemyScore = clamp(req.body?.enemyScore, 0, 500);
    const durationMs = clamp(req.body?.durationMs || 6700, 1000, 30000);
    const side = sideOf(req.body?.side || user.side);
    const tps = myScore / (durationMs / 1000);
    const suspicious = tps > Number(process.env.MAX_TPS || 18) || myScore > Number(process.env.MAX_SCORE || 160);
    const result = myScore === enemyScore ? 'tie' : (myScore > enemyScore ? 'win' : 'lose');
    const coinsReward = result === 'win' ? Math.floor(50 + myScore * 0.8) : (result === 'tie' ? 20 : 10);
    const guildScore = myScore + (result === 'win' ? 67 : result === 'tie' ? 20 : 6);

    if (result === 'win') {
      user.wins += 1;
      user.currentStreak = user.streakType === 'win' ? user.currentStreak + 1 : 1;
      user.streakType = 'win';
    } else if (result === 'lose') {
      user.losses += 1;
      user.currentStreak = user.streakType === 'lose' ? user.currentStreak + 1 : 1;
      user.streakType = 'lose';
    } else {
      user.ties += 1;
      user.currentStreak = 0;
      user.streakType = 'tie';
    }

    user.side = side;
    user.totalTaps += myScore;
    user.best = Math.max(user.best, myScore);
    user.coins += suspicious ? 0 : coinsReward;
    user.weeklyScore += suspicious ? 0 : (myScore + (result === 'win' ? 50 : 0));

    let guild = null;
    if (user.guildId && !suspicious) {
      guild = await Guild.findById(user.guildId);
      if (guild) {
        guild.score += guildScore;
        await guild.save();
      }
    }

    await Match.create({
      userId: user._id,
      side,
      myScore,
      enemyScore,
      result,
      durationMs,
      tapsPerSecond: tps,
      coinsReward: suspicious ? 0 : coinsReward,
      guildScore: suspicious ? 0 : guildScore,
      suspicious,
      reason: suspicious ? `tps=${tps.toFixed(2)}` : '',
      week: weekKey(),
    });
    await user.save();

    res.json({ user: serializeUser(user, guild || await getUserGuild(user)), result: { result, coinsReward: suspicious ? 0 : coinsReward, suspicious } });
  } catch (err) { next(err); }
});

app.get('/api/leaderboard/players', authRequired, async (req, res, next) => {
  try {
    const me = await getMe(req);
    const top = await User.find({ telegramId: { $ne: 'system-guild-bot' } }).sort({ weeklyScore: -1, best: -1, updatedAt: 1 }).limit(100).lean();
    const ids = top.map(u => String(u._id));
    let meRank = ids.indexOf(String(me._id)) + 1;
    if (!meRank) meRank = await User.countDocuments({ weeklyScore: { $gt: me.weeklyScore } }) + 1;
    res.json({
      items: top.map((u, i) => ({ rank: i + 1, id: String(u._id), name: u.firstName || u.username || 'Alpha67', side: u.side, score: u.weeklyScore, me: String(u._id) === String(me._id) })),
      me: { rank: meRank, score: me.weeklyScore, inTop100: meRank <= 100 },
      week: weekKey(),
    });
  } catch (err) { next(err); }
});

app.get('/api/leaderboard/guilds', authRequired, async (req, res, next) => {
  try {
    await seedGuildsIfNeeded();
    const me = await getMe(req);
    const top = await Guild.find({ week: weekKey() }).sort({ score: -1, members: -1, updatedAt: 1 }).limit(100).lean();
    const ids = top.map(g => String(g._id));
    let meGuildRank = 0;
    if (me.guildId) {
      meGuildRank = ids.indexOf(String(me.guildId)) + 1;
      if (!meGuildRank) {
        const g = await Guild.findById(me.guildId).lean();
        if (g) meGuildRank = await Guild.countDocuments({ week: weekKey(), score: { $gt: g.score } }) + 1;
      }
    }
    res.json({
      items: top.map((g, i) => ({ rank: i + 1, ...serializeGuild(g), me: String(g._id) === String(me.guildId || '') })),
      me: { rank: meGuildRank, guildId: me.guildId ? String(me.guildId) : '', inTop100: meGuildRank > 0 && meGuildRank <= 100 },
      week: weekKey(),
    });
  } catch (err) { next(err); }
});

app.post('/api/guilds/create', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    if (user.guildId) throw Object.assign(new Error('Already in guild'), { status: 409 });
    if (user.guildCooldownUntil && user.guildCooldownUntil.getTime() > now()) throw Object.assign(new Error('Guild cooldown active'), { status: 429 });

    const name = String(req.body?.name || `${user.firstName || 'Alpha'} Gang`).trim().slice(0, 24) || 'Alpha Gang';
    const tag = String(req.body?.tag || name.replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'GANG').toUpperCase().slice(0, 5);
    const guild = await Guild.create({ name, tag, side: sideOf(req.body?.side || user.side), ownerId: user._id, week: weekKey() });
    user.guildId = guild._id;
    user.guildJoinedAt = new Date();
    user.guildLockedUntil = new Date(now() + dayMs);
    await user.save();
    res.json({ user: serializeUser(user, guild), guild: serializeGuild(guild) });
  } catch (err) { next(err); }
});

app.post('/api/guilds/join', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    if (user.guildId) throw Object.assign(new Error('Already in guild'), { status: 409 });
    if (user.guildCooldownUntil && user.guildCooldownUntil.getTime() > now()) throw Object.assign(new Error('Guild cooldown active'), { status: 429 });
    const guild = await Guild.findById(req.body?.guildId);
    if (!guild) throw Object.assign(new Error('Guild not found'), { status: 404 });
    user.guildId = guild._id;
    user.guildJoinedAt = new Date();
    user.guildLockedUntil = new Date(now() + dayMs);
    guild.members += 1;
    await guild.save();
    await user.save();
    res.json({ user: serializeUser(user, guild), guild: serializeGuild(guild) });
  } catch (err) { next(err); }
});

app.post('/api/guilds/leave', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    if (!user.guildId) throw Object.assign(new Error('No guild'), { status: 409 });
    if (user.guildLockedUntil && user.guildLockedUntil.getTime() > now()) throw Object.assign(new Error('Loyalty lock active'), { status: 429 });
    await Guild.findByIdAndUpdate(user.guildId, { $inc: { members: -1 } });
    user.guildId = null;
    user.guildJoinedAt = null;
    user.guildLockedUntil = null;
    user.guildCooldownUntil = new Date(now() + 12 * 60 * 60 * 1000);
    await user.save();
    res.json({ user: serializeUser(user, null) });
  } catch (err) { next(err); }
});

app.get('/api/shop/catalog', (_req, res) => {
  res.json({
    hands: ['hand', 'clown', 'cube', 'devil', 'roblox', 'robo', 'spanch'],
    digits: ['classic', 'clown', 'devil', 'robo'],
  });
});

app.post('/api/shop/equip', authRequired, async (req, res, next) => {
  try {
    const user = await getMe(req);
    const type = String(req.body?.type || '');
    const id = String(req.body?.id || '');
    if (type === 'hand' && user.ownedHands.includes(id)) user.hand = id;
    if (type === 'digit' && user.ownedDigits.includes(id)) user.digitStyle = id;
    await user.save();
    const guild = await getUserGuild(user);
    res.json({ user: serializeUser(user, guild) });
  } catch (err) { next(err); }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error' });
});

app.listen(PORT, () => {
  console.log(`[boot] six-seven backend listening on :${PORT}`);
});
