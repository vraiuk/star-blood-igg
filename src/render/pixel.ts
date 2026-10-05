/** Pixel-art drawing primitives. Everything snaps to integer pixels, no anti-aliasing. */

export type Ctx = CanvasRenderingContext2D;

export const PAL = {
  // environment
  void: '#05060d',
  sky0: '#070818',
  sky1: '#0b0d24',
  sky2: '#12122f',
  sky3: '#1c1638',
  sky4: '#2a1d45',
  far0: '#141533',
  far1: '#191a3c',
  farLit: '#6b4fa8',
  mid0: '#0c0d20',
  mid1: '#10112a',
  dirt0: '#0d0a12',
  dirt1: '#150f1b',
  dirt2: '#1e1626',
  dirt3: '#2a1f33',
  rock: '#231d2e',
  rockHi: '#352b44',
  grassDark: '#16213a',
  grassDark2: '#1d2a48',
  // light
  gold0: '#5a3a12',
  gold1: '#a8641c',
  gold2: '#e09a2c',
  gold3: '#ffc847',
  gold4: '#ffe58a',
  gold5: '#fff6cf',
  amber: '#ff9a3c',
  // bark
  bark0: '#140c10',
  bark1: '#22151b',
  bark2: '#33212a',
  // creatures
  shade0: '#06060c',
  shade1: '#0f0e1b',
  shade2: '#1d1a30',
  shadeRim: '#4a3b72',
  eye: '#e6f4ff',
  eyeGlow: '#9fd0ff',
  acid0: '#2f7a12',
  acid1: '#6be32a',
  acid2: '#c6ff6a',
  worm0: '#1f1226',
  worm1: '#3a2148',
  worm2: '#5a3570',
  wormSpot: '#ff9a3c',
  maw: '#c23a4a',
  // keeper & structures
  cloak0: '#7d7468',
  cloak1: '#b9b0a0',
  cloak2: '#e8e1d0',
  wood0: '#2a1a12',
  wood1: '#43291a',
  wood2: '#5e3b22',
  wood3: '#7a5130',
  iron: '#3b3a4a',
  banner: '#6e1f2a',
  blood0: '#6a0f22',
  blood1: '#c21f3a',
  blood2: '#ff5a6a',
  white: '#ffffff',
} as const;

export function px(c: Ctx, x: number, y: number, color: string, w = 1, h = 1) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

export function rect(c: Ctx, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Bresenham line with integer thickness (square brush). */
export function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, color: string, t = 1) {
  c.fillStyle = color;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor(t / 2);
  for (let i = 0; i < 2000; i++) {
    c.fillRect(x0 - o, y0 - o, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled pixel disc. */
export function disc(c: Ctx, cx: number, cy: number, r: number, color: string) {
  c.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy);
  const rr = r * r + r * 0.8;
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
    const w = Math.floor(Math.sqrt(Math.max(0, rr - y * y)));
    if (w <= 0 && Math.abs(y) > r) continue;
    c.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

/** Filled pixel ellipse. */
export function ellipse(c: Ctx, cx: number, cy: number, rx: number, ry: number, color: string) {
  c.fillStyle = color;
  cx = Math.round(cx); cy = Math.round(cy);
  for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
    const k = 1 - (y * y) / (ry * ry + 0.5);
    if (k < 0) continue;
    const w = Math.round(rx * Math.sqrt(k));
    c.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

/** Pixel ring (outline circle). */
export function ring(c: Ctx, cx: number, cy: number, r: number, color: string) {
  c.fillStyle = color;
  const steps = Math.max(12, Math.round(r * 7));
  let lx = NaN, ly = NaN;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (x === lx && y === ly) continue;
    c.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
}

/** 4×4 Bayer matrix, values 0..15 */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Dithered threshold test: is `v` (0..1) “on” at pixel (x,y)? */
export function dither(x: number, y: number, v: number): boolean {
  return v * 16 > BAYER4[(y & 3) * 4 + (x & 3)] + 0.5;
}

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.imageSmoothingEnabled = false;
  return [cv, c];
}

export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
export function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
