import { ENEMIES, WORLD } from '../data/balance';
import { NESTS } from '../data/nests';
import type { Drop, Enemy, Keeper, Projectile, Structure } from '../sim/types';
import { type Ctx, PAL, disc, ellipse, line, rect, ring } from './pixel';

const GY = WORLD.groundY;
/** y where underground slots (root spikes) sit */
export const ROOT_SLOT_Y = GY + 48;

// ───────────────────────────── enemies ─────────────────────────────

/** Body pass — drawn under the darkness overlay. */
export function drawEnemy(c: Ctx, e: Enemy, time: number) {
  const flash = e.hitFlash > 0;
  const body = flash ? '#ffffff' : e.lit ? '#241f3c' : PAL.shade1;
  // golden rim = «высвечен» стрекозами (takes extra damage)
  const rim = flash ? '#ffffff' : e.vuln > 0 ? (Math.sin(time * 10 + e.id) > 0 ? PAL.gold4 : PAL.gold2) : e.lit ? '#8a6cc8' : PAL.shadeRim;
  const t = e.age;
  const moving = !e.attacking && e.stun <= 0 && e.rooted <= 0;
  switch (e.kind) {
    case 'hound': return hound(c, e, t, moving, body, rim);
    case 'stalker': return stalker(c, e, t, moving, body, rim);
    case 'spitter': return spitter(c, e, t, moving, body, rim, time);
    case 'worm': return worm(c, e, t, flash);
    case 'larva': return larva(c, e, t, flash);
    case 'mother': return mother(c, e, t, flash, time);
    case 'forager': return forager(c, e, t, moving, body, rim);
    case 'guard': return guard(c, e, t, flash);
    case 'executioner': return executioner(c, e, t, flash, time, rim);
  }
}

function hound(c: Ctx, e: Enemy, t: number, moving: boolean, body: string, rim: string) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const ph = moving ? t * 14 : 0;
  const lunge = e.attacking ? Math.max(0, Math.sin(t * 9)) * 3 : 0;
  // legs (long, thin)
  for (let i = 0; i < 4; i++) {
    const lx = x + (i < 2 ? 4 : -4) * d + (i % 2 ? 1 : -1);
    const sw = Math.sin(ph + i * 1.7) * 3;
    line(c, lx, y - 8, lx + sw * d, y, PAL.shade0);
    line(c, lx + sw * d, y - 1, lx + sw * d + d, y, rim);
  }
  // tail
  for (let i = 0; i < 6; i++) {
    rect(c, x - (7 + i) * d, y - 10 - Math.sin(t * 6 + i) * 1.2 + i * 0.3, 1, 1, body);
  }
  ellipse(c, x + lunge * d, y - 10, 7, 3, body);
  // spines
  for (let i = -4; i <= 4; i += 2) rect(c, x + i + lunge * d, y - 14 - ((i + 6) % 3), 1, 2, rim);
  // head + jaw
  ellipse(c, x + (8 + lunge) * d, y - 10, 3, 2, body);
  line(c, x + (9 + lunge) * d, y - 9, x + (13 + lunge) * d, y - 8, body, 1);
  rect(c, x - 5, y - 12, 10, 1, rim);
}

function stalker(c: Ctx, e: Enemy, t: number, moving: boolean, body: string, rim: string) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const ph = moving ? t * 5 : 0;
  const bodyY = y - 28 + Math.sin(ph * 2) * 1;
  for (let i = 0; i < 4; i++) {
    const side = i < 2 ? 1 : -1;
    const sw = Math.sin(ph + i * 1.6) * 5;
    const fx = x + side * 6 * d + sw * d;
    const kx = x + side * 10 * d + sw * 0.5 * d;
    const ky = bodyY - 8;
    line(c, x + side * 2 * d, bodyY, kx, ky, PAL.shade0);
    line(c, kx, ky, fx, y, PAL.shade0);
    rect(c, kx, ky, 1, 1, rim);
  }
  ellipse(c, x, bodyY, 6, 4, body);
  rect(c, x - 4, bodyY - 4, 8, 1, rim);
  // drooping neck and head
  const swing = e.attacking ? Math.sin(t * 6) * 4 : Math.sin(t * 2) * 1;
  const hx = x + (9 + swing) * d, hy = bodyY + 4 + Math.abs(swing);
  line(c, x + 4 * d, bodyY, hx, hy, body, 2);
  ellipse(c, hx, hy, 3, 3, body);
  // long arms with claws
  const ax = x + (6 + swing * 0.5) * d;
  line(c, x + 3 * d, bodyY + 2, ax, bodyY + 16, PAL.shade0);
  line(c, ax, bodyY + 16, ax + 3 * d, bodyY + 18, rim);
}

