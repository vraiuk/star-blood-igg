import { ENEMIES, SLOTS, WORLD } from '../data/balance';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import { type Backdrop, buildBackdrop } from './background';
import { Lighting } from './lighting';
import { Particles } from './particles';
import { type Ctx, PAL, rect } from './pixel';
import {
  ROOT_SLOT_Y, drawDrop, drawEnemy, drawEnemyEyes, drawEnemyHp, drawKeeper, drawProjectile, drawSlotMarker,
  drawStructure,
} from './sprites';
import { drawGrass, drawRoots, drawTree } from './tree';

export interface ViewState {
  /** slot id under the mouse (or selected) */
  hoverSlot: string | null;
  selectedSlot: string | null;
  hoverTree: boolean;
  /** world-space mouse position */
  mouseX: number;
  mouseY: number;
  /** range preview while hovering a ring option */
  preview: { x: number; r: number; underground: boolean } | null;
  /** ability currently aimed (shows a preview) */
  aiming: import('../data/balance').AbilityId | null;
}

/** Draws the world into the 640×360 canvas. */
export class Renderer {
  readonly particles = new Particles();
  private bg: Backdrop;
  private lighting = new Lighting();
  private shake = 0;
  private treeHurt = 0;
  private growPulse = 0;

  constructor(private c: Ctx) {
    this.bg = buildBackdrop();
  }

  /** Feed sim events to visual effects. */
  onEvents(events: GameEvent[], game: Game) {
    const p = this.particles;
    for (const e of events) {
      switch (e.type) {
        case 'hit': p.hit(e.x, e.y, e.crit); break;
        case 'enemyDied': {
          const big = e.kind === 'mother' || e.kind === 'stalker';
          const y = ENEMIES[e.kind].underground ? e.y : e.y - ENEMIES[e.kind].height * 0.5;
          p.death(e.x, y, e.kind === 'mother');
          if (big) this.shake = Math.max(this.shake, e.kind === 'mother' ? 10 : 2);
          break;
        }
        case 'acidSplash': p.acid(e.x, e.y); break;
        case 'structureLost': p.dust(e.x, e.underground ? ROOT_SLOT_Y : WORLD.groundY - 6); this.shake = Math.max(this.shake, 3); break;
        case 'beam': p.addFx('beam', e.x, e.y, 0.25, 0, e.tx, e.ty); break;
        case 'chain': p.chain(e.points); break;
        case 'ram': p.addFx('ram', e.x, WORLD.groundY - 6, 0.35, 0, e.dir); p.dust(e.x + e.dir * 12, WORLD.groundY - 2); this.shake = Math.max(this.shake, 2); break;
        case 'meteor': p.goldBurst(e.x, WORLD.groundY - 4, 24); p.dust(e.x, WORLD.groundY - 2); p.addFx('ring', e.x, WORLD.groundY - 4, 0.35, 24); this.shake = Math.max(this.shake, 4); break;
        case 'shield': p.addFx('ring', WORLD.treeX, WORLD.groundY - 50, 0.9, 60); p.goldBurst(WORLD.treeX, WORLD.groundY - 50, 50); break;
        case 'secondWind': p.goldBurst(WORLD.treeX, WORLD.groundY - 60, 120); this.shake = 8; break;
        case 'rankUp': p.goldBurst(game.state.keeper.x, WORLD.groundY - 12, 50); p.addFx('ring', game.state.keeper.x, WORLD.groundY - 10, 0.6, 40); break;
        case 'built': p.dust(e.x, e.underground ? ROOT_SLOT_Y : WORLD.groundY - 2); p.goldBurst(e.x, e.underground ? ROOT_SLOT_Y : WORLD.groundY - 10, 10); break;
        case 'sold': p.dust(e.x, WORLD.groundY - 4); break;
        case 'pickup': p.pickup(e.x, e.y, e.kind === 'star'); break;
        case 'treeHit': this.treeHurt = 0.12; if (e.amount >= 20) this.shake = Math.max(this.shake, 2); break;
        case 'treeGrew':
          this.growPulse = 1;
          this.shake = Math.max(this.shake, 4);
          p.goldBurst(WORLD.treeX, WORLD.groundY - 60, 90);
          p.addFx('growWave', WORLD.treeX, WORLD.groundY, 1.4, game.stageDef.radius);
          break;
        case 'cast':
          if (e.ability === 'hammer') {
            p.addFx('ring', e.x, WORLD.groundY - 10, 0.45, 84);
            p.goldBurst(e.x, WORLD.groundY - 10, 30);
            this.shake = Math.max(this.shake, 3);
          } else if (e.ability === 'roots') {
            p.addFx('rootBurst', e.tx, WORLD.groundY, 0.9);
            p.dust(e.tx, WORLD.groundY - 2);
          } else if (e.ability === 'spear') {
            p.emit(6, e.x, WORLD.groundY - 12, { speed: 40, max: 0.3, glow: true });
          }
          break;
        case 'spikeStrike': p.addFx(e.web ? 'web' : 'spikeThrust', e.x, ROOT_SLOT_Y, e.web ? 0.6 : 0.3, 0, e.tx, WORLD.wormLaneY - 4); break;
        case 'brood': p.acid(e.x, WORLD.groundY - 10); break;
        case 'keeperDown': p.goldBurst(game.state.keeper.x, WORLD.groundY - 10, 20); break;
        case 'keeperBack': p.goldBurst(WORLD.treeX, WORLD.groundY - 10, 20); break;
        case 'won': p.goldBurst(WORLD.treeX, WORLD.groundY - 80, 160); break;
        default: break;
      }
    }
  }

