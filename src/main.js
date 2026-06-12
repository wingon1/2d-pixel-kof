// ── Boot + fixed-timestep core loop (60 logic ticks/sec, any refresh) ────
import { VIEW_W, VIEW_H } from './constants.js';
import { initInput, tickInput, makeHumanController, P1_KEYS, P2_KEYS, wasPressed } from './input.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { Menu } from './menu.js';
import { Game } from './game.js';
import { makeAIController } from './ai.js';
import { ROSTER } from './sprites.js';
import { drawTextShadow, drawText, drawTextOutline } from './font.js';
import { LockstepSession, NetController, StickyInput } from './lockstep.js';
import { quickMatch, hostRoom, joinRoom, makeRoomCode } from './net.js';
import { initTouch } from './touch.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
initInput(window);

const audio = new AudioEngine();
const menu = new Menu(audio);
const touchMode = initTouch(audio);   // on-screen controls on touch devices
menu.touchMode = touchMode;

let appState = 'menu'; // 'menu' | 'game'
let game = null;
let lastConfig = null;
let paused = false;       // offline pause
let quitOverlay = false;  // online "leave match?" overlay (sim keeps running)

// ── offline game ─────────────────────────────────────────────────────────
function startGame(cfg) {
  lastConfig = cfg;
  const p1 = {
    name: cfg.p1Pal.name, pal: cfg.p1Pal,
    controller: makeHumanController(P1_KEYS),
  };
  const p2 = {
    name: cfg.p2Pal.name, pal: cfg.p2Pal,
    controller: cfg.mode === 'cpu'
      ? makeAIController(cfg.aiLevel)
      : makeHumanController(P2_KEYS),
  };
  game = new Game({
    p1, p2, audio,
    onMatchEnd: (result) => {
      appState = 'menu';
      menu.online = false;
      menu.showResults(result);
    },
  });
  appState = 'game';
  paused = false;
  audio.music('battle');
}

// ── online play ──────────────────────────────────────────────────────────
let online = null;
// { phase, pending, channel, session, sticky, isHost,
//   picks:{local,remote}, rematch:{local,remote}, pingTimer }
const onlineLocalCtl = makeHumanController(P1_KEYS);

function beginNet(kind, code) {
  audio.ensure();
  netTeardown(false);
  online = {
    phase: 'lobby', pending: null, channel: null, session: null, sticky: null,
    isHost: false, picks: { local: -1, remote: -1 },
    rematch: { local: false, remote: false }, pingTimer: 0,
  };
  menu.netCode = '';
  menu.netDone = false;
  menu.netLines = ['CONNECTING...'];
  menu.go('netwait');
  const cbs = {
    status: (msg) => { if (online) menu.netLines = [msg]; },
    done: (channel, isHost) => onChannel(channel, isHost),
    fail: (msg) => {
      if (!online) return;
      online.pending = null;
      menu.netLines = [msg];
      menu.netDone = true;
    },
  };
  if (kind === 'quick') {
    online.pending = quickMatch(cbs);
  } else if (kind === 'host') {
    const rc = makeRoomCode();
    menu.netCode = rc;
    menu.netLines = ['WAITING FOR YOUR FRIEND'];
    online.pending = hostRoom({ ...cbs, code: rc, status: () => {} });
  } else {
    online.pending = joinRoom({ ...cbs, code });
  }
}

function onChannel(channel, isHost) {
  if (!online) { try { channel.close(); } catch {} return; }
  online.pending = null;
  online.channel = channel;
  online.isHost = isHost;
  channel.onClose = () => netShowError('CONNECTION LOST');
  bindSession(new LockstepSession(channel, isHost));
  // character select, both sides at once
  online.phase = 'char';
  online.picks = { local: -1, remote: -1 };
  menu.netChar = { cursor: isHost ? 0 : 1, locked: false, remoteLocked: false, remoteChar: -1, isHost };
  menu.netCode = '';
  menu.go('netchar');
  audio.sfx('select');
}

