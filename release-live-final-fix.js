/* Live battle finalizer: canonical live result + hard score reset. */
(function(){
  var finalizing = false;
  var syncedMatchIds = Object.create(null);

  function byId(id){ return document.getElementById(id); }
  function liveMatch(){
    try {
      var m = window.SIX_SEVEN_CURRENT_MATCH;
      if (m && m.kind === 'live' && m.id) return m;
    } catch(e) {}
    try {
      if (BATTLE && BATTLE.matchKind === 'live' && BATTLE.liveMatchId) {
        return { id:BATTLE.liveMatchId, kind:'live', opponentTelegramId:BATTLE.opponentTelegramId || '', opponentSide:BATTLE.enemySide || 0 };
      }
    } catch(e) {}
    return null;
  }
  function setScoreDom(my, enemy){
    try { var el = byId('me-score'); if (el) el.textContent = String(my); } catch(e) {}
    try { var el2 = byId('enemy-score'); if (el2) el2.textContent = String(enemy); } catch(e) {}
    try { var r1 = byId('result-my-score'); if (r1) r1.textContent = String(my); } catch(e) {}
    try { var r2 = byId('result-enemy-score'); if (r2) r2.textContent = String(enemy); } catch(e) {}
  }
  function resetBattleScores(){
    try {
      if (!BATTLE) return;
      BATTLE.myScore = 0;
      BATTLE.enemyScore = 0;
      BATTLE.combo = 0;
      BATTLE.lastTapTs = 0;
      setScoreDom(0, 0);
    } catch(e) {}
  }
  async function syncFinalScore(match, myScore){
    var last = null;
    if (!window.SixSevenAPI || !SixSevenAPI.ready) return null;
    for (var i = 0; i < 10; i++) {
      try {
        last = await SixSevenAPI.request('/api/matches/live/sync', {
          method:'POST',
          body: JSON.stringify({ matchId:match.id, myScore:myScore, final:true })
        });
        if (last && last.opponentFinal) return last;
      } catch(e) {}
      await new Promise(function(resolve){ setTimeout(resolve, 180); });
    }
    return last;
  }
  async function persistLiveResult(match, myScore, enemyScore){
    if (!window.SixSevenAPI || !SixSevenAPI.ready || !match || !match.id || syncedMatchIds[match.id]) return;
    syncedMatchIds[match.id] = true;
    try {
      await SixSevenAPI.request('/api/matches/finish', {
        method:'POST',
        body: JSON.stringify({
          matchKind:'live',
          matchId:match.id,
          opponentTelegramId:match.opponentTelegramId || '',
          myScore:myScore,
          enemyScore:enemyScore,
          side:(Number(state && state.side) === 7 ? 7 : 6),
          durationMs:6700
        })
      });
    } catch(e) {}
  }
  function blockOldAutoSync(my, enemy){
    try {
      var side = Number(state && state.side) === 7 ? 7 : 6;
      if (window.SixSevenAPI && SixSevenAPI.syncMatch) {
        SixSevenAPI.syncMatch.lastKey = [my, enemy, side].join(':');
      }
    } catch(e) {}
  }

  function install(){
    if (window.__LIVE_FINAL_FIX_INSTALLED__) return;
    window.__LIVE_FINAL_FIX_INSTALLED__ = true;

    var prevBegin = null;
    var prevEnd = null;
    try { prevBegin = beginBattle; } catch(e) { prevBegin = window.beginBattle; }
    try { prevEnd = endBattle; } catch(e) { prevEnd = window.endBattle; }

    function fixedBeginBattle(){
      resetBattleScores();
      var ret;
      if (typeof prevBegin === 'function') ret = prevBegin.apply(this, arguments);
      setTimeout(resetBattleScores, 0);
      return ret;
    }

    async function fixedEndBattle(){
      var match = liveMatch();
      if (!match || finalizing) {
        if (typeof prevEnd === 'function') return prevEnd.apply(this, arguments);
        return;
      }
      finalizing = true;
      var my = 0;
      var enemy = 0;
      try { my = Math.max(0, Number(BATTLE.myScore || 0)); } catch(e) {}
      try { enemy = Math.max(0, Number(BATTLE.enemyScore || 0)); } catch(e) {}
      try { BATTLE.acceptingTaps = false; } catch(e) {}

      var canonical = await syncFinalScore(match, my);
      if (canonical && typeof canonical.opponentScore === 'number') {
        enemy = Math.max(0, Number(canonical.opponentScore) || 0);
      }
      try { BATTLE.myScore = my; BATTLE.enemyScore = enemy; } catch(e) {}
      setScoreDom(my, enemy);
      blockOldAutoSync(my, enemy);

      var out;
      if (typeof prevEnd === 'function') out = prevEnd.apply(this, arguments);
      setScoreDom(my, enemy);
      blockOldAutoSync(my, enemy);
      persistLiveResult(match, my, enemy);

      finalizing = false;
      return out;
    }

    try { beginBattle = window.beginBattle = fixedBeginBattle; } catch(e) { window.beginBattle = fixedBeginBattle; }
    try { endBattle = window.endBattle = fixedEndBattle; } catch(e) { window.endBattle = fixedEndBattle; }
  }

  document.addEventListener('DOMContentLoaded', install);
  setTimeout(install, 0);
  setInterval(install, 1000);
})();
