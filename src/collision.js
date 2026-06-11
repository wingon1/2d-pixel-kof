// ── AABB collision helpers ───────────────────────────────────────────────
// Boxes are { x, y, w, h } with x,y = top-left in world space.

export function aabb(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Convert a fighter-local box (defined facing right, origin = feet center)
// into a world-space box. Reuses a scratch object to avoid GC churn.
export function worldBox(out, local, originX, originY, facing) {
  if (facing > 0) out.x = originX + local.x;
  else out.x = originX - local.x - local.w;
  out.y = originY + local.y;
  out.w = local.w;
  out.h = local.h;
  return out;
}

export function overlapX(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  return right - left;
}

export function boxCenter(b) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}
