import { describe, expect, it } from 'vitest';
import { Battle } from '../engine/battle';
import { Grid } from '../engine/grid';
import { runAiTurn } from '../engine/ai';
import { SKILLS } from './skills';
import { WEAPONS_BY_ID } from './weapons';
import { createHero, createMonster, spawnMonsters } from './units';
import { generateWormhole } from './mapgen';
import {
  DEFEAT_LOSS,
  REST,
  ROOMS_BEFORE_FINALE,
  afterVictory,
  doors,
  isComplete,
  rest,
  shardsKept,
  startExpedition,
} from './expedition';
import type { Unit } from '../engine/types';

const HERO = { maxHp: 100, maxMana: 60 };

function battleWith(units: Unit[], objective?: { kind: 'destroy'; unitId: string }) {
  const battle = new Battle({ grid: new Grid(8, 8, []), units, skills: SKILLS, location: 'wormhole', seed: 1, objective });
  battle.start();
  return battle;
}

describe('Expedition', () => {
  it('goes entrance → fork → fork → finale, deterministically', () => {
    let exp = startExpedition(123, 'E', HERO);
    const seen: string[][] = [];
    while (!isComplete(exp)) {
      const options = doors(exp);
      seen.push(options.map((d) => d.room));
      exp = afterVictory(exp, options[0], { hp: exp.hp, mana: exp.mana });
      exp = rest(exp, 'hp');
    }
    expect(seen).toEqual([['entrance'], ['corridor', 'lair'], ['corridor', 'lair'], [exp.finale]]);
    expect(seen.length).toBe(ROOMS_BEFORE_FINALE + 1);
    const again = startExpedition(123, 'E', HERO);
    expect(doors(again)).toEqual(doors(startExpedition(123, 'E', HERO)));
  });

  it('keeps one style for all rooms and puts the finale monster in the last room', () => {
    let exp = startExpedition(5, 'E', HERO);
    for (let i = 0; i < ROOMS_BEFORE_FINALE; i++) {
      for (const d of doors(exp)) expect(d.map.style).toBe(exp.style);
      exp = afterVictory(exp, doors(exp)[0], { hp: 50, mana: 10 });
    }
    const [finale] = doors(exp);
    expect(finale.map.monsters[0].type).toBe(exp.finale === 'boss' ? 'brood_mother' : 'source_crystal');
  });

  it('a lair has more monsters and more loot than a corridor', () => {
    const exp = afterVictory(startExpedition(9, 'E', HERO), doors(startExpedition(9, 'E', HERO))[0], { hp: 80, mana: 0 });
    const [corridor, lair] = doors(exp);
    expect(lair.map.monsters.length).toBe(corridor.map.monsters.length + 1);
    expect(lair.reward).toBeGreaterThan(corridor.reward);
  });

  it('carries hp and mana, gives back part of the mana and one rest', () => {
    const start = startExpedition(1, 'E', HERO);
    const exp = afterVictory(start, doors(start)[0], { hp: 40, mana: 0 });
    expect(exp.hp).toBe(40);
    expect(exp.mana).toBe(Math.round(60 * REST.autoManaShare));
    expect(exp.shards).toBe(doors(start)[0].reward);
    const healed = rest(exp, 'hp');
    expect(healed.hp).toBe(40 + Math.round(100 * REST.hpShare));
    // Второй привал подряд не положен.
    expect(rest(healed, 'hp')).toBe(healed);
  });

  it('defeat loses part of the loot, retreat keeps it all', () => {
    const exp = { ...startExpedition(1, 'E', HERO), shards: 30 };
    expect(shardsKept(exp, 'retreat')).toBe(30);
    expect(shardsKept(exp, 'defeat')).toBe(Math.floor(30 * (1 - DEFEAT_LOSS)));
  });
});

describe('Wormhole finales', () => {
  it('destroying the source wins the fight even with guards alive', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 1, y: 1 });
    const crystal = createMonster('source_crystal', 'm1', { x: 2, y: 1 });
    const guard = createMonster('bone_guard', 'm2', { x: 6, y: 6 });
    crystal.hp = 1;
    const battle = battleWith([hero, crystal, guard], { kind: 'destroy', unitId: 'm1' });
    expect(battle.current.id).toBe('hero');
    expect(battle.weaponAttack('hero', crystal.pos).ok).toBe(true);
    expect(battle.result).toBe('victory');
    expect(guard.alive).toBe(true);
  });

  it('the source cannot be pushed or swapped and heals its guards', () => {
    const map = generateWormhole({ seed: 3, dangerClass: 'E', room: 'source' });
    const { units, objective } = spawnMonsters(map);
    expect(objective).toEqual({ kind: 'destroy', unitId: 'm1' });
    expect(units[0].immovable).toBe(true);

    const hero = createHero('space', WEAPONS_BY_ID.hammer, { x: 1, y: 1 });
    const crystal = createMonster('source_crystal', 'm1', { x: 2, y: 1 });
    const guard = createMonster('gnawer', 'm2', { x: 6, y: 6 });
    guard.hp = 20;
    const battle = battleWith([hero, crystal, guard], { kind: 'destroy', unitId: 'm1' });
    expect(battle.isValidSkillTarget(hero, SKILLS.swap, crystal.pos)).toBe(false);
    battle.weaponAttack('hero', crystal.pos); // молот отталкивает — но не кристалл
    expect(crystal.pos).toEqual({ x: 2, y: 1 });
    // Ходим до хода кристалла: он лечит стражу.
    battle.endTurn();
    while (battle.current.id !== 'm1') {
      runAiTurn(battle, battle.current);
      battle.endTurn();
    }
    expect(guard.hp).toBeGreaterThan(20);
  });

  it('the brood mother enrages at half health', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 1, y: 1 });
    const boss = createMonster('brood_mother', 'm1', { x: 2, y: 1 });
    boss.hp = Math.ceil(boss.maxHp / 2) + 3;
    const battle = battleWith([hero, boss]);
    expect(boss.enraged).toBeFalsy();
    battle.weaponAttack('hero', boss.pos);
    expect(boss.enraged).toBe(true);
    expect(battle.statusValue(boss, 'damageBoost')).toBeGreaterThan(0);
  });
});
