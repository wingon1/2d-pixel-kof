// ── Global tuning constants ──────────────────────────────────────────────
export const VIEW_W = 480;
export const VIEW_H = 270;
export const FLOOR_Y = 232;          // ground line (feet y)
export const WALL_L = 14;            // stage walls
export const WALL_R = VIEW_W - 14;

export const GRAVITY = 0.42;
export const WALK_SPEED = 1.55;
export const BACK_SPEED = 1.25;
export const JUMP_VY = -7.6;
export const JUMP_VX = 1.9;

export const MAX_HP = 100;
export const MAX_METER = 100;
export const SUPER_COST = 100;
export const ROUND_TIME = 99;        // seconds
export const ROUNDS_TO_WIN = 2;      // best of 3

// Attack levels (block rules)
export const LV_MID = 'mid';   // blocked standing-back OR crouch-back
export const LV_LOW = 'low';   // blocked crouch-back only
export const LV_HIGH = 'high'; // blocked standing-back only (jump-ins)

// Fighter logical body size
export const PUSH_W = 18;
export const PUSH_H = 36;
export const CROUCH_H = 24;

// Combo damage scaling
export function comboScale(hitIndex) {
  return Math.max(0.5, 1 - 0.08 * hitIndex);
}
