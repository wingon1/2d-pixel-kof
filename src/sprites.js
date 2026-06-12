// ── Procedural sprite baker ──────────────────────────────────────────────
// Every fighter sprite is drawn at runtime with fillRect into offscreen
// canvases (baked once per palette). Sprites are authored facing RIGHT
// with the anchor at the bottom-center of the 64x56 canvas: (32, 55).

export const SPR_W = 64, SPR_H = 56, ANCHOR_X = 32, ANCHOR_Y = 55;

export const PALETTES = {
  neo: {
    id: 'neo', name: 'NEON NEO',
    hair: '#3ee7ff', hairD: '#1690bf', skin: '#ffd9b3', skinD: '#e0ab78',
    gi: '#ff4fa0', giD: '#b62a72', belt: '#ffe14f', glove: '#ffe14f',
    shoe: '#f4f4ff', blush: '#ff9eb0', eye: '#1b1b2a', aura: '#7df9ff',
  },
  chibi: {
    id: 'chibi', name: 'CHRONO CHIBI',
    hair: '#ff9c3e', hairD: '#c96a16', skin: '#ffe2c2', skinD: '#e4b88c',
    gi: '#2fd9a8', giD: '#149a75', belt: '#ff5b5b', glove: '#ff5b5b',
    shoe: '#fff7e0', blush: '#ffb0a0', eye: '#241a12', aura: '#aaffd9',
  },
  neoAlt: {
    id: 'neoAlt', name: 'NEON NEO',
    hair: '#c08bff', hairD: '#8a55cc', skin: '#ffd9b3', skinD: '#e0ab78',
    gi: '#4f6dff', giD: '#2f44b6', belt: '#ffe14f', glove: '#ffe14f',
    shoe: '#f4f4ff', blush: '#ff9eb0', eye: '#1b1b2a', aura: '#cfa9ff',
  },
  chibiAlt: {
    id: 'chibiAlt', name: 'CHRONO CHIBI',
    hair: '#ffe34f', hairD: '#cfa916', skin: '#ffe2c2', skinD: '#e4b88c',
    gi: '#ff8a3e', giD: '#bf5a14', belt: '#3ec5ff', glove: '#3ec5ff',
    shoe: '#fff7e0', blush: '#ffb0a0', eye: '#241a12', aura: '#ffe9a0',
  },
};

export const ROSTER = [
  { id: 'neo', pal: PALETTES.neo, alt: PALETTES.neoAlt },
  { id: 'chibi', pal: PALETTES.chibi, alt: PALETTES.chibiAlt },
];

// ── primitives ───────────────────────────────────────────────────────────
function px(g, c, x, y, w, h) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function limb(g, c, x1, y1, x2, y2, th = 3) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    px(g, c, x1 + (x2 - x1) * t - (th >> 1), y1 + (y2 - y1) * t - (th >> 1), th, th);
  }
}