function spitter(c: Ctx, e: Enemy, t: number, moving: boolean, body: string, rim: string, time: number) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const ph = moving ? t * 9 : 0;
  for (let i = 0; i < 4; i++) {
    const lx = x + (i - 1.5) * 3;
    const sw = Math.sin(ph + i * 2) * 2;
    line(c, lx, y - 4, lx + sw, y, PAL.shade0);
  }
  ellipse(c, x, y - 8, 8, 5, body);
  rect(c, x - 6, y - 13, 12, 1, rim);
  // glowing acid sac
  const charge = e.attacking ? 1 - Math.max(0, e.attackCd) / ENEMIES.spitter.attackRate : 0.4 + Math.sin(time * 3) * 0.2;
  const sr = 3 + charge * 2;
  disc(c, x - 2 * d, y - 13, sr, PAL.acid0);
  disc(c, x - 2 * d, y - 13, sr - 1, PAL.acid1);
  rect(c, x - 2 * d - 1, y - 15, 2, 1, PAL.acid2);
  // head and dripping maw
  ellipse(c, x + 8 * d, y - 7, 3, 3, body);
  rect(c, x + 10 * d, y - 6, 1, 2 + Math.round(Math.sin(t * 4) + 1), PAL.acid1);
}

function worm(c: Ctx, e: Enemy, t: number, flash: boolean) {
  const d = e.dir;
  const n = 8;
  const gnaw = e.attacking;
  for (let i = n - 1; i >= 0; i--) {
    const sx = e.x - i * 6 * d;
    const sy = e.y + Math.sin(t * 4 - i * 0.8) * 3;
    const r = 6.5 - i * 0.45;
    disc(c, sx, sy, r, flash ? '#ffffff' : PAL.worm0);
    disc(c, sx, sy - 1, r - 1.2, flash ? '#ffffff' : PAL.worm1);
    rect(c, sx - r * 0.5, sy - r + 1, r, 1, PAL.worm2);
    if (i % 2 === 0) rect(c, sx, sy + 1, 2, 2, PAL.wormSpot);
    // bristles
    rect(c, sx, sy - r - 1, 1, 2, '#6f5a7a');
  }
  const hx = e.x + 4 * d, hy = e.y + Math.sin(t * 4) * 3;
  const open = gnaw ? 2 + Math.abs(Math.sin(t * 10)) * 2 : 1.5;
  disc(c, hx, hy, 4, PAL.worm1);
  disc(c, hx + d, hy, open, PAL.maw);
  rect(c, hx + d * (open + 1), hy - 2, 1, 1, '#f0e0e0');
  rect(c, hx + d * (open + 1), hy + 2, 1, 1, '#f0e0e0');
}

/** Имаго-Фуражир: «чёрный таракан чуть поменьше человека». */
function forager(c: Ctx, e: Enemy, t: number, moving: boolean, body: string, rim: string) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const ph = moving ? t * 16 : 0;
  for (let i = 0; i < 3; i++) {
    const lx = x + (i - 1) * 4;
    const sw = Math.sin(ph + i * 2.1) * 2;
    line(c, lx, y - 4, lx + sw - d * 2, y, PAL.shade0);
    line(c, lx, y - 4, lx - sw + d * 2, y, PAL.shade0);
  }
  ellipse(c, x, y - 6, 8, 3, body);
  ellipse(c, x - d, y - 7, 6, 2, '#16121f');
  rect(c, x - 6, y - 9, 12, 1, rim);
  ellipse(c, x + 8 * d, y - 6, 2, 2, body);
  // antennae
  line(c, x + 9 * d, y - 7, x + 14 * d, y - 11 - Math.sin(t * 6), rim);
  line(c, x + 9 * d, y - 7, x + 13 * d, y - 9 + Math.sin(t * 5), rim);
}

