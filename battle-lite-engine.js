/* Lite battle engine for mobile Telegram WebView. Loaded after app.js. */
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  var platform = String((tg && tg.platform) || '').toLowerCase();
  var mobile = platform === 'ios' || platform === 'android' || platform === 'android_x' || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || matchMedia('(pointer: coarse)').matches;
  if (!mobile) return;

  document.documentElement.classList.add('battle-lite-engine');

  var rafPending = false;
  var lastHaptic = 0;
  var botTimer = null;
  var leftTapTimer = null;
  var rightTapTimer = null;

  function byId(id){ return document.getElementById(id); }
  function sideNow(){ try { return Number(state && state.side) === 7 ? 7 : 6; } catch(e) { return 6; } }
  function enemySideNow(){ return sideNow() === 6 ? 7 : 6; }
  function hand(side){ return side === 6 ? byId('battle-hand-left') : byId('battle-hand-right'); }
  function scoreText(id, value){ var el = byId(id); if (el) el.textContent = String(value); }
  function stageVisible(){ var s = document.querySelector('[data-screen="battle"]'); return !!s && !s.hidden; }
  function clearFx(){ var l = byId('battle-floaters'); if (l) l.replaceChildren(); }

  function liteHaptic(){
    var t = performance.now();
    if (t - lastHaptic < 75) return;
    lastHaptic = t;
    try { haptic.light(); } catch(e) {}
  }

  function liteHand(side){
    var el = hand(side);
    if (!el) return;
    var cls = side === 6 ? 'is-lite-left-tap' : 'is-lite-right-tap';
    var timer = side === 6 ? leftTapTimer : rightTapTimer;
    clearTimeout(timer);
    el.classList.add(cls);
    var next = setTimeout(function(){ el.classList.remove(cls); }, 95);
    if (side === 6) leftTapTimer = next;
    else rightTapTimer = next;
  }

  function updateBars(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function(){
      rafPending = false;
      try {
        var total = Math.max(1, BATTLE.myScore + BATTLE.enemyScore);
        var pSix = sideNow() === 6 ? BATTLE.myScore / total * 100 : BATTLE.enemyScore / total * 100;
        var pSeven = 100 - pSix;
        var a = byId('vs-bar-six');
        var b = byId('vs-bar-seven');
        if (a) a.style.width = pSix.toFixed(1) + '%';
        if (b) b.style.width = pSeven.toFixed(1) + '%';
      } catch(e) {}
    });
  }

  function liteFloater(side){
    var l = byId('battle-floaters');
    if (!l) return;
    l.replaceChildren();
    var f = document.createElement('div');
    f.className = 'floater floater--lite';
    f.dataset.side = side;
    f.textContent = side === 6 ? 'SIX!' : 'SEVEN!';
    f.style.left = side === 6 ? '28%' : '66%';
    f.style.top = '40%';
    f.style.setProperty('--r', side === 6 ? '-3deg' : '3deg');
    l.appendChild(f);
    setTimeout(function(){ if (f.parentNode) f.remove(); }, 320);
  }

  window.spawnFloaterForSide = liteFloater;
  window.burstParticles = function(){};
  window.triggerBattleFlash = function(){};
  window.pulseSpeedlines = function(){};
  window.spawnStickerBurst = function(){};
  window.phraseStorm = function(){};
  window.confettiWave = function(){};
  window.spawnConfettiPiece = function(){};
  window.startBattleChaos = clearFx;
  window.registerCombo = function(){
    try {
      var now = Date.now();
      BATTLE.combo = now - BATTLE.lastTapTs <= 650 ? BATTLE.combo + 1 : 1;
      BATTLE.lastTapTs = now;
    } catch(e) {}
  };
  window.showCombo = function(){};
  window.animateHandForSide = liteHand;

  function liteTap(e){
    if (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    try {
      if (!BATTLE.running || !BATTLE.acceptingTaps) return;
      liteHaptic();
      BATTLE.myScore += 1;
      scoreText('me-score', BATTLE.myScore);
      var s = sideNow();
      liteHand(s);
      if (BATTLE.myScore % 4 === 0) liteFloater(s);
      updateBars();
    } catch(err) {}
  }

  function liteBot(){
    clearTimeout(botTimer);
    try {
      if (!BATTLE.running) return;
      botTimer = setTimeout(function(){
        if (!BATTLE.running) return;
        if (BATTLE.acceptingTaps) {
          BATTLE.enemyScore += 1;
          scoreText('enemy-score', BATTLE.enemyScore);
          liteHand(enemySideNow());
          updateBars();
        }
        liteBot();
      }, 135 + Math.random() * 95);
      BATTLE.enemyBot = botTimer;
    } catch(e) {}
  }
  window.scheduleBotTap = liteBot;

  function bindLiteHandlers(){
    var tap = byId('tap-zone');
    var st = byId('battle-stage');
    try { if (typeof onTap === 'function') { tap && tap.removeEventListener('pointerdown', onTap); st && st.removeEventListener('pointerdown', onTap); } } catch(e) {}
    if (tap && !tap.dataset.liteBound) { tap.dataset.liteBound = '1'; tap.addEventListener('pointerdown', liteTap, true); }
    if (st && !st.dataset.liteBound) { st.dataset.liteBound = '1'; st.addEventListener('pointerdown', liteTap, true); }
  }

  bindLiteHandlers();
  document.addEventListener('DOMContentLoaded', bindLiteHandlers);
  setInterval(function(){
    bindLiteHandlers();
    if (!stageVisible()) clearFx();
  }, 700);
})();
