/* ============================================
   67 — APP LOGIC
   ============================================ */

// ---------- Telegram WebApp init ----------
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // disable swipe-to-close while in battle (some clients support it)
  tg.disableVerticalSwipes?.();
}

const haptic = {
  light:  () => tg?.HapticFeedback?.impactOccurred?.('light'),
  medium: () => tg?.HapticFeedback?.impactOccurred?.('medium'),
  heavy:  () => tg?.HapticFeedback?.impactOccurred?.('heavy'),
  success:() => tg?.HapticFeedback?.notificationOccurred?.('success'),
  warning:() => tg?.HapticFeedback?.notificationOccurred?.('warning'),
  error:  () => tg?.HapticFeedback?.notificationOccurred?.('error'),
  select: () => tg?.HapticFeedback?.selectionChanged?.(),
};

// ---------- Client language ----------
function normalizeLangCode(value) {
  return String(value || '').trim().toLowerCase().replace('_', '-');
}

function isRussianLang(value) {
  const lang = normalizeLangCode(value);
  return lang === 'ru' || lang.startsWith('ru-');
}

function detectClientLang() {
  const telegramLang = tg?.initDataUnsafe?.user?.language_code;
  const deviceLangs = Array.isArray(navigator.languages) ? navigator.languages : [];
  const browserLangs = [navigator.language, navigator.userLanguage].filter(Boolean);
  const sources = [telegramLang, ...deviceLangs, ...browserLangs].filter(Boolean);
  return sources.some(isRussianLang) ? 'ru' : 'en';
}

// ---------- Desktop guard ----------
function isProbablyMobileDevice() {
  const ua = navigator.userAgent || '';
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const touchCapable = (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
  const compactViewport = Math.min(window.innerWidth || 0, screen.width || 0) <= 820;
  return mobileUA || (touchCapable && compactViewport);
}

function isDesktopLaunch() {
  const platform = String(tg?.platform || '').toLowerCase();
  const desktopTelegramPlatforms = new Set(['tdesktop', 'macos', 'windows', 'linux', 'web', 'weba']);
  if (desktopTelegramPlatforms.has(platform)) return true;
  return !isProbablyMobileDevice();
}

function applyDesktopGuard() {
  const guard = document.getElementById('desktop-guard');
  const appEl = document.getElementById('app');
  if (!guard || !appEl) return false;

  const blocked = isDesktopLaunch();
  document.body.classList.toggle('is-desktop-blocked', blocked);
  guard.hidden = !blocked;
  appEl.setAttribute('aria-hidden', blocked ? 'true' : 'false');

  if (blocked) {
    const ru = detectClientLang() === 'ru';
    const title = document.getElementById('desktop-guard-title');
    const text = document.getElementById('desktop-guard-text');
    const note = document.getElementById('desktop-guard-note');
    if (ru) {
      if (title) title.textContent = 'ИГРАЙ С ТЕЛЕФОНА';
      if (text) text.textContent = 'Эта брейнрот-битва работает только в мобильном Telegram. Открой игру на телефоне, чтобы тапать за 6 или 7.';
      if (note) note.textContent = 'Обнаружен ПК. Отправь Mini App себе и открой его на iOS или Android.';
    }
    tg?.BackButton?.hide?.();
  }
  return blocked;
}

// ---------- State (persisted) ----------
const STORE_KEY = 'six-seven::state-v1';

function makeLocalReferralCode() {
  const id = tg?.initDataUnsafe?.user?.id;
  if (id) return 'u' + Number(id).toString(36);
  return 'g' + Math.random().toString(36).slice(2, 9);
}

const DEFAULT_STATE = {
  name: tg?.initDataUnsafe?.user?.first_name || 'Alpha67',
  coins: 250,
  side: 6, // chosen side
  hand: 'hand',   // owned & equipped hand skin id
  digitStyle: 'classic',
  ownedHands: ['hand'],
  ownedDigits: ['classic'],
  stats: { wins: 0, losses: 0, ties: 0, best: 0, totalTaps: 0, currentStreak: 0, streakType: 'none' },
  weeklyScore: 0,
  referrals: { code: makeLocalReferralCode(), sent: 0, accepted: 0, referredBy: '', firstTouchClaimed: false },
  guild: { id: '', name: '', tag: '', side: 6, score: 0, members: 0, invites: 0, createdAt: 0, joinedAt: 0, lockedUntil: 0, lastLeftAt: 0, cooldownUntil: 0 },
  lang: detectClientLang(),
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT_STATE }; }
}
function saveState() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch {}
}
let state = loadState();
state.stats = { ...DEFAULT_STATE.stats, ...(state.stats || {}) };
state.referrals = { ...DEFAULT_STATE.referrals, ...(state.referrals || {}) };
state.guild = { ...DEFAULT_STATE.guild, ...(state.guild || {}) };
if (!state.referrals.code) state.referrals.code = makeLocalReferralCode();

// Language is driven by the Telegram/client/device language on every launch.
// Russian client -> Russian UI; everything else -> English UI.
const detectedClientLang = detectClientLang();
if (state.lang !== detectedClientLang) {
  state.lang = detectedClientLang;
  saveState();
}

// Migration: in 0.1.5 we replaced digit catalog ids (graffiti/royal/cosmic ➜ clown/devil/robo).
// Map legacy ids to their new visual equivalents so existing users keep equivalent gear.
(function migrateLegacyCatalog() {
  const DIGIT_MIGRATION = { graffiti: 'clown', royal: 'devil', cosmic: 'robo' };
  const HAND_MIGRATION  = {}; // hand ids are unchanged
  let dirty = false;

  if (DIGIT_MIGRATION[state.digitStyle]) {
    state.digitStyle = DIGIT_MIGRATION[state.digitStyle];
    dirty = true;
  }
  if (Array.isArray(state.ownedDigits)) {
    const before = state.ownedDigits.join('|');
    state.ownedDigits = Array.from(new Set(
      state.ownedDigits.map(id => DIGIT_MIGRATION[id] || id)
    ));
    if (state.ownedDigits.join('|') !== before) dirty = true;
  }
  if (!state.ownedDigits?.includes('classic')) {
    state.ownedDigits = ['classic', ...(state.ownedDigits || [])];
    dirty = true;
  }
  if (HAND_MIGRATION[state.hand]) {
    state.hand = HAND_MIGRATION[state.hand];
    dirty = true;
  }
  if (!state.ownedHands?.includes('hand')) {
    state.ownedHands = ['hand', ...(state.ownedHands || [])];
    dirty = true;
  }
  if (dirty) saveState();
})();

