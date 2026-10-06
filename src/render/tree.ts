import { WORLD } from '../data/balance';
import { type Ctx, PAL, dither, ellipse, line, rect, seeded } from './pixel';

import { SHAPES } from '../data/treeShape';
import { branchById, pathCounts, type TreePath } from '../data/tree';


/** Height of the canopy top above the ground for the given stage (for UI anchoring). */
export function treeHeight(stage: number) { return SHAPES[stage].height; }

/**
 * Draws roots (underground glow veins). Called before entities so worms crawl over them.
 */
export function drawRoots(c: Ctx, stage: number, time: number, hurt: number) {
  const shape = SHAPES[stage];
  const ox = WORLD.treeX, oy = WORLD.groundY;
  for (const s of shape.roots) {
    line(c, ox + s.x0, oy + s.y0, ox + s.x1, oy + s.y1, PAL.bark1, Math.max(1, Math.round(s.t)));
  }
  for (const s of shape.roots) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2 - s.depth * 0.9);
    const col = hurt > 0 ? '#ff6a5a' : pulse > 0.75 ? PAL.gold4 : s.depth <= 2 ? PAL.gold3 : PAL.gold2;
    line(c, ox + s.x0, oy + s.y0, ox + s.x1, oy + s.y1, col, 1);
  }
  // glowing nodes travelling along roots
  for (let i = 0; i < shape.roots.length; i += 3) {
    const s = shape.roots[i];
    const t = (time * 0.35 + i * 0.137) % 1;
    const x = ox + s.x0 + (s.x1 - s.x0) * t;
    const y = oy + s.y0 + (s.y1 - s.y0) * t;
    rect(c, x - 1, y - 1, 2, 2, PAL.gold5);
  }
}

/**
 * Уклон Древа changes its look: the dominant path recolours the crown (a tint after one
 * branch, the full palette after two) and the special Tree (three branches) gets its own mark.
 */
export interface TreeLook {
  path: 'gold' | 'amber' | 'light' | 'root' | 'star';
  /** branches of that path (0..3+) */
  depth: number;
}
const LOOKS: Record<TreeLook['path'], { leaves: string[]; speck: [string, string]; vein: [string, string, string] }> = {
  gold: { leaves: [PAL.gold0, PAL.gold1, PAL.gold2, PAL.gold3], speck: [PAL.gold4, PAL.gold5], vein: [PAL.gold3, PAL.gold4, PAL.gold5] },
  amber: { leaves: ['#8a400c', '#d06a1e', '#ff9234', '#ffc066'], speck: ['#ffc070', '#ffe0b0'], vein: ['#e06a20', '#ff9a3c', '#ffd08a'] },
  light: { leaves: ['#8a6224', '#e0b04a', '#ffe7a0', '#fff8dc'], speck: ['#ffffff', '#fffbe8'], vein: ['#f0e0a0', '#fff6cf', '#ffffff'] },
  root: { leaves: ['#183812', '#2e6a22', '#5aa03a', '#a8e070'], speck: ['#d8ff9a', '#f0ffd0'], vein: ['#5aa03a', '#8fd06a', '#d0ff9a'] },
  star: { leaves: ['#1a1e4a', '#3a46a0', '#6a86e0', '#b8ccff'], speck: ['#d8e8ff', '#ffffff'], vein: ['#6a86e0', '#8fb0ff', '#e0ecff'] },
};
/** The Tree's look from its chosen branches: the strongest path (ties → the latest branch). */
export function treeLook(branches: string[]): TreeLook {
  if (!branches.length) return { path: 'gold', depth: 0 };
  const counts = pathCounts(branches);
  const best = Math.max(...Object.values(counts));
  const tied = (Object.keys(counts) as TreePath[]).filter((p) => counts[p] === best);
  let path: TreePath = tied[0];
  for (let i = branches.length - 1; i >= 0; i--) {
    const b = branchById(branches[i]);
    if (b && tied.includes(b.path)) { path = b.path; break; }
  }
  return { path, depth: best };
}

