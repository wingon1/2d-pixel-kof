// Lockstep netcode test: runs TWO independent Game simulations connected by
// a jittery in-memory "network" (random delivery delay, uneven tick rates)
// and asserts the simulations stay bit-identical frame by frame.
// Run: node scripts/netcode-test.mjs

// ── DOM stubs ────────────────────────────────────────────────────────────
globalThis.document = {
  createElement: () => ({
    width: 0, height: 0, style: {},
    getContext: () => new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : () => {}),
      set: (t, k, v) => { t[k] = v; return true; },
    }),
  }),
};
globalThis.window = { addEventListener: () => {}, innerWidth: 960, innerHeight: 540 };

const { Game } = await import('../src/game.js');
const { LockstepSession, NetController, StickyInput, decodeCmd } = await import('../src/lockstep.js');
const { PALETTES } = await import('../src/sprites.js');

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function assert(c, m) { if (!c) throw new Error('ASSERT: ' + m); }

// ── jittery channel pair ─────────────────────────────────────────────────
function channelPair(rng, maxDelay) {
  let clock = 0;
  const mk = () => ({ inbox: [], onMessage: null, onClose: null, send: null, close: () => {} });
  const a = mk(), b = mk();
  a.send = (o) => b.inbox.push({ at: clock + (rng() * maxDelay | 0), m: JSON.parse(JSON.stringify(o)) });
  b.send = (o) => a.inbox.push({ at: clock + (rng() * maxDelay | 0), m: JSON.parse(JSON.stringify(o)) });
  const pump = () => {
    clock++;
    for (const ch of [a, b]) {
      ch.inbox.sort((x, y) => x.at - y.at);
      while (ch.inbox.length && ch.inbox[0].at <= clock) {
        ch.onMessage?.(ch.inbox.shift().m);
      }
    }
  };
  return { a, b, pump };
}

// scripted chaotic player input
function scriptedCmd(rng) {
  const dir = rng();
  return decodeCmd(
    (dir < 0.3 ? 1 : dir < 0.6 ? 2 : 0) |          // left/right
    (rng() < 0.04 ? 4 | 16 : 0) |                   // up + upPressed
    (rng() < 0.15 ? 8 : 0) |                        // down
    (rng() < 0.09 ? 32 | 256 : 0) |                 // lp
    (rng() < 0.07 ? 64 | 512 : 0) |                 // hp
    (rng() < 0.05 ? 128 | 1024 : 0),                // sp
  );
}

function hashState(game) {
  const f = game.fighters.map(c =>
    [c.x.toFixed(6), c.y.toFixed(6), c.vx.toFixed(6), c.vy.toFixed(6),
      c.hp, c.meter.toFixed(4), c.state, c.stateT, c.attack, c.facing,
      c.comboTaken, c.projCd].join(','));
  return f.join('|') + '|' + game.roundTimer.toFixed(6) + '|' + game.phase +
    '|' + game.round + '|' + game.projectiles.map(p => `${p.kind}:${p.x.toFixed(4)}`).join(',');
}

function runScenario({ name, maxDelay, hostRate, guestRate, ticks, seed }) {
  const rng = mulberry(seed);
  const { a, b, pump } = channelPair(rng, maxDelay);
  const audio = { sfx() {}, music() {}, onBeat() {}, ensure() { return false; } };

  const sessions = [new LockstepSession(a, true), new LockstepSession(b, false)];
  const sticky = [new StickyInput(), new StickyInput()];
  const inRng = [mulberry(seed ^ 0xAAAA), mulberry(seed ^ 0x5555)];
  const results = [null, null];
  const games = [0, 1].map(i => new Game({
    p1: { name: 'HOST', pal: PALETTES.neo, controller: new NetController(sessions[i], 0) },
    p2: { name: 'GUEST', pal: PALETTES.chibi, controller: new NetController(sessions[i], 1) },
    audio, seed: 12345,
    onMatchEnd: (r) => { results[i] = r; },
  }));

  const hashes = [new Map(), new Map()];
  let stalls = 0;
  for (let t = 0; t < ticks; t++) {
    pump();
    for (let i = 0; i < 2; i++) {
      const rate = i === 0 ? hostRate : guestRate;
      if (rng() > rate) continue;                 // this side skips a wall tick
      sticky[i].accumulate(scriptedCmd(inRng[i]));
      const s = sessions[i];
      if (results[i]) continue;
      if (s.canStep()) {
        s.captureLocal(sticky[i].capture());
        games[i].update();
        hashes[i].set(s.simFrame, hashState(games[i]));
        s.step();
      } else {
        s.stalled(); stalls++;
      }
    }
  }

  // compare every common frame
  let compared = 0, maxFrame = 0;
  for (const [f, h] of hashes[0]) {
    const h2 = hashes[1].get(f);
    if (h2 === undefined) continue;
    assert(h === h2, `${name}: DESYNC at frame ${f}\nHOST : ${h}\nGUEST: ${h2}`);
    compared++; maxFrame = Math.max(maxFrame, f);
  }
  assert(compared > ticks * 0.4, `${name}: too few frames compared (${compared})`);
  if (results[0] && results[1]) {
    assert(JSON.stringify(results[0]) === JSON.stringify(results[1]),
      `${name}: match results differ`);
  }
  console.log(`OK  ${name}: ${compared} frames identical (last=${maxFrame}, stalls=${stalls}` +
    `${results[0] ? `, match ended: ${results[0].winner}` : ''})`);
}

runScenario({ name: 'clean network        ', maxDelay: 1, hostRate: 1, guestRate: 1, ticks: 9000, seed: 1 });
runScenario({ name: 'mild jitter (0-3t)   ', maxDelay: 3, hostRate: 1, guestRate: 1, ticks: 9000, seed: 2 });
runScenario({ name: 'heavy jitter (0-8t)  ', maxDelay: 8, hostRate: 1, guestRate: 1, ticks: 9000, seed: 3 });
runScenario({ name: 'slow guest (90%)     ', maxDelay: 4, hostRate: 1, guestRate: 0.9, ticks: 9000, seed: 4 });
runScenario({ name: 'both unstable        ', maxDelay: 6, hostRate: 0.95, guestRate: 0.85, ticks: 12000, seed: 5 });

console.log('\nNETCODE: ALL SCENARIOS IN SYNC ✔');