// ============================================================
// i18n — EN / RU dictionaries + t() helper
// ============================================================
const LOCALES = {
  en: {
    'topbar.shop': 'SHOP',
    'hero.or': 'OR',
    'hero.tag': 'PICK A SIDE. TAP TO WIN.',
    'side.im6': "I'M\u00a06",
    'side.im7': "I'M\u00a07",
    'side.yourSide': 'YOUR SIDE',
    'side.hint': 'now hit the big button',
    'cta.ready': 'READY?',
    'cta.fightFor': 'FIGHT FOR',
    'cta.sub': '6.7 SEC • TAP FAST',
    'cta.tapHere': '👆 TAP HERE 👆',
    'ref.eyebrow': '5-LEVEL REF WAR',
    'ref.countLabel': 'REFS',
    'ref.invite': 'INVITE GANG',
    'ref.firstTouch': 'FIRST INVITER OWNS THE CROWD.',
    'ref.tier0': 'NO CROWD YET',
    'ref.tier1': 'SCOUT',
    'ref.tier2': 'GANG STARTER',
    'ref.tier3': 'RAID CAPTAIN',
    'ref.tier4': 'MOB LEADER',
    'ref.tier5': 'ALPHA MOB BOSS',
    'ref.reward0': 'Invite first friends to start the ladder',
    'ref.reward1': '+67 coins starter flex',
    'ref.reward2': 'Invite badge and shame priority',
    'ref.reward3': '67 cult status and raid aura',
    'ref.reward4': 'Influencer-level crowd claim',
    'ref.reward5': 'Founder-level mob boss aura',
    'ref.toNext': '{n} refs to {tier}',
    'ref.maxed': 'MAX LEVEL. THE CROWD IS YOURS.',
    'ref.shareText': 'I picked {side} GANG. Join first or accept aura debt.',
    'ref.acceptedToast': '+67 coins. Referral aura accepted',
    'curse.label': "TODAY'S CURSE",
    'challenge.incoming': 'INCOMING SHAME LINK',
    'challenge.defend': 'DEFEND {side}',
    'challenge.titleCalledOut': '{side} GANG CALLED YOU OUT',
    'challenge.meta': 'Beat {score} taps in 6.7 sec. Defend {side}.',
    'challenge.toast': '{side} gang challenged you',
    'war.global': 'GLOBAL WAR',
    'war.participation': 'WORLD PARTICIPATION',
    'war.chatLabel': 'TELEGRAM CHAT WAR',
    'war.chatGroup': 'THIS CHAT WAR',
    'war.chatChannel': 'CHANNEL WAR',
    'war.chatDM': 'DM WAR',
    'war.inviteChat': 'INVITE A CHAT',
    'war.sixCooking': '6 IS COOKING',
    'war.sevenCooking': '7 IS COOKING',
    'war.equal': 'EQUAL BRAINROT',
    'matching.title': 'FINDING OPPONENT',
    'matching.scan': 'Scanning the world…',
    'matching.calling': 'Calling all {side}…',
    'matching.found': 'Found a worthy rival…',
    'matching.locking': 'Locking horns…',
    'common.cancel': 'CANCEL',
    'common.home': 'HOME',
    'common.sides6': 'SIXES',
    'common.sides7': 'SEVENS',
    'battle.tap': 'TAP TAP TAP',
    'battle.tapLive': 'TAP! TAP! TAP!',
    'battle.getReady': 'GET READY',
    'battle.finalRush': 'FINAL RUSH!',
    'battle.you': 'YOU',
    'battle.rival': 'RIVAL',
    'result.yourTaps': 'Your taps',
    'result.rivalTaps': 'Rival taps',
    'result.reward': 'Reward',
    'result.taps': 'TAPS',
    'result.victory': 'VICTORY',
    'result.defeat': 'DEFEAT',
    'result.draw': 'DRAW',
    'result.rematch': 'REMATCH',
    'result.home': 'BACK TO HOME',
    'result.raid': 'RAID A CHAT',
    'result.copy': 'COPY FLEX LINK',
    'result.story': 'STORY',
    'result.shameSide': 'SHAME A {side}',
    'result.shareJackpot': 'SHARE JACKPOT',
    'result.cardShame': 'SOCIAL SHAME CARD',
    'result.cardJackpot': 'BRAINROT JACKPOT',
    'result.cookedTitle': '{a} COOKED {b}',
    'result.tiedTitle': '{a} TIED {b}',
    'result.cookedYouTitle': 'YOU GOT COOKED',
    'result.exact67Title': 'EXACT 67 HIT',
    'result.captionSend': 'SEND THIS TO A {side}',
    'result.captionJackpot': 'SEND THE JACKPOT TO EVERY CHAT',
    'result.challengeWon': 'YOU DEFENDED {side}. {enemy} GOT COOKED.',
    'result.challengeLost': 'YOU LOST THE DUEL. {enemy} CONVERTED YOUR AURA.',
    'result.calloutJackpotTitle': 'SIX SEVEN PROPHECY',
    'result.calloutJackpotText': 'Exact 67. {side} GANG legally owns the chat now.',
    'result.calloutWinTitle': 'REAL ALPHA FIGHTER OF {side} GANG',
    'result.calloutWinText': 'You cooked them. Now shame the other number before they recover.',
    'result.calloutLoseTitle': 'MINUS AURA',
    'result.calloutLoseText': '{side} GANG saw that. Run it back later or live with the shame.',
    'result.calloutTieTitle': 'MID-OFF DETECTED',
    'result.calloutTieText': 'Nobody cooked. Nobody ate. This is suspicious behavior.',
    'result.streakWin': 'WIN STREAK x{n}',
    'result.streakLose': 'SHAME STREAK x{n}',
    'result.streakTie': 'STREAK RESET',
    'shop.title': 'SHOP',
    'shop.hands': 'HANDS',
    'shop.digits': 'DIGITS',
    'shop.equipped': 'EQUIPPED',
    'shop.equip': 'EQUIP',
    'shop.notEnough': 'Not enough coins',
    'shop.unlocked': 'Unlocked: {name}',
    'shop.equippedToast': '{name} equipped',
    'rarity.common': 'COMMON',
    'rarity.rare': 'RARE',
    'rarity.epic': 'EPIC',
    'rarity.legend': 'LEGEND',
    'top.title': 'WEEKLY TOP',
    'top.resetsIn': 'Resets in',
    'top.prizePool': 'PRIZE POOL',
    'top.starsPowered': 'TG STARS',
    'top.prizeGift': '+ NFT GIFT',
    'top.specialText': 'EXACT 67TH PLACE WINS',
    'top.hint': 'Top 3 and the player landing on rank #67 each week win Telegram Stars and a special TG gift, delivered straight to your account.',
    'top.you': 'YOU',
    'top.youRank': 'YOU ARE #{rank}',
    'top.outsideText': 'Top 100 only. Your shame position is tracked separately.',
    'profile.title': 'PROFILE',
    'profile.wins': 'WINS',
    'profile.losses': 'LOSSES',
    'profile.best': 'BEST',
    'profile.yourSide': 'YOUR SIDE',
    'profile.language': 'LANGUAGE',
    'profile.langSwitched': 'Language switched to English',
    'nav.profile': 'PROFILE',
    'nav.fight': 'FIGHT',
    'nav.top': 'TOP',
    'rank.RECRUIT': 'RECRUIT',
    'rank.STREET FIGHTER': 'STREET FIGHTER',
    'rank.CONTENDER': 'CONTENDER',
    'rank.CHAMPION': 'CHAMPION',
    'rank.LEGEND': 'LEGEND',
    'side.locked': 'Side {side} locked',
    'time.daysHours': '{d}d {h}h',
    'time.hoursMin': '{h}h {m}m',
    'toast.copied': 'Copied. Now go shame someone',
    'toast.copyFailed': 'Copy failed',
    'toast.storyMissing': 'Story asset missing — copied flex text',
    'battle.go': 'GO!',
    'battle.memeDefault': 'SIX • SEVEN • TAP!',
    'battle.comboStreak': 'NICE STREAK!',
    'battle.comboCooking': 'KEEP COOKING!',
    'battle.comboLocked': 'LOCKED IN 🔥',
    'battle.comboGod': 'SIX SEVEN GOD MODE!',
    'battle.kickerCombo': 'COMBO',
    'battle.kickerFire': 'FIRE',
    'battle.kickerLocked': 'LOCKED',
    'battle.kickerGod': 'GOD',
    'jackpot.badge': '67 POINTS HIT',
    'jackpot.sub': '+67 AURA • BRAINROT JACKPOT',
    'item.classic': 'CLASSIC',
    'item.joker':   'JOKER',
    'item.blocky':  'BLOCKY',
    'item.sponge':  'SPONGE',
    'item.demon':   'DEMON',
    'item.blox':    'BLOX',
    'item.cyborg':  'CYBORG',
    'social.exact67': 'СИИИИИИСК СЕЕЕЕВЕЕЕН. I hit EXACTLY 67 taps for {side} GANG.',
    'social.win':     '{side} GANG cooked {enemy} with {score} taps in 6.7 sec.',
    'social.lose':    '{side} GANG got cooked but still dropped {score} taps. {enemy} explain.',
    'social.raid':    '{side} GANG IS RAIDING THIS CHAT. {enemy} GANG, DEFEND YOUR AURA. {curse}',
    'social.storyTail':  ' +67 aura or aura debt, no in-between.',
    'social.shameTail':  ' Try to beat me or accept aura debt. {curse}',
    'guild.eyebrow': 'GUILD WAR',
    'guild.score': 'SCORE',
    'guild.members': 'MEMBERS',
    'guild.reward': 'REWARD',
    'guild.create': 'CREATE GUILD',
    'guild.invite': 'INVITE',
    'guild.joinRandom': 'JOIN RANDOM',
    'guild.leave': 'LEAVE',
    'guild.noGuild': 'NO GUILD',
    'guild.emptyMeta': 'Create a guild or join one from Top.',
    'guild.inGuildMeta': '{tag} · {members} members · {side} GANG',
    'guild.locked': 'Guild lock: {time}',
    'guild.leaveLocked': 'Stay {time} more before leaving. No drop-hunting.',
    'guild.rewardLine': 'Weekly reward estimate: {reward} coins if rank holds.',
    'guild.noReward': 'Join a guild to farm weekly rewards.',
    'guild.prompt': 'Guild name?',
    'guild.created': 'Guild created. First inviter owns the crowd.',
    'guild.joined': 'Joined {name}. Loyalty lock active.',
    'guild.left': 'You left the guild. 12h cooldown started.',
    'guild.inviteText': 'Join my {name} guild. First wave gets aura, late wave gets cooked.',
    'guild.topRewards': 'GUILD WEEKLY REWARDS',
    'guild.reward1': 'Founder chest + aura crown',
    'guild.reward2': 'Raid chest',
    'guild.reward3': 'Gang chest',
    'guild.reward67': 'Meme jackpot',
    'guild.rules': 'Members must stay 24h before rewards. Leaving starts a 12h cooldown.',
    'guild.youRank': 'YOUR GUILD #{rank}',
    'guild.outsideTop': 'Farm taps or invite friends to break into Top-100.',
    'top.players': 'PLAYERS',
    'top.guilds': 'GUILDS',
  },
  ru: {
    'topbar.shop': 'МАГАЗИН',
    'hero.or': 'ИЛИ',
    'hero.tag': 'ВЫБЕРИ СТОРОНУ. ТАПАЙ И ПОБЕЖДАЙ.',
    'side.im6': 'Я\u00a06',
    'side.im7': 'Я\u00a07',
    'side.yourSide': 'ТВОЯ СТОРОНА',
    'side.hint': 'теперь жми большую кнопку',
    'cta.ready': 'ГОТОВ?',
    'cta.fightFor': 'БЕЙСЯ ЗА',
    'cta.sub': '6.7 СЕК • ТАПАЙ БЫСТРО',
    'cta.tapHere': '👆 ЖМИ СЮДА 👆',
    'ref.eyebrow': '5 УРОВНЕЙ РЕФ-ВОЙНЫ',
    'ref.countLabel': 'РЕФОВ',
    'ref.invite': 'ПОЗВАТЬ GANG',
    'ref.firstTouch': 'ПЕРВЫЙ ПРИГЛАСИЛ — ТОЛПА ТВОЯ.',
    'ref.tier0': 'ТОЛПЫ ПОКА НЕТ',
    'ref.tier1': 'РАЗВЕДЧИК',
    'ref.tier2': 'СБОРЩИК GANG',
    'ref.tier3': 'КАПИТАН РЕЙДА',
    'ref.tier4': 'ЛИДЕР ТОЛПЫ',
    'ref.tier5': 'АЛЬФА-БОСС МОБА',
    'ref.reward0': 'Позови первых друзей, чтобы запустить лестницу',
    'ref.reward1': '+67 монет за первый flex',
    'ref.reward2': 'Реф-бейдж и приоритет позора',
    'ref.reward3': 'Статус культа 67 и рейд-аура',
    'ref.reward4': 'Инфлюенсерский захват толпы',
    'ref.reward5': 'Founder-аура альфа-босса',
    'ref.toNext': '{n} рефов до {tier}',
    'ref.maxed': 'МАКС УРОВЕНЬ. ТОЛПА ТВОЯ.',
    'ref.shareText': 'Я выбрал GANG {side}. Залетай первым или принимай долг ауры.',
    'ref.acceptedToast': '+67 монет. Реф-аура принята',
    'curse.label': 'ПРОКЛЯТИЕ ДНЯ',
    'challenge.incoming': 'ВХОДЯЩИЙ ВЫЗОВ',
    'challenge.defend': 'ЗАЩИТИ {side}',
    'challenge.titleCalledOut': 'БАНДА {side} БРОСИЛА ТЕБЕ ВЫЗОВ',
    'challenge.meta': 'Побей {score} тапов за 6.7 сек. Защити {side}.',
    'challenge.toast': 'Тебя вызвала банда {side}',
    'war.global': 'МИРОВАЯ ВОЙНА',
    'war.participation': 'УЧАСТНИКОВ В МИРЕ',
    'war.chatLabel': 'ВОЙНА В TELEGRAM',
    'war.chatGroup': 'ВОЙНА ЭТОГО ЧАТА',
    'war.chatChannel': 'ВОЙНА КАНАЛА',
    'war.chatDM': 'ВОЙНА В ЛИЧКЕ',
    'war.inviteChat': 'ПРИГЛАСИ ЧАТ',
    'war.sixCooking': '6 ЖАРИТ',
    'war.sevenCooking': '7 ЖАРИТ',
    'war.equal': 'РАВНЫЙ БРЕЙНРОТ',
    'matching.title': 'ИЩЕМ СОПЕРНИКА',
    'matching.scan': 'Сканируем мир…',
    'matching.calling': 'Зовём всех {side}…',
    'matching.found': 'Нашли достойного соперника…',
    'matching.locking': 'Сходимся в схватке…',
    'common.cancel': 'ОТМЕНА',
    'common.home': 'НА ГЛАВНУЮ',
    'common.sides6': 'ШЕСТЁРОК',
    'common.sides7': 'СЕМЁРОК',
    'battle.tap': 'ТАП ТАП ТАП',
    'battle.tapLive': 'ТАП! ТАП! ТАП!',
    'battle.getReady': 'ПРИГОТОВЬСЯ',
    'battle.finalRush': 'ФИНАЛЬНЫЙ РЫВОК!',
    'battle.you': 'ТЫ',
    'battle.rival': 'СОПЕРНИК',
    'result.yourTaps': 'Твои тапы',
    'result.rivalTaps': 'Тапы соперника',
    'result.reward': 'Награда',
    'result.taps': 'ТАПОВ',
    'result.victory': 'ПОБЕДА',
    'result.defeat': 'ПОРАЖЕНИЕ',
    'result.draw': 'НИЧЬЯ',
    'result.rematch': 'РЕВАНШ',
    'result.home': 'НА ГЛАВНУЮ',
    'result.raid': 'РЕЙД ЧАТА',
    'result.copy': 'СКОПИРОВАТЬ ССЫЛКУ',
    'result.story': 'В СТОРИС',
    'result.shameSide': 'ОПОЗОРЬ {side}',
    'result.shareJackpot': 'ПОДЕЛИСЬ ДЖЕКПОТОМ',
    'result.cardShame': 'КАРТА ПОЗОРА',
    'result.cardJackpot': 'БРЕЙНРОТ ДЖЕКПОТ',
    'result.cookedTitle': '{a} ПРОЖАРИЛА {b}',
    'result.tiedTitle': 'НИЧЬЯ: {a} ПРОТИВ {b}',
    'result.cookedYouTitle': 'ТЫ ПРОЖАРЕН',
    'result.exact67Title': 'РОВНО 67 ВЫБИТО',
    'result.captionSend': 'ОТПРАВЬ ЭТО БАНДЕ {side}',
    'result.captionJackpot': 'ОТПРАВЬ ДЖЕКПОТ В КАЖДЫЙ ЧАТ',
    'result.challengeWon': 'ТЫ ЗАЩИТИЛ {side}. {enemy} ПРОЖАРЕНА.',
    'result.challengeLost': 'ТЫ ПРОИГРАЛ ДУЭЛЬ. {enemy} ЗАБРАЛА ТВОЮ АУРУ.',
    'result.calloutJackpotTitle': 'ПРОРОЧЕСТВО СИКС СЕВЕН',
    'result.calloutJackpotText': 'Ровно 67. Банда {side} теперь юридически владеет чатом.',
    'result.calloutWinTitle': 'НАСТОЯЩИЙ АЛЬФА-БОЕЦ GANG {side}',
    'result.calloutWinText': 'Ты прожарил соперника. Теперь опозорь другую цифру, пока она не очнулась.',
    'result.calloutLoseTitle': 'МИНУС АУРА',
    'result.calloutLoseText': 'Gang {side} это видела. Потом вернись и смой с себя этот позор.',
    'result.calloutTieTitle': 'ЗАФИКСИРОВАН МИД-ОФФ',
    'result.calloutTieText': 'Никто не прожарил. Никто не съел. Подозрительное поведение.',
    'result.streakWin': 'СЕРИЯ ПОБЕД x{n}',
    'result.streakLose': 'СЕРИЯ ПОЗОРА x{n}',
    'result.streakTie': 'СЕРИЯ СБРОШЕНА',
    'shop.title': 'МАГАЗИН',
    'shop.hands': 'РУКИ',
    'shop.digits': 'ЦИФРЫ',
    'shop.equipped': 'ВЫБРАНО',
    'shop.equip': 'ВЫБРАТЬ',
    'shop.notEnough': 'Не хватает монет',
    'shop.unlocked': 'Открыто: {name}',
    'shop.equippedToast': '{name} — выбрано',
    'rarity.common': 'ОБЫЧНОЕ',
    'rarity.rare': 'РЕДКОЕ',
    'rarity.epic': 'ЭПИК',
    'rarity.legend': 'ЛЕГЕНДА',
    'top.title': 'ТОП НЕДЕЛИ',
    'top.resetsIn': 'Сброс через',
    'top.prizePool': 'ПРИЗОВОЙ ФОНД',
    'top.starsPowered': 'TG STARS',
    'top.prizeGift': '+ NFT ПОДАРОК',
    'top.specialText': 'РОВНО 67-Е МЕСТО ВЫИГРЫВАЕТ',
    'top.hint': 'Топ-3 и игрок, оказавшийся на 67-м месте по итогам недели, получают Telegram Stars и особый TG-подарок прямо в аккаунт.',
    'top.you': 'ТЫ',
    'top.youRank': 'ТЫ #{rank}',
    'top.outsideText': 'Показываем только Топ-100. Твоя позиция отдельно.',
    'profile.title': 'ПРОФИЛЬ',
    'profile.wins': 'ПОБЕДЫ',
    'profile.losses': 'ПОРАЖЕНИЯ',
    'profile.best': 'РЕКОРД',
    'profile.yourSide': 'ТВОЯ СТОРОНА',
    'profile.language': 'ЯЗЫК',
    'profile.langSwitched': 'Язык переключён на русский',
    'nav.profile': 'ПРОФИЛЬ',
    'nav.fight': 'БОЙ',
    'nav.top': 'ТОП',
    'rank.RECRUIT': 'НОВОБРАНЕЦ',
    'rank.STREET FIGHTER': 'УЛИЧНЫЙ БОЕЦ',
    'rank.CONTENDER': 'ПРЕТЕНДЕНТ',
    'rank.CHAMPION': 'ЧЕМПИОН',
    'rank.LEGEND': 'ЛЕГЕНДА',
    'side.locked': 'Сторона {side} закреплена',
    'time.daysHours': '{d}д {h}ч',
    'time.hoursMin': '{h}ч {m}м',
    'toast.copied': 'Скопировано. Иди опозорь кого-нибудь',
    'toast.copyFailed': 'Не удалось скопировать',
    'toast.storyMissing': 'Нет ассета для сторис — скопирован текст',
    'battle.go': 'GO!',
    'battle.memeDefault': 'SIX • SEVEN • ТАП!',
    'battle.comboStreak': 'ОТЛИЧНАЯ СЕРИЯ!',
    'battle.comboCooking': 'ПРОДОЛЖАЙ ЖАРИТЬ!',
    'battle.comboLocked': 'В УДАРЕ 🔥',
    'battle.comboGod': 'SIX SEVEN РЕЖИМ БОГА!',
    'battle.kickerCombo': 'КОМБО',
    'battle.kickerFire': 'ОГОНЬ',
    'battle.kickerLocked': 'В УДАРЕ',
    'battle.kickerGod': 'БОГ',
    'jackpot.badge': '67 ОЧКОВ ВЫБИТО',
    'jackpot.sub': '+67 АУРЫ • БРЕЙНРОТ ДЖЕКПОТ',
    'item.classic': 'КЛАССИКА',
    'item.joker':   'ДЖОКЕР',
    'item.blocky':  'КУБИК',
    'item.sponge':  'ГУБКА',
    'item.demon':   'ДЕМОН',
    'item.blox':    'БЛОКС',
    'item.cyborg':  'КИБОРГ',
    'social.exact67': 'СИИИИИИСК СЕЕЕЕВЕЕЕН. Я выбил РОВНО 67 тапов за банду {side}.',
    'social.win':     'Банда {side} прожарила {enemy}: {score} тапов за 6.7 сек.',
    'social.lose':    'Банду {side} прожарили, но я выбил {score} тапов. {enemy}, объясни.',
    'social.raid':    'БАНДА {side} РЕЙДИТ ЭТОТ ЧАТ. БАНДА {enemy}, ЗАЩИЩАЙ АУРУ. {curse}',
    'social.storyTail':  ' +67 ауры или долг ауры, без вариантов.',
    'social.shameTail':  ' Попробуй побить или прими долг ауры. {curse}',
    'guild.eyebrow': 'ВОЙНА ГИЛЬДИЙ',
    'guild.score': 'ОЧКИ',
    'guild.members': 'ЛЮДИ',
    'guild.reward': 'НАГРАДА',
    'guild.create': 'СОЗДАТЬ ГИЛЬДИЮ',
    'guild.invite': 'ПРИГЛАСИТЬ',
    'guild.joinRandom': 'ВСТУПИТЬ В РАНДОМ',
    'guild.leave': 'ВЫЙТИ',
    'guild.noGuild': 'НЕТ ГИЛЬДИИ',
    'guild.emptyMeta': 'Создай гильдию или вступи из Топа.',
    'guild.inGuildMeta': '{tag} · {members} игроков · GANG {side}',
    'guild.locked': 'Гильд-лок: {time}',
    'guild.leaveLocked': 'Останься ещё {time}. Дроп-хантерам нельзя.',
    'guild.rewardLine': 'Оценка награды недели: {reward} монет, если ранг удержится.',
    'guild.noReward': 'Вступи в гильдию, чтобы фармить недельные награды.',
    'guild.prompt': 'Название гильдии?',
    'guild.created': 'Гильдия создана. Первый инвайтер забирает толпу.',
    'guild.joined': 'Ты вступил в {name}. Лоялти-лок включён.',
    'guild.left': 'Ты вышел. Кулдаун 12ч запущен.',
    'guild.inviteText': 'Вступай в мою гильдию {name}. Первая волна получает ауру, поздняя — cooked.',
    'guild.topRewards': 'НАГРАДЫ ГИЛЬДИЙ ЗА НЕДЕЛЮ',
    'guild.reward1': 'Founder-сундук + корона ауры',
    'guild.reward2': 'Рейд-сундук',
    'guild.reward3': 'Gang-сундук',
    'guild.reward67': 'Мем-джекпот',
    'guild.rules': 'Для наград нужно быть в гильдии 24ч. Выход даёт кулдаун 12ч.',
    'guild.youRank': 'ТВОЯ ГИЛЬДИЯ #{rank}',
    'guild.outsideTop': 'Фарми тапы или зови друзей, чтобы попасть в Top-100.',
    'top.players': 'ИГРОКИ',
    'top.guilds': 'ГИЛЬДИИ',
  },
};

