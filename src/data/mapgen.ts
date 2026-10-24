// Генератор Червоточин: каждый бой — новое поле и новый состав монстров.
// Одно и то же зерно всегда даёт одну и ту же Червоточину (зерно видно в бою — можно повторить или прислать).

import { Rng } from '../engine/rng';
import type { Pos } from '../engine/types';
import type { MapDef, MapStyle } from './maps';
import type { MONSTERS, REGULAR_MONSTERS } from './units';

export type DangerClass = 'E' | 'D';
export type { MapStyle };

export const STYLE_NAMES: Record<MapStyle, string> = {
  cave: 'пещера',
  ruins: 'руины',
  open: 'пустошь',
};

type MonsterType = keyof typeof MONSTERS;
type RegularType = (typeof REGULAR_MONSTERS)[number];

/**
 * Какой зал генерируем. single — одиночный бой (по умолчанию).
 * В походе: entrance и corridor — на монстра меньше одиночного боя, lair — логово (полный состав, больше добычи),
 * boss — Червематка со свитой, source — кристалл-источник под охраной.
 */
export type RoomKind = 'single' | 'entrance' | 'corridor' | 'lair' | 'boss' | 'source';

const ROOM_SUFFIX: Record<RoomKind, string> = {
  single: '',
  entrance: '',
  corridor: '',
  lair: ' — логово',
  boss: ' — гнездо Червематки',
  source: ' — источник',
};

/**
 * Состав по классу опасности: сколько монстров и не больше стольких каждого вида
 * (пять стрелков разом — уже не бой, а расстрел).
 */
const CLASS_RULES: Record<DangerClass, { count: [number, number]; max: Record<RegularType, number> }> = {
  E: { count: [3, 3], max: { gnawer: 2, spitter: 1, bone_guard: 1 } },
  D: { count: [4, 5], max: { gnawer: 3, spitter: 2, bone_guard: 2 } },
};

const SIZE = 12;
/** Меньше проходимых клеток — поле слишком тесное, генерируем заново. */
const MIN_FLOOR = 96;

export interface GenOptions {
  seed: number;
  dangerClass: DangerClass;
  /** Без стиля — случайный. */
  style?: MapStyle;
  /** Без типа — одиночный бой. */
  room?: RoomKind;
}

const k = (p: Pos) => `${p.x},${p.y}`;
const inside = (p: Pos) => p.x >= 0 && p.y >= 0 && p.x < SIZE && p.y < SIZE;
const N4 = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Новое случайное зерно (короткое, чтобы его было удобно переписать). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

export function generateWormhole(opts: GenOptions): MapDef {
  const rng = new Rng(opts.seed);
  const styles: MapStyle[] = ['cave', 'ruins', 'open'];
  const style = opts.style ?? styles[rng.int(0, styles.length - 1)];
  // Неудачная раскладка (тесно, монстрам негде встать) — пробуем ещё раз с тем же генератором.
  for (let attempt = 0; attempt < 50; attempt++) {
    const map = tryGenerate(rng, style, opts);
    if (map) return map;
  }
  throw new Error(`Не удалось сгенерировать Червоточину (зерно ${opts.seed})`);
}

function tryGenerate(rng: Rng, style: MapStyle, opts: GenOptions): MapDef | null {
  const walls = new Set<string>();
  if (style === 'cave') carveCave(rng, walls);
  else if (style === 'ruins') buildRuins(rng, walls);
  else scatterRocks(rng, walls);

  const heroStart = { x: rng.int(0, 1), y: rng.int(2, SIZE - 3) };
  // Вокруг героя — свободно, чтобы первый ход не был в тупике.
  for (let dx = -1; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) walls.delete(k({ x: heroStart.x + dx, y: heroStart.y + dy }));

  // Всё, куда нельзя дойти от героя, заливаем камнем: замкнутых карманов не бывает.
  const dist = bfs(heroStart, walls);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const key = k({ x, y });
      if (!walls.has(key) && !dist.has(key)) walls.add(key);
    }
  if (SIZE * SIZE - walls.size < MIN_FLOOR) return null;

  const monsters = placeMonsters(rng, pickMonsters(rng, opts.dangerClass, opts.room ?? 'single'), dist);
  if (!monsters) return null;

  return {
    name: `Червоточина класса ${opts.dangerClass}: ${STYLE_NAMES[style]}${ROOM_SUFFIX[opts.room ?? 'single']}`,
    style,
    width: SIZE,
    height: SIZE,
    obstacles: [...walls].map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    }),
    heroStart,
    monsters,
    seed: opts.seed,
    dangerClass: opts.dangerClass,
  };
}

