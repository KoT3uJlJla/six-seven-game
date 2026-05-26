/* Release mobile fixes: real leaderboard, new battle result CTA, 10s matchmaking. */
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
    try { return state && state.lang === 'ru' ? 'ru' : 'en'; } catch(e) { return document.documentElement.lang === 'ru' ? 'ru' : 'en'; }
  }
  function txt(ru,en){ return lang() === 'ru' ? ru : en; }
  function getSide(){ try { return Number(state.side) === 7 ? 7 : 6; } catch(e) { return 6; } }

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

  window.cancelMatchmaking = function(){
    matchmakingRunId += 1;
    clearMatchingTimers();
    cancelLiveQueue();
    try { haptic && haptic.warning && haptic.warning(); } catch(e) {}
    try { show('home'); } catch(e) {}
  };

  function safeBeginBattle(runId, delay){
    clearTimeout(pendingBattleTimer);
    pendingBattleTimer = setTimeout(function(){
      if (runId !== matchmakingRunId) return;
      try { beginBattle(); } catch(e) {}
    }, delay);
  }

  function setResultRaidToNewBattle(){
    var btn = byId('result-raid');
    if (!btn) return;
    btn.textContent = txt('НОВЫЙ БАТТЛ', 'NEW BATTLE');
    btn.setAttribute('data-action','new-battle');
    if (btn.dataset.newBattleBound === '1') return;
    btn.dataset.newBattleBound = '1';
    btn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      try { haptic && haptic.medium && haptic.medium(); } catch(_) {}
      startMatchmaking();
    }, true);
  }

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

  window.startMatchmaking = function(){
    clearMatchingTimers();
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
      if (!match || liveFound || runId !== matchmakingRunId) return;
      liveFound = true;
      clearTimeout(matchingTimer);
      clearInterval(matchingPollTimer);
      setMatchingStatus(txt('Живой соперник найден', 'Live opponent found'));
      window.SIX_SEVEN_CURRENT_MATCH = match;
      safeBeginBattle(runId, 450);
    }
    renderCountdown();

    tryLiveQueue().then(lockLive);

    matchingPollTimer = setInterval(function(){
      if (runId !== matchmakingRunId) return;
      renderCountdown();
      pollLiveQueue().then(lockLive);
    }, 1000);

    matchingTimer = setTimeout(function(){
      if (liveFound || runId !== matchmakingRunId) return;
      clearInterval(matchingPollTimer);
      cancelLiveQueue();
      setMatchingStatus(txt('Живых нет — ставим бота', 'No live player — bot found'));
      safeBeginBattle(runId, 550);
    }, LIVE_SEARCH_MS);
  };

  var cancelBtn = byId('matching-cancel');
  if (cancelBtn && !cancelBtn.dataset.releaseCancelBound) {
    cancelBtn.dataset.releaseCancelBound = '1';
    cancelBtn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopImmediatePropagation();
      window.cancelMatchmaking();
    }, true);
  }
  document.addEventListener('DOMContentLoaded', function(){
    var btn = byId('matching-cancel');
    if (btn && !btn.dataset.releaseCancelBound) {
      btn.dataset.releaseCancelBound = '1';
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopImmediatePropagation();
        window.cancelMatchmaking();
      }, true);
    }
  });

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
      var rowData = {
        rank: item.rank,
        name: item.name || 'Alpha67',
        side: Number(item.side) === 7 ? 7 : 6,
        score: Number(item.score || 0),
        me: !!item.me
      };
      if (typeof createTopRow === 'function') list.appendChild(createTopRow(rowData, rowData.rank));
      else list.appendChild(makeFallbackRow(rowData));
    });

    if (me && me.rank && !me.inTop100 && myRankCard) {
      var row = typeof createTopRow === 'function'
        ? createTopRow({ name: (state && state.name) || 'Alpha67', side: getSide(), score: me.score || 0, me: true }, me.rank)
        : makeFallbackRow({ rank: me.rank, name: (state && state.name) || 'Alpha67', side: getSide(), score: me.score || 0, me: true });
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

  function looksFakeGuild(g){
    var s = String((g && (g.name + ' ' + g.tag)) || '').toUpperCase();
    return /SKIB|CULT|AURA FARM|BRAINROT|SIGMA|MANGO|COOKED|SAHUR|NO CHILL|SYNDICATE|BONK|RAID #|NPC #|OHIO|PLUH/.test(s);
  }

  async function renderRealTop(){
    var screen = document.querySelector('[data-screen="top"]');
    if (!screen || screen.hidden) return;
    var tab = 'players';
    try { tab = TOP_TAB || 'players'; } catch(e) {}
    var key = tab + ':' + Math.floor(Date.now() / 5000);
    if (key === topRenderKey || Date.now() - lastTopFetchAt < 900) return;
    topRenderKey = key;
    lastTopFetchAt = Date.now();

    if (!window.SixSevenAPI || !SixSevenAPI.ready) {
      emptyTop(txt('Ждём авторизацию Telegram…', 'Waiting for Telegram auth…'));
      return;
    }

    try {
      if (tab === 'guilds') {
        var gd = await SixSevenAPI.request('/api/leaderboard/guilds', { method:'GET' });
        var realGuilds = (gd.items || []).filter(function(g){ return !looksFakeGuild(g); });
        if (!realGuilds.length) return emptyTop(txt('Реальных гильдий пока нет.', 'No real guilds yet.'));
        var list = byId('top-list');
        if (list) {
          list.innerHTML = '';
          realGuilds.slice(0,100).forEach(function(g){ if (typeof createGuildTopRow === 'function') list.appendChild(createGuildTopRow(g, g.rank)); });
        }
        return;
      }
      var data = await SixSevenAPI.request('/api/leaderboard/players', { method:'GET' });
      renderRows(data.items || [], data.me || null);
    } catch(e) {
      emptyTop(txt('Не удалось загрузить реальный топ.', 'Could not load real leaderboard.'));
    }
  }

  var oldOpenTop = window.openTop;
  window.openTop = function(){
    if (typeof oldOpenTop === 'function') oldOpenTop.apply(this, arguments);
    setTimeout(renderRealTop, 0);
  };

  document.addEventListener('click', function(e){
    if (e.target && (e.target.closest('[data-nav="top"]') || e.target.closest('[data-top-tab]'))) {
      setTimeout(renderRealTop, 60);
      setTimeout(renderRealTop, 700);
    }
  }, true);

  setInterval(function(){ setResultRaidToNewBattle(); renderRealTop(); }, 1000);
  document.addEventListener('DOMContentLoaded', function(){ setResultRaidToNewBattle(); setTimeout(renderRealTop, 500); });
})();
