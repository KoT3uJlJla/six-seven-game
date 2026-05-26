/* Referral privacy guard: never share TGID-derived referral codes or Telegram hash payload. */
(function(){
  var MASKED_CODE_RE = /^r[A-Za-z0-9]{8,20}$/;
  var LEGACY_CODE_RE = /^u[0-9a-z]{2,24}$/i;
  var DEFAULT_BOT_USERNAME = 'sixseven_game_bot';
  var cachedMaskedLink = '';
  var loading = false;

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
  function makeParam(code){
    var side = 6;
    try { side = Number(state.side) === 7 ? 7 : 6; } catch(e) {}
    return 'r_' + String(code).replace(/[^A-Za-z0-9]/g, '').slice(0,24) + '_' + side;
  }
  function makeDeepLink(param){
    var safeParam = String(param || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
    var bot = String(window.SIX_SEVEN_BOT_USERNAME || DEFAULT_BOT_USERNAME).replace(/^@/, '');
    return 'https://t.me/' + bot + '?startapp=' + encodeURIComponent(safeParam);
  }
  function updateCachedLinkFromCode(code){
    if (!code || isUnsafeCode(code)) return '';
    cachedMaskedLink = makeDeepLink(makeParam(code));
    return cachedMaskedLink;
  }
  async function loadMaskedCode(){
    if (loading) return cachedMaskedLink;
    loading = true;
    try {
      if (!window.SixSevenAPI || !SixSevenAPI.ready) throw new Error('API is not ready');
      var data = await SixSevenAPI.request('/api/me', { method:'GET' });
      syncUser(data.user);
      var code = data && data.user && data.user.referrals && data.user.referrals.code;
      var link = updateCachedLinkFromCode(code);
      if (!link) throw new Error('Masked referral code is not available yet');
      return link;
    } finally {
      loading = false;
    }
  }
  async function getMaskedReferralLink(){
    if (cachedMaskedLink) return cachedMaskedLink;
    var local = state && state.referrals && state.referrals.code;
    var localLink = updateCachedLinkFromCode(local);
    if (localLink) return localLink;
    return await loadMaskedCode();
  }
  function getCachedMaskedReferralLink(){
    if (cachedMaskedLink) return cachedMaskedLink;
    var code = state && state.referrals && state.referrals.code;
    return updateCachedLinkFromCode(code);
  }
  function openShare(text, url){
    var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url || '') + '&text=' + encodeURIComponent(text || '');
    if (tg()?.openTelegramLink) tg().openTelegramLink(shareUrl);
    else if (tg()?.openLink) tg().openLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }
  async function shareMaskedReferral(){
    try {
      var link = getCachedMaskedReferralLink() || await getMaskedReferralLink();
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
      loadMaskedCode().catch(function(){});
    }
  }

  try { window.SIX_SEVEN_BOT_USERNAME = window.SIX_SEVEN_BOT_USERNAME || DEFAULT_BOT_USERNAME; } catch(e) {}
  try { window.getMaskedReferralLink = getMaskedReferralLink; } catch(e) {}
  try { window.getCachedMaskedReferralLink = getCachedMaskedReferralLink; } catch(e) {}
  try { getReferralLink = window.getReferralLink = function(){ return getCachedMaskedReferralLink() || ('https://t.me/' + DEFAULT_BOT_USERNAME); }; } catch(e) {}
  try { shareReferral = window.shareReferral = shareMaskedReferral; } catch(e) { window.shareReferral = shareMaskedReferral; }

  function bind(){
    var btn = document.getElementById('ref-invite');
    if (btn && btn.dataset.maskedReferralBound !== '3') {
      btn.dataset.maskedReferralBound = '3';
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        shareMaskedReferral();
      }, true);
    }
    try {
      if (window.SixSevenAPI && SixSevenAPI.ready && !getCachedMaskedReferralLink()) {
        loadMaskedCode().catch(function(){});
      }
    } catch(e) {}
  }
  document.addEventListener('DOMContentLoaded', bind);
  window.addEventListener('six-seven:api-ready', function(e){ syncUser(e.detail); bind(); loadMaskedCode().catch(function(){}); });
  setTimeout(bind, 0);
  setInterval(bind, 1000);
})();
