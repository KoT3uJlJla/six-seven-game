import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DIGIT_IDS, HAND_IDS, SHOP_CATALOG } from './config.js';

const DEFAULT_STATS = Object.freeze({
  wins: 0,
  losses: 0,
  ties: 0,
  best: 0,
  totalTaps: 0,
  currentStreak: 0,
  streakType: 'none',
});

const DEFAULT_REFERRALS = Object.freeze({
  code: '',
  sent: 0,
  accepted: 0,
  referredBy: '',
  firstTouchClaimed: false,
});

function cloneStats(value = {}) {
  return { ...DEFAULT_STATS, ...(value || {}) };
}

function cloneReferrals(value = {}) {
  return { ...DEFAULT_REFERRALS, ...(value || {}) };
}

function safeName(name) {
  const clean = String(name || 'Alpha67').replace(/[<>]/g, '').trim().slice(0, 24);
  return clean || 'Alpha67';
}

function safeSide(side) {
  return Number(side) === 7 ? 7 : 6;
}

function safeSkin(value, list, fallback) {
  return list.includes(String(value || '')) ? String(value) : fallback;
}

function uniqueKnown(values, known, fallback) {
  return Array.from(new Set([fallback, ...(Array.isArray(values) ? values : [])].map(String))).filter(item => known.includes(item));
}

function fallbackPublicId(id) {
  return `u_${crypto.createHash('sha256').update(String(id || '')).digest('hex').slice(0, 24)}`;
}

function createHttpError(statusCode, code) {
  return Object.assign(new Error(code), { statusCode, code });
}

function catalogItem(kind, itemId) {
  const list = kind === 'hands' ? SHOP_CATALOG.hands : SHOP_CATALOG.digits;
  return list.find(item => item.id === itemId) || null;
}

function normalizeKind(kind) {
  if (kind === 'hand') return 'hands';
  if (kind === 'digit') return 'digits';
  return kind === 'hands' || kind === 'digits' ? kind : '';
}

function createEmptyDb() {
  return {
    version: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: {},
    matches: {},
    globalWar: { six: 0, seven: 0 },
  };
}

