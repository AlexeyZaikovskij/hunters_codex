import type { AiArchetype, MonsterTag, Pos, Stats, Unit, WeaponDef } from '../engine/types';
import type { Objective } from '../engine/battle';
import { SCHOOL_SKILLS } from './skills';
import type { MapDef } from './maps';

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

export const HERO_ICON = 'hooded-figure';

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
    icon: HERO_ICON,
    kind: 'hero',
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
  icon: string;
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
  /** Неподвижный предмет (кристалл-источник): без ходов и действий, не сдвигается. */
  object?: boolean;
  pulseHeal?: number;
  enrageAt?: number;
}

export const MONSTERS: Record<string, MonsterDef> = {
  gnawer: {
    icon: 'worm-mouth',
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
    icon: 'porcupine',
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
    icon: 'skeleton',
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
  // ── Финалы Червоточин ──
  brood_mother: {
    icon: 'spider-face',
    name: 'Червематка',
    glyph: 'М',
    color: 0x9c2f4a,
    hp: 100,
    ap: 6,
    mp: 3,
    initiative: 11,
    skills: ['m_maw', 'm_acid'],
    tags: ['wormhole'],
    ai: 'melee',
    resist: { physical: 15 },
    enrageAt: 0.5,
  },
  source_crystal: {
    icon: 'crystal-growth',
    name: 'Источник',
    glyph: '◆',
    color: 0xb06cff,
    hp: 90,
    ap: 0,
    mp: 0,
    initiative: 0,
    skills: [],
    tags: ['wormhole'],
    ai: 'object',
    // Кристалл хрупок к ударам, но магию Червоточины частично впитывает.
    resist: { physical: -20, fire: 20, light: 20, blood: 50, space: 20 },
    object: true,
    pulseHeal: 5,
  },
};

/** Обычные монстры, которые встречаются в залах (не финалы). */
export const REGULAR_MONSTERS = ['gnawer', 'spitter', 'bone_guard'] as const;

export function createMonster(type: keyof typeof MONSTERS, id: string, pos: Pos): Unit {
  const def = MONSTERS[type];
  return baseUnit({
    id,
    name: def.name,
    team: 'enemy',
    glyph: def.glyph,
    icon: def.icon,
    kind: type,
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
    immovable: def.object,
    pulseHeal: def.pulseHeal,
    enrageAt: def.enrageAt,
  });
}

/** Монстры зала и цель боя: если в зале есть источник — достаточно разрушить его. */
export function spawnMonsters(map: MapDef): { units: Unit[]; objective: Objective } {
  const units = map.monsters.map((m, i) => createMonster(m.type, `m${i + 1}`, m.pos));
  const source = units.find((u) => u.immovable);
  return { units, objective: source ? { kind: 'destroy', unitId: source.id } : { kind: 'all' } };
}