function getLang() {
  return LOCALES[state.lang] ? state.lang : 'en';
}

function t(key, vars) {
  const lang = getLang();
  let raw = (LOCALES[lang] && LOCALES[lang][key]);
  if (raw == null) raw = (LOCALES.en && LOCALES.en[key]) || key;
  if (vars && typeof raw === 'string') {
    raw = raw.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : `{${k}}`));
  }
  return raw;
}

function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const translated = t(key);
    if (translated != null) el.textContent = translated;
  });
  document.documentElement.setAttribute('lang', getLang());
}

function setLang(lang) {
  if (!LOCALES[lang]) lang = 'en';
  state.lang = lang;
  saveState();
  applyTranslations();
  // Re-render any dynamic UI that depends on language
  syncLangPicker();
  syncTopBarUserMeta();
  syncSideChoice();
  renderHomeSocial();
  if (typeof renderShop === 'function' && !document.querySelector('[data-screen="shop"]').hidden) renderShop();
  if (typeof openTop === 'function' && !document.querySelector('[data-screen="top"]').hidden) openTop();
  if (typeof openProfile === 'function' && !document.querySelector('[data-screen="profile"]').hidden) openProfile();
}

function syncLangPicker() {
  const lang = getLang();
  document.querySelectorAll('.lang-pill').forEach(el => {
    el.classList.toggle('is-active', el.dataset.lang === lang);
  });
}

function syncTopBarUserMeta() {
  const rankEl = document.getElementById('user-rank');
  if (rankEl) rankEl.textContent = rankLabel(state.stats.wins);
}

// ---------- Version / Telegram Social ----------
const APP_VERSION = '0.1.13';
const TG_SOCIAL = {
  // Set these in production before loading app.js, e.g. window.SIX_SEVEN_BOT_USERNAME = 'your_bot'.
  botUsername: (window.SIX_SEVEN_BOT_USERNAME || '').replace(/^@/, ''),
  appName: window.SIX_SEVEN_APP_NAME || '',
  storyUrl: window.SIX_SEVEN_STORY_URL || '', // HTTPS image/video URL for Telegram shareToStory.
};

const START_PARAM = getStartParam();
let CURRENT_CHALLENGE = parseChallengeParam(START_PARAM);
let CURRENT_REFERRAL = parseReferralParam(START_PARAM);
let CURRENT_GUILD_INVITE = parseGuildParam(START_PARAM);
let LAST_RESULT = null;

function getStartParam() {
  const fromTg = tg?.initDataUnsafe?.start_param || '';
  if (fromTg) return fromTg;
  try {
    return new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
  } catch { return ''; }
}

function makeNonce() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function parseChallengeParam(param) {
  if (!param) return null;
  const m = String(param).match(/^d_([67])_(\d{1,3})(?:_([a-zA-Z0-9-]{1,24}))?$/);
  if (!m) return null;
  const side = Number(m[1]);
  const score = Math.max(0, Math.min(999, Number(m[2])));
  return {
    type: 'duel',
    challengerSide: side,
    targetSide: side === 6 ? 7 : 6,
    score,
    nonce: m[3] || '',
  };
}

function parseReferralParam(param) {
  if (!param) return null;
  const m = String(param).match(/^r_([A-Za-z0-9]{4,24})(?:_([67]))?$/);
  if (!m) return null;
  return {
    type: 'ref',
    code: m[1],
    side: m[2] ? Number(m[2]) : null,
  };
}

function parseGuildParam(param) {
  if (!param) return null;
  const m = String(param || '').match(/^g_([A-Za-z0-9-]{3,24})(?:_([67]))?$/);
  if (!m) return null;
  return { type: 'guild', id: m[1], side: m[2] ? Number(m[2]) : null };
}

function makeChallengeParam(side = state.side, score = 0) {
  return `d_${Number(side) === 7 ? 7 : 6}_${Math.max(0, Math.min(999, Number(score) || 0))}_${makeNonce()}`;
}

function getTelegramContextKey() {
  const init = tg?.initDataUnsafe || {};
  if (init.chat_instance) return `chat:${init.chat_instance}`;
  if (init.chat?.id) return `chat:${init.chat.id}`;
  return 'solo';
}

function getTelegramContextLabel() {
  const init = tg?.initDataUnsafe || {};
  const type = init.chat_type || init.chat?.type || '';
  if (type === 'group' || type === 'supergroup') return t('war.chatGroup');
  if (type === 'channel') return t('war.chatChannel');
  if (type === 'private') return t('war.chatDM');
  return t('war.chatLabel');
}

function getAppDeepLink(param = '') {
  const safeParam = String(param || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
  if (TG_SOCIAL.botUsername) {
    const appPath = TG_SOCIAL.appName ? `/${encodeURIComponent(TG_SOCIAL.appName)}` : '';
    return `https://t.me/${TG_SOCIAL.botUsername}${appPath}?startapp=${safeParam}`;
  }
  try {
    const url = new URL(location.href);
    url.searchParams.set('tgWebAppStartParam', safeParam);
    return url.toString();
  } catch {
    return location.href;
  }
}

const REFERRAL_TIERS = [
  { level: 1, threshold: 1,    nameKey: 'ref.tier1', rewardKey: 'ref.reward1' },
  { level: 2, threshold: 6,    nameKey: 'ref.tier2', rewardKey: 'ref.reward2' },
  { level: 3, threshold: 67,   nameKey: 'ref.tier3', rewardKey: 'ref.reward3' },
  { level: 4, threshold: 670,  nameKey: 'ref.tier4', rewardKey: 'ref.reward4' },
  { level: 5, threshold: 6700, nameKey: 'ref.tier5', rewardKey: 'ref.reward5' },
];

function getReferralCount() {
  return Math.max(0, Number(state.referrals?.sent || 0));
}

function getReferralTier(count = getReferralCount()) {
  let current = null;
  for (const tier of REFERRAL_TIERS) {
    if (count >= tier.threshold) current = tier;
  }
  return current || { level: 0, threshold: 0, nameKey: 'ref.tier0', rewardKey: 'ref.reward0' };
}

function getNextReferralTier(count = getReferralCount()) {
  return REFERRAL_TIERS.find(tier => count < tier.threshold) || null;
}

function makeReferralParam() {
  return `r_${state.referrals.code}_${Number(state.side) === 7 ? 7 : 6}`;
}

function getReferralLink() {
  return getAppDeepLink(makeReferralParam());
}

function renderReferralCard() {
  const card = document.getElementById('ref-card');
  if (!card) return;
  const count = getReferralCount();
  const tier = getReferralTier(count);
  const next = getNextReferralTier(count);
  const countEl = document.getElementById('ref-count');
  const titleEl = document.getElementById('ref-title');
  const metaEl = document.getElementById('ref-meta');
  const progressEl = document.getElementById('ref-progress');
  const tiersEl = document.getElementById('ref-tiers');
  if (countEl) countEl.textContent = count.toLocaleString('ru-RU');
  if (titleEl) titleEl.textContent = t(tier.nameKey);
  if (metaEl) {
    metaEl.textContent = next
      ? t('ref.toNext', { n: Math.max(0, next.threshold - count), tier: t(next.nameKey) })
      : t('ref.maxed');
  }
  if (progressEl) {
    const prevThreshold = tier.threshold || 0;
    const nextThreshold = next?.threshold || Math.max(prevThreshold, count || 1);
    const span = Math.max(1, nextThreshold - prevThreshold);
    const pct = next ? Math.max(0, Math.min(100, ((count - prevThreshold) / span) * 100)) : 100;
    progressEl.style.width = pct.toFixed(1) + '%';
  }
  if (tiersEl) {
    tiersEl.innerHTML = '';
    REFERRAL_TIERS.forEach(tierItem => {
      const chip = document.createElement('span');
      chip.className = 'ref-tier' + (count >= tierItem.threshold ? ' is-done' : '') + (next && next.level === tierItem.level ? ' is-next' : '');
      chip.textContent = tierItem.threshold >= 1000 ? (tierItem.threshold / 1000).toFixed(tierItem.threshold % 1000 ? 1 : 0) + 'K' : tierItem.threshold;
      chip.title = `${t(tierItem.nameKey)} — ${t(tierItem.rewardKey)}`;
      tiersEl.appendChild(chip);
    });
  }
}

function bootIncomingReferral() {
  if (!CURRENT_REFERRAL) return;
  if (CURRENT_REFERRAL.code === state.referrals.code) return;
  if (!state.referrals.firstTouchClaimed) {
    state.referrals.referredBy = CURRENT_REFERRAL.code;
    state.referrals.firstTouchClaimed = true;
    state.coins += 67;
    saveState();
    syncTopBarCoins();
    toast(t('ref.acceptedToast'));
  }
  if (CURRENT_REFERRAL.side) setSide(CURRENT_REFERRAL.side, { notify: false });
}

function shareReferral() {
  state.referrals.sent = getReferralCount() + 1;
  saveState();
  renderReferralCard();
  haptic.success();
  openTelegramShare({
    text: t('ref.shareText', { side: state.side }),
    url: getReferralLink(),
  });
}

// ---------- Guilds / squads ----------
const GUILD_JOIN_LOCK_MS = 24 * 60 * 60 * 1000;
const GUILD_LEAVE_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const FAKE_GUILDS = [
  { id:'six-mafia', name:'Six Mafia', tag:'SIX', side:6, members:6700, score:188670, aura:'ALPHA' },
  { id:'seven-cult', name:'Seven Cult', tag:'S7N', side:7, members:5667, score:184120, aura:'COOKING' },
  { id:'brainrot-hq', name:'Brainrot HQ', tag:'BRH', side:6, members:4200, score:151777, aura:'LOUD' },
  { id:'skibidi-raid', name:'Skibidi Raid', tag:'SKB', side:7, members:3960, score:147670, aura:'CHAOS' },
  { id:'aura-dealers', name:'Aura Dealers', tag:'AUR', side:6, members:3067, score:128900, aura:'RICH' },
  { id:'tung-sahur', name:'Tung Sahur', tag:'TNG', side:7, members:2670, score:116767, aura:'NOISY' },
  { id:'roblox-hands', name:'Roblox Hands', tag:'RBX', side:6, members:2100, score:104300, aura:'BLOX' },
  { id:'cooked-academy', name:'Cooked Academy', tag:'CKD', side:7, members:1860, score:93670, aura:'SHAME' },
  { id:'mango-gang', name:'Mango Gang', tag:'MNG', side:6, members:1670, score:83777, aura:'JUICE' },
  { id:'no-aura', name:'No Aura Allowed', tag:'NOA', side:7, members:1420, score:77670, aura:'LOCKED' },
];

function hasGuild() { return Boolean(state.guild?.id); }
function guildCooldownLeft() { return Math.max(0, Number(state.guild?.cooldownUntil || 0) - Date.now()); }
function guildJoinLockLeft() { return hasGuild() ? Math.max(0, Number(state.guild?.lockedUntil || 0) - Date.now()) : 0; }
function formatShortTime(ms) {
  const mins = Math.ceil(Math.max(0, ms) / 60000);
  if (mins >= 60) return Math.ceil(mins / 60) + 'h';
  return Math.max(1, mins) + 'm';
}
function sanitizeGuildName(name) {
  return String(name || '').replace(/[^A-Za-zА-Яа-яЁё0-9 _.-]/g, '').trim().slice(0, 20) || `GANG ${state.side}`;
}
function makeGuildId(name) {
  return sanitizeGuildName(name).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 18) + '-' + makeNonce().slice(0,4);
}
function makeGuildTag(name) {
  const clean = sanitizeGuildName(name).replace(/[^A-Za-zА-Яа-яЁё0-9]/g, '').toUpperCase();
  return (clean || 'GNG').slice(0, 3);
}
function getFakeGuildById(id) { return FAKE_GUILDS.find(g => g.id === id); }
function getGuildRewardEstimate(rank) {
  if (rank === 1) return 6700;
  if (rank === 2) return 3000;
  if (rank === 3) return 1500;
  if (rank === 67) return 670;
  if (rank <= 10) return 300;
  if (rank <= 100) return 67;
  return 0;
}
function makeGuildParam() {
  return `g_${state.guild.id}_${Number(state.side) === 7 ? 7 : 6}`;
}
function getGuildInviteLink() {
  return hasGuild() ? getAppDeepLink(makeGuildParam()) : getAppDeepLink('');
}
function getMyGuildRank() {
  if (!hasGuild()) return null;
  return buildFakeGuildTop().find(g => g.me)?.rank || 101;
}
function createGuildFromName(name) {
  if (guildCooldownLeft() > 0) return toast(t('guild.locked', { time: formatShortTime(guildCooldownLeft()) }));
  const guildName = sanitizeGuildName(name || prompt(t('guild.prompt')));
  state.guild = {
    ...DEFAULT_STATE.guild,
    id: makeGuildId(guildName),
    name: guildName,
    tag: makeGuildTag(guildName),
    side: Number(state.side) === 7 ? 7 : 6,
    score: 67,
    members: 1,
    invites: 0,
    createdAt: Date.now(),
    joinedAt: Date.now(),
    lockedUntil: Date.now() + GUILD_JOIN_LOCK_MS,
  };
  saveState();
  haptic.success();
  toast(t('guild.created'));
  renderGuildCard();
}
function joinGuild(guild) {
  if (hasGuild()) return toast(t('guild.locked', { time: formatShortTime(guildJoinLockLeft() || GUILD_JOIN_LOCK_MS) }));
  if (guildCooldownLeft() > 0) return toast(t('guild.locked', { time: formatShortTime(guildCooldownLeft()) }));
  const g = guild || getFakeGuildById(CURRENT_GUILD_INVITE?.id) || { id: CURRENT_GUILD_INVITE?.id || ('guild-' + makeNonce()), name: 'Invited Guild', tag: 'INV', side: CURRENT_GUILD_INVITE?.side || state.side, members: 67, score: 670 };
  state.guild = {
    ...DEFAULT_STATE.guild,
    id: g.id,
    name: g.name,
    tag: g.tag || makeGuildTag(g.name),
    side: Number(g.side) === 7 ? 7 : 6,
    score: Math.max(67, Math.floor((Number(g.score)||670) * 0.02)),
    members: Math.max(1, Number(g.members || 67)),
    joinedAt: Date.now(),
    lockedUntil: Date.now() + GUILD_JOIN_LOCK_MS,
  };
  saveState();
  haptic.success();
  toast(t('guild.joined', { name: state.guild.name }));
  renderGuildCard();
  if (!document.querySelector('[data-screen="top"]')?.hidden) openTop();
}
function joinRandomGuild() {
  const pool = FAKE_GUILDS.filter(g => g.side === state.side);
  joinGuild(pool[Math.floor(Math.random() * pool.length)] || FAKE_GUILDS[0]);
}
function joinIncomingOrRandomGuild() {
  if (CURRENT_GUILD_INVITE && !hasGuild()) {
    const fake = getFakeGuildById(CURRENT_GUILD_INVITE.id);
    return joinGuild(fake || { id: CURRENT_GUILD_INVITE.id, name: 'Invited Guild', tag: 'INV', side: CURRENT_GUILD_INVITE.side || state.side, members: 67, score: 670 });
  }
  return joinRandomGuild();
}
function leaveGuild() {
  if (!hasGuild()) return;
  const left = guildJoinLockLeft();
  if (left > 0) return toast(t('guild.leaveLocked', { time: formatShortTime(left) }));
  state.guild = { ...DEFAULT_STATE.guild, cooldownUntil: Date.now() + GUILD_LEAVE_COOLDOWN_MS, lastLeftAt: Date.now() };
  saveState();
  haptic.warning();
  toast(t('guild.left'));
  renderGuildCard();
  if (!document.querySelector('[data-screen="top"]')?.hidden) openTop();
}
function shareGuildInvite() {
  if (!hasGuild()) return createGuildFromName();
  state.guild.invites = Number(state.guild.invites || 0) + 1;
  saveState();
  renderGuildCard();
  openTelegramShare({ text: t('guild.inviteText', { name: state.guild.name }), url: getGuildInviteLink() });
  haptic.success();
}
function bootIncomingGuild() {
  if (!CURRENT_GUILD_INVITE || hasGuild()) return;
  if (CURRENT_GUILD_INVITE.side) setSide(CURRENT_GUILD_INVITE.side, { notify: false });
  renderGuildCard();
}
function addToGuildScore(score) {
  if (!hasGuild()) return;
  state.guild.score = Math.max(0, Number(state.guild.score || 0)) + Math.max(0, Math.floor(score || 0));
}
function renderGuildCard() {
  const card = document.getElementById('guild-card');
  if (!card) return;
  const has = hasGuild();
  const title = document.getElementById('guild-title');
  const badge = document.getElementById('guild-badge');
  const meta = document.getElementById('guild-meta');
  const score = document.getElementById('guild-score');
  const members = document.getElementById('guild-members');
  const reward = document.getElementById('guild-reward');
  const rewardLine = document.getElementById('guild-reward-line');
  const lock = document.getElementById('guild-lock');
  const createBtn = document.getElementById('guild-create');
  const inviteBtn = document.getElementById('guild-invite');
  const randomBtn = document.getElementById('guild-random');
  const leaveBtn = document.getElementById('guild-leave');

  card.dataset.state = has ? 'joined' : 'empty';
  if (has) {
    const rank = getMyGuildRank() || 101;
    const rewardValue = getGuildRewardEstimate(rank);
    title.textContent = state.guild.name;
    badge.textContent = state.guild.tag || 'G';
    meta.textContent = t('guild.inGuildMeta', { tag: state.guild.tag || 'GNG', members: Number(state.guild.members || 1).toLocaleString('ru-RU'), side: state.guild.side });
    score.textContent = Number(state.guild.score || 0).toLocaleString('ru-RU');
    members.textContent = Number(state.guild.members || 1).toLocaleString('ru-RU');
    reward.textContent = rewardValue ? rewardValue.toLocaleString('ru-RU') : '67';
    rewardLine.textContent = t('guild.rewardLine', { reward: (rewardValue || 67).toLocaleString('ru-RU') });
    createBtn.hidden = true;
    inviteBtn.hidden = false;
    randomBtn.hidden = true;
    leaveBtn.hidden = false;
  } else {
    const incoming = CURRENT_GUILD_INVITE && !has;
    const fake = incoming ? getFakeGuildById(CURRENT_GUILD_INVITE.id) : null;
    title.textContent = incoming ? (fake?.name || 'INVITED GUILD') : t('guild.noGuild');
    badge.textContent = incoming ? (fake?.tag || 'INV') : 'G';
    meta.textContent = incoming ? t('guild.joined', { name: fake?.name || 'Invited Guild' }) : t('guild.emptyMeta');
    score.textContent = '0'; members.textContent = '0'; reward.textContent = '0';
    rewardLine.textContent = t('guild.noReward');
    createBtn.hidden = false;
    inviteBtn.hidden = true;
    randomBtn.hidden = false;
    leaveBtn.hidden = true;
    if (incoming) randomBtn.textContent = getLang() === 'ru' ? 'ВСТУПИТЬ ПО ИНВАЙТУ' : 'JOIN INVITE';
    else randomBtn.textContent = t('guild.joinRandom');
  }
  const lockMs = has ? guildJoinLockLeft() : guildCooldownLeft();
  if (lock && lockMs > 0) {
    lock.hidden = false;
    lock.textContent = has ? t('guild.leaveLocked', { time: formatShortTime(lockMs) }) : t('guild.locked', { time: formatShortTime(lockMs) });
  } else if (lock) {
    lock.hidden = true;
    lock.textContent = '';
  }
}