// ── body parts ───────────────────────────────────────────────────────────
// Fighters are CATS: furry head with pointy ears, muzzle, nose, whiskers.
function head(g, pal, cx, top, face = 'normal') {
  // ears (behind the head top edge)
  for (const ex of [cx - 9, cx + 4]) {
    px(g, pal.hair, ex, top - 2, 5, 3);
    px(g, pal.hair, ex + 1, top - 4, 3, 2);
    px(g, pal.blush, ex + 2, top - 3, 1, 3);          // inner ear
  }
  // furry skull
  px(g, pal.hair, cx - 10, top, 20, 16);
  px(g, pal.hairD, cx - 10, top + 15, 20, 1);          // chin shade
  px(g, pal.hairD, cx - 1, top + 1, 1, 3);             // forehead stripes
  px(g, pal.hairD, cx + 2, top + 1, 1, 3);
  // headband across the forehead
  px(g, pal.belt, cx - 10, top + 4, 20, 2);
  px(g, pal.belt, cx - 13, top + 3, 3, 2);             // knot
  px(g, pal.belt, cx - 12, top + 5, 2, 4);             // tail of knot
  // muzzle patch (light fur, biased toward facing)
  px(g, pal.skin, cx + 1, top + 10, 8, 5);
  // eyes biased toward facing (right)
  const e1x = cx + 0, e2x = cx + 6, ey = top + 7;
  if (face === 'blink' || face === 'hurt') {
    px(g, pal.eye, e1x, ey + 2, 3, 1); px(g, pal.eye, e2x, ey + 2, 3, 1);
  } else if (face === 'ko') {
    for (const ex of [e1x, e2x]) {
      px(g, pal.eye, ex, ey, 1, 1); px(g, pal.eye, ex + 2, ey, 1, 1);
      px(g, pal.eye, ex + 1, ey + 1, 1, 1);
      px(g, pal.eye, ex, ey + 2, 1, 1); px(g, pal.eye, ex + 2, ey + 2, 1, 1);
    }
  } else {
    // normal big sparkly eyes (also used for 'happy' — tiny ^^ eyes read badly)
    px(g, pal.eye, e1x, ey, 2, 3); px(g, pal.eye, e2x, ey, 2, 3);
    px(g, '#fff', e1x, ey, 1, 1); px(g, '#fff', e2x, ey, 1, 1);
    if (face === 'angry' || face === 'shout') {
      px(g, pal.eye, e1x - 1, ey - 1, 3, 1); px(g, pal.eye, e2x, ey - 1, 3, 1);
    }
  }
  px(g, pal.blush, cx - 3, top + 11, 2, 1);            // blush (left cheek;
  // right cheek is whisker territory — keeping it clean)
  // pink nose + whiskers
  px(g, '#ff7da0', cx + 4, top + 10, 2, 1);
  px(g, '#ffffff', cx - 13, top + 9, 3, 1);            // whiskers (left)
  px(g, '#ffffff', cx - 13, top + 12, 3, 1);
  px(g, '#ffffff', cx + 10, top + 9, 3, 1);            // whiskers (right)
  px(g, '#ffffff', cx + 10, top + 12, 3, 1);
  // cat mouth
  if (face === 'shout') px(g, '#7a2030', cx + 3, top + 12, 3, 3);
  else if (face === 'happy') {                          // :3
    px(g, '#7a2030', cx + 3, top + 13, 1, 1); px(g, '#7a2030', cx + 6, top + 13, 1, 1);
    px(g, '#7a2030', cx + 4, top + 12, 2, 1);
  } else if (face === 'hurt' || face === 'ko') px(g, '#7a2030', cx + 4, top + 13, 2, 2);
  else {                                                // ω
    px(g, '#7a2030', cx + 3, top + 13, 1, 1); px(g, '#7a2030', cx + 6, top + 13, 1, 1);
  }
}

// curling cat tail, attached behind the hip
function tail(g, pal, hx, hy, t = 0) {
  limb(g, pal.hair, hx, hy, hx - 6, hy - 6, 2);
  limb(g, pal.hair, hx - 6, hy - 6, hx - 8, hy - 12 - t, 2);
  px(g, pal.hairD, hx - 9, hy - 15 - t, 3, 3);          // darker tip
}

function torso(g, pal, cx, top, h = 12, w = 14) {
  px(g, pal.gi, cx - w / 2, top, w, h);
  px(g, pal.giD, cx - w / 2 + 1, top + h - 1, w - 1, 1);
  px(g, pal.belt, cx - w / 2, top + h - 4, w, 2);      // belt
  px(g, pal.giD, cx + w / 2 - 3, top + h - 4, 2, 4);   // belt knot
}

function arm(g, pal, sx, sy, hx, hy) {
  const mx = (sx + hx) / 2, my = (sy + hy) / 2;
  limb(g, pal.gi, sx, sy, mx, my, 3);                  // sleeve
  limb(g, pal.skin, mx, my, hx, hy, 3);                // forearm
  px(g, pal.glove, hx - 2, hy - 2, 5, 5);              // glove fist
  px(g, pal.giD, hx - 1, hy - 2, 1, 1);
}

