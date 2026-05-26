/* Referral privacy guard: never share TGID-derived referral codes. */
(function(){
  var MASKED_CODE_RE = /^r[A-Za-z0-9]{8,20}$/;
  var LEGACY_CODE_RE = /^u[0-9a-z]{2,24}$/i;

  function tg(){ return window.Telegram && window.Telegram.WebApp; }
  function isUnsafeCode(code){
    var value = String(code || '');
    return !MASKED_CODE_RE.test(value) || LEGACY_CODE_RE.test(value);
  }
  function syncUser(user){
    if (!user) return;
    try {
      state.referrals = Object.assign({}, state.referrals || {}, user.referrals || {});
      state.coins = Number(user.coins ?? state.coins ?? 0);
      state.weeklyScore = Number(user.weeklyScore ?? state.weeklyScore ?? 0);
      if (typeof saveState === 'function') saveState();
      if (typeof renderReferralCard === 'function') renderReferralCard();
      if (typeof syncTopBarCoins === 'function') syncTopBarCoins();
    } catch(e) {}
  }
  async function loadMaskedCode(){
    try {
      if (!window.SixSevenAPI || !SixSevenAPI.ready) throw new Error('API is not ready');
      var data = await SixSevenAPI.request('/api/me', { method:'GET' });
      syncUser(data.user);
      var code = data && data.user && data.user.referrals && data.user.referrals.code;
      if (!code || isUnsafeCode(code)) throw new Error('Masked referral code is not available yet');
      return code;
    } catch(e) {
      var local = state && state.referrals && state.referrals.code;
      if (local && !isUnsafeCode(local)) return local;
      throw e;
    }
  }
  function makeParam(code){
    var side = 6;
    try { side = Number(state.side) === 7 ? 7 : 6; } catch(e) {}
    return 'r_' + String(code).replace(/[^A-Za-z0-9]/g, '').slice(0,24) + '_' + side;
  }
  function makeDeepLink(param){
    var safeParam = String(param || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
    var bot = String(window.SIX_SEVEN_BOT_USERNAME || '').replace(/^@/, '');
    var app = String(window.SIX_SEVEN_APP_NAME || '').replace(/^\//, '');
    if (bot) return 'https://t.me/' + bot + (app ? '/' + encodeURIComponent(app) : '') + '?startapp=' + encodeURIComponent(safeParam);
    try {
      var url = new URL(location.href);
      url.searchParams.set('tgWebAppStartParam', safeParam);
      return url.toString();
    } catch(e) { return location.href; }
  }
  async function getMaskedReferralLink(){
    var code = await loadMaskedCode();
    return makeDeepLink(makeParam(code));
  }
  function openShare(text, url){
    var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url || '') + '&text=' + encodeURIComponent(text || '');
    if (tg()?.openTelegramLink) tg().openTelegramLink(shareUrl);
    else if (tg()?.openLink) tg().openLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }
  async function shareMaskedReferral(){
    try {
      var link = await getMaskedReferralLink();
      try { state.referrals.sent = Math.max(0, Number(state.referrals.sent || 0)) + 1; saveState(); renderReferralCard(); } catch(e) {}
      try { haptic && haptic.success && haptic.success(); } catch(e) {}
      var side = 6;
      try { side = Number(state.side) === 7 ? 7 : 6; } catch(e) {}
      var text = 'I picked ' + side + ' GANG. Join first or accept aura debt.';
      try { text = t('ref.shareText', { side: side }); } catch(e) {}
      openShare(text, link);
    } catch(err) {
      try { haptic && haptic.error && haptic.error(); } catch(e) {}
      try { toast('Referral link is syncing. Try again in a second.'); } catch(e) {}
    }
  }

  try { window.getMaskedReferralLink = getMaskedReferralLink; } catch(e) {}
  try { getReferralLink = window.getReferralLink = function(){
    var code = state && state.referrals && state.referrals.code;
    if (!code || isUnsafeCode(code)) return location.href;
    return makeDeepLink(makeParam(code));
  }; } catch(e) {}
  try { shareReferral = window.shareReferral = shareMaskedReferral; } catch(e) { window.shareReferral = shareMaskedReferral; }

  function bind(){
    var btn = document.getElementById('ref-invite');
    if (btn && btn.dataset.maskedReferralBound !== '1') {
      btn.dataset.maskedReferralBound = '1';
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        shareMaskedReferral();
      }, true);
    }
    try {
      if (state && state.referrals && isUnsafeCode(state.referrals.code) && window.SixSevenAPI && SixSevenAPI.ready) {
        loadMaskedCode().catch(function(){});
      }
    } catch(e) {}
  }
  document.addEventListener('DOMContentLoaded', bind);
  window.addEventListener('six-seven:api-ready', function(e){ syncUser(e.detail); bind(); });
  setInterval(bind, 1000);
})();