function openTelegramShare({ text, url }) {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url || '')}&text=${encodeURIComponent(text || '')}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
  else if (tg?.openLink) tg.openLink(shareUrl);
  else window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('toast.copied'));
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); toast(t('toast.copied')); }
    catch { toast(t('toast.copyFailed')); }
    area.remove();
  }
}

// ---------- Catalog ----------
const HAND_CATALOG = [
  { id: 'hand',   name: 'CLASSIC', nameKey: 'item.classic', img: 'assets/hand.png',   price: 0,    rarity: 'common' },
  { id: 'clown',  name: 'JOKER',   nameKey: 'item.joker',   img: 'assets/clown.png',  price: 500,  rarity: 'rare'   },
  { id: 'cube',   name: 'BLOCKY',  nameKey: 'item.blocky',  img: 'assets/cube.png',   price: 700,  rarity: 'rare'   },
  { id: 'spanch', name: 'SPONGE',  nameKey: 'item.sponge',  img: 'assets/spanch.png', price: 1200, rarity: 'epic'   },
  { id: 'devil',  name: 'DEMON',   nameKey: 'item.demon',   img: 'assets/devil.png',  price: 1500, rarity: 'epic'   },
  { id: 'roblox', name: 'BLOX',    nameKey: 'item.blox',    img: 'assets/roblox.png', price: 2400, rarity: 'legend' },
  { id: 'robo',   name: 'CYBORG',  nameKey: 'item.cyborg',  img: 'assets/robo.png',   price: 3000, rarity: 'legend' },
];

const DIGIT_CATALOG = [
  { id: 'classic', name: 'CLASSIC', nameKey: 'item.classic', price: 0,    rarity: 'common', img6: 'assets/digits/classic-6.png', img7: 'assets/digits/classic-7.png' },
  { id: 'clown',   name: 'JOKER',   nameKey: 'item.joker',   price: 400,  rarity: 'rare',   img6: 'assets/digits/clown-6.png',   img7: 'assets/digits/clown-7.png'   },
  { id: 'devil',   name: 'DEMON',   nameKey: 'item.demon',   price: 1200, rarity: 'epic',   img6: 'assets/digits/devil-6.png',   img7: 'assets/digits/devil-7.png'   },
  { id: 'robo',    name: 'CYBORG',  nameKey: 'item.cyborg',  price: 2500, rarity: 'legend', img6: 'assets/digits/robo-6.png',    img7: 'assets/digits/robo-7.png'    },
];

function getItemName(item) {
  return item.nameKey ? t(item.nameKey) : item.name;
}

// ---------- Global War (simulated) ----------
let GLOBAL_WAR = {
  six: 521000,
  seven: 478000,
};
function tickGlobalWar() {
  // jitter so the bar shifts subtly
  GLOBAL_WAR.six   += Math.floor(Math.random() * 600);
  GLOBAL_WAR.seven += Math.floor(Math.random() * 600);
  renderGlobalWar();
}
function renderGlobalWar() {
  const total = GLOBAL_WAR.six + GLOBAL_WAR.seven;
  const pSix = (GLOBAL_WAR.six / total) * 100;
  const pSeven = 100 - pSix;
  document.getElementById('war-six').style.width = pSix.toFixed(1) + '%';
  document.getElementById('war-seven').style.width = pSeven.toFixed(1) + '%';
  document.getElementById('war-six-pct').textContent = pSix.toFixed(1) + '%';
  document.getElementById('war-seven-pct').textContent = pSeven.toFixed(1) + '%';
  document.getElementById('war-participation').textContent = total.toLocaleString('en-US');
}

// ---------- Telegram Social / Viral Home Cards ----------
const DAILY_CURSES_EN = [
  'TODAY 6 HAS NO AURA',
  'TODAY 7 IS ILLEGAL',
  '6 GOT SENT TO THE MICROWAVE',
  '7 FAILED THE SKIBIDI CHECK',
  'GLOBAL AURA DEBT DETECTED',
  'SIX SEVEN BRAINROT PEAK',
  'TODAY 6 IS COOKING',
  'TODAY 7 NEEDS BACKUP',
  'THE CHAT HAS BEEN INFECTED',
  'TOUCH GRASS WARNING IGNORED',
];
const DAILY_CURSES_RU = [
  'СЕГОДНЯ У 6 НЕТ АУРЫ',
  'СЕГОДНЯ 7 ВНЕ ЗАКОНА',
  '6 ОТПРАВИЛИ В МИКРОВОЛНОВКУ',
  '7 ПРОВАЛИЛА SKIBIDI-ПРОВЕРКУ',
  'ОБНАРУЖЕН ГЛОБАЛЬНЫЙ ДОЛГ АУРЫ',
  'ПИК БРЕЙНРОТА SIX SEVEN',
  'СЕГОДНЯ 6 ЖАРИТ',
  'СЕГОДНЯ 7 НУЖНА ПОДДЕРЖКА',
  'ЧАТ БЫЛ ЗАРАЖЁН',
  'ПОРА ВЫЙТИ И ПОТРОГАТЬ ТРАВУ',
];

function getDailyCurse() {
  const pool = getLang() === 'ru' ? DAILY_CURSES_RU : DAILY_CURSES_EN;
  const day = Math.floor(Date.now() / 86400000);
  return pool[day % pool.length];
}

function getChatWar() {
  const key = 'six-seven::chat-war::' + getTelegramContextKey();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return { six: 0, seven: 0, ...JSON.parse(raw) };
  } catch {}
  return { six: 0, seven: 0 };
}

function saveChatWar(war) {
  const key = 'six-seven::chat-war::' + getTelegramContextKey();
  try { localStorage.setItem(key, JSON.stringify(war)); } catch {}
}

function addToChatWar(side, points) {
  const war = getChatWar();
  if (Number(side) === 7) war.seven += Math.max(1, points || 1);
  else war.six += Math.max(1, points || 1);
  saveChatWar(war);
  renderChatWar();
}

function renderDailyCurse() {
  const el = document.getElementById('daily-curse-text');
  if (el) el.textContent = getDailyCurse();
}

function renderChatWar() {
  const card = document.getElementById('chat-war-card');
  const ctxKey = getTelegramContextKey();
  const hasRealTelegramChat = ctxKey !== 'solo';
  if (card) card.hidden = !hasRealTelegramChat;

  const war = getChatWar();
  const total = Math.max(1, war.six + war.seven);
  const pSix = (war.six / total) * 100;
  const pSeven = 100 - pSix;
  const label = document.getElementById('chat-war-label');
  const verdict = document.getElementById('chat-war-verdict');
  const sixBar = document.getElementById('chat-war-six');
  const sevenBar = document.getElementById('chat-war-seven');
  const sixLabel = document.getElementById('chat-war-six-label');
  const sevenLabel = document.getElementById('chat-war-seven-label');
  if (label) label.textContent = getTelegramContextLabel();
  if (sixBar) sixBar.style.width = pSix.toFixed(1) + '%';
  if (sevenBar) sevenBar.style.width = pSeven.toFixed(1) + '%';
  if (sixLabel) sixLabel.textContent = `6: ${war.six.toLocaleString('en-US')}`;
  if (sevenLabel) sevenLabel.textContent = `7: ${war.seven.toLocaleString('en-US')}`;
  if (verdict) {
    if (war.six + war.seven === 0) verdict.textContent = t('war.inviteChat');
    else if (pSix > pSeven) verdict.textContent = t('war.sixCooking');
    else if (pSeven > pSix) verdict.textContent = t('war.sevenCooking');
    else verdict.textContent = t('war.equal');
  }
}

function renderIncomingChallenge() {
  const card = document.getElementById('challenge-card');
  if (!card) return;
  if (!CURRENT_CHALLENGE) {
    card.hidden = true;
    return;
  }
  const c = CURRENT_CHALLENGE;
  card.hidden = false;
  document.getElementById('challenge-title').textContent = t('challenge.titleCalledOut', { side: c.challengerSide });
  document.getElementById('challenge-meta').textContent = t('challenge.meta', { score: c.score, side: c.targetSide });
  const accept = document.getElementById('challenge-accept');
  if (accept) accept.textContent = t('challenge.defend', { side: c.targetSide });
}

function bootIncomingChallenge() {
  if (!CURRENT_CHALLENGE) return;
  state.side = CURRENT_CHALLENGE.targetSide;
  saveState();
  setTimeout(() => {
    syncSideChoice();
    renderIncomingChallenge();
    toast(t('challenge.toast', { side: CURRENT_CHALLENGE.challengerSide }));
  }, 0);
}

function renderHomeSocial() {
  renderDailyCurse();
  renderChatWar();
  renderIncomingChallenge();
}

setInterval(tickGlobalWar, 4500);

// ---------- Screens / Nav ----------
const SCREENS = ['home', 'matching', 'battle', 'result', 'shop', 'top', 'profile'];

