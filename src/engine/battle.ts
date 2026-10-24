import {
  DIRS,
  Grid,
  OPPOSITE,
  add,
  buildPath,
  dirTowards,
  distance,
  isInLine,
  key,
  lineDir,
  neighbors,
  samePos,
} from './grid';
import { Rng } from './rng';
import type {
  ActionResult,
  BattleEvent,
  BattleResult,
  DamageType,
  Dir,
  Location,
  Pos,
  SkillDef,
  Status,
  StatusId,
  Unit,
  WeaponDef,
  Zone,
} from './types';

// Константы из design/combat.md.
export const RULES = {
  baseCrit: 0.05,
  critPerAgility: 0.002,
  critMultiplier: 1.5,
  maxResist: 50,
  backBonus: 1.25,
  sideBonus: 1.1,
  blockExtraMp: 1,
  collisionDamagePerCell: 8,
  /** Толчок оружием (молот) бьёт о стену слабее магии: иначе это почти +50% к удару. */
  weaponCollisionDamagePerCell: 4,
  maxWeaponAttacksPerTurn: 2,
  focusAp: 2,
  focusMana: 8,
  lightVsWormhole: 25,
  lightVsUndead: 1.5,
};

export type AttackSide = 'front' | 'side' | 'back';

/** Действие игрока для прогноза: умение или удар оружием. */
export type ActionRef = { kind: 'skill'; id: string } | { kind: 'weapon' };

/** Прогноз урона или лечения по одной цели (без случайного крита). */
export interface ActionPreview {
  unitId: string;
  kind: 'damage' | 'heal';
  damageType?: DamageType;
  /** Урон после бонусов и сопротивления, до щита; для лечения — сколько вылечит. */
  min: number;
  max: number;
  /** Дополнительный урон от столкновения при отталкивании. */
  collision: number;
  /** Сколько может поглотить щит цели. */
  shield: number;
  side: AttackSide;
  /** Сопротивление цели, которое реально сработает, %. */
  resist: number;
  critChance: number;
  /** Сколько здоровья цель потеряет (с учётом щита). */
  hpLossMin: number;
  hpLossMax: number;
  lethal: 'no' | 'maybe' | 'sure';
}

export interface BattleOptions {
  grid: Grid;
  units: Unit[];
  skills: Record<string, SkillDef>;
  location: Location;
  seed: number;
}

interface DamageOptions {
  attacker: Unit | null;
  /** Откуда пришёл удар — для бонуса в спину; null — без учёта направления. */
  from: Pos | null;
  base: number;
  damageType: DamageType;
  scaling?: 'strength' | 'agility' | 'intellect' | null;
  isWeapon?: boolean;
  critBonus?: number;
  lifesteal?: number;
  ignoreResist?: number;
  /** Урон без бонусов, критов и сопротивлений (столкновения). */
  pure?: boolean;
  label?: string;
}

type CollisionHit = Pick<DamageOptions, 'base' | 'damageType' | 'pure'>;

const fail = (error: string): ActionResult => ({ ok: false, error, events: [] });

export class Battle {
  readonly grid: Grid;
  readonly units: Unit[];
  readonly skills: Record<string, SkillDef>;
  readonly location: Location;
  zones: Zone[] = [];
  order: string[];
  turnIndex = 0;
  round = 1;
  result: BattleResult = 'ongoing';
  private rng: Rng;
  private zoneCounter = 0;

  constructor(opts: BattleOptions) {
    this.grid = opts.grid;
    this.units = opts.units;
    this.skills = opts.skills;
    this.location = opts.location;
    this.rng = new Rng(opts.seed);
    // При равной инициативе первым ходит игрок.
    this.order = [...this.units]
      .sort((a, b) => b.initiative - a.initiative || (a.team === 'player' ? -1 : 1))
      .map((u) => u.id);
  }

  // ───────────────────────── Запросы ─────────────────────────

  get current(): Unit {
    return this.unit(this.order[this.turnIndex]);
  }

  unit(id: string): Unit {
    const u = this.units.find((x) => x.id === id);
    if (!u) throw new Error(`Unknown unit ${id}`);
    return u;
  }

  unitAt(p: Pos): Unit | undefined {
    return this.units.find((u) => u.alive && samePos(u.pos, p));
  }

  isFree(p: Pos): boolean {
    return this.grid.isWalkable(p) && !this.unitAt(p);
  }

  enemiesOf(unit: Unit): Unit[] {
    return this.units.filter((u) => u.alive && u.team !== unit.team);
  }

  statusValue(unit: Unit, id: StatusId): number {
    return unit.statuses.filter((s) => s.id === id).reduce((sum, s) => sum + s.value, 0);
  }

  /** Блокировка: уйти с клетки рядом с врагом стоит дополнительное ОП. */
  stepCost(unit: Unit, from: Pos): number {
    const blocked = neighbors(from).some((n) => {
      const other = this.unitAt(n);
      return other && other.team !== unit.team;
    });
    return 1 + (blocked ? RULES.blockExtraMp : 0);
  }

