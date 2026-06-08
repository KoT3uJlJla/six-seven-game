/* ============================================
   67 — APP LOGIC
   Real-time server-authoritative edition.
   ============================================ */

(() => {
  'use strict';

  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready?.();
    tg.expand?.();
    tg.disableVerticalSwipes?.();
  }

  const CONFIG = {
    matchmakingMs: 6700,
    roundMs: 6700,
    startDelayMs: 1200,
    fxNodeLimit: 38,
    lowPowerFxNodeLimit: 18,
    scoreFxEveryNthTap: 2,
  };

  const haptic = {
    light:  () => tg?.HapticFeedback?.impactOccurred?.('light'),
    medium: () => tg?.HapticFeedback?.impactOccurred?.('medium'),
    heavy:  () => tg?.HapticFeedback?.impactOccurred?.('heavy'),
    success:() => tg?.HapticFeedback?.notificationOccurred?.('success'),
    warning:() => tg?.HapticFeedback?.notificationOccurred?.('warning'),
    error:  () => tg?.HapticFeedback?.notificationOccurred?.('error'),
    select: () => tg?.HapticFeedback?.selectionChanged?.(),
  };

  const STORE_KEY = 'six-seven::state-v2-server-authoritative';
  const LEGACY_STORE_KEY = 'six-seven::state-v1';
  const PLAYER_ID_KEY = 'six-seven::player-id';
  const SESSION_PLAYER_ID_KEY = 'six-seven::session-player-id';

  const HAND_CATALOG = [
    { id: 'hand',   name: 'CLASSIC', img: 'assets/hand.png',   price: 0,    rarity: 'common' },
    { id: 'clown',  name: 'JOKER',   img: 'assets/clown.png',  price: 500,  rarity: 'rare'   },
    { id: 'cube',   name: 'BLOCKY',  img: 'assets/cube.png',   price: 700,  rarity: 'rare'   },
    { id: 'spanch', name: 'SPONGE',  img: 'assets/spanch.png', price: 1200, rarity: 'epic'   },
    { id: 'devil',  name: 'DEMON',   img: 'assets/devil.png',  price: 1500, rarity: 'epic'   },
    { id: 'roblox', name: 'BLOX',    img: 'assets/roblox.png', price: 2400, rarity: 'legend' },
    { id: 'robo',   name: 'CYBORG',  img: 'assets/robo.png',   price: 3000, rarity: 'legend' },
  ];
  const DIGIT_CATALOG = [
    { id: 'classic', name: 'CLASSIC', price: 0,    rarity: 'common', img6: 'assets/digits/classic-6.png', img7: 'assets/digits/classic-7.png' },
    { id: 'clown',   name: 'JOKER',   price: 400,  rarity: 'rare',   img6: 'assets/digits/clown-6.png',   img7: 'assets/digits/clown-7.png'   },
    { id: 'devil',   name: 'DEMON',   price: 1200, rarity: 'epic',   img6: 'assets/digits/devil-6.png',   img7: 'assets/digits/devil-7.png'   },
    { id: 'robo',    name: 'CYBORG',  price: 2500, rarity: 'legend', img6: 'assets/digits/robo-6.png',    img7: 'assets/digits/robo-7.png'    },
  ];

  const DEFAULT_STATE = {
    name: tg?.initDataUnsafe?.user?.first_name || 'Alpha67',
    coins: 250,
    side: 6,
    hand: 'hand',
    digitStyle: 'classic',
    ownedHands: ['hand'],
    ownedDigits: ['classic'],
    stats: { wins: 0, losses: 0, ties: 0, best: 0, totalTaps: 0, currentStreak: 0, streakType: 'none' },
    weeklyScore: 0,
    referrals: { code: '', sent: 0, accepted: 0, referredBy: '', firstTouchClaimed: false },
    guild: { id: '', name: '', tag: '', side: 6, score: 0, members: 0, invites: 0, lockedUntil: 0, cooldownUntil: 0 },
    lang: detectClientLang(),
  };

  const I18N = {
    en: {
      finding: 'FINDING OPPONENT', scan: 'Scanning for 6.7 seconds…', found: 'Opponent locked. Syncing server clock…', bot: 'Nobody answered. Bot spawned.', cancel: 'CANCEL',
      ready: 'GET READY', go: 'GO!', tap: 'TAP TAP TAP', live: 'TAP! TAP! TAP!', final: 'FINAL RUSH!',
      victory: 'VICTORY', defeat: 'DEFEAT', draw: 'DRAW', reward: 'Reward', home: 'BACK TO HOME',
      top: 'WEEKLY TOP', shop: 'SHOP', profile: 'PROFILE', fight: 'FIGHT', copied: 'Copied', noCoins: 'Not enough coins', equipped: 'EQUIPPED', equip: 'EQUIP',
      serverOffline: 'Server connection lost. Reconnecting…', serverOnline: 'Server sync online', serverTruth: 'SERVER TRUTH', jackpot: '67 POINTS HIT',
    },
    ru: {
      finding: 'ИЩЕМ СОПЕРНИКА', scan: 'Сканируем ровно 6.7 секунды…', found: 'Соперник найден. Синхронизируем часы…', bot: 'Никто не ответил. Ставим бота.', cancel: 'ОТМЕНА',
      ready: 'ПРИГОТОВЬСЯ', go: 'GO!', tap: 'ТАП ТАП ТАП', live: 'ТАП! ТАП! ТАП!', final: 'ФИНАЛЬНЫЙ РЫВОК!',
      victory: 'ПОБЕДА', defeat: 'ПОРАЖЕНИЕ', draw: 'НИЧЬЯ', reward: 'Награда', home: 'НА ГЛАВНУЮ',
      top: 'ТОП НЕДЕЛИ', shop: 'МАГАЗИН', profile: 'ПРОФИЛЬ', fight: 'БОЙ', copied: 'Скопировано', noCoins: 'Не хватает монет', equipped: 'ВЫБРАНО', equip: 'ВЫБРАТЬ',
      serverOffline: 'Связь с сервером потеряна. Переподключаемся…', serverOnline: 'Синхронизация с сервером включена', serverTruth: 'ИСТИНА НА СЕРВЕРЕ', jackpot: '67 ОЧКОВ ВЫБИТО',
    },
  };

  const DOM = Object.create(null);
  const $ = id => DOM[id] || (DOM[id] = document.getElementById(id));
  const q = sel => document.querySelector(sel);
  const qa = sel => Array.from(document.querySelectorAll(sel));
  const t = key => (I18N[state.lang]?.[key] || I18N.en[key] || key);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rnd = (min, max) => min + Math.random() * (max - min);
  const sideOf = side => Number(side) === 7 ? 7 : 6;
  const opposite = side => sideOf(side) === 6 ? 7 : 6;

  function detectClientLang() {
    const sources = [tg?.initDataUnsafe?.user?.language_code, navigator.language, ...(navigator.languages || [])].filter(Boolean);
    return sources.some(v => String(v).toLowerCase().startsWith('ru')) ? 'ru' : 'en';
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULT_STATE),
        ...parsed,
        stats: { ...DEFAULT_STATE.stats, ...(parsed.stats || {}) },
        referrals: { ...DEFAULT_STATE.referrals, ...(parsed.referrals || {}) },
        guild: { ...DEFAULT_STATE.guild, ...(parsed.guild || {}) },
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
  }

  let state = loadState();
  state.lang = detectClientLang();
  if (!state.referrals.code) state.referrals.code = makeReferralCode();
  saveState();

  function makeReferralCode() {
    const id = tg?.initDataUnsafe?.user?.id;
    if (id) return `u${Number(id).toString(36)}`;
    return `g${Math.random().toString(36).slice(2, 9)}`;
  }

  function getPlayerId() {
    const tgId = tg?.initDataUnsafe?.user?.id;
    if (tgId) return `tg:${tgId}`;
    try {
      let sessionId = sessionStorage.getItem(SESSION_PLAYER_ID_KEY);
      if (!sessionId) {
        sessionId = `local:${crypto.getRandomValues(new Uint32Array(2)).join('-')}`;
        sessionStorage.setItem(SESSION_PLAYER_ID_KEY, sessionId);
      }
      return sessionId;
    } catch {
      let id = localStorage.getItem(PLAYER_ID_KEY);
      if (!id) {
        id = `local:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        localStorage.setItem(PLAYER_ID_KEY, id);
      }
      return id;
    }
  }

  const PLAYER_ID = getPlayerId();

  function installRuntimeCss() {
    const style = document.createElement('style');
    style.textContent = `
      .server-pill{position:fixed;left:12px;top:calc(10px + var(--safe-top));z-index:30;padding:7px 10px;border-radius:999px;background:rgba(255,255,255,.82);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.10);font:700 10px/1 var(--font-body);letter-spacing:.08em;color:#171827;pointer-events:none}.server-pill[data-state=offline]{color:#c4185a}.server-pill[data-state=online]{color:#1452b8}.home-tap-digit{position:fixed;z-index:26;pointer-events:none;font-family:var(--font-loud);font-size:44px;line-height:1;text-shadow:0 10px 24px rgba(0,0,0,.18);transform:translate(-50%,-50%);animation:homeDigitPop .68s cubic-bezier(.2,.9,.2,1) forwards}.home-tap-digit[data-team="6"]{color:var(--six);filter:drop-shadow(0 0 18px var(--six-glow))}.home-tap-digit[data-team="7"]{color:var(--seven);filter:drop-shadow(0 0 18px var(--seven-glow))}@keyframes homeDigitPop{0%{opacity:0;transform:translate(-50%,-38%) scale(.55) rotate(-8deg)}18%{opacity:1}100%{opacity:0;transform:translate(calc(-50% + var(--dx)),calc(-130% + var(--dy))) scale(1.3) rotate(var(--rot))}}.battle__sync{position:absolute;left:50%;top:84px;transform:translateX(-50%);z-index:5;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.76);font:900 10px/1 var(--font-body);letter-spacing:.10em;color:#0c0d18;box-shadow:0 8px 24px rgba(0,0,0,.12);pointer-events:none}.fx-floater{position:absolute;z-index:9;pointer-events:none;font-family:var(--font-loud);font-size:20px;line-height:1;white-space:nowrap;will-change:transform,opacity;animation:fxFloat .72s ease-out forwards}.fx-floater[data-side="6"]{color:var(--six);text-shadow:0 0 16px var(--six-glow)}.fx-floater[data-side="7"]{color:var(--seven);text-shadow:0 0 16px var(--seven-glow)}@keyframes fxFloat{0%{opacity:0;transform:translate3d(-50%,0,0) scale(.7) rotate(0)}12%{opacity:1}100%{opacity:0;transform:translate3d(calc(-50% + var(--tx)),var(--ty),0) scale(1.2) rotate(var(--rot))}}.fx-dot{position:absolute;z-index:8;width:8px;height:8px;border-radius:999px;pointer-events:none;will-change:transform,opacity;animation:fxDot .54s ease-out forwards}.fx-dot[data-side="6"]{background:var(--six)}.fx-dot[data-side="7"]{background:var(--seven)}@keyframes fxDot{0%{opacity:.95;transform:translate3d(0,0,0) scale(1)}100%{opacity:0;transform:translate3d(var(--tx),var(--ty),0) scale(.25)}}.sixty-seven-jackpot{position:fixed;inset:0;z-index:60;display:grid;place-items:center;pointer-events:none;background:radial-gradient(circle at 50% 50%,rgba(255,255,255,.86),rgba(255,255,255,.18) 42%,rgba(255,42,109,.20));animation:jackpotIn .22s ease-out both}.sixty-seven-jackpot__box{text-align:center;font-family:var(--font-loud);filter:drop-shadow(0 18px 40px rgba(0,0,0,.24))}.sixty-seven-jackpot__badge{display:inline-block;margin-bottom:10px;padding:8px 12px;border-radius:999px;background:#0c0d18;color:#fff;font:900 12px/1 var(--font-body);letter-spacing:.12em}.sixty-seven-jackpot__main{font-size:clamp(52px,18vw,112px);line-height:.86;background:linear-gradient(90deg,var(--six),var(--gold),var(--seven));-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-stroke:2px rgba(12,13,24,.16)}.sixty-seven-jackpot.is-out{animation:jackpotOut .38s ease-in forwards}@keyframes jackpotIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}@keyframes jackpotOut{to{opacity:0;transform:scale(1.04)}}.low-power .bg-particle:nth-child(n+5),.low-power .spark:nth-child(n+4){display:none}.low-power .bg-noise{opacity:.025}.low-power .battle__ambient,.low-power .battle__speedlines{animation-duration:2.4s!important;opacity:.55}.is-immersive .server-pill{display:none}html,body,#app,.tap-zone,.battle,.home-battle-cta,button{touch-action:manipulation}`;
    document.head.appendChild(style);
  }

  const lowPower = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (lowPower) document.body.classList.add('low-power');
  installRuntimeCss();

  function getHandImg(id) { return (HAND_CATALOG.find(h => h.id === id) || HAND_CATALOG[0]).img; }
  function getDigitStyle(id) { return DIGIT_CATALOG.find(d => d.id === id) || DIGIT_CATALOG[0]; }
  function getDigitUrl(styleId, side) {
    const item = getDigitStyle(styleId);
    return sideOf(side) === 6 ? item.img6 : item.img7;
  }

  function setText(id, value) { const el = $(id); if (el) el.textContent = value; }
  function setImg(id, src) { const el = $(id); if (el) el.src = src; }

  function applyTranslations() {
    qa('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const map = {
        'matching.title': t('finding'), 'common.cancel': t('cancel'), 'battle.tap': t('tap'),
        'result.reward': t('reward'), 'result.home': t('home'), 'shop.title': t('shop'),
        'top.title': t('top'), 'profile.title': t('profile'), 'nav.profile': t('profile'),
        'nav.fight': t('fight'), 'nav.top': t('top'), 'topbar.shop': t('shop'),
      };
      if (map[key]) el.textContent = map[key];
    });
    document.documentElement.lang = state.lang;
  }

  function show(screen) {
    ['home', 'matching', 'battle', 'result', 'shop', 'top', 'profile'].forEach(name => {
      const el = q(`[data-screen="${name}"]`);
      if (el) el.hidden = name !== screen;
    });
    document.body.classList.toggle('is-immersive', ['matching', 'battle', 'result'].includes(screen));
    qa('.nav-item').forEach(btn => btn.classList.remove('is-active'));
    q(`.nav-item[data-nav="${screen}"]`)?.classList.add('is-active');
    if (screen === 'home') renderHome();
    if (screen === 'top') renderTop();
    if (screen === 'shop') renderShop();
    if (screen === 'profile') renderProfile();
  }

  function applyDesktopGuard() {
    const guard = $('desktop-guard');
    const app = $('app');
    if (!guard || !app) return false;
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(location.hostname);
    const platform = String(tg?.platform || '').toLowerCase();
    const desktopTg = ['tdesktop', 'macos', 'windows', 'linux', 'web', 'weba'].includes(platform);
    const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;
    const blocked = !isLocal && (desktopTg || !mobile);
    document.body.classList.toggle('is-desktop-blocked', blocked);
    guard.hidden = !blocked;
    app.setAttribute('aria-hidden', blocked ? 'true' : 'false');
    return blocked;
  }

  let toastTimer = 0;
  function toast(message) {
    let el = q('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-show'), 1600);
  }

  function ensureServerPill() {
    let el = q('.server-pill');
    if (!el) {
      el = document.createElement('div');
      el.className = 'server-pill';
      document.body.appendChild(el);
    }
    return el;
  }

  function setServerStatus(status, label) {
    const el = ensureServerPill();
    el.dataset.state = status;
    el.textContent = label;
  }

  class RealtimeClient {
    constructor() {
      this.ws = null;
      this.connected = false;
      this.helloSent = false;
      this.reconnectTimer = 0;
      this.serverOffset = 0;
      this.handlers = new Map();
      this.outbox = [];
    }

    on(type, handler) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(handler);
    }

    emit(message) {
      const handlers = this.handlers.get(message.type);
      if (handlers) handlers.forEach(fn => fn(message));
    }

    connect() {
      if (this.ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.ws.readyState)) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${location.host}/ws`);
      this.ws.addEventListener('open', () => {
        this.connected = true;
        this.helloSent = false;
        setServerStatus('online', t('serverOnline'));
        this.sendHello();
        while (this.outbox.length) this.send(this.outbox.shift());
      });
      this.ws.addEventListener('message', event => {
        try {
          const message = JSON.parse(event.data);
          if (message.serverTs) this.serverOffset = Number(message.serverTs) - Date.now();
          this.emit(message);
        } catch {}
      });
      this.ws.addEventListener('close', () => this.handleClose());
      this.ws.addEventListener('error', () => this.handleClose());
    }

    handleClose() {
      if (!this.connected && this.reconnectTimer) return;
      this.connected = false;
      this.helloSent = false;
      setServerStatus('offline', t('serverOffline'));
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 900);
    }

    serverNow() { return Date.now() + this.serverOffset; }

    sendHello() {
      this.helloSent = true;
      this.send({
        type: 'hello',
        playerId: PLAYER_ID,
        name: state.name,
        side: state.side,
        hand: state.hand,
        digit: state.digitStyle,
      });
    }

    send(payload) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.outbox.push(payload);
        this.connect();
        return false;
      }
      this.ws.send(JSON.stringify(payload));
      return true;
    }
  }

  const NET = new RealtimeClient();

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
  };

  let TOP = [];
  let GLOBAL_WAR = { six: 521000, seven: 478000 };
  let matchingTimer = 0;
  let matchingRaf = 0;
  let SHOP_TAB = 'hands';
  let heroOtherHandId = 'clown';

  const CHAOS_WORDS = ['SIX!', 'SEVEN!', '+67 AURA', 'COOKED', 'LOCK IN', 'NO AURA', 'SKIBIDI CHECK', 'BRAINROT', 'WHAT THE SIGMA', 'MANGO MODE'];

  function syncFromServerPlayer(player) {
    if (!player) return;
    state.name = player.name || state.name;
    state.side = sideOf(player.side || state.side);
    state.coins = Number(player.coins ?? state.coins);
    state.stats = { ...state.stats, ...(player.stats || {}) };
    state.weeklyScore = Number(player.weeklyScore ?? state.weeklyScore);
    saveState();
    renderAllStatic();
  }

  function renderAllStatic() {
    applyTranslations();
    syncSideChoice();
    syncTopBar();
    syncHeroHands();
    syncHeroDigits();
    renderReferralCard();
    renderGuildCard();
    renderGlobalWar();
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

  function setSide(side, notify = false) {
    state.side = sideOf(side);
    saveState();
    syncSideChoice();
    syncHeroHands();
    renderReferralCard();
    NET.sendHello();
    if (notify) toast(`${state.lang === 'ru' ? 'Сторона' : 'Side'} ${state.side}`);
  }

  function syncSideChoice() {
    const side = sideOf(state.side);
    qa('.side-btn').forEach(btn => {
      const selected = sideOf(btn.dataset.side) === side;
      btn.classList.toggle('is-selected', selected);
      btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const cta = $('home-battle-cta');
    if (cta) cta.dataset.side = side;
    setText('home-battle-side', side);
    document.body.classList.toggle('is-side-7', side === 7);
  }

  function syncHeroHands() {
    const left = $('hero-hand-left');
    const right = $('hero-hand-right');
    if (!left || !right) return;
    if (heroOtherHandId === state.hand) heroOtherHandId = HAND_CATALOG.find(h => h.id !== state.hand)?.id || 'hand';
    const mine = getHandImg(state.hand);
    const other = getHandImg(heroOtherHandId);
    if (state.side === 6) {
      left.src = mine; right.src = other; left.dataset.owner = 'me'; right.dataset.owner = 'other';
    } else {
      left.src = other; right.src = mine; left.dataset.owner = 'other'; right.dataset.owner = 'me';
    }
  }

  function syncHeroDigits() {
    setImg('hero-digit-6', getDigitUrl(state.digitStyle, 6));
    setImg('hero-digit-7', getDigitUrl(state.digitStyle, 7));
  }

  function renderHome() {
    renderReferralCard();
    renderGuildCard();
    renderGlobalWar();
  }

  function renderReferralCard() {
    const count = Number(state.referrals.sent || 0);
    setText('ref-count', count.toLocaleString('ru-RU'));
    setText('ref-title', count >= 67 ? 'RAID CAPTAIN' : count >= 6 ? 'GANG STARTER' : count >= 1 ? 'SCOUT' : (state.lang === 'ru' ? 'ПОКА НЕТ ТОЛПЫ' : 'NO CROWD YET'));
    setText('ref-meta', count >= 67 ? 'MAX AURA' : `${Math.max(1, (count < 1 ? 1 : count < 6 ? 6 : 67) - count)} refs to next level`);
    const progress = $('ref-progress');
    if (progress) progress.style.width = `${clamp((count / 67) * 100, 4, 100)}%`;
    const tiers = $('ref-tiers');
    if (tiers && !tiers.childElementCount) {
      [1, 6, 67, 670, 6700].forEach(v => {
        const chip = document.createElement('span');
        chip.className = 'ref-tier';
        chip.textContent = v >= 1000 ? `${v / 1000}K` : v;
        tiers.appendChild(chip);
      });
    }
    if (tiers) qa('#ref-tiers .ref-tier').forEach((chip, i) => chip.classList.toggle('is-done', count >= [1, 6, 67, 670, 6700][i]));
  }

  function renderGuildCard() {
    const has = Boolean(state.guild.id);
    const card = $('guild-card');
    if (card) card.dataset.state = has ? 'joined' : 'empty';
    setText('guild-title', has ? state.guild.name : (state.lang === 'ru' ? 'НЕТ ГИЛЬДИИ' : 'NO GUILD'));
    setText('guild-badge', has ? state.guild.tag : 'G');
    setText('guild-meta', has ? `${state.guild.tag} · ${state.guild.members || 1} · ${state.guild.side} GANG` : (state.lang === 'ru' ? 'Создай гильдию или вступи из топа.' : 'Create a guild or join one from Top.'));
    setText('guild-score', Number(state.guild.score || 0).toLocaleString('ru-RU'));
    setText('guild-members', Number(state.guild.members || 0).toLocaleString('ru-RU'));
    setText('guild-reward', has ? '67' : '0');
    setText('guild-reward-line', has ? 'Weekly reward estimate: 67+' : 'Weekly guild rewards unlock after loyalty lock.');
    const create = $('guild-create'), invite = $('guild-invite'), random = $('guild-random'), leave = $('guild-leave');
    if (create) create.hidden = has;
    if (invite) invite.hidden = !has;
    if (random) random.hidden = has;
    if (leave) leave.hidden = !has;
  }

  function renderGlobalWar() {
    const six = Math.max(1, Number(GLOBAL_WAR.six || 0));
    const seven = Math.max(1, Number(GLOBAL_WAR.seven || 0));
    const total = six + seven;
    const pSix = (six / total) * 100;
    const pSeven = 100 - pSix;
    const sixBar = $('war-six'), sevenBar = $('war-seven');
    if (sixBar) sixBar.style.width = `${pSix.toFixed(1)}%`;
    if (sevenBar) sevenBar.style.width = `${pSeven.toFixed(1)}%`;
    setText('war-six-pct', `${pSix.toFixed(1)}%`);
    setText('war-seven-pct', `${pSeven.toFixed(1)}%`);
    setText('war-participation', total.toLocaleString('en-US'));
  }

  function showHomeTapDigit(event) {
    const home = q('[data-screen="home"]');
    if (!home || home.hidden) return;
    if (event.target.closest('button, a, input, textarea, select, .shop-card, .top-row')) return;
    const digit = Math.random() < 0.5 ? '6' : '7';
    const el = document.createElement('div');
    el.className = 'home-tap-digit';
    el.dataset.team = String(state.side);
    el.textContent = digit;
    el.style.left = `${event.clientX}px`;
    el.style.top = `${event.clientY}px`;
    el.style.setProperty('--dx', `${rnd(-28, 28).toFixed(1)}px`);
    el.style.setProperty('--dy', `${rnd(-24, 16).toFixed(1)}px`);
    el.style.setProperty('--rot', `${rnd(-18, 18).toFixed(1)}deg`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 760);
  }

  function startMatchmaking() {
    clearMatchingTimers();
    show('matching');
    setImg('matching-side', getDigitUrl(state.digitStyle, state.side));
    setText('matching-status', t('scan'));
    const sideEl = $('matching-side');
    if (sideEl) sideEl.dataset.side = state.side;
    NET.connect();
    NET.send({ type: 'queue', side: state.side, name: state.name, hand: state.hand, digit: state.digitStyle });
    haptic.medium();
  }

  function clearMatchingTimers() {
    clearInterval(matchingTimer);
    cancelAnimationFrame(matchingRaf);
  }

  function renderMatchingCountdown(searchEndsAt, opponentFound) {
    cancelAnimationFrame(matchingRaf);
    const status = $('matching-status');
    const tick = () => {
      const remain = Math.max(0, searchEndsAt - NET.serverNow());
      const seconds = (remain / 1000).toFixed(1);
      if (status) status.textContent = `${opponentFound ? t('found') : t('scan')} ${seconds}`;
      if (remain > 0) matchingRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  function cancelMatchmaking() {
    clearMatchingTimers();
    NET.send({ type: 'cancel_queue' });
    haptic.warning();
    show('home');
  }

  function beginBattle(payload) {
    clearMatchingTimers();
    Object.assign(BATTLE, {
      matchId: payload.matchId,
      yourSlot: payload.yourSlot,
      mySlot: payload.yourSlot,
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
    });
    BATTLE.enemySlot = BATTLE.participants.find(p => p.slot !== BATTLE.mySlot)?.slot || 'p2';

    const me = BATTLE.participants.find(p => p.slot === BATTLE.mySlot) || {};
    const enemy = BATTLE.participants.find(p => p.slot === BATTLE.enemySlot) || {};
    state.side = sideOf(me.side || state.side);
    saveState();

    setText('me-name', (me.name || state.name).toUpperCase());
    setText('enemy-name', (enemy.name || 'RIVAL').toUpperCase());
    setText('me-score', '0');
    setText('enemy-score', '0');
    setImg('me-side', getDigitUrl(state.digitStyle, state.side));
    setImg('enemy-side', getDigitUrl(state.digitStyle, sideOf(enemy.side || opposite(state.side))));
    $('card-me')?.setAttribute('data-side', state.side);
    $('card-enemy')?.setAttribute('data-side', sideOf(enemy.side || opposite(state.side)));
    setBattleHands(me, enemy);
    setImg('battle-digit', getDigitUrl(state.digitStyle, state.side));
    const digit = $('battle-digit');
    if (digit) digit.dataset.side = state.side;

    const stage = $('battle-stage');
    if (stage) {
      stage.classList.remove('is-final-rush');
      stage.classList.add('is-playing');
      ensureBattleSyncBadge(stage, payload.bot ? 'BOT AFTER 6.7 SEC' : t('serverTruth'));
    }
    const tapHint = q('.tap-zone__hint');
    if (tapHint) tapHint.textContent = t('ready');
    setBattleMeme(t('ready'));
    show('battle');
    updateScoreUI();
    startBattleRaf();
  }

  function setBattleHands(me, enemy) {
    const left = $('battle-hand-left'), right = $('battle-hand-right');
    if (!left || !right) return;
    const myImg = getHandImg(state.hand);
    const enemyImg = getHandImg(enemy.hand || 'hand');
    if (state.side === 6) {
      left.src = myImg; right.src = enemyImg;
    } else {
      left.src = enemyImg; right.src = myImg;
    }
  }

  function ensureBattleSyncBadge(stage, text) {
    let badge = q('.battle__sync');
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'battle__sync';
      stage.appendChild(badge);
    }
    badge.textContent = text;
  }

  function setBattleMeme(text) {
    const el = $('battle-meme');
    if (!el) return;
    el.textContent = text;
    animateElement(el, [{ transform: 'translateZ(0) scale(.92)' }, { transform: 'translateZ(0) scale(1.06)' }, { transform: 'translateZ(0) scale(1)' }], { duration: 220 });
  }

  function startBattleRaf() {
    cancelAnimationFrame(BATTLE.raf);
    const timerNum = $('timer-num');
    const timerFg = $('timer-fg');
    const circ = 2 * Math.PI * 44;
    if (timerFg) timerFg.setAttribute('stroke-dasharray', circ.toFixed(2));
    const tick = () => {
      if (!BATTLE.running) return;
      const serverTime = NET.serverNow();
      if (serverTime < BATTLE.startsAt) {
        const pre = Math.max(0, BATTLE.startsAt - serverTime);
        const label = pre > 760 ? 'SIX!' : pre > 380 ? 'SEVEN!' : t('go');
        if (BATTLE.lastTimerText !== label) {
          BATTLE.lastTimerText = label;
          setBattleMeme(label);
          if (timerNum) timerNum.textContent = (CONFIG.roundMs / 1000).toFixed(1);
        }
      } else {
        if (!BATTLE.acceptingTaps) {
          BATTLE.acceptingTaps = true;
          $('tap-zone')?.classList.add('is-live');
          const hint = q('.tap-zone__hint');
          if (hint) hint.textContent = t('live');
          setBattleMeme(t('live'));
          phraseStorm(10);
        }
        const remain = Math.max(0, BATTLE.endsAt - serverTime);
        const text = (remain / 1000).toFixed(1);
        if (text !== BATTLE.lastTimerText) {
          BATTLE.lastTimerText = text;
          if (timerNum) timerNum.textContent = text;
        }
        if (timerFg) timerFg.style.strokeDashoffset = (circ * (1 - remain / CONFIG.roundMs)).toFixed(2);
        if (remain < 1800) {
          $('battle-stage')?.classList.add('is-final-rush');
          if (q('.battle__sync')) q('.battle__sync').textContent = t('final');
        }
        if (remain <= 0 && !BATTLE.resultReceived) {
          BATTLE.acceptingTaps = false;
          $('tap-zone')?.classList.remove('is-live');
          setBattleMeme('SERVER FINALIZING…');
        }
      }
      BATTLE.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function updateScoreUI() {
    const my = Number(BATTLE.scores[BATTLE.mySlot] || 0);
    const enemy = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
    setText('me-score', my);
    setText('enemy-score', enemy);
    const total = Math.max(1, my + enemy);
    const pSix = state.side === 6 ? (my / total) * 100 : (enemy / total) * 100;
    const sixBar = $('vs-bar-six'), sevenBar = $('vs-bar-seven');
    if (sixBar) sixBar.style.width = `${pSix}%`;
    if (sevenBar) sevenBar.style.width = `${100 - pSix}%`;
  }

  function onBattleTap(event) {
    if (!BATTLE.running || !BATTLE.acceptingTaps) return;
    const serverTime = NET.serverNow();
    if (serverTime < BATTLE.startsAt || serverTime >= BATTLE.endsAt) return;
    BATTLE.tapSeq += 1;
    NET.send({ type: 'tap', matchId: BATTLE.matchId, seq: BATTLE.tapSeq, clientTs: Date.now() });
    haptic.light();
    animateHandForSide(state.side);
    animateCentralDigit();
    spawnFloater(state.side, Math.random() < 0.55 ? (state.side === 6 ? 'SIX!' : 'SEVEN!') : pick(CHAOS_WORDS));
    if (!lowPower || BATTLE.tapSeq % CONFIG.scoreFxEveryNthTap === 0) burstDots(state.side, lowPower ? 3 : 5);
    if (BATTLE.tapSeq % (lowPower ? 8 : 5) === 0) phraseStorm(lowPower ? 2 : 4);
  }

  function animateElement(el, keyframes, options) {
    if (!el) return;
    if (el.animate) return el.animate(keyframes, { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)', ...options });
    el.style.transform = keyframes[keyframes.length - 1]?.transform || '';
  }

  function handElForSide(side) { return sideOf(side) === 6 ? $('battle-hand-left') : $('battle-hand-right'); }
  function animateHandForSide(side) {
    const el = handElForSide(side);
    if (!el) return;
    const direction = sideOf(side) === 6 ? -1 : 1;
    animateElement(el, [
      { transform: `translate3d(0,0,0) rotate(0deg) scale(1)` },
      { transform: `translate3d(${direction * 5}px,10px,0) rotate(${direction * 4}deg) scale(.98)` },
      { transform: `translate3d(0,0,0) rotate(0deg) scale(1)` },
    ], { duration: 150 });
  }

  function animateCentralDigit() {
    const el = $('battle-digit');
    animateElement(el, [{ transform: 'scale(.9) rotate(-2deg)' }, { transform: 'scale(1.14) rotate(2deg)' }, { transform: 'scale(1)' }], { duration: 170 });
  }

  function capFxNodes(layer) {
    const limit = lowPower ? CONFIG.lowPowerFxNodeLimit : CONFIG.fxNodeLimit;
    while (layer.childElementCount > limit) layer.firstElementChild?.remove();
  }

  function spawnFloater(side, text) {
    const layer = $('battle-floaters');
    if (!layer) return;
    capFxNodes(layer);
    const el = document.createElement('div');
    el.className = 'fx-floater';
    el.dataset.side = sideOf(side);
    el.textContent = text;
    const left = sideOf(side) === 6 ? rnd(12, 42) : rnd(58, 88);
    el.style.left = `${left}%`;
    el.style.top = `${rnd(28, 68)}%`;
    el.style.setProperty('--tx', `${rnd(-55, 55).toFixed(1)}px`);
    el.style.setProperty('--ty', `${rnd(-96, -52).toFixed(1)}px`);
    el.style.setProperty('--rot', `${rnd(-18, 18).toFixed(1)}deg`);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 780);
  }

  function burstDots(side, amount) {
    const layer = $('battle-floaters');
    if (!layer) return;
    capFxNodes(layer);
    const baseX = sideOf(side) === 6 ? 28 : 72;
    for (let i = 0; i < amount; i += 1) {
      const dot = document.createElement('span');
      dot.className = 'fx-dot';
      dot.dataset.side = sideOf(side);
      dot.style.left = `${baseX + rnd(-8, 8)}%`;
      dot.style.top = `${rnd(52, 70)}%`;
      dot.style.setProperty('--tx', `${rnd(-42, 42).toFixed(1)}px`);
      dot.style.setProperty('--ty', `${rnd(-92, -36).toFixed(1)}px`);
      layer.appendChild(dot);
      setTimeout(() => dot.remove(), 620);
    }
  }

  function phraseStorm(amount) {
    for (let i = 0; i < amount; i += 1) {
      setTimeout(() => {
        const side = Math.random() < 0.5 ? 6 : 7;
        spawnFloater(side, pick(CHAOS_WORDS));
      }, i * (lowPower ? 86 : 46));
    }
  }

  function pick(list) { return list[Math.floor(Math.random() * list.length)] || list[0]; }

  function showJackpot(slot) {
    if (BATTLE.jackpotSlots.has(slot)) return;
    BATTLE.jackpotSlots.add(slot);
    const isMine = slot === BATTLE.mySlot;
    if (isMine) {
      haptic.heavy();
      setTimeout(() => haptic.success(), 150);
    }
    const old = q('.sixty-seven-jackpot');
    old?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'sixty-seven-jackpot';
    overlay.innerHTML = `<div class="sixty-seven-jackpot__box"><div class="sixty-seven-jackpot__badge">${t('jackpot')}</div><div class="sixty-seven-jackpot__main">SIX<br>SEVEN</div></div>`;
    document.body.appendChild(overlay);
    for (let i = 0; i < (lowPower ? 14 : 28); i += 1) {
      setTimeout(() => spawnFloater(Math.random() < 0.5 ? 6 : 7, i % 3 ? '67!' : '+67 AURA'), i * 22);
    }
    setTimeout(() => overlay.classList.add('is-out'), 1900);
    setTimeout(() => overlay.remove(), 2350);
  }

  function renderResult(payload) {
    BATTLE.resultReceived = true;
    BATTLE.running = false;
    BATTLE.acceptingTaps = false;
    cancelAnimationFrame(BATTLE.raf);
    $('tap-zone')?.classList.remove('is-live', 'is-armed');
    $('battle-stage')?.classList.remove('is-playing', 'is-final-rush');

    const myScore = Number(payload.scores?.[BATTLE.mySlot] || 0);
    const enemyScore = Number(payload.scores?.[BATTLE.enemySlot] || 0);
    const myWin = payload.winnerSlot === BATTLE.mySlot;
    const tie = !payload.winnerSlot;
    const reward = myWin ? Math.floor(50 + myScore * 0.8) : (tie ? 20 : 10);

    const verdict = $('result-verdict');
    if (verdict) {
      verdict.classList.remove('is-win', 'is-lose', 'is-tie');
      verdict.textContent = tie ? t('draw') : myWin ? t('victory') : t('defeat');
      verdict.classList.add(tie ? 'is-tie' : myWin ? 'is-win' : 'is-lose');
    }
    setText('result-subtitle', myScore === 67 ? t('jackpot') : `${state.side} GANG · ${t('serverTruth')}`);
    setImg('result-side', getDigitUrl(state.digitStyle, myWin || tie ? state.side : opposite(state.side)));
    const sideEl = $('result-side');
    if (sideEl) sideEl.dataset.side = myWin || tie ? state.side : opposite(state.side);
    setText('result-my-score', myScore);
    setText('result-enemy-score', enemyScore);
    setText('result-reward', reward);
    setText('result-callout-title', myScore === 67 ? 'SIX SEVEN PROPHECY' : myWin ? `GANG ${state.side} COOKED` : tie ? 'MID-OFF DETECTED' : 'MINUS AURA');
    setText('result-callout-text', `Final score was committed by backend and saved to DB. Match: ${payload.matchId.slice(-8)}`);
    if (payload.player) syncFromServerPlayer(payload.player);
    if (payload.top) TOP = payload.top;
    if (payload.globalWar) GLOBAL_WAR = payload.globalWar;

    setText('result-streak', state.stats.streakType === 'win' ? `WIN STREAK x${state.stats.currentStreak}` : state.stats.streakType === 'lose' ? `SHAME STREAK x${state.stats.currentStreak}` : 'STREAK RESET');
    setText('result-shame', myScore === 67 ? 'SHARE JACKPOT' : `SHAME A ${opposite(state.side)}`);
    if (myScore === 67) setTimeout(() => showJackpot(BATTLE.mySlot), 160);
    if (myWin) haptic.success(); else if (tie) haptic.warning(); else haptic.error();
    show('result');
  }

  function renderShop() {
    const grid = $('shop-grid');
    if (!grid) return;
    setText('shop-coins', Number(state.coins || 0).toLocaleString('ru-RU'));
    grid.innerHTML = '';
    const data = SHOP_TAB === 'hands' ? HAND_CATALOG : DIGIT_CATALOG;
    data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'shop-card';
      const rarity = document.createElement('div');
      rarity.className = `shop-card__rarity shop-card__rarity--${item.rarity}`;
      rarity.textContent = item.rarity.toUpperCase();
      card.appendChild(rarity);
      if (SHOP_TAB === 'hands') {
        const img = document.createElement('img');
        img.className = 'shop-card__img';
        img.src = item.img; img.alt = item.name;
        card.appendChild(img);
      } else {
        const preview = document.createElement('div');
        preview.className = 'shop-card__digit-preview';
        preview.innerHTML = `<img src="${item.img6}" alt="6"><img src="${item.img7}" alt="7">`;
        card.appendChild(preview);
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
        cta.classList.add('is-equipped'); cta.textContent = t('equipped');
      } else if (owned) {
        cta.classList.add('is-owned'); cta.textContent = t('equip');
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

  function equipItem(item) {
    if (SHOP_TAB === 'hands') state.hand = item.id;
    else state.digitStyle = item.id;
    saveState();
    syncHeroHands();
    syncHeroDigits();
    renderShop();
    NET.sendHello();
    haptic.success();
  }

  function buyItem(item) {
    if (state.coins < item.price) { toast(t('noCoins')); haptic.error(); return; }
    state.coins -= item.price;
    if (SHOP_TAB === 'hands') {
      state.ownedHands.push(item.id); state.hand = item.id;
    } else {
      state.ownedDigits.push(item.id); state.digitStyle = item.id;
    }
    saveState();
    renderAllStatic();
    renderShop();
    NET.sendHello();
    haptic.success();
  }

  function seededFakeTop() {
    const names = ['ZenBoy', 'Cooked67', 'NoChill', 'AlphaGen', 'SevenLord', 'SixBoss', 'AuraDebt', 'BloxKid', 'mishakek', 'pluh', 'GYAT', 'KleoX', 'Spectre'];
    return Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, name: names[i % names.length] + (i > 12 ? i : ''), side: i % 2 ? 7 : 6, score: 12670 - i * 67 }));
  }

  function renderTop() {
    NET.send({ type: 'get_top' });
    const list = $('top-list');
    if (!list) return;
    list.innerHTML = '';
    const board = TOP.length ? TOP : seededFakeTop();
    board.slice(0, 100).forEach((p, index) => {
      const place = p.rank || index + 1;
      const row = document.createElement('div');
      row.className = 'top-row';
      if (p.id === PLAYER_ID) row.classList.add('is-me');
      if (place === 1) row.classList.add('top-row--gold');
      else if (place === 2) row.classList.add('top-row--silver');
      else if (place === 3) row.classList.add('top-row--bronze');
      else if (place === 67) row.classList.add('top-row--lucky67');
      row.innerHTML = `<div class="top-row__rank">${place}</div><div class="top-row__name">${escapeHtml(p.name || 'Alpha67')}${p.id === PLAYER_ID ? ' (YOU)' : ''}</div><div class="top-row__right"><span class="top-row__side" data-side="${sideOf(p.side)}">${sideOf(p.side)}</span><span class="top-row__score">${Number(p.score || 0).toLocaleString('ru-RU')}</span>${place === 67 ? '<span class="top-row__prize">⭐ 67</span>' : ''}</div>`;
      list.appendChild(row);
    });
    const reset = $('reset-in');
    if (reset) reset.textContent = weeklyResetText();
  }

  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }

  function weeklyResetText() {
    const d = new Date();
    const day = d.getUTCDay();
    const daysUntilMonday = (8 - day) % 7 || 7;
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysUntilMonday, 0, 0, 0);
    const ms = next - Date.now();
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
    const name = prompt(state.lang === 'ru' ? 'Название гильдии?' : 'Guild name?');
    if (!name) return;
    const clean = name.replace(/[^A-Za-zА-Яа-яЁё0-9 _.-]/g, '').trim().slice(0, 20) || `GANG ${state.side}`;
    state.guild = { id: `g${Date.now().toString(36)}`, name: clean, tag: clean.replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').toUpperCase().slice(0, 3) || 'GNG', side: state.side, score: 67, members: 1, invites: 0, lockedUntil: Date.now() + 86400000 };
    saveState();
    renderGuildCard();
  }

  function joinRandomGuild() {
    state.guild = { id: `fake${Date.now().toString(36)}`, name: state.side === 6 ? 'Six Mafia' : 'Seven Cult', tag: state.side === 6 ? 'SIX' : 'S7N', side: state.side, score: 67, members: 67, invites: 0, lockedUntil: Date.now() + 86400000 };
    saveState(); renderGuildCard(); haptic.success();
  }

  function leaveGuild() {
    state.guild = { ...DEFAULT_STATE.guild, cooldownUntil: Date.now() + 43200000 };
    saveState(); renderGuildCard(); haptic.warning();
  }

  function shareText(text, url = location.href) {
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }

  function referralLink() {
    const param = `r_${state.referrals.code}_${state.side}`;
    const bot = String(window.SIX_SEVEN_BOT_USERNAME || '').replace(/^@/, '');
    const app = String(window.SIX_SEVEN_APP_NAME || '');
    if (bot) return `https://t.me/${bot}${app ? `/${encodeURIComponent(app)}` : ''}?startapp=${param}`;
    const url = new URL(location.href);
    url.searchParams.set('tgWebAppStartParam', param);
    return url.toString();
  }

  function bindEvents() {
    qa('.side-btn').forEach(btn => btn.addEventListener('click', () => { setSide(btn.dataset.side, true); haptic.medium(); }));
    $('home-battle-cta')?.addEventListener('click', startMatchmaking);
    $('matching-cancel')?.addEventListener('click', cancelMatchmaking);
    $('tap-zone')?.addEventListener('pointerdown', onBattleTap, { passive: true });
    $('battle-stage')?.addEventListener('pointerdown', onBattleTap, { passive: true });
    q('[data-screen="home"]')?.addEventListener('pointerdown', showHomeTapDigit, { passive: true });

    qa('.nav-item').forEach(btn => btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      haptic.select();
      if (target === 'battle-quick') return startMatchmaking();
      if (target === 'profile') return show('profile');
      if (target === 'top') return show('top');
      show('home');
    }));
    qa('[data-go-home]').forEach(btn => btn.addEventListener('click', () => show('home')));
    $('open-profile-top')?.addEventListener('click', () => show('profile'));
    $('open-shop-top')?.addEventListener('click', () => show('shop'));
    $('result-home')?.addEventListener('click', () => show('home'));
    $('result-shame')?.addEventListener('click', () => shareText(`${state.side} GANG scored ${$('result-my-score')?.textContent || 0} in 6.7 sec. Beat this.`));
    $('result-raid')?.addEventListener('click', () => shareText(`${state.side} GANG RAID. ${opposite(state.side)} GANG defend your aura.`));
    $('ref-invite')?.addEventListener('click', () => { state.referrals.sent += 1; saveState(); renderReferralCard(); shareText(`I picked ${state.side} GANG. Join or accept aura debt.`, referralLink()); });
    $('guild-create')?.addEventListener('click', createGuild);
    $('guild-random')?.addEventListener('click', joinRandomGuild);
    $('guild-leave')?.addEventListener('click', leaveGuild);
    $('guild-invite')?.addEventListener('click', () => shareText(`Join my ${state.guild.name || '67'} guild.`));
    qa('.shop-tab').forEach(btn => btn.addEventListener('click', () => {
      SHOP_TAB = btn.dataset.shopTab || 'hands';
      qa('.shop-tab').forEach(x => x.classList.toggle('is-active', x === btn));
      renderShop();
    }));
    qa('[data-top-tab]').forEach(btn => btn.addEventListener('click', () => { qa('[data-top-tab]').forEach(x => x.classList.toggle('is-active', x === btn)); renderTop(); }));
  }

  let lastTouchEnd = 0;
  function preventDoubleTapZoom(event) {
    const ts = Date.now();
    if (ts - lastTouchEnd <= 300) event.preventDefault();
    lastTouchEnd = ts;
  }

  NET.on('hello_required', msg => { Object.assign(CONFIG, msg.config || {}); NET.sendHello(); });
  NET.on('player_state', msg => {
    Object.assign(CONFIG, msg.config || {});
    syncFromServerPlayer(msg.player);
    TOP = msg.top || TOP;
    GLOBAL_WAR = msg.globalWar || GLOBAL_WAR;
    renderGlobalWar();
  });
  NET.on('queue_state', msg => {
    if (!q('[data-screen="matching"]')?.hidden) {
      renderMatchingCountdown(Number(msg.searchEndsAt), Boolean(msg.opponentFound));
      if (msg.opponentFound) setText('matching-status', t('found'));
    }
  });
  NET.on('queue_cancelled', () => { clearMatchingTimers(); show('home'); });
  NET.on('match_start', beginBattle);
  NET.on('match_live', () => { BATTLE.acceptingTaps = true; });
  NET.on('score_update', msg => {
    if (msg.matchId !== BATTLE.matchId) return;
    const prevMine = Number(BATTLE.scores[BATTLE.mySlot] || 0);
    const prevEnemy = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
    BATTLE.scores = { ...BATTLE.scores, ...(msg.scores || {}) };
    updateScoreUI();
    const mine = Number(BATTLE.scores[BATTLE.mySlot] || 0);
    const enemy = Number(BATTLE.scores[BATTLE.enemySlot] || 0);
    if (mine > prevMine) {
      animateHandForSide(state.side);
      if (mine === 67) showJackpot(BATTLE.mySlot);
    }
    if (enemy > prevEnemy) {
      const enemySide = sideOf(BATTLE.participants.find(p => p.slot === BATTLE.enemySlot)?.side || opposite(state.side));
      animateHandForSide(enemySide);
      if (enemy % (lowPower ? 4 : 2) === 0) spawnFloater(enemySide, enemySide === 6 ? 'SIX!' : 'SEVEN!');
    }
  });
  NET.on('jackpot', msg => { if (msg.matchId === BATTLE.matchId) showJackpot(msg.slot); });
  NET.on('match_result', renderResult);
  NET.on('top_state', msg => { TOP = msg.top || []; GLOBAL_WAR = msg.globalWar || GLOBAL_WAR; if (!q('[data-screen="top"]')?.hidden) renderTop(); renderGlobalWar(); });
  NET.on('error', msg => { if (msg.message) toast(msg.message); });

  function bootStartParam() {
    const raw = tg?.initDataUnsafe?.start_param || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
    const ref = raw.match(/^r_([A-Za-z0-9]{4,24})(?:_([67]))?$/);
    if (ref && !state.referrals.firstTouchClaimed && ref[1] !== state.referrals.code) {
      state.referrals.firstTouchClaimed = true;
      state.referrals.referredBy = ref[1];
      state.coins += 67;
      if (ref[2]) state.side = Number(ref[2]);
      saveState();
      toast('+67 aura');
    }
  }

  function boot() {
    applyTranslations();
    bindEvents();
    bootStartParam();
    renderAllStatic();
    NET.connect();
    setInterval(() => {
      if (!q('[data-screen="home"]')?.hidden) {
        heroOtherHandId = HAND_CATALOG[Math.floor(Math.random() * HAND_CATALOG.length)].id;
        if (heroOtherHandId === state.hand) heroOtherHandId = 'clown';
        syncHeroHands();
      }
    }, 6700);
    if (!applyDesktopGuard()) show('home');
    window.addEventListener('resize', applyDesktopGuard);
  }

  boot();
})();
