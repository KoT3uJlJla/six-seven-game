/* Image rescue: if Cloudflare Direct Upload misses assets, load them from CDN fallback. */
(function(){
  var CDN = 'https://cdn.jsdelivr.net/gh/KoT3uJlJla/six-seven-game@main/';
  var RAW = 'https://raw.githubusercontent.com/KoT3uJlJla/six-seven-game/main/';

  function assetPath(src){
    var s = String(src || '');
    var m = s.match(/(?:^|\/)(assets\/[^?#]+)/);
    return m ? m[1] : '';
  }
  function cdnUrl(path){ return CDN + path.replace(/^\/+/, ''); }
  function rawUrl(path){ return RAW + path.replace(/^\/+/, ''); }
  function rescueImage(img){
    if (!img || img.dataset.imageRescueBound === '1') return;
    img.dataset.imageRescueBound = '1';
    img.addEventListener('error', function(){
      var path = assetPath(img.getAttribute('src') || img.src);
      if (!path) return;
      var current = String(img.src || '');
      if (current.indexOf('cdn.jsdelivr.net') !== -1) {
        img.src = rawUrl(path);
        return;
      }
      if (current.indexOf('raw.githubusercontent.com') !== -1) return;
      img.src = cdnUrl(path);
    }, true);

    var path = assetPath(img.getAttribute('src') || img.src);
    if (path && img.complete && img.naturalWidth === 0) img.src = cdnUrl(path);
  }
  function scan(){ document.querySelectorAll('img').forEach(rescueImage); }

  // Patch common helpers if they are available in the global script scope.
  try {
    var oldGetDigitUrl = getDigitUrl;
    getDigitUrl = window.getDigitUrl = function(styleId, side){
      var url = oldGetDigitUrl(styleId, side);
      return url && String(url).indexOf('assets/') === 0 ? cdnUrl(url) : url;
    };
  } catch(e) {}
  try {
    var oldGetHandImg = getHandImg;
    getHandImg = window.getHandImg = function(handId){
      var url = oldGetHandImg(handId);
      return url && String(url).indexOf('assets/') === 0 ? cdnUrl(url) : url;
    };
  } catch(e) {}

  document.addEventListener('DOMContentLoaded', scan);
  setTimeout(scan, 0);
  setInterval(scan, 1000);
  try {
    new MutationObserver(scan).observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['src'] });
  } catch(e) {}
})();
