import type { Pos } from '../engine/types';
import type { MONSTERS } from './units';

export interface MapDef {
  name: string;
  width: number;
  height: number;
  obstacles: Pos[];
  heroStart: Pos;
  monsters: { type: keyof typeof MONSTERS; pos: Pos }[];
}

// Карта задаётся ASCII-схемой: # — препятствие, H — Одарённый, буквы — монстры.
const LAYOUT = [
  '............',
  '..##........',
  '..#.....#...',
  '........#..g',
  '....##......',
  'H...#....#..',
  '.........#.s',
  '....##......',
  '........#..b',
  '..#.....#...',
  '..##........',
  '............',
];

const LEGEND: Record<string, keyof typeof MONSTERS> = { g: 'gnawer', s: 'spitter', b: 'bone_guard' };

function parse(name: string, rows: string[]): MapDef {
  const map: MapDef = {
    name,
    width: rows[0].length,
    height: rows.length,
    obstacles: [],
    heroStart: { x: 0, y: 0 },
    monsters: [],
  };
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') map.obstacles.push({ x, y });
      else if (ch === 'H') map.heroStart = { x, y };
      else if (LEGEND[ch]) map.monsters.push({ type: LEGEND[ch], pos: { x, y } });
    }),
  );
  return map;
}

export const TRAINING_WORMHOLE = parse('Учебная Червоточина класса E', LAYOUT);
