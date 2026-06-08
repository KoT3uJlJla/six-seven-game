import {
  CONFIG,
  DEFAULT_GUILD,
  DEFAULT_STATS,
  DIGIT_CATALOG,
  HAND_CATALOG,
  LEGACY_STORE_KEYS,
  PLAYER_ID_KEY,
  RIVAL_NAMES,
  SESSION_PLAYER_ID_KEY,
  STORE_KEY,
  clamp,
  getDigitImage,
  getHandImage,
  isKnownDigit,
  isKnownHand,
  oppositeSide,
  pick,
  randomBetween,
  sideOf,
} from './config.js';
import { animateElement, applyImageFallback, byId, escapeHtml, query, queryAll, setImage, setText, showToast } from './dom.js';
import { applyTranslations, detectClientLang, text } from './i18n.js';
import { RealtimeClient } from './realtime.js';
import { haptic, initTelegram, telegramInitData, telegramName, telegramStartParam, tg } from './telegram.js';

const RESULT_HOME_COOLDOWN_MS = 3000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultState() {
  return {
    name: telegramName(),
    coins: 250,
    side: 6,
    hand: 'hand',
    digitStyle: 'classic',
    ownedHands: ['hand'],
    ownedDigits: ['classic'],
    stats: clone(DEFAULT_STATS),
    weeklyScore: 0,
    referrals: { code: '', sent: 0, accepted: 0, referredBy: '', firstTouchClaimed: false },
    guild: clone(DEFAULT_GUILD),
    lang: detectClientLang(),
  };
}

function sanitizeState(value) {
  const fallback = defaultState();
  const state = {
    ...fallback,
    ...(value || {}),
    stats: { ...fallback.stats, ...(value?.stats || {}) },
    referrals: { ...fallback.referrals, ...(value?.referrals || {}) },
    guild: { ...fallback.guild, ...(value?.guild || {}) },
  };
  state.side = sideOf(state.side);
  state.hand = isKnownHand(state.hand) ? state.hand : 'hand';
  state.digitStyle = isKnownDigit(state.digitStyle) ? state.digitStyle : 'classic';
  state.ownedHands = Array.from(new Set(['hand', ...(Array.isArray(state.ownedHands) ? state.ownedHands : [])])).filter(isKnownHand);
  state.ownedDigits = Array.from(new Set(['classic', ...(Array.isArray(state.ownedDigits) ? state.ownedDigits : [])])).filter(isKnownDigit);
  state.name = String(state.name || telegramName()).replace(/[<>]/g, '').trim().slice(0, 24) || 'Alpha67';
  state.lang = detectClientLang();
  return state;
}

function loadState() {
  const keys = [STORE_KEY, ...LEGACY_STORE_KEYS];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return sanitizeState(JSON.parse(raw));
    } catch {
      // Keep looking for a readable state version.
    }
  }
  return sanitizeState(defaultState());
}

