// Базовые типы боевого движка. Движок не знает о графике: только данные и правила.

export interface Pos {
  x: number;
  y: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

export type Team = 'player' | 'enemy';

export type School = 'fire' | 'light' | 'blood' | 'space' | 'body' | 'monster';

export type DamageType = 'physical' | 'fire' | 'light' | 'blood' | 'space';

export type Location = 'wormhole' | 'surface';

export interface Stats {
  strength: number;
  agility: number;
  intellect: number;
  will: number;
  stamina: number;
}

export type StatusId =
  | 'burn' // урон огнём в начале хода
  | 'bleed' // урон за каждую пройденную клетку
  | 'blind' // −дальность
  | 'slow' // −ОП
  | 'haste' // +ОП
  | 'damageBoost' // +% ко всему урону
  | 'fireBoost' // +% к урону огнём
  | 'shield' // поглощает урон
  | 'weaponBoost' // +% к следующему удару оружием
  | 'vigilance'; // бьёт врага, который отступает с соседней клетки

export interface Status {
  id: StatusId;
  /** Сколько своих ходов ещё действует (уменьшается в конце хода носителя). */
  duration: number;
  /** Сила эффекта: урон, процент, запас щита и т.д. */
  value: number;
  sourceId: string;
}

export type TargetKind = 'enemy' | 'ally' | 'unit' | 'self' | 'emptyCell' | 'cell';

export type AreaDef = { shape: 'circle'; radius: number } | { shape: 'lineFromCaster'; length: number };

export interface ZoneDef {
  kind: 'fire' | 'holy';
  /** Огонь: урон тому, кто входит в зону или заканчивает в ней ход. */
  damage?: number;
  /** Свет: лечение союзникам создателя в начале их хода. */
  heal?: number;
  /** Свет: урон нежити в начале её хода. */
  undeadDamage?: number;
}

export type SkillEffect =
  | {
      type: 'damage';
      damageType: DamageType;
      min: number;
      max: number;
      /** Доля нанесённого урона, возвращаемая здоровьем. */
      lifesteal?: number;
      /** Доля сопротивления, которую урон игнорирует. */
      ignoreResist?: number;
    }
  | { type: 'heal'; min: number; max: number }
  | { type: 'status'; status: StatusId; duration: number; value: number }
  | { type: 'push'; distance: number }
  | { type: 'teleportSelf' }
  /** Чисто визуальный эффект: цель подбрасывается в воздух перед уроном. */
  | { type: 'lift' }
  | { type: 'swap' }
  | { type: 'dash' }
  | { type: 'zone'; zone: ZoneDef; duration: number }
  | { type: 'manaGain'; amount: number };

export interface SkillDef {
  id: string;
  /** Иконка из набора game-icons.net (см. src/data/icons.ts). */
  icon?: string;
  name: string;
  school: School;
  description: string;
  apCost: number;
  manaCost: number;
  /** Плата здоровьем: фиксированная или процент от текущего. */
  hpCost?: { flat?: number; percentOfCurrent?: number };
  range: [number, number];
  /** Цель должна быть на одной линии (строка или столбец) с заклинателем. */
  line?: boolean;
  /** Работает только с оружием, которое бьёт соседнюю клетку. */
  needsMeleeWeapon?: boolean;
  needsLos: boolean;
  target: TargetKind;
  area?: AreaDef;
  cooldown?: number;
  effects: SkillEffect[];
}

export interface WeaponDef {
  id: string;
  icon?: string;
  name: string;
  apCost: number;
  range: [number, number];
  line?: boolean;
  min: number;
  max: number;
  /** Какая характеристика усиливает урон. */
  scaling: 'strength' | 'agility';
  critBonus?: number;
  push?: number;
  /** Обычная техника: не работает в Червоточинах. */
  technology?: boolean;
  description: string;
}

export type MonsterTag = 'wormhole' | 'undead';

export type AiArchetype = 'melee' | 'ranged';

export interface Unit {
  id: string;
  name: string;
  team: Team;
  /** Короткая подпись для отрисовки на поле. */
  glyph: string;
  /** Иконка фишки на поле; без неё рисуется буква. */
  icon?: string;
  color: number;
  pos: Pos;
  facing: Dir;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  manaRegen: number;
  baseAp: number;
  baseMp: number;
  ap: number;
  mp: number;
  initiative: number;
  stats: Stats;
  resist: Partial<Record<DamageType, number>>;
  skills: string[];
  weapon?: WeaponDef;
  tags: MonsterTag[];
  ai?: AiArchetype;
  statuses: Status[];
  cooldowns: Record<string, number>;
  weaponAttacksThisTurn: number;
  focusedThisTurn: boolean;
  /** Врождённая Бдительность (у некоторых монстров) — без статуса. */
  vigilant?: boolean;
  /** Удар Бдительности уже потрачен до начала своего следующего хода. */
  vigilanceUsed: boolean;
  alive: boolean;
}

export interface Zone {
  id: string;
  ownerId: string;
  ownerTeam: Team;
  cells: Pos[];
  def: ZoneDef;
  duration: number;
}

export type BattleEvent =
  | { type: 'move'; unitId: string; path: Pos[] }
  | { type: 'teleport'; unitId: string; to: Pos }
  | { type: 'push'; unitId: string; to: Pos }
  | { type: 'lift'; unitId: string }
  | { type: 'face'; unitId: string; facing: Dir }
  | { type: 'cast'; unitId: string; skillId: string; target: Pos }
  | { type: 'damage'; unitId: string; amount: number; absorbed: number; crit: boolean; damageType: DamageType; hp: number }
  | { type: 'heal'; unitId: string; amount: number; hp: number }
  | { type: 'mana'; unitId: string; amount: number }
  | { type: 'death'; unitId: string }
  | { type: 'turn'; unitId: string }
  | { type: 'log'; text: string };

export type BattleResult = 'ongoing' | 'victory' | 'defeat';

export interface ActionResult {
  ok: boolean;
  error?: string;
  events: BattleEvent[];
}
