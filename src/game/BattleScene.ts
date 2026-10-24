import Phaser from 'phaser';
import type { BattleSession } from './session';
import type { BattleEvent, DamageType, Dir, Pos, Unit } from '../engine/types';
import { SKILLS } from '../data/skills';
import { key, samePos } from '../engine/grid';

// Отрисовка поля боя. Логики боя здесь нет: сцена только показывает состояние и проигрывает события.

export const CELL = 56;

const COLORS = {
  tileA: 0x1d2130,
  tileB: 0x21263a,
  gridLine: 0x2c3247,
  obstacle: 0x3b4157,
  obstacleTop: 0x4d5470,
  reach: 0x3fbf7f,
  path: 0x7cf0b2,
  range: 0x4f7bff,
  target: 0xffc24a,
  area: 0xff7a45,
  fireZone: 0xff5a1f,
  holyZone: 0xffe58a,
  current: 0xffd84a,
  player: 0x4fa3ff,
  enemy: 0xff5d5d,
};

const DAMAGE_COLORS: Record<DamageType, string> = {
  physical: '#ffffff',
  fire: '#ff8a3d',
  light: '#ffe17a',
  blood: '#ff4d6a',
  space: '#c08bff',
};

const SCHOOL_COLORS: Record<string, number> = {
  fire: 0xff7a2f,
  light: 0xffe17a,
  blood: 0xe0324f,
  space: 0xa070ff,
  body: 0x6fd3ff,
  monster: 0xb0b0b0,
  weapon: 0xffffff,
};

const FACING_ANGLE: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

interface UnitView {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Arc;
  facing: Phaser.GameObjects.Triangle;
  hpBar: Phaser.GameObjects.Rectangle;
  shieldBar: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Arc;
}

const center = (p: Pos) => ({ x: p.x * CELL + CELL / 2, y: p.y * CELL + CELL / 2 });

export class BattleScene extends Phaser.Scene {
  private session!: BattleSession;
  private overlay!: Phaser.GameObjects.Graphics;
  private zonesLayer!: Phaser.GameObjects.Graphics;
  private views = new Map<string, UnitView>();
  private unsubscribe?: () => void;

  constructor() {
    super('battle');
  }

  init(data: { session: BattleSession }) {
    this.session = data.session;
  }

