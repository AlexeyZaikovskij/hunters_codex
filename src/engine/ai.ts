import type { Battle } from './battle';
import { distance, key } from './grid';
import type { BattleEvent, Pos, Unit } from './types';

// Простой ИИ монстров:
// 1) если можно ударить с места — бьёт;
// 2) иначе идёт на клетку, откуда можно ударить (ближний бой предпочитает заходить в спину);
// 3) иначе просто сближается;
// 4) стрелок после атаки отходит подальше.

/**
 * Ход монстра как генератор: каждое действие выполняется только тогда, когда у генератора
 * просят следующий шаг. Так интерфейс успевает показать один шаг, прежде чем движок сделает следующий.
 * Ход не завершает.
 */
export function* aiTurn(battle: Battle, unit: Unit): Generator<BattleEvent[]> {
  const target = nearestEnemy(battle, unit);
  if (!target) return;

  yield* attackAll(battle, unit);

  if (battle.result === 'ongoing' && unit.alive && unit.mp > 0 && canAttackSomehow(battle, unit)) {
    const cell = bestAttackCell(battle, unit, target) ?? approachCell(battle, unit, target);
    if (cell) yield battle.move(unit.id, cell).events;
    yield* attackAll(battle, unit);
  }

  if (battle.result === 'ongoing' && unit.alive && unit.ai === 'ranged' && unit.mp > 0) {
    const away = retreatCell(battle, unit, target);
    if (away) yield battle.move(unit.id, away).events;
  }
}

/** Выполняет весь ход монстра сразу (для тестов и симуляций без анимации). */
export function runAiTurn(battle: Battle, unit: Unit): BattleEvent[][] {
  return [...aiTurn(battle, unit)];
}

function nearestEnemy(battle: Battle, unit: Unit): Unit | undefined {
  return battle.enemiesOf(unit).sort((a, b) => distance(unit.pos, a.pos) - distance(unit.pos, b.pos))[0];
}

function usableSkills(battle: Battle, unit: Unit) {
  return unit.skills.map((id) => battle.skills[id]).filter((s) => !battle.skillError(unit, s.id));
}

function canAttackSomehow(battle: Battle, unit: Unit): boolean {
  return usableSkills(battle, unit).length > 0;
}

/** Бьёт, пока хватает ОД и есть цель в зоне досягаемости. */
function* attackAll(battle: Battle, unit: Unit): Generator<BattleEvent[]> {
  for (let guard = 0; guard < 10 && battle.result === 'ongoing' && unit.alive; guard++) {
    let acted = false;
    for (const skill of usableSkills(battle, unit)) {
      const target = battle
        .enemiesOf(unit)
        .find((e) => battle.isValidSkillTarget(unit, skill, e.pos));
      if (target) {
        yield battle.useSkill(unit.id, skill.id, target.pos).events;
        acted = true;
        break;
      }
    }
    if (!acted) return;
  }
}

/** Можно ли с клетки from ударить цель хоть одним доступным умением. */
function canHitFrom(battle: Battle, unit: Unit, from: Pos, target: Unit): boolean {
  const original = unit.pos;
  unit.pos = from;
  const ok = usableSkills(battle, unit).some((s) => battle.isValidSkillTarget(unit, s, target.pos));
  unit.pos = original;
  return ok;
}

function bestAttackCell(battle: Battle, unit: Unit, target: Unit): Pos | null {
  const reach = battle.reachable(unit);
  let best: { pos: Pos; score: number } | null = null;
  for (const node of reach.values()) {
    if (node.cost === 0) continue;
    if (!canHitFrom(battle, unit, node.pos, target)) continue;
    let score = -node.cost;
    if (unit.ai === 'melee') {
      const side = battle.attackSide(node.pos, target);
      score += side === 'back' ? 10 : side === 'side' ? 4 : 0;
    } else {
      score += distance(node.pos, target.pos) * 3; // стрелок держит дистанцию
    }
    if (!best || score > best.score) best = { pos: node.pos, score };
  }
  return best?.pos ?? null;
}

/** Если ударить нельзя — подходим как можно ближе (по реальному пути, а не по прямой). */
function approachCell(battle: Battle, unit: Unit, target: Unit): Pos | null {
  const reach = battle.reachable(unit);
  // Расстояние до цели по полю без учёта ОП: волна от цели.
  // Союзники считаются проходимыми, иначе монстр мечется, когда соседи меняют позиции.
  const far = battle.grid.reachable(
    target.pos,
    999,
    (p) => {
      const other = battle.unitAt(p);
      return !other || other.team === unit.team;
    },
    () => 1,
  );
  let best: { pos: Pos; d: number } | null = null;
  for (const node of reach.values()) {
    if (node.cost === 0) continue;
    const d = far.get(key(node.pos))?.cost ?? distance(node.pos, target.pos) + 50;
    if (!best || d < best.d) best = { pos: node.pos, d };
  }
  const currentD = far.get(key(unit.pos))?.cost ?? Infinity;
  return best && best.d < currentD ? best.pos : null;
}

function retreatCell(battle: Battle, unit: Unit, target: Unit): Pos | null {
  const reach = battle.reachable(unit);
  let best: { pos: Pos; d: number } | null = null;
  for (const node of reach.values()) {
    const d = distance(node.pos, target.pos);
    if (!best || d > best.d) best = { pos: node.pos, d };
  }
  return best && best.d > distance(unit.pos, target.pos) ? best.pos : null;
}
