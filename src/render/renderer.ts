import { ABILITIES, ENEMIES, SLOTS, WORLD, crownPos, treeScale } from '../data/balance';
import { beamFalloff, type Game } from '../sim/game';
import type { GameEvent, Keeper } from '../sim/types';
import { type Backdrop, buildBackdrop } from './background';
import { Camera } from './camera';
import { Lighting } from './lighting';
import { Particles } from './particles';
import { type Ctx, PAL, line, makeCanvas, rect } from './pixel';
import {
  ROOT_SLOT_Y, drawTunnel, drawTunnelMouths, drawFog, drawFogEdge, drawDragonfly, dragonflyHome, drawAffix, drawWeb, drawDrop, drawEnemy, drawEnemyEyes, drawEnemyHp, drawKeeper, drawKeeperHp, drawProjectile, drawSlotMarker,
  drawCrownNest, drawCrownSlot, drawSoldier, drawStructure, drawWorker,
} from './sprites';
import { drawGrass, drawRoots, drawTree, treeLook } from './tree';
import { TREE } from '../data/tree';
import { runeColor } from '../data/runes';
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
  preview: { x: number; r: number; underground: boolean; y?: number; merge?: { to: number; from: number[] } } | null;
  /** ability currently aimed (shows a preview) */
  aiming: import('../data/balance').AbilityId | null;
}

/** Hard outlines around nests (off: readability comes from glow and warm colours instead). */
const OUTLINE_NESTS = false;

/**
 * Draws the world into a world-sized offscreen canvas (1 px = 1 art pixel), then
 * blits the camera view onto the screen canvas with nearest-neighbour scaling.
 */
export class Renderer {
  readonly particles = new Particles();
  readonly camera = new Camera();
  private worldCv: HTMLCanvasElement;
  private c: Ctx;
  /** nest layer + its tinted copy, used to draw a glowing outline around nests */
  private nestCv: HTMLCanvasElement;
  private nestCtx: Ctx;
  private rimCv: HTMLCanvasElement;
  private rimCtx: Ctx;
  private bg: Backdrop;
  private lighting = new Lighting();
  private shake = 0;
  private treeHurt = 0;
  private growPulse = 0;
  /** full-screen impact flash (Starfall) */
  private flash = 0;
  /** the Tree's fall after defeat: seconds since it began (−1 = standing), side, crash done */
  private fallT = -1;
  private fallDir: 1 | -1 = 1;
  private fellDown = false;

