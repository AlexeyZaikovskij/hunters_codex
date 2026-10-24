// Балансовая симуляция: бот играет бой много раз каждой школой с разным оружием.
// Запуск: npm run balance              (200 боёв на сочетание, учебная карта)
//         npm run balance -- 500       (своё число боёв)
//         npm run balance -- 200 E     (случайные Червоточины класса E; или D)
//         npm run balance -- 200 E run (походы: 4 боя подряд с переносом здоровья и маны)
//
// Бот не гений, но играет разумно: каждое действие выбирает по ожидаемому урону,
// подходит на позицию для атаки, лечится и ставит щиты, когда здоровья мало.

import { Battle } from '../src/engine/battle';
import { Grid, distance } from '../src/engine/grid';
import { runAiTurn } from '../src/engine/ai';
import { SKILLS } from '../src/data/skills';
import { WEAPONS_BY_ID } from '../src/data/weapons';
import { createHero, spawnMonsters } from '../src/data/units';
import { TRAINING_WORMHOLE, type MapDef } from '../src/data/maps';
import { generateWormhole, type DangerClass } from '../src/data/mapgen';
import { afterVictory, doors, isComplete, rest, startExpedition } from '../src/data/expedition';
import type { Pos, SkillDef, Unit } from '../src/engine/types';

type Affinity = 'fire' | 'light' | 'blood' | 'space';

interface Option {
  score: number;
  kind: 'skill' | 'weapon';
  id: string;
  cell: Pos;
}

const avg = (min: number, max: number) => (min + max) / 2;

/** Грубая оценка пользы умения в клетке: урон, лечение, контроль. */
function scoreSkill(b: Battle, hero: Unit, skill: SkillDef, cell: Pos): number {
  const targets = skill.area
    ? b.areaCells(hero, skill, cell).map((p) => b.unitAt(p)).filter((u): u is Unit => !!u && u.team !== hero.team)
    : [b.unitAt(cell)].filter((u): u is Unit => !!u);
  let score = 0;
  // Урон — по тому же прогнозу, что видит игрок: сопротивления, щиты, спина, столкновения.
  for (const p of b.previewAction(hero, { kind: 'skill', id: skill.id }, cell)) {
    const t = b.unit(p.unitId);
    if (p.kind !== 'damage' || t.team === hero.team) continue;
    const dmg = avg(p.hpLossMin, p.hpLossMax);
    const lifesteal = skill.effects.find((e) => e.type === 'damage' && e.lifesteal);
    score += Math.min(dmg, t.hp) + (dmg >= t.hp ? 15 : 0) + (lifesteal?.type === 'damage' ? dmg * (lifesteal.lifesteal ?? 0) * 0.5 : 0);
  }
  for (const e of skill.effects) {
    switch (e.type) {
      case 'status':
        if (e.status === 'burn' || e.status === 'bleed') score += targets.length * e.value * e.duration * 0.7;
        if (e.status === 'slow' || e.status === 'blind') score += targets.length * 3;
        break;
      case 'push':
        score += 3; // отбросить врага от себя — немного полезно и без стены
        break;
      case 'zone':
        if (e.zone.kind === 'fire') score += b.enemiesOf(hero).some((x) => distance(x.pos, cell) <= 1) ? 10 : 0;
        if (e.zone.kind === 'holy') score += (hero.hp < hero.maxHp * 0.7 ? 12 : 0) + targets.filter((t) => t.tags.includes('undead')).length * 10;
        break;
      case 'heal':
        score += hero.hp < hero.maxHp * 0.6 ? Math.min(avg(e.min, e.max), hero.maxHp - hero.hp) : 0;
        break;
      case 'manaGain':
        score += hero.mana < 20 && hero.hp > 50 ? 12 : 0;
        break;
      default:
        break;
    }
  }
  return score;
}

/** Самоусиления и защита: стоит ли применять прямо сейчас. */
function scoreSelf(b: Battle, hero: Unit, skill: SkillDef): number {
  const nearEnemies = b.enemiesOf(hero).filter((e) => distance(e.pos, hero.pos) <= 3).length;
  for (const e of skill.effects) {
    if (e.type === 'status' && e.status === 'shield') return hero.hp < hero.maxHp * 0.75 && nearEnemies ? 14 : 0;
    if (e.type === 'status' && (e.status === 'fireBoost' || e.status === 'damageBoost'))
      return hero.ap >= 6 && hero.mana >= 25 && nearEnemies ? 10 : 0;
    if (e.type === 'status' && e.status === 'weaponBoost') {
      const w = hero.weapon!;
      const canHit = b.enemiesOf(hero).some((x) => b.isValidWeaponTarget(hero, x.pos));
      return canHit && hero.ap - skill.apCost >= w.apCost ? avg(w.min, w.max) * (e.value / 100) : 0;
    }
    if (e.type === 'manaGain') return hero.mana < 20 && hero.hp > 50 ? 12 : 0;
  }
  return 0;
}