const mix = (a: string, b: string, k: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('')}`;
};

/**
 * Draws the Igg tree: bark, molten-gold veins, and the amber canopy.
 * `grow` 0..1 animates a growth pulse right after a stage-up.
 */
export function drawTree(c: Ctx, stage: number, time: number, hurt: number, growPulse: number, look: TreeLook = { path: 'gold', depth: 0 }) {
  if (stage === 0) { drawSeed(c, time, hurt, growPulse); return; }
  const shape = SHAPES[stage];
  const ox = WORLD.treeX, oy = WORLD.groundY;
  const sway = (y: number) => Math.sin(time * 0.9 + y * 0.03) * (-y / 120) * 1.6;

  // bark
  for (const s of shape.segs) {
    const t = Math.max(1, Math.round(s.t));
    line(c, ox + s.x0 + sway(s.y0), oy + s.y0, ox + s.x1 + sway(s.y1), oy + s.y1, PAL.bark0, t + 1);
  }
  for (const s of shape.segs) {
    const t = Math.max(1, Math.round(s.t) - 1);
    line(c, ox + s.x0 + sway(s.y0) - 0.5, oy + s.y0, ox + s.x1 + sway(s.y1) - 0.5, oy + s.y1, PAL.bark2, t);
  }
  // root flare at the base
  for (let i = -6 - stage; i <= 6 + stage; i++) {
    const h = Math.max(0, 6 + stage - Math.abs(i)) * 0.7;
    rect(c, ox + i - 1, oy - h, 1, h, Math.abs(i) < 3 ? PAL.bark2 : PAL.bark1);
  }
  // the crown's palette: gold, tinted (one branch) or fully recoloured (two+) by the Уклон
  const base = LOOKS.gold, tgt = LOOKS[look.path];
  const k = look.path === 'gold' ? 0 : look.depth >= 2 ? 1 : 0.45;
  const leafCols = base.leaves.map((cl, i) => mix(cl, tgt.leaves[i], k));
  const speck = [mix(base.speck[0], tgt.speck[0], k), mix(base.speck[1], tgt.speck[1], k)];
  const vein = base.vein.map((cl, i) => mix(cl, tgt.vein[i], k));
  // veins
  for (const s of shape.segs) {
    if (s.depth > 4) continue;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + s.depth * 1.3);
    const col = hurt > 0 ? '#ff7a6a' : pulse > 0.8 ? vein[2] : pulse > 0.4 ? vein[1] : vein[0];
    line(c, ox + s.x0 + sway(s.y0), oy + s.y0, ox + s.x1 + sway(s.y1), oy + s.y1, col, 1);
  }

  // canopy: layered blobs → highlights → twinkling specks
  for (let layer = 0; layer < leafCols.length; layer++) {
    for (const l of shape.leaves) {
      const sx = ox + l.x + sway(l.y);
      const sy = oy + l.y;
      const rr = l.r * (1 - layer * 0.2) * (1 + growPulse * 0.25);
      ellipse(c, sx - layer * 0.6, sy - layer * 1.2, rr, rr * 0.75, leafCols[layer]);
    }
  }
  for (const l of shape.leaves) {
    const sx = ox + l.x + sway(l.y);
    const sy = oy + l.y;
    const r = seeded(Math.floor(l.seed));
    for (let i = 0; i < 6 + stage * 2; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * l.r;
      const x = sx + Math.cos(a) * d;
      const y = sy + Math.sin(a) * d * 0.7 - 1;
      const tw = Math.sin(time * 3 + l.seed + i * 1.7);
      if (tw > 0.2) rect(c, x, y, 1, 1, tw > 0.85 ? speck[1] : speck[0]);
    }
  }
  if (look.depth >= 3) drawTreeMark(c, look.path, shape, ox, oy, time, sway);
  // falling-leaf / dust drift handled by particles
}

/** The special Tree's own mark (three branches of one path). */
function drawTreeMark(c: Ctx, path: TreeLook['path'], shape: (typeof SHAPES)[number], ox: number, oy: number, time: number, sway: (y: number) => number) {
  const leaves = shape.leaves;
  if (path === 'amber') {
    // Янтарное Древо: resin drops swelling and falling from the crown
    leaves.forEach((l, i) => {
      if (i % 2) return;
      const t = (time * 0.4 + i * 0.37) % 1;
      const x = ox + l.x + sway(l.y), y0 = oy + l.y + l.r * 0.6;
      rect(c, x, y0, 1, 2 + Math.round(t * 3), '#e07a2a');
      rect(c, x, y0 + 2 + Math.round(t * 3), 2, 2, t > 0.5 ? '#ffd08a' : '#ffa84a');
    });
  } else if (path === 'light') {
    // Светоносное Древо: a halo and slow rays above the crown
    const top = oy - shape.height;
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (i - 4) * 0.28 + Math.sin(time * 0.6 + i) * 0.04;
      const len = 26 + 10 * Math.sin(time * 1.3 + i * 2.1);
      for (let d = 10; d < len; d += 3) rect(c, ox + Math.cos(a) * d * 1.6, top + 10 + Math.sin(a) * d, 1, 2, 'rgba(255,250,220,0.55)');
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      if (Math.sin(time * 3 + i) > 0.6) rect(c, ox + Math.cos(a) * 30, top + 6 + Math.sin(a) * 8, 1, 1, '#fffbe8');
    }
  } else if (path === 'root') {
    // Корневое Древо: vines hanging from the branches, swaying
    leaves.forEach((l, i) => {
      if (i % 3) return;
      const x = ox + l.x + sway(l.y), y0 = oy + l.y + l.r * 0.5;
      const len = 14 + (i % 5) * 4;
      for (let d = 0; d < len; d++) rect(c, x + Math.round(Math.sin(time * 1.5 + d * 0.3 + i) * (d / len) * 2), y0 + d, 1, 1, d % 4 ? '#3a7a28' : '#8fd06a');
    });
  } else if (path === 'star') {
    // Звёздное Древо: little stars orbit the crown
    const cy = oy - shape.height * 0.7;
    for (let i = 0; i < 7; i++) {
      const a = time * (0.5 + i * 0.07) + i * 0.9;
      const x = ox + Math.cos(a) * shape.height * 0.55, y = cy + Math.sin(a) * shape.height * 0.18;
      rect(c, x - 1, y, 3, 1, '#e0ecff'); rect(c, x, y - 1, 1, 3, '#e0ecff');
      if (Math.sin(time * 5 + i) > 0) rect(c, x, y, 1, 1, '#ffffff');
    }
  }
}

/** Golden grass that grows within the tree light. Darker blue grass beyond. */
export function drawGrass(c: Ctx, radius: number, time: number, lanterns: Array<{ x: number; r: number }>) {
  const gy = WORLD.groundY;
  for (let x = 0; x < WORLD.width; x++) {
    const d = Math.abs(x - WORLD.treeX);
    let lit = d <= radius ? 1 - Math.max(0, (d - radius + 30) / 30) : 0;
    for (const l of lanterns) {
      const ld = Math.abs(x - l.x);
      if (ld < l.r) lit = Math.max(lit, (1 - ld / l.r) * 0.8);
    }
    const hseed = (x * 7919) % 13;
    const h = 2 + (hseed % 4) + (lit > 0.3 ? 1 : 0);
    const sway = Math.round(Math.sin(time * 1.5 + x * 0.21) * 0.6);
    const on = dither(x, 0, lit);
    const base = on ? PAL.gold1 : PAL.grassDark;
    const tip = on ? (hseed % 5 === 0 ? PAL.gold4 : PAL.gold3) : PAL.grassDark2;
    rect(c, x, gy - h + 1, 1, h - 1, base);
    rect(c, x + sway, gy - h, 1, 1, tip);
    // tiny flowers in strong light
    if (on && lit > 0.6 && hseed === 3) {
      rect(c, x + sway, gy - h - 1, 1, 1, PAL.gold5);
    }
  }
}

/** Stage 0: «Семя Великого Игг-Древа. Не пророщено. Содержит Звёздную Кровь.» */
function drawSeed(c: Ctx, time: number, hurt: number, pulse: number) {
  const x = WORLD.treeX, y = WORLD.groundY;
  const g = 0.5 + 0.5 * Math.sin(time * 2.4);
  // seed bulb half-buried, glowing with star blood
  ellipse(c, x, y - 2, 5 + pulse * 2, 4 + pulse, PAL.gold0);
  ellipse(c, x, y - 3, 4, 3, hurt > 0 ? '#ff7a6a' : PAL.gold2);
  ellipse(c, x - 1, y - 4, 2, 1.5, g > 0.5 ? PAL.gold5 : PAL.gold4);
  rect(c, x + 1, y - 3, 1, 1, PAL.blood2);
  // a first thread of a sprout
  line(c, x, y - 6, x + Math.round(Math.sin(time) * 1), y - 11, PAL.gold3);
  rect(c, x - 2 + Math.round(Math.sin(time)), y - 12, 2, 1, 'rgba(255,240,180,0.8)');
  rect(c, x + 1 + Math.round(Math.sin(time)), y - 13, 2, 1, 'rgba(255,240,180,0.6)');
  // motes rising from the seed
  for (let i = 0; i < 4; i++) {
    const k = (time * 0.4 + i * 0.25) % 1;
    rect(c, x + Math.sin(i * 2 + time) * 4, y - 6 - k * 18, 1, 1, k < 0.6 ? PAL.gold5 : PAL.gold3);
  }
}
