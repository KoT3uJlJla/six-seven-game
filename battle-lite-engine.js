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
  var timerInterval = null;
  var endTimer = null;
  var lastFloater = 0;

  function byId(id){ return document.getElementById(id); }
  function sideNow(){ try { return Number(state && state.side) === 7 ? 7 : 6; } catch(e) { return 6; } }
  function enemySideNow(){ return sideNow() === 6 ? 7 : 6; }
  function hand(side){ return side === 6 ? byId('battle-hand-left') : byId('battle-hand-right'); }
  function scoreText(id, value){ var el = byId(id); if (el) el.textContent = String(value); }
  function stageVisible(){ var s = document.querySelector('[data-screen="battle"]'); return !!s && !s.hidden; }
  function clearFx(){ var l = byId('battle-floaters'); if (l) l.replaceChildren(); }

  function liteHaptic(){
    var t = performance.now();
    if (t - lastHaptic < 120) return;
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
    var next = setTimeout(function(){ el.classList.remove(cls); }, 76);
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
    var now = performance.now();
    if (now - lastFloater < 520) return;
    lastFloater = now;
    var l = byId('battle-floaters');
    if (!l) return;
    l.replaceChildren();
    var f = document.createElement('div');
    f.className = 'floater floater--lite';
    f.dataset.side = side;
    f.textContent = side === 6 ? 'SIX!' : 'SEVEN!';
    f.style.left = side === 6 ? '29%' : '65%';
    f.style.top = '40%';
    f.style.setProperty('--r', side === 6 ? '-3deg' : '3deg');
    l.appendChild(f);
    setTimeout(function(){ if (f.parentNode) f.remove(); }, 280);
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
      if (BATTLE.myScore % 8 === 0) liteFloater(s);
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
          if (BATTLE.enemyScore % 3 === 0) liteHand(enemySideNow());
          updateBars();
        }
        liteBot();
      }, 190 + Math.random() * 120);
      BATTLE.enemyBot = botTimer;
    } catch(e) {}
  }
  window.scheduleBotTap = liteBot;

  window.startBattleTimer = function(){
    clearInterval(timerInterval);
    clearTimeout(endTimer);
    clearFx();
    try {
      BATTLE.startTs = Date.now();
      BATTLE.acceptingTaps = true;
      var tNum = byId('timer-num');
      var tFg = byId('timer-fg');
      var CIRC = 2 * Math.PI * 44;
      if (tFg) {
        tFg.setAttribute('stroke-dasharray', CIRC.toFixed(2));
        tFg.style.strokeDashoffset = '0';
      }
      var tapHint = document.querySelector('.tap-zone__hint');
      if (tapHint) tapHint.textContent = (window.t ? t('battle.tapLive') : 'TAP TAP TAP');
      var stage = byId('battle-stage');
      if (stage) stage.classList.add('is-playing');
      liteBot();
      timerInterval = setInterval(function(){
        if (!BATTLE.running) { clearInterval(timerInterval); return; }
        var elapsed = Date.now() - BATTLE.startTs;
        var remain = Math.max(0, BATTLE.duration - elapsed);
        if (tNum) tNum.textContent = (remain / 1000).toFixed(1);
        if (tFg) {
          var frac = remain / BATTLE.duration;
          tFg.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(2);
        }
        if (remain <= 0 && typeof endBattle === 'function') endBattle();
      }, 120);
      BATTLE.tickInterval = timerInterval;
      endTimer = setTimeout(function(){ if (typeof endBattle === 'function') endBattle(); }, BATTLE.duration + 40);
      BATTLE.endTimeout = endTimer;
    } catch(e) {}
  };

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
    if (!stageVisible()) {
      clearFx();
      clearInterval(timerInterval);
      clearTimeout(endTimer);
    }
  }, 900);
})();
