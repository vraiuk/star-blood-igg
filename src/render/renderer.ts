import { ENEMIES, SLOTS, WORLD } from '../data/balance';
import type { Game } from '../sim/game';
import type { GameEvent } from '../sim/types';
import { type Backdrop, buildBackdrop } from './background';
import { Camera } from './camera';
import { Lighting } from './lighting';
import { Particles } from './particles';
import { type Ctx, PAL, makeCanvas, rect } from './pixel';
import {
  ROOT_SLOT_Y, drawDrop, drawEnemy, drawEnemyEyes, drawEnemyHp, drawKeeper, drawKeeperHp, drawProjectile, drawSlotMarker,
  drawStructure, drawWorker,
} from './sprites';
import { drawGrass, drawRoots, drawTree } from './tree';
import { TREE } from '../data/tree';
import { disc } from './pixel';

export interface ViewState {
  /** slot id under the mouse (or selected) */
  hoverSlot: string | null;
  selectedSlot: string | null;
  hoverTree: boolean;
  /** world-space mouse position */
  mouseX: number;
  mouseY: number;
  /** range preview while hovering a ring option */
  preview: { x: number; r: number; underground: boolean; y?: number } | null;
  /** ability currently aimed (shows a preview) */
  aiming: import('../data/balance').AbilityId | null;
}

/**
 * Draws the world into a world-sized offscreen canvas (1 px = 1 art pixel), then
 * blits the camera view onto the screen canvas with nearest-neighbour scaling.
 */
export class Renderer {
  readonly particles = new Particles();
  readonly camera = new Camera();
  private worldCv: HTMLCanvasElement;
  private c: Ctx;
  private bg: Backdrop;
  private lighting = new Lighting();
  private shake = 0;
  private treeHurt = 0;
  private growPulse = 0;
  /** full-screen impact flash (Starfall) */
  private flash = 0;

  constructor(private screen: Ctx) {
    this.bg = buildBackdrop();
    [this.worldCv, this.c] = makeCanvas(WORLD.width, WORLD.height);
  }

  /** Snap the camera (e.g. on a new run). */
  resetCamera(radius: number) { this.camera.update(radius, 0, true); }

