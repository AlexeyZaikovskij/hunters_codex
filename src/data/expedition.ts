// Поход в Червоточину: несколько залов подряд, в конце — Червематка или кристалл-источник.
// Здоровье и мана переносятся между боями; после каждого зала — короткий привал на выбор.
// Чистая логика без интерфейса: тот же код использует симуляция баланса.

import { Rng } from '../engine/rng';
import type { MapDef, MapStyle } from './maps';
import { generateWormhole, type DangerClass, type RoomKind } from './mapgen';

export type Finale = 'boss' | 'source';

export const FINALE_NAMES: Record<Finale, string> = {
  boss: 'Червематка',
  source: 'Кристалл-источник',
};

/** Сколько залов до финала: вход + две развилки. Финал — четвёртый бой. */
export const ROOMS_BEFORE_FINALE = 3;

/** Осколки Червоточины за зал (класс D — вдвое больше). */
export const ROOM_REWARD: Record<RoomKind, number> = {
  single: 0,
  entrance: 8,
  corridor: 10,
  lair: 18,
  boss: 40,
  source: 30,
};
const CLASS_REWARD: Record<DangerClass, number> = { E: 1, D: 2 };

export const ROOM_NAMES: Record<RoomKind, string> = {
  single: 'Бой',
  entrance: 'Вход',
  corridor: 'Тихий коридор',
  lair: 'Логово',
  boss: 'Гнездо Червематки',
  source: 'Зал источника',
};

export const ROOM_HINTS: Record<RoomKind, string> = {
  single: '',
  entrance: 'Первые обитатели Червоточины. Разминка.',
  corridor: 'Обычный зал: монстров немного, добычи тоже.',
  lair: 'На монстра больше, чем в коридоре, — и добычи почти вдвое больше.',
  boss: 'Червематка со свитой. Ранена наполовину — впадает в ярость.',
  source: 'Разрушьте кристалл — и Червоточина схлопнется. Пока он цел, он лечит стражу.',
};

/**
 * После зала герой переводит дух: возвращается часть маны (autoManaShare).
 * Затем привал на выбор: перевязать раны (hpShare здоровья) или помедитировать (manaShare маны).
 */
export const REST = { autoManaShare: 0.5, hpShare: 0.4, manaShare: 0.4 };

/** При поражении теряется эта доля собранных осколков. */
export const DEFEAT_LOSS = 0.5;

export interface Door {
  room: RoomKind;
  map: MapDef;
  reward: number;
}

export interface Expedition {
  seed: number;
  dangerClass: DangerClass;
  /** У Червоточины один облик на все залы. */
  style: MapStyle;
  finale: Finale;
  /** Сколько залов уже пройдено. */
  depth: number;
  hp: number;
  mana: number;
  maxHp: number;
  maxMana: number;
  /** Осколки, собранные в этом походе (ещё не вынесены). */
  shards: number;
  /** Привал после последнего зала уже использован. */
  rested: boolean;
}

export type ExpeditionEnd = 'closed' | 'retreat' | 'defeat';

export function startExpedition(
  seed: number,
  dangerClass: DangerClass,
  hero: { maxHp: number; maxMana: number },
): Expedition {
  const rng = new Rng(seed);
  const styles: MapStyle[] = ['cave', 'ruins', 'open'];
  return {
    seed,
    dangerClass,
    style: styles[rng.int(0, styles.length - 1)],
    finale: rng.chance(0.5) ? 'boss' : 'source',
    depth: 0,
    hp: hero.maxHp,
    mana: hero.maxMana,
    maxHp: hero.maxHp,
    maxMana: hero.maxMana,
    shards: 0,
    // Перед первым залом отдыхать не от чего.
    rested: true,
  };
}

export const isFinale = (exp: Expedition) => exp.depth === ROOMS_BEFORE_FINALE;
export const isComplete = (exp: Expedition) => exp.depth > ROOMS_BEFORE_FINALE;

/** Куда можно пойти дальше: вход, развилка «коридор или логово» или финал. Зависит только от зерна и глубины. */
export function doors(exp: Expedition): Door[] {
  if (isComplete(exp)) return [];
  const rooms: RoomKind[] =
    exp.depth === 0 ? ['entrance'] : isFinale(exp) ? [exp.finale] : ['corridor', 'lair'];
  return rooms.map((room, i) => ({
    room,
    map: generateWormhole({ seed: roomSeed(exp, i), dangerClass: exp.dangerClass, style: exp.style, room }),
    reward: ROOM_REWARD[room] * CLASS_REWARD[exp.dangerClass],
  }));
}

function roomSeed(exp: Expedition, door: number): number {
  return (exp.seed * 7919 + (exp.depth + 1) * 104729 + door * 1299709) % 2147483647;
}

/** Зал пройден: забираем добычу и переносим здоровье и ману. */
export function afterVictory(exp: Expedition, door: Door, hero: { hp: number; mana: number }): Expedition {
  const mana = Math.min(exp.maxMana, hero.mana + Math.round(exp.maxMana * REST.autoManaShare));
  return { ...exp, depth: exp.depth + 1, hp: hero.hp, mana, shards: exp.shards + door.reward, rested: false };
}

export function rest(exp: Expedition, choice: 'hp' | 'mana'): Expedition {
  if (exp.rested) return exp;
  return choice === 'hp'
    ? { ...exp, rested: true, hp: Math.min(exp.maxHp, exp.hp + Math.round(exp.maxHp * REST.hpShare)) }
    : { ...exp, rested: true, mana: Math.min(exp.maxMana, exp.mana + Math.round(exp.maxMana * REST.manaShare)) };
}

/** Сколько осколков удастся вынести. */
export function shardsKept(exp: Expedition, end: ExpeditionEnd): number {
  return end === 'defeat' ? Math.floor(exp.shards * (1 - DEFEAT_LOSS)) : exp.shards;
}