  render(game: Game, view: ViewState, time: number, dt: number) {
    const c = this.c;
    const s = game.state;
    this.shake = Math.max(0, this.shake - dt * 18);
    this.treeHurt = Math.max(0, this.treeHurt - dt);
    this.growPulse = Math.max(0, this.growPulse - dt * 0.8);
    this.particles.ambient(s.tree.radius, dt, s.phase === 'night');
    this.particles.update(dt);
    this.lighting.update(game, time, dt);

    c.save();
    c.clearRect(0, 0, WORLD.width, WORLD.height);
    c.fillStyle = PAL.void;
    c.fillRect(0, 0, WORLD.width, WORLD.height);
    const sx = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    const sy = this.shake > 0 ? Math.round((Math.random() - 0.5) * this.shake) : 0;
    c.translate(sx, sy);

    // ── backdrop with subtle parallax following the keeper
    const par = (s.keeper.x - WORLD.treeX) / WORLD.treeX;
    c.drawImage(this.bg.sky, 0, 0);
    this.drawVortex(c, time);
    c.drawImage(this.bg.far, Math.round(-12 - par * 6), 0);
    c.drawImage(this.bg.mid, Math.round(-20 - par * 12), 0);
    c.drawImage(this.bg.ground, 0, 0);

    // ── world
    drawRoots(c, s.tree.stage, time, this.treeHurt);
    const lanterns = s.structures.filter((x) => x.family === 'dragonfly')
      .map((x) => ({ x: x.x, r: game.nestStats(x).light! }));
    for (const b of s.burns) this.drawBurn(c, b.x, b.halfWidth, time);
    drawGrass(c, s.tree.radius, time, lanterns);

    if (!game.over) {
      for (const sl of SLOTS) {
        if (!game.slotUnlocked(sl) || game.structureAt(sl.id)) continue;
        drawSlotMarker(c, sl.x, sl.underground, time, view.hoverSlot === sl.id || view.selectedSlot === sl.id);
      }
    }
    for (const st of s.structures) if (st.underground) drawStructure(c, st, time);
    for (const e of s.enemies) if (ENEMIES[e.kind].underground) drawEnemy(c, e, time);
    drawTree(c, s.tree.stage, time, this.treeHurt, this.growPulse);
    if (view.hoverTree && !game.over) this.treeOutline(c, time);
    for (const st of s.structures) if (!st.underground) drawStructure(c, st, time);
    for (const e of s.enemies) if (!ENEMIES[e.kind].underground) drawEnemy(c, e, time);
    drawKeeper(c, s.keeper, time);
    this.particles.draw(c, false);

    // ── darkness
    this.lighting.drawDarkness(c);
    this.lighting.drawGlow(c, s.phase === 'day' ? 0.32 : 0.4);

    // ── above darkness: eyes, light, drops, projectiles
    for (const e of s.enemies) drawEnemyEyes(c, e, time);
    for (const d of s.drops) drawDrop(c, d, time);
    for (const p of s.projectiles) drawProjectile(c, p);
    this.particles.draw(c, true);
    for (const e of s.enemies) drawEnemyHp(c, e);
    if (view.aiming) this.drawAim(c, game, view, time);
    if (view.preview) this.drawRangeRaw(c, view.preview.x, view.preview.r, view.preview.underground, true);
    else if (view.selectedSlot) {
      const sl = SLOTS.find((x) => x.id === view.selectedSlot);
      const st = game.structureAt(view.selectedSlot);
      if (sl && st) this.drawRange(c, game, st, sl.x, sl.underground);
    }
    c.restore();
    this.vignette(c, s.phase === 'night');
  }

