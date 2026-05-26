/* Final share guard: all referral/guild/story links must use t.me bot startapp format. */
(function(){
  var BOT_USERNAME = 'sixseven_game_bot';
  var STORY_MEDIA_URL = 'https://sixseven-a2f.pages.dev/assets/share-67-story-lite.jpg?v=3';
  var MASKED_CODE_RE = /^r[A-Za-z0-9]{8,20}$/;

  function tg(){ return window.Telegram && window.Telegram.WebApp; }
  function byId(id){ return document.getElementById(id); }
  function callHaptic(kind){ try { haptic && haptic[kind] && haptic[kind](); } catch(e) {} }
  function toastSafe(text){ try { toast(text); } catch(e) {} }
  function getSide(){ try { return Number(state.side) === 7 ? 7 : 6; } catch(e) { return 6; } }
  function cleanParam(param){ return String(param || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128); }
  function toBotLink(param){ return 'https://t.me/' + BOT_USERNAME + '?startapp=' + encodeURIComponent(cleanParam(param)); }

  function extractStartParam(url){
    try {
      var raw = String(url || '');
      if (!raw) return '';
      if (/^https:\/\/t\.me\//i.test(raw)) {
        var u1 = new URL(raw);
        return u1.searchParams.get('startapp') || u1.searchParams.get('start') || '';
      }
      var noHash = raw.split('#')[0];
      var u = new URL(noHash, 'https://sixseven-a2f.pages.dev/');
      return u.searchParams.get('tgWebAppStartParam') || u.searchParams.get('startapp') || '';
    } catch(e) { return ''; }
  }
  function normalizeShareUrl(url){
    var param = extractStartParam(url);
    if (param) return toBotLink(param);
    var localParam = makeReferralParamSafe();
    return localParam ? toBotLink(localParam) : ('https://t.me/' + BOT_USERNAME);
  }
  function maskedCode(){
    try {
      var code = state && state.referrals && state.referrals.code;
      if (MASKED_CODE_RE.test(String(code || ''))) return String(code);
    } catch(e) {}
    return '';
  }
  function makeReferralParamSafe(){
    var code = maskedCode();
    if (!code) return '';
    return 'r_' + code + '_' + getSide();
  }
  function makeGuildParamSafe(){
    try {
      var id = state && state.guild && state.guild.id;
      if (!id) return '';
      var cleanId = String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
      return cleanId ? ('g_' + cleanId + '_' + getSide()) : '';
    } catch(e) { return ''; }
  }
  function openTelegramShareSafe(payload){
    var text = payload && payload.text || '';
    var url = normalizeShareUrl(payload && payload.url || '');
    var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
    var app = tg();
    if (app && app.openTelegramLink) app.openTelegramLink(shareUrl);
    else if (app && app.openLink) app.openLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }
  function ensureMaskedCodeWarm(){
    try {
      if (typeof window.getMaskedReferralLink === 'function') window.getMaskedReferralLink().catch(function(){});
    } catch(e) {}
  }

  try { window.SIX_SEVEN_BOT_USERNAME = BOT_USERNAME; } catch(e) {}
  try { openTelegramShare = window.openTelegramShare = openTelegramShareSafe; } catch(e) { window.openTelegramShare = openTelegramShareSafe; }
  try { getReferralLink = window.getReferralLink = function(){ return toBotLink(makeReferralParamSafe()); }; } catch(e) { window.getReferralLink = function(){ return toBotLink(makeReferralParamSafe()); }; }
  try { getGuildInviteLink = window.getGuildInviteLink = function(){ return toBotLink(makeGuildParamSafe() || makeReferralParamSafe()); }; } catch(e) { window.getGuildInviteLink = function(){ return toBotLink(makeGuildParamSafe() || makeReferralParamSafe()); }; }

  function shareGuildInviteSafe(){
    try {
      if (!state || !state.guild || !state.guild.id) {
        if (typeof createGuildFromName === 'function') return createGuildFromName();
        return;
      }
      state.guild.invites = Number(state.guild.invites || 0) + 1;
      try { saveState(); renderGuildCard(); } catch(e) {}
      var text = 'Join my guild. First wave gets aura, late wave gets cooked.';
      try { text = t('guild.inviteText', { name: state.guild.name || 'GANG' }); } catch(e) {}
      openTelegramShareSafe({ text:text, url:toBotLink(makeGuildParamSafe()) });
      callHaptic('success');
    } catch(e) {
      callHaptic('error');
      toastSafe('Could not create guild invite link');
    }
  }
  try { shareGuildInvite = window.shareGuildInvite = shareGuildInviteSafe; } catch(e) { window.shareGuildInvite = shareGuildInviteSafe; }

  function isExact67(){
    try { if (window.LAST_RESULT && Number(LAST_RESULT.myScore) === 67) return true; } catch(e) {}
    var score = Number(byId('result-my-score')?.textContent || 0);
    var result = document.querySelector('.result');
    return score === 67 || Boolean(result && result.dataset.outcome === 'jackpot');
  }
  function storyCaption(){ return 'СИИИИКС СЕЕЕВЕЕЕН — ровно 67 тапов. Забери +67 ауры.'; }
  function storyLink(){
    var cached = '';
    try { if (typeof window.getCachedMaskedReferralLink === 'function') cached = window.getCachedMaskedReferralLink(); } catch(e) {}
    return normalizeShareUrl(cached || toBotLink(makeReferralParamSafe()));
  }
  function shareStorySafe(){
    ensureMaskedCodeWarm();
    var link = storyLink();
    if (!extractStartParam(link)) {
      callHaptic('error');
      toastSafe('Referral link is syncing. Try again in a second.');
      return false;
    }
    callHaptic('success');
    var app = tg();
    if (!app || typeof app.shareToStory !== 'function') {
      toastSafe('Telegram Stories are unavailable in this client');
      openTelegramShareSafe({ text: storyCaption(), url: link });
      return false;
    }
    try {
      app.shareToStory(STORY_MEDIA_URL, {
        widget_link: { url: link, name: 'Играть и забрать +67' }
      });
      return true;
    } catch(e) {
      toastSafe('Telegram rejected story media. Opening regular share.');
      openTelegramShareSafe({ text: storyCaption(), url: link });
      return false;
    }
  }
  try { window.shareExact67Story = shareStorySafe; } catch(e) {}

  function bind(){
    ensureMaskedCodeWarm();
    var guildBtn = byId('guild-invite');
    if (guildBtn && guildBtn.dataset.finalShareFixBound !== '3') {
      guildBtn.dataset.finalShareFixBound = '3';
      guildBtn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        shareGuildInviteSafe();
      }, true);
    }
    var storyBtn = byId('result-shame');
    if (storyBtn && storyBtn.dataset.finalStoryShareBound !== '3') {
      storyBtn.dataset.finalStoryShareBound = '3';
      storyBtn.addEventListener('click', function(e){
        if (!isExact67()) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        shareStorySafe();
      }, true);
    }
  }

  document.addEventListener('DOMContentLoaded', bind);
  window.addEventListener('six-seven:api-ready', function(){ ensureMaskedCodeWarm(); bind(); });
  setTimeout(bind, 0);
  setInterval(bind, 700);
})();
