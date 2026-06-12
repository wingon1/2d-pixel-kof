// ── Lockstep netcode core (transport-agnostic, no network imports) ───────
// Delay-based lockstep: each side captures one input per simulated frame,
// scheduled `DELAY` frames ahead. A frame simulates only when BOTH inputs
// for it exist, so the two simulations stay bit-identical.

export const INPUT_DELAY = 4; // ~66ms of jitter budget at 60fps

// command bit layout
const B_LEFT = 1, B_RIGHT = 2, B_UP = 4, B_DOWN = 8, B_UPP = 16,
  B_LP = 32, B_HP = 64, B_SP = 128, B_LPH = 256, B_HPH = 512, B_SPH = 1024;

export function encodeCmd(c) {
  return (c.left ? B_LEFT : 0) | (c.right ? B_RIGHT : 0) | (c.up ? B_UP : 0) |
    (c.down ? B_DOWN : 0) | (c.upPressed ? B_UPP : 0) |
    (c.lp ? B_LP : 0) | (c.hp ? B_HP : 0) | (c.sp ? B_SP : 0) |
    (c.lpHeld ? B_LPH : 0) | (c.hpHeld ? B_HPH : 0) | (c.spHeld ? B_SPH : 0);
}

export function decodeCmd(b) {
  return {
    left: !!(b & B_LEFT), right: !!(b & B_RIGHT), up: !!(b & B_UP),
    down: !!(b & B_DOWN), upPressed: !!(b & B_UPP),
    lp: !!(b & B_LP), hp: !!(b & B_HP), sp: !!(b & B_SP),
    lpHeld: !!(b & B_LPH), hpHeld: !!(b & B_HPH), spHeld: !!(b & B_SPH),
  };
}

// Accumulates edge-presses between captures so taps during a network stall
// are never dropped.
export class StickyInput {
  constructor() { this.pending = 0; }
  // call every wall tick with the freshly polled command
  accumulate(c) {
    this.pending |= (c.upPressed ? B_UPP : 0) | (c.lp ? B_LP : 0) |
      (c.hp ? B_HP : 0) | (c.sp ? B_SP : 0);
    this.lastHeld = encodeCmd(c) & ~(B_UPP | B_LP | B_HP | B_SP);
  }
  // call once per simulated frame
  capture() {
    const bits = (this.lastHeld || 0) | this.pending;
    this.pending = 0;
    return bits;
  }
}

export class LockstepSession {
  // channel: { send(obj), onMessage, onClose }
  constructor(channel, isHost) {
    this.channel = channel;
    this.isHost = isHost;
    this.delay = INPUT_DELAY;
    this.simFrame = 0;
    this.nextLocalFrame = this.delay;
    this.local = new Map();
    this.remote = new Map();
    for (let f = 0; f < this.delay; f++) { this.local.set(f, 0); this.remote.set(f, 0); }
    this.rtt = 0;
    this.stallTicks = 0;
    this.handlers = {};
    channel.onMessage = (m) => this.onMsg(m);
  }

  on(type, fn) { this.handlers[type] = fn; }

  onMsg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'i') this.remote.set(m.f, m.b | 0);
    else if (m.t === 'p') this.channel.send({ t: 'q', ts: m.ts });
    else if (m.t === 'q') this.rtt = Math.max(0, Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - m.ts));
    else this.handlers[m.t]?.(m);
  }

  send(obj) { this.channel.send(obj); }
  ping() {
    this.channel.send({ t: 'p', ts: (typeof performance !== 'undefined' ? performance.now() : Date.now()) });
  }

  canStep() {
    return this.local.has(this.simFrame) && this.remote.has(this.simFrame);
  }

  // capture local input bits for frame simFrame+delay and broadcast it
  captureLocal(bits) {
    const f = this.nextLocalFrame++;
    this.local.set(f, bits);
    this.channel.send({ t: 'i', f, b: bits });
  }

  step() {
    this.simFrame++;
    this.stallTicks = 0;
    if ((this.simFrame & 255) === 0) this.gc();
  }

  stalled() { this.stallTicks++; return this.stallTicks; }

  gc() {
    const keep = this.simFrame - 32;
    for (const m of [this.local, this.remote]) {
      for (const k of m.keys()) if (k < keep) m.delete(k);
    }
  }

  // side: 0 = host's fighter (P1, left), 1 = guest's fighter (P2, right)
  inputFor(side) {
    const mine = (side === 0) === this.isHost;
    const m = mine ? this.local : this.remote;
    return m.get(this.simFrame) ?? 0;
  }
}

// Controller plugged into Character: reads synced inputs for the current frame.
export class NetController {
  constructor(session, side) {
    this.session = session;
    this.side = side;
    this.human = true; // human-driven (no AI pathways)
  }
  poll() { return decodeCmd(this.session.inputFor(this.side)); }
}
