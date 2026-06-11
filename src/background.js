// ── Procedural parallax arena: "SUNSET CIRCUIT PARK" ─────────────────────
// All layers baked at runtime; clouds drift on sine waves; the pixel crowd
// bounces to the music beat.

import { VIEW_W, VIEW_H, FLOOR_Y } from './constants.js';

function bake(w, h, fn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  fn(g);
  return c;
}
function rnd(seed) { // deterministic LCG for stable arena layout
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Background {
  constructor() {
    const W = VIEW_W + 80; // extra width for parallax slide
    this.W = W;
    this.beatPulse = 0;
    this.t = 0;

    // sky with sunset bands
    this.sky = bake(VIEW_W, VIEW_H, (g) => {
      const bands = ['#2a1a5e', '#3a2470', '#553584', '#8a4a8f', '#c46a8a', '#f0936f'];
      const bh = Math.ceil(150 / bands.length);
      bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * bh, VIEW_W, bh + 1); });
      g.fillStyle = '#f0936f'; g.fillRect(0, 140, VIEW_W, VIEW_H - 140);
      // sun
      g.fillStyle = '#ffd98a';
      for (let r = 16; r > 0; r--) g.fillRect(240 - r, 96 - Math.round(Math.sqrt(256 - r * r) * 0.6), r * 2, 2 * Math.round(Math.sqrt(256 - r * r) * 0.6));
      g.fillStyle = '#fff0c0'; g.fillRect(232, 88, 16, 10);
      // twinkle stars (top)
      const r = rnd(7);
      g.fillStyle = '#e8d9ff';
      for (let i = 0; i < 28; i++) g.fillRect((r() * VIEW_W) | 0, (r() * 60) | 0, 1, 1);
    });

    // far skyline silhouette (factor .15)
    this.far = bake(W, 120, (g) => {
      const r = rnd(13);
      let x = 0;
      while (x < W) {
        const bw = 18 + (r() * 30 | 0), bh = 30 + (r() * 70 | 0);
        g.fillStyle = '#3a2a6a';
        g.fillRect(x, 120 - bh, bw, bh);
        g.fillStyle = '#574099';
        for (let wy = 120 - bh + 4; wy < 114; wy += 7)
          for (let wx = x + 3; wx < x + bw - 3; wx += 6)
            if (r() < 0.5) g.fillRect(wx, wy, 2, 3);
        x += bw + 2 + (r() * 8 | 0);
      }
    });

    // mid layer: neon buildings + trees (factor .4)
    this.mid = bake(W, 110, (g) => {
      const r = rnd(99);
      const neon = ['#ff4fa0', '#3ee7ff', '#ffe14f', '#7dff8a'];
      let x = 6;
      while (x < W - 50) {
        if (r() < 0.55) { // neon shop
          const bw = 40 + (r() * 26 | 0), bh = 44 + (r() * 30 | 0);
          g.fillStyle = '#241a4e'; g.fillRect(x, 110 - bh, bw, bh);
          g.fillStyle = '#16103a'; g.fillRect(x + 3, 110 - bh + 3, bw - 6, 8);
          const nc = neon[(r() * neon.length) | 0];
          g.fillStyle = nc;
          g.fillRect(x + 5, 110 - bh + 5, bw - 10, 4); // sign
          for (let wy = 110 - bh + 16; wy < 102; wy += 8)
            for (let wx = x + 4; wx < x + bw - 5; wx += 7) {
              g.fillStyle = r() < 0.6 ? '#ffd98a' : '#241a4e';
              g.fillRect(wx, wy, 3, 4);
            }
          x += bw + 4;
        } else { // cute round tree
          const th = 26 + (r() * 14 | 0);
          g.fillStyle = '#6a4030'; g.fillRect(x + 9, 110 - th + 14, 4, th - 14);
          g.fillStyle = '#2fae6a';
          g.fillRect(x + 2, 110 - th, 18, 14);
          g.fillRect(x + 5, 110 - th - 4, 12, 6);
          g.fillStyle = '#5ad98a';
          g.fillRect(x + 4, 110 - th + 2, 6, 4);
          x += 26 + (r() * 10 | 0);
        }
      }
    });

    // crowd: two baked frames (bounce up / down)
    this.crowd = [0, 1].map(f => bake(W, 26, (g) => {
      const r = rnd(555);
      const cols = ['#ff8a5e', '#5ecfff', '#ffd95e', '#b08aff', '#7dff8a', '#ff7da0'];
      for (let x = 4; x < W - 8; x += 11) {
        const phase = r() < 0.5 ? 0 : 1;
        const up = (phase === f) ? 2 : 0;
        const c = cols[(r() * cols.length) | 0];
        const sk = r() < 0.5 ? '#ffd9b3' : '#c98a5a';
        g.fillStyle = c; g.fillRect(x, 12 - up, 9, 14);           // body
        g.fillStyle = sk; g.fillRect(x + 1, 4 - up, 7, 8);        // head
        g.fillStyle = '#241a30'; g.fillRect(x + 2, 6 - up, 1, 2); // eyes
        g.fillRect(x + 6, 6 - up, 1, 2);
        if (up) { g.fillStyle = sk; g.fillRect(x - 1, 8, 2, 3); g.fillRect(x + 8, 8, 2, 3); } // arms up
      }
    }));

    // barrier in front of crowd
    this.barrier = bake(W, 8, (g) => {
      g.fillStyle = '#cf4a6a'; g.fillRect(0, 0, W, 8);
      g.fillStyle = '#ffffff';
      for (let x = 0; x < W; x += 22) g.fillRect(x, 2, 11, 4);
      g.fillStyle = '#8a2040'; g.fillRect(0, 6, W, 2);
    });

    // floor tiles
    this.floor = bake(W, VIEW_H - FLOOR_Y + 24, (g) => {
      const h = VIEW_H - FLOOR_Y + 24;
      g.fillStyle = '#4a3a7a'; g.fillRect(0, 0, W, h);
      g.fillStyle = '#5a4a92';
      for (let y = 0; y < h; y += 8)
        for (let x = (y % 16) ? 12 : 0; x < W; x += 24) g.fillRect(x, y, 12, 4);
      g.fillStyle = '#7a66c0'; g.fillRect(0, 0, W, 2); // edge highlight
      g.fillStyle = '#2a2050'; g.fillRect(0, 2, W, 1);
    });

    // drifting clouds
    const r = rnd(31);
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      this.clouds.push({
        x: r() * VIEW_W, y: 18 + r() * 60, w: 30 + r() * 40 | 0,
        speed: 0.08 + r() * 0.12, phase: r() * Math.PI * 2,
      });
    }
  }

  beat() { this.beatPulse = 1; }

  update() {
    this.t++;
    this.beatPulse *= 0.92;
    for (const c of this.clouds) {
      c.x += c.speed;
      if (c.x > VIEW_W + 60) c.x = -c.w - 20;
    }
  }

  draw(ctx, midX) {
    const off = (midX - VIEW_W / 2); // parallax driver
    ctx.drawImage(this.sky, 0, 0);
    // clouds
    for (const c of this.clouds) {
      const cy = Math.round(c.y + Math.sin(this.t / 90 + c.phase) * 3);
      const cx = Math.round(c.x - off * 0.1);
      ctx.fillStyle = '#ffe9efcc';
      ctx.fillStyle = '#ffeaf2';
      ctx.fillRect(cx, cy, c.w, 7);
      ctx.fillRect(cx + 5, cy - 4, c.w - 14, 5);
      ctx.fillRect(cx + 3, cy + 7, c.w - 8, 3);
    }
    ctx.drawImage(this.far, Math.round(-40 - off * 0.15), 60);
    ctx.drawImage(this.mid, Math.round(-40 - off * 0.4), FLOOR_Y - 124);
    // crowd bounces to the beat
    const frame = this.beatPulse > 0.45 ? 1 : 0;
    ctx.drawImage(this.crowd[frame], Math.round(-40 - off * 0.6), FLOOR_Y - 38);
    ctx.drawImage(this.barrier, Math.round(-40 - off * 0.6), FLOOR_Y - 14);
    ctx.drawImage(this.floor, Math.round(-40 - off * 0.8), FLOOR_Y - 6);
  }
}
