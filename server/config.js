export const GAME_CONFIG = Object.freeze({
  port: Number(process.env.PORT || 3000),
  matchmakingMs: 6700,
  roundMs: 6700,
  startDelayMs: 1200,
  scoreBroadcastMs: 67,
  maxTapRatePerSecond: 35,
  botMinDelayMs: 72,
  botMaxDelayMs: 172,
  botFinalRushMultiplier: 0.78,
  dbFile: process.env.SIX_SEVEN_DB || 'data/six-seven-db.json',
});

export const RIVAL_NAMES = Object.freeze([
  'ZenBoy', 'Ksu_Lab', 'NoChill', 'CR1S', 'mishakek', 'Bruh666', 'Lola.exe',
  'taptap', 'Vibez', 'huh_what', 'pluh', 'GYAT', 'Spectre', 'KleoX', 'g0blin',
  'Cooked67', 'AuraDebt', 'BloxKid', 'SevenLord', 'SixBoss'
]);

export const HAND_IDS = Object.freeze(['hand', 'clown', 'cube', 'spanch', 'devil', 'roblox', 'robo']);
export const DIGIT_IDS = Object.freeze(['classic', 'clown', 'devil', 'robo']);
