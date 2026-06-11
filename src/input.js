// ── Keyboard input: per-tick edge detection on a fixed timestep ──────────
// Physical key state is sampled asynchronously; pressed-edges are latched
// so a tap between ticks is never lost.

const held = new Set();
const latched = new Set();   // keys that went down since last tick consume
let pressedThisTick = new Set();

export function initInput(target = window) {
  target.addEventListener('keydown', (e) => {
    if (KEYS_USED.has(e.code)) e.preventDefault();
    if (!held.has(e.code)) latched.add(e.code);
    held.add(e.code);
  });
  target.addEventListener('keyup', (e) => {
    if (KEYS_USED.has(e.code)) e.preventDefault();
    held.delete(e.code);
  });
  window.addEventListener('blur', () => { held.clear(); latched.clear(); });
}

// Call once per logic tick BEFORE polling controllers.
export function tickInput() {
  pressedThisTick = latched.size ? new Set(latched) : EMPTY;
  latched.clear();
}
const EMPTY = new Set();

export const isHeld = (code) => held.has(code);
export const wasPressed = (code) => pressedThisTick.has(code);

// ── Bindings ─────────────────────────────────────────────────────────────
export const P1_KEYS = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  lp: ['KeyJ'], hp: ['KeyK'], sp: ['KeyL'],
};
export const P2_KEYS = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  lp: ['Numpad1', 'Comma'], hp: ['Numpad2', 'Period'], sp: ['Numpad3', 'Slash'],
};

const KEYS_USED = new Set([
  ...Object.values(P1_KEYS).flat(),
  ...Object.values(P2_KEYS).flat(),
  'Enter', 'Space', 'Escape',
]);

function anyHeld(codes) { return codes.some(isHeld); }
function anyPressed(codes) { return codes.some(wasPressed); }

// A controller produces the same command shape whether human or AI.
export function makeHumanController(map) {
  return {
    human: true,
    poll() {
      return {
        left: anyHeld(map.left), right: anyHeld(map.right),
        up: anyHeld(map.up), down: anyHeld(map.down),
        upPressed: anyPressed(map.up),
        lp: anyPressed(map.lp), hp: anyPressed(map.hp), sp: anyPressed(map.sp),
        lpHeld: anyHeld(map.lp), hpHeld: anyHeld(map.hp), spHeld: anyHeld(map.sp),
      };
    },
  };
}

export const NULL_CMD = {
  left: false, right: false, up: false, down: false, upPressed: false,
  lp: false, hp: false, sp: false, lpHeld: false, hpHeld: false, spHeld: false,
};

// Menu helpers
export const menuKey = {
  up: () => wasPressed('KeyW') || wasPressed('ArrowUp'),
  down: () => wasPressed('KeyS') || wasPressed('ArrowDown'),
  left: () => wasPressed('KeyA') || wasPressed('ArrowLeft'),
  right: () => wasPressed('KeyD') || wasPressed('ArrowRight'),
  confirm: () => wasPressed('Enter') || wasPressed('KeyJ') || wasPressed('Space') || wasPressed('Numpad1'),
  back: () => wasPressed('Escape') || wasPressed('KeyK') || wasPressed('Numpad2'),
};
