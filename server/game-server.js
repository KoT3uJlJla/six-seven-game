import crypto from 'node:crypto';
import { GAME_CONFIG, RIVAL_NAMES, HAND_IDS, DIGIT_IDS } from './config.js';

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function now() { return Date.now(); }
function safeSide(side) { return Number(side) === 7 ? 7 : 6; }
function oppositeSide(side) { return safeSide(side) === 6 ? 7 : 6; }
function clampInt(value, min, max) { return Math.max(min, Math.min(max, Math.floor(Number(value) || 0))); }
function pick(list) { return list[Math.floor(Math.random() * list.length)] || list[0]; }
function safeSkin(value, list, fallback) { return list.includes(String(value || '')) ? String(value) : fallback; }
function safeName(name) { return String(name || 'Alpha67').replace(/[<>]/g, '').trim().slice(0, 24) || 'Alpha67'; }

function serializeParticipant(participant) {
  return {
    slot: participant.slot,
    playerId: participant.bot ? '' : participant.playerId,
    name: participant.name,
    side: participant.side,
    hand: participant.hand,
    digit: participant.digit,
    bot: Boolean(participant.bot),
  };
}

export class GameServer {
  constructor(db, config = GAME_CONFIG) {
    this.db = db;
    this.config = config;
    this.connections = new Map();
    this.queueTickets = new Map();
    this.matches = new Map();
  }

  attach(peer, req) {
    const connectionId = id('conn');
    const connection = {
      id: connectionId,
      peer,
      req,
      playerId: '',
      name: 'Alpha67',
      side: 6,
      hand: 'hand',
      digit: 'classic',
      queueTicketId: '',
      matchId: '',
      connectedAt: now(),
      lastSeenAt: now(),
    };
    this.connections.set(connectionId, connection);

    peer.sendJson({ type: 'hello_required', connectionId, serverTs: now(), config: this.publicConfig() });
    peer.on('message', message => this.handleMessage(connection, message));
    peer.on('close', () => this.detach(connectionId));
    peer.on('error', () => this.detach(connectionId));
  }

  publicConfig() {
    return {
      matchmakingMs: this.config.matchmakingMs,
      roundMs: this.config.roundMs,
      startDelayMs: this.config.startDelayMs,
      scoreBroadcastMs: this.config.scoreBroadcastMs,
    };
  }

  handleMessage(connection, message = {}) {
    connection.lastSeenAt = now();
    switch (message.type) {
      case 'hello': return this.handleHello(connection, message);
      case 'queue': return this.enterQueue(connection, message);
      case 'cancel_queue': return this.cancelQueue(connection, 'client_cancel');
      case 'tap': return this.handleTap(connection, message);
      case 'get_top': return this.sendTop(connection);
      case 'ping': return connection.peer.sendJson({ type: 'pong', serverTs: now(), clientTs: message.clientTs || 0 });
      default:
        return connection.peer.sendJson({ type: 'error', code: 'UNKNOWN_MESSAGE', message: `Unknown message type: ${message.type || 'empty'}`, serverTs: now() });
    }
  }

