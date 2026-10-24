import { describe, expect, it } from 'vitest';
import { Grid } from './grid';
import type { Pos } from './types';

function los(obstacles: Pos[], from: Pos, to: Pos) {
  const grid = new Grid(10, 10, obstacles);
  return grid.hasLineOfSight(from, to, (p) => grid.isObstacle(p));
}

describe('line of sight', () => {
  it('sees around the corner of a single rock (knight move)', () => {
    // Случай со скриншота: камень справа от героя, враг на клетку ниже за ним.
    expect(los([{ x: 5, y: 2 }], { x: 4, y: 2 }, { x: 6, y: 3 })).toBe(true);
  });

  it('does not see through a wall of two rocks', () => {
    expect(los([{ x: 5, y: 2 }, { x: 5, y: 3 }], { x: 4, y: 2 }, { x: 6, y: 3 })).toBe(false);
  });

  it('does not see straight through a rock', () => {
    expect(los([{ x: 5, y: 2 }], { x: 4, y: 2 }, { x: 7, y: 2 })).toBe(false);
    expect(los([{ x: 5, y: 2 }], { x: 4, y: 2 }, { x: 8, y: 3 })).toBe(false);
  });

  it('does not see through a diagonal gap between two rocks', () => {
    expect(los([{ x: 5, y: 2 }, { x: 4, y: 3 }], { x: 4, y: 2 }, { x: 5, y: 3 })).toBe(false);
    expect(los([{ x: 5, y: 2 }, { x: 4, y: 3 }], { x: 4, y: 2 }, { x: 6, y: 4 })).toBe(false);
  });

  it('a rock right in the middle of a diagonal blocks it', () => {
    expect(los([{ x: 5, y: 3 }], { x: 4, y: 2 }, { x: 6, y: 4 })).toBe(false);
  });
});