function show(screen) {
  if (document.body.classList.contains('is-desktop-blocked')) return;
  SCREENS.forEach(s => {
    const el = document.querySelector(`[data-screen="${s}"]`);
    if (!el) return;
    el.hidden = (s !== screen);
  });
  if (screen === 'home') renderHomeSocial();
  // BackButton visibility
  if (tg?.BackButton) {
    if (screen === 'home') tg.BackButton.hide();
    else { tg.BackButton.show(); tg.BackButton.onClick(() => show('home')); }
  }
  // Immersive screens hide the bottom nav
  const immersive = ['matching', 'battle', 'result'];
  document.body.classList.toggle('is-immersive', immersive.includes(screen));
  // sync navbar highlight
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('is-active'));
  const navMap = { profile: 'profile', top: 'top' };
  const navKey = navMap[screen];
  if (navKey) {
    const el = document.querySelector(`.nav-item[data-nav="${navKey}"]`);
    el?.classList.add('is-active');
  }
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    haptic.select();
    const target = btn.dataset.nav;
    if (target === 'battle-quick') return startMatchmaking();
    // Re-tap on an already-active tab returns to home, so the user always has a way back.
    if (btn.classList.contains('is-active')) return show('home');
    if (target === 'profile') return openProfile();
    if (target === 'top') return openTop();
    show(target);
  });
});

// ---------- Home: side buttons ----------
function setSide(side, { notify = false } = {}) {
  state.side = Number(side);
  saveState();
  syncSideChoice();
  syncHeroHands();
  renderReferralCard();
  renderGuildCard();
  if (notify) toast(t('side.locked', { side: state.side }));
}

function syncSideChoice() {
  const side = Number(state.side);
  document.querySelectorAll('.side-btn').forEach(btn => {
    const selected = Number(btn.dataset.side) === side;
    btn.classList.toggle('is-selected', selected);
    btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });

  const choice = document.getElementById('side-choice');
  const value = document.getElementById('home-side-value');
  if (choice) choice.dataset.side = side;
  if (value) value.textContent = side;
  const battleCta = document.getElementById('home-battle-cta');
  const battleSide = document.getElementById('home-battle-side');
  if (battleCta) battleCta.dataset.side = side;
  if (battleSide) battleSide.textContent = side;

  document.getElementById('profile-pick-6')?.classList.toggle('is-active', side === 6);
  document.getElementById('profile-pick-7')?.classList.toggle('is-active', side === 7);
}

document.querySelectorAll('.side-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    haptic.medium();
    setSide(btn.dataset.side, { notify: true });
  });
});

// Big idiot-proof home CTA. The bottom nav also starts a fight, but this is the obvious path.
document.getElementById('home-battle-cta')?.addEventListener('click', () => {
  haptic.heavy();
  startMatchmaking();
});

// ---------- Matchmaking ----------
let mmTimer;
function startMatchmaking() {
  show('matching');
  const sideEl = document.getElementById('matching-side');
  sideEl.src = getDigitUrl(state.digitStyle, state.side);
  sideEl.dataset.side = state.side;

  const lines = [
    t('matching.scan'),
    t('matching.calling', { side: state.side === 6 ? t('common.sides6') : t('common.sides7') }),
    t('matching.found'),
    t('matching.locking'),
  ];
  let i = 0;
  const statusEl = document.getElementById('matching-status');
  statusEl.textContent = lines[0];

  mmTimer = setInterval(() => {
    i++;
    if (i < lines.length) {
      statusEl.textContent = lines[i];
    } else {
      clearInterval(mmTimer);
      beginBattle();
    }
  }, 900);
}
document.getElementById('matching-cancel').addEventListener('click', () => {
  clearInterval(mmTimer);
  haptic.warning();
  show('home');
});

// ---------- Battle ----------
const BATTLE = {
  myScore: 0,
  enemyScore: 0,
  enemyName: '',
  enemySide: 7,
  duration: 6700,
  tickInterval: null,
  endTimeout: null,
  startTs: 0,
  running: false,
  acceptingTaps: false, // true only between GO and end-of-round
  enemyBot: null,
  enemyHand: 'hand',
  enemyDigit: 'classic',
  combo: 0,
  lastTapTs: 0,
  comboHideTimeout: null,
  memeResetTimeout: null,
  finalRushTriggered: false,
  chaosInterval: null,
  confettiInterval: null,
  stickerInterval: null,
};

const RIVAL_NAMES = ['ZenBoy', 'Ksu_Lab', 'NoChill', 'CR1S', 'mishakek', 'Bruh666', 'Lola.exe', 'taptap', 'Vibez', 'huh_what', 'pluh', 'GYAT', 'Spectre', 'KleoX', 'g0blin'];

// Safe May-2026 Gen Alpha / brainrot phrase pool: absurd, fast, non-explicit.
const BRAINROT_PHRASES_2026 = [
  'SIX SEVEN!',
  '67 KID ENERGY',
  '+67 AURA',
  'AURA FARM',
  'AURA DEBT',
  'NO AURA',
  'LOCK IN',
  'COOKED',
  'LET HIM COOK',
  'TOUCH GRASS',
  'NPC MOMENT',
  'WHAT THE SIGMA',
  'SKIBIDI CHECK',
  'WHAT THE HELLY',
  'TUNG TUNG TUNG',
  'SAHUR MODE',
  'TRALALERO TRALALA',
  'BALLERINA CAPPUCCINA',
  'BOMBARDIRO CROCODILO',
  'CHIMPANZINI BANANINI',
  'CHICKEN JOCKEY',
  'MANGO MODE',
  'MUSTARD BLAST',
  'GREAT MEME RESET',
  'BRAINROT MAX',
  'DOOT DOOT',
  'MOGGED',
  'RIZZLESS'
];

const SIDE_PHRASES = {
  6: ['6 GANG', 'SIX SIDE UP', '6 ATE', '6 IS COOKING', 'SEVEN EXPLAIN', 'SIX SUPREMACY'],
  7: ['7 GANG', 'SEVEN SIDE UP', '7 ATE', '7 IS COOKING', 'SIX EXPLAIN', 'SEVEN SWEEP']
};

function pickRival() {
  return RIVAL_NAMES[Math.floor(Math.random() * RIVAL_NAMES.length)];
}

function pickRivalHand() {
  // 60% классика, 40% случайный премиум — чтобы скины противника были разнообразными но не каждый бой
  if (Math.random() < 0.6) return 'hand';
  const premium = HAND_CATALOG.filter(h => h.id !== 'hand');
  return premium[Math.floor(Math.random() * premium.length)].id;
}

function pickRivalDigit() {
  if (Math.random() < 0.6) return 'classic';
  const premium = DIGIT_CATALOG.filter(d => d.id !== 'classic');
  return premium[Math.floor(Math.random() * premium.length)].id;
}

function getHandImg(handId) {
  const skin = HAND_CATALOG.find(h => h.id === handId);
  return skin ? skin.img : HAND_CATALOG[0].img;
}

function setHandSkin() {
  // Battle stage: my hand on my side, enemy hand on enemy side
  const leftEl = document.getElementById('battle-hand-left');
  const rightEl = document.getElementById('battle-hand-right');
  const mySide = state.side;
  const myImg = getHandImg(state.hand);
  const enemyImg = getHandImg(BATTLE.enemyHand || 'hand');
  if (mySide === 6) {
    leftEl.src = myImg;
    rightEl.src = enemyImg;
  } else {
    leftEl.src = enemyImg;
    rightEl.src = myImg;
  }
}

let heroOtherHandId = null;
let heroOtherHandTimer = null;

function pickRandomHeroOtherHandId() {
  const all = HAND_CATALOG.map(h => h.id);
  const pool = all.length > 1 ? all.filter(id => id !== state.hand) : all;
  return pool[Math.floor(Math.random() * pool.length)] || state.hand || 'hand';
}

function syncHeroHands() {
  const left = document.getElementById('hero-hand-left');
  const right = document.getElementById('hero-hand-right');
  if (!left || !right) return;

  if (!heroOtherHandId || heroOtherHandId === state.hand) {
    heroOtherHandId = pickRandomHeroOtherHandId();
  }

  const myImg = getHandImg(state.hand);
  const otherImg = getHandImg(heroOtherHandId);
  const mySide = Number(state.side) === 7 ? 7 : 6;

  if (mySide === 6) {
    left.src = myImg;
    right.src = otherImg;
    left.dataset.owner = 'me';
    right.dataset.owner = 'other';
  } else {
    left.src = otherImg;
    right.src = myImg;
    left.dataset.owner = 'other';
    right.dataset.owner = 'me';
  }
}

function rotateHeroOtherHand() {
  heroOtherHandId = pickRandomHeroOtherHandId();
  syncHeroHands();
}

function startHeroHandShuffle() {
  clearInterval(heroOtherHandTimer);
  heroOtherHandTimer = setInterval(rotateHeroOtherHand, 6700);
}
function scheduleHeroHandShuffle() { startHeroHandShuffle(); }
function getRandomHeroHandImg() { return getHandImg(pickRandomHeroOtherHandId()); }

function getDigitStyle(id) {
  return DIGIT_CATALOG.find(d => d.id === id) || DIGIT_CATALOG[0];
}
function getDigitUrl(styleId, side) {
  const s = getDigitStyle(styleId);
  return side === 6 ? s.img6 : s.img7;
}

function syncHeroDigits() {
  const six   = document.getElementById('hero-digit-6');
  const seven = document.getElementById('hero-digit-7');
  if (six)   six.src   = getDigitUrl(state.digitStyle, 6);
  if (seven) seven.src = getDigitUrl(state.digitStyle, 7);
}

function beginBattle() {
  // reset
  BATTLE.myScore = 0;
  BATTLE.enemyScore = 0;
  BATTLE.enemySide = (state.side === 6) ? 7 : 6;
  BATTLE.enemyName = pickRival();
  BATTLE.enemyHand = pickRivalHand();
  BATTLE.enemyDigit = pickRivalDigit();
  BATTLE.running = true;
  BATTLE.acceptingTaps = false;
  BATTLE.combo = 0;
  BATTLE.lastTapTs = 0;
  BATTLE.finalRushTriggered = false;
  resetBattleEffects();

  document.getElementById('me-name').textContent = state.name.toUpperCase();
  document.getElementById('me-side').src = getDigitUrl(state.digitStyle, state.side);
  document.getElementById('me-score').textContent = '0';
  document.getElementById('enemy-name').textContent = BATTLE.enemyName.toUpperCase();
  // Battle top always renders BOTH digits in the player's equipped digit style —
  // the player should always see their own aesthetic on screen.
  document.getElementById('enemy-side').src = getDigitUrl(state.digitStyle, BATTLE.enemySide);
  document.getElementById('enemy-score').textContent = '0';

  // Tag cards with their REAL side (for color + swap when player is 7)
  document.getElementById('card-me').dataset.side = state.side;
  document.getElementById('card-enemy').dataset.side = BATTLE.enemySide;
  document.body.classList.toggle('is-side-7', state.side === 7);

  setHandSkin();

  // initial digit + side color
  const digitEl = document.getElementById('battle-digit');
  digitEl.dataset.side = state.side;
  digitEl.src = getDigitUrl(state.digitStyle, state.side);

  // Reset visual bars
  updateVsBar();

  // Show screen
  show('battle');
  document.getElementById('battle-stage').classList.remove('is-final-rush');
  setBattleMeme(t('battle.getReady'));
  const tapHint = document.querySelector('.tap-zone__hint');
  if (tapHint) tapHint.textContent = t('battle.getReady');

  // Pre-round hype countdown: SIX! → SEVEN! → GO! then a 6.7s tap sprint.
  const tNum = document.getElementById('timer-num');
  const tFg = document.getElementById('timer-fg');
  tNum.textContent = (BATTLE.duration / 1000).toFixed(1);
  tFg.style.strokeDashoffset = '0';
  tFg.setAttribute('stroke', '');
  const steps = [
    { overlay: 'SIX!',         meme: 'SIX!',         tone: 'six'  },
    { overlay: 'SEVEN!',       meme: 'SEVEN!',       tone: 'seven'},
    { overlay: t('battle.go'), meme: t('battle.go'), tone: 'go'   },
  ];
  let step = 0;
  const showStep = () => {
    const current = steps[step];
    showCountdown(current.overlay, current.tone);
    setBattleMeme(current.meme);
    if (step === 0) haptic.medium();
    else if (step === 1) haptic.medium();
    else haptic.success();

    if (step === steps.length - 1) {
      setTimeout(() => {
        hideCountdown();
        BATTLE.acceptingTaps = true;
        startBattleTimer();
      }, 520);
      return;
    }
    step++;
    setTimeout(showStep, 560);
  };
  showStep();
}

function resetBattleEffects() {
  clearTimeout(BATTLE.comboHideTimeout);
  clearTimeout(BATTLE.memeResetTimeout);
  const comboEl = document.getElementById('battle-combo');
  if (comboEl) {
    comboEl.hidden = true;
    comboEl.textContent = '';
    comboEl.classList.remove('is-pop');
  }
  const flashEl = document.getElementById('battle-flash');
  if (flashEl) flashEl.className = 'battle__flash';
  document.getElementById('battle-stage')?.classList.remove('is-final-rush', 'is-playing');
  const speedEl = document.getElementById('battle-speedlines');
  if (speedEl) speedEl.classList.remove('is-burst');
  tapZone?.classList.remove('is-live', 'is-armed');
  clearInterval(BATTLE.chaosInterval);
  clearInterval(BATTLE.confettiInterval);
  clearInterval(BATTLE.stickerInterval);
}

function setBattleMeme(text) {
  const el = document.getElementById('battle-meme');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-pop');
  void el.offsetWidth;
  el.classList.add('is-pop');
}

function queueMemeReset(delay = 900) {
  clearTimeout(BATTLE.memeResetTimeout);
  BATTLE.memeResetTimeout = setTimeout(() => {
    if (!BATTLE.running) return;
    if (BATTLE.acceptingTaps) setBattleMeme(BATTLE.finalRushTriggered ? t('battle.finalRush') : t('battle.memeDefault'));
    else setBattleMeme(t('battle.getReady'));
  }, delay);
}

function showCombo(combo) {
  const el = document.getElementById('battle-combo');
  if (!el) return;
  if (combo < 3) {
    el.hidden = true;
    el.classList.remove('is-pop', 'is-hot', 'is-mega');
    return;
  }

  const capped = Math.min(combo, 18);
  const size = Math.min(118, 58 + capped * 3.4);
  const numSize = Math.min(34, 17 + capped * 0.9);
  let kicker = t('battle.kickerCombo');
  if (combo >= 15) kicker = t('battle.kickerGod');
  else if (combo >= 10) kicker = t('battle.kickerLocked');
  else if (combo >= 6) kicker = t('battle.kickerFire');

  el.style.setProperty('--combo-size', size.toFixed(0) + 'px');
  el.style.setProperty('--combo-num-size', numSize.toFixed(0) + 'px');
  el.classList.toggle('is-hot', combo >= 6);
  el.classList.toggle('is-mega', combo >= 12);
  el.innerHTML = `
    <span class="battle__combo-kicker">${kicker}</span>
    <span class="battle__combo-num">x${combo}</span>
  `;
  el.setAttribute('aria-label', kicker + ' combo x' + combo);
  el.hidden = false;
  el.classList.remove('is-pop');
  void el.offsetWidth;
  el.classList.add('is-pop');
  clearTimeout(BATTLE.comboHideTimeout);
  BATTLE.comboHideTimeout = setTimeout(() => {
    el.hidden = true;
  }, 720);
}