  reachable(unit: Unit) {
    return this.grid.reachable(
      unit.pos,
      unit.mp,
      (p) => !this.unitAt(p),
      (from) => this.stepCost(unit, from),
    );
  }

  pathTo(unit: Unit, target: Pos): { path: Pos[]; cost: number } | null {
    const map = this.reachable(unit);
    const node = map.get(key(target));
    if (!node || node.cost === 0) return null;
    return { path: buildPath(map, target), cost: node.cost };
  }

  /** Видит ли юнит клетку. Камни закрывают обзор, враги — только по центру, свои не мешают. */
  hasLos(unit: Unit, to: Pos): boolean {
    const blockers = this.units.filter((u) => u.alive && u.team !== unit.team).map((u) => u.pos);
    return this.grid.hasLineOfSight(unit.pos, to, (p) => this.grid.isObstacle(p), blockers);
  }

  effectiveRange(unit: Unit, range: [number, number]): [number, number] {
    const blind = this.statusValue(unit, 'blind');
    const max = range[1] === 0 ? 0 : Math.max(range[0], range[1] - blind);
    return [range[0], max];
  }

  attackSide(from: Pos, target: Unit): AttackSide {
    const dx = from.x - target.pos.x;
    const dy = from.y - target.pos.y;
    if (dx === 0 && dy === 0) return 'front';
    if (Math.abs(dx) === Math.abs(dy)) return 'side';
    const dir = dirTowards(target.pos, from);
    if (dir === target.facing) return 'front';
    if (dir === OPPOSITE[target.facing]) return 'back';
    return 'side';
  }

  skillError(unit: Unit, skillId: string): string | null {
    const skill = this.skills[skillId];
    if (!skill || !unit.skills.includes(skillId)) return 'Умение недоступно';
    if (unit.ap < skill.apCost) return 'Не хватает ОД';
    if (unit.mana < skill.manaCost) return 'Не хватает маны';
    if ((unit.cooldowns[skillId] ?? 0) > 0) return `Перезарядка: ${unit.cooldowns[skillId]}`;
    if (this.hpCost(unit, skill) >= unit.hp) return 'Не хватает здоровья';
    if (skill.needsMeleeWeapon && !this.meleeWeapon(unit)) return 'Нужно оружие ближнего боя';
    return null;
  }

  private hpCost(unit: Unit, skill: SkillDef): number {
    if (!skill.hpCost) return 0;
    return (skill.hpCost.flat ?? 0) + Math.floor((unit.hp * (skill.hpCost.percentOfCurrent ?? 0)) / 100);
  }

  /** Клетки в пределах дальности (без проверки цели) — для подсветки. */
  rangeCells(unit: Unit, range: [number, number], line?: boolean): Pos[] {
    const [min, max] = this.effectiveRange(unit, range);
    const cells: Pos[] = [];
    for (let y = 0; y < this.grid.height; y++)
      for (let x = 0; x < this.grid.width; x++) {
        const p = { x, y };
        const d = distance(unit.pos, p);
        if (d < min || d > max) continue;
        if (line && d > 0 && !isInLine(unit.pos, p)) continue;
        cells.push(p);
      }
    return cells;
  }

  /** Можно ли применить умение в эту клетку (без учёта ресурсов). */
  isValidSkillTarget(unit: Unit, skill: SkillDef, cell: Pos): boolean {
    if (!this.grid.inBounds(cell)) return false;
    const [min, max] = this.effectiveRange(unit, skill.range);
    const d = distance(unit.pos, cell);
    if (d < min || d > max) return false;
    if (skill.line && d > 0 && !isInLine(unit.pos, cell)) return false;
    if (skill.needsLos && d > 0 && !this.hasLos(unit, cell)) return false;
    const target = this.unitAt(cell);
    switch (skill.target) {
      case 'self':
        if (!samePos(cell, unit.pos)) return false;
        break;
      case 'enemy':
        if (!target || target.team === unit.team) return false;
        break;
      case 'ally':
        if (!target || target.team !== unit.team) return false;
        break;
      case 'unit':
        if (!target || target === unit) return false;
        break;
      case 'emptyCell':
        if (!this.isFree(cell)) return false;
        break;
      case 'cell':
        if (!this.grid.isWalkable(cell)) return false;
        break;
    }
    if (skill.effects.some((e) => e.type === 'dash')) {
      // Путь до клетки перед целью должен быть свободен.
      const dir = lineDir(unit.pos, cell)!;
      let p = add(unit.pos, DIRS[dir]);
      while (!samePos(p, cell)) {
        if (!this.isFree(p)) return false;
        p = add(p, DIRS[dir]);
      }
    }
    return true;
  }

