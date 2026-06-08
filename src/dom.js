const idCache = new Map();
let toastTimer = 0;

export function byId(id) {
  if (!idCache.has(id)) idCache.set(id, document.getElementById(id));
  return idCache.get(id);
}

export function query(selector, root = document) {
  return root.querySelector(selector);
}

export function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function setText(id, value) {
  const el = byId(id);
  if (el) el.textContent = String(value);
}

export function setImage(id, src) {
  const el = byId(id);
  if (el) applyImageFallback(el, src);
}

export function assetFallbackCandidates(src) {
  const clean = String(src || '').trim();
  if (!clean) return [];
  if (/^https?:\/\//i.test(clean)) return [clean];

  const assetPath = clean.replace(/^\.?\//, '');
  if (!assetPath.startsWith('assets/')) return [clean];
  return [
    clean,
    `https://cdn.jsdelivr.net/gh/KoT3uJlJla/six-seven-game@main/${assetPath}`,
    `https://raw.githubusercontent.com/KoT3uJlJla/six-seven-game/main/${assetPath}`,
  ];
}

export function applyImageFallback(img, src = img?.getAttribute?.('src') || '') {
  if (!img) return;
  const candidates = assetFallbackCandidates(src);
  if (!candidates.length) return;

  img.dataset.assetSrc = candidates[0];
  img.dataset.assetFallbackIndex = '0';
  img.dataset.assetFallbackList = candidates.join('\n');

  if (!img.dataset.assetFallbackBound) {
    img.dataset.assetFallbackBound = '1';
    img.addEventListener('error', () => {
      const list = String(img.dataset.assetFallbackList || '').split('\n').filter(Boolean);
      const next = Number(img.dataset.assetFallbackIndex || 0) + 1;
      if (!list[next]) return;
      img.dataset.assetFallbackIndex = String(next);
      img.src = list[next];
    });
  }

  if (img.getAttribute('src') !== candidates[0]) img.src = candidates[0];
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[char]));
}

export function animateElement(el, keyframes, options = {}) {
  if (!el) return null;
  if (el.animate) {
    return el.animate(keyframes, {
      duration: 180,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      ...options,
    });
  }
  const lastFrame = keyframes[keyframes.length - 1] || {};
  if (lastFrame.transform) el.style.transform = lastFrame.transform;
  return null;
}

export function showToast(message) {
  let el = query('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('is-show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-show'), 1600);
}