function leg(g, pal, hx, hy, fx, fy, kx, ky) {
  if (kx !== undefined) {
    limb(g, pal.giD, hx, hy, kx, ky, 4);
    limb(g, pal.giD, kx, ky, fx, fy, 4);
  } else {
    limb(g, pal.giD, hx, hy, fx, fy, 4);
  }
  px(g, pal.shoe, fx - 2, fy - 2, 6, 3);               // shoe
}

// ── pose compositor ──────────────────────────────────────────────────────
// All standing-family poses share this. Options:
//  bob: vertical bounce px • lean: forward x shift of torso+head
//  legs: stand|walkA|walkB|walkC|lunge|wide|tuck|fall|kick|kneel
//  armF/armB: hand target name • face • crouch: boolean
const HANDS = {
  guard: [9, -19], guardB: [6, -17], windup: [-7, -21], punch: [18, -20],
  punchHi: [15, -31], lowPunch: [16, -8], palmIn: [5, -17], palmOut: [17, -18],
  palmOut2: [16, -15], raise: [-7, -46], flail: [-9, -27], down: [6, -7],
  cross: [9, -21], crossB: [8, -18], chargeUp: [10, -42], chargeUpB: [2, -43],
};

function stand(g, pal, o = {}) {
  const bob = o.bob || 0, lean = o.lean || 0;
  const crouch = !!o.crouch;
  const hipY = (crouch ? -7 : -13) + bob;
  const torsoH = crouch ? 9 : 12;
  const torsoTop = hipY - torsoH;
  const headTop = torsoTop - 16;
  const shF = [lean + 4, torsoTop + 3];                // front shoulder
  const shB = [lean - 4, torsoTop + 3];                // back shoulder
  const hF = HANDS[o.armF || 'guard'], hB = HANDS[o.armB || 'guardB'];

  // tail first (behind everything), wags with the idle bob
  tail(g, pal, lean - 6, hipY - 2, bob);

  // back arm (behind body)
  arm(g, pal, shB[0], shB[1], lean + hB[0] - 2, hB[1] + bob);

  // legs
  const L = o.legs || (crouch ? 'crouchLegs' : 'stand');
  if (L === 'stand') {
    leg(g, pal, -2, hipY, -6, 0); leg(g, pal, 2, hipY, 6, 0);
  } else if (L === 'walkA') {
    leg(g, pal, -2, hipY, -8, 0); leg(g, pal, 2, hipY, 7, -1, 5, hipY + 6);
  } else if (L === 'walkB') {
    leg(g, pal, -2, hipY, -3, 0); leg(g, pal, 2, hipY, 3, 0);
  } else if (L === 'walkC') {
    leg(g, pal, -2, hipY, 7, 0); leg(g, pal, 2, hipY, -7, -1, -1, hipY + 6);
  } else if (L === 'lunge') {
    leg(g, pal, -2, hipY, -11, 0); leg(g, pal, 2, hipY, 9, 0, 7, hipY + 5);
  } else if (L === 'wide') {
    leg(g, pal, -2, hipY, -9, 0); leg(g, pal, 2, hipY, 9, 0);
  } else if (L === 'tuck') {
    leg(g, pal, -2, hipY, -4, hipY + 8, -6, hipY + 5);
    leg(g, pal, 2, hipY, 4, hipY + 9, 7, hipY + 5);
  } else if (L === 'fall') {
    leg(g, pal, -2, hipY, -7, hipY + 10); leg(g, pal, 2, hipY, 6, hipY + 11);
  } else if (L === 'kick') {
    leg(g, pal, -2, hipY, -5, hipY + 9, -7, hipY + 4);
    leg(g, pal, 2, hipY, 14, hipY + 7);                 // extended kick
  } else if (L === 'kneel') {
    leg(g, pal, -2, hipY, -4, 0, -7, hipY + 4);
    leg(g, pal, 2, hipY, 6, 0, 3, -3);
  } else if (L === 'crouchLegs') {
    leg(g, pal, -3, hipY, -8, 0, -8, hipY + 3);
    leg(g, pal, 3, hipY, 8, 0, 8, hipY + 3);
  } else if (L === 'sweep') {
    leg(g, pal, -3, hipY, -8, 0, -8, hipY + 3);
    leg(g, pal, 3, hipY, 17, -1);                       // long low sweep
  }

  torso(g, pal, lean, torsoTop, torsoH);
  head(g, pal, lean + (o.headLean || 0), headTop + (o.headBob || 0), o.face);
  // front arm last (in front of body)
  arm(g, pal, shF[0], shF[1], lean + hF[0], hF[1] + bob);
}

