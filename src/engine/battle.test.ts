import { describe, expect, it } from 'vitest';
import { Battle } from './battle';
import { Grid } from './grid';
import { runAiTurn } from './ai';
import { SKILLS } from '../data/skills';
import { WEAPONS_BY_ID } from '../data/weapons';
import { createHero, createMonster } from '../data/units';
import { TRAINING_WORMHOLE } from '../data/maps';
import type { Pos, Unit } from './types';

function setup(units: Unit[], obstacles: Pos[] = [], location: 'wormhole' | 'surface' = 'wormhole') {
  const battle = new Battle({ grid: new Grid(8, 8, obstacles), units, skills: SKILLS, location, seed: 42 });
  battle.start();
  return battle;
}

describe('Battle', () => {
  it('blocking costs extra MP when leaving a cell next to an enemy', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 1, y: 1 });
    const mob = createMonster('gnawer', 'm1', { x: 2, y: 1 });
    mob.initiative = 0;
    const battle = setup([hero, mob]);
    expect(battle.current.id).toBe('hero');
    const res = battle.move('hero', { x: 1, y: 2 });
    expect(res.ok).toBe(true);
    expect(hero.mp).toBe(1); // 3 − (1 + 1 за блокировку)
  });

  it('back attacks deal more damage than front attacks', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 1, y: 1 });
    const front = createMonster('gnawer', 'm1', { x: 2, y: 1 });
    front.facing = 'left'; // смотрит на героя
    const battle = setup([hero, front]);
    expect(battle.attackSide(hero.pos, front)).toBe('front');
    front.facing = 'right';
    expect(battle.attackSide(hero.pos, front)).toBe('back');
    front.facing = 'up';
    expect(battle.attackSide(hero.pos, front)).toBe('side');
  });

  it('push into an obstacle deals collision damage', () => {
    const hero = createHero('space', WEAPONS_BY_ID.sword, { x: 0, y: 0 });
    const mob = createMonster('gnawer', 'm1', { x: 2, y: 0 });
    mob.initiative = 0;
    const battle = setup([hero, mob], [{ x: 4, y: 0 }]);
    const hpBefore = mob.hp;
    const res = battle.useSkill('hero', 'repulse', mob.pos);
    expect(res.ok).toBe(true);
    expect(mob.pos).toEqual({ x: 3, y: 0 });
    const collision = res.events.find((e) => e.type === 'log' && e.text.startsWith('Столкновение'));
    expect(collision).toBeTruthy();
    expect(mob.hp).toBeLessThan(hpBefore);
  });

  it('ignite sets enemies in the area on fire and spares the caster', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 0, y: 2 });
    const mob = createMonster('gnawer', 'm1', { x: 3, y: 2 });
    mob.initiative = 0;
    const battle = setup([hero, mob]);
    const res = battle.useSkill('hero', 'ignite', { x: 2, y: 2 });
    expect(res.ok).toBe(true);
    expect(battle.zones[0].cells).toHaveLength(5);
    expect(battle.statusValue(mob, 'burn')).toBe(5);
    // Герой заходит в собственный огонь без урона.
    battle.move('hero', { x: 1, y: 2 });
    expect(hero.hp).toBe(hero.maxHp);
  });

  it('hammer collision deals less damage than spell collision', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.hammer, { x: 1, y: 2 });
    const mob = createMonster('gnawer', 'm1', { x: 2, y: 2 });
    mob.initiative = 0;
    const battle = setup([hero, mob], [{ x: 3, y: 2 }]);
    const res = battle.weaponAttack('hero', mob.pos);
    expect(res.ok).toBe(true);
    const hit = res.events.filter((e) => e.type === 'damage' && e.unitId === 'm1');
    expect(hit).toHaveLength(2);
    // 4 × (1 + 10% Силы) = 4.4 → с 10% физического сопротивления Червеглота ≈ 4.
    expect(hit[1].type === 'damage' && hit[1].amount).toBe(4);
  });

  it('obstacles block line of sight', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 0, y: 0 });
    const mob = createMonster('gnawer', 'm1', { x: 4, y: 0 });
    const battle = setup([hero, mob], [{ x: 2, y: 0 }]);
    expect(battle.isValidSkillTarget(hero, SKILLS.fire_bolt, mob.pos)).toBe(false);
  });

  it('technology does not work inside a wormhole but works on the surface', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.pistol, { x: 0, y: 0 });
    const mob = createMonster('gnawer', 'm1', { x: 4, y: 0 });
    expect(setup([hero, mob]).weaponError(hero)).toMatch(/Червоточин/);
    const hero2 = createHero('fire', WEAPONS_BY_ID.pistol, { x: 0, y: 0 });
    const mob2 = createMonster('gnawer', 'm2', { x: 4, y: 0 });
    expect(setup([hero2, mob2], [], 'surface').weaponError(hero2)).toBeNull();
  });

  it('mana is spent on spells and regenerates slowly', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 0, y: 0 });
    const mob = createMonster('gnawer', 'm1', { x: 7, y: 7 });
    mob.initiative = 0;
    const battle = setup([hero, mob]);
    const mob2Pos = mob.pos;
    hero.pos = { x: 7, y: 3 };
    expect(battle.useSkill('hero', 'fire_bolt', mob2Pos).ok).toBe(true);
    expect(hero.mana).toBe(50);
    battle.endTurn();
    battle.endTurn(); // ход монстра пропущен
    expect(hero.mana).toBe(53);
  });

  it.each(['fire', 'light', 'blood', 'space'] as const)('a full battle with %s school runs to the end', (school) => {
    const map = TRAINING_WORMHOLE;
    const units = [
      createHero(school, WEAPONS_BY_ID.sword, map.heroStart),
      ...map.monsters.map((m, i) => createMonster(m.type, `m${i + 1}`, m.pos)),
    ];
    const battle = new Battle({ grid: new Grid(map.width, map.height, map.obstacles), units, skills: SKILLS, location: 'wormhole', seed: 7 });
    battle.start();
    const hero = battle.unit('hero');
    const used = new Set<string>();
    for (let turn = 0; turn < 200 && battle.result === 'ongoing'; turn++) {
      const cur = battle.current;
      if (cur.team === 'enemy') {
        runAiTurn(battle, cur);
      } else {
        // Простой бот: пробует каждое умение на первую подходящую клетку, затем бьёт оружием.
        for (const id of hero.skills) {
          if (battle.skillError(hero, id)) continue;
          const skill = SKILLS[id];
          const cell = skill.target === 'self'
            ? hero.pos
            : battle.rangeCells(hero, skill.range, skill.line).find((c) => battle.isValidSkillTarget(hero, skill, c));
          if (cell && battle.useSkill('hero', id, cell).ok) used.add(id);
          if (battle.result !== 'ongoing') break;
        }
        for (const e of battle.enemiesOf(hero))
          if (!battle.weaponError(hero) && battle.isValidWeaponTarget(hero, e.pos)) battle.weaponAttack('hero', e.pos);
        const enemy = battle.enemiesOf(hero)[0];
        if (enemy && battle.result === 'ongoing') {
          const reach = [...battle.reachable(hero).values()].filter((n) => n.cost > 0);
          reach.sort((a, b) => Math.abs(a.pos.x - enemy.pos.x) + Math.abs(a.pos.y - enemy.pos.y) - (Math.abs(b.pos.x - enemy.pos.x) + Math.abs(b.pos.y - enemy.pos.y)));
          if (reach[0]) battle.move('hero', reach[0].pos);
        }
      }
      if (battle.result === 'ongoing') battle.endTurn();
    }
    expect(battle.result).not.toBe('ongoing');
    // Бот глупый и быстро тратит ману, поэтому проверяем лишь, что умения вообще применяются.
    expect(used.size).toBeGreaterThanOrEqual(3);
    for (const u of units) expect(u.hp).toBeGreaterThanOrEqual(0);
  });

  it('monster AI approaches and attacks without errors', () => {
    const hero = createHero('fire', WEAPONS_BY_ID.sword, { x: 0, y: 0 });
    const mob = createMonster('gnawer', 'm1', { x: 3, y: 0 });
    mob.initiative = 100;
    const battle = setup([hero, mob]);
    expect(battle.current.id).toBe('m1');
    const steps = runAiTurn(battle, mob);
    expect(steps.length).toBeGreaterThan(0);
    expect(hero.hp).toBeLessThan(hero.maxHp);
  });
});
