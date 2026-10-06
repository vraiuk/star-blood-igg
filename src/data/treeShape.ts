import { mulberry32 as seeded } from '../sim/rng';

/**
 * Procedural shape of the Igg-Tree for every growth stage (pure data, no drawing): trunk and
 * branch segments, leaf clusters and roots. Shared by the renderer and by gameplay code that
 * needs to know where the crown is (crown slots).
 */
export interface Seg { x0: number; y0: number; x1: number; y1: number; t: number; depth: number; }
export interface Leaf { x: number; y: number; r: number; depth: number; seed: number; }
export interface TreeShape { segs: Seg[]; leaves: Leaf[]; roots: Seg[]; height: number; }

/**
 * Growth ladder (design/v3-plan.md): a glowing seed → a sprout with two translucent
 * leaves → … → the Great Igg-Tree whose crown spreads across the whole sky.
 * `spread` stretches the crown sideways; `flat` lets branches go nearly horizontal.
 */
const STAGE_SIZE = [
  { len: 8, depth: 1, thick: 1, roots: 18, spread: 1, flat: 0.5, leaf: 3 },
  { len: 18, depth: 3, thick: 2, roots: 34, spread: 1, flat: 0.5, leaf: 5 },
  { len: 32, depth: 5, thick: 4, roots: 56, spread: 1.1, flat: 0.45, leaf: 8 },
  { len: 46, depth: 6, thick: 6, roots: 80, spread: 1.3, flat: 0.35, leaf: 10 },
  { len: 62, depth: 7, thick: 8, roots: 108, spread: 1.55, flat: 0.25, leaf: 12 },
  { len: 80, depth: 7, thick: 11, roots: 140, spread: 1.9, flat: 0.16, leaf: 15 },
];

function grow(stage: number): TreeShape {
  const sz = STAGE_SIZE[stage];
  const r = seeded(4242 + stage * 17);
  const segs: Seg[] = [];
  const leaves: Leaf[] = [];
  const branch = (x: number, y: number, ang: number, len: number, t: number, d: number) => {
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    segs.push({ x0: x, y0: y, x1, y1, t, depth: d });
    if (d >= sz.depth || len < 4) {
      leaves.push({ x: x1, y: y1, r: sz.leaf + r() * sz.leaf * 0.6, depth: d, seed: r() * 1000 });
      return;
    }
    const n = d < 2 ? 2 : r() > 0.35 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const spread = 0.42 + r() * 0.28;
      const a = ang + (i - (n - 1) / 2) * spread * (n === 3 ? 0.9 : 1.6) + (r() - 0.5) * 0.25;
      // keep branches from drooping below horizontal
      const clampA = Math.max(-Math.PI + sz.flat, Math.min(-sz.flat, a));
      branch(x1, y1, clampA, len * (0.7 + r() * 0.12), Math.max(1, t * 0.68), d + 1);
    }
    if (d > 1 && r() > 0.2) leaves.push({ x: x1, y: y1, r: sz.leaf * 0.8 + r() * sz.leaf * 0.4, depth: d, seed: r() * 1000 });
  };
  // slight S-curve trunk: two segments
  const trunkLen = sz.len * 1.25;
  segs.push({ x0: 0, y0: 0, x1: -2, y1: -trunkLen * 0.55, t: sz.thick * 1.8 + 2, depth: 0 });
  branch(-2, -trunkLen * 0.55, -Math.PI / 2 + 0.06, trunkLen * 0.55, sz.thick * 1.4, 1);

  const roots: Seg[] = [];
  const root = (x: number, y: number, ang: number, len: number, t: number, d: number) => {
    const x1 = x + Math.cos(ang) * len;
    const y1 = y + Math.sin(ang) * len;
    roots.push({ x0: x, y0: y, x1, y1, t, depth: d });
    if (d >= 5 || len < 5) return;
    const n = r() > 0.4 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * (0.5 + r() * 0.4) + (r() - 0.5) * 0.3;
      root(x1, y1, Math.max(0.05, Math.min(Math.PI - 0.05, a)), len * (0.68 + r() * 0.15), Math.max(1, t * 0.66), d + 1);
    }
  };
  for (const a of [0.35, 1.05, 1.57, 2.1, 2.8]) root(0, 2, a, sz.roots * (a === 1.57 ? 0.5 : 0.42), Math.max(1, sz.thick * 0.8), 1);
  // stretch the crown sideways (the trunk stays put)
  for (const sg of segs) if (sg.depth > 0) { sg.x0 *= sz.spread; sg.x1 *= sz.spread; }
  for (const l of leaves) l.x *= sz.spread;
  for (const rt of roots) { rt.x0 *= sz.spread; rt.x1 *= sz.spread; }
  const height = Math.max(...leaves.map((l) => -l.y)) + 10;
  return { segs, leaves, roots, height };
}

export const SHAPES = STAGE_SIZE.map((_, i) => grow(i));
