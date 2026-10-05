import { WORLD } from '../data/balance';
import { type Ctx, PAL, line, rect, ring } from './pixel';

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number;
  colors: string[];
  size: number;
  gravity: number;
  drag: number;
  /** draw above darkness (glowing) */
  glow: boolean;
}

type FxKind = 'ring' | 'rootBurst' | 'spikeThrust' | 'growWave' | 'beam' | 'ram' | 'web' | 'bolt';
interface Bolt { pts: Array<[number, number]>; life: number; }
interface Fx { kind: FxKind; x: number; y: number; tx: number; ty: number; life: number; max: number; r: number; }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Visual-only particles and one-shot effects (not part of the deterministic sim). */
export class Particles {
  private ps: Particle[] = [];
  private fx: Fx[] = [];
  private bolts: Bolt[] = [];

  emit(n: number, x: number, y: number, o: Partial<Particle> & { speed?: number; spread?: number; angle?: number }) {
    for (let i = 0; i < n; i++) {
      const sp = (o.speed ?? 40) * rnd(0.4, 1);
      const a = (o.angle ?? -Math.PI / 2) + rnd(-1, 1) * (o.spread ?? Math.PI);
      const life = (o.max ?? 0.6) * rnd(0.6, 1.2);
      this.ps.push({
        x: x + rnd(-1.5, 1.5), y: y + rnd(-1.5, 1.5), vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp + (o.vy ?? 0),
        life, max: life, colors: o.colors ?? [PAL.gold5, PAL.gold3, PAL.gold1], size: o.size ?? 1,
        gravity: o.gravity ?? 0, drag: o.drag ?? 1.5, glow: o.glow ?? false,
      });
    }
  }

  addFx(kind: FxKind, x: number, y: number, max: number, r = 0, tx = 0, ty = 0) {
    this.fx.push({ kind, x, y, tx, ty, life: max, max, r });
  }

