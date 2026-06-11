// Headless engine playtest: runs full AI-vs-AI matches in Node with DOM
// stubs and asserts core invariants (no phasing, wall bounds, sane HP,
// combos, match completion). Run: node scripts/headless-test.mjs
/* eslint-disable no-console */

// ── DOM / canvas stubs ───────────────────────────────────────────────────
function makeCtx() {
  return new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => makeCtx() }),
};
globalThis.window = {
  addEventListener: () => {},
  innerWidth: 960, innerHeight: 540,
};

const { Game } = await import('../src/game.js');
const { makeAIController } = await import('../src/ai.js');
const { PALETTES } = await import('../src/sprites.js');
const { WALL_L, WALL_R, MAX_HP, PUSH_W } = await import('../src/constants.js');

const audioStub = { sfx() {}, music() {}, onBeat() {}, ensure() { return false; } };

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

function runMatch(l1, l2, maxTicks = 60 * 600) {
  let result = null;
  const game = new Game({
    p1: { name: 'P1', pal: PALETTES.neo, controller: makeAIController(l1) },
    p2: { name: 'P2', pal: PALETTES.chibi, controller: makeAIController(l2) },
    audio: audioStub,
    onMatchEnd: (r) => { result = r; },
  });
  let maxComboSeen = 0, maxProj = 0, minGap = 999, supers = 0, hits = 0;
  let prevPhase = game.phase;
  let ticks = 0;
  for (; ticks < maxTicks && !result; ticks++) {
    const prevHp = game.fighters.map(f => f.hp);
    game.update();
    const [a, b] = game.fighters;
    for (const f of [a, b]) {
      assert(f.x >= WALL_L + PUSH_W / 2 - 1.5 && f.x <= WALL_R - PUSH_W / 2 + 1.5,
        `wall bound violated x=${f.x.toFixed(1)} tick=${ticks}`);
      assert(f.hp >= 0 && f.hp <= MAX_HP, `hp out of range ${f.hp}`);
      assert(Number.isFinite(f.x) && Number.isFinite(f.y), 'NaN position');
      maxComboSeen = Math.max(maxComboSeen, f.comboTaken);
    }
    // pushbox check: grounded, both standing-ish → never deeply overlapped
    if (!a.airborne && !b.airborne && a.state !== 'ko' && b.state !== 'ko' &&
        a.state !== 'knockdown' && b.state !== 'knockdown' && game.phase === 'fight') {
      minGap = Math.min(minGap, Math.abs(a.x - b.x));
    }
    maxProj = Math.max(maxProj, game.projectiles.length);
    assert(game.projectiles.length <= 4, 'projectile leak');
    if (game.superFlash && prevPhase) supers++;
    if (game.fighters.some((f, i) => f.hp < prevHp[i])) hits++;
    prevPhase = game.phase;
    assert(maxComboSeen <= 40, 'combo counter glitch');
  }
  return { result, ticks, minGap, maxProj, maxComboSeen, hits };
}

const matchups = [[1, 1], [1, 2], [2, 2], [1, 3], [3, 3], [2, 3]];
let pass = 0;
for (const [l1, l2] of matchups) {
  const r = runMatch(l1, l2);
  assert(r.result, `match L${l1} vs L${l2} never ended (${r.ticks} ticks)`);
  assert(r.hits > 0, `no hits landed in L${l1} vs L${l2}`);
  assert(r.minGap > PUSH_W * 0.45, `fighters phased: minGap=${r.minGap.toFixed(1)}`);
  console.log(
    `OK  L${l1} vs L${l2}: winner=${r.result.winner.padEnd(6)} ` +
    `ticks=${String(r.ticks).padStart(6)} (${(r.ticks / 60).toFixed(0)}s) ` +
    `hits=${String(r.hits).padStart(3)} maxCombo=${r.maxComboSeen} ` +
    `minGap=${r.minGap.toFixed(1)} maxProj=${r.maxProj} ` +
    `dmg=[${r.result.stats.map(s => s.damage).join(',')}]`,
  );
  pass++;
}

// difficulty scaling sanity: L3 should beat L1 most of the time
let l3wins = 0;
const N = 9;
for (let i = 0; i < N; i++) {
  const r = runMatch(1, 3);
  if (r.result && r.result.winnerIndex === 1) l3wins++;
}
console.log(`L3 vs L1 win rate: ${l3wins}/${N}`);
if (l3wins < Math.ceil(N * 0.6)) throw new Error('Boss AI too weak vs Chibi AI');

console.log(`\nALL ${pass} MATCHUPS PASSED ✔`);