/** Имаго-Страж: an armoured worm under the ground, plated segments. */
function guard(c: Ctx, e: Enemy, t: number, flash: boolean) {
  const d = e.dir;
  for (let i = 9; i >= 0; i--) {
    const sx = e.x - i * 6 * d;
    const sy = e.y + Math.sin(t * 3 - i * 0.7) * 2;
    const r = 7.5 - i * 0.4;
    disc(c, sx, sy, r, flash ? '#fff' : '#20202c');
    disc(c, sx, sy - 1, r - 1.2, flash ? '#fff' : '#3c3c4e');
    // armour plates
    rect(c, sx - r * 0.7, sy - r + 1, r * 1.4, 2, '#6e6e86');
    rect(c, sx - 1, sy - r, 2, 1, '#a8a8c0');
  }
  const hx = e.x + 5 * d, hy = e.y + Math.sin(t * 3) * 2;
  disc(c, hx, hy, 5, '#3c3c4e');
  disc(c, hx + d * 2, hy, e.attacking ? 3 + Math.abs(Math.sin(t * 9)) : 2, PAL.maw);
  line(c, hx + d * 3, hy - 3, hx + d * 7, hy - 5, '#c8c8dc');
  line(c, hx + d * 3, hy + 3, hx + d * 7, hy + 5, '#c8c8dc');
}

/** Имаго-Палач: «создан для уничтожения Восходящих» — huge armoured mantis-scolopendra. */
function executioner(c: Ctx, e: Enemy, t: number, flash: boolean, time: number, rim: string) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const walk = e.attacking ? 0 : t * 4;
  // many legs
  for (let i = 0; i < 6; i++) {
    const lx = x - 18 * d + i * 7 * d;
    const sw = Math.sin(walk + i * 1.3) * 3;
    line(c, lx, y - 14, lx + sw, y, PAL.shade0, 2);
  }
  // segmented body
  for (let i = 0; i < 6; i++) {
    const bx = x - 20 * d + i * 7 * d;
    const by = y - 16 - Math.max(0, i - 3) * 6;
    ellipse(c, bx, by, 6, 5, flash ? '#fff' : '#121019');
    rect(c, bx - 4, by - 5, 8, 1, '#4a3a5a');
  }
  // raised torso and head
  const hx = x + 18 * d, hy = y - 44;
  line(c, x + 10 * d, y - 30, hx, hy, '#121019', 5);
  ellipse(c, hx, hy, 6, 5, flash ? '#fff' : '#1a1624');
  rect(c, hx - 5, hy - 5, 10, 1, rim);
  // the poisoned claw (strikes when attacking)
  const swing = e.attacking ? Math.sin(t * 5) : 0.3;
  const cx = hx + d * (14 + swing * 8), cy = hy + 10 + swing * 14;
  line(c, hx + d * 3, hy + 2, hx + d * 9, hy + 8, '#121019', 3);
  line(c, hx + d * 9, hy + 8, cx, cy, '#d8d0e8', 2);
  rect(c, cx, cy, 2, 2, Math.sin(time * 8) > 0 ? PAL.acid2 : PAL.acid1);
}

function larva(c: Ctx, e: Enemy, t: number, flash: boolean) {
  for (let i = 0; i < 3; i++) {
    const sx = e.x - i * 3 * e.dir;
    const sy = GY - 2 - Math.max(0, Math.sin(t * 10 - i)) * 1.5;
    disc(c, sx, sy, 2 - i * 0.3, flash ? '#fff' : i === 0 ? '#5a3a6a' : PAL.worm1);
  }
  rect(c, e.x + e.dir * 2, GY - 3, 1, 1, PAL.wormSpot);
}