  constructor(private screen: Ctx) {
    this.bg = buildBackdrop();
    [this.worldCv, this.c] = makeCanvas(WORLD.width, WORLD.height);
    [this.nestCv, this.nestCtx] = makeCanvas(WORLD.width, WORLD.height);
    [this.rimCv, this.rimCtx] = makeCanvas(WORLD.width, WORLD.height);
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
          const big = !!ENEMIES[e.kind].boss || e.kind === 'stalker' || e.kind === 'guard' || e.kind === 'tyrant' || e.kind === 'devourer';
          const y = ENEMIES[e.kind].underground ? e.y : e.y - ENEMIES[e.kind].height * 0.5;
          p.death(e.x, y, !!ENEMIES[e.kind].boss);
          if (big) this.shake = Math.max(this.shake, ENEMIES[e.kind].boss ? 12 : 2);
          break;
        }
        case 'acidSplash': p.acid(e.x, e.y); break;
        case 'structureLost': p.dust(e.x, e.underground ? e.y : WORLD.groundY - 6); this.shake = Math.max(this.shake, 3); break;
        case 'beam': p.addFx('beam', e.x, e.y, 0.25, 0, e.tx, e.ty); break;
        case 'polaria': p.chain([[e.x, e.y], [e.tx, e.ty]]); break;
        case 'heal': p.heal(e.x, e.y, e.amount); break;
        case 'cleave':
          p.addFx('ring', e.x, WORLD.groundY - 6, 0.25, e.r);
          p.emit(6, e.x, WORLD.groundY - 6, { speed: 60, max: 0.3, colors: ['#ffd070', '#c89a3a', '#5a3a1a'] });
          break;
        case 'devour':
          p.emit(24, e.x, WORLD.groundY - 12, { speed: 70, max: 0.8, colors: ['#c23a5a', '#5a1020', PAL.gold3], gravity: 120 });
          this.shake = Math.max(this.shake, 6);
          break;
        case 'sacrifice':
          p.goldBurst(e.x, WORLD.groundY - 14, 220);
          p.addFx('ring', e.x, WORLD.groundY - 10, 0.5, 90);
          p.addFx('ring', e.x, WORLD.groundY - 10, 0.9, 170);
          p.addFx('growWave', e.x, WORLD.groundY, 0.9, 170);
          this.flash = Math.max(this.flash, 0.8);
          this.shake = Math.max(this.shake, 18);
          break;
        case 'plateBreak':
          p.emit(18, e.x, e.y, { speed: 90, max: 0.7, colors: ['#b8c4d8', '#7a7a96', '#e8e8ff'], gravity: 160 });
          p.addFx('ring', e.x, e.y, 0.35, 26);
          this.shake = Math.max(this.shake, 4);
          break;
        case 'slam':
          p.addFx('ring', e.x, WORLD.groundY - 10, 0.45, 92 * (1 + game.mods.hammerRadius) * game.runeArea('hammer'));
          p.goldBurst(e.x, WORLD.groundY - 10, 40);
          p.dust(e.x - 10, WORLD.groundY - 2); p.dust(e.x + 10, WORLD.groundY - 2);
          this.shake = Math.max(this.shake, 5);
          break;
        case 'tunnelOpen': p.dust(e.x, WORLD.groundY - 2); p.dust(e.x - 6, WORLD.groundY - 2); this.shake = Math.max(this.shake, 2); break;
        case 'tunnelSealed':
          p.dust(e.x, WORLD.groundY - 2); p.dust(e.x + 8, WORLD.groundY - 2); p.dust(e.x - 8, WORLD.groundY - 2);
          p.goldBurst(e.x, WORLD.groundY - 6, 18);
          break;
        case 'emerge': p.dust(e.x, WORLD.groundY - 2); p.dust(e.x + 6, WORLD.groundY - 2); this.shake = Math.max(this.shake, 3); break;
        case 'blast': p.addFx('ring', e.x, e.y, 0.4, 34); p.emit(14, e.x, e.y, { speed: 70, max: 0.5, colors: ['#ffd0a0', '#ff8a4a', '#8a3a1a'], glow: true }); this.shake = Math.max(this.shake, 3); break;
        case 'intercept': p.chain([[e.fx, e.fy], [e.x, e.y]]); p.acid(e.x, e.y); break;
        case 'jump': p.dust(e.x, WORLD.groundY - 2); break;
        case 'mend': p.mend(e.x, e.y, e.tx, e.ty); break;
        case 'merge':
          for (const [fx, fy] of e.from) p.mend(fx, fy, e.x, e.y);
          p.goldBurst(e.x, e.y, 60);
          p.addFx('ring', e.x, e.y, 0.6, 30);
          this.shake = Math.max(this.shake, 3);
          break;
        case 'shoot': if (e.kind === 'arrow') p.emit(3, e.x, e.y, { speed: 30, max: 0.25, colors: [PAL.white, PAL.gold4], glow: true }); break;
        case 'lostLoot': p.emit(4, e.x, e.y, { speed: 20, max: 0.8, colors: ['#8a8aa8', '#5a5a78'], glow: true, gravity: -30 }); break;
        case 'devRune': p.goldBurst(e.x, WORLD.groundY - 20, 40); p.addFx('ring', e.x, WORLD.groundY - 20, 0.8, 30); break;
        case 'chain': p.chain(e.points); break;
        case 'ram': p.addFx('ram', e.x, WORLD.groundY - 6, 0.35, 0, e.dir); p.dust(e.x + e.dir * 12, WORLD.groundY - 2); this.shake = Math.max(this.shake, 2); break;
        case 'meteor':
          if (e.shard) { p.emit(5, e.x, WORLD.groundY - 3, { speed: 40, max: 0.4, colors: ['#ff9a4a', PAL.gold4], glow: true }); p.dust(e.x, WORLD.groundY - 2); break; }
          if (e.giant) {
            p.goldBurst(e.x, WORLD.groundY - 8, 160);
            p.addFx('ring', e.x, WORLD.groundY - 4, 0.6, 70);
            p.addFx('ring', e.x, WORLD.groundY - 4, 1, 130);
            p.addFx('growWave', e.x, WORLD.groundY, 0.8, 120);
            for (let i = -3; i <= 3; i++) p.dust(e.x + i * 9, WORLD.groundY - 2);
            p.emit(40, e.x, WORLD.groundY + 10, { speed: 80, max: 0.9, colors: ['#5a3a2a', '#8a6040', '#ff7a3a'], gravity: 120 });
            this.flash = Math.max(this.flash, 0.6);
            this.shake = Math.max(this.shake, 16);
            break;
          }
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
        case 'built': {
          const high = !e.underground && e.y < WORLD.groundY - 20; // a crown nest
          if (!high) p.dust(e.x, e.underground ? e.y : WORLD.groundY - 2);
          p.goldBurst(e.x, e.underground || high ? e.y : WORLD.groundY - 10, high ? 24 : 10);
          break;
        }
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
            if (game.leapProgress() >= 0) { p.dust(e.x, WORLD.groundY - 2); break; } // the slam comes on landing
            p.addFx('ring', e.x, WORLD.groundY - 10, 0.45, 92 * (1 + game.mods.hammerRadius));
            p.goldBurst(e.x, WORLD.groundY - 10, 30);
            this.shake = Math.max(this.shake, 3);
          } else if (e.ability === 'radiance') {
            p.goldBurst(WORLD.treeX, WORLD.groundY - 80, 120);
            p.addFx('growWave', WORLD.treeX, WORLD.groundY, 1, game.state.tree.radius);
            this.flash = Math.max(this.flash, 0.25);
          } else if (e.ability === 'timestop') {
            p.addFx('growWave', WORLD.treeX, WORLD.groundY, 1.2, WORLD.width);
            p.emit(40, e.x, WORLD.groundY - 20, { speed: 120, max: 0.9, colors: ['#d8f0ff', '#8fd0ff', PAL.white], glow: true });
            this.flash = Math.max(this.flash, 0.3);
          } else if (e.ability === 'swarm') {
            p.addFx('ring', e.x, WORLD.groundY - 8, 0.6, game.swarmReach());
            p.emit(30, e.x, WORLD.groundY - 10, { speed: 90, max: 0.8, colors: ['#c8ffb0', PAL.gold4, '#5ac85a'], glow: true });
          } else if (e.ability === 'spear') {
            p.emit(6, e.x, WORLD.groundY - 12, { speed: 40, max: 0.3, glow: true });
          }
          break;
        case 'spikeStrike': p.addFx(e.web ? 'web' : 'spikeThrust', e.x, e.y, e.web ? 0.6 : 0.3, 0, e.tx, e.ty - 2); break;
        case 'brood': p.acid(e.x, WORLD.groundY - 10); break;
        case 'keeperDown': p.goldBurst(e.x, WORLD.groundY - 10, 20); break;
        case 'keeperBack': p.goldBurst(WORLD.treeX, WORLD.groundY - 10, 20); break;
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
    for (const b of s.burns) {
      if (b.crater) this.drawCrater(c, b.x, b.halfWidth, b.life / Math.max(0.01, b.maxLife ?? b.life), time);
      this.drawBurn(c, b.x, b.halfWidth, time);
    }
    drawGrass(c, s.tree.radius, time, lanterns);

    this.drawNestsOutlined(c, s.structures.filter((x) => x.underground), time);
    for (const tn of s.tunnels) drawTunnel(c, tn, time);
    for (const e of s.enemies) if (e.layer === 'under') drawFog(c, e, time, s.night, e.fogged ? game.fogLevel(e) : 1);
    this.drawEnemiesOutlined(c, s.enemies.filter((e) => e.layer === 'under'), time);
    const tsc = treeScale(s.tree.rings);
    // the Tree's death: it leans, then falls ever faster and crashes down
    if (s.phase === 'lost') this.fallT = this.fallT < 0 ? 0 : this.fallT + dt;
    else this.fallT = -1;
    const fall = this.fallT < 0 ? 0 : Math.min(1, this.fallT / 2.4);
    this.lighting.treeFade = this.fallT < 0 ? 0 : Math.min(1, this.fallT / 3.2);
    if (fall >= 1 && !this.fellDown) {
      this.fellDown = true;
      this.shake = Math.max(this.shake, 14);
      const len = 150 * tsc * (0.4 + 0.12 * s.tree.stage);
      for (let i = 0; i < 12; i++) this.particles.dust(WORLD.treeX + this.fallDir * (i / 12) * len, WORLD.groundY - 2);
      this.particles.emit(60, WORLD.treeX + this.fallDir * len * 0.7, WORLD.groundY - 10, { speed: 90, max: 1.4, colors: [PAL.gold3, PAL.gold2, '#6a4a2a'], gravity: 90 });
    }
    if (this.fallT < 0) { this.fellDown = false; this.fallDir = Math.random() < 0.5 ? -1 : 1; }
    if (fall > 0 && fall < 1 && Math.random() < 0.6) {
      this.particles.emit(2, WORLD.treeX + this.fallDir * fall * 60, WORLD.groundY - 90 * tsc * (1 - fall), { speed: 30, max: 1.6, colors: [PAL.gold3, PAL.gold1], gravity: 40 });
    }
    c.save();
    if (fall > 0) {
      // the fallen crown lies on the ground, never sinks below it
      c.beginPath();
      c.rect(0, 0, WORLD.width, WORLD.groundY + 3);
      c.clip();
    }
    c.translate(WORLD.treeX, WORLD.groundY);
    c.rotate(this.fallDir * fall * fall * 1.32);
    c.scale(tsc, tsc);
    c.translate(-WORLD.treeX, -WORLD.groundY);
    if (fall > 0) c.globalAlpha = 1 - 0.45 * fall;
    drawTree(c, s.tree.stage, time, fall > 0 ? 1 : this.treeHurt, this.growPulse, treeLook(s.tree.branches));
    c.globalAlpha = 1;
    // growth rings glow as golden bands on the trunk
    for (let i = 0; i < Math.min(12, s.tree.rings); i++) {
      const y = WORLD.groundY - 8 - i * 5;
      const pulse = Math.sin(time * 2 - i * 0.6) > 0.3;
      rect(c, WORLD.treeX - 6, y, 11, 1, pulse ? PAL.gold5 : PAL.gold3);
    }
    c.restore();
    if (s.tree.stage + 1 >= TREE.polariaStage) this.drawPolaria(c, game, time);
    if (this.fallT < 0) for (const st of s.structures) if (st.crown) drawCrownNest(c, st, time);
    for (const st of s.structures) {
      if (st.family === 'beetle' && st.spec === 'A' && Math.random() < dt * 4) {
        this.particles.emit(1, st.x + (Math.random() - 0.5) * 120, WORLD.groundY - 4, { speed: 10, max: 1.2, colors: ['#c8ffb0', PAL.gold4, PAL.gold2], glow: true, gravity: -20, angle: -Math.PI / 2, spread: 0.4 });
      }
    }
    if (view.hoverTree && !game.over) this.treeOutline(c, time);
    this.drawNestsOutlined(c, s.structures.filter((x) => !x.underground && !x.crown), time);
    for (const tn of s.tunnels) if (tn.open) drawTunnelMouths(c, tn, time);
    for (const e of s.enemies) if (e.layer !== 'under') drawFog(c, e, time, s.night, e.fogged ? game.fogLevel(e) : 1);
    this.drawEnemiesOutlined(c, s.enemies.filter((e) => e.layer !== 'under'), time);
    // Прыжок Молота: the Ascended arcs through the air (every one of them in co-op, the local one on top)
    const order = s.keepers.map((_, i) => i).sort((a, b) => (a === game.local ? 1 : 0) - (b === game.local ? 1 : 0));
    for (const i of order) {
      const k = s.keepers[i];
      const lp = leapOf(k);
      if (lp >= 0) { c.save(); c.translate(0, -Math.round(Math.sin(lp * Math.PI) * 46)); }
      drawKeeper(c, k, time, i);
      if (lp >= 0) {
        c.restore();
        if (Math.random() < 0.7) this.particles.emit(1, k.x, WORLD.groundY - 10 - Math.sin(lp * Math.PI) * 46, { speed: 15, max: 0.35, colors: [PAL.gold5, PAL.gold3], glow: true });
      }
    }
    for (const w of s.workers) drawWorker(c, w, time);
    for (const u of s.soldiers) drawSoldier(c, u);
    this.particles.draw(c, false);

    // ── darkness
    this.lighting.drawDarkness(c);
    this.lighting.drawGlow(c, (s.phase === 'day' ? 0.32 : 0.4) + (s.keepers.some((k) => k.radianceT > 0) ? 0.25 : 0));
    s.keepers.forEach((k, ki) => {
      if (k.swarmT <= 0) return;
      const r = game.asKeeper(ki, () => game.swarmReach());
      for (let i = -r; i <= r; i += 4) if (Math.sin(time * 8 + i * 0.2) > 0) rect(c, k.swarmX + i, WORLD.groundY + 2, 2, 1, '#9cff8a');
    });

    // ── above darkness: eyes, light, drops, projectiles
    for (const e of s.enemies) drawEnemyEyes(c, e, time);
    for (const e of s.enemies) drawFogEdge(c, e, time, s.night, e.fogged ? game.fogLevel(e) : 1);
    if (s.phase === 'night' || (s.phase === 'day' && s.dayLeft < 10)) this.drawIncoming(c, game, time);
    this.drawSkyMood(c, game, time);
    // Остановка Времени: a pale-blue hush over the world, frost glints on the frozen
    // the Ascended holding time the longest shows the clock
    const tk = s.keepers.reduce((a, b) => (b.timeStopT > a.timeStopT ? b : a));
    const ts = tk.timeStopT;
    if (ts > 0) {
      const fade = Math.min(1, ts / 0.6, (tk.timeStopMax - ts) / 0.3 + 0.2);
      c.fillStyle = `rgba(140,190,255,${0.13 * fade})`;
      c.fillRect(0, 0, WORLD.width, WORLD.height);
      for (const e of s.enemies) {
        if (!game.frozen(e)) continue;
        const ey = e.layer === 'ground' ? WORLD.groundY - ENEMIES[e.kind].height * 0.6 : e.y - 4;
        if (Math.sin(time * 5 + e.id) > 0.3) rect(c, e.x - 3, ey - 2, 1, 1, '#e8f6ff');
        if (Math.sin(time * 4 + e.id * 1.7) > 0.4) rect(c, e.x + 3, ey + 2, 1, 1, '#b8e4ff');
      }
      // the clock face on the trunk
      const cy = WORLD.groundY - 46;
      const a = (1 - ts / Math.max(0.01, tk.timeStopMax)) * Math.PI * 2 - Math.PI / 2;
      for (let i = 0; i < 24; i++) { const b = (i / 24) * Math.PI * 2; rect(c, WORLD.treeX + Math.cos(b) * 14, cy + Math.sin(b) * 14, 1, 1, i % 6 ? '#8fd0ff' : PAL.white); }
      line(c, WORLD.treeX, cy, WORLD.treeX + Math.cos(a) * 11, cy + Math.sin(a) * 11, '#e8f6ff');
    }
    this.drawDragonflies(c, game, time, dt);
    // Лазы above the darkness: the open passage and whoever crawls in it
    for (const tn of s.tunnels) {
      if (!tn.open || Number.isNaN(tn.entryX)) continue;
      const ty = WORLD.wormLaneY - 14;
      const a0 = Math.min(tn.entryX, tn.headX), a1 = Math.max(tn.entryX, tn.headX);
      for (let x = a0; x <= a1; x += 6) if (((x + time * 30) | 0) % 12 < 6) rect(c, x, ty + Math.sin(x * 0.21 + tn.id) * 1.5, 3, 1, 'rgba(200,130,70,0.45)');
    }
    for (const e of s.enemies) {
      if (e.dead || e.layer !== 'under' || ENEMIES[e.kind].underground) continue;
      const r = Math.max(5, Math.min(10, ENEMIES[e.kind].radius)) + 2;
      const pulse = 0.45 + 0.25 * Math.sin(time * 6 + e.id);
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        rect(c, e.x + Math.cos(ang) * (r + 1), e.y + Math.sin(ang) * r * 0.6, 1, 1, `rgba(255,150,80,${pulse})`);
      }
      // the ground trembles above the crawler
      if (Math.sin(time * 14 + e.id) > 0.2) rect(c, e.x + ((e.id * 7 + Math.floor(time * 10)) % 9) - 4, WORLD.groundY - 2, 1, 1, '#b08060');
      if (Math.sin(time * 11 + e.id * 3) > 0.4) rect(c, e.x - e.dir * 5, WORLD.groundY - 3, 2, 1, '#8a6040');
    }
    // lasting Igg-Beams of the hives
    for (const st of s.structures) {
      if (!st.beamT || st.beamT <= 0) continue;
      const t = s.enemies.find((e) => e.id === st.beamTo && !e.dead);
      if (!t) continue;
      const ox = st.x, oy = st.crown ? st.y + 3 : WORLD.groundY - 40;
      const out = Math.sign(t.x - WORLD.treeX) || 1;
      const tx = t.x + out * 12, ty = t.y - ENEMIES[t.kind].height * 0.5;
      const w = Math.sin(time * 40 + st.id) > 0 ? 3 : 2;
      line(c, ox, oy, tx, ty, PAL.gold2, w + 1);
      line(c, ox, oy, tx, ty, PAL.gold5, 1);
      rect(c, t.x - 1, ty - 1, 3, 3, PAL.white);
      if (Math.random() < 0.5) this.particles.emit(1, t.x, ty, { speed: 40, max: 0.3, colors: [PAL.gold5, PAL.gold3], glow: true });
    }
    // build runes and root nodes sit above the darkness so they stay readable at night
    if (!game.over) {
      for (const sl of SLOTS) {
        if (!game.slotUnlocked(sl) || game.structureAt(sl.id)) continue;
        if (sl.crown) {
          const p = crownPos(s.tree.stage, Number(sl.id.slice(1)), s.tree.rings);
          drawCrownSlot(c, p.x, p.y, time, view.hoverSlot === sl.id || view.selectedSlot === sl.id);
          continue;
        }
        drawSlotMarker(c, sl.x, sl.underground, time, view.hoverSlot === sl.id || view.selectedSlot === sl.id, sl.y);
      }
    }
    for (const d of s.drops) drawDrop(c, d, time);
    // spears and stars glow in the colour of their caster's rune rank
    const tint = (rank: number) => (rank > 0 ? runeColor(rank) : undefined);
    for (const p of s.projectiles) {
      const own = s.keepers[p.owner ?? 0] ?? s.keeper;
      drawProjectile(c, p, p.kind === 'spear' ? tint(own.runeRank.spear) : p.kind === 'meteor' ? tint(own.runeRank.starfall) : undefined);
    }
    s.keepers.forEach((k, i) => { if (k.channel > 0 && k.alive) this.drawChannel(c, game, i, time); });
    for (const t of s.tempLights) if (t.dps) this.drawDome(c, t.x, t.radius, t.life / t.maxLife, time);
    this.particles.draw(c, true);
    for (const e of s.enemies) drawEnemyHp(c, e);
    for (const e of s.enemies) drawAffix(c, e, time);
    for (const e of s.enemies) drawWeb(c, e);
    // the HP bar rides along with the Hammer's leap
    const coop = s.keepers.length > 1;
    s.keepers.forEach((k, i) => {
      const lpHp = leapOf(k);
      if (lpHp >= 0) { c.save(); c.translate(0, -Math.round(Math.sin(lpHp * Math.PI) * 46)); }
      drawKeeperHp(c, k, game.asKeeper(i, () => game.keeperMaxHp()), coop ? i : -1, i === game.local);
      if (lpHp >= 0) c.restore();
    });
    if (view.aiming) this.drawAim(c, game, view, time);
    if (view.preview?.merge) this.drawMergePreview(c, game, view.preview.merge, time);
    else if (view.preview) this.drawRangeRaw(c, view.preview.x, view.preview.r, view.preview.underground, true, view.preview.y);
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

  /** Draw nests with a 1px warm outline so they read against the night. */
  private drawNestsOutlined(c: Ctx, list: import('../sim/types').Structure[], time: number) {
    if (!list.length) return;
    if (!OUTLINE_NESTS) { for (const st of list) drawStructure(c, st, time); return; }
    const n = this.nestCtx, r = this.rimCtx;
    n.clearRect(0, 0, WORLD.width, WORLD.height);
    for (const st of list) drawStructure(n, st, time);
    r.globalCompositeOperation = 'source-over';
    r.clearRect(0, 0, WORLD.width, WORLD.height);
    r.drawImage(this.nestCv, 0, 0);
    r.globalCompositeOperation = 'source-in';
    r.fillStyle = 'rgba(255, 214, 140, 0.9)';
    r.fillRect(0, 0, WORLD.width, WORLD.height);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(this.rimCv, dx, dy);
    c.drawImage(this.nestCv, 0, 0);
  }

  /**
   * The mood of the sky: a warm band of dawn rises over the horizon as the night runs out
   * (and fades in the first seconds of the day); a red pulse frames the view while the
   * Tree is in danger.
   */
  private dawnGlow = 0;
  private drawSkyMood(c: Ctx, game: Game, time: number) {
    const s = game.state;
    const cam = this.camera;
    let target = 0;
    if (s.phase === 'night' && s.pending.length === 0) target = 1 - Math.min(1, s.enemies.length / 8);
    else if (s.phase === 'day') target = Math.max(0, 1 - s.phaseTime / 6);
    this.dawnGlow += (target - this.dawnGlow) * 0.03;
    if (this.dawnGlow > 0.02) {
      const top = WORLD.groundY - 180, bot = WORLD.groundY;
      for (let y = top; y < bot; y += 4) {
        const k = (y - top) / (bot - top);
        c.fillStyle = `rgba(255, 140, 90, ${(0.16 * this.dawnGlow * k * k).toFixed(3)})`;
        c.fillRect(cam.x, y, cam.w, 4);
      }
    }
    // the Tree in danger: a red heartbeat around the view
    if (s.phase === 'night' && s.tree.hp < game.treeMaxHp() * 0.3) {
      const pulse = 0.25 + 0.2 * Math.max(0, Math.sin(time * 6));
      const w = 26;
      for (let i = 0; i < w; i += 2) {
        const a = (pulse * (1 - i / w)).toFixed(3);
        c.fillStyle = `rgba(200, 20, 40, ${a})`;
        c.fillRect(cam.x + i, cam.y, 2, cam.h);
        c.fillRect(cam.x + cam.w - i - 2, cam.y, 2, cam.h);
        c.fillRect(cam.x, cam.y + i, cam.w, 2);
        c.fillRect(cam.x, cam.y + cam.h - i - 2, cam.w, 2);
      }
    }
  }

  /**
   * Where the wave comes from, told by the setting: at the edge of the view the Darkness
   * thickens and red eyes blink — denser the more creatures are on their way from that side.
   */
  private drawIncoming(c: Ctx, game: Game, time: number) {
    const s = game.state;
    const cam = this.camera;
    // at night: who comes out in the next seconds; at the end of the day: the night's opening groups
    const opening = s.phase === 'day' ? game.night(s.night).groups.filter((g) => g.at < 12) : [];
    const soon = (side: 'L' | 'R') => s.phase === 'day'
      ? opening.filter((g) => g.side === side || g.side === 'B').reduce((a, g) => a + g.count, 0)
      : s.pending.filter((p) => p.side === side && p.at - s.phaseTime < 6).length;
    const offscreen = (dir: 1 | -1) => s.enemies.filter((e) => !e.dead && e.layer !== 'under' && (dir < 0 ? e.x < cam.x : e.x > cam.x + cam.w)).length;
    for (const [side, dir] of [['L', -1], ['R', 1]] as const) {
      const n = soon(side) + offscreen(dir);
      if (!n) continue;
      const k = Math.min(1, 0.25 + n / 12);
      const edge = dir < 0 ? cam.x : cam.x + cam.w;
      const depth = 30 + 50 * k;
      const top = WORLD.groundY - 90, bot = WORLD.groundY + 6;
      for (let d = 0; d < depth; d += 3) {
        const a = (1 - d / depth) * 0.55 * k * (0.85 + 0.15 * Math.sin(time * 2 + d * 0.2));
        c.fillStyle = `rgba(40, 8, 40, ${a.toFixed(3)})`;
        c.fillRect(edge - dir * d - (dir > 0 ? 3 : 0), top, 3, bot - top);
      }
      // creeping tendrils along the ground
      for (let i = 0; i < 6; i++) {
        const len = depth * (0.6 + 0.4 * Math.sin(time * 1.3 + i * 1.7));
        const y = WORLD.groundY - 4 - i * 9;
        for (let d = 0; d < len; d += 2) if (Math.sin(d * 0.4 + time * 3 + i) > 0.2) rect(c, edge - dir * d, y + Math.sin(d * 0.15 + i) * 2, 1, 1, 'rgba(120,40,110,0.6)');
      }
      // eyes in the dark
      const eyes = Math.min(8, 2 + Math.floor(n / 2));
      for (let i = 0; i < eyes; i++) {
        if (Math.sin(time * 1.7 + i * 2.3) < -0.6) continue;
        const ex = edge - dir * (8 + ((i * 37) % Math.max(10, depth - 10)));
        const ey = WORLD.groundY - 10 - ((i * 23) % 60);
        rect(c, ex, ey, 1, 1, '#ff3a3a');
        rect(c, ex + 3, ey, 1, 1, '#ff3a3a');
      }
    }
  }

  /**
   * Creatures get a thin hostile rim (as good 2D games outline enemies): the silhouette is
   * redrawn 1 px around in a muted violet-rose, so dark beasts read on any background.
   */
  private drawEnemiesOutlined(c: Ctx, list: import('../sim/types').Enemy[], time: number) {
    if (!list.length) return;
    const n = this.nestCtx, r = this.rimCtx;
    const cam = this.camera;
    // work only inside the camera view (plus a margin) — cheaper than the whole world
    const x0 = Math.max(0, Math.floor(cam.x) - 40), y0 = Math.max(0, Math.floor(cam.y) - 40);
    const w = Math.min(WORLD.width - x0, Math.ceil(cam.w) + 80), h = Math.min(WORLD.height - y0, Math.ceil(cam.h) + 80);
    n.clearRect(x0, y0, w, h);
    for (const e of list) drawEnemy(n, e, time);
    r.globalCompositeOperation = 'source-over';
    r.clearRect(x0, y0, w, h);
    r.drawImage(this.nestCv, x0, y0, w, h, x0, y0, w, h);
    r.globalCompositeOperation = 'source-in';
    r.fillStyle = 'rgba(200, 120, 170, 0.75)';
    r.fillRect(x0, y0, w, h);
    r.globalCompositeOperation = 'source-over';
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) c.drawImage(this.rimCv, x0, y0, w, h, x0 + dx, y0 + dy, w, h);
    c.drawImage(this.nestCv, x0, y0, w, h, x0, y0, w, h);
  }

  /** The channelled Piercing Beam, attached to the keeper's staff. */
  private drawChannel(c: Ctx, game: Game, i: number, time: number) {
    const k = game.state.keepers[i];
    const y = WORLD.groundY - 12;
    const k01 = Math.min(1, k.channel / 0.25);
    const wob = Math.sin(time * 40) > 0 ? 1 : 0;
    const col = runeColor(k.runeRank.spear);
    // «Обоюдное древко»: the beam shines backwards too (weaker)
    const tw = game.asKeeper(i, () => game.facetLv('sp-twin'));
    const twin = tw > 0 ? Math.min(1, 0.6 + 0.2 * (tw - 1)) : 0;
    const dirs: Array<[1 | -1, number]> = [[k.channelDir, 1]];
    if (twin > 0) dirs.push([(k.channelDir * -1) as 1 | -1, twin]);
    for (const [dir, power] of dirs) {
      const x0 = k.x + dir * 6;
      const x1 = dir > 0 ? WORLD.width : 0;
      // the beam thins out with distance (its damage falls off too)
      const len = Math.abs(x1 - x0);
      for (let d = 0; d < len; d += 12) {
        const f = beamFalloff(d) * power;
        const x = x0 + dir * d - (dir < 0 ? 12 : 0);
        c.globalAlpha = 0.25 + 0.75 * f;
        c.fillStyle = 'rgba(255,200,90,0.35)';
        const h = Math.max(2, Math.round((6 + wob * 2) * f));
        c.fillRect(x, y - h / 2, 12, h);
        c.fillStyle = col;
        c.fillRect(x, y - 1, 12, f > 0.5 ? 2 : 1);
        if (f > 0.4) { c.fillStyle = PAL.white; c.fillRect(x, y, 12, 1); }
      }
      c.globalAlpha = 1;
      disc(c, x0, y, (3 + wob * k01) * (dir === k.channelDir ? 1 : 0.7), PAL.white);
      if (Math.random() < 0.6 * power) this.particles.emit(1, x0 + dir * Math.random() * 300, y, { speed: 20, max: 0.3, colors: [PAL.white, col], glow: true });
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

  /** Слияние preview: the two nests that will be absorbed pulse and stream into the target. */
  private drawMergePreview(c: Ctx, game: Game, m: { to: number; from: number[] }, time: number) {
    const s = game.state;
    const anchor = (st: import('../sim/types').Structure) => ({ x: st.x, y: st.underground || st.crown ? st.y : WORLD.groundY - 14 });
    const to = s.structures.find((x) => x.id === m.to);
    if (!to) return;
    const t = anchor(to);
    for (const id of m.from) {
      const st = s.structures.find((x) => x.id === id);
      if (!st) continue;
      const a = anchor(st);
      const r = 13 + Math.sin(time * 6) * 2;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2 + time * 2;
        rect(c, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r * 0.8, 2, 2, i % 2 ? '#ff9a6a' : PAL.gold5);
      }
      // a dotted stream flowing into the nest that stays
      const n = Math.max(6, Math.round(Math.hypot(t.x - a.x, t.y - a.y) / 8));
      for (let i = 0; i < n; i++) {
        const k = (i / n + time * 0.8) % 1;
        rect(c, a.x + (t.x - a.x) * k, a.y + (t.y - a.y) * k - Math.sin(k * Math.PI) * 18, 2, 2, PAL.gold4);
      }
    }
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2 - time * 2;
      rect(c, t.x + Math.cos(ang) * 16, t.y + Math.sin(ang) * 13, 2, 2, PAL.gold5);
    }
  }

  /** Сверхзвезда's crater: a scorched pit with a glowing rim, cooling as it fades. */
  private drawCrater(c: Ctx, x: number, hw: number, k: number, time: number) {
    const r = hw * 1.2;
    for (let i = -r; i <= r; i += 1) {
      const t = i / r;
      const depth = Math.round(Math.sqrt(Math.max(0, 1 - t * t)) * 9);
      rect(c, x + i, WORLD.groundY, 1, depth, '#0a0608');
      const glow = k > 0.3 && Math.sin(time * 9 + i * 0.7) > 0.2;
      rect(c, x + i, WORLD.groundY + depth, 1, 1, glow ? '#ff7a3a' : '#5a2a1a');
    }
    // the rim of thrown-up soil
    rect(c, x - r - 3, WORLD.groundY - 2, 4, 2, '#4a3020');
    rect(c, x + r - 1, WORLD.groundY - 2, 4, 2, '#4a3020');
  }

  private drawBurn(c: Ctx, x: number, hw: number, time: number) {
    for (let i = -hw; i <= hw; i += 2) {
      const f = Math.sin(time * 14 + i);
      rect(c, x + i, WORLD.groundY - 1 - (f > 0.3 ? 2 : 1), 1, f > 0.3 ? 2 : 1, f > 0.6 ? PAL.gold4 : '#ff7a3a');
    }
  }

  /** Little dragonflies: circle their nest, fly out to sting a creature in the Tree's light. */
  private drones = new Map<string, { x: number; y: number }>();
  private drawDragonflies(c: Ctx, game: Game, time: number, dt: number) {
    const s = game.state;
    const live = new Set<string>();
    for (const st of s.structures) {
      if (st.family !== 'dragonfly') continue;
      const foe = st.stingTo ? s.enemies.find((e) => e.id === st.stingTo && !e.dead) : undefined;
      const n = game.dragonflyDrones(st);
      for (let i = 0; i < n; i++) {
        const key = `${st.id}:${i}`;
        live.add(key);
        let [tx, ty] = dragonflyHome(st, i, time);
        if (foe) {
          const a = time * (2.2 + i * 0.25) + i * 2.1;
          const fy = foe.layer === 'ground' ? WORLD.groundY - ENEMIES[foe.kind].height * 0.6 : foe.y - ENEMIES[foe.kind].height * 0.5;
          tx = foe.x + Math.cos(a) * (ENEMIES[foe.kind].radius + 4);
          ty = fy + Math.sin(a * 1.3) * 6;
        }
        let d = this.drones.get(key);
        if (!d) { d = { x: tx, y: ty }; this.drones.set(key, d); }
        const px = d.x;
        const k = Math.min(1, dt * (foe ? 1.8 : 1.4));
        d.x += (tx - d.x) * k;
        d.y += (ty - d.y) * k;
        drawDragonfly(c, d.x, d.y, d.x >= px ? 1 : -1, st.spec === 'B', time, i);
        if (foe && Math.random() < dt * 3) this.particles.emit(1, d.x, d.y, { speed: 15, max: 0.25, colors: [PAL.gold5], glow: true });
      }
    }
    for (const key of this.drones.keys()) if (!live.has(key)) this.drones.delete(key);
  }

  private drawRange(c: Ctx, game: Game, st: import('../sim/types').Structure, x: number, underground: boolean, y?: number) {
    const ns = game.nestStats(st);
    // crown nests sit at their crown spot, not at the slot's base position
    const px = st.crown ? st.x : x;
    this.drawRangeRaw(c, px, st.family === 'dragonfly' ? ns.light! : ns.range, underground, true, y);
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
    // a soft dome over the covered ground (the same shape as the dotted arc)
    c.fillStyle = 'rgba(255,214,120,0.08)';
    c.beginPath();
    if (underground) c.ellipse(x, y, r, r * 0.27, 0, 0, Math.PI);
    else c.ellipse(x, y, r, r * 0.45, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    for (let i = -r; i <= r; i += 3) rect(c, x + i, y, 2, 1, 'rgba(255,214,120,0.85)');
    rect(c, x - r, y - 10, 1, 11, PAL.gold3);
    rect(c, x + r, y - 10, 1, 11, PAL.gold3);
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
      // leap arc to the cursor (clamped to the reach) and the slam's footprint
      const reach = ABILITIES.hammer.leap * game.runeArea('hammer');
      const to = k.x + Math.max(-reach, Math.min(reach, view.mouseX - k.x));
      for (let i = 0; i <= 20; i++) {
        const p = i / 20;
        rect(c, k.x + (to - k.x) * p, WORLD.groundY - 10 - Math.sin(p * Math.PI) * 46, 1, 1, g ? 'rgba(255,240,180,0.8)' : 'rgba(255,200,90,0.6)');
      }
      const r = ABILITIES.hammer.radius * (1 + game.mods.hammerRadius) * game.runeArea('hammer');
      for (let i = -r; i <= r; i += 4) rect(c, to + i, WORLD.groundY + 1, 2, 1, 'rgba(255,230,150,0.7)');
    }
  }
}

/** Hammer leap progress of one Ascended (0..1 of the flight, or -1 on the ground). */
function leapOf(k: Keeper) { return k.leapT > 0 ? 1 - k.leapT / k.leapDur : -1; }
