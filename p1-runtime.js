/* P1 consolidated runtime: matchmaking + live battle sync + real leaderboard + mobile battle engine. */
(function(){
  var LIVE_SEARCH_MS = 10000;
  var matchingTimer = null;
  var matchingPollTimer = null;
  var pendingBattleTimer = null;
  var matchmakingRunId = 0;
  var topRenderKey = '';
  var lastTopFetchAt = 0;

  function byId(id){ return document.getElementById(id); }
  function lang(){
    try { return state && state.lang === 'ru' ? 'ru' : 'en'; }
    catch(e) { return document.documentElement.lang === 'ru' ? 'ru' : 'en'; }
  }
  function txt(ru,en){ return lang() === 'ru' ? ru : en; }
  function getSide(){ try { return Number(state.side) === 7 ? 7 : 6; } catch(e) { return 6; } }
  function callHaptic(kind){ try { haptic && haptic[kind] && haptic[kind](); } catch(e) {} }

  function isLiveMatch(match){ return !!(match && match.kind === 'live' && match.id); }
  function currentMatch(){ return isLiveMatch(window.SIX_SEVEN_CURRENT_MATCH) ? window.SIX_SEVEN_CURRENT_MATCH : null; }

  // ---------- Result CTA ----------
  function setResultRaidToNewBattle(){
    var btn = byId('result-raid');
    if (!btn) return;
    btn.textContent = txt('НОВЫЙ БАТТЛ', 'NEW BATTLE');
    btn.setAttribute('data-action','new-battle');
    if (btn.dataset.p1NewBattleBound === '1') return;
    btn.dataset.p1NewBattleBound = '1';
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      callHaptic('medium');
      try { startMatchmaking(); } catch(_) {}
    }, true);
  }

  // ---------- Matchmaking ----------
  function setMatchingStatus(text){ var el = byId('matching-status'); if (el) el.textContent = text; }
  function setMatchingDigit(){
    try {
      var sideEl = byId('matching-side');
      if (sideEl && typeof getDigitUrl === 'function') {
        sideEl.src = getDigitUrl(state.digitStyle, state.side);
        sideEl.dataset.side = state.side;
      }
    } catch(e) {}
  }
  function clearMatchingTimers(){
    clearTimeout(matchingTimer);
    clearInterval(matchingPollTimer);
    clearTimeout(pendingBattleTimer);
    matchingTimer = null;
    matchingPollTimer = null;
    pendingBattleTimer = null;
    try { if (typeof mmTimer !== 'undefined') clearInterval(mmTimer); } catch(e) {}
  }
  function cancelLiveQueue(){
    try {
      if (window.SixSevenAPI && SixSevenAPI.ready) {
        SixSevenAPI.request('/api/matchmaking/cancel', { method:'POST' }).catch(function(){});
      }
    } catch(e) {}
  }
  function safeBeginBattle(runId, delay){
    clearTimeout(pendingBattleTimer);
    pendingBattleTimer = setTimeout(function(){
      if (runId !== matchmakingRunId) return;
      try { beginBattle(); } catch(e) {}
    }, delay);
  }
  async function tryLiveQueue(){
    if (!window.SixSevenAPI || !SixSevenAPI.ready) return null;
    try {
      var joined = await SixSevenAPI.request('/api/matchmaking/join', { method:'POST', body: JSON.stringify({ side: getSide() }) });
      if (joined && joined.match) return joined.match;
    } catch(e) {}
    return null;
  }
  async function pollLiveQueue(){
    if (!window.SixSevenAPI || !SixSevenAPI.ready) return null;
    try {
      var data = await SixSevenAPI.request('/api/matchmaking/poll?side=' + encodeURIComponent(getSide()), { method:'GET' });
      if (data && data.match) return data.match;
    } catch(e) {}
    return null;
  }

  function p1CancelMatchmaking(){
    matchmakingRunId += 1;
    clearMatchingTimers();
    cancelLiveQueue();
    window.SIX_SEVEN_CURRENT_MATCH = null;
    callHaptic('warning');
    try { show('home'); } catch(e) {}
  }

  function p1StartMatchmaking(){
    clearMatchingTimers();
    window.SIX_SEVEN_CURRENT_MATCH = null;
    var runId = ++matchmakingRunId;
    try { show('matching'); } catch(e) {}
    setMatchingDigit();

    var startedAt = Date.now();
    var liveFound = false;
    function renderCountdown(){
      if (runId !== matchmakingRunId) return;
      var left = Math.max(0, Math.ceil((LIVE_SEARCH_MS - (Date.now() - startedAt)) / 1000));
      setMatchingStatus(txt('Ищем живого игрока… ' + left + 'с', 'Searching live player… ' + left + 's'));
    }
    function lockLive(match){
      if (!isLiveMatch(match) || liveFound || runId !== matchmakingRunId) return false;
      liveFound = true;
      clearTimeout(matchingTimer);
      clearInterval(matchingPollTimer);
      setMatchingStatus(txt('Живой соперник найден', 'Live opponent found'));
      window.SIX_SEVEN_CURRENT_MATCH = match;
      safeBeginBattle(runId, 450);
      return true;
    }

    renderCountdown();
    tryLiveQueue().then(lockLive);
    matchingPollTimer = setInterval(function(){
      if (runId !== matchmakingRunId) return;
      renderCountdown();
      pollLiveQueue().then(lockLive);
    }, 650);
    matchingTimer = setTimeout(async function(){
      if (liveFound || runId !== matchmakingRunId) return;
      var finalMatch = await pollLiveQueue();
      if (lockLive(finalMatch)) return;
      clearInterval(matchingPollTimer);
      cancelLiveQueue();
      window.SIX_SEVEN_CURRENT_MATCH = null;
      setMatchingStatus(txt('Живых нет — ставим бота', 'No live player — bot found'));
      safeBeginBattle(runId, 550);
    }, LIVE_SEARCH_MS);
  }

  try { window.cancelMatchmaking = cancelMatchmaking = p1CancelMatchmaking; } catch(e) { window.cancelMatchmaking = p1CancelMatchmaking; }
  try { window.startMatchmaking = startMatchmaking = p1StartMatchmaking; } catch(e) { window.startMatchmaking = p1StartMatchmaking; }

  function bindCancelButton(){
    var btn = byId('matching-cancel');
    if (!btn || btn.dataset.p1CancelBound === '1') return;
    btn.dataset.p1CancelBound = '1';
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      p1CancelMatchmaking();
    }, true);
  }

  // ---------- Real leaderboard. Do not call old app.js openTop because it renders fake users first. ----------
  function loadingTop(){ emptyTop(txt('Загрузка данных…', 'Loading data…')); }
  function emptyTop(message){
    var list = byId('top-list');
    if (!list) return;
    list.innerHTML = '';
    var div = document.createElement('div');
    div.className = 'top-row top-row--outside';
    div.style.justifyContent = 'center';
    div.style.textAlign = 'center';
    div.textContent = message;
    list.appendChild(div);
  }
  function makeFallbackRow(item){
    var row = document.createElement('div');
    row.className = 'top-row' + (item.me ? ' is-me' : '');
    var rank = document.createElement('div');
    rank.className = 'top-row__rank';
    rank.textContent = item.rank;
    var name = document.createElement('div');
    name.className = 'top-row__name';
    name.textContent = item.name + (item.me ? ' (' + txt('ТЫ','YOU') + ')' : '');
    var right = document.createElement('div');
    right.className = 'top-row__right';
    var side = document.createElement('span');
    side.className = 'top-row__side';
    side.dataset.side = item.side;
    side.textContent = item.side;
    var score = document.createElement('span');
    score.className = 'top-row__score';
    score.textContent = Number(item.score || 0).toLocaleString('ru-RU');
    right.append(side, score);
    row.append(rank, name, right);
    return row;
  }
  function renderRows(items, me){
    var list = byId('top-list');
    var myRankCard = byId('top-me-rank');
    if (!list) return;
    list.innerHTML = '';
    if (myRankCard) { myRankCard.hidden = true; myRankCard.innerHTML = ''; }
    if (!items.length) return emptyTop(txt('Реальный топ пуст. Сыграй первый баттл.', 'Real leaderboard is empty. Play the first battle.'));
    items.slice(0,100).forEach(function(item){
      var rowData = { rank:item.rank, name:item.name || 'Alpha67', side:Number(item.side) === 7 ? 7 : 6, score:Number(item.score || 0), me:!!item.me };
      if (typeof createTopRow === 'function') list.appendChild(createTopRow(rowData, rowData.rank));
      else list.appendChild(makeFallbackRow(rowData));
    });
    if (me && me.rank && !me.inTop100 && myRankCard) {
      var row = typeof createTopRow === 'function'
        ? createTopRow({ name:(state && state.name) || 'Alpha67', side:getSide(), score:me.score || 0, me:true }, me.rank)
        : makeFallbackRow({ rank:me.rank, name:(state && state.name) || 'Alpha67', side:getSide(), score:me.score || 0, me:true });
      row.classList.add('is-me','top-row--outside');
      var title = document.createElement('div');
      title.className = 'top-me-rank__title';
      title.textContent = txt('ТЫ #' + Number(me.rank).toLocaleString('ru-RU'), 'YOU #' + Number(me.rank).toLocaleString('en-US'));
      var text = document.createElement('div');
      text.className = 'top-me-rank__text';
      text.textContent = txt('Показываем только реальный Top-100.', 'Only real Top-100 is shown.');
      myRankCard.hidden = false;
      myRankCard.append(title, row, text);
    }
  }
  function renderTopShell(){
    try { show('top'); } catch(e) {}
    try { if (typeof applyTranslations === 'function') applyTranslations(); } catch(e) {}
    try {
      document.querySelectorAll('.top-tab').forEach(function(btn){ btn.classList.toggle('is-active', btn.dataset.topTab === TOP_TAB); });
      var playerPrize = byId('top-player-prize');
      var guildPrize = byId('top-guild-prize');
      if (playerPrize) playerPrize.hidden = TOP_TAB !== 'players';
      if (guildPrize) guildPrize.hidden = TOP_TAB !== 'guilds';
      var resetEl = byId('reset-in');
      if (resetEl && typeof getWeeklyResetText === 'function') resetEl.textContent = getWeeklyResetText();
    } catch(e) {}
    var myRankCard = byId('top-me-rank');
    if (myRankCard) { myRankCard.hidden = true; myRankCard.innerHTML = ''; }
    loadingTop();
  }
  async function renderRealTop(force){
    var screen = document.querySelector('[data-screen="top"]');
    if (!screen || screen.hidden) return;
    var tab = 'players';
    try { tab = TOP_TAB || 'players'; } catch(e) {}
    var key = tab + ':' + Math.floor(Date.now() / 5000);
    if (!force && (key === topRenderKey || Date.now() - lastTopFetchAt < 900)) return;
    topRenderKey = key;
    lastTopFetchAt = Date.now();

    if (!window.SixSevenAPI || !SixSevenAPI.ready) {
      loadingTop();
      return;
    }
    try {
      if (tab === 'guilds') {
        var gd = await SixSevenAPI.request('/api/leaderboard/guilds', { method:'GET' });
        var guilds = gd.items || [];
        if (!guilds.length) return emptyTop(txt('Реальных гильдий пока нет.', 'No real guilds yet.'));
        var list = byId('top-list');
        if (list) {
          list.innerHTML = '';
          guilds.slice(0,100).forEach(function(g){ if (typeof createGuildTopRow === 'function') list.appendChild(createGuildTopRow(g, g.rank)); });
        }
        return;
      }
      var data = await SixSevenAPI.request('/api/leaderboard/players', { method:'GET' });
      renderRows(data.items || [], data.me || null);
    } catch(e) {
      emptyTop(txt('Не удалось загрузить реальные данные.', 'Could not load real data.'));
    }
  }
  try {
    openTop = window.openTop = function(){
      renderTopShell();
      setTimeout(function(){ renderRealTop(true); }, 0);
    };
  } catch(e) { window.openTop = function(){ renderTopShell(); setTimeout(function(){ renderRealTop(true); }, 0); }; }

  // ---------- Mobile battle engine ----------
  (function installMobileBattleEngine(){
    var tg = window.Telegram && window.Telegram.WebApp;
    var platform = String((tg && tg.platform) || '').toLowerCase();
    var mobile = platform === 'ios' || platform === 'android' || platform === 'android_x' || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || matchMedia('(pointer: coarse)').matches;
    if (!mobile) return;

    document.documentElement.classList.add('battle-p1-engine');

    var rafPending = false;
    var lastHaptic = 0;
    var timerInterval = null;
    var endTimer = null;
    var comboHideTimer = null;
    var liveSyncTimer = null;
    var liveSyncInFlight = false;
    var activeLiveMatch = null;
    var handResetTimers = { 6: null, 7: null };
    var lastRenderedMy = -1;
    var lastRenderedEnemy = -1;
    var lastRenderedCombo = -1;
    var botTps = 0;
    var botStartTs = 0;
    var refs = null;
    var originalBeginBattle = null;
    var originalEndBattle = null;
    var originalResetBattleEffects = null;

    try { originalBeginBattle = beginBattle; } catch(e) {}
    try { originalEndBattle = endBattle; } catch(e) {}
    try { originalResetBattleEffects = resetBattleEffects; } catch(e) {}

    function cacheRefs(){
      refs = {
        stage: byId('battle-stage'), tap: byId('tap-zone'), floaters: byId('battle-floaters'),
        leftHand: byId('battle-hand-left'), rightHand: byId('battle-hand-right'),
        meScore: byId('me-score'), enemyScore: byId('enemy-score'), combo: byId('battle-combo'), meme: byId('battle-meme'),
        timerNum: byId('timer-num'), timerFg: byId('timer-fg'), vsSix: byId('vs-bar-six'), vsSeven: byId('vs-bar-seven'),
        tapHint: document.querySelector('.tap-zone__hint')
      };
      return refs;
    }
    function stageVisible(){ var s = document.querySelector('[data-screen="battle"]'); return !!s && !s.hidden; }
    function enemySideNow(){ return activeLiveMatch ? Number(activeLiveMatch.opponentSide || (getSide() === 6 ? 7 : 6)) : (getSide() === 6 ? 7 : 6); }
    function clearFx(){
      var r = refs || cacheRefs();
      if (r.floaters) r.floaters.replaceChildren();
      if (r.combo) { r.combo.hidden = true; r.combo.textContent = ''; r.combo.classList.remove('is-pop','is-hot','is-mega'); }
    }
    function baseHandTransform(side){ return side === 6 ? 'translate3d(0,0,0) rotate(-4deg) scaleX(-1)' : 'translate3d(0,0,0) rotate(4deg) scaleX(1)'; }
    function upHandTransform(side){ return side === 6 ? 'translate3d(0,-36px,0) rotate(-4deg) scaleX(-1)' : 'translate3d(0,-36px,0) rotate(4deg) scaleX(1)'; }
    function hand(side){ var r = refs || cacheRefs(); return side === 6 ? r.leftHand : r.rightHand; }
    function resetHand(side){ var el = hand(side); if (el) el.style.setProperty('transform', baseHandTransform(side), 'important'); }
    function resetHands(){ clearTimeout(handResetTimers[6]); clearTimeout(handResetTimers[7]); resetHand(6); resetHand(7); }
    function liteHaptic(){ var n = performance.now(); if (n - lastHaptic < 120) return; lastHaptic = n; callHaptic('light'); }
    function liteHand(side){
      var el = hand(side); if (!el) return;
      clearTimeout(handResetTimers[side]);
      el.style.setProperty('transform', baseHandTransform(side), 'important');
      requestAnimationFrame(function(){ el.style.setProperty('transform', upHandTransform(side), 'important'); });
      handResetTimers[side] = setTimeout(function(){ resetHand(side); }, 62);
    }
    function updateComboModel(){
      try { var n = Date.now(); BATTLE.combo = n - BATTLE.lastTapTs <= 650 ? BATTLE.combo + 1 : 1; BATTLE.lastTapTs = n; } catch(e) {}
    }
    function renderCombo(){
      var r = refs || cacheRefs(); if (!r.combo) return;
      var combo = 0; try { combo = Number(BATTLE.combo || 0); } catch(e) {}
      if (combo < 3) { if (!r.combo.hidden) r.combo.hidden = true; lastRenderedCombo = combo; return; }
      if (combo !== lastRenderedCombo) { r.combo.textContent = 'COMBO x' + combo; r.combo.hidden = false; lastRenderedCombo = combo; }
      clearTimeout(comboHideTimer);
      comboHideTimer = setTimeout(function(){ if (r.combo) r.combo.hidden = true; }, 720);
    }
    function applyLiveOpponent(match){
      if (!isLiveMatch(match)) return;
      try {
        BATTLE.matchKind = 'live';
        BATTLE.liveMatchId = match.id;
        BATTLE.enemySide = Number(match.opponentSide) === 7 ? 7 : 6;
        BATTLE.enemyName = match.opponentName || 'LIVE PLAYER';
        var enemyNameEl = byId('enemy-name');
        if (enemyNameEl) enemyNameEl.textContent = String(BATTLE.enemyName).toUpperCase();
        var enemySideEl = byId('enemy-side');
        if (enemySideEl && typeof getDigitUrl === 'function') enemySideEl.src = getDigitUrl(state.digitStyle, BATTLE.enemySide);
        var cardEnemy = byId('card-enemy');
        if (cardEnemy) cardEnemy.dataset.side = BATTLE.enemySide;
        if (typeof setHandSkin === 'function') setHandSkin();
      } catch(e) {}
    }
    function p1BeginBattle(){
      activeLiveMatch = currentMatch();
      if (typeof originalBeginBattle === 'function') originalBeginBattle.apply(this, arguments);
      if (activeLiveMatch) setTimeout(function(){ applyLiveOpponent(activeLiveMatch); }, 0);
    }
    try { beginBattle = window.beginBattle = p1BeginBattle; } catch(e) { window.beginBattle = p1BeginBattle; }

    async function pushLiveScore(finalPush){
      if (!activeLiveMatch || !window.SixSevenAPI || !SixSevenAPI.ready || liveSyncInFlight) return;
      liveSyncInFlight = true;
      try {
        var data = await SixSevenAPI.request('/api/matches/live/sync', {
          method:'POST',
          body: JSON.stringify({ matchId: activeLiveMatch.id, myScore: Number(BATTLE.myScore || 0), final: !!finalPush })
        });
        if (data && typeof data.opponentScore === 'number') {
          BATTLE.enemyScore = Math.max(0, Number(data.opponentScore) || 0);
          if (BATTLE.enemyScore % 3 === 0 && BATTLE.enemyScore > lastRenderedEnemy) liteHand(enemySideNow());
          requestRender();
        }
      } catch(e) {}
      liveSyncInFlight = false;
    }
    function startLiveSync(){
      clearInterval(liveSyncTimer);
      if (!activeLiveMatch) return;
      pushLiveScore(false);
      liveSyncTimer = setInterval(function(){ pushLiveScore(false); }, 220);
    }
    function updateBotScore(nowMs){
      if (activeLiveMatch) return;
      try {
        if (!BATTLE.running || !BATTLE.acceptingTaps) return;
        var elapsed = Math.max(0, (nowMs - botStartTs) / 1000);
        var target = Math.floor(elapsed * botTps);
        if (target > BATTLE.enemyScore) { BATTLE.enemyScore = target; if (target % 3 === 0) liteHand(enemySideNow()); }
      } catch(e) {}
    }
    function renderFrame(){
      rafPending = false;
      var r = refs || cacheRefs();
      try {
        if (!BATTLE.running && !stageVisible()) return;
        updateBotScore(performance.now());
        if (r.meScore && BATTLE.myScore !== lastRenderedMy) { r.meScore.textContent = String(BATTLE.myScore); lastRenderedMy = BATTLE.myScore; }
        if (r.enemyScore && BATTLE.enemyScore !== lastRenderedEnemy) { r.enemyScore.textContent = String(BATTLE.enemyScore); lastRenderedEnemy = BATTLE.enemyScore; }
        var total = Math.max(1, BATTLE.myScore + BATTLE.enemyScore);
        var pSix = getSide() === 6 ? BATTLE.myScore / total * 100 : BATTLE.enemyScore / total * 100;
        if (r.vsSix) r.vsSix.style.width = pSix.toFixed(1) + '%';
        if (r.vsSeven) r.vsSeven.style.width = (100 - pSix).toFixed(1) + '%';
        renderCombo();
      } catch(e) {}
    }
    function requestRender(){ if (rafPending) return; rafPending = true; requestAnimationFrame(renderFrame); }
    function stopLiteTimers(){
      clearInterval(timerInterval); clearTimeout(endTimer); clearTimeout(comboHideTimer); clearTimeout(handResetTimers[6]); clearTimeout(handResetTimers[7]); clearInterval(liveSyncTimer);
      timerInterval = null; endTimer = null; liveSyncTimer = null; document.body.classList.remove('is-battle-running');
    }

    try { burstParticles = window.burstParticles = function(){}; } catch(e) { window.burstParticles = function(){}; }
    try { triggerBattleFlash = window.triggerBattleFlash = function(){}; } catch(e) { window.triggerBattleFlash = function(){}; }
    try { pulseSpeedlines = window.pulseSpeedlines = function(){}; } catch(e) { window.pulseSpeedlines = function(){}; }
    try { spawnStickerBurst = window.spawnStickerBurst = function(){}; } catch(e) { window.spawnStickerBurst = function(){}; }
    try { phraseStorm = window.phraseStorm = function(){}; } catch(e) { window.phraseStorm = function(){}; }
    try { confettiWave = window.confettiWave = function(){}; } catch(e) { window.confettiWave = function(){}; }
    try { spawnConfettiPiece = window.spawnConfettiPiece = function(){}; } catch(e) { window.spawnConfettiPiece = function(){}; }
    try { startBattleChaos = window.startBattleChaos = function(){ clearFx(); }; } catch(e) { window.startBattleChaos = function(){ clearFx(); }; }
    try { spawnFloaterForSide = window.spawnFloaterForSide = function(){}; } catch(e) { window.spawnFloaterForSide = function(){}; }
    try { animateHandForSide = window.animateHandForSide = liteHand; } catch(e) { window.animateHandForSide = liteHand; }
    try { registerCombo = window.registerCombo = updateComboModel; } catch(e) { window.registerCombo = updateComboModel; }
    try { showCombo = window.showCombo = function(){}; } catch(e) { window.showCombo = function(){}; }
    try { scheduleBotTap = window.scheduleBotTap = function(){}; } catch(e) { window.scheduleBotTap = function(){}; }
    try { setBattleMeme = window.setBattleMeme = function(text){ var r = refs || cacheRefs(); if (r.meme) { r.meme.textContent = text; r.meme.classList.remove('is-pop'); } }; } catch(e) {}

    function p1EndBattle(){ pushLiveScore(true); stopLiteTimers(); clearFx(); resetHands(); if (typeof originalEndBattle === 'function') return originalEndBattle.apply(this, arguments); }
    function p1ResetBattleEffects(){ stopLiteTimers(); clearFx(); resetHands(); if (typeof originalResetBattleEffects === 'function') return originalResetBattleEffects.apply(this, arguments); }
    try { endBattle = window.endBattle = p1EndBattle; } catch(e) { window.endBattle = p1EndBattle; }
    try { resetBattleEffects = window.resetBattleEffects = p1ResetBattleEffects; } catch(e) { window.resetBattleEffects = p1ResetBattleEffects; }

    function p1StartBattleTimer(){
      stopLiteTimers(); cacheRefs(); clearFx(); resetHands();
      try {
        BATTLE.startTs = Date.now(); BATTLE.acceptingTaps = true; BATTLE.combo = 0; BATTLE.lastTapTs = 0;
        lastRenderedMy = -1; lastRenderedEnemy = -1; lastRenderedCombo = -1;
        activeLiveMatch = currentMatch();
        if (!activeLiveMatch) { botTps = 5.8 + Math.random() * 4.2; botStartTs = performance.now(); }
        document.body.classList.add('is-battle-running');
        var r = refs || cacheRefs(); var CIRC = 2 * Math.PI * 44;
        if (r.timerFg) { r.timerFg.setAttribute('stroke-dasharray', CIRC.toFixed(2)); r.timerFg.style.strokeDashoffset = '0'; }
        if (r.tapHint) r.tapHint.textContent = typeof t === 'function' ? t('battle.tapLive') : 'TAP TAP TAP';
        if (r.stage) r.stage.classList.add('is-playing');
        if (activeLiveMatch) startLiveSync();
        timerInterval = setInterval(function(){
          try {
            if (!BATTLE.running) { stopLiteTimers(); return; }
            var elapsed = Date.now() - BATTLE.startTs;
            var remain = Math.max(0, BATTLE.duration - elapsed);
            if (r.timerNum) r.timerNum.textContent = (remain / 1000).toFixed(1);
            if (r.timerFg) r.timerFg.style.strokeDashoffset = (CIRC * (1 - remain / BATTLE.duration)).toFixed(2);
            requestRender();
            if (remain <= 0) p1EndBattle();
          } catch(e) {}
        }, 120);
        BATTLE.tickInterval = timerInterval;
        endTimer = setTimeout(function(){ p1EndBattle(); }, BATTLE.duration + 40);
        BATTLE.endTimeout = endTimer;
        requestRender();
      } catch(e) {}
    }
    try { startBattleTimer = window.startBattleTimer = p1StartBattleTimer; } catch(e) { window.startBattleTimer = p1StartBattleTimer; }

    function liteTap(e){
      if (e) { e.preventDefault(); e.stopImmediatePropagation(); }
      try {
        if (!BATTLE.running || !BATTLE.acceptingTaps) return;
        liteHaptic(); BATTLE.myScore += 1; updateComboModel(); liteHand(getSide()); requestRender();
      } catch(err) {}
    }
    function bindLiteHandlers(){
      var r = cacheRefs();
      try { if (typeof onTap === 'function') { if (r.tap) r.tap.removeEventListener('pointerdown', onTap); if (r.stage) r.stage.removeEventListener('pointerdown', onTap); } } catch(e) {}
      if (r.tap && r.tap.dataset.p1LiteBound !== '1') { r.tap.dataset.p1LiteBound = '1'; r.tap.addEventListener('pointerdown', liteTap, true); }
      if (r.stage && r.stage.dataset.p1LiteBound !== '1') { r.stage.dataset.p1LiteBound = '1'; r.stage.addEventListener('pointerdown', liteTap, true); }
    }
    bindLiteHandlers();
    document.addEventListener('DOMContentLoaded', bindLiteHandlers);
    setInterval(function(){ bindLiteHandlers(); if (!stageVisible()) { stopLiteTimers(); clearFx(); } }, 900);
  })();

  function bootP1(){
    bindCancelButton();
    setResultRaidToNewBattle();
    setTimeout(function(){ renderRealTop(false); }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootP1, { once:true });
  else bootP1();
  document.addEventListener('click', function(e){
    if (e.target && (e.target.closest('[data-nav="top"]') || e.target.closest('[data-top-tab]'))) {
      setTimeout(function(){ renderRealTop(true); }, 60);
      setTimeout(function(){ renderRealTop(true); }, 700);
    }
  }, true);
  setInterval(function(){ bindCancelButton(); setResultRaidToNewBattle(); renderRealTop(false); }, 1000);
})();
