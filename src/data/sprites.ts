import type { MapStyle } from './maps';

// Пиксель-арт Kenney (CC0, www.kenney.nl): какие кадры листов спрайтов что изображают.
// Листы лежат в src/assets/kenney/, тайлы 16×16. Номер кадра = строка × столбцов + столбец.

export type SheetId = 'dungeon' | 'caves';

export interface SheetDef {
  /** Столбцов в листе (для расчёта номера кадра). */
  columns: number;
  /** Отступ между тайлами в пикселях. */
  spacing: number;
}

export const SHEETS: Record<SheetId, SheetDef> = {
  /** Tiny Dungeon: персонажи, монстры, пол, кладка. */
  dungeon: { columns: 12, spacing: 0 },
  /** Roguelike Caves & Dungeons: камни, кости, мелкий мусор. */
  caves: { columns: 29, spacing: 1 },
};

export interface SpriteRef {
  sheet: SheetId;
  frame: number;
}

const d = (frame: number): SpriteRef => ({ sheet: 'dungeon', frame });
const c = (row: number, col: number): SpriteRef => ({ sheet: 'caves', frame: row * SHEETS.caves.columns + col });

/** Персонажи на поле (кадры Tiny Dungeon). Не нашлось спрайта — рисуется фишка с иконкой. */
export const UNIT_SPRITES: Record<string, SpriteRef> = {
  hero: d(84), // маг в мантии
  gnawer: d(122), // паук
  spitter: d(110), // шипастый краб
  bone_guard: d(96), // латник в шлеме
  brood_mother: d(122), // тот же паук, рисуется крупнее
};

/** Во сколько раз крупнее обычного рисуется юнит (боссы). */
export const UNIT_SIZE: Record<string, number> = {
  brood_mother: 1.35,
};

export interface Tileset {
  /** Варианты пола; первый встречается чаще остальных. */
  floor: SpriteRef[];
  obstacles: SpriteRef[];
  /** Мелочь на полу (кости, камешки) — только для красоты. */
  decor: SpriteRef[];
  /** Оттенок пола (умножается на цвет тайла). */
  floorTint?: number;
}

const PEBBLES = [c(2, 4), c(2, 5), c(2, 6), c(2, 7)];
const BONES = [c(2, 0), c(2, 1), c(2, 2)];
// Чистый камень дважды — чтобы мха было поменьше.
const GREY_ROCKS = [c(1, 0), c(1, 0), c(1, 1), c(1, 2)];
const BROWN_ROCKS = [c(0, 0), c(0, 0), c(0, 1), c(0, 2)];

export const TILESETS: Record<MapStyle, Tileset> = {
  cave: { floor: [d(0)], obstacles: GREY_ROCKS, decor: [...PEBBLES, ...BONES], floorTint: 0x9c9498 },
  // Песок чуть приглушён, чтобы подсветка ходов не терялась на ярком полу.
  ruins: { floor: [d(48), d(49), d(49), d(42)], obstacles: [d(40)], decor: BONES, floorTint: 0xd6cabe },
  open: { floor: [d(48), d(49)], obstacles: [...GREY_ROCKS, ...BROWN_ROCKS], decor: PEBBLES, floorTint: 0xd6cabe },
};
