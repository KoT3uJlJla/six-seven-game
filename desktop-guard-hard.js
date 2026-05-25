/* Hard desktop guard for Telegram Mini App. Keep this loaded after app.js. */
(function () {
  const allowedTelegramPlatforms = new Set(['android', 'android_x', 'ios']);

  function isProbablyMobileDevice() {
    const ua = navigator.userAgent || '';
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const touchCapable = (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
    const compactViewport = Math.min(window.innerWidth || 0, screen.width || 0) <= 820;
    return mobileUA || (touchCapable && compactViewport);
  }

  function isRussian() {
    const tgLang = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || '';
    const langs = [tgLang, navigator.language, ...(navigator.languages || [])]
      .filter(Boolean)
      .map(v => String(v).toLowerCase().replace('_', '-'));
    return langs.some(v => v === 'ru' || v.startsWith('ru-'));
  }

  function shouldBlock() {
    const tg = window.Telegram?.WebApp;
    const platform = String(tg?.platform || '').toLowerCase();

    // Inside Telegram we allow only explicitly mobile clients.
    // Telegram Desktop/Web must show the phone-only screen even if the window is narrow.
    if (tg && platform) return !allowedTelegramPlatforms.has(platform);

    // Outside Telegram, keep the usual mobile-device fallback for local QA.
    return !isProbablyMobileDevice();
  }

  function applyHardGuard() {
    if (!shouldBlock()) return false;

    const guard = document.getElementById('desktop-guard');
    const app = document.getElementById('app');
    document.body.classList.add('is-desktop-blocked');

    if (guard) {
      guard.hidden = false;
      guard.removeAttribute('hidden');
      guard.style.display = 'grid';
      guard.style.pointerEvents = 'auto';
      guard.style.zIndex = '99999';
    }

    if (app) {
      app.setAttribute('aria-hidden', 'true');
      app.inert = true;
      app.style.display = 'none';
      app.style.pointerEvents = 'none';
    }

    if (isRussian()) {
      const title = document.getElementById('desktop-guard-title');
      const text = document.getElementById('desktop-guard-text');
      const note = document.getElementById('desktop-guard-note');
      if (title) title.textContent = 'ИГРАЙ С ТЕЛЕФОНА';
      if (text) text.textContent = 'Эта брейнрот-битва работает только в мобильном Telegram. Открой игру на телефоне, чтобы тапать за 6 или 7.';
      if (note) note.textContent = 'Обнаружен ПК. Отправь Mini App себе и открой его на iOS или Android.';
    }

    window.Telegram?.WebApp?.BackButton?.hide?.();
    return true;
  }

  window.SixSevenDesktopGuard = { apply: applyHardGuard, shouldBlock };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyHardGuard, { once: true });
  } else {
    applyHardGuard();
  }

  window.addEventListener('load', applyHardGuard);
  window.addEventListener('resize', applyHardGuard);
  document.addEventListener('visibilitychange', applyHardGuard);

  let attempts = 0;
  const watchdog = setInterval(function () {
    attempts += 1;
    const blocked = applyHardGuard();
    if (blocked || attempts >= 20) clearInterval(watchdog);
  }, 150);
})();
