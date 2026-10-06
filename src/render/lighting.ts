import { WORLD } from '../data/balance';
import { TREE } from '../data/tree';
import type { Game } from '../sim/game';
import { BAYER4, makeCanvas } from './pixel';

/** Darkness/glow buffers are computed at half resolution, then upscaled pixel-perfect. */
const CELL = 3;
const LW = WORLD.width / CELL;
const LH = WORLD.height / CELL;
const GY = WORLD.groundY;

interface Source {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** 0..1 strength */
  k: number;
  /** warm glow contribution */
  glow: number;
  /** only affects surface (y < GY) or underground (y ≥ GY) half; 0 = both */
  layer: -1 | 0 | 1;
}

/** Darkness levels (alpha) and their tint: the edge of light is a cold violet. */
const DARK_LEVELS: Array<[number, number, number, number]> = [
  [0, 0, 0, 0],
  [22, 12, 46, 55],
  [12, 8, 30, 110],
  [7, 6, 20, 160],
  [4, 4, 12, 205],
];
const GLOW_LEVELS: Array<[number, number, number, number]> = [
  [0, 0, 0, 0],
  [60, 34, 6, 255],
  [105, 64, 12, 255],
  [150, 96, 24, 255],
];

export class Lighting {
  private dark: HTMLCanvasElement;
  private darkCtx: CanvasRenderingContext2D;
  private darkImg: ImageData;
  private glowCv: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;
  private glowImg: ImageData;
  /** smoothed day/night blend (1 = full night) */
  private night = 0.6;

  constructor() {
    [this.dark, this.darkCtx] = makeCanvas(LW, LH);
    this.darkImg = this.darkCtx.createImageData(LW, LH);
    [this.glowCv, this.glowCtx] = makeCanvas(LW, LH);
    this.glowImg = this.glowCtx.createImageData(LW, LH);
  }

  private sources(game: Game, time: number): Source[] {
    const s = game.state;
    const out: Source[] = [];
    const R = s.tree.radius;
    const flicker = 1 + Math.sin(time * 1.7) * 0.012;
    out.push({ x: WORLD.treeX, y: GY, rx: R * flicker, ry: R * 1.05, k: 1, glow: 1, layer: -1 });
    const rr = R * TREE.rootLightFactor;
    out.push({ x: WORLD.treeX, y: GY, rx: rr, ry: Math.max(40, rr * 0.9), k: 0.9, glow: 0.6, layer: 1 });
    for (const st of s.structures) {
      const ns = game.nestStats(st);
      if (st.family === 'dragonfly') {
        out.push({ x: st.x, y: GY - 24, rx: ns.light!, ry: ns.light! * 0.75, k: 0.92, glow: st.spec === 'B' ? 0.5 : 0.75, layer: -1 });
      } else if (st.family === 'spider') {
        out.push({ x: st.x, y: st.y, rx: ns.light!, ry: ns.light! * 0.7, k: 0.75, glow: 0.35, layer: 1 });
      } else if (st.crown) {
        out.push({ x: st.x, y: st.y, rx: 12, ry: 10, k: 0.5, glow: 0.5, layer: -1 });
      } else {
        // every nest gives off a small warm glow so it reads at night
        const tall = st.family === 'hive' ? 36 : st.family === 'termite' ? 16 : 12;
        out.push({ x: st.x, y: GY - tall, rx: 22, ry: 20, k: 0.55, glow: st.family === 'hive' ? 0.5 : 0.32, layer: -1 });
      }
    }
    for (const t of s.tempLights) {
      const f = Math.min(1, t.life / 0.6) * Math.min(1, (t.maxLife - t.life) / 0.15 + 0.2);
      out.push({ x: t.x, y: GY - 12, rx: t.radius * f, ry: t.radius * 0.8 * f, k: 1, glow: 1.2, layer: -1 });
    }
    const k = s.keeper;
    if (k.alive) out.push({ x: k.x, y: GY - 10, rx: 20, ry: 18, k: 0.7, glow: 0.35, layer: -1 });
    for (const p of s.projectiles) {
      if (p.kind === 'meteor') out.push({ x: p.x, y: p.y, rx: 26, ry: 22, k: 0.9, glow: 0.9, layer: 0 });
      else if (p.kind === 'spear') out.push({ x: p.x, y: p.y, rx: 18, ry: 14, k: 0.8, glow: 0.6, layer: 0 });
      else if (p.kind === 'spark') out.push({ x: p.x, y: p.y, rx: 8, ry: 8, k: 0.5, glow: 0.4, layer: 0 });
    }
    return out;
  }

  /** Recomputes the darkness and glow buffers for this frame. */
  update(game: Game, time: number, dt: number) {
    const s = game.state;
    const targetNight = s.phase === 'day' ? 0.72 : 1;
    this.night += (targetNight - this.night) * Math.min(1, dt * 1.5);
    const src = this.sources(game, time);
    const d = this.darkImg.data;
    const g = this.glowImg.data;
    for (let cy = 0; cy < LH; cy++) {
      const y = cy * CELL + 1;
      const under = y >= GY;
      // base darkness by height: sky is a bit lighter, underground darkest
      const base = under ? 0.88 : 0.3 + 0.52 * Math.pow(Math.min(1, y / GY), 2.2);
      for (let cx = 0; cx < LW; cx++) {
        const x = cx * CELL + 1;
        let light = 0;
        let glow = 0;
        for (let i = 0; i < src.length; i++) {
          const sc = src[i];
          if (sc.layer === -1 && under) continue;
          if (sc.layer === 1 && !under) continue;
          const dx = (x - sc.x) / sc.rx;
          const dy = (y - sc.y) / sc.ry;
          const dd = dx * dx + dy * dy;
          if (dd >= 1.44) continue;
          const dist = Math.sqrt(dd);
          // crisp-ish edge with a narrow falloff band
          const l = dist < 0.82 ? 1 : dist < 1 ? 1 - (dist - 0.82) / 0.18 : 0;
          if (l * sc.k > light) light = l * sc.k;
          const gl = Math.max(0, 1 - dist / 1.2) * sc.glow;
          glow += gl * gl;
        }
        const dark = Math.max(0, base * this.night * (1 - light));
        const bay = BAYER4[(cy & 3) * 4 + (cx & 3)] / 16;
        const dl = Math.min(4, Math.floor(dark * 4.6 + bay));
        const o = (cy * LW + cx) * 4;
        const dc = DARK_LEVELS[dl];
        d[o] = dc[0]; d[o + 1] = dc[1]; d[o + 2] = dc[2]; d[o + 3] = dc[3];
        const gl = Math.min(3, Math.floor(Math.min(1, glow) * 3.2 + bay - 0.35));
        const gc = GLOW_LEVELS[Math.max(0, gl)];
        g[o] = gc[0]; g[o + 1] = gc[1]; g[o + 2] = gc[2]; g[o + 3] = gc[3];
      }
    }
    this.darkCtx.putImageData(this.darkImg, 0, 0);
    this.glowCtx.putImageData(this.glowImg, 0, 0);
  }

  drawDarkness(c: CanvasRenderingContext2D) {
    c.drawImage(this.dark, 0, 0, WORLD.width, WORLD.height);
  }

  drawGlow(c: CanvasRenderingContext2D, strength = 0.38) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = strength;
    c.drawImage(this.glowCv, 0, 0, WORLD.width, WORLD.height);
    c.restore();
  }
}