function mother(c: Ctx, e: Enemy, t: number, flash: boolean, time: number) {
  const d = e.dir;
  const n = 11;
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    // the front half rears up
    const rise = Math.max(0, 1 - k * 1.6) * 30 + Math.sin(t * 1.6 - i * 0.6) * 3;
    pts.push([e.x - i * 8 * d, GY - 12 - rise, 14 - k * 7]);
  }
  for (let i = n - 1; i >= 0; i--) {
    const [x, y, r] = pts[i];
    disc(c, x, y, r + 1, PAL.worm0);
    disc(c, x, y, r, flash ? '#fff' : PAL.worm1);
    ellipse(c, x - r * 0.2, y - r * 0.4, r * 0.6, r * 0.35, PAL.worm2);
    // bone spikes
    for (let s = -1; s <= 1; s++) line(c, x + s * 4, y - r, x + s * 6, y - r - 5, '#b8a3b8');
    if (i % 2 === 1) {
      const glow = 0.5 + 0.5 * Math.sin(time * 4 + i);
      disc(c, x, y + r * 0.3, 2, glow > 0.5 ? '#ffc070' : PAL.wormSpot);
    }
  }
  const [hx, hy] = pts[0];
  const open = e.attacking ? 6 + Math.abs(Math.sin(t * 4)) * 3 : 5;
  disc(c, hx + 5 * d, hy, open + 2, PAL.worm0);
  disc(c, hx + 6 * d, hy, open, '#3a0a14');
  disc(c, hx + 6 * d, hy, open - 2, PAL.maw);
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    rect(c, hx + 6 * d + Math.cos(ang) * open, hy + Math.sin(ang) * open, 1, 1, '#f3e6e6');
  }
}

/** Eyes pass — drawn above the darkness so creatures read as eyes in the dark. */
export function drawEnemyEyes(c: Ctx, e: Enemy, time: number) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const blink = Math.sin(time * 1.3 + e.id * 2.1) > 0.97;
  if (blink) return;
  const eye = (ex: number, ey: number, col: string = PAL.eye) => {
    rect(c, ex, ey, 1, 1, col);
  };
  switch (e.kind) {
    case 'hound': {
      const lunge = e.attacking ? Math.max(0, Math.sin(e.age * 9)) * 3 : 0;
      eye(x + (9 + lunge) * d, y - 11);
      eye(x + (8 + lunge) * d, y - 11, PAL.eyeGlow);
      break;
    }
    case 'stalker': {
      const swing = e.attacking ? Math.sin(e.age * 6) * 4 : Math.sin(e.age * 2) * 1;
      const hx = x + (9 + swing) * d, hy = y - 28 + 4 + Math.abs(swing);
      eye(hx + d, hy - 1); eye(hx + 2 * d, hy); eye(hx, hy + 1, PAL.eyeGlow);
      break;
    }
    case 'spitter':
      eye(x + 9 * d, y - 8, '#d8ffb0'); eye(x + 10 * d, y - 8, '#d8ffb0');
      break;
    case 'mother': {
      const hy = GY - 12 - 30 + Math.sin(e.age * 1.6) * 3;
      for (let i = 0; i < 4; i++) eye(e.x + (2 + i * 2) * d, hy - 8 + (i % 2), '#ffb070');
      break;
    }
    case 'worm':
      eye(e.x + 5 * d, e.y + Math.sin(e.age * 4) * 3 - 3, '#ffb070');
      break;
    case 'guard':
      eye(e.x + 6 * d, e.y + Math.sin(e.age * 3) * 2 - 3, '#ff5a5a');
      eye(e.x + 7 * d, e.y + Math.sin(e.age * 3) * 2 - 2, '#ff5a5a');
      break;
    case 'forager':
      eye(x + 9 * d, y - 7, '#ffd0a0');
      break;
    case 'executioner':
      for (let i = 0; i < 3; i++) eye(x + (20 + i) * d, y - 45 + i, '#ff4a4a');
      break;
    default:
      break;
  }
}

export function drawEnemyHp(c: Ctx, e: Enemy) {
  if (e.hp >= e.maxHp || !e.lit) return;
  const def = ENEMIES[e.kind];
  const w = def.boss ? 60 : Math.max(8, Math.min(30, def.radius * 2));
  const y = def.underground ? e.y - 12 : e.kind === 'mother' ? GY - 66 : e.kind === 'executioner' ? GY - 62 : GY - def.height - 6;
  rect(c, e.x - w / 2, y, w, 2, '#1a0b14');
  rect(c, e.x - w / 2, y, Math.max(1, (w * e.hp) / e.maxHp), 1, def.worm ? '#ff9a3c' : '#c58cff');
}

// ───────────────────────────── keeper ──────────────────────────────

