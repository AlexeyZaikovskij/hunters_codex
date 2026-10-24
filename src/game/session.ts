import { Battle } from '../engine/battle';
import { aiTurn } from '../engine/ai';
import { Grid } from '../engine/grid';
import type { BattleEvent, Location, Pos, Unit, WeaponDef } from '../engine/types';
import { SKILLS } from '../data/skills';
import { createHero, spawnMonsters } from '../data/units';
import type { MapDef } from '../data/maps';

// Связующее звено между движком, полем боя (Phaser) и интерфейсом (React).

export type Mode = { kind: 'move' } | { kind: 'skill'; id: string } | { kind: 'weapon' };

export type Affinity = 'fire' | 'light' | 'blood' | 'space';

export interface SessionSetup {
  map: MapDef;
  affinity: Affinity;
  weapon: WeaponDef;
  location: Location;
  /** Выбранные умения Усиления тела (3 слота). */
  bodySkills: string[];
  /** В походе герой входит в зал с тем здоровьем и маной, что остались с прошлого боя. */
  heroState?: { hp: number; mana: number };
}

type Player = (events: BattleEvent[]) => Promise<void>;

export class BattleSession {
  readonly battle: Battle;
  mode: Mode = { kind: 'move' };
  hover: Pos | null = null;
  busy = false;
  log: string[] = [];
  message: string | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private player: Player = async () => {};
  private messageTimer: ReturnType<typeof setTimeout> | undefined;
  private started = false;

  constructor(readonly setup: SessionSetup) {
    const { map } = setup;
    const hero = createHero(setup.affinity, setup.weapon, map.heroStart, setup.bodySkills);
    if (setup.heroState) {
      hero.hp = Math.max(1, Math.min(hero.maxHp, setup.heroState.hp));
      hero.mana = Math.max(0, Math.min(hero.maxMana, setup.heroState.mana));
    }
    const monsters = spawnMonsters(map);
    const units: Unit[] = [hero, ...monsters.units];
    this.battle = new Battle({
      objective: monsters.objective,
      grid: new Grid(map.width, map.height, map.obstacles),
      units,
      skills: SKILLS,
      location: setup.location,
      seed: Date.now() % 2147483647,
    });
    // Для отладки из консоли браузера: window.__session
    if (import.meta.env.DEV) (window as unknown as { __session: BattleSession }).__session = this;
  }

  // ── подписка для React и Phaser ──
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }

  setPlayer(player: Player) {
    this.player = player;
  }

  get hero(): Unit {
    return this.battle.unit('hero');
  }

  get isPlayerTurn(): boolean {
    return !this.busy && this.battle.result === 'ongoing' && this.battle.current.team === 'player';
  }

  async begin() {
    if (this.started) return;
    this.started = true;
    await this.play(this.battle.start());
    await this.runEnemies();
  }

  select(mode: Mode) {
    if (!this.isPlayerTurn) return;
    if (mode.kind === 'skill') {
      const err = this.battle.skillError(this.hero, mode.id);
      if (err) return this.flash(err);
      const skill = SKILLS[mode.id];
      // Умения на себя применяются сразу.
      if (skill.target === 'self') {
        void this.act(() => this.battle.useSkill('hero', mode.id, this.hero.pos));
        return;
      }
    }
    if (mode.kind === 'weapon') {
      const err = this.battle.weaponError(this.hero);
      if (err) return this.flash(err);
    }
    const same = JSON.stringify(mode) === JSON.stringify(this.mode);
    this.mode = same ? { kind: 'move' } : mode;
    this.changed();
  }

  cancel() {
    this.mode = { kind: 'move' };
    this.changed();
  }

  setHover(p: Pos | null) {
    if (p?.x === this.hover?.x && p?.y === this.hover?.y) return;
    this.hover = p;
    this.changed();
  }

  async clickCell(p: Pos) {
    if (!this.isPlayerTurn) return;
    const mode = this.mode;
    if (mode.kind === 'move') {
      if (this.battle.pathTo(this.hero, p)) await this.act(() => this.battle.move('hero', p));
      return;
    }
    if (mode.kind === 'skill') {
      if (!this.battle.isValidSkillTarget(this.hero, SKILLS[mode.id], p)) return this.cancel();
      await this.act(() => this.battle.useSkill('hero', mode.id, p));
      return;
    }
    if (!this.battle.isValidWeaponTarget(this.hero, p)) return this.cancel();
    await this.act(() => this.battle.weaponAttack('hero', p));
  }

  async focus() {
    if (!this.isPlayerTurn) return;
    await this.act(() => this.battle.focus('hero'));
  }

  async endTurn() {
    if (!this.isPlayerTurn) return;
    this.mode = { kind: 'move' };
    await this.play(this.battle.endTurn().events);
    await this.runEnemies();
  }

  private async act(fn: () => { ok: boolean; error?: string; events: BattleEvent[] }) {
    const res = fn();
    if (!res.ok) return this.flash(res.error ?? 'Нельзя');
    this.mode = { kind: 'move' };
    await this.play(res.events);
  }

  private async runEnemies() {
    while (this.battle.result === 'ongoing' && this.battle.current.team === 'enemy') {
      const unit = this.battle.current;
      // Генератор: следующее действие монстра считается только после показа предыдущего.
      for (const step of aiTurn(this.battle, unit)) await this.play(step);
      if (this.battle.result !== 'ongoing') break;
      await this.play(this.battle.endTurn().events);
    }
    this.changed();
  }

  private async play(events: BattleEvent[]) {
    for (const e of events) if (e.type === 'log') this.log.push(e.text);
    this.busy = true;
    this.changed();
    try {
      await this.player(events);
    } finally {
      this.busy = false;
      this.changed();
    }
  }

  private flash(text: string) {
    this.message = text;
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => {
      this.message = null;
      this.changed();
    }, 1800);
    this.changed();
  }
}