  update(dt: number) {
    for (const p of this.ps) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity > 0 && p.y > WORLD.groundY - 1 && p.y < WORLD.groundY + 4) { p.y = WORLD.groundY - 1; p.vy *= -0.3; p.vx *= 0.6; }
    }
    this.ps = this.ps.filter((p) => p.life > 0);
    for (const f of this.fx) f.life -= dt;
    for (const b of this.bolts) b.life -= dt;
    this.bolts = this.bolts.filter((b) => b.life > 0);
    this.fx = this.fx.filter((f) => f.life > 0);
  }

  draw(c: Ctx, glowPass: boolean) {
    for (const p of this.ps) {
      if (p.glow !== glowPass) continue;
      const t = 1 - p.life / p.max;
      const col = p.colors[Math.min(p.colors.length - 1, Math.floor(t * p.colors.length))];
      rect(c, p.x, p.y, p.size, p.size, col);
    }
    if (!glowPass) return;
    for (const b of this.bolts) {
      for (let i = 0; i < b.pts.length - 1; i++) {
        const [x0, y0] = b.pts[i];
        const [x1, y1] = b.pts[i + 1];
        const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 8;
        const my = (y0 + y1) / 2 + (Math.random() - 0.5) * 8;
        line(c, x0, y0, mx, my, '#bfe4ff');
        line(c, mx, my, x1, y1, '#bfe4ff');
        rect(c, x1 - 1, y1 - 1, 2, 2, PAL.white);
      }
    }
    for (const f of this.fx) {
      const t = 1 - f.life / f.max;
      switch (f.kind) {
        case 'ring': {
          const r = f.r * (0.2 + t * 0.8);
          ring(c, f.x, f.y, r, t < 0.5 ? PAL.gold5 : PAL.gold3);
          if (t < 0.6) ring(c, f.x, f.y, r - 2, PAL.gold2);
          break;
        }
        case 'growWave': {
          const r = f.r * t;
          ring(c, f.x, f.y, r, t < 0.6 ? PAL.gold4 : PAL.gold2);
          ring(c, f.x, f.y, r * 0.92, PAL.gold1);
          break;
        }
        case 'rootBurst': {
          // roots erupting from the ground (and a thrust down into the earth)
          const k = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75;
          for (let i = -3; i <= 3; i++) {
            const bx = f.x + i * 7;
            const h = (14 - Math.abs(i) * 2.5) * k;
            line(c, bx, WORLD.groundY, bx + i * 1.5, WORLD.groundY - h, PAL.bark2, 2);
            rect(c, bx + i * 1.5, WORLD.groundY - h - 1, 1, 1, PAL.gold4);
            line(c, bx, WORLD.groundY + 2, bx - i, WORLD.groundY + 2 + 60 * k, i % 2 ? PAL.gold2 : PAL.bark2, 1);
          }
          break;
        }
        case 'beam': {
          const k = 1 - t;
          line(c, f.x, f.y, f.tx, f.ty, PAL.gold2, 3);
          line(c, f.x, f.y, f.tx, f.ty, k > 0.4 ? PAL.gold5 : PAL.gold4, 1);
          rect(c, f.tx - 1, f.ty - 1, 3, 3, PAL.white);
          break;
        }
        case 'ram': {
          const k = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
          for (let i = 0; i < 4; i++) line(c, f.x + f.tx * (10 + i * 3) * k, f.y - 6 + i * 3, f.x + f.tx * (16 + i * 3) * k, f.y - 6 + i * 3, PAL.cloak2);
          break;
        }
        case 'web': {
          const k = 1 - t;
          line(c, f.x, f.y, f.tx, f.ty, '#d8d4f0', 1);
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            line(c, f.tx, f.ty, f.tx + Math.cos(ang) * 9 * k, f.ty + Math.sin(ang) * 7 * k, '#cfc8ee');
          }
          ring(c, f.tx, f.ty, 5 * k, '#e8e4ff');
          break;
        }
        case 'spikeThrust': {
          const k = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
          const ex = f.x + (f.tx - f.x) * k;
          const ey = f.y + (f.ty - f.y) * k;
          line(c, f.x, f.y, ex, ey, PAL.bark2, 2);
          line(c, f.x, f.y, ex, ey, PAL.gold3, 1);
          rect(c, ex, ey, 2, 2, PAL.gold5);
          break;
        }
      }
    }
  }

  // ── presets ──────────────────────────────────────────────────────

  hit(x: number, y: number, crit: boolean) {
    this.emit(crit ? 7 : 4, x, y, { speed: crit ? 70 : 45, max: 0.3, colors: crit ? [PAL.white, PAL.gold4, PAL.amber] : [PAL.gold5, PAL.gold3], glow: true, drag: 4 });
  }
  death(x: number, y: number, big: boolean) {
    this.emit(big ? 60 : 16, x, y, { speed: big ? 50 : 26, max: big ? 1.6 : 1, colors: ['#3b2d5e', '#241c3e', '#140f24'], gravity: -18, size: 2, drag: 2 });
    this.emit(big ? 20 : 5, x, y, { speed: 30, max: 0.6, colors: [PAL.eye, PAL.eyeGlow, '#4a5a8a'], glow: true });
  }
  acid(x: number, y: number) {
    this.emit(9, x, y, { speed: 50, max: 0.5, colors: [PAL.acid2, PAL.acid1, PAL.acid0], gravity: 220, glow: true });
  }
  dust(x: number, y: number) {
    this.emit(14, x, y, { speed: 30, max: 0.7, colors: ['#5a4a46', '#3a302e'], gravity: 40, angle: -Math.PI / 2, spread: 1.2, size: 1 });
  }
  pickup(x: number, y: number, star: boolean) {
    this.emit(star ? 9 : 5, x, y, { speed: star ? 50 : 30, max: 0.45, colors: star ? [PAL.white, PAL.blood2, PAL.blood1] : [PAL.gold5, PAL.gold3, PAL.gold1], glow: true, drag: 3 });
  }
  chain(points: Array<[number, number]>) {
    this.bolts.push({ pts: points, life: 0.18 });
    for (const [x, y] of points.slice(1)) this.emit(3, x, y, { speed: 40, max: 0.25, colors: [PAL.white, '#bfe4ff'], glow: true });
  }
  goldBurst(x: number, y: number, n = 40) {
    this.emit(n, x, y, { speed: 90, max: 1.2, colors: [PAL.gold5, PAL.gold4, PAL.gold3, PAL.gold1], glow: true, drag: 2.2, gravity: 20 });
  }
  /** Ambient motes floating up inside the light and wisps at its edge. */
  ambient(radius: number, dt: number, night: boolean) {
    if (Math.random() < dt * 14) {
      const x = WORLD.treeX + rnd(-radius, radius) * 0.9;
      this.emit(1, x, WORLD.groundY - rnd(0, 30), { speed: 8, max: 3, colors: [PAL.gold4, PAL.gold3, PAL.gold1], glow: true, gravity: -6, drag: 0.5, angle: -Math.PI / 2, spread: 0.6 });
    }
    if (Math.random() < dt * 3) {
      // falling leaf
      this.emit(1, WORLD.treeX + rnd(-40, 40), WORLD.groundY - rnd(50, 110), { speed: 10, max: 4, colors: [PAL.gold4, PAL.gold3, PAL.gold2], glow: true, gravity: 6, drag: 1, angle: Math.PI / 2, spread: 1.5 });
    }
    if (night && Math.random() < dt * 10) {
      // dark wisps licking the edge of the light
      const side = Math.random() > 0.5 ? 1 : -1;
      const x = WORLD.treeX + side * (radius + rnd(0, 26));
      this.emit(1, x, WORLD.groundY - rnd(0, 60), { speed: 12, max: 1.6, colors: ['#2a2050', '#1a1436', '#0e0b20'], gravity: -4, size: 2, drag: 0.6, vx: -side * 6 });
    }
  }
}