  /** Feed sim events to visual effects. */
  onEvents(events: GameEvent[], game: Game) {
    const p = this.particles;
    for (const e of events) {
      switch (e.type) {
        case 'hit': p.hit(e.x, e.y, e.crit); break;
        case 'enemyDied': {
          const big = !!ENEMIES[e.kind].boss || e.kind === 'stalker' || e.kind === 'guard';
          const y = ENEMIES[e.kind].underground ? e.y : e.y - ENEMIES[e.kind].height * 0.5;
          p.death(e.x, y, !!ENEMIES[e.kind].boss);
          if (big) this.shake = Math.max(this.shake, ENEMIES[e.kind].boss ? 12 : 2);
          break;
        }
        case 'acidSplash': p.acid(e.x, e.y); break;
        case 'structureLost': p.dust(e.x, e.underground ? e.y : WORLD.groundY - 6); this.shake = Math.max(this.shake, 3); break;
        case 'beam': p.addFx('beam', e.x, e.y, 0.25, 0, e.tx, e.ty); break;
        case 'polaria': p.chain([[e.x, e.y], [e.tx, e.ty]]); break;
        case 'devRune': p.goldBurst(e.x, WORLD.groundY - 20, 40); p.addFx('ring', e.x, WORLD.groundY - 20, 0.8, 30); break;
        case 'chain': p.chain(e.points); break;
        case 'ram': p.addFx('ram', e.x, WORLD.groundY - 6, 0.35, 0, e.dir); p.dust(e.x + e.dir * 12, WORLD.groundY - 2); this.shake = Math.max(this.shake, 2); break;
        case 'meteor':
          p.goldBurst(e.x, WORLD.groundY - 4, 60);
          p.dust(e.x, WORLD.groundY - 2); p.dust(e.x - 10, WORLD.groundY - 2); p.dust(e.x + 10, WORLD.groundY - 2);
          p.addFx('ring', e.x, WORLD.groundY - 4, 0.5, 40);
          p.addFx('ring', e.x, WORLD.groundY - 4, 0.8, 70);
          this.flash = Math.max(this.flash, 0.35);
          this.shake = Math.max(this.shake, 9);
          break;
        case 'shield': p.addFx('ring', WORLD.treeX, WORLD.groundY - 50, 0.9, 60); p.goldBurst(WORLD.treeX, WORLD.groundY - 50, 50); break;
        case 'secondWind': p.goldBurst(WORLD.treeX, WORLD.groundY - 60, 120); this.shake = 8; break;
        case 'rankUp': p.goldBurst(game.state.keeper.x, WORLD.groundY - 12, 50); p.addFx('ring', game.state.keeper.x, WORLD.groundY - 10, 0.6, 40); break;
        case 'built': p.dust(e.x, e.underground ? e.y : WORLD.groundY - 2); p.goldBurst(e.x, e.underground ? e.y : WORLD.groundY - 10, 10); break;
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
            p.addFx('ring', e.x, WORLD.groundY - 10, 0.45, 92 * (1 + game.mods.hammerRadius));
            p.goldBurst(e.x, WORLD.groundY - 10, 30);
            this.shake = Math.max(this.shake, 3);
          } else if (e.ability === 'spear') {
            p.emit(6, e.x, WORLD.groundY - 12, { speed: 40, max: 0.3, glow: true });
          }
          break;
        case 'spikeStrike': p.addFx(e.web ? 'web' : 'spikeThrust', e.x, e.y, e.web ? 0.6 : 0.3, 0, e.tx, e.ty - 2); break;
        case 'brood': p.acid(e.x, WORLD.groundY - 10); break;
        case 'keeperDown': p.goldBurst(game.state.keeper.x, WORLD.groundY - 10, 20); break;
        case 'keeperBack': p.goldBurst(WORLD.treeX, WORLD.groundY - 10, 20); break;
        case 'won':
        case 'milestone': p.goldBurst(WORLD.treeX, WORLD.groundY - 80, 160); break;
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
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.particles.ambient(s.tree.radius, dt, s.phase === 'night');
    this.particles.update(dt);
    this.lighting.update(game, time, dt);
    this.camera.update(s.tree.radius, dt);

    c.save();
    c.clearRect(0, 0, WORLD.width, WORLD.height);
    c.fillStyle = PAL.void;
    c.fillRect(0, 0, WORLD.width, WORLD.height);
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

    for (const st of s.structures) if (st.underground) drawStructure(c, st, time);
    for (const e of s.enemies) if (ENEMIES[e.kind].underground) drawEnemy(c, e, time);
    drawTree(c, s.tree.stage, time, this.treeHurt, this.growPulse);
    if (s.tree.stage + 1 >= TREE.polariaStage) this.drawPolaria(c, game, time);
    for (const st of s.structures) {
      if (st.family === 'beetle' && st.spec === 'A' && Math.random() < dt * 4) {
        this.particles.emit(1, st.x + (Math.random() - 0.5) * 120, WORLD.groundY - 4, { speed: 10, max: 1.2, colors: ['#c8ffb0', PAL.gold4, PAL.gold2], glow: true, gravity: -20, angle: -Math.PI / 2, spread: 0.4 });
      }
    }
    if (view.hoverTree && !game.over) this.treeOutline(c, time);
    for (const st of s.structures) if (!st.underground) drawStructure(c, st, time);
    for (const e of s.enemies) if (!ENEMIES[e.kind].underground) drawEnemy(c, e, time);
    drawKeeper(c, s.keeper, time);
    for (const w of s.workers) drawWorker(c, w, time);
    this.particles.draw(c, false);

    // ── darkness
    this.lighting.drawDarkness(c);
    this.lighting.drawGlow(c, s.phase === 'day' ? 0.32 : 0.4);

    // ── above darkness: eyes, light, drops, projectiles
    for (const e of s.enemies) drawEnemyEyes(c, e, time);
    // build runes and root nodes sit above the darkness so they stay readable at night
    if (!game.over) {
      for (const sl of SLOTS) {
        if (!game.slotUnlocked(sl) || game.structureAt(sl.id)) continue;
        drawSlotMarker(c, sl.x, sl.underground, time, view.hoverSlot === sl.id || view.selectedSlot === sl.id, sl.y);
      }
    }
    for (const d of s.drops) drawDrop(c, d, time);
    for (const p of s.projectiles) drawProjectile(c, p);
    for (const t of s.tempLights) if (t.dps) this.drawDome(c, t.x, t.radius, t.life / t.maxLife, time);
    this.particles.draw(c, true);
    for (const e of s.enemies) drawEnemyHp(c, e);
    drawKeeperHp(c, s.keeper, game.keeperMaxHp());
    if (view.aiming) this.drawAim(c, game, view, time);
    if (view.preview) this.drawRangeRaw(c, view.preview.x, view.preview.r, view.preview.underground, true, view.preview.y);
    else if (view.selectedSlot) {
      const sl = SLOTS.find((x) => x.id === view.selectedSlot);
      const st = game.structureAt(view.selectedSlot);
      if (sl && st) this.drawRange(c, game, st, sl.x, sl.underground, sl.y);
    }
    c.restore();
    this.blit(s.phase === 'night');
  }

  /** Copy the camera view to the screen canvas, with shake and a vignette. */
  private blit(night: boolean) {
    const sc = this.screen;
    const W = sc.canvas.width, H = sc.canvas.height;
    const cam = this.camera;
    const k = W / cam.w;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * k : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * k : 0;
    sc.imageSmoothingEnabled = false;
    sc.fillStyle = PAL.void;
    sc.fillRect(0, 0, W, H);
    sc.drawImage(this.worldCv, cam.x, cam.y, cam.w, cam.h, sx, sy, W, H);
    const a = night ? 0.55 : 0.32;
    const g = sc.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, `rgba(3,3,10,${a})`);
    g.addColorStop(0.06, 'rgba(3,3,10,0)');
    g.addColorStop(0.94, 'rgba(3,3,10,0)');
    g.addColorStop(1, `rgba(3,3,10,${a})`);
    sc.fillStyle = g;
    sc.fillRect(0, 0, W, H);
    if (this.flash > 0) {
      sc.fillStyle = `rgba(255,236,190,${this.flash * 0.6})`;
      sc.fillRect(0, 0, W, H);
    }
  }

