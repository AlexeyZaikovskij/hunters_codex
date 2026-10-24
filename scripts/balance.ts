// Балансовая симуляция: бот играет учебный бой много раз каждой школой с разным оружием.
// Запуск: npm run balance            (по умолчанию 200 боёв на сочетание)
//         npm run balance -- 500     (своё число боёв)
//
// Бот не гений, но играет разумно: каждое действие выбирает по ожидаемому урону,
// подходит на позицию для атаки, лечится и ставит щиты, когда здоровья мало.

import { Battle } from '../src/engine/battle';
import { Grid, distance } from '../src/engine/grid';
import { runAiTurn } from '../src/engine/ai';
import { SKILLS } from '../src/data/skills';
import { WEAPONS_BY_ID } from '../src/data/weapons';
import { createHero, createMonster } from '../src/data/units';
import { TRAINING_WORMHOLE as map } from '../src/data/maps';
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
  for (const e of skill.effects) {
    switch (e.type) {
      case 'damage':
        for (const t of targets) {
          if (t.team === hero.team) continue;
          let dmg = avg(e.min, e.max) * (1 + hero.stats.intellect / 100);
          if (e.damageType === 'light' && t.tags.includes('wormhole')) dmg *= 1.25;
          if (e.damageType === 'light' && t.tags.includes('undead')) dmg *= 1.5;
          dmg *= 1 - (t.resist[e.damageType] ?? 0) / 100;
          score += Math.min(dmg, t.hp) + (dmg >= t.hp ? 15 : 0) + dmg * (e.lifesteal ?? 0) * 0.5;
        }
        break;
      case 'status':
        if (e.status === 'burn' || e.status === 'bleed') score += targets.length * e.value * e.duration * 0.7;
        if (e.status === 'slow' || e.status === 'blind') score += targets.length * 3;
        break;
      case 'push':
        score += 8;
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

function simulate(affinity: Affinity, weaponId: string, seed: number) {
  const units = [
    createHero(affinity, WEAPONS_BY_ID[weaponId], map.heroStart),
    ...map.monsters.map((m, i) => createMonster(m.type, `m${i + 1}`, m.pos)),
  ];
  const b = new Battle({ grid: new Grid(map.width, map.height, map.obstacles), units, skills: SKILLS, location: 'wormhole', seed });
  b.start();
  const hero = b.unit('hero');
  const stats: Stats = { spellDamage: 0, weaponDamage: 0 };
  for (let turn = 0; turn < 300 && b.result === 'ongoing'; turn++) {
    if (b.current.team === 'enemy') runAiTurn(b, b.current);
    else heroTurn(b, hero, stats);
    if (b.result === 'ongoing') b.endTurn();
  }
  return { win: b.result === 'victory', rounds: b.round, hpLeft: hero.hp, ...stats };
}

const games = Number(process.argv[2]) || 200;
const schools: Affinity[] = ['fire', 'light', 'blood', 'space'];
const weapons = ['sword', 'hammer', 'dagger', 'bow'];
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);

console.log(`\nБалансовая симуляция: ${games} боёв на сочетание, ${map.name}\n`);
console.log('Школа          Оружие     Победы  Раунды  ОЗ в конце  Доля урона магией');
for (const school of schools) {
  for (const weapon of weapons) {
    let wins = 0, rounds = 0, hp = 0, spell = 0, weaponDmg = 0;
    for (let i = 0; i < games; i++) {
      const r = simulate(school, weapon, 1000 + i);
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