  /** Клетки, которые задевает умение при применении в cell. */
  areaCells(unit: Unit, skill: SkillDef, cell: Pos): Pos[] {
    const area = skill.area;
    if (!area) return [cell];
    if (area.shape === 'circle') {
      const cells: Pos[] = [];
      for (let dy = -area.radius; dy <= area.radius; dy++)
        for (let dx = -area.radius; dx <= area.radius; dx++) {
          const p = { x: cell.x + dx, y: cell.y + dy };
          if (Math.abs(dx) + Math.abs(dy) <= area.radius && this.grid.inBounds(p)) cells.push(p);
        }
      return cells;
    }
    const dir = lineDir(unit.pos, cell) ?? unit.facing;
    const cells: Pos[] = [];
    let p = unit.pos;
    for (let i = 0; i < area.length; i++) {
      p = add(p, DIRS[dir]);
      if (!this.grid.isWalkable(p)) break;
      cells.push(p);
    }
    return cells;
  }

  weaponError(unit: Unit): string | null {
    const w = unit.weapon;
    if (!w) return 'Нет оружия';
    if (w.technology && this.location === 'wormhole') return 'Техника не работает в Червоточине';
    if (unit.weaponAttacksThisTurn >= RULES.maxWeaponAttacksPerTurn) return 'Не больше 2 ударов за ход';
    if (unit.ap < w.apCost) return 'Не хватает ОД';
    return null;
  }

  isValidWeaponTarget(unit: Unit, cell: Pos): boolean {
    const w = unit.weapon;
    if (!w) return false;
    const target = this.unitAt(cell);
    if (!target || target.team === unit.team) return false;
    const [min, max] = this.effectiveRange(unit, w.range);
    const d = distance(unit.pos, cell);
    if (d < min || d > max) return false;
    if (w.line && !isInLine(unit.pos, cell)) return false;
    return this.hasLos(unit, cell);
  }

  // ───────────────────────── Действия ─────────────────────────

  /** Запускает бой: первый ход. */
  start(): BattleEvent[] {
    const events: BattleEvent[] = [{ type: 'log', text: `Бой начался. Раунд 1.` }];
    this.beginTurn(this.current, events);
    this.skipDeadTurns(events);
    return events;
  }

  move(unitId: string, target: Pos): ActionResult {
    const unit = this.checkActor(unitId);
    if (typeof unit === 'string') return fail(unit);
    const route = this.pathTo(unit, target);
    if (!route) return fail('Туда не дойти');
    if (route.cost > unit.mp) return fail('Не хватает ОП');

    const events: BattleEvent[] = [];
    let walked: Pos[] = [];
    let deferred: BattleEvent[] = [];
    // Путь показывается отрезками: удар Бдительности прерывает анимацию шага.
    const flush = () => {
      if (walked.length) events.push({ type: 'move', unitId: unit.id, path: walked });
      events.push(...deferred);
      walked = [];
      deferred = [];
    };
    for (const step of route.path) {
      unit.mp -= this.stepCost(unit, unit.pos);
      unit.facing = dirTowards(unit.pos, step);
      const watchers = this.vigilantWatchers(unit, step);
      if (watchers.length) {
        flush();
        for (const w of watchers) if (unit.alive) this.vigilanceStrike(w, unit, events);
        if (!unit.alive) break;
      }
      unit.pos = step;
      walked.push(step);
      const bleed = this.statusValue(unit, 'bleed');
      if (bleed > 0) this.dealDamage(unit, { attacker: null, from: null, base: bleed, damageType: 'blood', pure: true, label: 'Кровотечение' }, deferred);
      this.enterCell(unit, deferred);
      if (!unit.alive) break;
    }
    flush();
    this.updateResult(events);
    return { ok: true, events };
  }

