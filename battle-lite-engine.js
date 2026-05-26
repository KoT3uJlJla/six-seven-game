/* P0 mobile battle engine for Telegram WebView.
   Goal: no DOM creation in the 6.7s hot path, no forced reflow, one cheap render loop. */
(function(){
  var tg = window.Telegram && window.Telegram.WebApp;
  var platform = String((tg && tg.platform) || '').toLowerCase();
  var mobile = platform === 'ios' || platform === 'android' || platform === 'android_x' || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || matchMedia('(pointer: coarse)').matches;
  if (!mobile) return;

  document.documentElement.classList.add('battle-lite-engine', 'battle-p0-engine');

  var rafPending = false;
  var lastHaptic = 0;
  var timerInterval = null;
  var endTimer = null;
  var comboHideTimer = null;
  var handResetTimers = { 6: null, 7: null };
  var lastRenderedMy = -1;
  var lastRenderedEnemy = -1;
  var lastRenderedCombo = -1;
  var botTps = 0;
  var botStartTs = 0;
  var refs = null;

  var originalEndBattle = window.endBattle;
  var originalResetBattleEffects = window.resetBattleEffects;

  function byId(id){ return document.getElementById(id); }
  function sideNow(){ try { return Number(state && state.side) === 7 ? 7 : 6; } catch(e) { return 6; } }
  function enemySideNow(){ return sideNow() === 6 ? 7 : 6; }
  function stageVisible(){ var s = document.querySelector('[data-screen="battle"]'); return !!s && !s.hidden; }

  function cacheRefs(){
    refs = {
      stage: byId('battle-stage'),
      tap: byId('tap-zone'),
      floaters: byId('battle-floaters'),
      leftHand: byId('battle-hand-left'),
      rightHand: byId('battle-hand-right'),
      meScore: byId('me-score'),
      enemyScore: byId('enemy-score'),
      combo: byId('battle-combo'),
      meme: byId('battle-meme'),
      timerNum: byId('timer-num'),
      timerFg: byId('timer-fg'),
      vsSix: byId('vs-bar-six'),
      vsSeven: byId('vs-bar-seven'),
      tapHint: document.querySelector('.tap-zone__hint')
    };
    return refs;
  }

  function clearFx(){
    var r = refs || cacheRefs();
    if (r.floaters) r.floaters.replaceChildren();
    if (r.combo) {
      r.combo.hidden = true;
      r.combo.textContent = '';
      r.combo.classList.remove('is-pop', 'is-hot', 'is-mega');
    }
  }

  function baseHandTransform(side){
    return side === 6
      ? 'translate3d(0,0,0) rotate(-4deg) scaleX(-1)'
      : 'translate3d(0,0,0) rotate(4deg) scaleX(1)';
  }

  function upHandTransform(side){
    return side === 6
      ? 'translate3d(0,-36px,0) rotate(-4deg) scaleX(-1)'
      : 'translate3d(0,-36px,0) rotate(4deg) scaleX(1)';
  }

  function hand(side){
    var r = refs || cacheRefs();
    return side === 6 ? r.leftHand : r.rightHand;
  }

  function resetHand(side){
    var el = hand(side);
    if (!el) return;
    el.style.setProperty('transform', baseHandTransform(side), 'important');
  }

  function resetHands(){
    clearTimeout(handResetTimers[6]);
    clearTimeout(handResetTimers[7]);
    resetHand(6);
    resetHand(7);
  }

  function liteHaptic(){
    var t = performance.now();
    if (t - lastHaptic < 120) return;
    lastHaptic = t;
    try { haptic.light(); } catch(e) {}
  }

  function liteHand(side){
    var el = hand(side);
    if (!el) return;

    clearTimeout(handResetTimers[side]);
    // No offsetWidth/reflow. First set the base transform, then push up next frame.
    el.style.setProperty('transform', baseHandTransform(side), 'important');
    requestAnimationFrame(function(){
      el.style.setProperty('transform', upHandTransform(side), 'important');
    });
    handResetTimers[side] = setTimeout(function(){ resetHand(side); }, 62);
  }

  function updateComboModel(){
    try {
      var now = Date.now();
      BATTLE.combo = now - BATTLE.lastTapTs <= 650 ? BATTLE.combo + 1 : 1;
      BATTLE.lastTapTs = now;
    } catch(e) {}
  }

  function renderCombo(){
    var r = refs || cacheRefs();
    if (!r.combo) return;
    var combo = 0;
    try { combo = Number(BATTLE.combo || 0); } catch(e) { combo = 0; }
    if (combo < 3) {
      if (!r.combo.hidden) r.combo.hidden = true;
      lastRenderedCombo = combo;
      return;
    }
    if (combo !== lastRenderedCombo) {
      r.combo.textContent = 'COMBO x' + combo;
      r.combo.hidden = false;
      lastRenderedCombo = combo;
    }
    clearTimeout(comboHideTimer);
    comboHideTimer = setTimeout(function(){ if (r.combo) r.combo.hidden = true; }, 720);
  }

  function updateBotScore(nowMs){
    try {
      if (!BATTLE.running || !BATTLE.acceptingTaps) return;
      var elapsed = Math.max(0, (nowMs - botStartTs) / 1000);
      var target = Math.floor(elapsed * botTps);
      if (target > BATTLE.enemyScore) {
        BATTLE.enemyScore = target;
        if (target % 3 === 0) liteHand(enemySideNow());
      }
    } catch(e) {}
  }

  function renderFrame(){
    rafPending = false;
    var r = refs || cacheRefs();
    try {
      if (!BATTLE.running && !stageVisible()) return;
      var nowMs = performance.now();
      updateBotScore(nowMs);

      if (r.meScore && BATTLE.myScore !== lastRenderedMy) {
        r.meScore.textContent = String(BATTLE.myScore);
        lastRenderedMy = BATTLE.myScore;
      }
      if (r.enemyScore && BATTLE.enemyScore !== lastRenderedEnemy) {
        r.enemyScore.textContent = String(BATTLE.enemyScore);
        lastRenderedEnemy = BATTLE.enemyScore;
      }

      var total = Math.max(1, BATTLE.myScore + BATTLE.enemyScore);
      var pSix = sideNow() === 6 ? BATTLE.myScore / total * 100 : BATTLE.enemyScore / total * 100;
      var pSeven = 100 - pSix;
      if (r.vsSix) r.vsSix.style.width = pSix.toFixed(1) + '%';
      if (r.vsSeven) r.vsSeven.style.width = pSeven.toFixed(1) + '%';
      renderCombo();
    } catch(e) {}
  }

  function requestRender(){
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(renderFrame);
  }

  // Hard-disable heavy battle effects. These functions are hot in app.js and must stay cheap.
  window.spawnFloaterForSide = function(){};
  window.burstParticles = function(){};
  window.triggerBattleFlash = function(){};
  window.pulseSpeedlines = function(){};
  window.spawnStickerBurst = function(){};
  window.phraseStorm = function(){};
  window.confettiWave = function(){};
  window.spawnConfettiPiece = function(){};
  window.startBattleChaos = function(){ clearFx(); };
  window.animateHandForSide = liteHand;
  window.registerCombo = updateComboModel;
  window.showCombo = function(){};
  window.setBattleMeme = function(text){
    var r = refs || cacheRefs();
    if (!r.meme) return;
    r.meme.textContent = text;
    r.meme.classList.remove('is-pop');
  };

  function stopLiteTimers(){
    clearInterval(timerInterval);
    clearTimeout(endTimer);
    clearTimeout(comboHideTimer);
    clearTimeout(handResetTimers[6]);
    clearTimeout(handResetTimers[7]);
    timerInterval = null;
    endTimer = null;
    document.body.classList.remove('is-battle-running');
  }

  window.endBattle = function(){
    stopLiteTimers();
    clearFx();
    resetHands();
    if (typeof originalEndBattle === 'function') return originalEndBattle.apply(this, arguments);
  };

  window.resetBattleEffects = function(){
    stopLiteTimers();
    clearFx();
    resetHands();
    if (typeof originalResetBattleEffects === 'function') return originalResetBattleEffects.apply(this, arguments);
  };

  window.scheduleBotTap = function(){};

  window.startBattleTimer = function(){
    stopLiteTimers();
    cacheRefs();
    clearFx();
    resetHands();

    try {
      BATTLE.startTs = Date.now();
      BATTLE.acceptingTaps = true;
      BATTLE.combo = 0;
      BATTLE.lastTapTs = 0;
      lastRenderedMy = -1;
      lastRenderedEnemy = -1;
      lastRenderedCombo = -1;
      botTps = 5.8 + Math.random() * 4.2;
      botStartTs = performance.now();

      document.body.classList.add('is-battle-running');

      var r = refs || cacheRefs();
      var CIRC = 2 * Math.PI * 44;
      if (r.timerFg) {
        r.timerFg.setAttribute('stroke-dasharray', CIRC.toFixed(2));
        r.timerFg.style.strokeDashoffset = '0';
      }
      if (r.tapHint) r.tapHint.textContent = (window.t ? t('battle.tapLive') : 'TAP TAP TAP');
      if (r.stage) r.stage.classList.add('is-playing');

      timerInterval = setInterval(function(){
        try {
          if (!BATTLE.running) { stopLiteTimers(); return; }
          var elapsed = Date.now() - BATTLE.startTs;
          var remain = Math.max(0, BATTLE.duration - elapsed);
          if (r.timerNum) r.timerNum.textContent = (remain / 1000).toFixed(1);
          if (r.timerFg) {
            var frac = remain / BATTLE.duration;
            r.timerFg.style.strokeDashoffset = (CIRC * (1 - frac)).toFixed(2);
          }
          requestRender();
          if (remain <= 0 && typeof window.endBattle === 'function') window.endBattle();
        } catch(e) {}
      }, 120);

      BATTLE.tickInterval = timerInterval;
      endTimer = setTimeout(function(){ if (typeof window.endBattle === 'function') window.endBattle(); }, BATTLE.duration + 40);
      BATTLE.endTimeout = endTimer;
      requestRender();
    } catch(e) {}
  };

  function liteTap(e){
    if (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    try {
      if (!BATTLE.running || !BATTLE.acceptingTaps) return;
      liteHaptic();
      BATTLE.myScore += 1;
      updateComboModel();
      liteHand(sideNow());
      requestRender();
    } catch(err) {}
  }

  function bindLiteHandlers(){
    var r = cacheRefs();
    try {
      if (typeof window.onTap === 'function') {
        if (r.tap) r.tap.removeEventListener('pointerdown', window.onTap);
        if (r.stage) r.stage.removeEventListener('pointerdown', window.onTap);
      }
    } catch(e) {}
    if (r.tap && !r.tap.dataset.p0LiteBound) {
      r.tap.dataset.p0LiteBound = '1';
      r.tap.addEventListener('pointerdown', liteTap, true);
    }
    if (r.stage && !r.stage.dataset.p0LiteBound) {
      r.stage.dataset.p0LiteBound = '1';
      r.stage.addEventListener('pointerdown', liteTap, true);
    }
  }

  bindLiteHandlers();
  document.addEventListener('DOMContentLoaded', bindLiteHandlers);
  setInterval(function(){
    bindLiteHandlers();
    if (!stageVisible()) {
      stopLiteTimers();
      clearFx();
    }
  }, 900);
})();
