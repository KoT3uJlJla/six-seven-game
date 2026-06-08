import { CONFIG } from './config.js';

function isLocalHost(hostname = location.hostname) {
  return /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(hostname);
}

function wsUrlFromHttpBase(base) {
  const url = new URL(base, location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export class RealtimeClient {
  constructor({ buildHello, onStatus = () => {}, shouldSendQueued } = {}) {
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = 0;
    this.reconnectAttempts = 0;
    this.serverOffset = 0;
    this.handlers = new Map();
    this.outbox = [];
    this.buildHello = buildHello;
    this.onStatus = typeof onStatus === 'function' ? onStatus : () => {};
    this.shouldSendQueued = shouldSendQueued;
  }

  on(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
  }

  emit(message) {
    const handlers = this.handlers.get(message.type);
    if (handlers) handlers.forEach(handler => handler(message));
  }

  resolveUrl() {
    const explicit = String(window.SIX_SEVEN_WS_URL || localStorage.getItem('six-seven::ws-url') || '').trim();
    if (explicit) return explicit;

    const configuredApiBase = String(window.SIX_SEVEN_API_BASE || '').trim();
    if (configuredApiBase) {
      try { return wsUrlFromHttpBase(configuredApiBase); } catch {}
    }

    if (!isLocalHost()) return wsUrlFromHttpBase('https://six-seven-api.onrender.com');

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    if (location.port && location.port !== '3000') return `${protocol}//${location.hostname}:3000/ws`;
    return `${protocol}//${location.host}/ws`;
  }

  resolveHttpUrl(pathname = '/') {
    const url = new URL(this.resolveUrl());
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    url.pathname = pathname;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  connect() {
    if (this.ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(this.ws.readyState)) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = 0;
    this.onStatus('connecting');

    try {
      this.ws = new WebSocket(this.resolveUrl());
    } catch {
      this.handleClose();
      return;
    }

    this.ws.addEventListener('open', () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.onStatus('online');
      this.sendHello();
      this.flushOutbox();
    });

    this.ws.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.serverTs) this.serverOffset = Number(message.serverTs) - Date.now();
        this.emit(message);
      } catch {
        // Ignore malformed frames from stale deployments.
      }
    });

    this.ws.addEventListener('close', () => this.handleClose());
    this.ws.addEventListener('error', () => {
      if (!this.connected) this.onStatus('offline');
    });
  }

  handleClose() {
    this.connected = false;
    this.onStatus('offline');
    window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(CONFIG.reconnectMaxMs, CONFIG.reconnectBaseMs * Math.max(1, 1 + this.reconnectAttempts));
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  sendHello() {
    const payload = this.buildHello?.();
    if (payload) this.send(payload, { queueIfClosed: false });
  }

  flushOutbox() {
    const pending = this.outbox.splice(0);
    for (const payload of pending) {
      if (this.shouldSendQueued && !this.shouldSendQueued(payload)) continue;
      this.send(payload, { queueIfClosed: false });
    }
  }

  dropQueued(types = []) {
    const blocked = new Set(types);
    this.outbox = this.outbox.filter(payload => !blocked.has(payload.type));
  }

  serverNow() {
    return Date.now() + this.serverOffset;
  }

  send(payload, options = {}) {
    const { queueIfClosed = true } = options;
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (queueIfClosed) this.outbox.push(payload);
      this.connect();
      return false;
    }
    this.ws.send(JSON.stringify(payload));
    return true;
  }
}
