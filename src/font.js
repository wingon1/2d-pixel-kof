// ── Tiny procedural 3x5 pixel font (baked per color, cached) ─────────────
const G = {
  A: ['010','101','111','101','101'], B: ['110','101','110','101','110'],
  C: ['011','100','100','100','011'], D: ['110','101','101','101','110'],
  E: ['111','100','110','100','111'], F: ['111','100','110','100','100'],
  G: ['011','100','101','101','011'], H: ['101','101','111','101','101'],
  I: ['111','010','010','010','111'], J: ['001','001','001','101','010'],
  K: ['101','110','100','110','101'], L: ['100','100','100','100','111'],
  M: ['101','111','111','101','101'], N: ['111','101','101','101','101'],
  O: ['111','101','101','101','111'], P: ['110','101','110','100','100'],
  Q: ['111','101','101','111','001'], R: ['110','101','110','101','101'],
  S: ['011','100','010','001','110'], T: ['111','010','010','010','010'],
  U: ['101','101','101','101','111'], V: ['101','101','101','101','010'],
  W: ['101','101','111','111','101'], X: ['101','101','010','101','101'],
  Y: ['101','101','010','010','010'], Z: ['111','001','010','100','111'],
  0: ['111','101','101','101','111'], 1: ['010','110','010','010','111'],
  2: ['111','001','111','100','111'], 3: ['111','001','011','001','111'],
  4: ['101','101','111','001','001'], 5: ['111','100','111','001','111'],
  6: ['111','100','111','101','111'], 7: ['111','001','010','010','010'],
  8: ['111','101','111','101','111'], 9: ['111','101','111','001','111'],
  '!': ['010','010','010','000','010'], '?': ['111','001','011','000','010'],
  '.': ['000','000','000','000','010'], ',': ['000','000','000','010','100'],
  ':': ['000','010','000','010','000'], '-': ['000','000','111','000','000'],
  '/': ['001','001','010','100','100'], '+': ['000','010','111','010','000'],
  "'": ['010','010','000','000','000'], '>': ['100','010','001','010','100'],
  '<': ['001','010','100','010','001'], '@': ['000','101','111','111','010'], // heart
  '(': ['010','100','100','100','010'], ')': ['010','001','001','001','010'],
  '%': ['101','001','010','100','101'],
  ' ': ['000','000','000','000','000'],
};

const ORDER = Object.keys(G);
const IDX = Object.fromEntries(ORDER.map((c, i) => [c, i]));
const cache = new Map(); // color -> baked strip canvas

function strip(color) {
  let c = cache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = ORDER.length * 4; c.height = 5;
  const g = c.getContext('2d');
  g.fillStyle = color;
  ORDER.forEach((ch, i) => {
    const rows = G[ch];
    for (let r = 0; r < 5; r++) for (let p = 0; p < 3; p++) {
      if (rows[r][p] === '1') g.fillRect(i * 4 + p, r, 1, 1);
    }
  });
  cache.set(color, c);
  return c;
}

export function textWidth(text, scale = 1) {
  return text.length * 4 * scale - scale;
}

// align: 'left' | 'center' | 'right'
export function drawText(ctx, text, x, y, color = '#fff', scale = 1, align = 'left') {
  const s = strip(color);
  text = String(text).toUpperCase();
  let dx = Math.round(x);
  if (align === 'center') dx -= Math.round(textWidth(text, scale) / 2);
  else if (align === 'right') dx -= textWidth(text, scale);
  const dy = Math.round(y);
  for (let i = 0; i < text.length; i++) {
    const idx = IDX[text[i]];
    if (idx === undefined) { dx += 4 * scale; continue; }
    ctx.drawImage(s, idx * 4, 0, 3, 5, dx, dy, 3 * scale, 5 * scale);
    dx += 4 * scale;
  }
}

// Text with a 1px drop shadow / outline for readability over busy scenes.
export function drawTextShadow(ctx, text, x, y, color, scale = 1, align = 'left', shadow = '#000') {
  // shadow drops straight down: keeps the 1px inter-glyph gap clean
  drawText(ctx, text, x, y + scale, shadow, scale, align);
  drawText(ctx, text, x, y, color, scale, align);
}

// Full 4-direction outline: maximum readability over busy backgrounds.
export function drawTextOutline(ctx, text, x, y, color, scale = 1, align = 'left', outline = '#14102a') {
  for (const [dx, dy] of [[scale, 0], [-scale, 0], [0, scale], [0, -scale]]) {
    drawText(ctx, text, x + dx, y + dy, outline, scale, align);
  }
  drawText(ctx, text, x, y, color, scale, align);
}
