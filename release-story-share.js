/* Exact 67 Telegram Story share. Uses masked referral link only. */
(function(){
  var STORY_MEDIA_PATH = '/assets/share-67-story.svg';
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
  async function getMaskedLink(){
    if (typeof window.getMaskedReferralLink === 'function') return await window.getMaskedReferralLink();
    throw new Error('masked referral helper is not ready');
  }
  function openFallback(url){
    var text = caption();
    var shareUrl = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text);
    var app = getTg();
    if (app && app.openTelegramLink) app.openTelegramLink(shareUrl);
    else if (app && app.openLink) app.openLink(shareUrl);
    else window.open(shareUrl, '_blank', 'noopener,noreferrer');
  }
  async function shareExact67Story(){
    var link;
    try { link = await getMaskedLink(); }
    catch(e) {
      try { if (haptic && haptic.error) haptic.error(); } catch(_) {}
      try { toast('Referral link is syncing. Try again in a second.'); } catch(_) {}
      return false;
    }
    try { if (haptic && haptic.success) haptic.success(); } catch(e) {}
    var app = getTg();
    try {
      if (app && typeof app.shareToStory === 'function' && (!app.isVersionAtLeast || app.isVersionAtLeast('7.8'))) {
        app.shareToStory(getMediaUrl(), {
          text: caption(),
          widget_link: { url: link, name: 'Играть и забрать +67' }
        });
        return true;
      }
    } catch(e) {}
    openFallback(link);
    return false;
  }
  function bind(){
    var btn = byId('result-shame');
    if (!btn || btn.dataset.story67Bound === '2') return;
    btn.dataset.story67Bound = '2';
    btn.addEventListener('click', function(e){
      if (!isExact67()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      shareExact67Story();
    }, true);
  }
  document.addEventListener('DOMContentLoaded', bind);
  setInterval(bind, 1000);
  window.shareExact67Story = shareExact67Story;
})();