export class GameDatabase {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.fallbackFilePath = options.fallbackFilePath ? path.resolve(options.fallbackFilePath) : '';
    this.allowFallback = options.allowFallback !== false;
    this.usedFallback = false;
    this.data = createEmptyDb();
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        this.persist();
        return;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        ...createEmptyDb(),
        ...parsed,
        version: 2,
        players: parsed.players || {},
        matches: parsed.matches || {},
        globalWar: { six: 0, seven: 0, ...(parsed.globalWar || {}) },
      };
      let changed = false;
      for (const [id, player] of Object.entries(this.data.players)) {
        this.data.players[id] = this.normalizePlayer(id, player);
        changed = true;
      }
      if (changed) this.persist();
    } catch {
      const backup = `${this.filePath}.broken-${Date.now()}`;
      try {
        if (fs.existsSync(this.filePath)) fs.renameSync(this.filePath, backup);
      } catch {}
      this.data = createEmptyDb();
      this.persist();
    }
  }

  persist() {
    try {
      this.writeDataFile(this.filePath);
    } catch (error) {
      if (!this.canUseFallback(error)) throw error;
      const blockedPath = this.filePath;
      this.filePath = this.fallbackFilePath;
      this.usedFallback = true;
      console.warn(`Six Seven DB path is not writable (${error.code}: ${blockedPath}); using fallback ${this.filePath}`);
      this.writeDataFile(this.filePath);
    }
  }

  writeDataFile(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.data.updatedAt = Date.now();
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, filePath);
  }

  canUseFallback(error) {
    if (!this.allowFallback || !this.fallbackFilePath || this.usedFallback) return false;
    if (path.resolve(this.fallbackFilePath) === path.resolve(this.filePath)) return false;
    return ['EACCES', 'EPERM', 'EROFS', 'ENOENT'].includes(error?.code);
  }

  normalizePlayer(id, player = {}, profile = {}) {
    const publicId = String(profile.publicId || player.publicId || fallbackPublicId(id));
    const referrals = cloneReferrals(player.referrals);
    if (profile.referralCode && !referrals.code) referrals.code = String(profile.referralCode);
    return {
      ...player,
      id,
      publicId,
      name: safeName(profile.name ?? player.name),
      side: safeSide(profile.side ?? player.side),
      coins: Math.max(0, Number(player.coins ?? 250)),
      hand: safeSkin(profile.hand ?? player.hand, HAND_IDS, 'hand'),
      digit: safeSkin(profile.digit ?? player.digit ?? player.digitStyle, DIGIT_IDS, 'classic'),
      ownedHands: uniqueKnown(player.ownedHands, HAND_IDS, 'hand'),
      ownedDigits: uniqueKnown(player.ownedDigits, DIGIT_IDS, 'classic'),
      stats: cloneStats(player.stats),
      weeklyScore: Math.max(0, Number(player.weeklyScore || 0)),
      referrals,
      guild: player.guild || null,
      createdAt: Number(player.createdAt || Date.now()),
      updatedAt: Number(player.updatedAt || Date.now()),
    };
  }

  serializePlayer(player) {
    const normalized = this.normalizePlayer(player.id, player);
    return {
      id: normalized.publicId,
      publicId: normalized.publicId,
      name: normalized.name,
      side: normalized.side,
      coins: normalized.coins,
      hand: normalized.hand,
      digit: normalized.digit,
      ownedHands: normalized.ownedHands,
      ownedDigits: normalized.ownedDigits,
      stats: cloneStats(normalized.stats),
      weeklyScore: normalized.weeklyScore,
      referrals: cloneReferrals(normalized.referrals),
      guild: normalized.guild,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
    };
  }

  getOrCreatePlayer(playerId, profile = {}) {
    const id = String(playerId || '').trim();
    if (!id) throw new Error('playerId is required');
    if (!this.data.players[id]) {
      this.data.players[id] = this.normalizePlayer(id, {
        id,
        coins: 250,
        stats: cloneStats(),
        weeklyScore: 0,
        ownedHands: ['hand'],
        ownedDigits: ['classic'],
        referrals: { ...DEFAULT_REFERRALS, code: profile.referralCode || '' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }, profile);
      this.persist();
    } else {
      const existing = this.data.players[id];
      this.data.players[id] = this.normalizePlayer(id, {
        ...existing,
        referrals: {
          ...cloneReferrals(existing.referrals),
          code: existing.referrals?.code || profile.referralCode || '',
        },
      }, profile);
      this.data.players[id].updatedAt = Date.now();
      this.persist();
    }
    return this.data.players[id];
  }

  updatePlayerProfile(playerId, profile = {}) {
    const player = this.getOrCreatePlayer(playerId, profile);
    if (profile.name != null) player.name = safeName(profile.name);
    if (profile.side != null) player.side = safeSide(profile.side);
    if (profile.publicId != null) player.publicId = String(profile.publicId);
    if (profile.referralCode && !player.referrals.code) player.referrals.code = String(profile.referralCode);
    if (profile.hand != null) player.hand = safeSkin(profile.hand, HAND_IDS, player.hand);
    if (profile.digit != null) player.digit = safeSkin(profile.digit, DIGIT_IDS, player.digit);
    player.updatedAt = Date.now();
    this.persist();
    return player;
  }

  buyItem(playerId, kindInput, itemIdInput) {
    const kind = normalizeKind(kindInput);
    const itemId = String(itemIdInput || '');
    const item = catalogItem(kind, itemId);
    if (!item) throw createHttpError(404, 'shop_item_not_found');

    const player = this.getOrCreatePlayer(playerId);
    const ownedKey = kind === 'hands' ? 'ownedHands' : 'ownedDigits';
    const equipKey = kind === 'hands' ? 'hand' : 'digit';
    if (!player[ownedKey].includes(item.id)) {
      if (Number(player.coins || 0) < item.price) throw createHttpError(409, 'not_enough_coins');
      player.coins = Number(player.coins || 0) - item.price;
      player[ownedKey] = Array.from(new Set([...player[ownedKey], item.id]));
    }
    player[equipKey] = item.id;
    player.updatedAt = Date.now();
    this.persist();
    return player;
  }

  equipItem(playerId, kindInput, itemIdInput) {
    const kind = normalizeKind(kindInput);
    const itemId = String(itemIdInput || '');
    const item = catalogItem(kind, itemId);
    if (!item) throw createHttpError(404, 'shop_item_not_found');

    const player = this.getOrCreatePlayer(playerId);
    const ownedKey = kind === 'hands' ? 'ownedHands' : 'ownedDigits';
    const equipKey = kind === 'hands' ? 'hand' : 'digit';
    if (!player[ownedKey].includes(item.id)) throw createHttpError(403, 'shop_item_not_owned');
    player[equipKey] = item.id;
    player.updatedAt = Date.now();
    this.persist();
    return player;
  }

  claimReferral(playerId, codeInput, sideInput) {
    const code = String(codeInput || '').trim();
    if (!/^r[A-Za-z0-9]{8,24}$/.test(code)) throw createHttpError(400, 'bad_referral_code');

    const player = this.getOrCreatePlayer(playerId);
    if (player.referrals.code === code) throw createHttpError(400, 'self_referral');
    if (player.referrals.firstTouchClaimed) {
      return { claimed: false, reason: 'already_claimed', player };
    }

    const owner = Object.values(this.data.players).find(candidate => candidate?.referrals?.code === code);
    if (!owner) return { claimed: false, reason: 'referrer_not_found', player };

    player.referrals.firstTouchClaimed = true;
    player.referrals.referredBy = code;
    player.coins = Number(player.coins || 0) + 67;
    if (sideInput != null) player.side = safeSide(sideInput);
    owner.referrals = cloneReferrals(owner.referrals);
    owner.referrals.accepted = Number(owner.referrals.accepted || 0) + 1;
    owner.referrals.sent = Math.max(Number(owner.referrals.sent || 0), owner.referrals.accepted);
    player.updatedAt = Date.now();
    owner.updatedAt = Date.now();
    this.persist();
    return { claimed: true, player };
  }

  serializeParticipant(participant) {
    return {
      slot: participant.slot,
      id: participant.bot ? '' : String(participant.publicId || fallbackPublicId(participant.playerId)),
      publicId: participant.bot ? '' : String(participant.publicId || fallbackPublicId(participant.playerId)),
      name: safeName(participant.name),
      side: safeSide(participant.side),
      hand: safeSkin(participant.hand, HAND_IDS, 'hand'),
      digit: safeSkin(participant.digit, DIGIT_IDS, 'classic'),
      bot: Boolean(participant.bot),
    };
  }

  finalizeMatch(match) {
    const id = String(match.id || '');
    if (!id) throw new Error('match id is required');

    const existing = this.data.matches[id];
    if (existing?.status === 'complete') return this.getMatch(id);

    const participants = match.participants.map(p => ({
      slot: p.slot,
      playerId: p.playerId || '',
      publicId: p.publicId || '',
      name: safeName(p.name),
      side: safeSide(p.side),
      hand: safeSkin(p.hand, HAND_IDS, 'hand'),
      digit: safeSkin(p.digit, DIGIT_IDS, 'classic'),
      bot: Boolean(p.bot),
    }));
    const scores = { ...match.scores };
    const slots = participants.map(p => p.slot);
    const first = slots[0];
    const second = slots[1];
    const firstScore = Number(scores[first] || 0);
    const secondScore = Number(scores[second] || 0);
    const winnerSlot = firstScore === secondScore ? null : (firstScore > secondScore ? first : second);

    const record = {
      id,
      status: 'complete',
      bot: participants.some(p => p.bot),
      createdAt: Number(match.createdAt || Date.now()),
      startsAt: Number(match.startsAt || 0),
      endsAt: Number(match.endsAt || 0),
      completedAt: Date.now(),
      participants,
      scores,
      winnerSlot,
    };
    this.data.matches[id] = record;

    for (const p of participants) {
      if (p.bot || !p.playerId) continue;
      const player = this.getOrCreatePlayer(p.playerId, p);
      const score = Number(scores[p.slot] || 0);
      const won = winnerSlot === p.slot;
      const tie = winnerSlot == null;
      player.side = p.side;
      player.hand = p.hand;
      player.digit = p.digit;
      player.stats = cloneStats(player.stats);
      if (won) {
        player.stats.wins += 1;
        player.stats.currentStreak = player.stats.streakType === 'win' ? player.stats.currentStreak + 1 : 1;
        player.stats.streakType = 'win';
      } else if (tie) {
        player.stats.ties += 1;
        player.stats.currentStreak = 0;
        player.stats.streakType = 'tie';
      } else {
        player.stats.losses += 1;
        player.stats.currentStreak = player.stats.streakType === 'lose' ? player.stats.currentStreak + 1 : 1;
        player.stats.streakType = 'lose';
      }
      player.stats.totalTaps += score;
      player.stats.best = Math.max(player.stats.best, score);
      const reward = won ? Math.floor(50 + score * 0.8) : (tie ? 20 : 10);
      player.coins = Math.max(0, Number(player.coins || 0)) + reward;
      player.weeklyScore = Math.max(0, Number(player.weeklyScore || 0)) + score + (won ? 50 : tie ? 10 : 0) + (score === 67 ? 67 : 0);
      player.updatedAt = Date.now();

      if (p.side === 7) this.data.globalWar.seven += score + (won ? 20 : 0);
      else this.data.globalWar.six += score + (won ? 20 : 0);
    }

    this.persist();
    return this.getMatch(id);
  }

  getMatch(matchId) {
    const record = this.data.matches[String(matchId || '')];
    if (!record) return null;
    return {
      ...record,
      participants: record.participants.map(participant => this.serializeParticipant(participant)),
      playerStates: record.participants
        .filter(p => !p.bot && p.playerId)
        .reduce((acc, p) => {
          const player = this.data.players[p.playerId];
          acc[p.slot] = player ? this.serializePlayer(player) : null;
          return acc;
        }, {}),
    };
  }

  getTopPlayers(limit = 100) {
    return Object.values(this.data.players)
      .map(p => this.serializePlayer(p))
      .map(p => ({
        id: p.publicId,
        publicId: p.publicId,
        name: p.name,
        side: safeSide(p.side),
        score: Math.max(0, Number(p.weeklyScore || 0)),
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
      .slice(0, limit)
      .map((p, index) => ({ ...p, rank: index + 1 }));
  }

  getGlobalWar() {
    const six = Math.max(0, Number(this.data.globalWar?.six || 0));
    const seven = Math.max(0, Number(this.data.globalWar?.seven || 0));
    return { six, seven };
  }
}