export function drawKeeper(c: Ctx, k: Keeper, time: number) {
  if (!k.alive) return;
  const x = Math.round(k.x), y = GY;
  const d = k.dir;
  const bob = k.walkT > 0 ? Math.abs(Math.sin(k.walkT * 12)) : Math.sin(time * 2) * 0.4;
  const flash = k.hitFlash > 0;
  const top = y - 15 - Math.round(bob);
  // cloak (flared, hand-painted steps)
  const cloak0 = flash ? '#ffb0b0' : PAL.cloak0;
  const cloak1 = flash ? '#ffd0d0' : PAL.cloak1;
  for (let i = 0; i < 12; i++) {
    const w = 2 + Math.floor(i * 0.42);
    rect(c, x - w, top + 3 + i, w * 2 + 1, 1, i < 2 ? cloak1 : cloak0);
    rect(c, x - w + (d > 0 ? 0 : w), top + 3 + i, w + 1, 1, cloak1);
  }
  // hood
  ellipse(c, x, top + 2, 3, 3, cloak1);
  rect(c, x + d * 1, top + 2, 2, 2, '#2a2430');
  rect(c, x + d * 2, top + 2, 1, 1, PAL.gold4);
  // feet
  const step = k.walkT > 0 ? Math.round(Math.sin(k.walkT * 12) * 2) : 0;
  rect(c, x - 2 + step, y - 1, 2, 1, '#3a3330');
  rect(c, x + 1 - step, y - 1, 2, 1, '#3a3330');
  // staff
  const casting = k.castAnim < 0.25;
  const sx = x + d * 5;
  const sTop = top - (casting ? 6 : 2);
  line(c, sx, y - 1, sx, sTop, PAL.wood2);
  const g = 0.6 + 0.4 * Math.sin(time * 5);
  disc(c, sx, sTop - 1, casting ? 2.5 : 1.5, g > 0.8 || casting ? PAL.gold5 : PAL.gold4);
}

// ───────────────────────────── nests ───────────────────────────────

/** Visual tier 0..4 → size step; spec decides the silhouette at tier ≥ 3. */
export function drawStructure(c: Ctx, s: Structure, time: number) {
  const flash = s.hitFlash > 0;
  const build = Math.min(1, s.age / 0.35);
  c.save();
  if (build < 1) {
    c.beginPath();
    c.rect(s.x - 30, s.underground ? ROOT_SLOT_Y - 20 : GY - 70 * build - 2, 60, 200);
    c.clip();
  }
  switch (s.family) {
    case 'hive': hive(c, s, time, flash); break;
    case 'beetle': beetle(c, s, time, flash); break;
    case 'dragonfly': dragonflyNest(c, s, time, flash); break;
    case 'spider': spider(c, s, time); break;
  }
  c.restore();
  if (s.hp < s.maxHp || s.family === 'beetle') {
    const w = 16;
    const y = s.family === 'spider' ? ROOT_SLOT_Y - 14 : s.family === 'beetle' ? GY - 24 - s.tier * 2 : s.family === 'dragonfly' ? GY - 44 : GY - 52;
    rect(c, s.x - w / 2, y, w, 2, '#10070c');
    rect(c, s.x - w / 2, y, Math.max(1, (w * s.hp) / s.maxHp), 1, s.hp / s.maxHp < 0.35 ? '#ff5a4a' : '#ffd25a');
  }
  // tier pips (gold for base levels, crimson for Star Blood specialization levels)
  const py = s.underground ? ROOT_SLOT_Y + 12 : GY + 3;
  for (let i = 0; i <= s.tier; i++) rect(c, s.x - s.tier * 1.5 + i * 3 - 1, py, 2, 1, i >= 3 ? PAL.blood2 : PAL.gold3);
}

/** A tiny glowing firefly orbiting a point. */
function firefly(c: Ctx, cx: number, cy: number, r: number, t: number, i: number, col: string = PAL.gold5) {
  const a = t * (1.6 + (i % 3) * 0.4) + i * 2.1;
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a * 1.3) * r * 0.6;
  rect(c, x, y, 1, 1, col);
  if (Math.sin(t * 9 + i) > 0) rect(c, x - Math.cos(a), y, 1, 1, PAL.gold2);
}

