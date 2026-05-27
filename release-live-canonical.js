/* Backend-first live battle canonical result. No asset hooks, no CSS changes. */
(function(){
  var installed = false;
  var finalizing = false;
  var finishedMatchIds = Object.create(null);

  function byId(id){ return document.getElementById(id); }
  function isLiveMatch(match){ return !!(match && match.kind === 'live' && match.id); }
  function currentLiveMatch(){
    try {
      if (isLiveMatch(window.SIX_SEVEN_CURRENT_MATCH)) return window.SIX_SEVEN_CURRENT_MATCH;
    } catch(e) {}
    try {
      if (window.BATTLE && BATTLE.matchKind === 'live' && BATTLE.liveMatchId) {
        return {
          id: BATTLE.liveMatchId,
          kind: 'live',
          opponentTelegramId: BATTLE.opponentTelegramId || '',
          opponentSide: BATTLE.enemySide || 0
        };
      }
    } catch(e) {}
    return null;
  }
  function setText(id, value){ var el = byId(id); if (el) el.textContent = String(value); }
  function setScoreEverywhere(my, enemy){
    setText('me-score', my);
    setText('enemy-score', enemy);
    setText('result-my-score', my);
    setText('result-enemy-score', enemy);
  }
  function resetScoresHard(){
    try {
      if (!window.BATTLE) return;
      BATTLE.myScore = 0;
      BATTLE.enemyScore = 0;
      BATTLE.combo = 0;
      BATTLE.lastTapTs = 0;
      setScoreEverywhere(0, 0);
    } catch(e) {}
  }
  function sleep(ms){ return new Promise(function(resolve){ setTimeout(resolve, ms); }); }

  async function pushFinalAndWait(match, myScore){
    if (!window.SixSevenAPI || !SixSevenAPI.ready || !match || !match.id) return null;
    var last = null;
    for (var i = 0; i < 14; i++) {
      try {
        last = await SixSevenAPI.request('/api/matches/live/sync', {
          method: 'POST',
          body: JSON.stringify({ matchId: match.id, myScore: myScore, final: true })
        });
        if (last && last.opponentFinal) return last;
      } catch(e) {}
      await sleep(i < 4 ? 120 : 220);
    }
    return last;
  }

  async function persistCanonical(match, myScore, enemyScore){
    if (!window.SixSevenAPI || !SixSevenAPI.ready || !match || !match.id || finishedMatchIds[match.id]) return;
    finishedMatchIds[match.id] = true;
    try {
      await SixSevenAPI.request('/api/matches/finish', {
        method: 'POST',
        body: JSON.stringify({
          matchKind: 'live',
          matchId: match.id,
          opponentTelegramId: match.opponentTelegramId || '',
          myScore: myScore,
          enemyScore: enemyScore,
          side: Number(state && state.side) === 7 ? 7 : 6,
          durationMs: 6700
        })
      });
    } catch(e) {}
  }

  function install(){
    if (installed) return;
    var previousBegin = null;
    var previousEnd = null;
    try { previousBegin = window.beginBattle || beginBattle; } catch(e) {}
    try { previousEnd = window.endBattle || endBattle; } catch(e) {}
    if (typeof previousBegin !== 'function' || typeof previousEnd !== 'function') return;
    installed = true;

    function canonicalBeginBattle(){
      resetScoresHard();
      var ret = previousBegin.apply(this, arguments);
      setTimeout(resetScoresHard, 0);
      setTimeout(resetScoresHard, 50);
      return ret;
    }

    async function canonicalEndBattle(){
      var live = currentLiveMatch();
      if (!live) return previousEnd.apply(this, arguments);
      if (finalizing) return;
      finalizing = true;

      var myScore = 0;
      var enemyScore = 0;
      try { myScore = Math.max(0, Math.floor(Number(BATTLE.myScore || 0))); } catch(e) {}
      try { enemyScore = Math.max(0, Math.floor(Number(BATTLE.enemyScore || 0))); } catch(e) {}

      try { BATTLE.acceptingTaps = false; } catch(e) {}
      var final = await pushFinalAndWait(live, myScore);
      if (final && typeof final.opponentScore === 'number') {
        enemyScore = Math.max(0, Math.floor(Number(final.opponentScore || 0)));
      }

      try {
        BATTLE.myScore = myScore;
        BATTLE.enemyScore = enemyScore;
        if (live.opponentTelegramId) BATTLE.opponentTelegramId = live.opponentTelegramId;
      } catch(e) {}
      setScoreEverywhere(myScore, enemyScore);

      var ret = previousEnd.apply(this, arguments);
      setScoreEverywhere(myScore, enemyScore);
      persistCanonical(live, myScore, enemyScore);
      finalizing = false;
      return ret;
    }

    try { beginBattle = window.beginBattle = canonicalBeginBattle; } catch(e) { window.beginBattle = canonicalBeginBattle; }
    try { endBattle = window.endBattle = canonicalEndBattle; } catch(e) { window.endBattle = canonicalEndBattle; }
  }

  document.addEventListener('DOMContentLoaded', install);
  setTimeout(install, 0);
  setInterval(install, 1000);
})();
