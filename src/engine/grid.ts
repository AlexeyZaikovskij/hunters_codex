import type { Dir, Pos } from './types';

export const DIRS: Record<Dir, Pos> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export const key = (p: Pos) => `${p.x},${p.y}`;

export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

export const add = (a: Pos, b: Pos): Pos => ({ x: a.x + b.x, y: a.y + b.y });

/** Расстояние в шагах по горизонтали и вертикали (без диагоналей). */
export const distance = (a: Pos, b: Pos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Существо закрывает обзор, если линия проходит ближе этого к его центру (в клетках).
 * 0.4 — линия «ходом коня» мимо соседа (≈0.45) проходит, а сквозь клетку существа — нет.
 */
const UNIT_LOS_RADIUS = 0.4;

export const isInLine = (a: Pos, b: Pos) => a.x === b.x || a.y === b.y;

export function neighbors(p: Pos): Pos[] {
  return Object.values(DIRS).map((d) => add(p, d));
}

/** Направление от a к b по преобладающей оси. При равенстве осей — по горизонтали. */
export function dirTowards(a: Pos, b: Pos): Dir {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

/** Направление строго по линии; null, если точки не на одной линии или совпадают. */
export function lineDir(a: Pos, b: Pos): Dir | null {
  if (samePos(a, b) || !isInLine(a, b)) return null;
  return dirTowards(a, b);
}

export class Grid {
  readonly obstacles: Set<string>;

  constructor(
    readonly width: number,
    readonly height: number,
    obstacles: Pos[],
  ) {
    this.obstacles = new Set(obstacles.map(key));
  }

  inBounds(p: Pos): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height;
  }

  isObstacle(p: Pos): boolean {
    return this.obstacles.has(key(p));
  }

  /** Клетка существует и не является препятствием. */
  isWalkable(p: Pos): boolean {
    return this.inBounds(p) && !this.isObstacle(p);
  }

  /**
   * Линия обзора — отрезок между центрами клеток a и b.
   * - Камни непрозрачные: отрезок не должен заходить внутрь клетки с камнем. Если он проходит ровно через угол,
   *   мешает только стык двух камней по диагонали.
   * - Существа узкие: блокер мешает, только если отрезок проходит ближе UNIT_LOS_RADIUS к его центру.
   *   Кто именно блокирует (обычно — враги стреляющего), решает вызывающий код.
   */
  hasLineOfSight(a: Pos, b: Pos, isWall: (p: Pos) => boolean, blockers: Pos[] = []): boolean {
    if (distance(a, b) <= 1) return true;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const at = (t: number) => ({ x: a.x + dx * t, y: a.y + dy * t });
    const cellAt = (t: number) => {
      const p = at(t);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    };
    const wall = (p: Pos) => !samePos(p, a) && !samePos(p, b) && isWall(p);

    // Моменты пересечения границ клеток (x = k + 0.5 или y = k + 0.5).
    const crossings = (from: number, d: number) => {
      const ts: number[] = [];
      for (let k = Math.min(from, from + d); k < Math.max(from, from + d); k++) ts.push((k + 0.5 - from) / d);
      return ts;
    };
    const xs = dx ? crossings(a.x, dx) : [];
    const ys = dy ? crossings(a.y, dy) : [];
    const ts = [...xs, ...ys].sort((m, n) => m - n).filter((t, i, arr) => i === 0 || t - arr[i - 1] > 1e-9);
    const bounds = [0, ...ts, 1];
    for (let i = 0; i + 1 < bounds.length; i++) if (wall(cellAt((bounds[i] + bounds[i + 1]) / 2))) return false;

    // Проход ровно через угол: клетки по бокам задеты только точкой, мешают лишь обе сразу.
    for (const t of ts) {
      if (!xs.some((x) => Math.abs(x - t) < 1e-9) || !ys.some((y) => Math.abs(y - t) < 1e-9)) continue;
      const c = at(t);
      const before = cellAt(t - 1e-6);
      const after = cellAt(t + 1e-6);
      const sides = [-0.5, 0.5]
        .flatMap((ox) => [-0.5, 0.5].map((oy) => ({ x: Math.round(c.x + ox), y: Math.round(c.y + oy) })))
        .filter((p) => !samePos(p, before) && !samePos(p, after));
      if (sides.every(wall)) return false;
    }

    const len2 = dx * dx + dy * dy;
    return blockers.every((u) => {
      if (samePos(u, a) || samePos(u, b)) return true;
      const t = Math.max(0, Math.min(1, ((u.x - a.x) * dx + (u.y - a.y) * dy) / len2));
      const p = at(t);
      return Math.hypot(u.x - p.x, u.y - p.y) >= UNIT_LOS_RADIUS;
    });
  }

  /**
   * Поиск достижимых клеток (Дейкстра). stepCost(from) — стоимость шага с клетки from:
   * 1 или больше (блокировка врагом). Возвращает стоимость и предыдущую клетку для восстановления пути.
   */
  reachable(
    start: Pos,
    maxCost: number,
    isFree: (p: Pos) => boolean,
    stepCost: (from: Pos) => number,
  ): Map<string, { pos: Pos; cost: number; prev: string | null }> {
    const result = new Map<string, { pos: Pos; cost: number; prev: string | null }>();
    result.set(key(start), { pos: start, cost: 0, prev: null });
    const queue: { pos: Pos; cost: number }[] = [{ pos: start, cost: 0 }];
    while (queue.length) {
      queue.sort((m, n) => m.cost - n.cost);
      const cur = queue.shift()!;
      const curKey = key(cur.pos);
      if (result.get(curKey)!.cost < cur.cost) continue;
      const cost = cur.cost + stepCost(cur.pos);
      if (cost > maxCost) continue;
      for (const n of neighbors(cur.pos)) {
        if (!this.isWalkable(n) || !isFree(n)) continue;
        const nk = key(n);
        const known = result.get(nk);
        if (known && known.cost <= cost) continue;
        result.set(nk, { pos: n, cost, prev: curKey });
        queue.push({ pos: n, cost });
      }
    }
    return result;
  }
}

/** Восстанавливает путь (без стартовой клетки) из результата reachable(). */
export function buildPath(
  map: Map<string, { pos: Pos; cost: number; prev: string | null }>,
  target: Pos,
): Pos[] {
  const path: Pos[] = [];
  let cur = map.get(key(target));
  while (cur && cur.prev !== null) {
    path.unshift(cur.pos);
    cur = map.get(cur.prev);
  }
  return path;
}