function getPlayerId() {
  try {
    let sessionId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY);
    if (!sessionId) {
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);
      sessionId = `local:${Array.from(values).join('-')}`;
      sessionStorage.setItem(SESSION_PLAYER_ID_KEY, sessionId);
    }
    return sessionId;
  } catch {
    let localId = localStorage.getItem(PLAYER_ID_KEY);
    if (!localId) {
      localId = `local:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(PLAYER_ID_KEY, localId);
    }
    return localId;
  }
}

function isLowPowerDevice() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
    || matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function bootGame() {
  initTelegram();

  const PLAYER_ID = getPlayerId();
  const lowPower = isLowPowerDevice();
  if (lowPower) document.body.classList.add('low-power');

  let state = loadState();
  saveState();

  const tr = (key, ...args) => text(state.lang, key, ...args);
  const NET = new RealtimeClient({
    buildHello: () => ({
      type: 'hello',
      initData: telegramInitData(),
      devPlayerId: PLAYER_ID,
      name: state.name,
      side: state.side,
      hand: state.hand,
      digit: state.digitStyle,
    }),
    shouldSendQueued: payload => {
      if (payload.type !== 'queue' && payload.type !== 'cancel_queue') return true;
      return MATCHING.active && !MATCHING.cancelled;
    },
  });

  const BATTLE = {
    matchId: '',
    yourSlot: '',
    mySlot: '',
    enemySlot: '',
    participants: [],
    scores: {},
    startsAt: 0,
    endsAt: 0,
    running: false,
    acceptingTaps: false,
    tapSeq: 0,
    lastTimerText: '',
    raf: 0,
    resultReceived: false,
    jackpotSlots: new Set(),
    localBot: false,
    localBotTimer: 0,
  };

  const MATCHING = {
    active: false,
    cancelled: false,
    serverSearch: false,
    opponentFound: false,
    searchEndsAt: 0,
    lastText: '',
    fallbackArmed: false,
  };

  let TOP = [];
  let topRequestId = 0;
  let topLoading = false;
  let TOP_TAB = 'players';
  let GLOBAL_WAR = { six: 521000, seven: 478000 };
  let SHOP_TAB = 'hands';
  let heroOtherHandId = 'clown';
  let matchingTimer = 0;
  let matchingRaf = 0;
  let lastTouchEnd = 0;
  let resultHomeCooldownTimer = 0;
  let MY_PUBLIC_ID = '';
  let lastHapticAt = 0;

  const allowDevMocks = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname)
    || new URLSearchParams(location.search).has('devMocks');

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  }

  function authHeaders(hasJson = false) {
    const headers = {};
    const initData = telegramInitData();
    if (initData) headers['X-Telegram-Init-Data'] = initData;
    else headers['X-Six-Seven-Dev-Player'] = PLAYER_ID;
    if (hasJson) headers['Content-Type'] = 'application/json';
    return headers;
  }

  async function apiFetch(path, options = {}) {
    const body = options.body == null ? null : JSON.stringify(options.body);
    const response = await fetch(NET.resolveHttpUrl(path), {
      method: options.method || (body ? 'POST' : 'GET'),
      cache: 'no-store',
      headers: authHeaders(Boolean(body)),
      body,
    });
    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || `http_${response.status}`);
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function show(screen) {
    ['home', 'matching', 'battle', 'result', 'shop', 'top', 'profile'].forEach(name => {
      const el = query(`[data-screen="${name}"]`);
      if (el) el.hidden = name !== screen;
    });
    document.body.classList.toggle('is-immersive', ['matching', 'battle', 'result'].includes(screen));
    document.body.classList.toggle('battle-lean', screen === 'battle');
    queryAll('.nav-item').forEach(btn => btn.classList.remove('is-active'));
    query(`.nav-item[data-nav="${screen}"]`)?.classList.add('is-active');

    if (screen === 'home') renderHome();
    if (screen === 'top') renderTop();
    if (screen === 'shop') renderShop();
    if (screen === 'profile') renderProfile();
  }

  function applyDesktopGuard() {
    const guard = byId('desktop-guard');
    const app = byId('app');
    if (!guard || !app) return false;

    const local = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname);
    const platform = String(tg?.platform || '').toLowerCase();
    const desktopTelegram = ['tdesktop', 'macos', 'windows', 'linux', 'web', 'weba'].includes(platform);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
    const blocked = !local && (desktopTelegram || !mobile);

    document.body.classList.toggle('is-desktop-blocked', blocked);
    guard.hidden = !blocked;
    app.setAttribute('aria-hidden', blocked ? 'true' : 'false');
    return blocked;
  }

  function renderAllStatic() {
    applyTranslations(state.lang);
    syncSideChoice();
    syncTopBar();
    syncHeroHands();
    syncHeroDigits();
    renderReferralCard();
    renderGuildCard();
    renderGlobalWar();
    queryAll('img').forEach(img => applyImageFallback(img));
  }

  function syncTopBar() {
    setText('user-name', state.name);
    setText('user-rank', rankLabel(state.stats.wins));
    setText('user-level', `L${Math.max(1, Math.floor((state.stats.wins || 0) / 3) + 1)}`);
    setText('user-coins', Number(state.coins || 0).toLocaleString('ru-RU'));
    setText('shop-coins', Number(state.coins || 0).toLocaleString('ru-RU'));
  }

  function rankLabel(wins) {
    if (wins >= 60) return state.lang === 'ru' ? 'ЛЕГЕНДА' : 'LEGEND';
    if (wins >= 25) return state.lang === 'ru' ? 'ЧЕМПИОН' : 'CHAMPION';
    if (wins >= 10) return state.lang === 'ru' ? 'ПРЕТЕНДЕНТ' : 'CONTENDER';
    if (wins >= 3) return state.lang === 'ru' ? 'УЛИЧНЫЙ БОЕЦ' : 'STREET FIGHTER';
    return state.lang === 'ru' ? 'НОВОБРАНЕЦ' : 'RECRUIT';
  }

  function syncSideChoice() {
    const side = sideOf(state.side);
    queryAll('.side-btn').forEach(btn => {
      const selected = sideOf(btn.dataset.side) === side;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const cta = byId('home-battle-cta');
    if (cta) cta.dataset.side = String(side);
    setText('home-battle-side', side);
    document.body.classList.toggle('is-side-7', side === 7);
  }

  function setSide(side, notify = false) {
    state.side = sideOf(side);
    saveState();
    syncSideChoice();
    syncHeroHands();
    renderReferralCard();
    NET.sendHello();
    if (notify) showToast(`${tr('side')} ${state.side}`);
  }

  function syncHeroHands() {
    const left = byId('hero-hand-left');
    const right = byId('hero-hand-right');
    if (!left || !right) return;
    if (heroOtherHandId === state.hand) heroOtherHandId = HAND_CATALOG.find(item => item.id !== state.hand)?.id || 'hand';
    const mine = getHandImage(state.hand);
    const other = getHandImage(heroOtherHandId);
    if (state.side === 6) {
      applyImageFallback(left, mine);
      applyImageFallback(right, other);
      left.dataset.owner = 'me';
      right.dataset.owner = 'other';
    } else {
      applyImageFallback(left, other);
      applyImageFallback(right, mine);
      left.dataset.owner = 'other';
      right.dataset.owner = 'me';
    }
  }

  function syncHeroDigits() {
    setImage('hero-digit-6', getDigitImage(state.digitStyle, 6));
    setImage('hero-digit-7', getDigitImage(state.digitStyle, 7));
  }

  function renderHome() {
    renderReferralCard();
    renderGuildCard();
    renderGlobalWar();
  }

  function renderReferralCard() {
    const count = Number(state.referrals.accepted || state.referrals.sent || 0);
    setText('ref-count', count.toLocaleString('ru-RU'));
    setText('ref-title', count >= 67 ? 'RAID CAPTAIN' : count >= 6 ? 'GANG STARTER' : count >= 1 ? 'SCOUT' : tr('noCrowd'));
    setText('ref-meta', count >= 67 ? tr('maxAura') : tr('refsToNext', Math.max(1, (count < 1 ? 1 : count < 6 ? 6 : 67) - count)));
    const progress = byId('ref-progress');
    if (progress) progress.style.width = `${clamp((count / 67) * 100, 4, 100)}%`;

    const tiers = byId('ref-tiers');
    if (tiers && !tiers.childElementCount) {
      [1, 6, 67, 670, 6700].forEach(value => {
        const chip = document.createElement('span');
        chip.className = 'ref-tier';
        chip.textContent = value >= 1000 ? `${value / 1000}K` : String(value);
        tiers.appendChild(chip);
      });
    }
    if (tiers) {
      queryAll('#ref-tiers .ref-tier').forEach((chip, index) => {
        chip.classList.toggle('is-done', count >= [1, 6, 67, 670, 6700][index]);
      });
    }
  }

  function renderGuildCard() {
    const hasGuild = Boolean(state.guild.id);
    const card = byId('guild-card');
    if (card) card.dataset.state = hasGuild ? 'joined' : 'empty';
    setText('guild-title', hasGuild ? state.guild.name : tr('noGuild'));
    setText('guild-badge', hasGuild ? state.guild.tag : 'G');
    setText('guild-meta', hasGuild ? `${state.guild.tag} · ${state.guild.members || 1} · ${state.guild.side} GANG` : tr('guildEmptyMeta'));
    setText('guild-score', Number(state.guild.score || 0).toLocaleString('ru-RU'));
    setText('guild-members', Number(state.guild.members || 0).toLocaleString('ru-RU'));
    setText('guild-reward', hasGuild ? '67' : '0');
    setText('guild-reward-line', hasGuild ? tr('weeklyRewardJoined') : tr('weeklyRewardEmpty'));
    byId('guild-create')?.toggleAttribute('hidden', hasGuild || !allowDevMocks);
    byId('guild-invite')?.toggleAttribute('hidden', !hasGuild);
    byId('guild-random')?.toggleAttribute('hidden', hasGuild || !allowDevMocks);
    byId('guild-leave')?.toggleAttribute('hidden', !hasGuild);
  }

  function renderGlobalWar() {
    const six = Math.max(1, Number(GLOBAL_WAR.six || 0));
    const seven = Math.max(1, Number(GLOBAL_WAR.seven || 0));
    const total = six + seven;
    const sixPercent = (six / total) * 100;
    const sevenPercent = 100 - sixPercent;
    const sixBar = byId('war-six');
    const sevenBar = byId('war-seven');
    if (sixBar) sixBar.style.width = `${sixPercent.toFixed(1)}%`;
    if (sevenBar) sevenBar.style.width = `${sevenPercent.toFixed(1)}%`;
    setText('war-six-pct', `${sixPercent.toFixed(1)}%`);
    setText('war-seven-pct', `${sevenPercent.toFixed(1)}%`);
    setText('war-participation', total.toLocaleString('en-US'));
  }

  function showHomeTapDigit(event) {
    const home = query('[data-screen="home"]');
    if (!home || home.hidden) return;
    if (event.target.closest('button, a, input, textarea, select, .shop-card, .top-row')) return;
    const el = document.createElement('div');
    el.className = 'home-tap-digit';
    el.dataset.team = String(state.side);
    el.textContent = Math.random() < 0.5 ? '6' : '7';
    el.style.left = `${event.clientX}px`;
    el.style.top = `${event.clientY}px`;
    el.style.setProperty('--dx', `${randomBetween(-28, 28).toFixed(1)}px`);
    el.style.setProperty('--dy', `${randomBetween(-24, 16).toFixed(1)}px`);
    el.style.setProperty('--rot', `${randomBetween(-18, 18).toFixed(1)}deg`);
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 760);
  }

  function startMatchmaking() {
    clearMatchingTimers();
    clearLocalBotTimer();
    NET.dropQueued(['queue', 'cancel_queue']);
    MATCHING.active = true;
    MATCHING.cancelled = false;
    MATCHING.serverSearch = false;
    MATCHING.opponentFound = false;
    MATCHING.searchEndsAt = Date.now() + CONFIG.matchmakingMs;
    MATCHING.lastText = '';
    MATCHING.fallbackArmed = false;

    show('matching');
    setImage('matching-side', getDigitImage(state.digitStyle, state.side));
    const sideEl = byId('matching-side');
    if (sideEl) sideEl.dataset.side = String(state.side);
    renderMatchingCountdown(MATCHING.searchEndsAt, false, { server: false });
    NET.connect();
    NET.send({ type: 'queue', side: state.side, name: state.name, hand: state.hand, digit: state.digitStyle }, { queueIfClosed: true });
    haptic.medium();
  }

  function clearMatchingTimers() {
    window.clearTimeout(matchingTimer);
    window.cancelAnimationFrame(matchingRaf);
    matchingTimer = 0;
    matchingRaf = 0;
  }

  function renderMatchingCountdown(searchEndsAt, opponentFound, options = {}) {
    clearMatchingTimers();
    MATCHING.serverSearch = Boolean(options.server);
    MATCHING.opponentFound = Boolean(opponentFound);
    MATCHING.searchEndsAt = Number(searchEndsAt) || MATCHING.searchEndsAt || Date.now() + CONFIG.matchmakingMs;
    const status = byId('matching-status');

    const tick = () => {
      if (!MATCHING.active || MATCHING.cancelled) return;
      const clockNow = MATCHING.serverSearch ? NET.serverNow() : Date.now();
      const remain = Math.max(0, MATCHING.searchEndsAt - clockNow);
      const nextText = MATCHING.opponentFound ? tr('found') : `${(remain / 1000).toFixed(1)}s`;
      if (status && MATCHING.lastText !== nextText) {
        status.textContent = nextText;
        MATCHING.lastText = nextText;
      }

      if (remain > 0) {
        matchingTimer = window.setTimeout(tick, 100);
      } else if (!MATCHING.opponentFound && !MATCHING.fallbackArmed) {
        MATCHING.fallbackArmed = true;
        if (status) status.textContent = tr('bot');
        const grace = NET.connected ? CONFIG.matchFallbackGraceMs : 0;
        matchingTimer = window.setTimeout(startBotFallback, grace);
      }
    };

    tick();
  }

  function startBotFallback() {
    if (!MATCHING.active || MATCHING.cancelled || BATTLE.running) return;
    MATCHING.active = false;
    clearMatchingTimers();
    NET.dropQueued(['queue', 'cancel_queue']);
    NET.send({ type: 'cancel_queue' }, { queueIfClosed: false });

    const createdAt = Date.now();
    const startsAt = createdAt + CONFIG.startDelayMs;
    const botSide = oppositeSide(state.side);
    beginBattle({
      matchId: `local_bot_${createdAt.toString(36)}`,
      yourSlot: 'p1',
      startsAt,
      endsAt: startsAt + CONFIG.roundMs,
      bot: true,
      localBot: true,
      scores: { p1: 0, p2: 0 },
      participants: [
        { slot: 'p1', id: MY_PUBLIC_ID || '', name: state.name, side: state.side, hand: state.hand, digit: state.digitStyle },
        { slot: 'p2', id: '', name: pick(RIVAL_NAMES), side: botSide, hand: pick(HAND_CATALOG).id, digit: pick(DIGIT_CATALOG).id, bot: true },
      ],
    });
  }

  function cancelMatchmaking() {
    MATCHING.active = false;
    MATCHING.cancelled = true;
    clearMatchingTimers();
    NET.dropQueued(['queue', 'cancel_queue']);
    NET.send({ type: 'cancel_queue' }, { queueIfClosed: false });
    haptic.warning();
    show('home');
  }

  function beginBattle(payload) {
    if (!payload || !payload.matchId) return;
    if (MATCHING.cancelled) return;
    if (!payload.localBot && !MATCHING.active && !BATTLE.running) return;
    if (BATTLE.running && BATTLE.matchId && payload.matchId !== BATTLE.matchId) return;

    clearMatchingTimers();
    clearLocalBotTimer();
    MATCHING.active = false;

    Object.assign(BATTLE, {
      matchId: payload.matchId,
      yourSlot: payload.yourSlot || 'p1',
      mySlot: payload.yourSlot || 'p1',
      participants: payload.participants || [],
      scores: { ...(payload.scores || {}) },
      startsAt: Number(payload.startsAt),
      endsAt: Number(payload.endsAt),
      running: true,
      acceptingTaps: false,
      tapSeq: 0,
      resultReceived: false,
      lastTimerText: '',
      jackpotSlots: new Set(),
      localBot: Boolean(payload.localBot),
    });
    BATTLE.enemySlot = BATTLE.participants.find(player => player.slot !== BATTLE.mySlot)?.slot || 'p2';

    const me = BATTLE.participants.find(player => player.slot === BATTLE.mySlot) || {};
    const enemy = BATTLE.participants.find(player => player.slot === BATTLE.enemySlot) || {};
    state.side = sideOf(me.side || state.side);
    saveState();

    setText('me-name', (me.name || state.name).toUpperCase());
    setText('enemy-name', (enemy.name || 'RIVAL').toUpperCase());
    setText('me-score', '0');
    setText('enemy-score', '0');
    setImage('me-side', getDigitImage(me.digit || state.digitStyle, state.side));
    setImage('enemy-side', getDigitImage(enemy.digit || 'classic', sideOf(enemy.side || oppositeSide(state.side))));
    byId('card-me')?.setAttribute('data-side', String(state.side));
    byId('card-enemy')?.setAttribute('data-side', String(sideOf(enemy.side || oppositeSide(state.side))));
    setBattleHands(me, enemy);
    setImage('battle-digit', getDigitImage(me.digit || state.digitStyle, state.side));
    const digit = byId('battle-digit');
    if (digit) digit.dataset.side = String(state.side);

    const stage = byId('battle-stage');
    if (stage) {
      stage.classList.remove('is-final-rush');
      stage.classList.add('is-playing');
    }
    const tapHint = query('.tap-zone__hint');
    if (tapHint) tapHint.textContent = tr('ready');
    setBattleMeme(tr('ready'));
    show('battle');
    updateScoreUI();
    startBattleClock();
    if (BATTLE.localBot) scheduleLocalBotTap();
  }

  function setBattleHands(me, enemy) {
    const left = byId('battle-hand-left');
    const right = byId('battle-hand-right');
    if (!left || !right) return;
    const myImage = getHandImage(me.hand || state.hand);
    const enemyImage = getHandImage(enemy.hand || 'hand');
    if (state.side === 6) {
      applyImageFallback(left, myImage);
      applyImageFallback(right, enemyImage);
    } else {
      applyImageFallback(left, enemyImage);
      applyImageFallback(right, myImage);
    }
  }

  function setBattleMeme(label) {
    const el = byId('battle-meme');
    if (!el) return;
    el.textContent = label;
    animateElement(el, [
      { transform: 'translateZ(0) scale(.92)' },
      { transform: 'translateZ(0) scale(1.06)' },
      { transform: 'translateZ(0) scale(1)' },
    ], { duration: 220 });
  }

  function startBattleClock() {
    window.cancelAnimationFrame(BATTLE.raf);
    const timerNum = byId('timer-num');
    const timerFg = byId('timer-fg');
    const circumference = 2 * Math.PI * 44;
    if (timerFg) {
      timerFg.setAttribute('stroke-dasharray', circumference.toFixed(2));
      timerFg.style.strokeDashoffset = '0';
    }

    const tick = () => {
      if (!BATTLE.running) return;
      const clockNow = battleNow();
      if (clockNow < BATTLE.startsAt) {
        const pre = Math.max(0, BATTLE.startsAt - clockNow);
        const label = pre > 760 ? 'SIX!' : pre > 380 ? 'SEVEN!' : tr('go');
        if (BATTLE.lastTimerText !== label) {
          BATTLE.lastTimerText = label;
          setBattleMeme(label);
          if (timerNum) timerNum.textContent = (CONFIG.roundMs / 1000).toFixed(1);
        }
      } else {
        if (!BATTLE.acceptingTaps) {
          BATTLE.acceptingTaps = true;
          byId('tap-zone')?.classList.add('is-live');
          const hint = query('.tap-zone__hint');
          if (hint) hint.textContent = tr('live');
          setBattleMeme(tr('live'));
        }

        const remain = Math.max(0, BATTLE.endsAt - clockNow);
        const label = (remain / 1000).toFixed(1);
        if (label !== BATTLE.lastTimerText) {
          BATTLE.lastTimerText = label;
          if (timerNum) timerNum.textContent = label;
          if (timerFg) timerFg.style.strokeDashoffset = (circumference * (1 - remain / CONFIG.roundMs)).toFixed(2);
        }
        if (remain < 1800) {
          byId('battle-stage')?.classList.add('is-final-rush');
        }
        if (remain <= 0 && !BATTLE.resultReceived) {
          BATTLE.acceptingTaps = false;
          byId('tap-zone')?.classList.remove('is-live');
          clearLocalBotTimer();
          if (BATTLE.localBot) {
            renderLocalBotResult();
            return;
          }
          setBattleMeme(tr('final'));
        }
      }
      BATTLE.raf = window.requestAnimationFrame(tick);
    };

    tick();
  }

  function battleNow() {
    return BATTLE.localBot ? Date.now() : NET.serverNow();
  }

  function updateScoreUI() {
    const myScore = Number(BATTLE.scores[BATTLE.mySlot] || 0);
    const enemyScore = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
    setText('me-score', myScore);
    setText('enemy-score', enemyScore);
    const total = Math.max(1, myScore + enemyScore);
    const sixPercent = state.side === 6 ? (myScore / total) * 100 : (enemyScore / total) * 100;
    const sixBar = byId('vs-bar-six');
    const sevenBar = byId('vs-bar-seven');
    if (sixBar) sixBar.style.width = `${sixPercent}%`;
    if (sevenBar) sevenBar.style.width = `${100 - sixPercent}%`;
  }

  function clearLocalBotTimer() {
    window.clearTimeout(BATTLE.localBotTimer);
    BATTLE.localBotTimer = 0;
  }

  function incrementLocalScore(slot, amount = 1) {
    const previous = Number(BATTLE.scores[slot] || 0);
    const next = previous + amount;
    BATTLE.scores[slot] = next;
    updateScoreUI();
  }

  function scheduleLocalBotTap() {
    clearLocalBotTimer();
    if (!BATTLE.localBot || !BATTLE.running || BATTLE.resultReceived) return;
    const clockNow = battleNow();
    const remaining = Math.max(0, BATTLE.endsAt - clockNow);
    if (remaining <= 0) return;
    const waitForStart = Math.max(0, BATTLE.startsAt - clockNow);
    const finalRush = remaining < 1800;
    const baseDelay = randomBetween(105, 220);
    const delay = Math.max(58, baseDelay * (finalRush ? 0.78 : 1));

    BATTLE.localBotTimer = window.setTimeout(() => {
      const liveNow = battleNow();
      if (!BATTLE.localBot || !BATTLE.running || BATTLE.resultReceived) return;
      if (liveNow < BATTLE.startsAt || liveNow >= BATTLE.endsAt) {
        scheduleLocalBotTap();
        return;
      }
      const burst = Math.random() < (finalRush ? 0.18 : 0.08) ? 2 : 1;
      incrementLocalScore(BATTLE.enemySlot, burst);
      const enemySide = sideOf(BATTLE.participants.find(player => player.slot === BATTLE.enemySlot)?.side || oppositeSide(state.side));
      animateHandForSide(enemySide);
      scheduleLocalBotTap();
    }, waitForStart + delay);
  }

  function onBattleTap() {
    if (!BATTLE.running || !BATTLE.acceptingTaps) return;
    const clockNow = battleNow();
    if (clockNow < BATTLE.startsAt || clockNow >= BATTLE.endsAt) return;

    BATTLE.tapSeq += 1;
    if (BATTLE.localBot) incrementLocalScore(BATTLE.mySlot, 1);
    else NET.send({ type: 'tap', matchId: BATTLE.matchId, seq: BATTLE.tapSeq, clientTs: Date.now() });

    const hapticNow = Date.now();
    if (hapticNow - lastHapticAt > 110) {
      lastHapticAt = hapticNow;
      haptic.light();
    }
    animateHandForSide(state.side);
  }

  function handElementForSide(side) {
    return sideOf(side) === 6 ? byId('battle-hand-left') : byId('battle-hand-right');
  }

  function animateHandForSide(side) {
    const el = handElementForSide(side);
    const isSix = sideOf(side) === 6;
    const base = isSix ? 'translate3d(-10%, 0, 0) rotate(-4deg) scaleX(-1)' : 'translate3d(10%, 0, 0) rotate(-4deg)';
    const up = isSix ? 'translate3d(-10%, -42px, 0) rotate(-4deg) scaleX(-1)' : 'translate3d(10%, -42px, 0) rotate(-4deg)';
    animateElement(el, [
      { transform: base },
      { transform: up },
      { transform: base },
    ], { duration: 150 });
  }

  function showJackpot(slot) {
    if (BATTLE.jackpotSlots.has(slot)) return;
    BATTLE.jackpotSlots.add(slot);
    if (slot === BATTLE.mySlot) {
      haptic.heavy();
      window.setTimeout(() => haptic.success(), 150);
    }

    query('.sixty-seven-jackpot')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sixty-seven-jackpot';
    overlay.innerHTML = `
      <div class="sixty-seven-jackpot__badge">${escapeHtml(tr('jackpot'))}</div>
      <div class="sixty-seven-jackpot__line sixty-seven-jackpot__line--one">SIX</div>
      <div class="sixty-seven-jackpot__line sixty-seven-jackpot__line--two">SEVEN</div>
      <div class="sixty-seven-jackpot__sub">+67 AURA</div>
    `;
    document.body.appendChild(overlay);

    for (let index = 0; index < (lowPower ? 16 : 32); index += 1) {
      const confetti = document.createElement('span');
      confetti.className = 'sixty-seven-jackpot__confetti';
      confetti.dataset.side = String(index % 2 ? 7 : 6);
      confetti.style.left = `${randomBetween(2, 98)}%`;
      confetti.style.top = `${randomBetween(-20, 18)}%`;
      confetti.style.setProperty('--dur', `${randomBetween(1.1, 2.1).toFixed(2)}s`);
      overlay.appendChild(confetti);
    }

    for (let index = 0; index < (lowPower ? 5 : 9); index += 1) {
      const word = document.createElement('span');
      word.className = 'sixty-seven-jackpot__word';
      word.dataset.side = String(index % 2 ? 7 : 6);
      word.textContent = index % 3 ? '67!' : '+67 AURA';
      word.style.left = `${randomBetween(8, 82)}%`;
      word.style.top = `${randomBetween(18, 78)}%`;
      overlay.appendChild(word);
    }

    window.setTimeout(() => overlay.classList.add('is-out'), 1900);
    window.setTimeout(() => overlay.remove(), 2450);
  }

  function applyLocalBotOutcome(myScore, enemyScore, winnerSlot) {
    const tie = !winnerSlot;
    const myWin = winnerSlot === BATTLE.mySlot;
    const reward = myWin ? Math.floor(50 + myScore * 0.8) : (tie ? 20 : 10);
    state.coins = Number(state.coins || 0) + reward;
    state.weeklyScore = Number(state.weeklyScore || 0) + myScore + (myWin ? 50 : tie ? 10 : 0) + (myScore === 67 ? 67 : 0);
    state.stats.best = Math.max(Number(state.stats.best || 0), myScore);
    state.stats.totalTaps = Number(state.stats.totalTaps || 0) + myScore;
    if (tie) {
      state.stats.ties = Number(state.stats.ties || 0) + 1;
      state.stats.currentStreak = 0;
      state.stats.streakType = 'tie';
    } else if (myWin) {
      state.stats.wins = Number(state.stats.wins || 0) + 1;
      state.stats.currentStreak = state.stats.streakType === 'win' ? Number(state.stats.currentStreak || 0) + 1 : 1;
      state.stats.streakType = 'win';
    } else {
      state.stats.losses = Number(state.stats.losses || 0) + 1;
      state.stats.currentStreak = state.stats.streakType === 'lose' ? Number(state.stats.currentStreak || 0) + 1 : 1;
      state.stats.streakType = 'lose';
    }
    saveState();
    renderAllStatic();
  }

  function renderLocalBotResult() {
    if (BATTLE.resultReceived) return;
    const myScore = Number(BATTLE.scores[BATTLE.mySlot] || 0);
    const enemyScore = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
    const winnerSlot = myScore === enemyScore ? null : (myScore > enemyScore ? BATTLE.mySlot : BATTLE.enemySlot);
    applyLocalBotOutcome(myScore, enemyScore, winnerSlot);
    renderResult({
      matchId: BATTLE.matchId,
      scores: { ...BATTLE.scores },
      winnerSlot,
      participants: BATTLE.participants,
      localBot: true,
    });
  }

  function renderResult(payload) {
    BATTLE.resultReceived = true;
    BATTLE.running = false;
    BATTLE.acceptingTaps = false;
    window.cancelAnimationFrame(BATTLE.raf);
    clearLocalBotTimer();
    byId('tap-zone')?.classList.remove('is-live', 'is-armed');
    byId('battle-stage')?.classList.remove('is-playing', 'is-final-rush');

    const myScore = Number(payload.scores?.[BATTLE.mySlot] || 0);
    const enemyScore = Number(payload.scores?.[BATTLE.enemySlot] || 0);
    const myWin = payload.winnerSlot === BATTLE.mySlot;
    const tie = !payload.winnerSlot;
    const reward = myWin ? Math.floor(50 + myScore * 0.8) : (tie ? 20 : 10);
    const matchSuffix = String(payload.matchId || BATTLE.matchId || '').slice(-8);

    const verdict = byId('result-verdict');
    if (verdict) {
      verdict.classList.remove('is-win', 'is-lose', 'is-tie');
      verdict.textContent = tie ? tr('draw') : myWin ? tr('victory') : tr('defeat');
      verdict.classList.add(tie ? 'is-tie' : myWin ? 'is-win' : 'is-lose');
    }
    setImage('result-side', getDigitImage(state.digitStyle, myWin || tie ? state.side : oppositeSide(state.side)));
    const sideEl = byId('result-side');
    if (sideEl) sideEl.dataset.side = String(myWin || tie ? state.side : oppositeSide(state.side));
    setText('result-my-score', myScore);
    setText('result-enemy-score', enemyScore);
    setText('result-reward', reward);
    setText('result-callout-title', myScore === 67 ? tr('jackpotTitle') : myWin ? tr('winTitle', state.side) : tie ? tr('drawTitle') : tr('loseTitle'));
    setText('result-subtitle', myScore === 67 ? tr('jackpot') : `${state.side} GANG`);
    setText('result-callout-text', tr('battleResult', matchSuffix));

    if (payload.player) syncFromServerPlayer(payload.player);
    if (payload.top) TOP = payload.top;
    if (payload.globalWar) GLOBAL_WAR = payload.globalWar;
    setText('result-streak', state.stats.streakType === 'win' ? tr('winStreak', state.stats.currentStreak) : state.stats.streakType === 'lose' ? tr('shameStreak', state.stats.currentStreak) : tr('streakReset'));
    setText('result-shame', myScore === 67 ? tr('shareJackpot') : `SHAME A ${oppositeSide(state.side)}`);
    if (myScore === 67) window.setTimeout(() => showJackpot(BATTLE.mySlot), 160);
    if (myWin) haptic.success();
    else if (tie) haptic.warning();
    else haptic.error();
    startResultHomeCooldown();
    show('result');
  }

  function syncFromServerPlayer(player) {
    if (!player) return;
    MY_PUBLIC_ID = player.publicId || player.id || MY_PUBLIC_ID;
    state.name = player.name || state.name;
    state.side = sideOf(player.side || state.side);
    state.coins = Number(player.coins ?? state.coins);
    state.hand = isKnownHand(player.hand) ? player.hand : state.hand;
    state.digitStyle = isKnownDigit(player.digit) ? player.digit : state.digitStyle;
    if (Array.isArray(player.ownedHands)) state.ownedHands = Array.from(new Set(['hand', ...player.ownedHands])).filter(isKnownHand);
    if (Array.isArray(player.ownedDigits)) state.ownedDigits = Array.from(new Set(['classic', ...player.ownedDigits])).filter(isKnownDigit);
    state.stats = { ...state.stats, ...(player.stats || {}) };
    state.weeklyScore = Number(player.weeklyScore ?? state.weeklyScore);
    state.referrals = { ...state.referrals, ...(player.referrals || {}) };
    if (player.guild !== undefined) state.guild = player.guild || clone(DEFAULT_GUILD);
    saveState();
    renderAllStatic();
  }

  function renderShop() {
    const grid = byId('shop-grid');
    if (!grid) return;
    setText('shop-coins', Number(state.coins || 0).toLocaleString('ru-RU'));
    grid.innerHTML = '';
    const catalog = SHOP_TAB === 'hands' ? HAND_CATALOG : DIGIT_CATALOG;

    catalog.forEach(item => {
      const card = document.createElement('div');
      card.className = 'shop-card';

      const rarity = document.createElement('div');
      rarity.className = `shop-card__rarity shop-card__rarity--${item.rarity}`;
      rarity.textContent = item.rarity.toUpperCase();
      card.appendChild(rarity);

      if (SHOP_TAB === 'hands') {
        const image = document.createElement('img');
        image.className = 'shop-card__img';
        image.alt = item.name;
        applyImageFallback(image, item.img);
        card.appendChild(image);
      } else {
        const preview = document.createElement('div');
        preview.className = 'shop-card__digit-preview';
        preview.innerHTML = `<img src="${item.img6}" alt="6"><img src="${item.img7}" alt="7">`;
        card.appendChild(preview);
        queryAll('img', preview).forEach(img => applyImageFallback(img));
      }

      const name = document.createElement('div');
      name.className = 'shop-card__name';
      name.textContent = item.name;
      card.appendChild(name);

      const cta = document.createElement('button');
      cta.className = 'shop-card__cta';
      const owned = SHOP_TAB === 'hands' ? state.ownedHands.includes(item.id) : state.ownedDigits.includes(item.id);
      const equipped = SHOP_TAB === 'hands' ? state.hand === item.id : state.digitStyle === item.id;
      if (equipped) {
        cta.classList.add('is-equipped');
        cta.textContent = tr('equipped');
      } else if (owned) {
        cta.classList.add('is-owned');
        cta.textContent = tr('equip');
        cta.addEventListener('click', () => equipItem(item));
      } else {
        cta.textContent = `🪙 ${item.price}`;
        if (state.coins < item.price) cta.classList.add('is-locked');
        cta.addEventListener('click', () => buyItem(item));
      }
      card.appendChild(cta);
      grid.appendChild(card);
    });
  }

  async function equipItem(item) {
    try {
      const payload = await apiFetch('/api/shop/equip', {
        method: 'POST',
        body: { kind: SHOP_TAB, itemId: item.id },
      });
      syncFromServerPlayer(payload.player);
      renderShop();
      NET.sendHello();
      haptic.success();
    } catch {
      showToast('Server sync failed');
      haptic.error();
    }
  }

  async function buyItem(item) {
    if (state.coins < item.price) {
      showToast(tr('noCoins'));
      haptic.error();
      return;
    }
    try {
      const payload = await apiFetch('/api/shop/buy', {
        method: 'POST',
        body: { kind: SHOP_TAB, itemId: item.id },
      });
      syncFromServerPlayer(payload.player);
      renderShop();
      NET.sendHello();
      haptic.success();
    } catch (error) {
      showToast(error.message === 'not_enough_coins' ? tr('noCoins') : 'Server sync failed');
      haptic.error();
    }
  }

  function seededGuildTop() {
    if (!allowDevMocks) return [];
    const names = ['Six Mafia', 'Seven Cult', 'Aura Lab', 'Tap Syndicate', 'Mango Mode', 'No Chill Crew'];
    return Array.from({ length: 67 }, (_, index) => ({
      rank: index + 1,
      name: names[index % names.length],
      side: index % 2 ? 7 : 6,
      score: 67000 - index * 670,
    }));
  }

  function requestTop() {
    NET.send({ type: 'get_top' });
    fetchTopFromApi();
  }

  async function fetchTopFromApi() {
    const requestId = topRequestId + 1;
    topRequestId = requestId;
    topLoading = true;

    try {
      const payload = await apiFetch('/api/top');
      if (requestId !== topRequestId) return;
      TOP = Array.isArray(payload.top) ? payload.top : [];
      GLOBAL_WAR = payload.globalWar || GLOBAL_WAR;
      topLoading = false;
      if (!query('[data-screen="top"]')?.hidden) renderTop({ request: false });
      renderGlobalWar();
    } catch {
      if (requestId === topRequestId) {
        topLoading = false;
        if (!query('[data-screen="top"]')?.hidden) renderTop({ request: false });
      }
    }
  }

  async function loadServerState() {
    try {
      const payload = await apiFetch('/api/me');
      if (payload.player) syncFromServerPlayer(payload.player);
    } catch {
      // Realtime reconnect UI already covers backend availability.
    }
  }

  function renderTop(options = {}) {
    if (options.request !== false && TOP_TAB === 'players') requestTop();
    byId('top-player-prize')?.toggleAttribute('hidden', TOP_TAB !== 'players');
    byId('top-guild-prize')?.toggleAttribute('hidden', TOP_TAB !== 'guilds');

    const list = byId('top-list');
    if (!list) return;
    list.innerHTML = '';
    const board = TOP_TAB === 'guilds' ? seededGuildTop() : TOP;
    if (!board.length) {
      const row = document.createElement('div');
      row.className = 'top-row';
      row.innerHTML = `
        <div class="top-row__rank">--</div>
        <div class="top-row__name">${topLoading ? 'LOADING TOP...' : TOP_TAB === 'guilds' ? 'GUILDS ARE NOT LIVE YET' : 'NO REAL PLAYERS YET'}</div>
        <div class="top-row__right">
          <span class="top-row__score">0</span>
        </div>
      `;
      list.appendChild(row);
      setText('reset-in', weeklyResetText());
      return;
    }
    board.slice(0, 100).forEach((player, index) => {
      const place = player.rank || index + 1;
      const row = document.createElement('div');
      row.className = 'top-row';
      const isMe = player.publicId === MY_PUBLIC_ID || player.id === MY_PUBLIC_ID;
      if (isMe) row.classList.add('is-me');
      if (place === 1) row.classList.add('top-row--gold');
      else if (place === 2) row.classList.add('top-row--silver');
      else if (place === 3) row.classList.add('top-row--bronze');
      else if (place === 67) row.classList.add('top-row--lucky67');
      row.innerHTML = `
        <div class="top-row__rank">${place}</div>
        <div class="top-row__name">${escapeHtml(player.name || 'Alpha67')}${isMe ? ' (YOU)' : ''}</div>
        <div class="top-row__right">
          <span class="top-row__side" data-side="${sideOf(player.side)}">${sideOf(player.side)}</span>
          <span class="top-row__score">${Number(player.score || 0).toLocaleString('ru-RU')}</span>
          ${place === 67 ? '<span class="top-row__prize">⭐ 67</span>' : ''}
        </div>
      `;
      list.appendChild(row);
    });

    setText('reset-in', weeklyResetText());
  }

  function weeklyResetText() {
    const now = new Date();
    const day = now.getUTCDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday, 0, 0, 0);
    const ms = Math.max(0, next - Date.now());
    const days = Math.floor(ms / 86400000);
    const hours = Math.floor((ms % 86400000) / 3600000);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  }

  function renderProfile() {
    setText('profile-name', state.name);
    setText('profile-rank', rankLabel(state.stats.wins));
    setText('profile-wins', Number(state.stats.wins || 0));
    setText('profile-losses', Number(state.stats.losses || 0));
    setText('profile-best', Number(state.stats.best || 0));
  }

  function createGuild() {
    if (!allowDevMocks) {
      showToast('Guilds are not live yet');
      return;
    }
    const name = prompt(tr('createGuildPrompt'));
    if (!name) return;
    const clean = name.replace(/[^A-Za-zА-Яа-яЁё0-9 _.-]/g, '').trim().slice(0, 20) || `GANG ${state.side}`;
    state.guild = {
      id: `g${Date.now().toString(36)}`,
      name: clean,
      tag: clean.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').toUpperCase().slice(0, 3) || 'GNG',
      side: state.side,
      score: 67,
      members: 1,
      invites: 0,
      lockedUntil: Date.now() + 86400000,
      cooldownUntil: 0,
    };
    saveState();
    renderGuildCard();
  }

  function joinRandomGuild() {
    if (!allowDevMocks) {
      showToast('Guilds are not live yet');
      return;
    }
    state.guild = {
      id: `fake${Date.now().toString(36)}`,
      name: state.side === 6 ? 'Six Mafia' : 'Seven Cult',
      tag: state.side === 6 ? 'SIX' : 'S7N',
      side: state.side,
      score: 67,
      members: 67,
      invites: 0,
      lockedUntil: Date.now() + 86400000,
      cooldownUntil: 0,
    };
    saveState();
    renderGuildCard();
    haptic.success();
  }

  function leaveGuild() {
    state.guild = { ...clone(DEFAULT_GUILD), cooldownUntil: Date.now() + 43200000 };
    saveState();
    renderGuildCard();
    haptic.warning();
  }

  function telegramBotUsername() {
    return String(window.SIX_SEVEN_BOT_USERNAME || 'sixseven_game_bot').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '');
  }

  function telegramAppName() {
    return String(window.SIX_SEVEN_APP_NAME || '').replace(/^\/+|\/+$/g, '').replace(/[^A-Za-z0-9_]/g, '');
  }

  function telegramAppLink(startParam = '') {
    const bot = telegramBotUsername();
    if (!bot) return '';

    const app = telegramAppName();
    const base = app ? `https://t.me/${bot}/${encodeURIComponent(app)}` : `https://t.me/${bot}`;
    return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
  }

  function telegramBotDeepLink(startParam = '') {
    const bot = telegramBotUsername();
    if (!bot) return '';
    const base = `https://t.me/${bot}`;
    return startParam ? `${base}?startapp=${encodeURIComponent(startParam)}` : base;
  }

  function shareText(label, url = referralLink() || telegramBotDeepLink()) {
    const params = new URLSearchParams();
    if (url) params.set('url', url);
    params.set('text', label);
    const shareUrl = `https://t.me/share/url?${params.toString()}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
    if (!url) showToast('Telegram bot link is not configured');
  }

  function referralLink() {
    if (!state.referrals.code) return telegramBotDeepLink();
    const param = `r_${state.referrals.code}_${state.side}`;
    return telegramBotDeepLink(param);
  }

  function bindEvents() {
    queryAll('.side-btn').forEach(btn => btn.addEventListener('click', () => {
      setSide(btn.dataset.side, true);
      haptic.medium();
    }));
    byId('home-battle-cta')?.addEventListener('click', startMatchmaking);
    byId('matching-cancel')?.addEventListener('click', cancelMatchmaking);
    byId('tap-zone')?.addEventListener('pointerdown', onBattleTap, { passive: true });
    byId('battle-stage')?.addEventListener('pointerdown', onBattleTap, { passive: true });
    query('[data-screen="home"]')?.addEventListener('pointerdown', showHomeTapDigit, { passive: true });

    queryAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      haptic.select();
      if (target === 'battle-quick') return startMatchmaking();
      if (target === 'profile') return show('profile');
      if (target === 'top') return show('top');
      return show('home');
    }));
    queryAll('[data-go-home]').forEach(btn => btn.addEventListener('click', () => show('home')));
    byId('open-profile-top')?.addEventListener('click', () => show('profile'));
    byId('open-shop-top')?.addEventListener('click', () => show('shop'));
    byId('result-home')?.addEventListener('click', () => {
      const btn = byId('result-home');
      if (btn?.disabled) return;
      show('home');
    });
    byId('result-shame')?.addEventListener('click', () => shareText(`${state.side} GANG scored ${byId('result-my-score')?.textContent || 0} in 6.7 sec. Beat this.`));
    byId('result-raid')?.addEventListener('click', () => shareText(`${state.side} GANG RAID. ${oppositeSide(state.side)} GANG defend your aura.`));
    byId('ref-invite')?.addEventListener('click', () => {
      shareText(`I picked ${state.side} GANG. Join or accept aura debt.`, referralLink());
    });
    byId('guild-create')?.addEventListener('click', createGuild);
    byId('guild-random')?.addEventListener('click', joinRandomGuild);
    byId('guild-leave')?.addEventListener('click', leaveGuild);
    byId('guild-invite')?.addEventListener('click', () => shareText(`Join my ${state.guild.name || '67'} guild.`));

    queryAll('.shop-tab').forEach(btn => btn.addEventListener('click', () => {
      SHOP_TAB = btn.dataset.shopTab || 'hands';
      queryAll('.shop-tab').forEach(item => item.classList.toggle('is-active', item === btn));
      renderShop();
    }));

    queryAll('[data-top-tab]').forEach(btn => btn.addEventListener('click', () => {
      TOP_TAB = btn.dataset.topTab || 'players';
      queryAll('[data-top-tab]').forEach(item => item.classList.toggle('is-active', item === btn));
      renderTop({ request: TOP_TAB === 'players' });
    }));

    document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
  }

  function startResultHomeCooldown() {
    const btn = byId('result-home');
    if (!btn) return;

    window.clearTimeout(resultHomeCooldownTimer);
    const label = tr('home');
    let secondsLeft = Math.ceil(RESULT_HOME_COOLDOWN_MS / 1000);

    btn.disabled = true;
    btn.classList.add('is-counting-down');

    const tick = () => {
      if (secondsLeft <= 0) {
        btn.textContent = label;
        btn.disabled = false;
        btn.classList.remove('is-counting-down');
        resultHomeCooldownTimer = 0;
        return;
      }

      btn.textContent = `${label} ${secondsLeft}`;
      secondsLeft -= 1;
      resultHomeCooldownTimer = window.setTimeout(tick, 1000);
    };

    tick();
  }

  function preventDoubleTapZoom(event) {
    const time = Date.now();
    if (time - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = time;
  }

  async function bootStartParam() {
    const raw = telegramStartParam() || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
    const ref = raw.match(/^r_(r[A-Za-z0-9]{8,24})(?:_([67]))?$/);
    if (!ref || state.referrals.firstTouchClaimed || ref[1] === state.referrals.code) return;
    try {
      const payload = await apiFetch('/api/referral/claim', {
        method: 'POST',
        body: { code: ref[1], side: ref[2] ? Number(ref[2]) : undefined },
      });
      if (payload.player) syncFromServerPlayer(payload.player);
      if (payload.claimed) showToast('+67 aura');
    } catch {
      // A malformed, repeated, or self-referral start param should not block boot.
    }
  }

  function bindRealtime() {
    NET.on('hello_required', message => {
      Object.assign(CONFIG, message.config || {});
      NET.sendHello();
    });
    NET.on('player_state', message => {
      Object.assign(CONFIG, message.config || {});
      syncFromServerPlayer(message.player);
      TOP = message.top || TOP;
      if (message.top) topLoading = false;
      GLOBAL_WAR = message.globalWar || GLOBAL_WAR;
      renderGlobalWar();
    });
    NET.on('queue_state', message => {
      if (MATCHING.active && !MATCHING.cancelled && !query('[data-screen="matching"]')?.hidden) {
        renderMatchingCountdown(Number(message.searchEndsAt), Boolean(message.opponentFound), { server: true });
      }
    });
    NET.on('queue_cancelled', () => {
      if (!MATCHING.active || BATTLE.running) return;
      MATCHING.active = false;
      MATCHING.cancelled = true;
      clearMatchingTimers();
      show('home');
    });
    NET.on('match_start', beginBattle);
    NET.on('match_live', message => {
      if (!message.matchId || message.matchId === BATTLE.matchId) BATTLE.acceptingTaps = true;
    });
    NET.on('score_update', message => {
      if (message.matchId !== BATTLE.matchId) return;
      const previousMine = Number(BATTLE.scores[BATTLE.mySlot] || 0);
      const previousEnemy = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
      BATTLE.scores = { ...BATTLE.scores, ...(message.scores || {}) };
      updateScoreUI();
      const mine = Number(BATTLE.scores[BATTLE.mySlot] || 0);
      const enemy = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
      if (mine > previousMine) {
        animateHandForSide(state.side);
      }
      if (enemy > previousEnemy) {
        const enemySide = sideOf(BATTLE.participants.find(player => player.slot === BATTLE.enemySlot)?.side || oppositeSide(state.side));
        animateHandForSide(enemySide);
      }
    });
    NET.on('match_result', renderResult);
    NET.on('top_state', message => {
      TOP = message.top || [];
      topLoading = false;
      GLOBAL_WAR = message.globalWar || GLOBAL_WAR;
      if (!query('[data-screen="top"]')?.hidden) renderTop({ request: false });
      renderGlobalWar();
    });
    NET.on('error', message => {
      if (message.message) showToast(message.message);
    });
  }

  bindRealtime();
  applyTranslations(state.lang);
  bindEvents();
  bootStartParam();
  renderAllStatic();
  loadServerState();
  NET.connect();

  window.setInterval(() => {
    if (!query('[data-screen="home"]')?.hidden) {
      heroOtherHandId = pick(HAND_CATALOG).id;
      if (heroOtherHandId === state.hand) heroOtherHandId = 'clown';
      syncHeroHands();
    }
  }, 6700);

  if (!applyDesktopGuard()) show('home');
  window.addEventListener('resize', applyDesktopGuard);
}
