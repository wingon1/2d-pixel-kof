// Visual render test: draws real frames (menus + gameplay) with
// @napi-rs/canvas and writes PNG screenshots for inspection.
// Run: node scripts/render-test.mjs <module-dir-with-@napi-rs/canvas> <outdir>
import { createRequire } from 'module';

const modDir = process.argv[2] || '/tmp/rt';
const outDir = process.argv[3] || '/tmp/shots';
const require2 = createRequire(modDir + '/package.json');
const { createCanvas } = require2('@napi-rs/canvas');
const fs = await import('fs');

globalThis.document = {
  createElement: (tag) => {
    const c = createCanvas(1, 1);
    c.style = {};
    return c;
  },
};
globalThis.window = {
  addEventListener: () => {},
  innerWidth: 960, innerHeight: 540,
  requestAnimationFrame: () => {},
};

const { Game } = await import('../src/game.js');
const { makeAIController } = await import('../src/ai.js');
const { PALETTES } = await import('../src/sprites.js');
const { Menu } = await import('../src/menu.js');
const { VIEW_W, VIEW_H } = await import('../src/constants.js');

const audioStub = { sfx() {}, music() {}, onBeat() {}, ensure() { return true; }, toggleMute() {} };

const screen = createCanvas(VIEW_W, VIEW_H);
const ctx = screen.getContext('2d');
ctx.imageSmoothingEnabled = false;

const rendererStub = {
  drawShadow(c, f) {
    const w = Math.max(6, 16 - Math.max(0, 232 - f.y) * 0.06);
    c.fillStyle = 'rgba(20,12,40,0.45)';
    c.fillRect(Math.round(f.x - w / 2), 231, Math.round(w), 3);
  },
  drawFighter(c, f) {
    const pose = f.getPose();
    const set = (f.flashT > 0 && f.sprites.flash[pose]) ? f.sprites.flash : f.sprites.poses;
    const img = set[pose] || f.sprites.poses.idle0;
    const x = Math.round(f.x), y = Math.round(f.y);
    if (f.facing < 0) {
      c.save(); c.translate(x, 0); c.scale(-1, 1);
      c.drawImage(img, -32, y - 55); c.restore();
    } else c.drawImage(img, x - 32, y - 55);
  },
};

fs.mkdirSync(outDir, { recursive: true });
const save = (name) => fs.writeFileSync(`${outDir}/${name}.png`, screen.toBuffer('image/png'));

// 1) menus
const menu = new Menu(audioStub);
for (let i = 0; i < 30; i++) { menu.t++; }
menu.draw(ctx); save('01-title');
menu.go('mode'); menu.t = 20; menu.draw(ctx); save('02-mode');
menu.go('difficulty'); menu.t = 20; menu.sel = 2; menu.draw(ctx); save('03-difficulty');
menu.startCharSelect(); menu.t = 20; menu.draw(ctx); save('04-charselect');
menu.go('controls'); menu.draw(ctx); save('05-controls');
// online screens
menu.go('online'); menu.t = 20; menu.draw(ctx); save('10-online');
menu.go('joinCode'); menu.joinSlots = ['K', 'A', 'T', '']; menu.joinCursor = 3;
menu.t = 20; menu.draw(ctx); save('11-joincode');
// mobile variants
menu.touchMode = true;
menu.go('mode'); menu.sel = 1; menu.t = 20; menu.draw(ctx); save('14-mode-mobile');
menu.go('joinCode'); menu.t = 20; menu.draw(ctx); save('15-joincode-mobile');
menu.touchMode = false;
menu.go('netwait'); menu.netCode = 'MRWZ'; menu.netDone = false;
menu.netLines = ['WAITING FOR YOUR FRIEND']; menu.t = 20; menu.draw(ctx); save('12-room');
menu.go('netchar');
menu.netChar = { cursor: 0, locked: true, remoteLocked: true, remoteChar: 1, isHost: true };
menu.t = 20; menu.draw(ctx); save('13-netchar');

// 2) gameplay frames
const game = new Game({
  p1: { name: 'NEON NEO', pal: PALETTES.neo, controller: makeAIController(3) },
  p2: { name: 'CHRONO CHIBI', pal: PALETTES.chibi, controller: makeAIController(3) },
  audio: audioStub, onMatchEnd: () => {},
});
let shots = 0;
let lastShotAt = -999;
for (let t = 0; t < 60 * 60 && shots < 4; t++) {
  game.update();
  const interesting =
    (game.hitstop > 2 && t - lastShotAt > 120) ||
    (game.superFlash && t - lastShotAt > 120);
  if (t === 30) { game.draw(ctx, rendererStub); save('06-round-intro'); }
  if (t === 95) { game.draw(ctx, rendererStub); save('07-fight'); }
  if (interesting) {
    game.draw(ctx, rendererStub);
    save(`08-action-${shots}`);
    shots++; lastShotAt = t;
  }
}
// results screen
menu.showResults({
  winner: 'NEON NEO', winnerIndex: 0,
  stats: [
    { name: 'NEON NEO', damage: 248, maxCombo: 4, perfects: 1, rounds: 2 },
    { name: 'CHRONO CHIBI', damage: 167, maxCombo: 3, perfects: 0, rounds: 1 },
  ],
});
menu.t = 20; menu.draw(ctx); save('09-results');
console.log('screens written to ' + outDir);
