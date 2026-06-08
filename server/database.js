import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_STATS = Object.freeze({
  wins: 0,
  losses: 0,
  ties: 0,
  best: 0,
  totalTaps: 0,
  currentStreak: 0,
  streakType: 'none',
});

function cloneStats(value = {}) {
  return { ...DEFAULT_STATS, ...(value || {}) };
}

function safeName(name) {
  const clean = String(name || 'Alpha67').replace(/[<>]/g, '').trim().slice(0, 24);
  return clean || 'Alpha67';
}

function safeSide(side) {
  return Number(side) === 7 ? 7 : 6;
}

function createEmptyDb() {
  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    players: {},
    matches: {},
    globalWar: { six: 0, seven: 0 },
  };
}

export class GameDatabase {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
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
        players: parsed.players || {},
        matches: parsed.matches || {},
        globalWar: { six: 0, seven: 0, ...(parsed.globalWar || {}) },
      };
    } catch (error) {
      const backup = `${this.filePath}.broken-${Date.now()}`;
      try {
        if (fs.existsSync(this.filePath)) fs.renameSync(this.filePath, backup);
      } catch {}
      this.data = createEmptyDb();
      this.persist();
    }
  }

  persist() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.data.updatedAt = Date.now();
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.filePath);
  }

  getOrCreatePlayer(playerId, profile = {}) {
    const id = String(playerId || '').trim();
    if (!id) throw new Error('playerId is required');
    if (!this.data.players[id]) {
      this.data.players[id] = {
        id,
        name: safeName(profile.name),
        side: safeSide(profile.side),
        coins: 250,
        stats: cloneStats(),
        weeklyScore: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.persist();
    } else {
      const player = this.data.players[id];
      player.name = safeName(profile.name || player.name);
      player.side = safeSide(profile.side || player.side);
      player.stats = cloneStats(player.stats);
      player.updatedAt = Date.now();
      this.persist();
    }
    return this.data.players[id];
  }

  updatePlayerProfile(playerId, profile = {}) {
    const player = this.getOrCreatePlayer(playerId, profile);
    if (profile.name != null) player.name = safeName(profile.name);
    if (profile.side != null) player.side = safeSide(profile.side);
    player.updatedAt = Date.now();
    this.persist();
    return player;
  }

  finalizeMatch(match) {
    const id = String(match.id || '');
    if (!id) throw new Error('match id is required');

    const existing = this.data.matches[id];
    if (existing?.status === 'complete') return this.getMatch(id);

    const participants = match.participants.map(p => ({
      slot: p.slot,
      playerId: p.playerId || '',
      name: safeName(p.name),
      side: safeSide(p.side),
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
      playerStates: record.participants
        .filter(p => !p.bot && p.playerId)
        .reduce((acc, p) => {
          acc[p.slot] = this.data.players[p.playerId] || null;
          return acc;
        }, {}),
    };
  }

  getTopPlayers(limit = 100) {
    return Object.values(this.data.players)
      .map(p => ({
        id: p.id,
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