  /** «Купол Сияния»: a shimmering dome. */
  private drawDome(c: Ctx, x: number, r: number, k: number, time: number) {
    const steps = Math.round(r * 2);
    for (let i = 0; i <= steps; i += 2) {
      const a = Math.PI + (i / steps) * Math.PI;
      const y = WORLD.groundY + Math.sin(a) * r * 0.7;
      if (Math.sin(time * 6 + i * 0.3) > -0.3) rect(c, x + Math.cos(a) * r, y, 1, 1, k > 0.3 ? PAL.gold4 : PAL.gold2);
    }
    if (Math.random() < 0.5) this.particles.emit(1, x + (Math.random() - 0.5) * r * 1.6, WORLD.groundY - 2, { speed: 14, max: 1, colors: [PAL.gold5, PAL.gold3], glow: true, gravity: -30, angle: -Math.PI / 2, spread: 0.3 });
  }

  /** «Полярии — золотистые медузы» drifting around the young tree. */
  private drawPolaria(c: Ctx, game: Game, time: number) {
    for (const [i, [x, y]] of game.polariaPositions().entries()) {
      const bob = Math.sin(time * 2 + i) * 1.5;
      disc(c, x, y + bob, 4, PAL.gold1);
      disc(c, x, y + bob - 1, 3, PAL.gold3);
      rect(c, x - 1, y + bob - 2, 2, 1, PAL.gold5);
      for (let k = -2; k <= 2; k += 2) {
        const sway = Math.round(Math.sin(time * 3 + k + i) * 1);
        rect(c, x + k + sway, y + bob + 4, 1, 3 + (k === 0 ? 2 : 0), 'rgba(255,214,120,0.7)');
      }
    }
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

  private drawRange(c: Ctx, game: Game, st: import('../sim/types').Structure, x: number, underground: boolean, y?: number) {
    const ns = game.nestStats(st);
    this.drawRangeRaw(c, x, st.family === 'dragonfly' ? ns.light! : ns.range, underground, false, y);
  }

  private drawRangeRaw(c: Ctx, x: number, r: number, underground: boolean, bright: boolean, slotY?: number) {
    if (!r) return;
    if (underground && slotY !== undefined) {
      // spiders reach in a circle around their root knot
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        rect(c, x + Math.cos(a) * r, slotY + Math.sin(a) * r / 0.8, 1, 1, bright ? 'rgba(255,230,150,0.75)' : 'rgba(255,214,120,0.55)');
      }
      return;
    }
    const y = underground ? (slotY ?? ROOT_SLOT_Y) + 2 : WORLD.groundY + 1;
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
      const dir = k.dir;
      for (let i = 8; i < 270; i += 6) rect(c, k.x + dir * i, WORLD.groundY - 11, 2, 1, g ? 'rgba(255,240,180,0.7)' : 'rgba(255,200,90,0.5)');
    } else if (view.aiming === 'starfall') {
      const x = view.mouseX;
      for (let i = -46; i <= 46; i += 3) rect(c, x + i, WORLD.groundY + 1, 2, 1, g ? 'rgba(255,140,90,0.85)' : 'rgba(255,220,120,0.7)');
      for (let y = 20; y < WORLD.groundY; y += 8) rect(c, x - 30 + y * 0.12, y, 1, 3, 'rgba(255,200,120,0.35)');
    } else if (view.aiming === 'hammer') {
      for (let i = -84; i <= 84; i += 4) rect(c, k.x + i, WORLD.groundY + 1, 2, 1, 'rgba(255,230,150,0.7)');
    }
  }
}