  /** The void vortex around the eclipse: dark shards spiralling in. */
  private drawVortex(c: Ctx, time: number) {
    const { x, y, r } = this.bg.eclipse;
    for (let i = 0; i < 70; i++) {
      const k = ((i * 0.618 + time * 0.03) % 1);
      const ang = i * 2.399 + time * 0.25 + k * 4;
      const dist = r + 6 + (1 - k) * 70;
      const px = x + Math.cos(ang) * dist * 1.3;
      const py = y + Math.sin(ang) * dist * 0.75;
      const col = k > 0.7 ? '#07060e' : '#0d0b1c';
      rect(c, px, py, 2, 1, col);
      if (i % 3 === 0) rect(c, px + 1, py - 1, 1, 1, col);
    }
  }

  private treeOutline(c: Ctx, time: number) {
    const g = 0.5 + 0.5 * Math.sin(time * 6);
    rect(c, WORLD.treeX - 1, WORLD.groundY + 6, 3, 1, g > 0.5 ? PAL.gold5 : PAL.gold3);
    rect(c, WORLD.treeX - 3, WORLD.groundY + 8, 7, 1, PAL.gold2);
  }

  private drawBurn(c: Ctx, x: number, hw: number, time: number) {
    for (let i = -hw; i <= hw; i += 2) {
      const f = Math.sin(time * 14 + i);
      rect(c, x + i, WORLD.groundY - 1 - (f > 0.3 ? 2 : 1), 1, f > 0.3 ? 2 : 1, f > 0.6 ? PAL.gold4 : '#ff7a3a');
    }
  }

  private drawRange(c: Ctx, game: Game, st: import('../sim/types').Structure, x: number, underground: boolean) {
    const ns = game.nestStats(st);
    this.drawRangeRaw(c, x, st.family === 'dragonfly' ? ns.light! : ns.range, underground, false);
  }

  private drawRangeRaw(c: Ctx, x: number, r: number, underground: boolean, bright: boolean) {
    if (!r) return;
    const y = underground ? ROOT_SLOT_Y + 2 : WORLD.groundY + 1;
    for (let i = -r; i <= r; i += 3) rect(c, x + i, y, 1, 1, 'rgba(255,214,120,0.75)');
    rect(c, x - r, y - 3, 1, 4, PAL.gold3);
    rect(c, x + r, y - 3, 1, 4, PAL.gold3);
    if (bright) {
      // dotted dome showing the reach
      const steps = Math.round(r * 1.2);
      for (let i = 0; i <= steps; i += 2) {
        const a = Math.PI + (i / steps) * Math.PI;
        rect(c, x + Math.cos(a) * r, y + (underground ? 1 : -1) * Math.abs(Math.sin(a)) * r * 0.45 * (underground ? 0.6 : 1) * (underground ? 1 : 1), 1, 1, 'rgba(255,230,150,0.55)');
      }
    }
  }

  private drawAim(c: Ctx, game: Game, view: ViewState, time: number) {
    const k = game.state.keeper;
    if (!k.alive) return;
    const g = Math.sin(time * 10) > 0;
    if (view.aiming === 'spear') {
      const dir = view.mouseX >= k.x ? 1 : -1;
      for (let i = 8; i < 270; i += 6) rect(c, k.x + dir * i, WORLD.groundY - 11, 2, 1, g ? 'rgba(255,240,180,0.7)' : 'rgba(255,200,90,0.5)');
    } else if (view.aiming === 'starfall') {
      const x = view.mouseX;
      for (let i = -46; i <= 46; i += 3) rect(c, x + i, WORLD.groundY + 1, 2, 1, g ? 'rgba(255,140,90,0.85)' : 'rgba(255,220,120,0.7)');
      for (let y = 20; y < WORLD.groundY; y += 8) rect(c, x - 30 + y * 0.12, y, 1, 3, 'rgba(255,200,120,0.35)');
    } else if (view.aiming === 'hammer') {
      for (let i = -84; i <= 84; i += 4) rect(c, k.x + i, WORLD.groundY + 1, 2, 1, 'rgba(255,230,150,0.7)');
    } else if (view.aiming === 'roots') {
      const x = view.mouseX;
      for (let i = -30; i <= 30; i += 3) rect(c, x + i, WORLD.groundY + 1, 1, 1, 'rgba(255,220,130,0.8)');
      for (let y = WORLD.groundY + 4; y < WORLD.wormLaneY + 10; y += 4) rect(c, x, y, 1, 2, 'rgba(255,200,90,0.6)');
    }
  }

  private vignette(c: Ctx, night: boolean) {
    const a = night ? 0.5 : 0.3;
    for (let i = 0; i < 18; i++) {
      c.fillStyle = `rgba(3,3,10,${(a * (1 - i / 18)) ** 1.5})`;
      c.fillRect(i, 0, 1, WORLD.height);
      c.fillRect(WORLD.width - 1 - i, 0, 1, WORLD.height);
    }
  }
}