  useSkill(unitId: string, skillId: string, cell: Pos): ActionResult {
    const unit = this.checkActor(unitId);
    if (typeof unit === 'string') return fail(unit);
    const err = this.skillError(unit, skillId);
    if (err) return fail(err);
    const skill = this.skills[skillId];
    if (!this.isValidSkillTarget(unit, skill, cell)) return fail('Неверная цель');

    const events: BattleEvent[] = [];
    unit.ap -= skill.apCost;
    unit.mana -= skill.manaCost;
    const hpCost = this.hpCost(unit, skill);
    if (hpCost > 0) {
      unit.hp -= hpCost;
      events.push({ type: 'damage', unitId: unit.id, amount: hpCost, absorbed: 0, crit: false, damageType: 'blood', hp: unit.hp });
    }
    if (skill.cooldown) unit.cooldowns[skill.id] = skill.cooldown;
    if (!samePos(cell, unit.pos)) {
      unit.facing = dirTowards(unit.pos, cell);
      events.push({ type: 'face', unitId: unit.id, facing: unit.facing });
    }
    events.push({ type: 'cast', unitId: unit.id, skillId, target: cell });
    events.push({ type: 'log', text: `${unit.name}: ${skill.name}` });

    const area = this.areaCells(unit, skill, cell);
    const targets = this.skillTargets(unit, skill, cell);
    const castFrom = { ...unit.pos };

    for (const effect of skill.effects) {
      switch (effect.type) {
        case 'damage':
          for (const t of targets) {
            if (!t.alive) continue;
            this.dealDamage(
              t,
              {
                attacker: unit,
                from: castFrom,
                base: this.rng.int(effect.min, effect.max),
                damageType: effect.damageType,
                scaling: unit.team === 'player' ? 'intellect' : null,
                lifesteal: effect.lifesteal,
                ignoreResist: effect.ignoreResist,
              },
              events,
            );
          }
          break;
        case 'heal':
          for (const t of targets) {
            const amount = Math.round(this.rng.int(effect.min, effect.max) * (1 + unit.stats.intellect / 100));
            this.heal(t, amount, events);
          }
          break;
        case 'status':
          for (const t of targets) if (t.alive) this.addStatus(t, effect.status, effect.duration, effect.value, unit.id);
          break;
        case 'push':
          for (const t of targets) {
            if (!t.alive) continue;
            const dir = lineDir(unit.pos, t.pos) ?? dirTowards(unit.pos, t.pos);
            this.push(unit, t, dir, effect.distance, events);
          }
          break;
        case 'lift':
          for (const t of targets) events.push({ type: 'lift', unitId: t.id });
          break;
        case 'teleportSelf':
          unit.pos = { ...cell };
          events.push({ type: 'teleport', unitId: unit.id, to: { ...cell } });
          this.enterCell(unit, events);
          break;
        case 'swap': {
          const other = targets[0];
          if (!other) break;
          const a = { ...unit.pos };
          unit.pos = { ...other.pos };
          other.pos = a;
          events.push({ type: 'teleport', unitId: unit.id, to: { ...unit.pos } });
          events.push({ type: 'teleport', unitId: other.id, to: { ...other.pos } });
          this.enterCell(unit, events);
          this.enterCell(other, events);
          break;
        }
        case 'dash': {
          const dir = lineDir(unit.pos, cell)!;
          const path: Pos[] = [];
          let p = add(unit.pos, DIRS[dir]);
          while (!samePos(p, cell)) {
            path.push(p);
            p = add(p, DIRS[dir]);
          }
          if (path.length) {
            unit.pos = path[path.length - 1];
            unit.facing = dir;
            events.push({ type: 'move', unitId: unit.id, path });
            this.enterCell(unit, events);
          }
          break;
        }
        case 'zone': {
          const cells = area.filter((p) => this.grid.isWalkable(p));
          this.zones.push({
            id: `zone${++this.zoneCounter}`,
            ownerId: unit.id,
            ownerTeam: unit.team,
            cells,
            def: effect.zone,
            duration: effect.duration,
          });
          break;
        }
        case 'manaGain': {
          const gained = Math.min(effect.amount, unit.maxMana - unit.mana);
          unit.mana += gained;
          events.push({ type: 'mana', unitId: unit.id, amount: gained });
          break;
        }
      }
    }
    this.updateResult(events);
    return { ok: true, events };
  }

  weaponAttack(unitId: string, cell: Pos): ActionResult {
    const unit = this.checkActor(unitId);
    if (typeof unit === 'string') return fail(unit);
    const err = this.weaponError(unit);
    if (err) return fail(err);
    if (!this.isValidWeaponTarget(unit, cell)) return fail('Неверная цель');
    const w = unit.weapon!;
    const target = this.unitAt(cell)!;
    const events: BattleEvent[] = [];
    unit.ap -= w.apCost;
    unit.weaponAttacksThisTurn++;
    unit.facing = dirTowards(unit.pos, cell);
    events.push({ type: 'face', unitId: unit.id, facing: unit.facing });
    events.push({ type: 'cast', unitId: unit.id, skillId: 'weapon', target: cell });
    events.push({ type: 'log', text: `${unit.name}: удар (${w.name})` });
    this.dealDamage(
      target,
      {
        attacker: unit,
        from: unit.pos,
        base: this.rng.int(w.min, w.max),
        damageType: 'physical',
        scaling: w.scaling,
        isWeapon: true,
        critBonus: w.critBonus,
      },
      events,
    );
    // Усиление оружия расходуется на первый удар.
    unit.statuses = unit.statuses.filter((s) => s.id !== 'weaponBoost');
    if (w.push && target.alive) this.push(unit, target, dirTowards(unit.pos, target.pos), w.push, events, true);
    this.updateResult(events);
    return { ok: true, events };
  }

  focus(unitId: string): ActionResult {
    const unit = this.checkActor(unitId);
    if (typeof unit === 'string') return fail(unit);
    if (unit.focusedThisTurn) return fail('Уже сосредоточились в этот ход');
    if (unit.ap < RULES.focusAp) return fail('Не хватает ОД');
    if (unit.maxMana === 0) return fail('Нет маны');
    unit.ap -= RULES.focusAp;
    unit.focusedThisTurn = true;
    const gained = Math.min(RULES.focusMana, unit.maxMana - unit.mana);
    unit.mana += gained;
    return {
      ok: true,
      events: [
        { type: 'mana', unitId: unit.id, amount: gained },
        { type: 'log', text: `${unit.name} сосредотачивается: +${gained} маны` },
      ],
    };
  }

  endTurn(): ActionResult {
    if (this.result !== 'ongoing') return fail('Бой окончен');
    const events: BattleEvent[] = [];
    this.finishTurn(this.current, events);
    this.updateResult(events);
    if (this.result === 'ongoing') {
      this.advance();
      this.beginTurn(this.current, events);
      this.skipDeadTurns(events);
    }
    return { ok: true, events };
  }

