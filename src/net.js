// ── Online play: WebRTC P2P via PeerJS (public broker for signaling) ─────
// Two ways to connect:
//  • Quick Match — serverless matchmaking over a small pool of well-known
//    "lobby slot" peer IDs: scan slots as a guest; if nobody is hosting,
//    claim a slot and host. Re-shuffles periodically so two waiting hosts
//    eventually find each other.
//  • Rooms — host claims `room-CODE` as peer ID; friend joins by code.
import Peer from 'peerjs';

const PREFIX = 'chibi-clash-v1-';
const MM_SLOTS = 6;
const CODE_CHARS = 'ABCDEFGHJKMNPRSTUVWXYZ'; // no I/L/O/Q (ambiguous)

export function makeRoomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
  return s;
}

// Wrap a PeerJS DataConnection into the channel shape lockstep.js expects.
function wrapConn(peer, conn) {
  const ch = {
    send: (o) => { try { conn.send(o); } catch { /* mid-close race */ } },
    onMessage: null,
    onClose: null,
    close: () => { try { conn.close(); } catch {} try { peer.destroy(); } catch {} },
    open: true,
  };
  conn.on('data', (d) => ch.onMessage && ch.onMessage(d));
  const closed = () => { if (ch.open) { ch.open = false; ch.onClose && ch.onClose(); } };
  conn.on('close', closed);
  conn.on('error', closed);
  peer.on('disconnected', () => { try { peer.reconnect(); } catch {} });
  peer.on('error', (e) => {
    // post-connection fatal errors only
    if (e?.type === 'network' || e?.type === 'server-error') closed();
  });
  return ch;
}

function newPeer(id) {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    let done = false;
    peer.on('open', () => { if (!done) { done = true; resolve(peer); } });
    peer.on('error', (e) => {
      if (!done) { done = true; try { peer.destroy(); } catch {} reject(e); }
    });
    setTimeout(() => {
      if (!done) { done = true; try { peer.destroy(); } catch {} reject(new Error('signal-timeout')); }
    }, 8000);
  });
}

function tryConnect(peer, targetId, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let done = false;
    const conn = peer.connect(targetId, { reliable: true, serialization: 'json' });
    const fail = () => { if (!done) { done = true; try { conn.close(); } catch {} resolve(null); } };
    const onPeerErr = (e) => {
      if (!done && String(e).includes(targetId)) { peer.off?.('error', onPeerErr); fail(); }
    };
    peer.on('error', onPeerErr);
    conn.on('open', () => {
      if (!done) { done = true; peer.off?.('error', onPeerErr); resolve(conn); }
    });
    conn.on('error', fail);
    setTimeout(fail, timeoutMs);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Quick Match ──────────────────────────────────────────────────────────
// Returns { cancel }. Calls cb(status) with progress, done(channel, isHost),
// or fail(message).
export function quickMatch({ status, done, fail }) {
  let cancelled = false;
  let activePeer = null;

  (async () => {
    try {
      for (let round = 0; round < 30 && !cancelled; round++) {
        // 1) scan slots as a guest
        status('SEARCHING FOR OPPONENT...');
        const me = await newPeer();
        if (cancelled) { me.destroy(); return; }
        activePeer = me;
        const order = [...Array(MM_SLOTS).keys()].sort(() => Math.random() - 0.5);
        for (const slot of order) {
          if (cancelled) { me.destroy(); return; }
          const conn = await tryConnect(me, `${PREFIX}mm-${slot}`, 2500);
          if (conn) { done(wrapConn(me, conn), false); return; }
        }
        me.destroy();
        if (cancelled) return;

        // 2) nobody hosting: claim a random slot and host for a while
        status('NO ONE FOUND - HOSTING A LOBBY...');
        const slot = (Math.random() * MM_SLOTS) | 0;
        let host;
        try { host = await newPeer(`${PREFIX}mm-${slot}`); }
        catch { continue; }                  // slot raced away → rescan
        if (cancelled) { host.destroy(); return; }
        activePeer = host;
        const got = await new Promise((resolve) => {
          let resolved = false;
          host.on('connection', (c) => {
            if (resolved) return; resolved = true;
            c.on('open', () => resolve(c));
            setTimeout(() => resolve(c.open ? c : null), 4000);
          });
          // host 8-14s then go back to scanning (breaks host/host deadlock)
          setTimeout(() => { if (!resolved) { resolved = true; resolve(null); } },
            8000 + Math.random() * 6000);
        });
        if (cancelled) { host.destroy(); return; }
        if (got) { done(wrapConn(host, got), true); return; }
        host.destroy();
      }
      if (!cancelled) fail('NO OPPONENT FOUND. TRY AGAIN!');
    } catch (e) {
      if (!cancelled) fail(netErrorText(e));
    }
  })();

  return {
    cancel() {
      cancelled = true;
      try { activePeer?.destroy(); } catch {}
    },
  };
}

// ── Rooms ────────────────────────────────────────────────────────────────
export function hostRoom({ code, status, done, fail }) {
  let cancelled = false;
  let peer = null;
  (async () => {
    try {
      peer = await newPeer(`${PREFIX}room-${code}`);
      if (cancelled) { peer.destroy(); return; }
      status(`ROOM CODE: ${code}`);
      peer.on('connection', (c) => {
        c.on('open', () => { if (!cancelled) done(wrapConn(peer, c), true); });
      });
    } catch (e) {
      if (!cancelled) {
        fail(e?.type === 'unavailable-id'
          ? 'ROOM CODE IN USE. TRY AGAIN!' : netErrorText(e));
      }
    }
  })();
  return { cancel() { cancelled = true; try { peer?.destroy(); } catch {} } };
}

export function joinRoom({ code, status, done, fail }) {
  let cancelled = false;
  let peer = null;
  (async () => {
    try {
      status('CONNECTING TO ROOM...');
      peer = await newPeer();
      if (cancelled) { peer.destroy(); return; }
      const conn = await tryConnect(peer, `${PREFIX}room-${code}`, 6000);
      if (cancelled) { peer.destroy(); return; }
      if (!conn) { peer.destroy(); fail('ROOM NOT FOUND. CHECK THE CODE!'); return; }
      done(wrapConn(peer, conn), false);
    } catch (e) {
      if (!cancelled) fail(netErrorText(e));
    }
  })();
  return { cancel() { cancelled = true; try { peer?.destroy(); } catch {} } };
}

function netErrorText(e) {
  const t = e?.type || e?.message || '';
  if (String(t).includes('network') || String(t).includes('signal-timeout')) {
    return 'NETWORK ERROR. CHECK YOUR CONNECTION!';
  }
  return 'CONNECTION FAILED. TRY AGAIN!';
}