function lying(g, pal, face = 'hurt') {
  // flat on back, head toward the LEFT (was knocked away from foe)
  px(g, pal.hair, 11, -6, 9, 3);                        // limp tail
  px(g, pal.hairD, 19, -7, 3, 3);
  px(g, pal.giD, -6, -8, 18, 5);                        // legs flat
  px(g, pal.shoe, 12, -8, 4, 3);
  px(g, pal.gi, -14, -9, 12, 6);                        // torso
  px(g, pal.belt, -5, -9, 2, 6);
  // furry head sideways + ear
  px(g, pal.hair, -27, -12, 15, 9);
  px(g, pal.hair, -27, -15, 3, 3);                      // ear up
  px(g, pal.blush, -26, -14, 1, 2);
  px(g, pal.belt, -29, -10, 2, 5);                      // headband knot
  px(g, pal.skin, -18, -8, 5, 4);                       // muzzle
  const ey = -9;
  if (face === 'ko') {
    px(g, pal.eye, -22, ey - 1, 1, 1); px(g, pal.eye, -20, ey - 1, 1, 1);
    px(g, pal.eye, -21, ey, 1, 1);
    px(g, pal.eye, -22, ey + 1, 1, 1); px(g, pal.eye, -20, ey + 1, 1, 1);
  } else {
    px(g, pal.eye, -22, ey, 3, 1);
  }
  px(g, '#ff7da0', -17, ey + 1, 2, 1);                  // nose
  px(g, '#ffffff', -13, ey + 1, 3, 1);                  // whisker
}

// ── pose table ───────────────────────────────────────────────────────────
const POSES = {
  idle0: (g, p) => stand(g, p, { bob: 0 }),
  idle1: (g, p) => stand(g, p, { bob: 1 }),
  idle2: (g, p) => stand(g, p, { bob: 1, headBob: 1 }),
  idle3: (g, p) => stand(g, p, { bob: 0, face: 'blink' }),
  walk0: (g, p) => stand(g, p, { legs: 'walkA', bob: 0 }),
  walk1: (g, p) => stand(g, p, { legs: 'walkB', bob: 1 }),
  walk2: (g, p) => stand(g, p, { legs: 'walkC', bob: 0 }),
  walk3: (g, p) => stand(g, p, { legs: 'walkB', bob: 1 }),
  crouch: (g, p) => stand(g, p, { crouch: true, armF: 'palmIn', face: 'normal' }),
  blockHi: (g, p) => stand(g, p, { armF: 'cross', armB: 'crossB', face: 'hurt', lean: -1 }),
  blockLo: (g, p) => stand(g, p, { crouch: true, armF: 'cross', armB: 'crossB', face: 'hurt', lean: -1 }),
  jumpUp: (g, p) => stand(g, p, { legs: 'tuck', armF: 'guard', armB: 'guardB', bob: -2 }),
  jumpFall: (g, p) => stand(g, p, { legs: 'fall', armF: 'palmOut2', armB: 'flail' }),
  jatk: (g, p) => stand(g, p, { legs: 'kick', armF: 'guard', armB: 'flail', face: 'angry' }),
  lightWind: (g, p) => stand(g, p, { armF: 'windup', face: 'angry', lean: 1 }),
  lightHit: (g, p) => stand(g, p, { armF: 'punch', face: 'angry', lean: 2, legs: 'walkB' }),
  heavyWind: (g, p) => stand(g, p, { armF: 'windup', armB: 'guardB', face: 'shout', lean: -3, legs: 'wide' }),
  heavyHit: (g, p) => stand(g, p, { armF: 'punch', face: 'shout', lean: 4, legs: 'lunge' }),
  punchHi: (g, p) => stand(g, p, { armF: 'punchHi', face: 'shout', lean: 1, legs: 'wide' }),
  clightHit: (g, p) => stand(g, p, { crouch: true, armF: 'lowPunch', face: 'angry', lean: 2 }),
  cheavyHit: (g, p) => stand(g, p, { crouch: true, legs: 'sweep', armF: 'down', face: 'shout', lean: 1 }),
  specialWind: (g, p) => stand(g, p, { armF: 'palmIn', armB: 'palmIn', face: 'shout', lean: -2 }),
  specialHit: (g, p) => stand(g, p, { armF: 'palmOut', armB: 'palmOut2', face: 'shout', lean: 3, legs: 'lunge' }),
  superPose: (g, p) => stand(g, p, { armF: 'chargeUp', armB: 'chargeUpB', face: 'shout', legs: 'wide' }),
  hitHi: (g, p) => stand(g, p, { armF: 'flail', armB: 'down', face: 'hurt', lean: -4, headLean: -2, legs: 'walkB' }),
  hitLo: (g, p) => stand(g, p, { armF: 'down', armB: 'down', face: 'hurt', lean: 3, headLean: 4, crouch: true }),
  knockdown: (g, p) => lying(g, p, 'hurt'),
  ko: (g, p) => lying(g, p, 'ko'),
  getup: (g, p) => stand(g, p, { legs: 'kneel', armF: 'down', face: 'hurt', crouch: true }),
  // raised paw goes on the BACK arm so it never covers the face
  victory0: (g, p) => stand(g, p, { armF: 'guard', armB: 'raise', face: 'happy' }),
  victory1: (g, p) => stand(g, p, { armF: 'guard', armB: 'raise', face: 'happy', bob: -2, legs: 'walkB' }),
};