  // ───────────────────────── Внутреннее ─────────────────────────

  private checkActor(unitId: string): Unit | string {
    if (this.result !== 'ongoing') return 'Бой окончен';
    const unit = this.current;
    if (unit.id !== unitId) return 'Сейчас не ваш ход';
    return unit;
  }

  private advance() {
    do {
      this.turnIndex++;
      if (this.turnIndex >= this.order.length) {
        this.turnIndex = 0;
        this.round++;
      }
    } while (!this.current.alive);
  }

  /** Если юнит погиб в начале своего хода (горение), ход сразу переходит дальше. */
  private skipDeadTurns(events: BattleEvent[]) {
    this.updateResult(events);
    while (this.result === 'ongoing' && !this.current.alive) {
      this.advance();
      this.beginTurn(this.current, events);
      this.updateResult(events);
    }
  }

  private beginTurn(unit: Unit, events: BattleEvent[]) {
    if (this.turnIndex === 0 && this.round > 1) events.push({ type: 'log', text: `Раунд ${this.round}.` });
    events.push({ type: 'turn', unitId: unit.id });
    for (const id of Object.keys(unit.cooldowns)) unit.cooldowns[id] = Math.max(0, unit.cooldowns[id] - 1);
    unit.mana = Math.min(unit.maxMana, unit.mana + unit.manaRegen);
    unit.ap = unit.baseAp;
    unit.mp = Math.max(0, unit.baseMp + this.statusValue(unit, 'haste') - this.statusValue(unit, 'slow'));
    unit.weaponAttacksThisTurn = 0;
    unit.focusedThisTurn = false;
    unit.vigilanceUsed = false;

    const burn = this.statusValue(unit, 'burn');
    if (burn > 0) this.dealDamage(unit, { attacker: null, from: null, base: burn, damageType: 'fire', label: 'Горение' }, events);

    for (const zone of this.zonesAt(unit.pos)) {
      if (!unit.alive) break;
      if (zone.def.kind !== 'holy') continue;
      if (zone.def.heal && unit.team === zone.ownerTeam) this.heal(unit, zone.def.heal, events);
      if (zone.def.undeadDamage && unit.tags.includes('undead'))
        this.dealDamage(unit, { attacker: null, from: null, base: zone.def.undeadDamage, damageType: 'light', label: 'Освящённая земля' }, events);
    }
  }

  private finishTurn(unit: Unit, events: BattleEvent[]) {
    if (unit.alive) this.burnFromZones(unit, events);
    unit.statuses = unit.statuses
      .map((s) => ({ ...s, duration: s.duration - 1 }))
      .filter((s) => s.duration > 0);
    this.zones = this.zones
      .map((z) => (z.ownerId === unit.id ? { ...z, duration: z.duration - 1 } : z))
      .filter((z) => z.duration > 0);
  }

  private zonesAt(p: Pos): Zone[] {
    return this.zones.filter((z) => z.cells.some((c) => samePos(c, p)));
  }

  /** Кого задевает умение. Площадные бьют только врагов; точечные — того, кто стоит в клетке. */
  private skillTargets(unit: Unit, skill: SkillDef, cell: Pos): Unit[] {
    if (skill.area)
      return this.areaCells(unit, skill, cell)
        .map((p) => this.unitAt(p))
        .filter((u): u is Unit => !!u && u.team !== unit.team);
    if (skill.target === 'self') return [unit];
    return [this.unitAt(cell)].filter((u): u is Unit => !!u);
  }

  /** Сколько клеток толчка цель не пройдёт (столкновение). Цель не двигается. */
  /** Чем закончится отталкивание: сколько клеток не пройдено и в кого цель врежется. */
  private pushOutcome(target: Unit, dir: Dir, distanceCells: number): { blocked: number; victim: Unit | null } {
    let p = target.pos;
    for (let moved = 0; moved < distanceCells; moved++) {
      const next = add(p, DIRS[dir]);
      if (!this.isFree(next)) return { blocked: distanceCells - moved, victim: this.unitAt(next) ?? null };
      p = next;
    }
    return { blocked: 0, victim: null };
  }

  /** Урон столкновения до сопротивления. Магия — чистый урон Пространством от Интеллекта, оружие — физический от Силы. */
  private collisionBase(source: Unit, blocked: number, byWeapon: boolean): CollisionHit {
    const perCell = byWeapon ? RULES.weaponCollisionDamagePerCell : RULES.collisionDamagePerCell;
    const stat = byWeapon ? source.stats.strength : source.stats.intellect;
    return {
      base: Math.round(perCell * blocked * (1 + stat / 100)),
      damageType: byWeapon ? 'physical' : 'space',
      pure: !byWeapon,
    };
  }

  /** Урон столкновения по конкретному юниту — так же, как его посчитает dealDamage. */
  private collisionFor(unit: Unit, c: CollisionHit): number {
    return Math.round(c.base * this.damageFactor(unit, { attacker: null, from: null, damageType: c.damageType, pure: c.pure }).factor);
  }

