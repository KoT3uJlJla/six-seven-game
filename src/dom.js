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
  if (el) el.src = src;
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

export function restartClass(el, className, duration = 220) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), duration);
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

