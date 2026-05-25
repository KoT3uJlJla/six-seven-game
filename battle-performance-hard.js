/* Hard mobile battle performance patch. Loaded after app.js. */
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  var platform = String((tg && tg.platform) || '').toLowerCase();
  var mobile = platform === 'ios' || platform === 'android' || platform === 'android_x' || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || matchMedia('(pointer: coarse)').matches;
  if (!mobile) return;

  document.documentElement.classList.add('battle-hard-perf');

  var floaterLast = 0;
  var memeLast = 0;
  var originalSetBattleMeme = window.setBattleMeme;
  var originalResetBattleEffects = window.resetBattleEffects;
  var originalEndBattle = window.endBattle;

  function layer(){ return document.getElementById('battle-floaters'); }
  function cleanup(){ var l = layer(); if (l) l.replaceChildren(); }
  function inBattle(){ var s = document.querySelector('[data-screen="battle"]'); return !!s && !s.hidden; }

  window.burstParticles = function(){};
  window.triggerBattleFlash = function(){};
  window.pulseSpeedlines = function(){};
  window.spawnStickerBurst = function(){};
  window.phraseStorm = function(){};
  window.confettiWave = function(){};
  window.spawnConfettiPiece = function(){};
  window.startBattleChaos = function(){ cleanup(); };

  window.spawnFloaterForSide = function(side){
    if (!inBattle()) return;
    var now = performance.now();
    if (now - floaterLast < 170) return;
    floaterLast = now;
    var l = layer();
    if (!l) return;
    l.replaceChildren();
    var f = document.createElement('div');
    f.className = 'floater floater--lite';
    f.dataset.side = side;
    f.textContent = side === 6 ? 'SIX!' : 'SEVEN!';
    f.style.left = (side === 6 ? 27 : 65) + '%';
    f.style.top = '40%';
    f.style.setProperty('--r', side === 6 ? '-3deg' : '3deg');
    l.appendChild(f);
    setTimeout(function(){ if (f && f.parentNode) f.remove(); }, 430);
  };

  window.setBattleMeme = function(text){
    var now = performance.now();
    var important = /SIX|SEVEN|GO|ГОТОВ|ПРИГОТОВ|ФИНАЛ|FINAL|READY/i.test(String(text || ''));
    if (!important && now - memeLast < 420) return;
    memeLast = now;
    if (typeof originalSetBattleMeme === 'function') return originalSetBattleMeme(text);
    var el = document.getElementById('battle-meme');
    if (el) el.textContent = text;
  };

  window.resetBattleEffects = function(){
    cleanup();
    if (typeof originalResetBattleEffects === 'function') return originalResetBattleEffects.apply(this, arguments);
  };

  window.endBattle = function(){
    cleanup();
    if (typeof originalEndBattle === 'function') return originalEndBattle.apply(this, arguments);
  };

  setInterval(function(){
    if (!inBattle()) return;
    var l = layer();
    if (!l) return;
    var nodes = l.children;
    while (nodes.length > 2) nodes[0].remove();
  }, 300);
})();
