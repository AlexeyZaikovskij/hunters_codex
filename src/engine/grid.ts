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

  /** Клетки строго между a и b, через которые проходит луч. */
  private cellsOnRay(a: Pos, b: Pos, bias: number): Pos[] {
    const steps = distance(a, b) * 6;
    const cells: Pos[] = [];
    const seen = new Set<string>([key(a), key(b)]);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const p = {
        x: Math.round(a.x + (b.x - a.x) * t + bias),
        y: Math.round(a.y + (b.y - a.y) * t + bias),
      };
      const k = key(p);
      if (!seen.has(k)) {
        seen.add(k);
        cells.push(p);
      }
    }
    return cells;
  }

  /**
   * Линия обзора между центрами клеток. Луч проверяется с небольшим сдвигом в обе стороны:
   * если хотя бы один вариант свободен, цель видна (луч «проходит по углу»).
   */
  hasLineOfSight(a: Pos, b: Pos, isBlocking: (p: Pos) => boolean): boolean {
    if (distance(a, b) <= 1) return true;
    const clear = (bias: number) => this.cellsOnRay(a, b, bias).every((p) => !isBlocking(p));
    return clear(0.001) || clear(-0.001);
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
