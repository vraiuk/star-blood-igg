import { WORLD } from '../data/balance';
import { type Ctx, PAL, dither, ellipse, line, rect, seeded } from './pixel';

import { SHAPES } from '../data/treeShape';


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
 * Draws the Igg tree: bark, molten-gold veins, and the amber canopy.
 * `grow` 0..1 animates a growth pulse right after a stage-up.
 */
export function drawTree(c: Ctx, stage: number, time: number, hurt: number, growPulse: number) {
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
  // golden veins
  for (const s of shape.segs) {
    if (s.depth > 4) continue;
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.2 + s.depth * 1.3);
    const col = hurt > 0 ? '#ff7a6a' : pulse > 0.8 ? PAL.gold5 : pulse > 0.4 ? PAL.gold4 : PAL.gold3;
    line(c, ox + s.x0 + sway(s.y0), oy + s.y0, ox + s.x1 + sway(s.y1), oy + s.y1, col, 1);
  }

  // canopy: layered blobs → highlights → twinkling specks
  const leafCols = [PAL.gold0, PAL.gold1, PAL.gold2, PAL.gold3];
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
      if (tw > 0.2) rect(c, x, y, 1, 1, tw > 0.85 ? PAL.gold5 : PAL.gold4);
    }
  }
  // falling-leaf / dust drift handled by particles
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