function triggerBattleFlash(side, intensity = 'normal') {
  const flashEl = document.getElementById('battle-flash');
  if (!flashEl) return;
  flashEl.className = 'battle__flash';
  void flashEl.offsetWidth;
  flashEl.classList.add(side === 6 ? 'is-six' : 'is-seven');
  if (intensity === 'big') flashEl.classList.add('is-big');
}

// Anime speed-lines: re-trigger the burst animation on every tap.
// We rotate the start angle each time so it doesn't feel mechanical.
let _speedlineRot = 0;
function pulseSpeedlines() {
  const el = document.getElementById('battle-speedlines');
  if (!el) return;
  _speedlineRot = (_speedlineRot + 17 + Math.random() * 26) % 360;
  el.style.setProperty('--burst-rot', _speedlineRot.toFixed(1) + 'deg');
  el.classList.remove('is-burst');
  void el.offsetWidth;
  el.classList.add('is-burst');
}

function registerCombo() {
  const now = Date.now();
  BATTLE.combo = (now - BATTLE.lastTapTs <= 650) ? BATTLE.combo + 1 : 1;
  BATTLE.lastTapTs = now;
  showCombo(BATTLE.combo);
  if (BATTLE.combo >= 15) {
    setBattleMeme(t('battle.comboGod'));
    queueMemeReset(1050);
  } else if (BATTLE.combo >= 10) {
    setBattleMeme(t('battle.comboLocked'));
    queueMemeReset(1000);
  } else if (BATTLE.combo >= 6) {
    setBattleMeme(t('battle.comboCooking'));
    queueMemeReset(900);
  } else if (BATTLE.combo >= 3) {
    setBattleMeme(t('battle.comboStreak'));
    queueMemeReset(850);
  }
}

function showCountdown(val, tone) {
  let cd = document.getElementById('battle-countdown');
  if (!cd) {
    cd = document.createElement('div');
    cd.id = 'battle-countdown';
    cd.className = 'battle__countdown';
    document.getElementById('battle-stage').appendChild(cd);
  }
  cd.textContent = val;
  cd.classList.toggle('battle__countdown--wide', String(val).length > 3);
  cd.dataset.tone = tone || '';
  cd.classList.remove('is-pop');
  void cd.offsetWidth;
  cd.classList.add('is-pop');
}
function hideCountdown() {
  const cd = document.getElementById('battle-countdown');
  if (cd) cd.remove();
}

function startBattleTimer() {
  BATTLE.startTs = Date.now();
  const tNum = document.getElementById('timer-num');
  const tFg = document.getElementById('timer-fg');
  const CIRC = 2 * Math.PI * 44;
  tFg.setAttribute('stroke-dasharray', CIRC.toFixed(2));
  tapZone?.classList.add('is-live');
  const tapHint = document.querySelector('.tap-zone__hint');
  if (tapHint) tapHint.textContent = t('battle.tapLive');
  setBattleMeme(t('battle.memeDefault'));
  document.getElementById('battle-stage')?.classList.add('is-playing');
  startBattleChaos();
  phraseStorm(18);
  confettiWave(22);

  // Bot makes random taps with realistic TPS distribution
  scheduleBotTap();

  BATTLE.tickInterval = setInterval(() => {
    const elapsed = Date.now() - BATTLE.startTs;
    const remain  = Math.max(0, BATTLE.duration - elapsed);
    const sec = (remain / 1000).toFixed(1);
    tNum.textContent = sec;
    const frac = remain / BATTLE.duration;
    tFg.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(2);
    if (remain < 1800) {
      tFg.setAttribute('stroke', '#ff2a6d');
      document.getElementById('battle-stage').classList.add('is-final-rush');
      if (!BATTLE.finalRushTriggered) {
        BATTLE.finalRushTriggered = true;
        setBattleMeme(t('battle.finalRush'));
        queueMemeReset(1200);
        confettiWave(18);
      }
    }

    if (remain <= 0) endBattle();
  }, 50);

  BATTLE.endTimeout = setTimeout(endBattle, BATTLE.duration);
}

function scheduleBotTap() {
  if (!BATTLE.running) return;
  // bot TPS: target ~6–11 taps/sec for short brainrot rounds
  const baseDelay = 70 + Math.random() * 120; // 70–190 ms
  BATTLE.enemyBot = setTimeout(() => {
    if (!BATTLE.running || !BATTLE.acceptingTaps) { scheduleBotTap(); return; }
    BATTLE.enemyScore++;
    document.getElementById('enemy-score').textContent = BATTLE.enemyScore;
    // bot animates THE OPPOSITE side hand and shows opponent's digit
    animateHandForSide(BATTLE.enemySide);
    spawnFloaterForSide(BATTLE.enemySide);
    burstParticles(BATTLE.enemySide, 5);
    triggerBattleFlash(BATTLE.enemySide, Math.random() < 0.2 ? 'big' : 'normal');
    // ~35% of enemy taps also kick the speed-lines so the bg keeps moving
    if (Math.random() < 0.35) pulseSpeedlines();
    if (Math.random() < 0.22) spawnStickerBurst(BATTLE.enemySide, pickChaosWord(BATTLE.enemySide));
    updateVsBar();
    scheduleBotTap();
  }, baseDelay);
}

function updateVsBar() {
  const total = Math.max(1, BATTLE.myScore + BATTLE.enemyScore);
  const pSix = state.side === 6
    ? (BATTLE.myScore / total) * 100
    : (BATTLE.enemyScore / total) * 100;
  const pSeven = 100 - pSix;
  document.getElementById('vs-bar-six').style.width = pSix + '%';
  document.getElementById('vs-bar-seven').style.width = pSeven + '%';
}

// Player side 6 -> LEFT hand; side 7 -> RIGHT hand.
function handElForSide(side) {
  return side === 6
    ? document.getElementById('battle-hand-left')
    : document.getElementById('battle-hand-right');
}

function animateHandForSide(side) {
  const el = handElForSide(side);
  // re-trigger keyframe animation by toggling class with reflow flush
  el.classList.remove('is-tap');
  // Force reflow so the browser actually restarts the animation
  void el.offsetWidth;
  el.classList.add('is-tap');
}

function spawnFloaterForSide(side) {
  const layer = document.getElementById('battle-floaters');
  const f = document.createElement('div');
  f.className = 'floater';
  f.dataset.side = side;
  f.textContent = side === 6 ? 'SIX!' : 'SEVEN!';
  // left half for 6, right half for 7
  const xPct = side === 6
    ? 12 + Math.random() * 28   // 12–40%
    : 60 + Math.random() * 28;  // 60–88%
  const yPct = 30 + Math.random() * 25;
  f.style.left = xPct + '%';
  f.style.top  = yPct + '%';
  f.style.setProperty('--r', ((Math.random() * 16) - 8).toFixed(1) + 'deg');
  layer.appendChild(f);
  setTimeout(() => f.remove(), 820);
}

const tapZone = document.getElementById('tap-zone');
function onTap() {
  if (!BATTLE.running || !BATTLE.acceptingTaps) return;

  haptic.light();

  BATTLE.myScore++;
  document.getElementById('me-score').textContent = BATTLE.myScore;

  // Animate THE PLAYER'S OWN side hand and floater
  animateHandForSide(state.side);
  spawnFloaterForSide(state.side);

  // Pop the central digit
  const digitEl = document.getElementById('battle-digit');
  digitEl.classList.remove('is-pop');
  void digitEl.offsetWidth;
  digitEl.classList.add('is-pop');

  // Burst particles for extra juice
  burstParticles(state.side, BATTLE.combo >= 8 ? 12 : 8);
  triggerBattleFlash(state.side, BATTLE.combo >= 9 ? 'big' : 'normal');
  pulseSpeedlines();
  tapZone.classList.remove('is-armed');
  void tapZone.offsetWidth;
  tapZone.classList.add('is-armed');
  registerCombo();
  if (BATTLE.combo >= 3 && BATTLE.combo % 3 === 0) confettiWave(10);
  if (BATTLE.combo >= 5 && BATTLE.combo % 5 === 0) phraseStorm(5);

  updateVsBar();
}

tapZone.addEventListener('pointerdown', onTap);
// Also allow tapping the stage itself for satisfaction
document.getElementById('battle-stage').addEventListener('pointerdown', onTap);