function bindSession(session) {
  online.session = session;
  session.on('pick', (m) => {
    if (!online) return;
    online.picks.remote = m.c | 0;
    if (menu.netChar) { menu.netChar.remoteLocked = true; menu.netChar.remoteChar = m.c | 0; }
    maybeStartOnline();
  });
  session.on('start', (m) => { if (online && !online.isHost) startOnlineGame(m.seed | 0); });
  session.on('rematch', () => {
    if (!online) return;
    online.rematch.remote = true;
    maybeRematch();
  });
  session.on('quit', () => netShowError('YOUR RIVAL LEFT THE MATCH'));
}

function maybeStartOnline() {
  if (!online || !online.isHost) return;
  if (online.picks.local < 0 || online.picks.remote < 0) return;
  const seed = (Math.random() * 0x7fffffff) | 0;
  online.session.send({ t: 'start', seed });
  startOnlineGame(seed);
}

function startOnlineGame(seed) {
  if (!online || !online.channel) return;
  // fresh lockstep session per game (frame counters restart)
  bindSession(new LockstepSession(online.channel, online.isHost));
  online.sticky = new StickyInput();
  online.rematch = { local: false, remote: false };
  online.pingTimer = 0;

  const hostChar = online.isHost ? online.picks.local : online.picks.remote;
  const guestChar = online.isHost ? online.picks.remote : online.picks.local;
  const p1Pal = ROSTER[hostChar]?.pal || ROSTER[0].pal;
  const p2Pal = guestChar === hostChar
    ? (ROSTER[guestChar]?.alt || ROSTER[1].alt)
    : (ROSTER[guestChar]?.pal || ROSTER[1].pal);

  game = new Game({
    p1: { name: p1Pal.name, pal: p1Pal, controller: new NetController(online.session, 0) },
    p2: { name: p2Pal.name, pal: p2Pal, controller: new NetController(online.session, 1) },
    audio, seed,
    onMatchEnd: (result) => {
      appState = 'menu';
      if (online) online.phase = 'results';
      menu.online = true;
      menu.showResults(result);
    },
  });
  online.phase = 'game';
  appState = 'game';
  paused = false;
  quitOverlay = false;
  audio.music('battle');
}

function maybeRematch() {
  if (!online || online.phase !== 'results') return;
  if (online.rematch.local && online.rematch.remote) {
    if (online.isHost) {
      const seed = (Math.random() * 0x7fffffff) | 0;
      online.session.send({ t: 'start', seed });
      startOnlineGame(seed);
    }
    // guest starts on the 'start' message
  }
}

function netTeardown(backToMenuMusic = true) {
  if (!online) return;
  try { online.pending?.cancel?.(); } catch {}
  try { online.channel?.close?.(); } catch {}
  online = null;
  menu.online = false;
  menu.netChar = null;
  if (backToMenuMusic) audio.music('menu');
}

function netShowError(msg) {
  if (!online) return;
  netTeardown(false);
  game = null;
  appState = 'menu';
  menu.netLines = [msg];
  menu.netCode = '';
  menu.netDone = true;
  menu.go('netwait');
  audio.music('menu');
}

function leaveOnline() {
  try { online?.session?.send({ t: 'quit' }); } catch {}
  netTeardown();
  game = null;
  appState = 'menu';
  menu.go('title');
}