function hive(c: Ctx, s: Structure, time: number, flash: boolean) {
  const x = Math.round(s.x), y = GY;
  const tier = s.tier;
  const w0 = flash ? '#fff' : PAL.wood1, w1 = flash ? '#fff' : PAL.wood2;
  // hollow stump on root-legs
  const h = 22 + Math.min(tier, 2) * 3;
  line(c, x - 6, y, x - 4, y - 8, w0, 2);
  line(c, x + 6, y, x + 4, y - 8, w0, 2);
  rect(c, x - 5, y - h, 10, h - 6, w1);
  rect(c, x - 5, y - h, 2, h - 6, w0);
  rect(c, x + 3, y - h, 1, h - 6, PAL.wood3);
  for (let i = 0; i < 3; i++) rect(c, x - 4, y - h + 5 + i * 6, 8, 1, PAL.wood0);
  // hive pod hanging from a branch
  const podY = y - h - 6;
  line(c, x, y - h, x + s.aim * 2, podY - 4, w0, 2);
  const pod = (px: number, py: number, r: number) => {
    ellipse(c, px, py, r, r * 1.25, PAL.gold1);
    ellipse(c, px - 0.5, py - 0.5, r - 1, r * 1.25 - 1, PAL.gold2);
    for (let i = -r + 1; i < r; i += 2) rect(c, px - r + 1, py + i, r * 2 - 1, 1, PAL.gold0);
    const g = 0.5 + 0.5 * Math.sin(time * 4 + s.id);
    rect(c, px - 1, py - 1, 2, 2, g > 0.5 ? PAL.gold5 : PAL.gold4);
  };
  if (s.spec === 'A') {
    pod(x - 3, podY, 4); pod(x + 4, podY + 2, 3); pod(x, podY - 5, 3 + (tier - 3));
  } else if (s.spec === 'B') {
    pod(x, podY, 4);
    // focusing amber lens on top
    disc(c, x, podY - 8, 3 + (tier - 3), PAL.gold3);
    disc(c, x, podY - 8, 2, PAL.gold5);
    line(c, x - 4, podY - 8, x + 4, podY - 8, PAL.wood3);
  } else {
    pod(x, podY, 3 + tier);
  }
  const n = 2 + tier * 2 + (s.spec === 'A' ? 4 : 0);
  for (let i = 0; i < n; i++) firefly(c, x, podY, 6 + (i % 3) * 3, time, i + s.id);
  if (tier >= 1) {
    const bx = x + (s.aim > 0 ? -7 : 6);
    rect(c, bx, y - 18, 2, 7, PAL.banner);
    rect(c, bx, y - 15, 2, 1, PAL.gold3);
  }
}

function beetle(c: Ctx, s: Structure, time: number, flash: boolean) {
  const out = s.x < WORLD.treeX ? -1 : 1;
  const x = Math.round(s.x), y = GY;
  const sz = 7 + Math.min(s.tier, 2) * 1.5 + (s.tier >= 3 ? 2 : 0);
  const shell0 = flash ? '#fff' : '#3a2416';
  const shell1 = flash ? '#fff' : '#6a4426';
  const rim = s.spec === 'A' ? PAL.gold3 : PAL.gold2;
  // legs
  const step = Math.sin(time * 3 + s.id) * 0.8;
  for (let i = -1; i <= 1; i++) {
    line(c, x + i * sz * 0.6, y - 3, x + i * sz * 0.8 + step, y, PAL.bark0);
  }
  // carapace dome
  ellipse(c, x, y - sz * 0.7 - 1, sz + 1, sz * 0.75, shell0);
  ellipse(c, x - out, y - sz * 0.75 - 1, sz, sz * 0.62, shell1);
  // split line + golden rim veins
  line(c, x, y - sz * 1.3, x, y - 3, shell0);
  for (let i = 0; i < 6 + s.tier * 2; i++) {
    const a = Math.PI + (i / (6 + s.tier * 2)) * Math.PI;
    rect(c, x + Math.cos(a) * sz, y - sz * 0.7 - 1 + Math.sin(a) * sz * 0.72, 1, 1, rim);
  }
  // head facing outward, with horn for the ram
  const hx = x + out * (sz + 2);
  ellipse(c, hx, y - 4, 3, 2.5, shell0);
  rect(c, hx + out * 2, y - 5, 1, 1, PAL.gold4);
  if (s.spec === 'B') {
    const ram = s.cd > NESTS.beetle.specs.B.levels[0].rate - 0.25 ? 3 : 0;
    line(c, hx + out * (1 + ram), y - 5, hx + out * (6 + ram), y - 11 - s.tier, PAL.cloak2, 2);
  } else {
    line(c, hx + out, y - 5, hx + out * 3, y - 7, PAL.cloak1);
  }
  if (s.spec === 'A') {
    // spiked plates
    for (let i = -2; i <= 2; i++) rect(c, x + i * 3, y - sz * 1.45 - (i % 2 ? 0 : 1), 1, 2, PAL.cloak2);
  }
  if (s.tier >= 2) {
    const g = Math.sin(time * 3 + s.id) > 0;
    rect(c, x - 1, y - sz * 0.9, 2, 2, g ? PAL.gold4 : PAL.gold2);
  }
}