  handleHello(connection, message) {
    const fallbackId = `guest_${crypto.createHash('sha1').update(connection.id).digest('hex').slice(0, 12)}`;
    connection.playerId = String(message.playerId || fallbackId).replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 64) || fallbackId;
    connection.name = safeName(message.name);
    connection.side = safeSide(message.side);
    connection.hand = safeSkin(message.hand, HAND_IDS, 'hand');
    connection.digit = safeSkin(message.digit, DIGIT_IDS, 'classic');
    const player = this.db.updatePlayerProfile(connection.playerId, { name: connection.name, side: connection.side });
    connection.peer.sendJson({
      type: 'player_state',
      connectionId: connection.id,
      player,
      top: this.db.getTopPlayers(100),
      globalWar: this.db.getGlobalWar(),
      serverTs: now(),
      config: this.publicConfig(),
    });
  }

  enterQueue(connection, message) {
    if (!connection.playerId) this.handleHello(connection, message);
    this.cancelQueue(connection, 'replace_ticket', { silent: true });
    connection.side = safeSide(message.side ?? connection.side);
    connection.name = safeName(message.name ?? connection.name);
    connection.hand = safeSkin(message.hand ?? connection.hand, HAND_IDS, 'hand');
    connection.digit = safeSkin(message.digit ?? connection.digit, DIGIT_IDS, 'classic');
    this.db.updatePlayerProfile(connection.playerId, { name: connection.name, side: connection.side });

    const ticket = {
      id: id('queue'),
      ownerConnectionId: connection.id,
      pairedConnectionId: '',
      side: connection.side,
      createdAt: now(),
      searchEndsAt: now() + this.config.matchmakingMs,
      timeout: null,
    };

    const openTicket = this.findOpenOppositeTicket(connection.side);
    if (openTicket) {
      openTicket.pairedConnectionId = connection.id;
      connection.queueTicketId = openTicket.id;
      this.sendQueueState(openTicket, 'opponent_found');
      return;
    }

    ticket.timeout = setTimeout(() => this.resolveTicket(ticket.id), this.config.matchmakingMs);
    this.queueTickets.set(ticket.id, ticket);
    connection.queueTicketId = ticket.id;
    this.sendQueueState(ticket, 'searching');
  }

  findOpenOppositeTicket(side) {
    const opposite = oppositeSide(side);
    const tickets = Array.from(this.queueTickets.values())
      .filter(t => t.side === opposite && !t.pairedConnectionId && this.connections.has(t.ownerConnectionId))
      .sort((a, b) => a.createdAt - b.createdAt);
    return tickets[0] || null;
  }

  sendQueueState(ticket, status) {
    const owner = this.connections.get(ticket.ownerConnectionId);
    const paired = this.connections.get(ticket.pairedConnectionId);
    const payload = {
      type: 'queue_state',
      ticketId: ticket.id,
      status,
      searchStartedAt: ticket.createdAt,
      searchEndsAt: ticket.searchEndsAt,
      serverTs: now(),
      opponentFound: Boolean(paired),
    };
    owner?.peer.sendJson({ ...payload, yourSide: owner.side, opponentSide: paired?.side || oppositeSide(owner.side) });
    paired?.peer.sendJson({ ...payload, yourSide: paired.side, opponentSide: owner?.side || oppositeSide(paired.side) });
  }

  cancelQueue(connection, reason = 'cancelled', options = {}) {
    if (!connection.queueTicketId) return;
    const ticket = this.queueTickets.get(connection.queueTicketId);
    connection.queueTicketId = '';
    if (!ticket) return;

    const owner = this.connections.get(ticket.ownerConnectionId);
    const paired = this.connections.get(ticket.pairedConnectionId);

    if (connection.id === ticket.ownerConnectionId) {
      clearTimeout(ticket.timeout);
      this.queueTickets.delete(ticket.id);
      if (!options.silent) owner?.peer.sendJson({ type: 'queue_cancelled', reason, serverTs: now() });
      if (paired) {
        paired.queueTicketId = '';
        paired.peer.sendJson({ type: 'queue_cancelled', reason: 'opponent_cancelled', serverTs: now() });
      }
      return;
    }

    if (connection.id === ticket.pairedConnectionId) {
      ticket.pairedConnectionId = '';
      if (!options.silent) paired?.peer.sendJson({ type: 'queue_cancelled', reason, serverTs: now() });
      this.sendQueueState(ticket, 'searching');
    }
  }

  resolveTicket(ticketId) {
    const ticket = this.queueTickets.get(ticketId);
    if (!ticket) return;
    clearTimeout(ticket.timeout);
    this.queueTickets.delete(ticket.id);

    const owner = this.connections.get(ticket.ownerConnectionId);
    if (!owner) return;
    owner.queueTicketId = '';

    const paired = this.connections.get(ticket.pairedConnectionId);
    if (paired) {
      paired.queueTicketId = '';
      this.createMatch([this.makeHumanParticipant(owner, 'p1'), this.makeHumanParticipant(paired, 'p2')], false);
    } else {
      this.createMatch([this.makeHumanParticipant(owner, 'p1'), this.makeBotParticipant(oppositeSide(owner.side), 'p2')], true);
    }
  }

  makeHumanParticipant(connection, slot) {
    connection.matchId = '';
    return {
      slot,
      connId: connection.id,
      playerId: connection.playerId,
      name: connection.name,
      side: safeSide(connection.side),
      hand: safeSkin(connection.hand, HAND_IDS, 'hand'),
      digit: safeSkin(connection.digit, DIGIT_IDS, 'classic'),
      bot: false,
      lastSeq: -1,
      recentTaps: [],
    };
  }

  makeBotParticipant(side, slot) {
    return {
      slot,
      connId: '',
      playerId: '',
      name: pick(RIVAL_NAMES),
      side: safeSide(side),
      hand: pick(HAND_IDS),
      digit: pick(DIGIT_IDS),
      bot: true,
      lastSeq: -1,
      recentTaps: [],
    };
  }

  createMatch(participants, bot) {
    const createdAt = now();
    const match = {
      id: id('match'),
      createdAt,
      startsAt: createdAt + this.config.startDelayMs,
      endsAt: createdAt + this.config.startDelayMs + this.config.roundMs,
      participants,
      bot: Boolean(bot),
      status: 'scheduled',
      scores: Object.fromEntries(participants.map(p => [p.slot, 0])),
      dirty: true,
      startTimeout: null,
      endTimeout: null,
      broadcastInterval: null,
      botTimeout: null,
      finalized: false,
    };
    this.matches.set(match.id, match);

    for (const participant of participants) {
      if (participant.bot) continue;
      const conn = this.connections.get(participant.connId);
      if (conn) conn.matchId = match.id;
    }

    this.sendMatchStart(match);
    match.startTimeout = setTimeout(() => {
      match.status = 'running';
      this.broadcastMatch(match, { type: 'match_live', matchId: match.id, serverTs: now() });
    }, Math.max(0, match.startsAt - now()));
    match.endTimeout = setTimeout(() => this.finalizeMatch(match.id), Math.max(0, match.endsAt - now() + 12));
    match.broadcastInterval = setInterval(() => this.flushScores(match.id), this.config.scoreBroadcastMs);
    if (bot) this.scheduleBotTap(match.id);
  }

  sendMatchStart(match) {
    const common = {
      type: 'match_start',
      matchId: match.id,
      bot: match.bot,
      createdAt: match.createdAt,
      startsAt: match.startsAt,
      endsAt: match.endsAt,
      roundMs: this.config.roundMs,
      serverTs: now(),
      participants: match.participants.map(serializeParticipant),
      scores: match.scores,
    };
    for (const participant of match.participants) {
      if (participant.bot) continue;
      const conn = this.connections.get(participant.connId);
      conn?.peer.sendJson({ ...common, yourSlot: participant.slot });
    }
  }

  broadcastMatch(match, payload) {
    for (const participant of match.participants) {
      if (participant.bot) continue;
      this.connections.get(participant.connId)?.peer.sendJson(payload);
    }
  }

  flushScores(matchId, force = false) {
    const match = this.matches.get(matchId);
    if (!match || match.finalized) return;
    if (!force && !match.dirty) return;
    match.dirty = false;
    this.broadcastMatch(match, {
      type: 'score_update',
      matchId: match.id,
      scores: match.scores,
      serverTs: now(),
    });
  }

  handleTap(connection, message) {
    const match = this.matches.get(String(message.matchId || connection.matchId || ''));
    if (!match || match.finalized) return;
    const participant = match.participants.find(p => p.connId === connection.id && !p.bot);
    if (!participant) return;
    const ts = now();
    if (ts < match.startsAt || ts >= match.endsAt) {
      connection.peer.sendJson({ type: 'tap_rejected', reason: 'outside_round', matchId: match.id, serverTs: ts });
      return;
    }

    const seq = clampInt(message.seq, 0, Number.MAX_SAFE_INTEGER);
    if (seq <= participant.lastSeq) return;
    participant.lastSeq = seq;

    participant.recentTaps = participant.recentTaps.filter(t => ts - t < 1000);
    if (participant.recentTaps.length >= this.config.maxTapRatePerSecond) {
      connection.peer.sendJson({ type: 'tap_rejected', reason: 'rate_limit', matchId: match.id, serverTs: ts });
      return;
    }
    participant.recentTaps.push(ts);

    match.scores[participant.slot] = Number(match.scores[participant.slot] || 0) + 1;
    match.dirty = true;
    if (match.scores[participant.slot] === 67) {
      this.broadcastMatch(match, { type: 'jackpot', matchId: match.id, slot: participant.slot, score: 67, serverTs: ts });
    }
  }

  scheduleBotTap(matchId) {
    const match = this.matches.get(matchId);
    if (!match || match.finalized) return;
    const bot = match.participants.find(p => p.bot);
    if (!bot) return;
    const ts = now();
    const waitForStart = Math.max(0, match.startsAt - ts);
    const remaining = Math.max(0, match.endsAt - ts);
    if (remaining <= 0) return;

    const finalRush = remaining < 1800;
    const base = this.config.botMinDelayMs + Math.random() * (this.config.botMaxDelayMs - this.config.botMinDelayMs);
    const delay = Math.max(42, base * (finalRush ? this.config.botFinalRushMultiplier : 1));
    const timeout = waitForStart > 0 ? waitForStart + delay : delay;
    match.botTimeout = setTimeout(() => {
      const liveNow = now();
      if (!this.matches.has(matchId) || match.finalized || liveNow < match.startsAt || liveNow >= match.endsAt) return;
      const burst = Math.random() < (finalRush ? 0.18 : 0.08) ? 2 : 1;
      match.scores[bot.slot] = Number(match.scores[bot.slot] || 0) + burst;
      if (match.scores[bot.slot] >= 67 && match.scores[bot.slot] - burst < 67) {
        this.broadcastMatch(match, { type: 'jackpot', matchId: match.id, slot: bot.slot, score: 67, serverTs: liveNow });
      }
      match.dirty = true;
      this.scheduleBotTap(matchId);
    }, timeout);
  }

  finalizeMatch(matchId) {
    const match = this.matches.get(matchId);
    if (!match || match.finalized) return;
    match.finalized = true;
    match.status = 'complete';
    clearTimeout(match.startTimeout);
    clearTimeout(match.endTimeout);
    clearTimeout(match.botTimeout);
    clearInterval(match.broadcastInterval);
    this.flushScores(match.id, true);

    const record = this.db.finalizeMatch(match);
    const winnerSlot = record?.winnerSlot ?? null;
    for (const participant of match.participants) {
      if (participant.bot) continue;
      const conn = this.connections.get(participant.connId);
      if (!conn) continue;
      conn.matchId = '';
      conn.peer.sendJson({
        type: 'match_result',
        matchId: match.id,
        scores: record.scores,
        winnerSlot,
        yourSlot: participant.slot,
        participants: record.participants,
        player: record.playerStates?.[participant.slot] || null,
        match: record,
        top: this.db.getTopPlayers(100),
        globalWar: this.db.getGlobalWar(),
        serverTs: now(),
      });
    }

    setTimeout(() => this.matches.delete(match.id), 30000);
  }

  sendTop(connection) {
    connection.peer.sendJson({ type: 'top_state', top: this.db.getTopPlayers(100), globalWar: this.db.getGlobalWar(), serverTs: now() });
  }

  detach(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    this.cancelQueue(connection, 'disconnect', { silent: true });
    this.connections.delete(connectionId);
  }
}
