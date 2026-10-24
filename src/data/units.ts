import type { AiArchetype, MonsterTag, Pos, Stats, Unit, WeaponDef } from '../engine/types';
import { SCHOOL_SKILLS } from './skills';

type Affinity = 'fire' | 'light' | 'blood' | 'space';

const ZERO_STATS: Stats = { strength: 0, agility: 0, intellect: 0, will: 0, stamina: 0 };

function baseUnit(partial: Partial<Unit> & Pick<Unit, 'id' | 'name' | 'team' | 'glyph' | 'color' | 'pos'>): Unit {
  return {
    facing: partial.team === 'player' ? 'right' : 'left',
    hp: 100,
    maxHp: 100,
    mana: 0,
    maxMana: 0,
    manaRegen: 0,
    baseAp: 6,
    baseMp: 3,
    ap: 6,
    mp: 3,
    initiative: 10,
    stats: ZERO_STATS,
    resist: {},
    skills: [],
    tags: [],
    statuses: [],
    cooldowns: {},
    weaponAttacksThisTurn: 0,
    focusedThisTurn: false,
    vigilanceUsed: false,
    alive: true,
    ...partial,
  };
}

/** Сколько умений базовой школы берётся в бой: 5 склонности + 3 базовой = 8 слотов. */
export const BODY_SLOTS = 3;
export const DEFAULT_BODY_SKILLS = ['energy_armor', 'dash', 'power_strike'];

/** Одарённый игрока: 5 умений школы склонности + 3 выбранных умения базовой школы. */
export function createHero(affinity: Affinity, weapon: WeaponDef, pos: Pos, bodySkills = DEFAULT_BODY_SKILLS): Unit {
  // Прототип: персонаж примерно 5-го уровня, 20 очков распределены поровну.
  const stats: Stats = { strength: 10, agility: 10, intellect: 10, will: 0, stamina: 0 };
  const maxHp = 100 + stats.stamina * 5;
  const maxMana = 60 + stats.will * 3;
  return baseUnit({
    id: 'hero',
    name: 'Одарённый',
    team: 'player',
    glyph: 'Я',
    color: 0x4fa3ff,
    pos,
    hp: maxHp,
    maxHp,
    mana: maxMana,
    maxMana,
    manaRegen: 3,
    initiative: 10 + stats.agility,
    stats,
    skills: [...SCHOOL_SKILLS[affinity], ...bodySkills.slice(0, BODY_SLOTS)],
    weapon,
  });
}

interface MonsterDef {
  name: string;
  glyph: string;
  color: number;
  hp: number;
  /** Монстры получают меньше ОД, чем герой: одна атака за ход, иначе толпа сносит героя за пару раундов. */
  ap: number;
  mp: number;
  initiative: number;
  skills: string[];
  tags: MonsterTag[];
  ai: AiArchetype;
  resist?: Unit['resist'];
  /** Бьёт тех, кто отступает с соседней клетки. */
  vigilant?: boolean;
}

export const MONSTERS: Record<string, MonsterDef> = {
  gnawer: {
    name: 'Червеглот',
    glyph: 'Ч',
    color: 0xc0563a,
    hp: 55,
    ap: 4,
    mp: 3,
    initiative: 12,
    skills: ['m_bite'],
    tags: ['wormhole'],
    ai: 'melee',
    resist: { physical: 10 },
  },
  spitter: {
    name: 'Иглобрюх',
    glyph: 'И',
    color: 0x8bbf3a,
    hp: 40,
    ap: 4,
    mp: 3,
    initiative: 15,
    skills: ['m_spine'],
    tags: ['wormhole'],
    ai: 'ranged',
    resist: { fire: -10 },
  },
  bone_guard: {
    name: 'Костяной страж',
    glyph: 'К',
    color: 0xd9d2b6,
    hp: 70,
    ap: 4,
    mp: 2,
    initiative: 6,
    skills: ['m_bone_slam'],
    tags: ['wormhole', 'undead'],
    ai: 'melee',
    resist: { physical: 20, blood: 30 },
    vigilant: true,
  },
};

export function createMonster(type: keyof typeof MONSTERS, id: string, pos: Pos): Unit {
  const def = MONSTERS[type];
  return baseUnit({
    id,
    name: def.name,
    team: 'enemy',
    glyph: def.glyph,
    color: def.color,
    pos,
    hp: def.hp,
    maxHp: def.hp,
    baseAp: def.ap,
    ap: def.ap,
    baseMp: def.mp,
    mp: def.mp,
    initiative: def.initiative,
    skills: def.skills,
    tags: def.tags,
    ai: def.ai,
    resist: def.resist ?? {},
    vigilant: def.vigilant,
  });
}
