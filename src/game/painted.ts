import { Rng } from '../engine/rng';
import type { Grid } from '../engine/grid';
import type { MapStyle } from '../data/maps';

// «Рисованная» графика: поле рисуется кодом на холсте (градиенты, тени, фактура),
// персонажи — векторные миниатюры (SVG). Сторонних картинок нет.

interface Palette {
  /** Пол: базовый цвет в HSL и разброс светлоты от клетки к клетке. */
  floor: { h: number; s: number; l: number; jitter: number };
  /** Камень: светлая и тёмная сторона. */
  rockLight: string;
  rockDark: string;
}

const PALETTES: Record<MapStyle, Palette> = {
  cave: { floor: { h: 250, s: 10, l: 19, jitter: 3 }, rockLight: '#7d8294', rockDark: '#2c2f3a' },
  ruins: { floor: { h: 35, s: 14, l: 33, jitter: 4 }, rockLight: '#a59a88', rockDark: '#4a4239' },
  open: { floor: { h: 32, s: 28, l: 34, jitter: 4 }, rockLight: '#c4a57a', rockDark: '#5e4a33' },
};

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${h}, ${s}%, ${l}%, ${a})`;

/** Рисует всё статичное поле (пол, препятствия, сетку) на холсте размером grid × cell. */
export function paintBoard(ctx: CanvasRenderingContext2D, grid: Grid, style: MapStyle, seed: number, cell: number) {
  const rng = new Rng(seed * 7 + 3);
  const pal = PALETTES[style];
  const W = grid.width * cell;
  const H = grid.height * cell;

  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) paintFloorCell(ctx, rng, style, pal, x * cell, y * cell, cell);

  // Тонкая сетка — клетки должны читаться.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= grid.width; i++) {
    ctx.moveTo(i * cell + 0.5, 0);
    ctx.lineTo(i * cell + 0.5, H);
  }
  for (let i = 0; i <= grid.height; i++) {
    ctx.moveTo(0, i * cell + 0.5);
    ctx.lineTo(W, i * cell + 0.5);
  }
  ctx.stroke();

  // Препятствия рисуем сверху вниз, чтобы тени нижних ложились поверх верхних клеток пола.
  for (let y = 0; y < grid.height; y++)
    for (let x = 0; x < grid.width; x++) {
      if (!grid.isObstacle({ x, y })) continue;
      if (style === 'ruins') paintRuinBlock(ctx, rng, pal, x * cell, y * cell, cell);
      else paintBoulder(ctx, rng, style, pal, x * cell, y * cell, cell);
    }

  // Виньетка: края поля темнее, взгляд собирается в центре.
  const v = ctx.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function paintFloorCell(ctx: CanvasRenderingContext2D, rng: Rng, style: MapStyle, pal: Palette, px: number, py: number, c: number) {
  const f = pal.floor;
  const l = f.l + (rng.next() * 2 - 1) * f.jitter;
  ctx.fillStyle = hsl(f.h, f.s, l);
  ctx.fillRect(px, py, c, c);

  // Пятна — неровность поверхности.
  for (let i = 0; i < 3; i++) {
    const r = c * (0.2 + rng.next() * 0.35);
    const cx = px + rng.next() * c;
    const cy = py + rng.next() * c;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const dark = rng.chance(0.5);
    g.addColorStop(0, hsl(f.h, f.s, dark ? l - 5 : l + 4, 0.5));
    g.addColorStop(1, hsl(f.h, f.s, l, 0));
    ctx.fillStyle = g;
    ctx.fillRect(px, py, c, c);
  }
  // Зернистость.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = hsl(f.h, f.s, l + (rng.chance(0.5) ? 8 : -8), 0.35);
    ctx.fillRect(px + rng.next() * c, py + rng.next() * c, 1.5, 1.5);
  }

  if (style === 'ruins') {
    // Плиты: светлая фаска сверху-слева, тёмная снизу-справа; иногда плита расколота пополам.
    const split = rng.chance(0.3);
    const slabs = split ? [[px, py, c, c / 2], [px, py + c / 2, c, c / 2]] : [[px, py, c, c]];
    for (const [sx, sy, sw, sh] of slabs) {
      ctx.strokeStyle = hsl(f.h, f.s, l + 10, 0.55);
      ctx.beginPath();
      ctx.moveTo(sx + 2, sy + sh - 2);
      ctx.lineTo(sx + 2, sy + 2);
      ctx.lineTo(sx + sw - 2, sy + 2);
      ctx.stroke();
      ctx.strokeStyle = hsl(f.h, f.s, l - 14, 0.7);
      ctx.beginPath();
      ctx.moveTo(sx + sw - 2, sy + 2);
      ctx.lineTo(sx + sw - 2, sy + sh - 2);
      ctx.lineTo(sx + 2, sy + sh - 2);
      ctx.stroke();
    }
  }
  if (rng.chance(style === 'cave' ? 0.35 : 0.2)) crack(ctx, rng, px, py, c, hsl(f.h, f.s, l - 15, 0.8));

  if (style === 'cave' && rng.chance(0.07)) {
    // Светящиеся кристаллы Червоточины.
    const cx = px + c * (0.25 + rng.next() * 0.5);
    const cy = py + c * (0.25 + rng.next() * 0.5);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, c * 0.45);
    glow.addColorStop(0, 'rgba(170, 120, 255, 0.45)');
    glow.addColorStop(1, 'rgba(170, 120, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(px, py, c, c);
    for (let i = 0; i < 3; i++) shard(ctx, cx + (i - 1) * 5, cy + (i % 2) * 3, 4 + rng.next() * 5, '#d9c2ff', '#7b4fd6');
  }
  if (style === 'open' && rng.chance(0.25)) {
    // Пучки сухой травы.
    const gx = px + c * (0.2 + rng.next() * 0.6);
    const gy = py + c * (0.3 + rng.next() * 0.6);
    ctx.strokeStyle = rng.chance(0.5) ? '#8a8a45' : '#a49352';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + (rng.next() * 2 - 1) * 6, gy - 4 - rng.next() * 6);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }
  if (rng.chance(0.18)) {
    // Камешки.
    for (let i = 0; i < 1 + rng.int(0, 2); i++) {
      const sx = px + 6 + rng.next() * (c - 12);
      const sy = py + 6 + rng.next() * (c - 12);
      const r = 1.5 + rng.next() * 2.5;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(sx + 1, sy + 1.5, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.rockLight;
      ctx.beginPath();
      ctx.ellipse(sx, sy, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function crack(ctx: CanvasRenderingContext2D, rng: Rng, px: number, py: number, c: number, color: string) {
  let x = px + c * (0.2 + rng.next() * 0.6);
  let y = py + c * (0.2 + rng.next() * 0.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 4; i++) {
    x += (rng.next() * 2 - 1) * 9;
    y += (rng.next() * 2 - 1) * 9;
    ctx.lineTo(Math.min(px + c - 2, Math.max(px + 2, x)), Math.min(py + c - 2, Math.max(py + 2, y)));
  }
  ctx.stroke();
}

function shard(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, light: string, dark: string) {
  const g = ctx.createLinearGradient(x - 2, y - h, x + 2, y);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + 2.5, y);
  ctx.lineTo(x - 2.5, y);
  ctx.closePath();
  ctx.fill();
}

/** Валун: неровный многоугольник с тенью, градиентом света и гранями. */
function paintBoulder(ctx: CanvasRenderingContext2D, rng: Rng, style: MapStyle, pal: Palette, px: number, py: number, c: number) {
  const cx = px + c / 2 + (rng.next() * 2 - 1) * 3;
  const cy = py + c / 2 + 3;
  const R = c * (0.38 + rng.next() * 0.07);
  const n = 8 + rng.int(0, 3);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.next() * 0.3;
    // Сплюснут по вертикали — будто смотрим чуть сверху.
    const r = R * (0.78 + rng.next() * 0.25);
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.82]);
  }
  const path = () => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  // Падающая тень.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 6;
  const body = ctx.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy + R);
  body.addColorStop(0, pal.rockLight);
  body.addColorStop(1, pal.rockDark);
  ctx.fillStyle = body;
  path();
  ctx.fill();
  ctx.restore();

  // Грани: от «вершины» камня к краям, светлые слева сверху, тёмные справа снизу.
  const top: [number, number] = [cx - R * 0.15, cy - R * 0.25];
  for (const [x, y] of pts) {
    const lit = x < cx && y < cy + R * 0.2;
    ctx.strokeStyle = lit ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.moveTo(top[0], top[1]);
    ctx.lineTo(x, y);
    ctx.stroke();
  }
  // Блик на верхушке.
  const hl = ctx.createRadialGradient(top[0] - 3, top[1] - 3, 0, top[0], top[1], R * 0.6);
  hl.addColorStop(0, 'rgba(255,255,255,0.35)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  path();
  ctx.clip();
  ctx.fillStyle = hl;
  ctx.fillRect(px, py, c, c);
  // Контурная тень внизу камня.
  const bottom = ctx.createLinearGradient(0, cy, 0, cy + R);
  bottom.addColorStop(0, 'rgba(0,0,0,0)');
  bottom.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = bottom;
  ctx.fillRect(px, py, c, c);
  ctx.restore();

  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.lineWidth = 1.2;
  path();
  ctx.stroke();
  ctx.lineWidth = 1;

  if (style === 'cave' && rng.chance(0.4)) {
    // Мох или кристаллы на камне.
    if (rng.chance(0.5)) {
      ctx.fillStyle = 'rgba(96, 140, 70, 0.75)';
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.arc(top[0] + (rng.next() * 2 - 1) * R * 0.5, top[1] + (rng.next() * 2 - 1) * R * 0.25, 2 + rng.next() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (let i = 0; i < 3; i++) shard(ctx, top[0] + (i - 1) * 6, top[1] + 4 + (i % 2) * 2, 8 + rng.next() * 6, '#e4d4ff', '#6c43c9');
    }
  }
}

/** Обломок кладки для руин: блок с «крышкой», кирпичами, сколами. */
function paintRuinBlock(ctx: CanvasRenderingContext2D, rng: Rng, pal: Palette, px: number, py: number, c: number) {
  const x = px + 4;
  const w = c - 8;
  const capH = 12;
  const y = py + 6;
  const h = c - 10;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = pal.rockDark;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  // Лицевая сторона — кирпичи.
  const face = ctx.createLinearGradient(0, y + capH, 0, y + h);
  face.addColorStop(0, '#857a6b');
  face.addColorStop(1, '#4b433a');
  ctx.fillStyle = face;
  ctx.fillRect(x, y + capH, w, h - capH);
  ctx.strokeStyle = 'rgba(30, 24, 18, 0.7)';
  const rows = 3;
  const rowH = (h - capH) / rows;
  for (let r = 0; r < rows; r++) {
    const ry = y + capH + r * rowH;
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + w, ry);
    ctx.stroke();
    const offset = r % 2 ? w / 4 : 0;
    for (let bx = x + offset + w / 2; bx < x + w; bx += w / 2) {
      ctx.beginPath();
      ctx.moveTo(bx, ry);
      ctx.lineTo(bx, ry + rowH);
      ctx.stroke();
    }
    if (offset) {
      ctx.beginPath();
      ctx.moveTo(x + offset, ry);
      ctx.lineTo(x + offset, ry + rowH);
      ctx.stroke();
    }
  }
  // Верхняя грань — светлая.
  const cap = ctx.createLinearGradient(0, y, 0, y + capH);
  cap.addColorStop(0, pal.rockLight);
  cap.addColorStop(1, '#8a7f6f');
  ctx.fillStyle = cap;
  ctx.fillRect(x, y, w, capH);
  // Скол угла.
  if (rng.chance(0.6)) {
    const right = rng.chance(0.5);
    const cs = 8 + rng.next() * 8;
    ctx.fillStyle = hsl(PALETTES.ruins.floor.h, PALETTES.ruins.floor.s, PALETTES.ruins.floor.l);
    ctx.beginPath();
    const cxp = right ? x + w : x;
    ctx.moveTo(cxp, y - 1);
    ctx.lineTo(cxp + (right ? -cs : cs), y - 1);
    ctx.lineTo(cxp, y + cs);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (rng.chance(0.5)) crack(ctx, rng, x, y + capH, w, 'rgba(25,20,15,0.8)');
  if (rng.chance(0.35)) {
    // Плющ.
    ctx.fillStyle = 'rgba(80, 120, 60, 0.8)';
    const vx = x + rng.next() * w;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(vx + (rng.next() * 2 - 1) * 4, y + capH + i * 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