  /** Урон действия «на бумаге»: с характеристиками и усилениями героя, без учёта цели. */
  actionDamageRange(
    unit: Unit,
    action: ActionRef,
  ): { kind: 'damage' | 'heal'; min: number; max: number; damageType?: DamageType } | null {
    if (action.kind === 'weapon') {
      const w = unit.weapon;
      if (!w) return null;
      const { factor } = this.damageFactor(null, { attacker: unit, from: null, damageType: 'physical', scaling: w.scaling, isWeapon: true });
      return { kind: 'damage', min: Math.round(w.min * factor), max: Math.round(w.max * factor), damageType: 'physical' };
    }
    const skill = this.skills[action.id];
    for (const e of skill?.effects ?? []) {
      if (e.type === 'damage') {
        const { factor } = this.damageFactor(null, {
          attacker: unit,
          from: null,
          damageType: e.damageType,
          scaling: unit.team === 'player' ? 'intellect' : null,
        });
        return { kind: 'damage', min: Math.round(e.min * factor), max: Math.round(e.max * factor), damageType: e.damageType };
      }
      if (e.type === 'heal') {
        const k = 1 + unit.stats.intellect / 100;
        return { kind: 'heal', min: Math.round(e.min * k), max: Math.round(e.max * k) };
      }
    }
    return null;
  }

  /** Прогноз по каждой цели, если применить действие по клетке. Бой не меняется. */
  previewAction(unit: Unit, action: ActionRef, cell: Pos): ActionPreview[] {
    type Raw = Omit<ActionPreview, 'unitId' | 'hpLossMin' | 'hpLossMax' | 'lethal'>;
    const raw: { target: Unit; p: Raw }[] = [];
    const finish = (target: Unit, p: Raw) => raw.push({ target, p });
    const shieldOf = (t: Unit) => t.statuses.find((s) => s.id === 'shield')?.value ?? 0;
    // Тот, в кого врезается отброшенная цель, получает такой же урон столкновения.
    const hitVictim = (victim: Unit | null, c: CollisionHit) => {
      if (!victim) return;
      const amount = this.collisionFor(victim, c);
      const existing = raw.find((r) => r.target === victim && r.p.kind === 'damage');
      if (existing) existing.p.collision += amount;
      else
        finish(victim, {
          kind: 'damage',
          damageType: c.damageType,
          min: 0,
          max: 0,
          collision: amount,
          shield: shieldOf(victim),
          side: 'front',
          resist: 0,
          critChance: 0,
        });
    };
    const result = (): ActionPreview[] =>
      raw.map(({ target, p }) => {
        const hpLossMin = Math.max(0, p.min + p.collision - p.shield);
        const hpLossMax = Math.max(0, p.max + p.collision - p.shield);
        const lethal = p.kind === 'heal' ? 'no' : hpLossMin >= target.hp ? 'sure' : hpLossMax >= target.hp ? 'maybe' : 'no';
        return { unitId: target.id, ...p, hpLossMin, hpLossMax, lethal };
      });

    if (action.kind === 'weapon') {
      const w = unit.weapon;
      const target = this.unitAt(cell);
      if (!w || !target || !this.isValidWeaponTarget(unit, cell)) return [];
      const f = this.damageFactor(target, {
        attacker: unit,
        from: unit.pos,
        damageType: 'physical',
        scaling: w.scaling,
        isWeapon: true,
        critBonus: w.critBonus,
      });
      let collision = 0;
      let victim: { victim: Unit | null; c: CollisionHit } | null = null;
      if (w.push) {
        const o = this.pushOutcome(target, dirTowards(unit.pos, target.pos), w.push);
        if (o.blocked > 0) {
          const c = this.collisionBase(unit, o.blocked, true);
          collision = this.collisionFor(target, c);
          victim = { victim: o.victim, c };
        }
      }
      finish(target, {
        kind: 'damage',
        damageType: 'physical',
        min: Math.round(w.min * f.factor),
        max: Math.round(w.max * f.factor),
        collision,
        shield: shieldOf(target),
        side: f.side,
        resist: f.resist,
        critChance: f.critChance,
      });
      if (victim) hitVictim(victim.victim, victim.c);
      return result();
    }

    const skill = this.skills[action.id];
    if (!skill || !this.isValidSkillTarget(unit, skill, cell)) return [];
    const victims: { victim: Unit | null; c: CollisionHit }[] = [];
    for (const t of this.skillTargets(unit, skill, cell)) {
      for (const e of skill.effects) {
        if (e.type === 'damage') {
          const f = this.damageFactor(t, {
            attacker: unit,
            from: unit.pos,
            damageType: e.damageType,
            scaling: unit.team === 'player' ? 'intellect' : null,
            ignoreResist: e.ignoreResist,
          });
          const push = skill.effects.find((x) => x.type === 'push');
          let collision = 0;
          if (push?.type === 'push') {
            const dir = lineDir(unit.pos, t.pos) ?? dirTowards(unit.pos, t.pos);
            const o = this.pushOutcome(t, dir, push.distance);
            if (o.blocked > 0) {
              const c = this.collisionBase(unit, o.blocked, false);
              collision = this.collisionFor(t, c);
              victims.push({ victim: o.victim, c });
            }
          }
          finish(t, {
            kind: 'damage',
            damageType: e.damageType,
            min: Math.round(e.min * f.factor),
            max: Math.round(e.max * f.factor),
            collision,
            shield: shieldOf(t),
            side: f.side,
            resist: f.resist,
            critChance: f.critChance,
          });
        } else if (e.type === 'heal') {
          const k = 1 + unit.stats.intellect / 100;
          const room = t.maxHp - t.hp;
          finish(t, {
            kind: 'heal',
            min: Math.min(room, Math.round(e.min * k)),
            max: Math.min(room, Math.round(e.max * k)),
            collision: 0,
            shield: 0,
            side: 'front',
            resist: 0,
            critChance: 0,
          });
        }
      }
    }
    for (const v of victims) hitVictim(v.victim, v.c);
    return result();
  }