// ── logic tick ───────────────────────────────────────────────────────────
function tick() {
  tickInput();
  if (wasPressed('KeyM')) audio.toggleMute();

  if (appState === 'menu') {
    const action = menu.update();
    if (!action) return;
    switch (action.type) {
      case 'start': startGame(action); break;
      case 'rematch':
        if (online && online.phase === 'results') {
          if (!online.rematch.local) {
            online.rematch.local = true;
            online.session.send({ t: 'rematch' });
            menu.resultsNote = 'WAITING FOR RIVAL...';
            maybeRematch();
          }
        } else if (lastConfig) startGame(lastConfig);
        break;
      case 'quickmatch': beginNet('quick'); break;
      case 'createroom': beginNet('host'); break;
      case 'joinroom': beginNet('join', action.code); break;
      case 'cancelnet':
        try { online?.session?.send({ t: 'quit' }); } catch {}
        netTeardown();
        menu.go('online');
        break;
      case 'netpick':
        if (online && online.session) {
          online.picks.local = action.c;
          online.session.send({ t: 'pick', c: action.c });
          maybeStartOnline();
        }
        break;
      case 'leavenet': leaveOnline(); break;
      default: break;
    }
    return;
  }

  // ── in-game ──
  if (online) {
    // online: lockstep — local pause is impossible, only a quit overlay
    online.sticky.accumulate(onlineLocalCtl.poll());
    if (wasPressed('Escape')) { quitOverlay = !quitOverlay; audio.sfx('select'); }
    // T (keyboard) or HP button (touch) confirms leaving
    if (quitOverlay && (wasPressed('KeyT') || (touchMode && wasPressed('KeyK')))) {
      leaveOnline(); return;
    }
    const s = online.session;
    if (s.canStep()) {
      s.captureLocal(online.sticky.capture());
      game.update();
      s.step();
    } else {
      s.stalled();
    }
    if (++online.pingTimer >= 120) { online.pingTimer = 0; s.ping(); }
    if (appState === 'menu') quitOverlay = false; // match just ended
    return;
  }

  // offline
  if (wasPressed('Escape')) {
    paused = !paused;
    audio.sfx('select');
  }
  if (paused) {
    // T (keyboard) or HP button (touch) quits to title
    if (wasPressed('KeyT') || (touchMode && wasPressed('KeyK'))) {
      appState = 'menu';
      game = null;
      paused = false;
      menu.go('title');
      audio.music('menu');
    }
    return;
  }
  game.update();
  if (appState === 'menu') game = null; // match just ended
}

// ── render ───────────────────────────────────────────────────────────────
function render() {
  let sx = 0, sy = 0;
  if (game && game.shakeT > 0) {
    const m = game.shakeMag * Math.min(1, game.shakeT / 8);
    sx = (Math.random() - 0.5) * 2 * m + game.shakeDirX * m * 0.5;
    sy = (Math.random() - 0.5) * m;
  }
  const ctx = renderer.begin(sx, sy);
  if (appState === 'menu' || !game) {
    menu.draw(ctx);
    return;
  }
  game.draw(ctx, renderer);

  if (online && online.session) {
    const s = online.session;
    drawTextOutline(ctx, `PING ${s.rtt}MS`, VIEW_W / 2, VIEW_H - 8, '#9a8cc8', 1, 'center');
    if (s.stallTicks > 30) {
      drawTextOutline(ctx, 'CONNECTION UNSTABLE...', VIEW_W / 2, 140,
        (s.stallTicks >> 3) % 2 ? '#ff5b7d' : '#fff', 2, 'center');
    }
    if (quitOverlay) {
      ctx.fillStyle = 'rgba(8,4,26,0.7)';
      ctx.fillRect(-8, 90, VIEW_W + 16, 70);
      drawTextShadow(ctx, 'LEAVE MATCH?', VIEW_W / 2, 108, '#ffe14f', 3, 'center');
      drawText(ctx, touchMode ? 'HP: LEAVE   BACK: KEEP FIGHTING'
        : 'T: LEAVE   ESC: KEEP FIGHTING', VIEW_W / 2, 136, '#fff', 1, 'center');
    }
  } else if (paused) {
    ctx.fillStyle = 'rgba(8,4,26,0.7)';
    ctx.fillRect(-8, -8, VIEW_W + 16, VIEW_H + 16);
    drawTextShadow(ctx, 'PAUSED', VIEW_W / 2, 110, '#ffe14f', 4, 'center');
    drawText(ctx, touchMode ? 'BACK: RESUME   HP: QUIT TO TITLE'
      : 'ESC: RESUME   T: QUIT TO TITLE   M: MUTE', VIEW_W / 2, 156, '#fff', 1, 'center');
  }
}

// ── fixed timestep, decoupled from monitor refresh ───────────────────────
const STEP = 1 / 60;
let acc = 0;
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;        // tab-switch guard
  acc += dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    tick();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;        // spiral-of-death guard
  render();
}
requestAnimationFrame(frame);
