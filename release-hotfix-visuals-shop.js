/* Release hotfix: clean result visuals, clean 67 jackpot, backend-backed shop purchases. */
(function(){
  function byId(id){ return document.getElementById(id); }
  function safeT(key, vars){ try { return t(key, vars); } catch(e) { return key; } }
  function callHaptic(kind){ try { haptic && haptic[kind] && haptic[kind](); } catch(e) {} }
  function saveAndSync(user){
    if (!user) return;
    try {
      state.name = user.name || state.name;
      state.coins = Number(user.coins ?? state.coins ?? 0);
      state.side = Number(user.side || state.side || 6);
      state.weeklyScore = Number(user.weeklyScore ?? state.weeklyScore ?? 0);
      state.hand = user.hand || state.hand || 'hand';
      state.digitStyle = user.digitStyle || state.digitStyle || 'classic';
      state.ownedHands = Array.isArray(user.ownedHands) ? user.ownedHands : (state.ownedHands || ['hand']);
      state.ownedDigits = Array.isArray(user.ownedDigits) ? user.ownedDigits : (state.ownedDigits || ['classic']);
      state.stats = Object.assign({}, state.stats || {}, user.stats || {});
      state.referrals = Object.assign({}, state.referrals || {}, user.referrals || {});
      state.guild = user.guild ? Object.assign({}, state.guild || {}, user.guild) : (state.guild || {});
      if (typeof saveState === 'function') saveState();
      if (typeof syncTopBarCoins === 'function') syncTopBarCoins();
      if (typeof syncHeroHands === 'function') syncHeroHands();
      if (typeof syncHeroDigits === 'function') syncHeroDigits();
    } catch(e) {}
  }
  async function apiRequest(path, opts){
    if (!window.SixSevenAPI || !SixSevenAPI.ready) throw new Error('API is not ready');
    return SixSevenAPI.request(path, opts || {});
  }

  // ---------- Clean result / jackpot visuals ----------
  try {
    showSixtySevenJackpot = window.showSixtySevenJackpot = function(){
      var old = document.querySelector('.sixty-seven-jackpot');
      if (old) old.remove();
      callHaptic('heavy');
      setTimeout(function(){ callHaptic('success'); }, 180);

      var overlay = document.createElement('div');
      overlay.className = 'sixty-seven-jackpot sixty-seven-jackpot--clean';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'assertive');

      var card = document.createElement('div');
      card.className = 'sixty-seven-jackpot__card';

      var badge = document.createElement('div');
      badge.className = 'sixty-seven-jackpot__badge';
      badge.textContent = safeT('jackpot.badge');

      var title = document.createElement('div');
      title.className = 'sixty-seven-jackpot__clean-title';
      title.textContent = 'СИИИИИИСК СЕЕЕЕВЕЕЕН';

      var score = document.createElement('div');
      score.className = 'sixty-seven-jackpot__clean-score';
      score.textContent = '67';

      var sub = document.createElement('div');
      sub.className = 'sixty-seven-jackpot__sub';
      sub.textContent = safeT('jackpot.sub');

      card.append(badge, title, score, sub);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      setTimeout(function(){ overlay.classList.add('is-out'); }, 2600);
      setTimeout(function(){ overlay.remove(); }, 3200);
    };
  } catch(e) {}

  // ---------- Backend-backed shop ----------
  function getCatalog(){
    try { return SHOP_TAB === 'hands' ? HAND_CATALOG : DIGIT_CATALOG; }
    catch(e) { return []; }
  }
  function itemName(item){
    try { return getItemName(item); }
    catch(e) { return item && (item.name || item.id) || ''; }
  }
  function typeNow(){
    try { return SHOP_TAB === 'hands' ? 'hand' : 'digit'; }
    catch(e) { return 'hand'; }
  }
  function ownedList(){
    return typeNow() === 'hand' ? (state.ownedHands || ['hand']) : (state.ownedDigits || ['classic']);
  }
  function equippedId(){
    return typeNow() === 'hand' ? (state.hand || 'hand') : (state.digitStyle || 'classic');
  }
  async function buyOrEquip(item, owned, equipped){
    if (!item || equipped) return;
    var type = typeNow();
    try {
      if (!window.SixSevenAPI || !SixSevenAPI.ready) {
        callHaptic('error');
        try { toast('API sync is still loading'); } catch(e) {}
        return;
      }
      var path = owned ? '/api/shop/equip' : '/api/shop/buy';
      var data = await apiRequest(path, { method:'POST', body: JSON.stringify({ type:type, id:item.id }) });
      saveAndSync(data.user);
      callHaptic('success');
      try { toast(owned ? safeT('shop.equippedToast', { name:itemName(item) }) : safeT('shop.unlocked', { name:itemName(item) })); } catch(e) {}
      if (typeof renderShop === 'function') renderShop();
    } catch(err) {
      callHaptic('error');
      var msg = String(err && err.message || 'Shop error');
      if (/coins|not enough/i.test(msg)) msg = safeT('shop.notEnough');
      try { toast(msg); } catch(e) {}
    }
  }
  function renderBackendShop(){
    var grid = byId('shop-grid');
    if (!grid) return;
    grid.innerHTML = '';
    var coinsEl = byId('shop-coins');
    if (coinsEl) coinsEl.textContent = Number(state.coins || 0).toLocaleString();

    var data = getCatalog();
    data.forEach(function(item){
      var card = document.createElement('div');
      card.className = 'shop-card';

      var rarity = document.createElement('div');
      rarity.className = 'shop-card__rarity shop-card__rarity--' + item.rarity;
      rarity.textContent = safeT('rarity.' + item.rarity);
      card.appendChild(rarity);

      if (typeNow() === 'hand') {
        var img = document.createElement('img');
        img.className = 'shop-card__img';
        img.src = item.img;
        img.alt = itemName(item);
        card.appendChild(img);
      } else {
        var preview = document.createElement('div');
        preview.className = 'shop-card__digit-preview';
        var img6 = document.createElement('img'); img6.src = item.img6; img6.alt = '6';
        var img7 = document.createElement('img'); img7.src = item.img7; img7.alt = '7';
        preview.append(img6, img7);
        card.appendChild(preview);
      }

      var name = document.createElement('div');
      name.className = 'shop-card__name';
      name.textContent = itemName(item);
      card.appendChild(name);

      var cta = document.createElement('button');
      cta.className = 'shop-card__cta';
      var owned = ownedList().includes(item.id);
      var equipped = equippedId() === item.id;
      if (equipped) {
        cta.classList.add('is-equipped');
        cta.textContent = safeT('shop.equipped');
      } else if (owned) {
        cta.classList.add('is-owned');
        cta.textContent = safeT('shop.equip');
        cta.addEventListener('click', function(){ buyOrEquip(item, true, false); });
      } else {
        var can = Number(state.coins || 0) >= Number(item.price || 0);
        cta.textContent = '🪙 ' + Number(item.price || 0).toLocaleString();
        if (!can) cta.classList.add('is-locked');
        cta.addEventListener('click', function(){ buyOrEquip(item, false, false); });
      }
      card.appendChild(cta);
      grid.appendChild(card);
    });
  }
  function openBackendShop(){
    try { show('shop'); } catch(e) {}
    renderBackendShop();
    if (window.SixSevenAPI && SixSevenAPI.ready) {
      apiRequest('/api/me', { method:'GET' }).then(function(data){ saveAndSync(data.user); renderBackendShop(); }).catch(function(){});
    }
  }
  try { renderShop = window.renderShop = renderBackendShop; } catch(e) { window.renderShop = renderBackendShop; }
  try { openShop = window.openShop = openBackendShop; } catch(e) { window.openShop = openBackendShop; }

  window.addEventListener('six-seven:api-ready', function(e){ saveAndSync(e.detail); if (!document.querySelector('[data-screen="shop"]')?.hidden) renderBackendShop(); });
  document.addEventListener('DOMContentLoaded', function(){
    if (window.SixSevenAPI && SixSevenAPI.ready) {
      apiRequest('/api/me', { method:'GET' }).then(function(data){ saveAndSync(data.user); }).catch(function(){});
    }
  });
})();
