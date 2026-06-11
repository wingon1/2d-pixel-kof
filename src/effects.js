// ── Visual juice: pooled particles, hit sparks, dust, KO rays ────────────
// Fixed-size pool: zero allocation during combat.

const POOL_SIZE = 320;

export class Effects {
  constructor() {
    this.pool = Array.from({ length: POOL_SIZE }, () => ({
      active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0,
      color: '#fff', size: 1, grav: 0, type: 'px',
    }));
    this.cursor = 0;
  }

  spawn(props) {
    const p = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % POOL_SIZE;
    p.active = true;
    p.x = props.x; p.y = props.y;
    p.vx = props.vx || 0; p.vy = props.vy || 0;
    p.life = p.maxLife = props.life || 20;
    p.color = props.color || '#fff';
    p.size = props.size || 2;
    p.grav = props.grav ?? 0;
    p.type = props.type || 'px';
    return p;
  }

  // Star-burst hit spark
  hitSpark(x, y, heavy, color = '#ffe14f') {
    const n = heavy ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const sp = (heavy ? 2.8 : 1.8) * (0.5 + Math.random() * 0.8);
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: heavy ? 18 : 12, color: Math.random() < 0.5 ? color : '#ffffff',
        size: heavy ? 3 : 2, grav: 0.04,
      });
    }
    this.spawn({ x, y, life: heavy ? 8 : 5, type: 'flash', size: heavy ? 14 : 9, color: '#ffffff' });
  }

  blockSpark(x, y) {
    for (let i = 0; i < 6; i++) {
      this.spawn({
        x, y, vx: (Math.random() - 0.5) * 2.4, vy: -Math.random() * 1.6,
        life: 12, color: i % 2 ? '#5ecfff' : '#cfeaff', size: 2, grav: 0.06,
      });
    }
    this.spawn({ x, y, life: 6, type: 'shield', size: 10, color: '#5ecfff' });
  }

  dust(x, y, dir = 0) {
    for (let i = 0; i < 5; i++) {
      this.spawn({
        x: x + (Math.random() - 0.5) * 8, y: y - Math.random() * 3,
        vx: dir * (0.4 + Math.random()) + (Math.random() - 0.5), vy: -0.4 - Math.random() * 0.5,
        life: 14, color: '#cabcf0', size: 2, grav: -0.005,
      });
    }
  }

  koRays(x, y) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const sp = 2 + Math.random() * 3.4;
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 30, color: ['#ffe14f', '#ff7da0', '#ffffff', '#7df9ff'][i % 4],
        size: 3, grav: 0.02,
      });
    }
    this.spawn({ x, y, life: 14, type: 'flash', size: 26, color: '#ffffff' });
  }

  superTrail(x, y, color) {
    this.spawn({
      x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6,
      life: 16, color, size: 2,
    });
  }

  update() {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life--;
      if (p.life <= 0) { p.active = false; continue; }
      p.x += p.vx; p.y += p.vy;
      p.vy += p.grav;
      p.vx *= 0.97;
    }
  }

  draw(ctx) {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      if (p.type === 'flash') {
        const r = Math.round(p.size * (1.3 - t));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - r), Math.round(p.y - 1), r * 2, 2);
        ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - r), 2, r * 2);
        if (t > 0.5) {
          const r2 = Math.round(r * 0.6);
          ctx.fillRect(Math.round(p.x - r2), Math.round(p.y - r2), r2 * 2, r2 * 2);
        }
      } else if (p.type === 'shield') {
        const r = Math.round(p.size * (1.2 - t * 0.5));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r), 2, r * 2);
        ctx.fillRect(Math.round(p.x + r - 2), Math.round(p.y - r), 2, r * 2);
        ctx.fillRect(Math.round(p.x - r), Math.round(p.y - r), r * 2, 2);
        ctx.fillRect(Math.round(p.x - r), Math.round(p.y + r - 2), r * 2, 2);
      } else {
        const s = Math.max(1, Math.round(p.size * t + 0.4));
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      }
    }
  }
}
