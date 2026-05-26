/* Exact 67 Telegram Story share with referral link. */
(function(){
  var STORY_MEDIA_PATH = '/assets/share-67-story.svg';
  var PROD_ORIGIN = 'https://sixseven-a2f.pages.dev';

  function tg(){ return window.Telegram && window.Telegram.WebApp; }
  function byId(id){ return document.getElementById(id); }
  function mediaUrl(){
    var origin = location.protocol === 'https:' ? location.origin : PROD_ORIGIN;
    return origin.replace(/\/$/, '') + STORY_MEDIA_PATH;
  }
  function exact67(){
    try { if (window.LAST_RESULT && Number(LAST_RESULT.myScore) === 67) return true; } catch(e) {}
    var score = Number(byId('result-my-score')?.textContent || 0);
    var result = document.querySelector('.result');
    return score === 67 || (result && result.dataset.outcome === 'jackpot');
  }
  function safeT(key, vars){
    try { return t(key, vars); } catch(e) { return ''; }
  }
  function referralLink(){
    try {
      if (typeof getReferralLink === 'function') return getReferralLink();
    } catch(e) {}
    try {
      var code = state && state.referrals && state.referrals.code;
      var side = Number(state && state.side) === 7 ? 7 : 6;
      if (code) {
        var param = 'r_' + String(code).replace(/[^A-Za-z0-9]/g, '').slice(0,24) + '_' + side;
        var bot = String(window.SIX_SEVEN_BOT_USERNAME || '').replace(/^@/, '');
        var app = String(window.SIX_SEVEN_APP_NAME || '').replace(/^\//, '');
        if (bot) return 'https://t.me/' + bot + (app ? '/' + encodeURIComponent(app) : '') + '?startapp=' + encodeURIComponent(param);
        var u = new URL(location.href);
        u.searchParams.set('tgWebAppStartParam', param);
        return u.toString();
      }
    } catch(e) {}
    return location.href;
  }
  function storyCaption(){
    var side = 6;
    try { side = Number(state.side) === 7 ? 7 : 6; } catch(e) {}
    return 'СИИИИКС СЕЕЕВЕЕЕН — ровно 67 тапов за банду ' + side + '. Забери +67 ауры.';
  }
  function shareFallback(){
    var link = referralLink();
    try {
      if (typeof openTelegramShare === 'function') {
        openTelegramShare({ text: storyCaption(), url: link });
        return;
      }
    } catch(e) {}
    try { tg()?.openTelegramLink('https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(storyCaption())); }
    catch(e) { location.href = link; }
  }
  function shareExact67Story(){
    var app = tg();
    var link = referralLink();
    try { haptic && haptic.success && haptic.success(); } catch(e) {}
    try {
      if (app && typeof app.shareToStory === 'function' && (!app.isVersionAtLeast || app.isVersionAtLeast('7.8'))) {
        app.shareToStory(mediaUrl(), {
          text: storyCaption(),
          widget_link: {
            url: link,
            name: 'Играть и забрать +67'
          }
        });
        return true;
      }
    } catch(e) {}
    shareFallback();
    return false;
  }
  function bind(){
    var btn = byId('result-shame');
    if (!btn || btn.dataset.story67Bound === '1') return;
    btn.dataset.story67Bound = '1';
    btn.addEventListener('click', function(e){
      if (!exact67()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      shareExact67Story();
    }, true);
  }
  document.addEventListener('DOMContentLoaded', bind);
  setInterval(bind, 1000);
  window.shareExact67Story = shareExact67Story;
})();
