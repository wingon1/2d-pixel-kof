// ── In-game HUD: health/meter bars, timer, popups, announcements ─────────
import { VIEW_W, MAX_HP, MAX_METER, SUPER_COST } from './constants.js';
import { drawText, drawTextShadow, drawTextOutline } from './font.js';

const BAR_W = 178, BAR_H = 9;
const P1X = 14, P2X = VIEW_W - 14 - BAR_W;

function healthBar(ctx, x, hp, dispHp, flip) {
  // frame
  ctx.fillStyle = '#14102a';
  ctx.fillRect(x - 2, 12, BAR_W + 4, BAR_H + 4);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x - 1, 13, BAR_W + 2, BAR_H + 2);
  ctx.fillStyle = '#2a1a44';
  ctx.fillRect(x, 14, BAR_W, BAR_H);
  const w1 = Math.round((Math.max(0, dispHp) / MAX_HP) * BAR_W);
  const w2 = Math.round((Math.max(0, hp) / MAX_HP) * BAR_W);
  const draw = (w, color, color2) => {
    if (w <= 0) return;
    const sx = flip ? x + BAR_W - w : x;
    ctx.fillStyle = color; ctx.fillRect(sx, 14, w, BAR_H);
    ctx.fillStyle = color2; ctx.fillRect(sx, 14, w, 3);
  };
  draw(w1, '#ffc24f', '#ffe9a0');             // residual (yellow)
  const low = hp <= MAX_HP * 0.25;
  draw(w2, low ? '#ff4f5e' : '#3ee76a', low ? '#ff9aa4' : '#a0ffb8'); // live
}

function meterBar(ctx, x, meter, t, flip) {
  const w = 120, h = 7, y = 248;
  ctx.fillStyle = '#14102a'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#3a2a5a'; ctx.fillRect(x, y, w, h);
  const fw = Math.round((meter / MAX_METER) * w);
  const full = meter >= SUPER_COST;
  const pulse = full && (t >> 3) % 2 === 0;
  ctx.fillStyle = pulse ? '#ffffff' : full ? '#ffe14f' : '#3ee7ff';
  if (fw > 0) ctx.fillRect(flip ? x + w - fw : x, y, fw, h);
  if (full) drawTextShadow(ctx, 'SUPER OK!', flip ? x + w - 2 : x + 2, y - 8,
    pulse ? '#ffe14f' : '#fff', 1, flip ? 'right' : 'left');
}

function winPips(ctx, x, wins) {
  for (let i = 0; i < 2; i++) {
    drawTextOutline(ctx, '@', x + i * 9, 27, i < wins ? '#ff5b7d' : '#4a3a78', 1);
  }
}

export function drawHUD(ctx, game) {
  const [p1, p2] = game.fighters;
  healthBar(ctx, P1X, p1.hp, p1.dispHp, true);
  healthBar(ctx, P2X, p2.hp, p2.dispHp, false);
  drawTextOutline(ctx, p1.name, P1X, 27, '#fff', 1, 'left');
  drawTextOutline(ctx, p2.name, P2X + BAR_W, 27, '#fff', 1, 'right');
  winPips(ctx, P1X + BAR_W - 16, p1.stats.roundsWon);   // center side
  winPips(ctx, P2X, p2.stats.roundsWon);

  // round timer
  const t = Math.max(0, Math.ceil(game.roundTimer));
  const danger = t <= 10;
  const tc = danger && (game.t >> 4) % 2 === 0 ? '#ff4f5e' : '#fff';
  ctx.fillStyle = '#14102a';
  ctx.fillRect(VIEW_W / 2 - 16, 8, 32, 20);
  ctx.fillStyle = '#fff';
  ctx.fillRect(VIEW_W / 2 - 15, 9, 30, 18);
  ctx.fillStyle = '#241a44';
  ctx.fillRect(VIEW_W / 2 - 14, 10, 28, 16);
  drawText(ctx, String(t).padStart(2, '0'), VIEW_W / 2, 13, tc, 2, 'center');

  meterBar(ctx, 14, p1.meter, game.t, false);
  meterBar(ctx, VIEW_W - 14 - 120, p2.meter, game.t, true);

  // combo counters
  for (const side of [0, 1]) {
    const cd = game.comboDisplay[side];
    if (cd.timer > 0 && cd.count >= 2) {
      const x = side === 0 ? 30 : VIEW_W - 30;
      const shakeY = cd.timer > 24 ? ((game.t % 2) * 2 - 1) : 0;
      drawTextOutline(ctx, `COMBO x${cd.count}!`, x, 44 + shakeY,
        cd.count >= 5 ? '#ff5b7d' : '#ffe14f', 2, side === 0 ? 'left' : 'right');
    }
  }

  // center announcement (ROUND 1 / FIGHT! / KO! ...)
  const a = game.announce;
  if (a.timer > 0) {
    const prog = 1 - a.timer / a.dur;
    let scale = a.big ? 4 : 3;
    if (prog < 0.12) scale += 2;            // punch-in
    const y = 96;
    const col = a.color || '#ffe14f';
    drawTextOutline(ctx, a.text, VIEW_W / 2, y, col, scale, 'center');
    if (a.sub) drawTextOutline(ctx, a.sub, VIEW_W / 2, y + scale * 7, '#fff', 2, 'center');
  }
}