  create() {
    this.drawBoard();
    this.zonesLayer = this.add.graphics();
    this.overlay = this.add.graphics();
    for (const u of this.session.battle.units) this.createUnitView(u);

    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.session.setHover(this.cellAt(p)));
    this.input.on('pointerout', () => this.session.setHover(null));
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown()) return this.session.cancel();
      const cell = this.cellAt(p);
      if (cell) void this.session.clickCell(cell);
    });

    this.session.setPlayer((events) => this.play(events));
    this.unsubscribe = this.session.subscribe(() => this.redrawOverlay());
    this.events.once('shutdown', () => this.unsubscribe?.());
    this.sync();
    void this.session.begin();
  }

  private cellAt(p: Phaser.Input.Pointer): Pos | null {
    const cell = { x: Math.floor(p.worldX / CELL), y: Math.floor(p.worldY / CELL) };
    return this.session.battle.grid.inBounds(cell) ? cell : null;
  }

  // ───────────── Статичное поле ─────────────

  private drawBoard() {
    const { grid } = this.session.battle;
    const g = this.add.graphics();
    for (let y = 0; y < grid.height; y++)
      for (let x = 0; x < grid.width; x++) {
        g.fillStyle((x + y) % 2 ? COLORS.tileA : COLORS.tileB);
        g.fillRect(x * CELL, y * CELL, CELL, CELL);
      }
    g.lineStyle(1, COLORS.gridLine, 0.6);
    for (let x = 0; x <= grid.width; x++) g.lineBetween(x * CELL, 0, x * CELL, grid.height * CELL);
    for (let y = 0; y <= grid.height; y++) g.lineBetween(0, y * CELL, grid.width * CELL, y * CELL);
    for (const k of grid.obstacles) {
      const [x, y] = k.split(',').map(Number);
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(x * CELL + 5, y * CELL + 9, CELL - 8, CELL - 8, 6);
      g.fillStyle(COLORS.obstacle);
      g.fillRoundedRect(x * CELL + 4, y * CELL + 4, CELL - 8, CELL - 8, 6);
      g.fillStyle(COLORS.obstacleTop);
      g.fillRoundedRect(x * CELL + 8, y * CELL + 6, CELL - 16, CELL - 22, 4);
    }
  }

  // ───────────── Юниты ─────────────

  private createUnitView(u: Unit) {
    const { x, y } = center(u.pos);
    const ring = this.add.circle(0, 0, 25).setStrokeStyle(3, COLORS.current).setVisible(false);
    const shadow = this.add.ellipse(0, 16, 40, 12, 0x000000, 0.4);
    const team = this.add.circle(0, 0, 21).setStrokeStyle(3, u.team === 'player' ? COLORS.player : COLORS.enemy);
    const body = this.add.circle(0, 0, 19, u.color);
    const glyph = this.add
      .text(0, 0, u.glyph, { fontFamily: 'Rubik, sans-serif', fontSize: '18px', fontStyle: 'bold', color: '#10131c' })
      .setOrigin(0.5);
    const facing = this.add.triangle(0, 0, 0, -6, 0, 6, 9, 0, 0xffffff).setOrigin(0, 0.5);
    const hpBack = this.add.rectangle(-20, -31, 40, 6, 0x000000, 0.7).setOrigin(0, 0.5);
    const hpBar = this.add.rectangle(-20, -31, 40, 6, u.team === 'player' ? 0x5be38f : 0xff5d5d).setOrigin(0, 0.5);
    const shieldBar = this.add.rectangle(-20, -36, 0, 3, 0x9fd8ff).setOrigin(0, 0.5);
    const container = this.add.container(x, y, [ring, shadow, team, body, glyph, facing, hpBack, hpBar, shieldBar]);
    container.setDepth(10 + u.pos.y);
    const view = { container, body, facing, hpBar, shieldBar, ring };
    this.views.set(u.id, view);
    this.setFacing(view, u.facing);
  }

  private setFacing(view: UnitView, dir: Dir) {
    const angle = Phaser.Math.DegToRad(FACING_ANGLE[dir]);
    view.facing.setPosition(Math.cos(angle) * 22, Math.sin(angle) * 22).setRotation(angle);
  }

  private setHp(view: UnitView, u: Unit, hp: number) {
    view.hpBar.width = 40 * Math.max(0, hp / u.maxHp);
    const shield = u.statuses.find((s) => s.id === 'shield')?.value ?? 0;
    view.shieldBar.width = Math.min(40, (40 * shield) / u.maxHp);
  }

  /** Приводит картинку в точное соответствие состоянию движка. */
  private sync() {
    const current = this.session.battle.result === 'ongoing' ? this.session.battle.current.id : null;
    for (const u of this.session.battle.units) {
      const view = this.views.get(u.id)!;
      const { x, y } = center(u.pos);
      view.container.setPosition(x, y).setDepth(10 + u.pos.y);
      view.container.setVisible(u.alive).setAlpha(1);
      this.setFacing(view, u.facing);
      this.setHp(view, u, u.hp);
      view.ring.setVisible(u.id === current);
    }
    this.redrawOverlay();
  }

  // ───────────── Подсветка ─────────────

  private redrawOverlay() {
    if (!this.overlay) return;
    const { battle, mode, hover } = this.session;
    const o = this.overlay;
    o.clear();

    this.zonesLayer.clear();
    for (const z of battle.zones) {
      const color = z.def.kind === 'fire' ? COLORS.fireZone : COLORS.holyZone;
      for (const c of z.cells) {
        this.zonesLayer.fillStyle(color, z.def.kind === 'fire' ? 0.35 : 0.22);
        this.zonesLayer.fillRect(c.x * CELL + 2, c.y * CELL + 2, CELL - 4, CELL - 4);
      }
    }

    const fill = (cells: Pos[], color: number, alpha: number) => {
      o.fillStyle(color, alpha);
      for (const c of cells) o.fillRect(c.x * CELL + 3, c.y * CELL + 3, CELL - 6, CELL - 6);
    };
    const outline = (cells: Pos[], color: number) => {
      o.lineStyle(2, color, 0.95);
      for (const c of cells) o.strokeRect(c.x * CELL + 3, c.y * CELL + 3, CELL - 6, CELL - 6);
    };

    if (hover) {
      o.lineStyle(2, 0xffffff, 0.35);
      o.strokeRect(hover.x * CELL + 1, hover.y * CELL + 1, CELL - 2, CELL - 2);
    }
    if (!this.session.isPlayerTurn) return;
    const hero = this.session.hero;

    if (mode.kind === 'move') {
      const reach = [...battle.reachable(hero).values()].filter((n) => n.cost > 0).map((n) => n.pos);
      fill(reach, COLORS.reach, 0.16);
      if (hover && reach.some((p) => samePos(p, hover))) {
        const route = battle.pathTo(hero, hover);
        if (route) fill(route.path, COLORS.path, 0.4);
      }
      return;
    }

    if (mode.kind === 'skill') {
      const skill = SKILLS[mode.id];
      const cells = battle.rangeCells(hero, skill.range, skill.line);
      const valid = cells.filter((c) => battle.isValidSkillTarget(hero, skill, c));
      const validKeys = new Set(valid.map(key));
      fill(cells.filter((c) => !validKeys.has(key(c))), COLORS.range, 0.1);
      fill(valid, COLORS.range, 0.3);
      if (hover && validKeys.has(key(hover))) {
        fill(battle.areaCells(hero, skill, hover), COLORS.area, 0.45);
        outline([hover], COLORS.target);
      }
      return;
    }

    const w = hero.weapon!;
    const cells = battle.rangeCells(hero, w.range, w.line);
    const valid = cells.filter((c) => battle.isValidWeaponTarget(hero, c));
    fill(cells, COLORS.range, 0.1);
    fill(valid, COLORS.target, 0.3);
    if (hover && valid.some((c) => samePos(c, hover))) outline([hover], COLORS.target);
  }

  // ───────────── Анимация событий ─────────────

  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => this.tweens.add({ ...config, onComplete: () => resolve() }));
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }

  private float(unitId: string, text: string, color: string, big = false) {
    const view = this.views.get(unitId);
    if (!view) return;
    const t = this.add
      .text(view.container.x + Phaser.Math.Between(-8, 8), view.container.y - 30, text, {
        fontFamily: 'Rubik, sans-serif',
        fontSize: big ? '24px' : '18px',
        fontStyle: 'bold',
        color,
        stroke: '#0b0d14',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(100);
    this.tweens.add({ targets: t, y: t.y - 36, alpha: 0, duration: 1100, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  async play(events: BattleEvent[]) {
    const battle = this.session.battle;
    for (const e of events) {
      const view = 'unitId' in e ? this.views.get(e.unitId) : undefined;
      switch (e.type) {
        case 'turn':
          for (const [id, v] of this.views) v.ring.setVisible(id === e.unitId);
          if (battle.unit(e.unitId).team === 'enemy') await this.wait(250);
          break;
        case 'face':
          if (view) this.setFacing(view, e.facing);
          break;
        case 'move':
          if (!view) break;
          for (let i = 0; i < e.path.length; i++) {
            const step = e.path[i];
            const prev = i === 0 ? null : e.path[i - 1];
            if (prev) this.setFacing(view, prev.x === step.x ? (step.y > prev.y ? 'down' : 'up') : step.x > prev.x ? 'right' : 'left');
            else {
              const from = { x: Math.floor(view.container.x / CELL), y: Math.floor(view.container.y / CELL) };
              this.setFacing(view, from.x === step.x ? (step.y > from.y ? 'down' : 'up') : step.x > from.x ? 'right' : 'left');
            }
            const c = center(step);
            await this.tween({ targets: view.container, x: c.x, y: c.y, duration: 140, ease: 'Sine.easeInOut' });
            view.container.setDepth(10 + step.y);
          }
          break;
        case 'teleport':
          if (!view) break;
          await this.tween({ targets: view.container, alpha: 0, scale: 0.4, duration: 150 });
          view.container.setPosition(center(e.to).x, center(e.to).y).setDepth(10 + e.to.y);
          await this.tween({ targets: view.container, alpha: 1, scale: 1, duration: 150 });
          break;
        case 'push':
          if (view) await this.tween({ targets: view.container, x: center(e.to).x, y: center(e.to).y, duration: 180, ease: 'Cubic.easeOut' });
          break;
        case 'lift':
          if (view) {
            await this.tween({ targets: view.container, y: view.container.y - 60, scale: 0.85, duration: 220, ease: 'Cubic.easeOut' });
            await this.tween({ targets: view.container, y: view.container.y + 60, scale: 1, duration: 160, ease: 'Cubic.easeIn' });
            this.cameras.main.shake(120, 0.006);
          }
          break;
        case 'cast': {
          const school = e.skillId === 'weapon' ? 'weapon' : SKILLS[e.skillId]?.school;
          const color = SCHOOL_COLORS[school ?? 'weapon'];
          if (view) {
            const caster = view.container;
            const to = center(e.target);
            if (e.skillId === 'weapon' || SKILLS[e.skillId]?.target !== 'self') {
              const orb = this.add.circle(caster.x, caster.y, 6, color).setDepth(90);
              await this.tween({ targets: orb, x: to.x, y: to.y, duration: 160 });
              orb.destroy();
            }
            const burst = this.add.circle(to.x, to.y, 10, color, 0.6).setDepth(90);
            this.tweens.add({ targets: burst, scale: 3, alpha: 0, duration: 300, onComplete: () => burst.destroy() });
          }
          break;
        }
        case 'damage':
          if (!view) break;
          this.setHp(view, battle.unit(e.unitId), e.hp);
          if (e.absorbed > 0) this.float(e.unitId, `🛡${e.absorbed}`, '#9fd8ff');
          if (e.amount > 0 || e.absorbed === 0) this.float(e.unitId, `−${e.amount}${e.crit ? '!' : ''}`, DAMAGE_COLORS[e.damageType], e.crit);
          view.body.setFillStyle(0xffffff);
          await this.wait(90);
          view.body.setFillStyle(battle.unit(e.unitId).color);
          await this.wait(140);
          break;
        case 'heal':
          if (!view) break;
          this.setHp(view, battle.unit(e.unitId), e.hp);
          this.float(e.unitId, `+${e.amount}`, '#5be38f');
          await this.wait(200);
          break;
        case 'mana':
          this.float(e.unitId, `+${e.amount} маны`, '#7fb2ff');
          await this.wait(150);
          break;
        case 'death':
          if (view) await this.tween({ targets: view.container, alpha: 0, scale: 0.5, duration: 300 });
          break;
        case 'log':
          break;
      }
    }
    this.sync();
  }
}
