// ── Boot + fixed-timestep core loop (60 logic ticks/sec, any refresh) ────
import { VIEW_W, VIEW_H } from './constants.js';
import { initInput, tickInput, makeHumanController, P1_KEYS, P2_KEYS, wasPressed } from './input.js';
import { Renderer } from './renderer.js';
import { AudioEngine } from './audio.js';
import { Menu } from './menu.js';
import { Game } from './game.js';
import { makeAIController } from './ai.js';
import { drawTextShadow, drawText } from './font.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
initInput(window);

const audio = new AudioEngine();
const menu = new Menu(audio);

let appState = 'menu'; // 'menu' | 'game'
let game = null;
let lastConfig = null;
let paused = false;

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
      menu.showResults(result);
    },
  });
  appState = 'game';
  paused = false;
  audio.music('battle');
}

// ── logic tick ───────────────────────────────────────────────────────────
function tick() {
  tickInput();
  if (wasPressed('KeyM')) audio.toggleMute();

  if (appState === 'menu') {
    const action = menu.update();
    if (action?.type === 'start') startGame(action);
    else if (action?.type === 'rematch' && lastConfig) startGame(lastConfig);
    return;
  }

  // in-game
  if (wasPressed('Escape')) {
    paused = !paused;
    audio.sfx('select');
  }
  if (paused) {
    if (wasPressed('KeyT')) { // quit to title
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
  if (appState === 'menu' || !game) menu.draw(ctx);
  else {
    game.draw(ctx, renderer);
    if (paused) {
      ctx.fillStyle = 'rgba(8,4,26,0.7)';
      ctx.fillRect(-8, -8, VIEW_W + 16, VIEW_H + 16);
      drawTextShadow(ctx, 'PAUSED', VIEW_W / 2, 110, '#ffe14f', 4, 'center');
      drawText(ctx, 'ESC: RESUME   T: QUIT TO TITLE   M: MUTE', VIEW_W / 2, 156, '#fff', 1, 'center');
    }
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