function dragonflyNest(c: Ctx, s: Structure, time: number, flash: boolean) {
  const x = Math.round(s.x), y = GY;
  const h = 26 + Math.min(s.tier, 2) * 3;
  // twisted wooden pole
  for (let i = 0; i < h; i++) rect(c, x + Math.round(Math.sin(i * 0.35) * 1), y - i, 2, 1, flash ? '#fff' : i % 5 === 0 ? PAL.wood3 : PAL.wood1);
  // twig nest
  const ny = y - h - 3;
  ellipse(c, x, ny, 6 + s.tier * 0.5, 3, PAL.wood1);
  for (let i = -5; i <= 5; i += 2) line(c, x + i, ny + 1, x + i * 1.4, ny - 3, PAL.wood2);
  const g = 0.5 + 0.5 * Math.sin(time * 2.5 + s.id);
  const storm = s.spec === 'B';
  const core = storm ? (g > 0.6 ? '#e8f4ff' : '#9fd0ff') : g > 0.5 ? PAL.gold5 : PAL.gold4;
  disc(c, x, ny - 3, 2 + (s.spec === 'A' ? 2 + (s.tier - 3) : 0), core);
  // dragonflies
  const n = 2 + s.tier;
  for (let i = 0; i < n; i++) {
    const a = time * (1.2 + i * 0.17) + i * 2.4;
    const r = 10 + (i % 3) * 5;
    const fx = x + Math.cos(a) * r;
    const fy = ny - 4 + Math.sin(a * 1.7) * 5;
    const dir = -Math.sin(a) > 0 ? 1 : -1;
    line(c, fx - dir * 3, fy, fx + dir * 1, fy, storm ? '#bfe4ff' : PAL.gold3);
    const wing = Math.sin(time * 30 + i) > 0;
    rect(c, fx - 1, fy - (wing ? 2 : 1), 1, 1, storm ? '#e8f4ff' : PAL.gold5);
    rect(c, fx + 1, fy - (wing ? 1 : 2), 1, 1, storm ? '#e8f4ff' : PAL.gold5);
    rect(c, fx + dir * 2, fy, 1, 1, PAL.white);
  }
}

function spider(c: Ctx, s: Structure, time: number) {
  const x = Math.round(s.x), y = ROOT_SLOT_Y;
  // root hollow with web strands
  ellipse(c, x, y, 9 + s.tier, 6 + s.tier * 0.5, PAL.dirt0);
  const web = s.spec === 'A' ? 6 + s.tier : 4 + s.tier;
  for (let i = 0; i < web; i++) {
    const a = (i / web) * Math.PI * 2;
    line(c, x, y, x + Math.cos(a) * (9 + s.tier), y + Math.sin(a) * (6 + s.tier * 0.5), '#5a5470');
  }
  if (s.spec === 'A') for (let r = 3; r < 9 + s.tier; r += 3) ring(c, x, y, r, '#6e6888');
  // spider: body + glowing abdomen + legs
  const bob = Math.sin(time * 2 + s.id) * 1;
  const poison = s.spec === 'B';
  for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * 0.4;
    const k = Math.sin(time * 4 + i) * 0.5;
    line(c, x, y + bob, x - Math.cos(a) * 6, y + bob - 2 + i + k, PAL.shade0);
    line(c, x, y + bob, x + Math.cos(a) * 6, y + bob - 2 + i - k, PAL.shade0);
  }
  disc(c, x, y + bob - 1, 2, PAL.shade1);
  const g = 0.5 + 0.5 * Math.sin(time * 3 + s.id);
  disc(c, x, y + bob + 3, 3 + Math.min(1, s.tier * 0.4), poison ? PAL.acid0 : PAL.gold1);
  disc(c, x, y + bob + 3, 2, poison ? (g > 0.5 ? PAL.acid2 : PAL.acid1) : g > 0.5 ? PAL.gold4 : PAL.gold3);
  rect(c, x - 1, y + bob - 2, 1, 1, '#ff6a6a');
  rect(c, x + 1, y + bob - 2, 1, 1, '#ff6a6a');
}