  /** Оружие, которым можно бить соседнюю клетку здесь и сейчас. */
  private meleeWeapon(unit: Unit): WeaponDef | null {
    const w = unit.weapon;
    if (!w || w.range[0] > 1) return null;
    if (w.technology && this.location === 'wormhole') return null;
    return w;
  }

  private isVigilant(u: Unit): boolean {
    if (u.vigilant) return true;
    return this.statusValue(u, 'vigilance') > 0 && !!this.meleeWeapon(u);
  }

  /** Враги с Бдительностью, от которых юнит отрывается этим шагом (был рядом — станет не рядом). */
  private vigilantWatchers(unit: Unit, next: Pos): Unit[] {
    return this.units.filter(
      (w) =>
        w.alive &&
        w.team !== unit.team &&
        !w.vigilanceUsed &&
        distance(w.pos, unit.pos) === 1 &&
        distance(w.pos, next) > 1 &&
        this.isVigilant(w),
    );
  }

  /** Бесплатный удар по отступающему. Он уже развернулся к выходу, так что это часто удар в спину. */
  private vigilanceStrike(watcher: Unit, target: Unit, events: BattleEvent[]) {
    watcher.vigilanceUsed = true;
    watcher.facing = dirTowards(watcher.pos, target.pos);
    events.push({ type: 'face', unitId: watcher.id, facing: watcher.facing });
    events.push({ type: 'cast', unitId: watcher.id, skillId: 'weapon', target: { ...target.pos } });
    events.push({ type: 'log', text: `Бдительность: ${watcher.name} бьёт отступающего` });
    const w = this.meleeWeapon(watcher);
    if (w) {
      this.dealDamage(
        target,
        {
          attacker: watcher,
          from: watcher.pos,
          base: this.rng.int(w.min, w.max),
          damageType: 'physical',
          scaling: w.scaling,
          isWeapon: true,
          critBonus: w.critBonus,
          label: 'Бдительность',
        },
        events,
      );
      return;
    }
    // Монстр бьёт своим первым умением ближнего боя.
    const skill = watcher.skills.map((id) => this.skills[id]).find((s) => s && s.range[0] <= 1);
    const dmg = skill?.effects.find((e) => e.type === 'damage');
    if (!dmg || dmg.type !== 'damage') return;
    this.dealDamage(
      target,
      { attacker: watcher, from: watcher.pos, base: this.rng.int(dmg.min, dmg.max), damageType: dmg.damageType, label: 'Бдительность' },
      events,
    );
  }

  /** Эффекты при входе на клетку: горящая земля. */
  private enterCell(unit: Unit, events: BattleEvent[]) {
    this.burnFromZones(unit, events);
  }

  /** Горящая земля обжигает только врагов того, кто её поджёг. */
  private burnFromZones(unit: Unit, events: BattleEvent[]) {
    for (const zone of this.zonesAt(unit.pos)) {
      if (!unit.alive) return;
      if (zone.def.kind === 'fire' && zone.def.damage && unit.team !== zone.ownerTeam)
        this.dealDamage(unit, { attacker: null, from: null, base: zone.def.damage, damageType: 'fire', label: 'Огонь под ногами' }, events);
    }
  }

  private addStatus(unit: Unit, id: StatusId, duration: number, value: number, sourceId: string) {
    const existing = unit.statuses.find((s) => s.id === id);
    if (id === 'haste') unit.mp += value;
    if (!existing) {
      unit.statuses.push({ id, duration, value, sourceId } satisfies Status);
      return;
    }
    existing.duration = Math.max(existing.duration, duration);
    // Щиты и усиления оружия складываются, остальное обновляется до сильнейшего.
    if (id === 'shield' || id === 'weaponBoost' || id === 'haste') existing.value += value;
    else existing.value = Math.max(existing.value, value);
  }

  private heal(unit: Unit, amount: number, events: BattleEvent[]) {
    if (!unit.alive) return;
    const healed = Math.min(amount, unit.maxHp - unit.hp);
    unit.hp += healed;
    events.push({ type: 'heal', unitId: unit.id, amount: healed, hp: unit.hp });
  }

