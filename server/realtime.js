import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  const length = data.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

export class WebSocketPeer extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.open = true;

    socket.on('data', chunk => this.handleData(chunk));
    socket.on('close', () => this.handleClose());
    socket.on('error', error => this.emit('error', error));
  }

  sendJson(payload) {
    if (!this.open) return;
    try {
      this.socket.write(encodeFrame(0x1, JSON.stringify(payload)));
    } catch {
      this.close();
    }
  }

  sendPong(payload) {
    if (!this.open) return;
    this.socket.write(encodeFrame(0xA, payload));
  }

  close(code = 1000, reason = '') {
    if (!this.open) return;
    this.open = false;
    const body = Buffer.alloc(2 + Buffer.byteLength(reason));
    body.writeUInt16BE(code, 0);
    body.write(reason, 2);
    try { this.socket.write(encodeFrame(0x8, body)); } catch {}
    try { this.socket.end(); } catch {}
  }

  handleClose() {
    if (!this.open) return;
    this.open = false;
    this.emit('close');
  }

  handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;

      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const big = this.buffer.readBigUInt64BE(offset);
        if (big > BigInt(1024 * 1024)) return this.close(1009, 'frame too large');
        length = Number(big);
        offset += 8;
      }

      const maskOffset = offset;
      if (masked) offset += 4;
      if (this.buffer.length < offset + length) return;

      let payload = this.buffer.subarray(offset, offset + length);
      if (masked) {
        const mask = this.buffer.subarray(maskOffset, maskOffset + 4);
        const out = Buffer.allocUnsafe(payload.length);
        for (let i = 0; i < payload.length; i += 1) out[i] = payload[i] ^ mask[i & 3];
        payload = out;
      }
      this.buffer = this.buffer.subarray(offset + length);

      if (opcode === 0x8) return this.close();
      if (opcode === 0x9) { this.sendPong(payload); continue; }
      if (opcode === 0xA) continue;
      if (opcode !== 0x1) continue;

      try {
        this.emit('message', JSON.parse(payload.toString('utf8')));
      } catch {
        this.sendJson({ type: 'error', code: 'BAD_JSON', message: 'Invalid JSON frame' });
      }
    }
  }
}

export function handleUpgrade(req, socket, head, onPeer) {
  const key = req.headers['sec-websocket-key'];
  if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));
  const peer = new WebSocketPeer(socket);
  if (head?.length) peer.handleData(head);
  onPeer(peer, req);
}