// ───────────────────────────── slots ───────────────────────────────

export function drawSlotMarker(c: Ctx, x: number, underground: boolean, time: number, hover: boolean) {
  const y = underground ? ROOT_SLOT_Y : GY + 3;
  const g = 0.5 + 0.5 * Math.sin(time * 3 + x);
  const col = hover ? PAL.gold5 : g > 0.5 ? PAL.gold3 : PAL.gold2;
  // rune diamond
  rect(c, x, y - 3, 1, 1, col);
  rect(c, x - 1, y - 2, 1, 1, col);
  rect(c, x + 1, y - 2, 1, 1, col);
  rect(c, x - 2, y - 1, 1, 1, col);
  rect(c, x + 2, y - 1, 1, 1, col);
  rect(c, x - 1, y, 1, 1, col);
  rect(c, x + 1, y, 1, 1, col);
  rect(c, x, y + 1, 1, 1, col);
  if (hover) {
    rect(c, x, y - 1, 1, 1, PAL.gold5);
    line(c, x, y - 4, x, y - 10, 'rgba(255,230,140,0.5)');
  }
}

// ───────────────────────────── drops & projectiles ─────────────────

export function drawDrop(c: Ctx, d: Drop, time: number) {
  const fade = d.life < 3 ? (Math.sin(time * 20) > 0 ? 1 : 0) : 1;
  if (!fade) return;
  const bob = d.grounded ? Math.round(Math.sin(time * 4 + d.id) * 1) : 0;
  const x = Math.round(d.x), y = Math.round(d.y) - bob;
  if (d.kind === 'amber') {
    // amber resin droplet
    rect(c, x, y - 2, 1, 1, PAL.gold4);
    rect(c, x - 1, y - 1, 3, 2, PAL.gold2);
    rect(c, x - 1, y + 1, 3, 1, PAL.gold1);
    rect(c, x - 1, y - 1, 1, 1, PAL.gold5);
    return;
  }
  // Star Blood: crimson crystal with a star glint
  rect(c, x, y - 3, 1, 1, PAL.blood2);
  rect(c, x - 1, y - 2, 3, 1, PAL.blood2);
  rect(c, x - 2, y - 1, 5, 1, PAL.blood1);
  rect(c, x - 1, y, 3, 1, PAL.blood1);
  rect(c, x, y + 1, 1, 1, PAL.blood0);
  const tw = Math.sin(time * 6 + d.id * 3);
  if (tw > 0.3) {
    rect(c, x + 2, y - 4, 1, 3, PAL.white);
    rect(c, x + 1, y - 3, 3, 1, PAL.white);
  }
}

export function drawProjectile(c: Ctx, p: Projectile) {
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const ux = p.vx / sp, uy = p.vy / sp;
  switch (p.kind) {
    case 'arrow':
      // a darting firefly with a light trail
      line(c, p.x - ux * 5, p.y - uy * 5, p.x, p.y, PAL.gold1);
      line(c, p.x - ux * 2, p.y - uy * 2, p.x, p.y, PAL.gold3);
      rect(c, p.x, p.y, 1, 1, PAL.gold5);
      break;
    case 'spear':
      line(c, p.x - ux * 14, p.y, p.x - ux * 4, p.y, PAL.gold3, 1);
      line(c, p.x - ux * 6, p.y, p.x + ux * 2, p.y, PAL.gold5, 2);
      rect(c, p.x + ux * 3, p.y, 1, 1, PAL.white);
      break;
    case 'acid':
      disc(c, p.x, p.y, 2, PAL.acid1);
      rect(c, p.x - 1, p.y - 1, 1, 1, PAL.acid2);
      break;
    case 'spark':
      rect(c, p.x - 1, p.y - 1, 2, 2, PAL.gold4);
      rect(c, p.x, p.y, 1, 1, PAL.white);
      break;
    case 'meteor':
      line(c, p.x - ux * 18, p.y - uy * 18, p.x, p.y, '#ff7a4a', 2);
      line(c, p.x - ux * 8, p.y - uy * 8, p.x, p.y, PAL.gold4, 2);
      disc(c, p.x, p.y, 2.5, PAL.white);
      break;
    default:
      break;
  }
}
