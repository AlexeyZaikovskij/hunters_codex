import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import type { Pos } from './types';

function los(rocks: Pos[], from: Pos, to: Pos, units: Pos[] = []) {
  const grid = new Grid(12, 12, rocks);
  return grid.hasLineOfSight(from, to, (p) => grid.isObstacle(p), units);
}

describe('line of sight', () => {
  it('rocks are opaque: no shot past a rock corner the line cuts through', () => {
    // Камень справа от стреляющего, цель ходом коня за ним — линия заходит в камень.
    expect(los([{ x: 5, y: 2 }], { x: 4, y: 2 }, { x: 6, y: 3 })).toBe(false);
    // Скриншот автора: Иглобрюх (6,9) не видит героя (3,10) за камнями (4,10), (5,10).
    expect(los([{ x: 4, y: 10 }, { x: 5, y: 10 }], { x: 6, y: 9 }, { x: 3, y: 10 })).toBe(false);
  });

  it('does not see straight through a rock', () => {
    expect(los([{ x: 5, y: 2 }], { x: 4, y: 2 }, { x: 7, y: 2 })).toBe(false);
  });

  it('a diagonal line touching a single rock corner is fine, a seam of two rocks is not', () => {
    expect(los([{ x: 5, y: 2 }], { x: 4, y: 2 }, { x: 6, y: 4 })).toBe(true);
    expect(los([{ x: 5, y: 2 }, { x: 4, y: 3 }], { x: 4, y: 2 }, { x: 6, y: 4 })).toBe(false);
    expect(los([{ x: 5, y: 3 }], { x: 4, y: 2 }, { x: 6, y: 4 })).toBe(false);
  });

  it('units are thin: a knight-move shot past a unit works, a shot through it does not', () => {
    // Скриншот автора: Костяной страж рядом с героем не мешает стрелять по Иглобрюху ходом коня.
    expect(los([], { x: 0, y: 2 }, { x: 2, y: 1 }, [{ x: 1, y: 2 }])).toBe(true);
    expect(los([], { x: 0, y: 2 }, { x: 3, y: 2 }, [{ x: 1, y: 2 }])).toBe(false);
    expect(los([], { x: 0, y: 0 }, { x: 2, y: 2 }, [{ x: 1, y: 1 }])).toBe(false);
  });
});