/** Пещера: сплошной камень, в котором «прорыты» извилистые ходы. Узкие проходы — раздолье для Пространства. */
function carveCave(rng: Rng, walls: Set<string>) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) walls.add(k({ x, y }));
  const target = rng.int(100, 110);
  const floor = () => SIZE * SIZE - walls.size;
  while (floor() < target) {
    // Каждый «копатель» идёт слева направо, петляя вверх и вниз.
    let p = { x: 0, y: rng.int(0, SIZE - 1) };
    for (let step = 0; step < 40 && floor() < target; step++) {
      walls.delete(k(p));
      // Иногда ход шире: заодно расчищаем соседнюю клетку.
      if (rng.chance(0.3)) {
        const d = N4[rng.int(0, 3)];
        const q = { x: p.x + d.x, y: p.y + d.y };
        if (inside(q)) walls.delete(k(q));
      }
      const r = rng.next();
      const d = r < 0.45 ? N4[0] : r < 0.7 ? N4[2] : r < 0.95 ? N4[3] : N4[1];
      const next = { x: p.x + d.x, y: p.y + d.y };
      if (inside(next)) p = next;
    }
  }
}

/** Руины: колонны и обломки стен — много углов, к которым можно прижать врага. */
function buildRuins(rng: Rng, walls: Set<string>) {
  for (let y = 0; y < SIZE; y += 3)
    for (let x = 3; x < SIZE; x += 3) {
      if (rng.chance(0.15)) continue;
      const p = { x: x + rng.int(-1, 0), y: y + rng.int(0, 1) };
      walls.add(k(p));
      // Чаще всего колонна — обломок стены длиной 2–3.
      if (rng.chance(0.7)) {
        const d = N4[rng.int(0, 3)];
        const len = rng.int(1, 2);
        for (let i = 1; i <= len; i++) {
          const q = { x: p.x + d.x * i, y: p.y + d.y * i };
          if (inside(q)) walls.add(k(q));
        }
      }
    }
}

/** Пустошь: редкие камни — простор для лучников и магов. */
function scatterRocks(rng: Rng, walls: Set<string>) {
  const count = rng.int(8, 12);
  for (let i = 0; i < count; i++) {
    const p = { x: rng.int(2, SIZE - 2), y: rng.int(0, SIZE - 1) };
    walls.add(k(p));
    if (rng.chance(0.35)) {
      const d = N4[rng.int(0, 3)];
      const q = { x: p.x + d.x, y: p.y + d.y };
      if (inside(q)) walls.add(k(q));
    }
  }
}

/** Расстояние в шагах от старта до каждой достижимой клетки. */
function bfs(start: Pos, walls: Set<string>): Map<string, number> {
  const dist = new Map<string, number>([[k(start), 0]]);
  const queue = [start];
  while (queue.length) {
    const p = queue.shift()!;
    for (const d of N4) {
      const q = { x: p.x + d.x, y: p.y + d.y };
      if (!inside(q) || walls.has(k(q)) || dist.has(k(q))) continue;
      dist.set(k(q), dist.get(k(p))! + 1);
      queue.push(q);
    }
  }
  return dist;
}

/** Состав зала. Финальный монстр или источник идёт первым — его ставят первым и подальше. */
function pickMonsters(rng: Rng, dangerClass: DangerClass, room: RoomKind): MonsterType[] {
  const rules = CLASS_RULES[dangerClass];
  const base = rng.int(rules.count[0], rules.count[1]);
  // В походе залов несколько подряд, поэтому каждый зал меньше одиночного боя.
  const total = { single: base, entrance: base - 1, corridor: base - 1, lair: base, boss: base - 2, source: base - 1 }[room];
  const { max } = rules;
  const picked: MonsterType[] = [];
  const types = Object.keys(max) as RegularType[];
  while (picked.length < total) {
    const allowed = types.filter((t) => picked.filter((x) => x === t).length < max[t]);
    picked.push(allowed[rng.int(0, allowed.length - 1)]);
  }
  if (room === 'boss') return ['brood_mother', ...picked];
  if (room === 'source') return ['source_crystal', ...picked];
  return picked;
}

/** Монстры — в правой части поля, не ближе 7 шагов к герою и не вплотную друг к другу. */
function placeMonsters(rng: Rng, types: MonsterType[], dist: Map<string, number>): MapDef['monsters'] | null {
  const free = [...dist.entries()]
    .filter(([, d]) => d >= 7)
    .map(([s]) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    })
    .filter((p) => p.x >= SIZE - 5);
  const out: MapDef['monsters'] = [];
  for (const type of types) {
    const options = free.filter((p) => out.every((m) => Math.abs(m.pos.x - p.x) + Math.abs(m.pos.y - p.y) > 1));
    // Стрелки встают подальше, источник — в самой дальней части зала, остальные — где придётся.
    const farthest = Math.max(...options.map((p) => dist.get(k(p)) ?? 0));
    const pool =
      type === 'spitter'
        ? options.filter((p) => p.x >= SIZE - 2)
        : type === 'source_crystal'
          ? options.filter((p) => (dist.get(k(p)) ?? 0) >= farthest - 2)
          : options;
    const from = pool.length ? pool : options;
    if (!from.length) return null;
    out.push({ type, pos: from[rng.int(0, from.length - 1)] });
  }
  return out;
}
