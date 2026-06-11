// ── Canvas setup, integer scaling, sprite drawing ────────────────────────
import { VIEW_W, VIEW_H, FLOOR_Y } from './constants.js';
import { ANCHOR_X, ANCHOR_Y } from './sprites.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // integer scale: crisp pixels on any display
  resize() {
    const scale = Math.max(1, Math.min(
      Math.floor(window.innerWidth / VIEW_W),
      Math.floor(window.innerHeight / VIEW_H),
    ));
    this.canvas.style.width = `${VIEW_W * scale}px`;
    this.canvas.style.height = `${VIEW_H * scale}px`;
  }

  begin(shakeX = 0, shakeY = 0) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b0716';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.translate(Math.round(shakeX), Math.round(shakeY));
    return ctx;
  }

  drawShadow(ctx, f) {
    const h = Math.max(0, FLOOR_Y - f.y);
    const w = Math.max(6, 16 - h * 0.06);
    ctx.fillStyle = 'rgba(20,12,40,0.45)';
    ctx.fillRect(Math.round(f.x - w / 2), FLOOR_Y - 1, Math.round(w), 3);
  }

  drawFighter(ctx, f) {
    const pose = f.getPose();
    const set = (f.flashT > 0 && f.sprites.flash[pose]) ? f.sprites.flash : f.sprites.poses;
    const img = set[pose] || f.sprites.poses.idle0;
    const x = Math.round(f.x), y = Math.round(f.y);
    if (f.facing < 0) {
      ctx.save();
      ctx.translate(x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -ANCHOR_X, y - ANCHOR_Y);
      ctx.restore();
    } else {
      ctx.drawImage(img, x - ANCHOR_X, y - ANCHOR_Y);
    }
  }
}
