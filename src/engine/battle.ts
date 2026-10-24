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
  maxWeaponAttacksPerTurn: 2,
  focusAp: 2,
  focusMana: 8,
  lightVsWormhole: 25,
  lightVsUndead: 1.5,
};

export type AttackSide = 'front' | 'side' | 'back';

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

  hasLos(from: Pos, to: Pos): boolean {
    return this.grid.hasLineOfSight(from, to, (p) => this.grid.isObstacle(p) || !!this.unitAt(p));
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
    if (skill.needsLos && d > 0 && !this.hasLos(unit.pos, cell)) return false;
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
    return this.hasLos(unit.pos, cell);
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
    const walked: Pos[] = [];
    const deferred: BattleEvent[] = [];
    for (const step of route.path) {
      unit.mp -= this.stepCost(unit, unit.pos);
      unit.facing = dirTowards(unit.pos, step);
      unit.pos = step;
      walked.push(step);
      const bleed = this.statusValue(unit, 'bleed');
      if (bleed > 0) this.dealDamage(unit, { attacker: null, from: null, base: bleed, damageType: 'blood', pure: true, label: 'Кровотечение' }, deferred);
      this.enterCell(unit, deferred);
      if (!unit.alive) break;
    }
    events.push({ type: 'move', unitId: unit.id, path: walked }, ...deferred);
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
    // Площадные умения бьют только врагов; точечные — того, кто стоит в клетке.
    const targets = skill.area
      ? area.map((p) => this.unitAt(p)).filter((u): u is Unit => !!u && u.team !== unit.team)
      : skill.target === 'self'
        ? [unit]
        : [this.unitAt(cell)].filter((u): u is Unit => !!u);
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
    if (w.push && target.alive) this.push(unit, target, dirTowards(unit.pos, target.pos), w.push, events);
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

  private push(source: Unit, target: Unit, dir: Dir, distanceCells: number, events: BattleEvent[]) {
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

    // Столкновение: урон за каждую непройденную клетку.
    const damage = Math.round(RULES.collisionDamagePerCell * remaining * (1 + source.stats.intellect / 100));
    this.dealDamage(target, { attacker: null, from: null, base: damage, damageType: 'space', pure: true, label: 'Столкновение' }, events);
    const other = this.unitAt(add(target.pos, DIRS[dir]));
    if (other)
      this.dealDamage(other, { attacker: null, from: null, base: Math.round(damage / 2), damageType: 'space', pure: true, label: 'Столкновение' }, events);
  }

  private dealDamage(target: Unit, o: DamageOptions, events: BattleEvent[]) {
    if (!target.alive) return;
    let amount = o.base;
    let crit = false;
    let side: AttackSide = 'front';
    if (!o.pure) {
      let bonus = 0;
      const a = o.attacker;
      if (a) {
        if (o.scaling) bonus += a.stats[o.scaling];
        bonus += this.statusValue(a, 'damageBoost');
        if (o.damageType === 'fire') bonus += this.statusValue(a, 'fireBoost');
        if (o.isWeapon) bonus += this.statusValue(a, 'weaponBoost');
      }
      if (o.damageType === 'light' && target.tags.includes('wormhole')) bonus += RULES.lightVsWormhole;
      amount *= 1 + bonus / 100;
      if (o.damageType === 'light' && target.tags.includes('undead')) amount *= RULES.lightVsUndead;

      if (o.from) {
        side = this.attackSide(o.from, target);
        if (side === 'back') amount *= RULES.backBonus;
        if (side === 'side') amount *= RULES.sideBonus;
      }
      if (a) {
        const critChance = RULES.baseCrit + a.stats.agility * RULES.critPerAgility + (o.critBonus ?? 0);
        if (this.rng.chance(critChance)) {
          crit = true;
          amount *= RULES.critMultiplier;
        }
      }
      const resist = Math.min(RULES.maxResist, target.resist[o.damageType] ?? 0) * (1 - (o.ignoreResist ?? 0));
      amount *= 1 - resist / 100;
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