  private push(source: Unit, target: Unit, dir: Dir, distanceCells: number, events: BattleEvent[], byWeapon = false) {
    let moved = 0;
    while (moved < distanceCells) {
      const next = add(target.pos, DIRS[dir]);
      if (!this.isFree(next)) break;
      target.pos = next;
      moved++;
      this.enterCell(target, events);
      if (!target.alive) break;
    }
    if (moved > 0) events.push({ type: 'push', unitId: target.id, to: { ...target.pos } });
    const remaining = distanceCells - moved;
    if (remaining <= 0 || !target.alive) return;

    // Столкновение: урон за каждую непройденную клетку. Если цель врезалась в другого юнита, он получает столько же.
    const hit: DamageOptions = { attacker: null, from: null, ...this.collisionBase(source, remaining, byWeapon), label: 'Столкновение' };
    const other = this.unitAt(add(target.pos, DIRS[dir]));
    this.dealDamage(target, hit, events);
    if (other) this.dealDamage(other, hit, events);
  }

  /**
   * Множитель урона без крита: характеристика, усиления, Свет против Червоточин и нежити, сторона удара, сопротивление.
   * Без цели (target = null) — только бонусы атакующего: «урон на бумаге» для подсказок.
   */
  private damageFactor(target: Unit | null, o: Omit<DamageOptions, 'base'>) {
    let factor = 1;
    let side: AttackSide = 'front';
    let resist = 0;
    let critChance = 0;
    if (o.pure) return { factor, side, resist, critChance };
    let bonus = 0;
    const a = o.attacker;
    if (a) {
      if (o.scaling) bonus += a.stats[o.scaling];
      bonus += this.statusValue(a, 'damageBoost');
      if (o.damageType === 'fire') bonus += this.statusValue(a, 'fireBoost');
      if (o.isWeapon) bonus += this.statusValue(a, 'weaponBoost');
      critChance = RULES.baseCrit + a.stats.agility * RULES.critPerAgility + (o.critBonus ?? 0);
    }
    if (target && o.damageType === 'light' && target.tags.includes('wormhole')) bonus += RULES.lightVsWormhole;
    factor *= 1 + bonus / 100;
    if (!target) return { factor, side, resist, critChance };
    if (o.damageType === 'light' && target.tags.includes('undead')) factor *= RULES.lightVsUndead;
    if (o.from) {
      side = this.attackSide(o.from, target);
      if (side === 'back') factor *= RULES.backBonus;
      if (side === 'side') factor *= RULES.sideBonus;
    }
    resist = Math.min(RULES.maxResist, target.resist[o.damageType] ?? 0) * (1 - (o.ignoreResist ?? 0));
    factor *= 1 - resist / 100;
    return { factor, side, resist, critChance };
  }

  private dealDamage(target: Unit, o: DamageOptions, events: BattleEvent[]) {
    if (!target.alive) return;
    const f = this.damageFactor(target, o);
    let amount = o.base * f.factor;
    let crit = false;
    const side = f.side;
    if (!o.pure && o.attacker && this.rng.chance(f.critChance)) {
      crit = true;
      amount *= RULES.critMultiplier;
    }
    amount = Math.max(0, Math.round(amount));

    let absorbed = 0;
    const shield = target.statuses.find((s) => s.id === 'shield');
    if (shield) {
      absorbed = Math.min(shield.value, amount);
      shield.value -= absorbed;
      if (shield.value <= 0) target.statuses = target.statuses.filter((s) => s !== shield);
    }
    const hpLoss = amount - absorbed;
    target.hp = Math.max(0, target.hp - hpLoss);
    events.push({ type: 'damage', unitId: target.id, amount: hpLoss, absorbed, crit, damageType: o.damageType, hp: target.hp });

    const notes = [crit && 'крит', side === 'back' && 'в спину', side === 'side' && 'сбоку', absorbed > 0 && `щит −${absorbed}`]
      .filter(Boolean)
      .join(', ');
    events.push({
      type: 'log',
      text: `${o.label ? `${o.label}: ` : ''}${target.name} −${hpLoss}${notes ? ` (${notes})` : ''}`,
    });

    if (o.lifesteal && o.attacker && o.attacker.alive) this.heal(o.attacker, Math.round(amount * o.lifesteal), events);

    if (target.hp <= 0) {
      target.alive = false;
      events.push({ type: 'death', unitId: target.id }, { type: 'log', text: `${target.name} повержен.` });
    }
  }

  private updateResult(events: BattleEvent[]) {
    if (this.result !== 'ongoing') return;
    const playerAlive = this.units.some((u) => u.team === 'player' && u.alive);
    const enemyAlive = this.units.some((u) => u.team === 'enemy' && u.alive);
    if (!playerAlive) this.result = 'defeat';
    else if (!enemyAlive) this.result = 'victory';
    if (this.result !== 'ongoing')
      events.push({ type: 'log', text: this.result === 'victory' ? 'Победа! Червоточина зачищена.' : 'Поражение…' });
  }
}