function bestOption(b: Battle, hero: Unit): Option | null {
  let best: Option | null = null;
  const consider = (o: Option) => {
    if (o.score > 0 && (!best || o.score > best.score)) best = o;
  };
  for (const id of hero.skills) {
    if (b.skillError(hero, id)) continue;
    const skill = SKILLS[id];
    if (skill.target === 'self') {
      consider({ score: scoreSelf(b, hero, skill), kind: 'skill', id, cell: hero.pos });
      continue;
    }
    if (skill.effects.some((e) => e.type === 'teleportSelf' || e.type === 'swap' || e.type === 'dash')) continue;
    for (const cell of b.rangeCells(hero, skill.range, skill.line)) {
      if (!b.isValidSkillTarget(hero, skill, cell)) continue;
      // Оценка на одно ОД, чтобы дешёвые действия не проигрывали дорогим.
      consider({ score: scoreSkill(b, hero, skill, cell) / skill.apCost * 3, kind: 'skill', id, cell });
    }
  }
  const w = hero.weapon!;
  if (!b.weaponError(hero)) {
    for (const e of b.enemiesOf(hero)) {
      if (!b.isValidWeaponTarget(hero, e.pos)) continue;
      const stat = hero.stats[w.scaling];
      const boost = b.statusValue(hero, 'weaponBoost');
      const dmg = avg(w.min, w.max) * (1 + (stat + boost) / 100) * (1 - (e.resist.physical ?? 0) / 100);
      consider({ score: (Math.min(dmg, e.hp) + (dmg >= e.hp ? 15 : 0)) / w.apCost * 3, kind: 'weapon', id: 'weapon', cell: e.pos });
    }
  }
  return best;
}

interface Stats {
  spellDamage: number;
  weaponDamage: number;
}

function enemyHp(b: Battle) {
  return b.units.filter((u) => u.team === 'enemy').reduce((s, u) => s + u.hp, 0);
}

function heroTurn(b: Battle, hero: Unit, stats: Stats) {
  for (let step = 0; step < 12 && b.result === 'ongoing'; step++) {
    let option = bestOption(b, hero);
    if (!option && hero.mp > 0) {
      // Ищем клетку, откуда будет лучшая атака; иначе подходим к ближайшему врагу.
      const origin = hero.pos;
      let bestCell: { pos: Pos; score: number } | null = null;
      for (const node of b.reachable(hero).values()) {
        if (node.cost === 0) continue;
        hero.pos = node.pos;
        const o = bestOption(b, hero);
        hero.pos = origin;
        const adjacent = b.enemiesOf(hero).some((e) => distance(e.pos, node.pos) === 1);
        const score = (o?.score ?? 0) - node.cost * 0.5 - (adjacent && hero.weapon!.range[1] > 1 ? 5 : 0);
        if (o && (!bestCell || score > bestCell.score)) bestCell = { pos: node.pos, score };
      }
      if (!bestCell) {
        const enemy = b.enemiesOf(hero).sort((x, y) => distance(x.pos, hero.pos) - distance(y.pos, hero.pos))[0];
        for (const node of b.reachable(hero).values()) {
          const d = distance(node.pos, enemy.pos) + node.cost * 0.1;
          if (!bestCell || -d > bestCell.score) bestCell = { pos: node.pos, score: -d };
        }
      }
      if (bestCell && b.move('hero', bestCell.pos).ok) continue;
      return;
    }
    if (!option) break;
    const before = enemyHp(b);
    const res = option.kind === 'skill' ? b.useSkill('hero', option.id, option.cell) : b.weaponAttack('hero', option.cell);
    if (!res.ok) break;
    const dealt = before - enemyHp(b);
    if (option.kind === 'weapon') stats.weaponDamage += dealt;
    else stats.spellDamage += dealt;
  }
  if (b.result === 'ongoing' && hero.ap >= 2 && hero.mana < hero.maxMana - 5) b.focus('hero');
}

function simulate(affinity: Affinity, weaponId: string, seed: number, map: MapDef, heroState?: { hp: number; mana: number }) {
  const heroUnit = createHero(affinity, WEAPONS_BY_ID[weaponId], map.heroStart);
  if (heroState) Object.assign(heroUnit, heroState);
  const monsters = spawnMonsters(map);
  const b = new Battle({
    grid: new Grid(map.width, map.height, map.obstacles),
    units: [heroUnit, ...monsters.units],
    skills: SKILLS,
    location: 'wormhole',
    seed,
    objective: monsters.objective,
  });
  b.start();
  const hero = b.unit('hero');
  const stats: Stats = { spellDamage: 0, weaponDamage: 0 };
  for (let turn = 0; turn < 300 && b.result === 'ongoing'; turn++) {
    if (b.current.team === 'enemy') runAiTurn(b, b.current);
    else heroTurn(b, hero, stats);
    if (b.result === 'ongoing') b.endTurn();
  }
  return { win: b.result === 'victory', rounds: b.round, hpLeft: hero.hp, manaLeft: hero.mana, ...stats };
}

