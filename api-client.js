/* Six Seven API bridge. Works with Cloudflare env or built-in production fallback. */
(function () {
  const API_BASE = String(window.SIX_SEVEN_API_BASE || 'https://six-seven-api.onrender.com').replace(/\/$/, '');
  const TOKEN_KEY = 'six-seven::api-token';
  const STORE_KEY = 'six-seven::state-v1';
  const STATUS_KEY = 'six-seven::api-status';

  const tg = window.Telegram && window.Telegram.WebApp;
  const state = { token: localStorage.getItem(TOKEN_KEY) || '', ready: false, me: null, lastError: '' };

  function mark(status, extra) {
    const payload = { status, apiBase: API_BASE, time: new Date().toISOString(), extra: extra || '' };
    try { localStorage.setItem(STATUS_KEY, JSON.stringify(payload)); } catch {}
    window.dispatchEvent(new CustomEvent('six-seven:api-status', { detail: payload }));
  }

  async function healthPing() {
    try {
      mark('health-start');
      const res = await fetch(API_BASE + '/api/health', { method: 'GET', cache: 'no-store' });
      const data = await res.json().catch(function () { return {}; });
      mark(res.ok ? 'health-ok' : 'health-error', JSON.stringify(data).slice(0, 180));
      return res.ok;
    } catch (err) {
      mark('health-failed', err.message || 'network error');
      return false;
    }
  }

  function getLocalState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  }
  function setLocalState(user) {
    if (!user) return;
    const oldState = getLocalState();
    const next = Object.assign({}, oldState, {
      name: user.name || oldState.name,
      coins: Number(user.coins ?? oldState.coins ?? 0),
      side: Number(user.side || oldState.side || 6),
      weeklyScore: Number(user.weeklyScore ?? oldState.weeklyScore ?? 0),
      hand: user.hand || oldState.hand || 'hand',
      digitStyle: user.digitStyle || oldState.digitStyle || 'classic',
      ownedHands: Array.isArray(user.ownedHands) ? user.ownedHands : (oldState.ownedHands || ['hand']),
      ownedDigits: Array.isArray(user.ownedDigits) ? user.ownedDigits : (oldState.ownedDigits || ['classic']),
      stats: Object.assign({}, oldState.stats || {}, user.stats || {}),
      referrals: Object.assign({}, oldState.referrals || {}, user.referrals || {}),
      guild: user.guild ? Object.assign({}, oldState.guild || {}, user.guild) : (oldState.guild || {})
    });
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
    state.me = user;
  }
  async function request(path, opts) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    const res = await fetch(API_BASE + path, Object.assign({}, opts || {}, { headers, cache: 'no-store' }));
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('API ' + res.status));
    return data;
  }
  function startParam() {
    const raw = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
    const ref = /^r_([^_]+)_?([67])?/.exec(raw);
    const guild = /^g_([^_]+)_?([67])?/.exec(raw);
    return { refCode: (ref && ref[1]) || '', guildId: (guild && guild[1]) || '', side: Number((ref && ref[2]) || (guild && guild[2]) || 0) || undefined };
  }
  async function bootstrap() {
    try {
      const initData = (tg && tg.initData) || '';
      if (!initData) {
        state.ready = false;
        state.lastError = 'Telegram initData is empty';
        mark('no-init-data', state.lastError);
        console.warn('[api] Telegram initData is empty. Open from mobile Telegram, not browser preview.');
        return false;
      }
      mark('auth-start');
      const local = getLocalState();
      const sp = startParam();
      const data = await request('/api/auth/telegram', { method: 'POST', body: JSON.stringify({ initData, side: local.side, refCode: sp.refCode, guildId: sp.guildId }) });
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, state.token);
      setLocalState(data.user);
      state.ready = true;
      state.lastError = '';
      mark('ready', data.user && data.user.telegramId);
      window.dispatchEvent(new CustomEvent('six-seven:api-ready', { detail: data.user }));
      console.info('[api] ready', data.user && data.user.telegramId);
      return true;
    } catch (err) {
      state.ready = false;
      state.lastError = err.message || 'api error';
      mark('error', state.lastError);
      console.warn('[api] bootstrap failed:', state.lastError);
      window.dispatchEvent(new CustomEvent('six-seven:api-error', { detail: state.lastError }));
      return false;
    }
  }
  function bootstrapWithRetry() {
    let attempts = 0;
    const run = async () => {
      attempts += 1;
      await healthPing();
      const ok = await bootstrap();
      if (ok || attempts >= 20) return;
      setTimeout(run, 500);
    };
    run();
  }
  async function syncMatch() {
    if (!state.ready) return;
    const result = document.querySelector('[data-screen="result"]');
    if (!result || result.hidden) return;
    const myScore = Number(document.getElementById('result-my-score')?.textContent || 0);
    const enemyScore = Number(document.getElementById('result-enemy-score')?.textContent || 0);
    if (!myScore && !enemyScore) return;
    const side = Number(getLocalState().side || 6);
    const key = [myScore, enemyScore, side].join(':');
    if (syncMatch.lastKey === key) return;
    syncMatch.lastKey = key;
    try {
      const data = await request('/api/matches/finish', { method: 'POST', body: JSON.stringify({ myScore, enemyScore, side, durationMs: 6700 }) });
      setLocalState(data.user);
      mark('match-synced', key);
      window.dispatchEvent(new CustomEvent('six-seven:server-match-synced', { detail: data }));
    } catch (err) {
      mark('match-sync-error', err.message);
      console.warn('[api] match sync failed:', err.message);
    }
  }
  window.SixSevenAPI = { request, bootstrap, bootstrapWithRetry, healthPing, syncMatch, get token() { return state.token; }, get ready() { return state.ready; }, get me() { return state.me; }, get lastError() { return state.lastError; }, apiBase: API_BASE };
  mark('loaded');
  healthPing();
  document.addEventListener('DOMContentLoaded', function () {
    bootstrapWithRetry();
    new MutationObserver(function () { syncMatch(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  });
})();