export const POSE_NAMES = Object.keys(POSES);

// ── baking ───────────────────────────────────────────────────────────────
function bakeCanvas(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g);
  return c;
}

export function bakeFighter(pal) {
  const poses = {};
  for (const name of POSE_NAMES) {
    poses[name] = bakeCanvas(SPR_W, SPR_H, (g) => {
      g.translate(ANCHOR_X, ANCHOR_Y);
      POSES[name](g, pal);
    });
  }
  // white-flash variants for hit feedback
  const flash = {};
  for (const name of ['hitHi', 'hitLo', 'knockdown']) {
    flash[name] = bakeCanvas(SPR_W, SPR_H, (g) => {
      g.translate(ANCHOR_X, ANCHOR_Y);
      POSES[name](g, pal);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#ffffff';
      g.fillRect(-ANCHOR_X, -ANCHOR_Y, SPR_W, SPR_H);
    });
  }
  return { poses, flash, portrait: bakePortrait(pal), pal };
}

export function bakePortrait(pal) {
  return bakeCanvas(28, 26, (g) => {
    g.translate(14, 25);
    head(g, pal, 0, -21, 'normal');
  });
}

// Projectile sprites: cute spinning energy star (2 frames) + big super orb.
export function bakeProjectile(pal, big = false) {
  const s = big ? 32 : 14;
  const frames = [];
  for (let f = 0; f < 2; f++) {
    frames.push(bakeCanvas(s, s, (g) => {
      const c = s / 2;
      const r1 = big ? 13 : 6, r2 = big ? 8 : 3;
      // diamond core
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const d = Math.abs(x - c + 0.5) + Math.abs(y - c + 0.5);
        if (d < r2) px(g, '#ffffff', x, y, 1, 1);
        else if (d < r1 - (f ? 1 : 0)) px(g, pal.aura, x, y, 1, 1);
      }
      // sparkle tips
      const tip = f ? r1 : r1 - 2;
      px(g, '#fff', c + tip - 1, c, 1, 1); px(g, '#fff', c - tip, c, 1, 1);
      px(g, '#fff', c, c + tip - 1, 1, 1); px(g, '#fff', c, c - tip, 1, 1);
    }));
  }
  return frames;
}
