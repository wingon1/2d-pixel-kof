// ── Mobile touch controls: floating 8-way stick + arcade buttons ─────────
// Buttons simply inject P1 key state via input.virtualKey(), so the whole
// game (menus, gameplay, online) works untouched. Shown only on touch
// devices. The stick also emits Arrow keys for menu/code-entry navigation.
import { virtualKey } from './input.js';

export function isTouchDevice() {
  return (typeof window !== 'undefined') &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);
}

const CSS = `
#touch-ui { position: fixed; inset: 0; pointer-events: none; z-index: 10;
  font-family: monospace; -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none; }
#touch-ui .tb { position: absolute; pointer-events: auto; border-radius: 50%;
  background: rgba(60,40,120,0.42); border: 2px solid rgba(255,255,255,0.5);
  color: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: bold; touch-action: none; }
#touch-ui .tb.on { background: rgba(255,79,160,0.65); border-color: #ffe14f; }
#touch-ui .pill { border-radius: 14px; font-size: 11px; padding: 0;
  width: 74px; height: 30px; }
#stick-zone { position: absolute; left: 0; bottom: 0; width: 44vw; height: 70vh;
  pointer-events: auto; touch-action: none; }
#stick-base { position: absolute; width: 96px; height: 96px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.4); background: rgba(40,28,84,0.35);
  display: none; transform: translate(-50%,-50%); }
#stick-knob { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px;
  border-radius: 50%; background: rgba(255,255,255,0.55);
  transform: translate(-50%,-50%); }
`;

export function initTouch(audio) {
  if (!isTouchDevice()) return false;

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'touch-ui';
  root.innerHTML = `
    <div id="stick-zone"><div id="stick-base"><div id="stick-knob"></div></div></div>
    <div class="tb" id="b-lp" style="right:128px; bottom:24px;  width:62px; height:62px; font-size:15px;">LP</div>
    <div class="tb" id="b-hp" style="right:78px;  bottom:88px;  width:62px; height:62px; font-size:15px;">HP</div>
    <div class="tb" id="b-sp" style="right:14px;  bottom:42px;  width:62px; height:62px; font-size:15px;">SP</div>
    <div class="tb" id="b-su" style="right:150px; bottom:96px;  width:52px; height:52px; font-size:18px; border-color:#ffe14f;">&#9733;</div>
    <div class="tb pill" id="b-start" style="right:14px; top:10px;">START</div>
    <div class="tb pill" id="b-back"  style="right:96px; top:10px;">BACK</div>
  `;
  document.body.appendChild(root);

  let audioUnlocked = false;
  const unlock = () => {
    if (!audioUnlocked) { audioUnlocked = true; audio.ensure(); }
  };

  // ── buttons ──
  const bind = (id, downFn, upFn) => {
    const el = root.querySelector(id);
    el.addEventListener('touchstart', (e) => {
      e.preventDefault(); unlock();
      el.classList.add('on');
      downFn();
    }, { passive: false });
    const up = (e) => { e.preventDefault(); el.classList.remove('on'); upFn(); };
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  };
  const keyBtn = (id, ...codes) => bind(id,
    () => codes.forEach(c => virtualKey(c, true)),
    () => codes.forEach(c => virtualKey(c, false)));

  keyBtn('#b-lp', 'KeyJ');
  keyBtn('#b-hp', 'KeyK');
  keyBtn('#b-sp', 'KeyL');
  keyBtn('#b-su', 'KeyK', 'KeyL');     // SUPER = HP+SP together
  keyBtn('#b-start', 'Enter');
  keyBtn('#b-back', 'Escape');

  // ── floating stick (8-way, rectangular axes → natural diagonals) ──
  const zone = root.querySelector('#stick-zone');
  const base = root.querySelector('#stick-base');
  const knob = root.querySelector('#stick-knob');
  let stickId = null;
  let origin = { x: 0, y: 0 };
  const DIRS = {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  };
  const state = { left: false, right: false, up: false, down: false };
  const setDir = (d, on) => {
    if (state[d] === on) return;
    state[d] = on;
    DIRS[d].forEach(c => virtualKey(c, on));
  };
  const releaseAll = () => Object.keys(state).forEach(d => setDir(d, false));

  const updateStick = (t) => {
    const dx = t.clientX - origin.x, dy = t.clientY - origin.y;
    const TH = 16, TH_UP = 24;          // stricter up: avoid accidental jumps
    setDir('left', dx < -TH);
    setDir('right', dx > TH);
    setDir('up', dy < -TH_UP);
    setDir('down', dy > TH);
    const cl = (v) => Math.max(-40, Math.min(40, v));
    knob.style.transform = `translate(calc(-50% + ${cl(dx)}px), calc(-50% + ${cl(dy)}px))`;
  };

  zone.addEventListener('touchstart', (e) => {
    e.preventDefault(); unlock();
    if (stickId !== null) return;
    const t = e.changedTouches[0];
    stickId = t.identifier;
    origin = { x: t.clientX, y: t.clientY };
    base.style.display = 'block';
    base.style.left = `${t.clientX}px`;
    base.style.top = `${t.clientY}px`;
    updateStick(t);
  }, { passive: false });

  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) updateStick(t);
    }
  }, { passive: false });

  const endStick = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        stickId = null;
        releaseAll();
        base.style.display = 'none';
        knob.style.transform = 'translate(-50%,-50%)';
      }
    }
  };
  zone.addEventListener('touchend', endStick, { passive: false });
  zone.addEventListener('touchcancel', endStick, { passive: false });

  // stop pinch zoom / pull-to-refresh anywhere else
  document.body.addEventListener('touchmove', (e) => {
    if (e.target === document.body || e.target.id === 'game') e.preventDefault();
  }, { passive: false });

  return true;
}