// Visual particle burst (pure DOM, tap confetti)
function burstParticles(side, amount = 5) {
  const layer = document.getElementById('battle-floaters');
  const color = side === 6 ? '#2c7df5' : '#ff2a6d';
  const baseX = side === 6 ? 28 : 72; // anchor X% near the active hand
  const baseY = 60;
  for (let i = 0; i < amount; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    p.style.left = (baseX + (Math.random() * 14 - 7)) + '%';
    p.style.top  = (baseY + (Math.random() * 10 - 5)) + '%';
    p.style.background = color;
    const dx = (Math.random() * 100 - 50);
    const dy = -(36 + Math.random() * 90);
    p.style.setProperty('--dx', dx + 'px');
    p.style.setProperty('--dy', dy + 'px');
    layer.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

function pickChaosWord(side) {
  const sideWords = SIDE_PHRASES[side] || [];
  const core = side === 6 ? ['SIX!', '6 GANG', 'SIX SEVEN!'] : ['SEVEN!', '7 GANG', 'SIX SEVEN!'];
  const weighted = [
    ...core,
    ...core,
    ...sideWords,
    ...sideWords,
    ...BRAINROT_PHRASES_2026
  ];
  return weighted[Math.floor(Math.random() * weighted.length)];
}

function spawnStickerBurst(side, text = pickChaosWord(side), mode = 'normal') {
  const layer = document.getElementById('battle-floaters');
  const s = document.createElement('div');
  s.className = 'chaos-sticker';
  if (mode === 'rain') s.classList.add('chaos-sticker--rain');
  if (mode === 'mega') s.classList.add('chaos-sticker--mega');
  s.dataset.side = side;
  s.textContent = text;
  s.style.left = mode === 'rain'
    ? (Math.random() * 100) + '%'
    : (50 + (Math.random() * 34 - 17)) + '%';
  s.style.top = mode === 'rain'
    ? (-8 - Math.random() * 10) + '%'
    : (18 + Math.random() * 36) + '%';
  s.style.setProperty('--tx', (Math.random() * 150 - 75) + 'px');
  s.style.setProperty('--ty', mode === 'rain' ? (260 + Math.random() * 140) + 'px' : (-(70 + Math.random() * 90)) + 'px');
  s.style.setProperty('--rot', ((Math.random() * 28) - 14).toFixed(1) + 'deg');
  layer.appendChild(s);
  setTimeout(() => s.remove(), mode === 'rain' ? 1200 : 900);
}

function phraseStorm(amount = 10) {
  for (let i = 0; i < amount; i++) {
    setTimeout(() => {
      const side = Math.random() < 0.5 ? 6 : 7;
      const mode = i % 5 === 0 ? 'mega' : (i % 3 === 0 ? 'rain' : 'normal');
      spawnStickerBurst(side, pickChaosWord(side), mode);
    }, i * 55);
  }
}

function spawnConfettiPiece() {
  const layer = document.getElementById('battle-floaters');
  const c = document.createElement('span');
  c.className = 'confetti-piece';
  c.dataset.side = Math.random() < 0.5 ? 6 : 7;
  c.style.left = Math.random() * 100 + '%';
  c.style.top = (-4 - Math.random() * 10) + '%';
  c.style.setProperty('--fall-x', (Math.random() * 44 - 22).toFixed(1) + 'px');
  c.style.setProperty('--fall-r', ((Math.random() * 260) - 130).toFixed(1) + 'deg');
  c.style.setProperty('--fall-dur', (0.9 + Math.random() * 0.7).toFixed(2) + 's');
  layer.appendChild(c);
  setTimeout(() => c.remove(), 1700);
}

function confettiWave(amount = 12) {
  for (let i = 0; i < amount; i++) {
    setTimeout(spawnConfettiPiece, i * 32);
  }
}

function startBattleChaos() {
  clearInterval(BATTLE.chaosInterval);
  clearInterval(BATTLE.confettiInterval);
  clearInterval(BATTLE.stickerInterval);
  BATTLE.confettiInterval = setInterval(() => {
    if (!BATTLE.running || !BATTLE.acceptingTaps) return;
    spawnConfettiPiece();
    if (Math.random() < 0.6) spawnConfettiPiece();
  }, 150);
  BATTLE.stickerInterval = setInterval(() => {
    if (!BATTLE.running || !BATTLE.acceptingTaps) return;
    const side = Math.random() < 0.5 ? 6 : 7;
    spawnStickerBurst(side, pickChaosWord(side), Math.random() < 0.22 ? 'rain' : 'normal');
    if (Math.random() < 0.36) {
      const otherSide = side === 6 ? 7 : 6;
      spawnStickerBurst(otherSide, pickChaosWord(otherSide));
    }
  }, 340);
  BATTLE.chaosInterval = setInterval(() => {
    if (!BATTLE.running || !BATTLE.acceptingTaps) return;
    const side = Math.random() < 0.5 ? 6 : 7;
    burstParticles(side, 3 + Math.floor(Math.random() * 3));
    if (Math.random() < 0.45) triggerBattleFlash(side, Math.random() < 0.18 ? 'big' : 'normal');
    if (Math.random() < 0.18) phraseStorm(3);
  }, 240);
}


function showSixtySevenJackpot() {
  const old = document.querySelector('.sixty-seven-jackpot');
  if (old) old.remove();

  haptic.heavy();
  setTimeout(() => haptic.success(), 180);
  setTimeout(() => haptic.heavy(), 420);

  const overlay = document.createElement('div');
  overlay.className = 'sixty-seven-jackpot';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'assertive');

  const badge = document.createElement('div');
  badge.className = 'sixty-seven-jackpot__badge';
  badge.textContent = t('jackpot.badge');

  const line1 = document.createElement('div');
  line1.className = 'sixty-seven-jackpot__line sixty-seven-jackpot__line--one';
  line1.textContent = 'СИИИИИИСК';

  const line2 = document.createElement('div');
  line2.className = 'sixty-seven-jackpot__line sixty-seven-jackpot__line--two';
  line2.textContent = 'СЕЕЕЕВЕЕЕН';

  const sub = document.createElement('div');
  sub.className = 'sixty-seven-jackpot__sub';
  sub.textContent = t('jackpot.sub');

  overlay.append(badge, line1, line2, sub);

  const words = ['67!', 'AURA!', 'SIX!', 'SEVEN!', 'COOKED!', 'BONK!', 'NO WAY!', 'BRAINROT!'];
  for (let i = 0; i < 46; i++) {
    const piece = document.createElement('span');
    piece.className = 'sixty-seven-jackpot__confetti';
    piece.dataset.side = Math.random() < 0.5 ? '6' : '7';
    piece.style.left = (Math.random() * 100).toFixed(2) + '%';
    piece.style.top = (-8 - Math.random() * 20).toFixed(2) + '%';
    piece.style.setProperty('--dx', (Math.random() * 220 - 110).toFixed(1) + 'px');
    piece.style.setProperty('--rot', (Math.random() * 720 - 360).toFixed(1) + 'deg');
    piece.style.setProperty('--dur', (1.2 + Math.random() * 1.4).toFixed(2) + 's');
    piece.style.animationDelay = (Math.random() * 0.55).toFixed(2) + 's';
    overlay.appendChild(piece);
  }

  for (let i = 0; i < 16; i++) {
    const word = document.createElement('span');
    word.className = 'sixty-seven-jackpot__word';
    word.textContent = words[Math.floor(Math.random() * words.length)];
    word.dataset.side = Math.random() < 0.5 ? '6' : '7';
    word.style.left = (8 + Math.random() * 84).toFixed(2) + '%';
    word.style.top = (12 + Math.random() * 70).toFixed(2) + '%';
    word.style.setProperty('--tx', (Math.random() * 180 - 90).toFixed(1) + 'px');
    word.style.setProperty('--ty', (Math.random() * 160 - 80).toFixed(1) + 'px');
    word.style.setProperty('--rot', (Math.random() * 34 - 17).toFixed(1) + 'deg');
    word.style.animationDelay = (Math.random() * 0.7).toFixed(2) + 's';
    overlay.appendChild(word);
  }

  document.body.appendChild(overlay);
  setTimeout(() => overlay.classList.add('is-out'), 2600);
  setTimeout(() => overlay.remove(), 3200);
}


function getEnemySideForShare() {
  return Number(state.side) === 6 ? 7 : 6;
}

function buildSocialResultText(kind = 'shame') {
  const r = LAST_RESULT || { myScore: BATTLE.myScore, enemyScore: BATTLE.enemyScore, myWin: BATTLE.myScore > BATTLE.enemyScore, tie: BATTLE.myScore === BATTLE.enemyScore, side: state.side, enemySide: getEnemySideForShare() };
  const side = Number(r.side) === 7 ? 7 : 6;
  const enemy = side === 6 ? 7 : 6;
  const score = Number(r.myScore) || 0;
  const base = score === 67
    ? t('social.exact67', { side })
    : r.myWin
      ? t('social.win', { side, enemy, score })
      : t('social.lose', { side, enemy, score });
  const curse = getDailyCurse();
  if (kind === 'raid')  return t('social.raid', { side, enemy, curse });
  if (kind === 'story') return base + t('social.storyTail');
  return base + t('social.shameTail', { curse });
}

function getCurrentChallengeLink() {
  const score = LAST_RESULT?.myScore ?? BATTLE.myScore ?? 0;
  return getAppDeepLink(makeChallengeParam(state.side, score));
}

function renderResultSocial({ myWin, tie, reward }) {
  const side = Number(state.side) === 7 ? 7 : 6;
  const enemy = side === 6 ? 7 : 6;
  const score = BATTLE.myScore;
  const exact67 = score === 67;

  LAST_RESULT = {
    side,
    enemySide: enemy,
    myScore: BATTLE.myScore,
    enemyScore: BATTLE.enemyScore,
    myWin,
    tie,
    reward,
    exact67,
    challengeLink: getAppDeepLink(makeChallengeParam(side, score)),
  };

  const result = document.querySelector('.result');
  if (result) {
    result.dataset.side = String(side);
    result.dataset.outcome = exact67 ? 'jackpot' : myWin ? 'win' : tie ? 'tie' : 'lose';
  }

  const subtitle = document.getElementById('result-subtitle');
  if (subtitle) {
    if (exact67) subtitle.textContent = t('result.exact67Title');
    else if (myWin) subtitle.textContent = t('result.cookedTitle', { a: side, b: enemy });
    else if (tie) subtitle.textContent = t('result.tiedTitle', { a: side, b: enemy });
    else subtitle.textContent = t('result.cookedYouTitle', { a: side });
  }

  const calloutTitle = document.getElementById('result-callout-title');
  const calloutText = document.getElementById('result-callout-text');
  const streak = document.getElementById('result-streak');
  if (calloutTitle && calloutText) {
    if (exact67) {
      calloutTitle.textContent = t('result.calloutJackpotTitle');
      calloutText.textContent = t('result.calloutJackpotText', { side });
    } else if (myWin) {
      calloutTitle.textContent = t('result.calloutWinTitle', { side });
      calloutText.textContent = t('result.calloutWinText', { side, enemy });
    } else if (tie) {
      calloutTitle.textContent = t('result.calloutTieTitle');
      calloutText.textContent = t('result.calloutTieText');
    } else {
      calloutTitle.textContent = t('result.calloutLoseTitle');
      calloutText.textContent = t('result.calloutLoseText', { side, enemy });
    }
  }
  if (streak) {
    const n = Number(state.stats.currentStreak) || 0;
    streak.dataset.type = state.stats.streakType || 'none';
    if (state.stats.streakType === 'win') streak.textContent = t('result.streakWin', { n });
    else if (state.stats.streakType === 'lose') streak.textContent = t('result.streakLose', { n });
    else streak.textContent = t('result.streakTie');
  }

  const shame = document.getElementById('result-shame');
  if (shame) shame.textContent = exact67 ? t('result.shareJackpot') : t('result.shameSide', { side: enemy });

  const status = document.getElementById('challenge-status');
  if (status) {
    if (CURRENT_CHALLENGE) {
      const beat = score > CURRENT_CHALLENGE.score;
      status.hidden = false;
      status.dataset.status = beat ? 'win' : 'lose';
      status.textContent = beat
        ? t('result.challengeWon', { side, enemy: CURRENT_CHALLENGE.challengerSide })
        : t('result.challengeLost', { enemy: CURRENT_CHALLENGE.challengerSide });
    } else {
      status.hidden = true;
      status.textContent = '';
    }
  }
}

function shareShame() {
  const link = LAST_RESULT?.challengeLink || getCurrentChallengeLink();
  openTelegramShare({ text: buildSocialResultText('shame'), url: link });
  haptic.select();
}

function raidChat() {
  const side = Number(state.side) === 7 ? 7 : 6;
  const enemy = side === 6 ? 7 : 6;
  const query = `RAID_${side}_VS_${enemy}_${LAST_RESULT?.myScore || BATTLE.myScore || 0}`;
  if (tg?.switchInlineQuery) {
    tg.switchInlineQuery(query, ['groups', 'channels']);
    haptic.medium();
    return;
  }
  openTelegramShare({ text: buildSocialResultText('raid'), url: LAST_RESULT?.challengeLink || getCurrentChallengeLink() });
}

let resultHomeUnlockTimer = null;

function startResultHomeLock(seconds = 3) {
  const btn = document.getElementById('result-home');
  if (!btn) return;

  clearInterval(resultHomeUnlockTimer);
  let remaining = seconds;

  const baseLabel = t('result.home');
  const renderLocked = () => {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
    btn.classList.add('is-counting-down');
    btn.textContent = `${baseLabel} · ${remaining}`;
  };

  renderLocked();
  resultHomeUnlockTimer = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      renderLocked();
      return;
    }

    clearInterval(resultHomeUnlockTimer);
    resultHomeUnlockTimer = null;
    btn.disabled = false;
    btn.setAttribute('aria-disabled', 'false');
    btn.classList.remove('is-counting-down');
    btn.textContent = baseLabel;
  }, 1000);
}

function unlockResultHomeNow() {
  clearInterval(resultHomeUnlockTimer);
  resultHomeUnlockTimer = null;
  const btn = document.getElementById('result-home');
  if (!btn) return;
  btn.disabled = false;
  btn.setAttribute('aria-disabled', 'false');
  btn.classList.remove('is-counting-down');
  btn.textContent = t('result.home');
}

function endBattle() {
  if (!BATTLE.running) return;
  BATTLE.running = false;
  BATTLE.acceptingTaps = false;
  clearInterval(BATTLE.tickInterval);
  clearTimeout(BATTLE.endTimeout);
  clearTimeout(BATTLE.enemyBot);
  clearTimeout(BATTLE.comboHideTimeout);
  clearTimeout(BATTLE.memeResetTimeout);
  clearInterval(BATTLE.chaosInterval);
  clearInterval(BATTLE.confettiInterval);
  clearInterval(BATTLE.stickerInterval);
  tapZone?.classList.remove('is-live', 'is-armed');
  const tapHint = document.querySelector('.tap-zone__hint');
  if (tapHint) tapHint.textContent = t('battle.tap');

  // Side that wins is the one with more taps. Reward depends on win and effort.
  const myWin = BATTLE.myScore > BATTLE.enemyScore;
  const tie   = BATTLE.myScore === BATTLE.enemyScore;
  const reward = myWin ? Math.floor(50 + BATTLE.myScore * 0.8) : (tie ? 20 : 10);

  // Update stats
  if (myWin) {
    state.stats.wins++;
    state.stats.currentStreak = state.stats.streakType === 'win' ? state.stats.currentStreak + 1 : 1;
    state.stats.streakType = 'win';
  } else if (!tie) {
    state.stats.losses++;
    state.stats.currentStreak = state.stats.streakType === 'lose' ? state.stats.currentStreak + 1 : 1;
    state.stats.streakType = 'lose';
  } else {
    state.stats.ties++;
    state.stats.currentStreak = 0;
    state.stats.streakType = 'tie';
  }
  state.stats.totalTaps += BATTLE.myScore;
  state.stats.best = Math.max(state.stats.best, BATTLE.myScore);
  state.coins += reward;
  state.weeklyScore += BATTLE.myScore + (myWin ? 50 : 0);
  addToChatWar(state.side, BATTLE.myScore + (myWin ? 20 : 0));
  addToGuildScore(BATTLE.myScore + (myWin ? 67 : tie ? 20 : 6));
  saveState();
  syncTopBarCoins();

  // Show result
  const v = document.getElementById('result-verdict');
  v.classList.remove('is-win', 'is-lose', 'is-tie');
  if (myWin) { v.textContent = t('result.victory'); v.classList.add('is-win'); haptic.success(); }
  else if (tie) { v.textContent = t('result.draw'); v.classList.add('is-tie'); haptic.warning(); }
  else { v.textContent = t('result.defeat'); v.classList.add('is-lose'); haptic.error(); }

  const winningSide = myWin ? state.side : (tie ? state.side : BATTLE.enemySide);
  const winnerStyle = myWin ? state.digitStyle : (tie ? state.digitStyle : (BATTLE.enemyDigit || 'classic'));
  const sideEl = document.getElementById('result-side');
  sideEl.src = getDigitUrl(winnerStyle, winningSide);
  sideEl.dataset.side = winningSide;

  document.getElementById('result-my-score').textContent = BATTLE.myScore;
  document.getElementById('result-enemy-score').textContent = BATTLE.enemyScore;
  document.getElementById('result-reward').textContent = reward;
  renderResultSocial({ myWin, tie, reward });

  show('result');
  startResultHomeLock(3);

  if (BATTLE.myScore === 67) {
    setTimeout(showSixtySevenJackpot, 180);
  }
}

document.getElementById('result-home')?.addEventListener('click', (event) => {
  const btn = event.currentTarget;
  if (btn?.disabled || btn?.classList.contains('is-counting-down')) {
    event.preventDefault();
    return;
  }
  unlockResultHomeNow();
  haptic.select();
  show('home');
});
document.getElementById('result-shame')?.addEventListener('click', shareShame);
document.getElementById('result-raid')?.addEventListener('click', raidChat);
document.querySelectorAll('[data-go-home]').forEach(btn => {
  btn.addEventListener('click', () => {
    haptic.select();
    show('home');
  });
});
document.getElementById('ref-invite')?.addEventListener('click', shareReferral);
document.getElementById('guild-create')?.addEventListener('click', () => createGuildFromName());
document.getElementById('guild-invite')?.addEventListener('click', shareGuildInvite);
document.getElementById('guild-random')?.addEventListener('click', joinIncomingOrRandomGuild);
document.getElementById('guild-leave')?.addEventListener('click', leaveGuild);
document.querySelectorAll('[data-top-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    TOP_TAB = btn.dataset.topTab || 'players';
    haptic.select();
    openTop();
  });
});
document.getElementById('challenge-accept')?.addEventListener('click', () => {
  if (!CURRENT_CHALLENGE) return;
  haptic.medium();
  setSide(CURRENT_CHALLENGE.targetSide, { notify: true });
  startMatchmaking();
});

// ---------- Shop ----------
let SHOP_TAB = 'hands';
document.querySelectorAll('.shop-tab').forEach(t => {
  t.addEventListener('click', () => {
    haptic.select();
    SHOP_TAB = t.dataset.shopTab;
    document.querySelectorAll('.shop-tab').forEach(x => x.classList.toggle('is-active', x === t));
    renderShop();
  });
});

function openShop() {
  show('shop');
  renderShop();
}

function renderShop() {
  const grid = document.getElementById('shop-grid');
  grid.innerHTML = '';
  document.getElementById('shop-coins').textContent = state.coins.toLocaleString();

  const data = SHOP_TAB === 'hands' ? HAND_CATALOG : DIGIT_CATALOG;
  data.forEach(item => {
    const card = document.createElement('div');
    card.className = 'shop-card';

    const rarity = document.createElement('div');
    rarity.className = `shop-card__rarity shop-card__rarity--${item.rarity}`;
    rarity.textContent = t('rarity.' + item.rarity);
    card.appendChild(rarity);

    if (SHOP_TAB === 'hands') {
      const img = document.createElement('img');
      img.className = 'shop-card__img';
      img.src = item.img;
      img.alt = getItemName(item);
      card.appendChild(img);
    } else {
      const preview = document.createElement('div');
      preview.className = 'shop-card__digit-preview';
      const img6 = document.createElement('img');
      img6.src = item.img6; img6.alt = '6';
      const img7 = document.createElement('img');
      img7.src = item.img7; img7.alt = '7';
      preview.appendChild(img6);
      preview.appendChild(img7);
      card.appendChild(preview);
    }

    const name = document.createElement('div');
    name.className = 'shop-card__name';
    name.textContent = getItemName(item);
    card.appendChild(name);

    const cta = document.createElement('button');
    cta.className = 'shop-card__cta';
    const ownedList = SHOP_TAB === 'hands' ? state.ownedHands : state.ownedDigits;
    const equippedId = SHOP_TAB === 'hands' ? state.hand : state.digitStyle;
    const owned = ownedList.includes(item.id);
    const equipped = equippedId === item.id;

    if (equipped) {
      cta.classList.add('is-equipped');
      cta.textContent = t('shop.equipped');
    } else if (owned) {
      cta.classList.add('is-owned');
      cta.textContent = t('shop.equip');
      cta.addEventListener('click', () => {
        if (SHOP_TAB === 'hands') {
          state.hand = item.id;
          heroOtherHandId = null;
        } else state.digitStyle = item.id;
        saveState();
        haptic.success();
        toast(t('shop.equippedToast', { name: getItemName(item) }));
        if (SHOP_TAB === 'hands') syncHeroHands();
        if (SHOP_TAB === 'digits') syncHeroDigits();
        renderShop();
      });
    } else {
      const can = state.coins >= item.price;
      cta.textContent = `🪙 ${item.price}`;
      if (!can) cta.classList.add('is-locked');
      cta.addEventListener('click', () => {
        if (state.coins < item.price) {
          haptic.error();
          toast(t('shop.notEnough'));
          return;
        }
        state.coins -= item.price;
        if (SHOP_TAB === 'hands') {
          state.ownedHands.push(item.id);
          state.hand = item.id;
          heroOtherHandId = null;
        } else {
          state.ownedDigits.push(item.id);
          state.digitStyle = item.id;
        }
        saveState();
        syncTopBarCoins();
        haptic.success();
        toast(t('shop.unlocked', { name: getItemName(item) }));
        if (SHOP_TAB === 'hands') syncHeroHands();
        if (SHOP_TAB === 'digits') syncHeroDigits();
        renderShop();
      });
    }
    card.appendChild(cta);
    grid.appendChild(card);
  });
}

