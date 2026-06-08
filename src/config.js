export const CONFIG = {
  matchmakingMs: 6700,
  roundMs: 6700,
  startDelayMs: 1200,
  reconnectBaseMs: 900,
  reconnectMaxMs: 4200,
  matchFallbackGraceMs: 650,
};

export const STORE_KEY = 'six-seven::state-v3';
export const LEGACY_STORE_KEYS = ['six-seven::state-v2-server-authoritative', 'six-seven::state-v1'];
export const PLAYER_ID_KEY = 'six-seven::player-id';
export const SESSION_PLAYER_ID_KEY = 'six-seven::session-player-id';

export const HAND_CATALOG = Object.freeze([
  { id: 'hand', name: 'CLASSIC', img: 'assets/hand.png', price: 0, rarity: 'common' },
  { id: 'clown', name: 'JOKER', img: 'assets/clown.png', price: 500, rarity: 'rare' },
  { id: 'cube', name: 'BLOCKY', img: 'assets/cube.png', price: 700, rarity: 'rare' },
  { id: 'spanch', name: 'SPONGE', img: 'assets/spanch.png', price: 1200, rarity: 'epic' },
  { id: 'devil', name: 'DEMON', img: 'assets/devil.png', price: 1500, rarity: 'epic' },
  { id: 'roblox', name: 'BLOX', img: 'assets/roblox.png', price: 2400, rarity: 'legend' },
  { id: 'robo', name: 'CYBORG', img: 'assets/robo.png', price: 3000, rarity: 'legend' },
]);

export const DIGIT_CATALOG = Object.freeze([
  { id: 'classic', name: 'CLASSIC', price: 0, rarity: 'common', img6: 'assets/digits/classic-6.png', img7: 'assets/digits/classic-7.png' },
  { id: 'clown', name: 'JOKER', price: 400, rarity: 'rare', img6: 'assets/digits/clown-6.png', img7: 'assets/digits/clown-7.png' },
  { id: 'devil', name: 'DEMON', price: 1200, rarity: 'epic', img6: 'assets/digits/devil-6.png', img7: 'assets/digits/devil-7.png' },
  { id: 'robo', name: 'CYBORG', price: 2500, rarity: 'legend', img6: 'assets/digits/robo-6.png', img7: 'assets/digits/robo-7.png' },
]);

export const RIVAL_NAMES = Object.freeze([
  'ZenBoy',
  'Ksu_Lab',
  'NoChill',
  'CR1S',
  'mishakek',
  'Bruh666',
  'Lola.exe',
  'taptap',
  'Vibez',
  'huh_what',
  'pluh',
  'GYAT',
  'Spectre',
  'KleoX',
  'Cooked67',
  'AuraDebt',
  'BloxKid',
  'SevenLord',
  'SixBoss',
  'ByteKid',
]);

export const DEFAULT_STATS = Object.freeze({
  wins: 0,
  losses: 0,
  ties: 0,
  best: 0,
  totalTaps: 0,
  currentStreak: 0,
  streakType: 'none',
});

export const DEFAULT_GUILD = Object.freeze({
  id: '',
  name: '',
  tag: '',
  side: 6,
  score: 0,
  members: 0,
  invites: 0,
  lockedUntil: 0,
  cooldownUntil: 0,
});

export function sideOf(side) {
  return Number(side) === 7 ? 7 : 6;
}

export function oppositeSide(side) {
  return sideOf(side) === 6 ? 7 : 6;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function pick(list) {
  return list[Math.floor(Math.random() * list.length)] || list[0];
}

export function getHandImage(id) {
  return (HAND_CATALOG.find(item => item.id === id) || HAND_CATALOG[0]).img;
}

export function getDigitStyle(id) {
  return DIGIT_CATALOG.find(item => item.id === id) || DIGIT_CATALOG[0];
}

export function getDigitImage(styleId, side) {
  const item = getDigitStyle(styleId);
  return sideOf(side) === 6 ? item.img6 : item.img7;
}

export function isKnownHand(id) {
  return HAND_CATALOG.some(item => item.id === id);
}

export function isKnownDigit(id) {
  return DIGIT_CATALOG.some(item => item.id === id);
}