/** Поход ботом: на развилке логово, если здоровья больше половины; на привале — что нужнее. */
function simulateRun(affinity: Affinity, weaponId: string, seed: number, dangerClass: DangerClass) {
  let exp = startExpedition(seed, dangerClass, createHero(affinity, WEAPONS_BY_ID[weaponId], { x: 0, y: 0 }));
  while (!isComplete(exp)) {
    if (!exp.rested) exp = rest(exp, exp.hp < exp.maxHp * 0.7 || exp.mana > exp.maxMana * 0.6 ? 'hp' : 'mana');
    const options = doors(exp);
    const door = options.length > 1 && exp.hp > exp.maxHp * 0.7 ? options[1] : options[0];
    const r = simulate(affinity, weaponId, seed * 13 + exp.depth, door.map, { hp: exp.hp, mana: exp.mana });
    if (!r.win) return { closed: false, depth: exp.depth, finale: exp.finale };
    exp = afterVictory(exp, door, { hp: r.hpLeft, mana: r.manaLeft });
  }
  return { closed: true, depth: exp.depth, finale: exp.finale };
}

const games = Number(process.argv[2]) || 200;
const mapArg = process.argv[3]?.toUpperCase();
const runMode = process.argv[4] === 'run';
const dangerClass = mapArg === 'E' || mapArg === 'D' ? (mapArg as DangerClass) : null;
// На случайных картах бой номер i во всех сочетаниях идёт в одной и той же Червоточине — сравнение честное.
const maps = Array.from({ length: games }, (_, i) =>
  dangerClass ? generateWormhole({ seed: 5000 + i, dangerClass }) : TRAINING_WORMHOLE,
);
const mapLabel = dangerClass ? `случайные Червоточины класса ${dangerClass}` : TRAINING_WORMHOLE.name;
if (runMode) {
  const cls = dangerClass ?? 'E';
  console.log(`\nСимуляция походов класса ${cls}: ${games} походов на сочетание (бот: логово при здоровье > 70%)\n`);
  console.log('Школа          Оружие     Закрыто  Босс  Источник  Залов в среднем');
  for (const school of ['fire', 'light', 'blood', 'space'] as Affinity[]) {
    for (const weapon of ['sword', 'hammer', 'dagger', 'bow']) {
      let closed = 0, depthSum = 0;
      const byFinale = { boss: [0, 0], source: [0, 0] };
      for (let i = 0; i < games; i++) {
        const r = simulateRun(school, weapon, 7000 + i, cls);
        closed += +r.closed;
        depthSum += r.depth;
        if (r.depth >= 3) {
          byFinale[r.finale][1]++;
          byFinale[r.finale][0] += +r.closed;
        }
      }
      const rate = ([w, n]: number[]) => (n ? `${Math.round((w / n) * 100)}%` : '—').padStart(5);
      console.log(
        `${school.padEnd(14)} ${weapon.padEnd(10)} ${`${Math.round((closed / games) * 100)}%`.padStart(7)}  ${rate(byFinale.boss)}  ${rate(byFinale.source).padStart(8)}  ${(depthSum / games).toFixed(2).padStart(15)}`,
      );
    }
  }
  process.exit(0);
}

const schools: Affinity[] = ['fire', 'light', 'blood', 'space'];
const weapons = ['sword', 'hammer', 'dagger', 'bow'];
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);

console.log(`\nБалансовая симуляция: ${games} боёв на сочетание, ${mapLabel}\n`);
console.log('Школа          Оружие     Победы  Раунды  ОЗ в конце  Доля урона магией');
for (const school of schools) {
  for (const weapon of weapons) {
    let wins = 0, rounds = 0, hp = 0, spell = 0, weaponDmg = 0;
    for (let i = 0; i < games; i++) {
      const r = simulate(school, weapon, 1000 + i, maps[i]);
      wins += +r.win;
      rounds += r.rounds;
      if (r.win) hp += r.hpLeft;
      spell += r.spellDamage;
      weaponDmg += r.weaponDamage;
    }
    console.log(
      `${school.padEnd(14)} ${weapon.padEnd(10)} ${pct(wins / games)}  ${(rounds / games).toFixed(1).padStart(6)}  ${(wins ? hp / wins : 0).toFixed(0).padStart(10)}  ${pct(spell / Math.max(1, spell + weaponDmg)).padStart(17)}`,
    );
  }
}
