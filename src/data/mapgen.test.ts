import { describe, expect, it } from 'vitest';
import { generateWormhole, type DangerClass, type MapStyle } from './mapgen';
import type { Pos } from '../engine/types';

const k = (p: Pos) => `${p.x},${p.y}`;

function reachableFrom(start: Pos, width: number, height: number, walls: Set<string>): Set<string> {
  const seen = new Set([k(start)]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const q = { x: p.x + dx, y: p.y + dy };
      if (q.x < 0 || q.y < 0 || q.x >= width || q.y >= height || walls.has(k(q)) || seen.has(k(q))) continue;
      seen.add(k(q));
      queue.push(q);
    }
  }
  return seen;
}

describe('generateWormhole', () => {
  it('is deterministic for the same seed', () => {
    expect(generateWormhole({ seed: 7, dangerClass: 'E' })).toEqual(generateWormhole({ seed: 7, dangerClass: 'E' }));
    expect(generateWormhole({ seed: 7, dangerClass: 'E' })).not.toEqual(generateWormhole({ seed: 8, dangerClass: 'E' }));
  });

  const cases: [DangerClass, MapStyle][] = [];
  for (const c of ['E', 'D'] as const) for (const s of ['cave', 'ruins', 'open'] as const) cases.push([c, s]);

  it.each(cases)('class %s, %s: every free cell is reachable and monsters fit the class', (dangerClass, style) => {
    for (let seed = 1; seed <= 150; seed++) {
      const m = generateWormhole({ seed, dangerClass, style });
      const walls = new Set(m.obstacles.map(k));
      expect(walls.has(k(m.heroStart))).toBe(false);

      const reach = reachableFrom(m.heroStart, m.width, m.height, walls);
      expect(reach.size + walls.size).toBe(m.width * m.height);

      const [lo, hi] = dangerClass === 'E' ? [3, 3] : [4, 5];
      expect(m.monsters.length).toBeGreaterThanOrEqual(lo);
      expect(m.monsters.length).toBeLessThanOrEqual(hi);
      expect(m.monsters.filter((x) => x.type === 'spitter').length).toBeLessThanOrEqual(2);

      const cells = new Set(m.monsters.map((x) => k(x.pos)));
      expect(cells.size).toBe(m.monsters.length);
      for (const mon of m.monsters) {
        expect(walls.has(k(mon.pos))).toBe(false);
        // Монстры — в правой части поля, герой — у левого края.
        expect(mon.pos.x).toBeGreaterThanOrEqual(m.width - 5);
      }
    }
  });
});
