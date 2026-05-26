/* Exact 67 Telegram Story share. Uses the real story poster asset and t.me referral link. */
(function(){
  var STORY_MEDIA_PATH = '/assets/share-67-story.png';
  var PROD_ORIGIN = 'https://sixseven-a2f.pages.dev';

  function getTg(){ return window.Telegram && window.Telegram.WebApp; }
  function byId(id){ return document.getElementById(id); }
  function getMediaUrl(){
    var origin = location.protocol === 'https:' ? location.origin : PROD_ORIGIN;
    return origin.replace(/\/$/, '') + STORY_MEDIA_PATH;
  }
  function isExact67(){
    try { if (window.LAST_RESULT && Number(LAST_RESULT.myScore) === 67) return true; } catch(e) {}
    var scoreEl = byId('result-my-score');
    var score = Number(scoreEl ? scoreEl.textContent : 0);
    var result = document.querySelector('.result');
    return score === 67 || Boolean(result && result.dataset.outcome === 'jackpot');
  }
  function caption(){
    var side = 6;
    try { side = Number(state.side) === 7 ? 7 : 6; } catch(e) {}
    return 'СИИИИКС СЕЕЕВЕЕЕН — ровно 67 тапов за банду ' + side + '. Забери +67 ауры.';
  }
  function getCachedLink(){
    try {
      if (typeof window.getCachedMaskedReferralLink === 'function') return window.getCachedMaskedReferralLink();
    } catch(e) {}
    try {
      if (typeof window.getMaskedReferralLink === 'function') window.getMaskedReferralLink().catch(function(){});
    } catch(e) {}
    return '';
  }
  function openFallback(url){
    var text = caption();
    var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
    var app = getTg();
    if (app && app.openTelegramLink) app.openTelegramLink(shareUrl);
    else if (app && app.openLink) app.openLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }
  function shareExact67Story(){
    var link = getCachedLink();
    if (!link) {
      try { if (haptic && haptic.error) haptic.error(); } catch(e) {}
      try { toast('Referral link is syncing. Try again in a second.'); } catch(e) {}
      return false;
    }
    try { if (haptic && haptic.success) haptic.success(); } catch(e) {}
    var app = getTg();
    try {
      if (app && typeof app.shareToStory === 'function') {
        app.shareToStory(getMediaUrl(), {
          text: caption(),
          widget_link: { url: link, name: 'Играть и забрать +67' }
        });
        return true;
      }
    } catch(e) {
      try { toast('Story share failed. Opening regular share.'); } catch(_) {}
    }
    openFallback(link);
    return false;
  }
  function bind(){
    var btn = byId('result-shame');
    if (!btn || btn.dataset.story67Bound === '4') return;
    btn.dataset.story67Bound = '4';
    btn.addEventListener('click', function(e){
      if (!isExact67()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      shareExact67Story();
    }, true);
  }
  document.addEventListener('DOMContentLoaded', bind);
  setTimeout(bind, 0);
  setInterval(bind, 700);
  window.shareExact67Story = shareExact67Story;
})();