// ---------- Leaderboard (simulated) ----------
let TOP_TAB = 'players';
// Builds a Top-100 board. If the player is outside Top-100, they are shown separately.
function stableHash(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = ((h << 5) - h + String(str).charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildFakeTop() {
  const NAMES = RIVAL_NAMES.concat([
    'Bytes', 'NoCap', 'Cooked67', 'AlphaGen', 'sigmaMog', 'tralalero', 'Pluh99',
    'rizzler', 'Mald', 'gyatt', 'mewing', 'capybara', 'fanum', 'skbd', 'gigaChad',
    'auraThief', 'noChillll', 'Skibidi', '7gang', '6gang', 'YapYap', 'cookedTwin',
    'mid_one', 'BasedRain', 'L_or_W', 'Bombardiro', 'tungsahur', 'mango67', 'ohio',
    'sussy', 'aura+67', 'NPC_real', 'doot.dt', 'KleoX2', 'spectre67', 'g0blink',
    'mishakek', 'bruh666', 'lola.exe', 'cr1s', 'taptap', 'vibez', 'huh.what',
    'pluh.lol', 'gyatfarm', 'mogmaxxx', 'rizzless', 'cooked.x', 'auraDebt', 'sahurmode',
    'cappucino', 'ballerina', 'crocodilo', 'jockey7', 'mustardX', 'memereset', 'doomscroll',
    'tungtung', 'tralalala', 'BraInRoT', 'lockedIn', 'nochill67', 'pluhster', 'mantis',
    'Vibezx2', 'KleoZ', 'nya67', 'wRizz', 'fanumdrip', 'gyatslayer', 'crashout7',
    'mid_six', 'Cooker.fr', 'aura.now', 'huhhh', 'sevenLord', 'sixBoss', 'bloxKid',
    'sigmaTap', 'noAura', 'handed', 'tapDealer', 'miniMob', 'raidme', 'shameBot',
  ]);

  const pool = NAMES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const top100 = pool.slice(0, 100).map((n, idx) => ({
    name: n,
    side: Math.random() < 0.5 ? 6 : 7,
    // Keep the public board competitive enough that new users do not appear in Top-100 by accident.
    score: Math.floor(1200 + Math.random() * 10800 + (100 - idx) * 7),
  })).sort((a, b) => b.score - a.score);

  const me = { name: state.name, side: state.side, score: state.weeklyScore, me: true };
  let meRank = top100.filter(p => p.score > me.score).length + 1;
  let visible = top100.slice();

  if (meRank <= 100) {
    visible.splice(meRank - 1, 0, me);
    visible = visible.slice(0, 100);
  } else {
    const lowest = top100[top100.length - 1]?.score || 1200;
    const gapRatio = Math.max(0, Math.min(1, (lowest - me.score) / Math.max(1, lowest)));
    const tailNoise = stableHash(state.name + '|' + state.side) % 420;
    meRank = 101 + Math.floor(gapRatio * 6100) + tailNoise;
  }

  return {
    top100: visible.map((p, idx) => ({ ...p, rank: idx + 1 })),
    meRank,
    me,
    isMeVisible: meRank <= 100,
  };
}

// "Resets in" timer — Monday 00:00 UTC.
function getWeeklyResetText() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 sun .. 6 sat
  const daysUntilMonday = (8 - day) % 7 || 7; // next monday, never zero
  const next = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMonday,
    0, 0, 0
  ));
  const ms = next - now;
  const d = Math.floor(ms / (24 * 3600 * 1000));
  const h = Math.floor((ms % (24 * 3600 * 1000)) / (3600 * 1000));
  const m = Math.floor((ms % (3600 * 1000)) / (60 * 1000));
  return d > 0 ? t('time.daysHours', { d, h }) : t('time.hoursMin', { h, m });
}

function buildFakeGuildTop() {
  const suffixes = ['RAID', 'AURA', 'COOKED', 'BLOX', 'SIGMA', 'MANGO', 'SAHUR', 'NO CAP', 'GYATT', 'NPC', 'OHIO', 'PLUH'];
  const generated = Array.from({ length: 122 }, (_, idx) => {
    const base = FAKE_GUILDS[idx % FAKE_GUILDS.length];
    const n = idx + 11;
    const side = idx % 2 ? 7 : 6;
    return {
      id: `fake-guild-${n}`,
      name: `${suffixes[idx % suffixes.length]} ${side} #${n}`,
      tag: (suffixes[idx % suffixes.length].replace(/[^A-Z]/g, '') || 'GNG').slice(0,3),
      side,
      members: Math.max(67, Math.floor(base.members * (0.78 - idx * 0.004))),
      score: Math.max(670, Math.floor(base.score * (0.74 - idx * 0.0045) + (stableHash(base.id + n) % 1400))),
      aura: base.aura,
      me: false,
    };
  });
  const board = FAKE_GUILDS.map(g => ({ ...g, me: false })).concat(generated);
  if (hasGuild()) {
    board.push({
      id: state.guild.id,
      name: state.guild.name,
      tag: state.guild.tag || 'GNG',
      side: state.guild.side,
      members: Number(state.guild.members || 1),
      score: Number(state.guild.score || 0),
      aura: 'YOU',
      me: true,
    });
  }
  board.sort((a,b) => Number(b.score || 0) - Number(a.score || 0));
  return board.map((g, idx) => ({ ...g, rank: idx + 1 }));
}

function createGuildTopRow(g, place) {
  const row = document.createElement('div');
  row.className = 'top-row top-row--guild';
  if (g.me) row.classList.add('is-me');
  if (place === 1) row.classList.add('top-row--gold');
  else if (place === 2) row.classList.add('top-row--silver');
  else if (place === 3) row.classList.add('top-row--bronze');
  else if (place === 67) row.classList.add('top-row--lucky67');

  const rank = document.createElement('div');
  rank.className = 'top-row__rank';
  rank.textContent = place;
  const name = document.createElement('div');
  name.className = 'top-row__name';
  name.innerHTML = `<span class="guild-row-tag">${g.tag || 'GNG'}</span> ${g.name}${g.me ? '  (YOU)' : ''}`;
  const right = document.createElement('div');
  right.className = 'top-row__right';
  const sideEl = document.createElement('span');
  sideEl.className = 'top-row__side';
  sideEl.dataset.side = g.side;
  sideEl.textContent = g.side;
  const score = document.createElement('span');
  score.className = 'top-row__score';
  score.textContent = Number(g.score || 0).toLocaleString('ru-RU');
  const mem = document.createElement('span');
  mem.className = 'top-row__prize';
  mem.textContent = `👥 ${Number(g.members || 1).toLocaleString('ru-RU')}`;
  right.append(sideEl, score, mem);
  if (!g.me) {
    const btn = document.createElement('button');
    btn.className = 'guild-join-mini';
    btn.textContent = hasGuild() ? 'LOCKED' : (getLang() === 'ru' ? 'ВСТУПИТЬ' : 'JOIN');
    btn.disabled = hasGuild() || guildCooldownLeft() > 0;
    btn.addEventListener('click', () => joinGuild(g));
    right.append(btn);
  }
  row.append(rank, name, right);
  return row;
}

function createTopRow(p, place) {
  const row = document.createElement('div');
  row.className = 'top-row';
  if (p.me) row.classList.add('is-me');
  if (place === 1) row.classList.add('top-row--gold');
  else if (place === 2) row.classList.add('top-row--silver');
  else if (place === 3) row.classList.add('top-row--bronze');
  else if (place === 67) row.classList.add('top-row--lucky67');

  const rank = document.createElement('div');
  rank.className = 'top-row__rank';
  if (place === 1) rank.classList.add('gold');
  else if (place === 2) rank.classList.add('silver');
  else if (place === 3) rank.classList.add('bronze');
  else if (place === 67) rank.classList.add('lucky');
  rank.textContent = place;

  const name = document.createElement('div');
  name.className = 'top-row__name';
  name.textContent = p.name + (p.me ? '  (' + t('top.you') + ')' : '');

  const right = document.createElement('div');
  right.className = 'top-row__right';
  const sideEl = document.createElement('span');
  sideEl.className = 'top-row__side';
  sideEl.dataset.side = p.side;
  sideEl.textContent = p.side;
  const score = document.createElement('span');
  score.className = 'top-row__score';
  score.textContent = p.score.toLocaleString('ru-RU');
  right.append(sideEl, score);

  const prize = (place === 1 || place === 2 || place === 3 || place === 67);
  if (prize) {
    const tag = document.createElement('span');
    tag.className = 'top-row__prize';
    if (place === 1) tag.textContent = '⭐ 1000 + 🎁';
    else if (place === 2) tag.textContent = '⭐ 500';
    else if (place === 3) tag.textContent = '⭐ 250';
    else if (place === 67) tag.textContent = '⭐ 67 + 🎁';
    right.append(tag);
  }

  row.append(rank, name, right);
  return row;
}

function openTop() {
  show('top');
  applyTranslations();
  const resetEl = document.getElementById('reset-in');
  if (resetEl) resetEl.textContent = getWeeklyResetText();

  document.querySelectorAll('.top-tab').forEach(btn => btn.classList.toggle('is-active', btn.dataset.topTab === TOP_TAB));
  const playerPrize = document.getElementById('top-player-prize');
  const guildPrize = document.getElementById('top-guild-prize');
  if (playerPrize) playerPrize.hidden = TOP_TAB !== 'players';
  if (guildPrize) guildPrize.hidden = TOP_TAB !== 'guilds';

  const list = document.getElementById('top-list');
  const myRankCard = document.getElementById('top-me-rank');
  list.innerHTML = '';
  if (myRankCard) {
    myRankCard.hidden = true;
    myRankCard.innerHTML = '';
  }

  if (TOP_TAB === 'guilds') {
    const board = buildFakeGuildTop();
    const top100 = board.slice(0, 100);
    top100.forEach(g => list.appendChild(createGuildTopRow(g, g.rank)));
    const me = board.find(g => g.me);
    if (me && me.rank > 100 && myRankCard) {
      myRankCard.hidden = false;
      const row = createGuildTopRow(me, me.rank);
      row.classList.add('is-me', 'top-row--outside');
      const title = document.createElement('div');
      title.className = 'top-me-rank__title';
      title.textContent = t('guild.youRank', { rank: me.rank.toLocaleString('ru-RU') });
      const text = document.createElement('div');
      text.className = 'top-me-rank__text';
      text.textContent = t('guild.outsideTop');
      myRankCard.append(title, row, text);
    }
    renderGuildCard();
    return;
  }

  const board = buildFakeTop();
  board.top100.slice(0, 100).forEach(p => {
    list.appendChild(createTopRow(p, p.rank));
  });

  if (!board.isMeVisible && myRankCard) {
    myRankCard.hidden = false;
    const row = createTopRow(board.me, board.meRank);
    row.classList.add('is-me', 'top-row--outside');
    const title = document.createElement('div');
    title.className = 'top-me-rank__title';
    title.textContent = t('top.youRank', { rank: board.meRank.toLocaleString('ru-RU') });
    const text = document.createElement('div');
    text.className = 'top-me-rank__text';
    text.textContent = t('top.outsideText');
    myRankCard.append(title, row, text);
  }
}
// ---------- Profile ----------
function openProfile() {
  show('profile');
  applyTranslations();
  document.getElementById('profile-name').textContent = state.name;
  document.getElementById('profile-rank').textContent = rankLabel(state.stats.wins);
  document.getElementById('profile-wins').textContent = state.stats.wins;
  document.getElementById('profile-losses').textContent = state.stats.losses;
  document.getElementById('profile-best').textContent = state.stats.best;
  document.getElementById('profile-pick-6')?.classList.toggle('is-active', state.side === 6);
  document.getElementById('profile-pick-7')?.classList.toggle('is-active', state.side === 7);
  syncLangPicker();
}
// Language picker
document.querySelectorAll('.lang-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang;
    if (!lang || lang === getLang()) return;
    haptic.success();
    setLang(lang);
    toast(t('profile.langSwitched'));
  });
});

document.getElementById('open-profile-top')?.addEventListener('click', () => {
  haptic.select();
  openProfile();
});
document.getElementById('open-shop-top')?.addEventListener('click', () => {
  haptic.select();
  openShop();
});

function rankLabel(wins) {
  let key = 'RECRUIT';
  if (wins >= 60) key = 'LEGEND';
  else if (wins >= 25) key = 'CHAMPION';
  else if (wins >= 10) key = 'CONTENDER';
  else if (wins >= 3) key = 'STREET FIGHTER';
  return t('rank.' + key);
}

// ---------- Top bar / sync ----------
function syncTopBarCoins() {
  document.getElementById('user-coins').textContent = state.coins.toLocaleString();
}

// ---------- Init top bar ----------
document.getElementById('user-name').textContent = state.name;
document.getElementById('user-rank').textContent = rankLabel(state.stats.wins);
applyTranslations();
syncTopBarCoins();
syncSideChoice();
renderGlobalWar();
syncHeroHands();
syncHeroDigits();
startHeroHandShuffle();
renderHomeSocial();
renderReferralCard();
renderGuildCard();
bootIncomingReferral();
bootIncomingGuild();
bootIncomingChallenge();

// ---------- Toast helper ----------
let toastTimer;
function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 1700);
}

// ---------- Prevent double-tap zoom on iOS ----------
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// ---------- Boot ----------
if (!applyDesktopGuard()) show('home');
window.addEventListener('resize', applyDesktopGuard);
