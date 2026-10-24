import { DIRS } from '../engine/grid';
import type { Dir, Pos } from '../engine/types';

// Как клетки поля ложатся на экран. Движок ничего об этом не знает: у него всегда квадратная сетка.
// Вид сверху — квадраты, изометрия — ромбы (поворот на 45° и сжатие по вертикали вдвое).

type Point = { x: number; y: number };

export interface Projection {
  readonly iso: boolean;
  /** Размер холста Phaser. */
  readonly width: number;
  readonly height: number;
  /** Точка на земле в центре клетки. */
  center(p: Pos): Point;
  /** Клетка под точкой экрана (может быть вне поля — проверяет вызывающий). */
  cellAt(x: number, y: number): Pos;
  /** Углы клетки на экране; inset — отступ внутрь в долях клетки. */
  corners(p: Pos, inset?: number): Point[];
  /** Порядок отрисовки: кто дальше от зрителя, рисуется раньше. */
  depth(p: Pos): number;
  /** Угол направления на экране (радианы). */
  angle(dir: Dir): number;
  /**
   * Аффинное преобразование для canvas: из координат «вида сверху» (cell px на клетку) в экранные.
   * Пол рисуется один раз в виде сверху, а наклоняет его это преобразование.
   */
  floorTransform(cell: number): [number, number, number, number, number, number];
}

export function topDownProjection(cols: number, rows: number, cell: number): Projection {
  return {
    iso: false,
    width: cols * cell,
    height: rows * cell,
    center: (p) => ({ x: p.x * cell + cell / 2, y: p.y * cell + cell / 2 }),
    cellAt: (x, y) => ({ x: Math.floor(x / cell), y: Math.floor(y / cell) }),
    corners: (p, inset = 0) => {
      const a = inset * cell;
      const x0 = p.x * cell + a;
      const y0 = p.y * cell + a;
      const x1 = (p.x + 1) * cell - a;
      const y1 = (p.y + 1) * cell - a;
      return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
      ];
    },
    depth: (p) => p.y,
    angle: (dir) => Math.atan2(DIRS[dir].y, DIRS[dir].x),
    floorTransform: () => [1, 0, 0, 1, 0, 0],
  };
}

/** Ромб клетки шириной tileW и высотой tileW / 2. top — запас сверху под высокие камни и полоски здоровья. */
export function isoProjection(cols: number, rows: number, tileW: number, top = 90, bottom = 30): Projection {
  const hw = tileW / 2;
  const hh = tileW / 4;
  // Экранная точка угла (0, 0) поля — верхняя вершина ромба всего поля.
  const ox = rows * hw;
  const oy = top;
  const at = (gx: number, gy: number): Point => ({ x: ox + (gx - gy) * hw, y: oy + (gx + gy) * hh });
  return {
    iso: true,
    width: (cols + rows) * hw,
    height: top + (cols + rows) * hh + bottom,
    center: (p) => at(p.x + 0.5, p.y + 0.5),
    cellAt: (x, y) => {
      const a = (x - ox) / hw;
      const b = (y - oy) / hh;
      return { x: Math.floor((a + b) / 2), y: Math.floor((b - a) / 2) };
    },
    corners: (p, inset = 0) => [
      at(p.x + inset, p.y + inset),
      at(p.x + 1 - inset, p.y + inset),
      at(p.x + 1 - inset, p.y + 1 - inset),
      at(p.x + inset, p.y + 1 - inset),
    ],
    depth: (p) => p.x + p.y,
    angle: (dir) => {
      const d = DIRS[dir];
      return Math.atan2((d.x + d.y) * hh, (d.x - d.y) * hw);
    },
    floorTransform: (cell) => [hw / cell, hh / cell, -hw / cell, hh / cell, ox, oy],
  };
}
