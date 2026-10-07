import { AFFIXES, ENEMIES, FOG, WORLD } from '../data/balance';
import { ASCEND, NESTS, glowBand } from '../data/nests';
import type { Drop, Enemy, Keeper, Projectile, Structure, Tunnel } from '../sim/types';
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
  if (e.layer === 'under' && !ENEMIES[e.kind].underground) return crawler(c, e, t, flash);
  switch (e.kind) {
    case 'moth': return moth(c, e, t, flash, body, rim);
    case 'tyrant': return tyrant(c, e, t, flash, moving, time);
    case 'devourer': {
      // drawn 1.6× larger: the greatest of the Worms
      c.save(); c.translate(e.x, GY); c.scale(DEVOURER_SCALE, DEVOURER_SCALE); c.translate(-e.x, -GY);
      devourer(c, e, t, flash, moving, time);
      c.restore();
      return;
    }
    case 'bomber': return bomber(c, e, t, flash, body, rim, time);
    case 'hound': return hound(c, e, t, moving, body, rim);
    case 'stalker': return stalker(c, e, t, moving, body, rim);
    case 'spitter': return spitter(c, e, t, moving, body, rim, time);
    case 'worm': return worm(c, e, t, flash);
    case 'larva': return larva(c, e, t, flash);
    case 'mother': return mother(c, e, t, flash, time);
    case 'forager': return forager(c, e, t, moving, body, rim);
    case 'guard': return guard(c, e, t, flash);
    case 'executioner': return executioner(c, e, t, flash, time, rim);
    case 'reaper': return reaper(c, e, t, moving, body, rim);
    case 'jumper': return jumper(c, e, t, body, rim);
    case 'tunneler': return worm(c, e, t, flash);
    case 'tunnelerUp': return digger(c, e, t, moving, rim, flash);
  }
}

/** A ground creature crawling through a Лаз: a hunched shadow in the tunnel. */
function crawler(c: Ctx, e: Enemy, t: number, flash: boolean) {
  const d = e.dir;
  const r = Math.max(4, Math.min(9, ENEMIES[e.kind].radius));
  const sway = Math.sin(t * 9) * 1;
  ellipse(c, e.x, e.y + sway, r + 2, r * 0.6, flash ? '#fff' : '#0c0a14');
  ellipse(c, e.x - d, e.y - 1 + sway, r, r * 0.4, flash ? '#fff' : '#1d1830');
  for (let i = 0; i < 3; i++) rect(c, e.x - d * (r + 3 + i * 3), e.y + 2 + ((i + Math.floor(t * 8)) % 2), 1, 1, '#4a3a2a');
}

/**
 * Отродье Тирана: «шипастое тело стало неприступной крепостью» — a huge segmented worm
 * walking on spiked legs, its back covered by a carapace of spiked plates. Plates fall off
 * as the carapace is cracked, leaving raw flesh.
 */
function tyrant(c: Ctx, e: Enemy, t: number, flash: boolean, moving: boolean, time: number) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const walk = moving ? t * 5 : 0;
  const segs = 7;
  const plated = e.maxPlates > 0 ? Math.ceil((segs * e.plates) / e.maxPlates) : 0;
  for (let i = segs - 1; i >= 0; i--) {
    const sx = x - d * (i * 7 - 18);
    const lift = Math.max(0, 3 - i) * 4;
    const sy = y - 14 - lift + Math.sin(walk + i * 0.8) * 1.5;
    // legs
    const sw = Math.sin(walk + i * 1.4) * 3;
    line(c, sx - 3, sy + 4, sx - 4 + sw, y, '#14101c', 2);
    line(c, sx + 3, sy + 4, sx + 4 - sw, y, '#14101c', 2);
    // body
    ellipse(c, sx, sy, 7, 7, flash ? '#fff' : '#2a1626');
    ellipse(c, sx, sy + 1, 6, 5, flash ? '#fff' : '#4a2236');
    const hasPlate = segs - 1 - i < plated;
    if (hasPlate) {
      // spiked carapace plate
      ellipse(c, sx, sy - 3, 7, 4, flash ? '#fff' : '#3c3c4e');
      rect(c, sx - 6, sy - 4, 12, 1, '#7a7a96');
      rect(c, sx - 1, sy - 9, 2, 3, '#a8a8c4');
      rect(c, sx - 5, sy - 7, 1, 2, '#8a8aa6');
      rect(c, sx + 4, sy - 7, 1, 2, '#8a8aa6');
    } else {
      // exposed flesh, pulsing
      const p = Math.sin(time * 6 + i) > 0;
      ellipse(c, sx, sy - 3, 5, 3, p ? '#c23a5a' : '#8a2240');
      rect(c, sx - 2, sy - 5, 1, 1, '#ff8aa0');
    }
  }
  // head with mandibles and a ram horn
  const hx = x + d * 22, hy = y - 30 + Math.sin(walk) * 1.5;
  ellipse(c, hx, hy, 8, 7, flash ? '#fff' : '#2a1626');
  ellipse(c, hx + d * 2, hy - 3, 6, 4, plated > 0 ? '#3c3c4e' : '#6a2a40');
  line(c, hx + d * 4, hy - 6, hx + d * 13, hy - 12, '#c8c8dc', 2);
  const bite = e.attacking ? Math.abs(Math.sin(t * 8)) * 4 : 1;
  line(c, hx + d * 6, hy + 3, hx + d * 13, hy + 2 + bite, '#d8d0e8', 2);
  line(c, hx + d * 6, hy + 5, hx + d * 12, hy + 8 - bite, '#d8d0e8', 2);
}

/**
 * Тень Пожирателя: «громаднейший из Червей, однажды проглотивший летающую цитадель
 * Наблюдателя». A towering arch of segments crawling on its belly, spiked carapace on the
 * back, and a round maw ringed with teeth that opens wide when it bites.
 */
const DEVOURER_SCALE = 1.6;
function devourer(c: Ctx, e: Enemy, t: number, flash: boolean, moving: boolean, time: number) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const crawl = moving ? t * 2.2 : 0;
  const segs = 11;
  const plated = e.maxPlates > 0 ? Math.ceil((segs * e.plates) / e.maxPlates) : 0;
  // body: from the tail (behind, low) rising to the head (ahead, high)
  for (let i = segs - 1; i >= 0; i--) {
    const k = i / (segs - 1);
    const sx = x - d * (i * 7 - 26);
    const sy = y - 10 - Math.max(0, 1 - k * 1.6) * 44 + Math.sin(crawl + i * 0.6) * 2;
    const r = 13 - k * 4;
    disc(c, sx, sy, r, flash ? '#fff' : '#1c0f1c');
    disc(c, sx, sy + 2, r - 2, flash ? '#fff' : '#3a1a30');
    rect(c, sx - 2, sy + r - 3, 4, 2, '#5a2a40');
    if (segs - 1 - i < plated) {
      ellipse(c, sx, sy - r * 0.45, r, r * 0.5, flash ? '#fff' : '#34344a');
      rect(c, sx - r + 1, sy - r * 0.45, r * 2 - 2, 1, '#7a7a96');
      line(c, sx, sy - r * 0.8, sx - d * 2, sy - r - 7, '#b8b8d4', 2);
      rect(c, sx - r + 2, sy - r * 0.7, 1, 3, '#8a8aa6');
      rect(c, sx + r - 3, sy - r * 0.7, 1, 3, '#8a8aa6');
    } else {
      const p = Math.sin(time * 5 + i) > 0;
      ellipse(c, sx, sy - r * 0.4, r * 0.75, r * 0.4, p ? '#c23a5a' : '#8a2240');
    }
  }
  // the maw
  const hx = x + d * 30, hy = y - 56 + Math.sin(crawl) * 2;
  const open = e.attacking ? 7 + Math.abs(Math.sin(t * 4)) * 6 : 6;
  disc(c, hx, hy, 17, flash ? '#fff' : '#1c0f1c');
  disc(c, hx + d * 4, hy, open + 3, '#5a1020');
  disc(c, hx + d * 5, hy, open, '#12040a');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tx = hx + d * 5 + Math.cos(a) * (open + 2), ty = hy + Math.sin(a) * (open + 2);
    line(c, tx, ty, hx + d * 5 + Math.cos(a) * (open - 2), hy + Math.sin(a) * (open - 2), '#e8e0d0');
  }
}

/** Тенекрыл: a moth-like shadow flyer with ragged, beating wings. */
function moth(c: Ctx, e: Enemy, t: number, flash: boolean, body: string, rim: string) {
  const d = e.dir;
  const x = Math.round(e.x), y = Math.round(e.y) - 6;
  const flap = Math.sin(t * 16);
  const wy = Math.round(flap * 6);
  const wing = flash ? '#fff' : '#1a1630';
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    line(c, x - d * 1, y - 1, x - d * (2 + k * 6), y - 2 - wy * (0.4 + k * 0.6) - k * 3, wing, 2);
    line(c, x + d * 1, y - 1, x + d * (1 + k * 4), y - 2 - wy * (0.4 + k * 0.6) - k * 2, wing, 1);
  }
  line(c, x - d * 7, y - 2 - wy - 3, x - d * 2, y - 1, rim);
  ellipse(c, x, y, 4, 2, flash ? '#fff' : body);
  rect(c, x - d * 5, y, 2, 1, flash ? '#fff' : body);
  line(c, x + d * 4, y - 1, x + d * 7, y - 5, rim);
}

/** Имаго-Кислотник: a heavy winged worm with a glowing acid sac. */
function bomber(c: Ctx, e: Enemy, t: number, flash: boolean, body: string, rim: string, time: number) {
  const d = e.dir;
  const x = Math.round(e.x), y = Math.round(e.y) - 8;
  const flap = Math.sin(t * 11);
  const wy = Math.round(flap * 5);
  const wing = flash ? '#fff' : 'rgba(150,140,200,0.55)';
  for (const s of [-1, 1]) {
    line(c, x + s * 3, y - 4, x + s * 13, y - 8 - wy, wing, 2);
    line(c, x + s * 13, y - 8 - wy, x + s * 6, y - 3, wing, 1);
  }
  for (let i = 3; i >= 0; i--) disc(c, x - d * i * 4, y + Math.sin(t * 3 + i) * 1, 4 - i * 0.5, flash ? '#fff' : body);
  rect(c, x - 5, y - 4, 10, 1, rim);
  const glow = Math.sin(time * 6 + e.id) > 0 ? PAL.acid2 : PAL.acid1;
  disc(c, x - d * 4, y + 5, 3, flash ? '#fff' : PAL.acid0);
  disc(c, x - d * 4, y + 5, 2, glow);
  if (e.attacking && Math.sin(time * 8) > 0.5) rect(c, x - d * 4, y + 9, 1, 2, PAL.acid2);
}

/** «Туман Тьмы»: a dithered shroud of darkness around a big worm. */
export function drawFog(c: Ctx, e: Enemy, time: number, night: number, level = 1) {
  const r = ENEMIES[e.kind].fog;
  if (!r || e.dead || night < FOG.fromNight) return;
  // a thinned shroud (Светоносное Древо, «Рассеять Туман») is drawn fainter
  c.globalAlpha = 0.2 + 0.8 * level;
  const cy = e.layer === 'ground' && !ENEMIES[e.kind].underground ? GY - ENEMIES[e.kind].height * 0.5 : e.y;
  const ry = r * 0.45;
  const x0 = Math.round(e.x), y0 = Math.round(cy);
  const ph = Math.floor(time * 6);
  for (let y = -ry; y <= ry; y += 2) {
    for (let x = -r; x <= r; x += 2) {
      const k = (x * x) / (r * r) + (y * y) / (ry * ry);
      if (k > 1) continue;
      const h = ((x0 + x) * 7 + (y0 + y) * 13 + ph * 5) & 15;
      if (h > (1 - k) * 14) continue;
      rect(c, x0 + x, y0 + y, 2, 2, h % 3 === 0 ? 'rgba(80,40,120,0.7)' : 'rgba(8,5,18,0.78)');
    }
  }
  c.globalAlpha = 1;
}

/** Violet edge and drifting wisps of the shroud — drawn above the darkness so it reads at night. */
export function drawFogEdge(c: Ctx, e: Enemy, time: number, night: number, level = 1) {
  const r = ENEMIES[e.kind].fog;
  if (!r || e.dead || night < FOG.fromNight) return;
  c.globalAlpha = 0.2 + 0.8 * level;
  const cy = e.layer === 'ground' && !ENEMIES[e.kind].underground ? GY - ENEMIES[e.kind].height * 0.5 : e.y;
  const ry = r * 0.45;
  const x0 = Math.round(e.x), y0 = Math.round(cy);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + time * 0.6;
    if (Math.sin(time * 3 + i * 1.7) < -0.2) continue;
    rect(c, x0 + Math.cos(a) * r, y0 + Math.sin(a) * ry, 1, 1, '#9a6ad8');
  }
  for (let i = 0; i < 5; i++) {
    const t = (time * 0.4 + i / 5) % 1;
    rect(c, x0 + Math.sin(i * 2.3 + time) * r * 0.7, y0 - ry * 0.3 - t * 18, 2, 1, `rgba(150,100,220,${(1 - t) * 0.6})`);
  }
  c.globalAlpha = 1;
}

/** A tunnel under the ground (dark burrow at the worm lane). */
export function drawTunnel(c: Ctx, tn: Tunnel, time: number) {
  if (Number.isNaN(tn.entryX)) return;
  const a = Math.min(tn.entryX, tn.headX), b = Math.max(tn.entryX, tn.headX);
  const y = WORLD.wormLaneY - 14;
  for (let x = Math.round(a); x <= b; x += 2) {
    const wob = Math.sin(x * 0.21 + tn.id) * 1.5;
    rect(c, x, y - 4 + wob, 2, 8, '#06050b');
    if ((x + tn.id) % 7 === 0) rect(c, x, y - 5 + wob, 1, 1, '#3a2a20');
    if ((x + tn.id) % 9 === 0) rect(c, x, y + 4 + wob, 1, 1, '#2a1f18');
  }
  // shafts up to the surface
  const shaft = (sx: number) => { for (let yy = WORLD.groundY; yy < y; yy += 2) rect(c, sx - 2 + Math.round(Math.sin(yy * 0.3) * 1), yy, 4, 2, '#06050b'); };
  shaft(tn.entryX);
  if (tn.open) shaft(tn.headX);
  else if (Math.sin(time * 12) > 0) rect(c, tn.headX, y - 6, 1, 1, '#8a6a4a');
}

/** Surface mouths of an open tunnel, with the Keeper's sealing progress. */
export function drawTunnelMouths(c: Ctx, tn: Tunnel, time: number) {
  for (const [x, exit] of [[tn.entryX, false], [tn.headX, true]] as const) {
    ellipse(c, x, GY - 1, 9, 3, '#3a2a1c');
    ellipse(c, x, GY - 1, 6, 2, '#05040a');
    rect(c, x - 10, GY - 3, 2, 2, '#4a3624');
    rect(c, x + 8, GY - 3, 2, 2, '#4a3624');
    if (exit) {
      // red warning glint above the exit
      if (Math.sin(time * 5 + tn.id) > 0) rect(c, x, GY - 14, 1, 3, '#ff6a4a');
      rect(c, x, GY - 9, 1, 1, '#ff6a4a');
    }
  }
  if (tn.seal > 0) {
    const x = tn.headX;
    const w = 20;
    rect(c, x - w / 2, GY - 20, w, 3, '#1a0b14');
    rect(c, x - w / 2, GY - 20, Math.max(1, w * Math.min(1, tn.seal)), 2, PAL.gold3);
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

/** Имаго-Землерой on the surface: earthy, hunched, with big digging claws. */
function digger(c: Ctx, e: Enemy, t: number, moving: boolean, rim: string, flash: boolean) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const ph = moving ? t * 10 : 0;
  for (let i = 0; i < 3; i++) line(c, x - 4 + i * 4, y - 4, x - 4 + i * 4 + Math.sin(ph + i) * 2, y, '#2a1a10');
  ellipse(c, x, y - 7, 8, 5, flash ? '#fff' : '#4a3020');
  ellipse(c, x - d, y - 9, 6, 3, flash ? '#fff' : '#6a4a30');
  rect(c, x - 6, y - 12, 12, 1, rim);
  // shovel claws
  const dig = e.attacking ? Math.sin(t * 12) * 2 : 0;
  line(c, x + 7 * d, y - 6, x + 11 * d, y - 2 + dig, '#c9a070', 2);
  line(c, x + 6 * d, y - 9, x + 11 * d, y - 8 - dig, '#c9a070', 2);
  // soil crumbs
  if (Math.sin(t * 5) > 0.6) rect(c, x - 5 * d, y - 2, 1, 1, '#6a4a30');
}

/** Имаго-Прыгун: «разведчики, лёгкая крылатая кавалерия» — a leaping winged bug. */
function jumper(c: Ctx, e: Enemy, t: number, body: string, rim: string) {
  const d = e.dir;
  const air = e.jumping > 0 ? Math.sin((1 - e.jumping / 0.55) * Math.PI) * 26 : 0;
  const x = Math.round(e.x), y = GY - Math.round(air);
  line(c, x - 3 * d, y - 4, x - 6 * d, y, PAL.shade0);
  line(c, x + 2 * d, y - 4, x + 5 * d, y, PAL.shade0);
  ellipse(c, x, y - 7, 6, 3, body);
  rect(c, x - 5, y - 10, 10, 1, rim);
  ellipse(c, x + 6 * d, y - 8, 2, 2, body);
  // wings flutter while airborne
  const w = air > 0 ? (Math.sin(t * 40) > 0 ? 6 : 3) : 2;
  line(c, x - d, y - 9, x - 4 * d, y - 9 - w, '#8a7aa8');
  line(c, x + d, y - 9, x - 2 * d, y - 10 - w, '#a89ac8');
}

/** Имаго-Жнец: «напоминающие богомолов» — armoured mantis with scythe arms. */
function reaper(c: Ctx, e: Enemy, t: number, moving: boolean, body: string, rim: string) {
  const d = e.dir;
  const x = Math.round(e.x), y = GY;
  const ph = moving ? t * 8 : 0;
  for (let i = 0; i < 4; i++) {
    const lx = x + (i - 1.5) * 4;
    const sw = Math.sin(ph + i * 1.7) * 3;
    line(c, lx, y - 10, lx + sw, y, PAL.shade0);
  }
  ellipse(c, x - 3 * d, y - 12, 8, 4, body);
  rect(c, x - 9, y - 16, 14, 1, rim);
  // upright thorax and small head
  line(c, x + 2 * d, y - 14, x + 6 * d, y - 26, body, 3);
  ellipse(c, x + 7 * d, y - 28, 3, 2, body);
  // scythes
  const sw = e.attacking ? Math.sin(t * 7) * 6 : 0;
  line(c, x + 6 * d, y - 22, x + 12 * d, y - 30 + sw, '#16121f', 2);
  line(c, x + 12 * d, y - 30 + sw, x + 16 * d, y - 20 + sw, '#d0c8e0');
  line(c, x + 5 * d, y - 20, x + 10 * d, y - 26 - sw, '#16121f', 2);
  line(c, x + 10 * d, y - 26 - sw, x + 14 * d, y - 17 - sw, '#d0c8e0');
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
  if (e.layer === 'under' && !ENEMIES[e.kind].underground) {
    rect(c, e.x + e.dir * 3, e.y - 2, 1, 1, '#ffb070');
    rect(c, e.x + e.dir * 5, e.y - 2, 1, 1, '#ffb070');
    return;
  }
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
    case 'reaper':
      eye(x + 8 * d, y - 29, '#ff8a4a'); eye(x + 9 * d, y - 28, '#ff8a4a');
      break;
    case 'jumper': {
      const air = e.jumping > 0 ? Math.sin((1 - e.jumping / 0.55) * Math.PI) * 26 : 0;
      eye(x + 7 * d, y - 9 - Math.round(air), '#d8ffb0');
      break;
    }
    case 'tunneler':
      eye(e.x + 5 * d, e.y - 3, '#ffd070');
      break;
    case 'tunnelerUp':
      eye(x + 9 * d, y - 7, '#ffd070');
      break;
    case 'moth':
      eye(e.x + 3 * d, e.y - 7, '#c8a0ff'); eye(e.x + 4 * d, e.y - 7, '#c8a0ff');
      break;
    case 'tyrant':
      for (let i = 0; i < 3; i++) eye(x + (24 + i) * d, y - 32 + (i % 2), '#ff3a3a');
      break;
    case 'devourer': {
      const S = DEVOURER_SCALE, hy = GY - 56 * S;
      for (let i = 0; i < 4; i++) {
        eye(x + (20 + i * 2) * S * d, hy - 12 * S + (i % 2), '#ff2a2a'); eye(x + (21 + i * 2) * S * d, hy - 12 * S + 1, '#ff2a2a');
        eye(x + (20 + i * 2) * S * d, hy + 12 * S - (i % 2), '#ff2a2a');
      }
      break;
    }
    case 'bomber':
      eye(e.x + 3 * d, e.y - 10, '#d8ffb0'); eye(e.x + 4 * d, e.y - 9, '#d8ffb0');
      break;
    default:
      break;
  }
}

/** Silk strands on creatures caught by a weaver. */
export function drawWeb(c: Ctx, e: Enemy) {
  if (e.web <= 0 || e.layer !== 'ground') return;
  const h = ENEMIES[e.kind].height;
  for (let i = -1; i <= 1; i++) line(c, e.x - 5, GY - 2 - (i + 1) * h * 0.25, e.x + 5, GY - 4 - (i + 1) * h * 0.2, 'rgba(230,226,255,0.55)');
  line(c, e.x, GY, e.x, GY - h * 0.7, 'rgba(230,226,255,0.4)');
}

/** Elite aura and glyph so modifiers are readable. */
export function drawAffix(c: Ctx, e: Enemy, time: number) {
  if (!e.affix) return;
  const a = AFFIXES[e.affix];
  const def = ENEMIES[e.kind];
  const h = e.layer === 'under' ? 10 : def.height;
  const y0 = e.layer === 'ground' && !def.underground ? GY : e.y;
  for (let i = 0; i < 10; i++) {
    const ang = time * 3 + (i / 10) * Math.PI * 2;
    rect(c, e.x + Math.cos(ang) * (def.radius + 3), y0 - h * 0.5 + Math.sin(ang) * (h * 0.6 + 2), 1, 1, a.color);
  }
  c.fillStyle = a.color;
  c.font = '8px monospace';
  c.textAlign = 'center';
  c.fillText(a.glyph, e.x, y0 - h - 10);
}

export function drawEnemyHp(c: Ctx, e: Enemy) {
  const cracked = e.maxPlates > 0 && e.plates < e.maxPlates;
  if ((e.hp >= e.maxHp && !cracked) || !e.lit) return;
  const def = ENEMIES[e.kind];
  const w = def.boss ? 60 : e.kind === 'tyrant' ? 40 : Math.max(8, Math.min(30, def.radius * 2));
  const y = e.layer !== 'ground' || def.underground ? e.y - (def.air ? def.height + 8 : 12) : e.kind === 'mother' ? GY - 66 : e.kind === 'executioner' ? GY - 62 : e.kind === 'tyrant' ? GY - 50 : e.kind === 'devourer' ? GY - 122 : GY - def.height - 6;
  rect(c, e.x - w / 2, y, w, 2, '#1a0b14');
  rect(c, e.x - w / 2, y, Math.max(1, (w * e.hp) / e.maxHp), 1, def.worm ? '#ff9a3c' : '#c58cff');
  // the Tyrant's carapace: a steel bar above the health
  if (e.maxPlates > 0 && e.plates > 0) {
    rect(c, e.x - w / 2, y - 3, w, 2, '#1a0b14');
    rect(c, e.x - w / 2, y - 3, Math.max(1, (w * e.plates) / e.maxPlates), 1, '#b8c4d8');
  }
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
  // radiance of higher ranks
  for (let i = 0; i < k.rank * 2; i++) {
    const a = time * 2 + (i / Math.max(1, k.rank * 2)) * Math.PI * 2;
    rect(c, x + Math.cos(a) * (9 + k.rank), top + 8 + Math.sin(a) * 6, 1, 1, i % 2 ? PAL.gold4 : PAL.gold5);
  }
}

/** Keeper HP bar (drawn above the darkness). */
export function drawKeeperHp(c: Ctx, k: Keeper, maxHp: number) {
  if (!k.alive) return;
  const w = 16;
  const x = Math.round(k.x - w / 2), y = GY - 24;
  rect(c, x - 1, y - 1, w + 2, 4, '#0a0610');
  rect(c, x, y, w, 2, '#3a1420');
  const f = Math.max(0, k.hp / maxHp);
  rect(c, x, y, Math.max(1, Math.round(w * f)), 2, f < 0.3 ? '#ff4a4a' : f < 0.6 ? '#ffb04a' : '#7af07a');
}

// ───────────────────────────── nests ───────────────────────────────

/** Visual tier 0..4 → size step; spec decides the silhouette at tier ≥ 3. */
/**
 * A nest grows with its level, specialization and merge stars: bigger (less in the crown and
 * the roots, where space is tight), a coloured halo (gold level 2, warm amber for branch A,
 * cool blue for branch B) and a crown of sparks at Mastery.
 */
export function nestLook(s: Pick<Structure, 'tier' | 'spec' | 'merge' | 'ascend' | 'crown' | 'underground'>) {
  const merge = Math.min(s.merge, 5), asc = Math.min(s.ascend, 10);
  const scale = s.crown ? Math.min(1.35, 1 + 0.06 * s.tier + 0.04 * merge + 0.01 * asc)
    : s.underground ? Math.min(1.4, 1 + 0.06 * s.tier + 0.05 * merge + 0.01 * asc)
    : Math.min(1.7, 1 + 0.1 * s.tier + 0.06 * merge + 0.012 * asc);
  const color = s.tier >= 2 ? (s.spec === 'B' ? '#8fd0ff' : '#ffb24a') : s.tier >= 1 ? '#ffd27a' : '';
  return { scale, color, mastery: s.tier >= 3 };
}

/** Halo behind a nest and the Mastery spark crown above it. */
function nestHalo(c: Ctx, cx: number, cy: number, r: number, color: string, time: number, behind: boolean) {
  if (!color) return;
  if (behind) {
    // a calm glowing pedestal ring at the nest's foot and two slowly rising motes
    // (playtest: the old scattered dots read as a strange flicker around attacking nests)
    const ry = Math.max(2, r * 0.22);
    c.globalAlpha = 0.55 + 0.15 * Math.sin(time * 1.5);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      rect(c, cx + Math.cos(a) * r, cy + Math.sin(a) * ry, 1, 1, color);
    }
    c.globalAlpha = 1;
    for (let m = 0; m < 2; m++) {
      const t = (time * 0.35 + m * 0.5) % 1;
      c.globalAlpha = 1 - t;
      rect(c, cx + (m ? r * 0.5 : -r * 0.5), cy - t * r * 1.6, 1, 1, color);
    }
    c.globalAlpha = 1;
  } else {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.42;
      const h = 3 + (i % 2) * 2 + Math.round(Math.sin(time * 6 + i) * 1);
      rect(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r - h, 1, h, color);
      rect(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r - h - 1, 1, 1, PAL.white);
    }
  }
}

export function drawStructure(c: Ctx, s: Structure, time: number) {
  const flash = s.hitFlash > 0;
  const build = Math.min(1, s.age / 0.35);
  const look = nestLook(s);
  const ax = s.x, ay = s.underground ? s.y : GY;
  const baseTop = s.underground ? 16 : s.family === 'beetle' ? 30 : s.family === 'dragonfly' ? 50 : 58;
  // the halo sits at the nest's foot (ground line / root knot)
  nestHalo(c, ax, s.underground ? s.y + 4 : GY, 8 + 4 * look.scale, look.color, time, true);
  c.save();
  if (build < 1) {
    c.beginPath();
    c.rect(s.x - 30 * look.scale, s.underground ? s.y - 20 : GY - 70 * build * look.scale - 2, 60 * look.scale, 200);
    c.clip();
  }
  // grow around the nest's anchor (its foot on the ground / its root knot)
  c.translate(ax, ay);
  c.scale(look.scale, look.scale);
  c.translate(-ax, -ay);
  switch (s.family) {
    case 'hive': hive(c, s, time, flash); break;
    case 'beetle': beetle(c, s, time, flash); break;
    case 'dragonfly': dragonflyNest(c, s, time, flash); break;
    case 'spider': spider(c, s, time); break;
    case 'caterpillar': cocoon(c, s, time, flash); break;
    case 'termite': mound(c, s, time, flash); break;
  }
  c.restore();
  if (look.mastery) nestHalo(c, ax, s.underground ? s.y - 10 * look.scale : GY - baseTop * look.scale + 4, 6, look.color, time, false);
  if (s.hp < s.maxHp || s.family === 'beetle') {
    const w = 16;
    const y = s.family === 'spider' ? s.y - 14 * look.scale : GY - (s.family === 'beetle' ? 24 + s.tier * 2 : s.family === 'dragonfly' ? 44 : 52) * look.scale;
    rect(c, s.x - w / 2, y, w, 2, '#10070c');
    rect(c, s.x - w / 2, y, Math.max(1, (w * s.hp) / s.maxHp), 1, s.hp / s.maxHp < 0.35 ? '#ff5a4a' : '#ffd25a');
  }
  // merge stars and ascension glow (colour bands)
  if (s.merge > 0 || s.ascend > 0) {
    const col = glowBand(s.merge + Math.floor(s.ascend / ASCEND.band));
    const top = s.underground ? s.y - 16 * look.scale : GY - baseTop * look.scale - (look.mastery ? 7 : 0);
    for (let i = 0; i < s.merge; i++) {
      const sx = s.x - (s.merge - 1) * 3 + i * 6;
      rect(c, sx, top - 2, 1, 5, col); rect(c, sx - 2, top, 5, 1, col); rect(c, sx, top, 1, 1, PAL.white);
    }
    if (s.ascend > 0) {
      for (let a = 0; a < 10; a++) {
        const ang = time * 1.5 + (a / 10) * Math.PI * 2;
        rect(c, s.x + Math.cos(ang) * 12, (s.underground ? s.y : GY - 14) + Math.sin(ang) * 8, 1, 1, col);
      }
    }
  }
  // (the level is shown in the nest menu; stars above a nest mean Слияние only)
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
    pod(x - 3, podY, 4); pod(x + 4, podY + 2, 3); pod(x, podY - 5, 3 + (tier - 2));
  } else if (s.spec === 'B') {
    pod(x, podY, 4);
    // focusing amber lens on top
    disc(c, x, podY - 8, 3 + (tier - 2), PAL.gold3);
    disc(c, x, podY - 8, 2, PAL.gold5);
    line(c, x - 4, podY - 8, x + 4, podY - 8, PAL.wood3);
  } else {
    pod(x, podY, 3 + tier);
  }
  const n = 2 + tier * 2 + (s.spec === 'A' ? 4 : 0);
  for (let i = 0; i < n; i++) firefly(c, x, podY, 6 + (i % 3) * 3, time, i + s.id);
  // muzzle flash right after a volley
  const fired = s.cd > 0 && s.age > 0.5 && (s.spec === 'B' ? s.cd > 2.2 : s.cd > 0.55);
  if (fired) { disc(c, x, podY, 6, 'rgba(255,240,180,0.55)'); rect(c, x - 1, podY - 1, 3, 3, PAL.white); }
  if (tier >= 1) {
    const bx = x + (s.aim > 0 ? -7 : 6);
    rect(c, bx, y - 18, 2, 7, PAL.banner);
    rect(c, bx, y - 15, 2, 1, PAL.gold3);
  }
}

function beetle(c: Ctx, s: Structure, time: number, flash: boolean) {
  const out = s.x < WORLD.treeX ? -1 : 1;
  const x = Math.round(s.x), y = GY;
  const sz = 7 + Math.min(s.tier, 1) * 2 + (s.tier >= 2 ? 3 : 0);
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
  disc(c, x, ny - 3, 2 + (s.spec === 'A' ? 2 + (s.tier - 2) : 0), core);
  // the little dragonflies themselves are drawn by the renderer (they fly out on sorties)
}

/** Where a nest's dragonfly i circles when at home. */
export function dragonflyHome(s: Structure, i: number, time: number): [number, number] {
  const ny = GY - (26 + Math.min(s.tier, 2) * 3) - 3;
  const a = time * (0.6 + i * 0.09) + i * 2.4;
  const r = 10 + (i % 3) * 5;
  return [s.x + Math.cos(a) * r, ny - 4 + Math.sin(a * 1.7) * 5];
}

/** One little golden (or storm-blue) dragonfly. */
export function drawDragonfly(c: Ctx, fx: number, fy: number, dir: number, storm: boolean, time: number, i: number) {
  line(c, fx - dir * 3, fy, fx + dir * 1, fy, storm ? '#bfe4ff' : PAL.gold3);
  const wing = Math.sin(time * 30 + i) > 0;
  rect(c, fx - 1, fy - (wing ? 2 : 1), 1, 1, storm ? '#e8f4ff' : PAL.gold5);
  rect(c, fx + 1, fy - (wing ? 1 : 2), 1, 1, storm ? '#e8f4ff' : PAL.gold5);
  rect(c, fx + dir * 2, fy, 1, 1, PAL.white);
}

/** A termite mound of clay and amber. */
function mound(c: Ctx, s: Structure, time: number, flash: boolean) {
  const x = Math.round(s.x), y = GY;
  const h = 14 + s.tier * 3;
  for (let i = 0; i < h; i++) {
    const w = Math.round((1 - i / h) * (8 + s.tier) + 2);
    rect(c, x - w, y - i, w * 2, 1, flash ? '#fff' : i % 4 === 0 ? '#8a5a2a' : '#6a4422');
  }
  for (let i = 0; i < 4 + s.tier; i++) rect(c, x - 5 + ((i * 7) % 11), y - 3 - ((i * 5) % (h - 4)), 2, 1, '#2a1a10');
  const g = 0.5 + 0.5 * Math.sin(time * 3 + s.id);
  rect(c, x - 1, y - h - 1, 3, 2, g > 0.5 ? PAL.gold4 : PAL.gold2);
  if (s.spec === 'B') for (let i = -1; i <= 1; i++) rect(c, x + i * 5, y - h + 4, 2, 3, '#c9b48a');
  if (s.spec === 'A') line(c, x, y - h, x + 4, y - h - 6, '#d8d0c0');
}

/** A Golden Termite warrior: bright gold, big head with white mandibles, six legs. */
export function drawSoldier(c: Ctx, u: import('../sim/types').Soldier) {
  if (u.hp <= 0) return;
  const x = Math.round(u.x), y = GY;
  const d = u.dir;
  const step = Math.round(Math.sin(u.walk * 14));
  const flash = u.hitFlash > 0;
  // legs
  for (let i = -1; i <= 1; i++) rect(c, x + i * 2 + (i === 0 ? step : -step), y - 1, 1, 1, PAL.gold0);
  // abdomen, thorax, head
  rect(c, x - 4 * d - 1, y - 5, 3, 3, flash ? '#fff' : PAL.gold1);
  rect(c, x - 1, y - 5, 3, 3, flash ? '#fff' : PAL.gold3);
  rect(c, x + 2 * d - (d < 0 ? 2 : 0), y - 6, 3, 4, flash ? '#fff' : PAL.gold4);
  rect(c, x - 1, y - 5, 2, 1, PAL.gold5);
  // mandibles
  rect(c, x + 5 * d, y - 6, 1, 1, PAL.white);
  rect(c, x + 5 * d, y - 3, 1, 1, PAL.white);
  if (u.hp < u.maxHp) {
    rect(c, x - 3, y - 9, 7, 1, '#3a1420');
    rect(c, x - 3, y - 9, Math.max(1, Math.round((7 * u.hp) / u.maxHp)), 1, '#9cff8a');
  }
}

/** A silk cocoon hanging from a bent twig. */
function cocoon(c: Ctx, s: Structure, time: number, flash: boolean) {
  const x = Math.round(s.x), y = GY;
  line(c, x - 4, y, x - 2, y - 22, flash ? '#fff' : PAL.wood1, 2);
  line(c, x - 2, y - 22, x + 5, y - 24, PAL.wood1);
  const sway = Math.round(Math.sin(time * 1.5 + s.id) * 1);
  line(c, x + 5, y - 24, x + 5 + sway, y - 20, '#d8d0c0');
  const h = 6 + Math.min(s.tier, 4);
  ellipse(c, x + 5 + sway, y - 20 + h / 2 + 1, 3 + s.tier * 0.4, h / 2 + 1, s.spec === 'B' ? PAL.gold2 : '#d8d0c0');
  for (let i = 0; i < h; i += 2) rect(c, x + 3 + sway, y - 19 + i, 5, 1, s.spec === 'B' ? PAL.gold1 : '#a89c8c');
  if (s.spec === 'A') for (let i = -6; i <= 6; i += 3) line(c, x + 5 + sway, y - 16, x + 5 + i, y, 'rgba(230,224,210,0.35)');
}

/** A caterpillar collector (green-gold, segmented, inching along). */
export function drawWorker(c: Ctx, w: import('../sim/types').Worker, time: number) {
  const x = Math.round(w.x);
  if (w.descend > 0) {
    // lowering itself from the crown on a silk thread
    const k = Math.min(1, w.descend / 0.9);
    const yy = Math.round(GY - (GY - w.fromY) * k);
    line(c, x, w.fromY + 6, x, yy - 3, 'rgba(230,224,210,0.6)');
    rect(c, x - 1, yy - 4, 2, 4, '#7ac04a');
    rect(c, x - 1, yy - 4, 1, 1, PAL.gold4);
    return;
  }
  const y = GY;
  const inch = Math.abs(Math.sin(w.walk * 8));
  for (let i = 0; i < 5; i++) {
    const sx = x - i * 2 * w.dir;
    const hump = i === 1 || i === 2 || i === 3 ? Math.round(inch * (i === 2 ? 3 : 2)) : 0;
    rect(c, sx, y - 3 - hump, 2, 2, i === 0 ? '#b8f070' : i % 2 ? '#6ac040' : '#8ad850');
    if (i % 2 === 1) rect(c, sx, y - 2 - hump, 1, 1, '#ff9a3c');
  }
  // head with antennae
  rect(c, x + w.dir * 2, y - 3, 1, 1, '#1a1a10');
  rect(c, x + w.dir * 1, y - 5, 1, 1, '#b8f070');
  rect(c, x + w.dir * 2, y - 6, 1, 1, PAL.gold5);
  if (w.carry.n > 0) {
    for (let i = 0; i < Math.min(4, w.carry.n); i++) rect(c, x - w.dir * (2 + i * 2), y - 7 - Math.round(inch) - (i % 2), 2, 2, w.carry.star > 0 && i === 0 ? PAL.blood2 : PAL.gold3);
    if (Math.sin(time * 9) > 0.6) rect(c, x - w.dir * 2 + 1, y - 8, 1, 1, PAL.white);
  }
}

function spider(c: Ctx, s: Structure, time: number) {
  const x = Math.round(s.x), y = s.y;
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

export function drawSlotMarker(c: Ctx, x: number, underground: boolean, time: number, hover: boolean, slotY = ROOT_SLOT_Y) {
  const g = 0.5 + 0.5 * Math.sin(time * 3 + x);
  if (underground) {
    // a root knot: dark hollow in the roots with a pulsing golden ring and a «+»
    const y = slotY;
    ellipse(c, x, y, 9, 6, '#07050c');
    ellipse(c, x, y, 7, 4, '#140d1c');
    const rr = 8 + g * 1.5 + (hover ? 2 : 0);
    for (let a = 0; a < 24; a++) {
      if (a % 2 && !hover) continue;
      const ang = (a / 24) * Math.PI * 2 + time * 0.6;
      rect(c, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.65, 1, 1, hover ? PAL.gold5 : g > 0.5 ? PAL.gold3 : PAL.gold2);
    }
    const col = hover ? PAL.gold5 : PAL.gold4;
    rect(c, x - 2, y, 5, 1, col);
    rect(c, x, y - 2, 1, 5, col);
    // little root tendrils reaching into the knot
    line(c, x - 12, y - 4, x - 8, y - 1, PAL.gold1);
    line(c, x + 12, y - 3, x + 8, y - 1, PAL.gold1);
    if (hover) line(c, x, y - 12, x, y - 20, 'rgba(255,230,140,0.6)');
    return;
  }
  const y = GY + 3;
  const col = hover ? PAL.gold5 : g > 0.5 ? PAL.gold4 : PAL.gold3;
  // a beam of light rising from the rune makes free build spots obvious
  for (let i = 0; i < 12; i++) if ((i + Math.floor(time * 6)) % 3 === 0) rect(c, x, y - 5 - i, 1, 1, `rgba(255,220,130,${0.45 - i * 0.03})`);
  // rune diamond
  rect(c, x, y - 3, 1, 1, col);
  rect(c, x - 1, y - 2, 1, 1, col);
  rect(c, x + 1, y - 2, 1, 1, col);
  rect(c, x - 2, y - 1, 1, 1, col);
  rect(c, x + 2, y - 1, 1, 1, col);
  rect(c, x - 1, y, 1, 1, col);
  rect(c, x + 1, y, 1, 1, col);
  rect(c, x, y + 1, 1, 1, col);
  rect(c, x, y - 1, 1, 1, g > 0.7 || hover ? PAL.gold5 : PAL.gold1);
  if (hover) line(c, x, y - 4, x, y - 10, 'rgba(255,230,140,0.5)');
}

// ───────────────────────────── drops & projectiles ─────────────────

export function drawDrop(c: Ctx, d: Drop, time: number) {
  const x = Math.round(d.x), y = Math.round(d.y);
  const star = d.kind === 'star';
  const sky = d.mode === 3;
  // hovering loot glows and casts a thin beam to the ground so it never blends in
  if (d.mode === 1 && d.y < GY - 6) {
    for (let yy = y + 3; yy < GY; yy += 2) rect(c, x, yy, 1, 1, star ? 'rgba(255,90,106,0.45)' : 'rgba(255,200,80,0.45)');
  }
  if (!sky || Math.sin(time * 30) > 0) {
    const g = 0.5 + 0.5 * Math.sin(time * 5 + d.id);
    const halo = star ? (g > 0.5 ? '#ff7a8a' : '#c21f3a') : g > 0.5 ? PAL.gold4 : PAL.gold2;
    rect(c, x - 3, y, 1, 1, halo); rect(c, x + 3, y, 1, 1, halo); rect(c, x, y - 4, 1, 1, halo); rect(c, x, y + 3, 1, 1, halo);
  }
  // dark outline then the gem
  rect(c, x - 2, y - 2, 5, 4, '#1a0a06');
  if (!star) {
    rect(c, x - 1, y - 2, 3, 1, PAL.gold4);
    rect(c, x - 1, y - 1, 3, 2, PAL.gold2);
    rect(c, x - 1, y - 1, 1, 1, PAL.gold5);
    rect(c, x, y + 1, 1, 1, PAL.gold1);
  } else {
    rect(c, x, y - 3, 1, 1, PAL.blood2);
    rect(c, x - 1, y - 2, 3, 1, PAL.blood2);
    rect(c, x - 2, y - 1, 5, 1, PAL.blood1);
    rect(c, x - 1, y, 3, 1, PAL.blood1);
    rect(c, x, y + 1, 1, 1, PAL.blood0);
    if (Math.sin(time * 6 + d.id * 3) > 0.3) { rect(c, x + 2, y - 4, 1, 3, PAL.white); rect(c, x + 1, y - 3, 3, 1, PAL.white); }
  }
}

export function drawProjectile(c: Ctx, p: Projectile, tint?: string) {
  const sp = Math.hypot(p.vx, p.vy) || 1;
  const ux = p.vx / sp, uy = p.vy / sp;
  switch (p.kind) {
    case 'arrow':
      // a darting firefly with a bright light trail
      line(c, p.x - ux * 9, p.y - uy * 9, p.x, p.y, PAL.gold1, 2);
      line(c, p.x - ux * 4, p.y - uy * 4, p.x, p.y, PAL.gold4, 2);
      rect(c, p.x - 1, p.y - 1, 3, 3, PAL.gold5);
      rect(c, p.x, p.y, 1, 1, PAL.white);
      break;
    case 'spear':
      line(c, p.x - ux * 14, p.y, p.x - ux * 4, p.y, tint ?? PAL.gold3, 1);
      line(c, p.x - ux * 6, p.y, p.x + ux * 2, p.y, tint ?? PAL.gold5, 2);
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
    case 'meteor': {
      if (p.shard) {
        // a small burning shard of the burst star
        line(c, p.x - ux * 5, p.y - uy * 5, p.x, p.y, '#ff9a4a', 1);
        disc(c, p.x, p.y, 1.2, PAL.gold5);
        break;
      }
      if (p.giant) {
        // Сверхзвезда: a huge blazing star with a long fiery tail
        for (let i = 6; i >= 1; i--) disc(c, p.x - ux * i * 9, p.y - uy * i * 9, 9 - i, i % 2 ? '#ff6a3a' : '#ffb24a');
        disc(c, p.x, p.y, 11, '#ffb24a');
        disc(c, p.x, p.y, 8, tint ?? PAL.gold4);
        disc(c, p.x, p.y, 5, PAL.white);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + p.age * 6; rect(c, p.x + Math.cos(a) * 14, p.y + Math.sin(a) * 14, 2, 2, PAL.gold5); }
        break;
      }
      const big = (p.radius ?? 34) > 50 ? 2.2 : 1;
      line(c, p.x - ux * 18 * big, p.y - uy * 18 * big, p.x, p.y, '#ff7a4a', Math.round(2 * big));
      line(c, p.x - ux * 8 * big, p.y - uy * 8 * big, p.x, p.y, tint ?? PAL.gold4, Math.round(2 * big));
      disc(c, p.x, p.y, 2.5 * big, PAL.white);
      break;
    }
    case 'wave': {
      // a rolling crest of earth and light
      for (let i = 0; i < 6; i++) {
        const h = 10 - i * 1.5;
        rect(c, p.x - Math.sign(p.vx) * i * 3, GY - h, 2, h, i < 2 ? PAL.gold4 : '#5a4a46');
      }
      rect(c, p.x, GY + 2, 2, 10, PAL.gold2);
      break;
    }
    default:
      break;
  }
}

/** Utility nests living in the crown: small glowing pods hanging from branches. */
export function drawCrownNest(c: Ctx, s: Structure, time: number) {
  const look = nestLook(s);
  nestHalo(c, s.x, s.y + 2, 8 * look.scale, look.color, time, true);
  c.save();
  c.translate(s.x, s.y);
  c.scale(look.scale, look.scale);
  c.translate(-s.x, -s.y);
  drawCrownNestBody(c, s, time);
  c.restore();
  if (look.mastery) nestHalo(c, s.x, s.y - 6 * look.scale, 5, look.color, time, false);
}

function drawCrownNestBody(c: Ctx, s: Structure, time: number) {
  const x = Math.round(s.x), y = Math.round(s.y);
  const g = 0.5 + 0.5 * Math.sin(time * 3 + s.id);
  line(c, x, y - 8, x, y - 3, PAL.bark2);
  switch (s.family) {
    case 'honeycomb': {
      for (const [dx, dy] of [[0, 0], [-3, 2], [3, 2], [0, 4], [-3, 6], [3, 6]] as const) {
        rect(c, x + dx - 1, y + dy - 1, 3, 2, s.spec === 'B' ? PAL.blood1 : PAL.gold2);
        rect(c, x + dx, y + dy - 1, 1, 1, g > 0.5 ? PAL.gold5 : PAL.gold4);
      }
      break;
    }
    case 'mender': {
      for (let i = 0; i < 3 + s.tier; i++) {
        const a = time * 2 + i * 2.1;
        const bx = x + Math.cos(a) * 5, by = y + 3 + Math.sin(a) * 3;
        rect(c, bx - 1, by - 1, 3, 2, '#5ac85a');
        rect(c, bx, by - 1, 1, 1, '#c8ffb0');
      }
      rect(c, x - 1, y + 1, 3, 3, g > 0.5 ? '#9cff8a' : '#5ac85a');
      break;
    }
    case 'caterpillar': {
      ellipse(c, x, y + 4, 3, 5, s.spec === 'B' ? PAL.gold2 : '#d8d0c0');
      for (let i = 0; i < 8; i += 2) rect(c, x - 2, y + i, 5, 1, '#a89c8c');
      break;
    }
    default: {
      // crown hive: an amber pod with fireflies; flashes on each volley
      if (s.cd > 0 && s.cd > (s.spec === 'B' ? 2.2 : 0.55)) disc(c, x, y + 3, 7, 'rgba(255,240,180,0.5)');
      ellipse(c, x, y + 3, 4, 5, PAL.gold1);
      ellipse(c, x, y + 2, 3, 4, PAL.gold2);
      rect(c, x - 1, y + 1, 2, 2, g > 0.5 ? PAL.gold5 : PAL.gold4);
      for (let i = 0; i < 3 + s.tier * 2; i++) {
        const a = time * (1.6 + (i % 3) * 0.4) + i * 2.1;
        rect(c, x + Math.cos(a) * 8, y + 3 + Math.sin(a * 1.3) * 5, 1, 1, PAL.gold5);
      }
    }
  }

}

/** An empty crown slot: a glowing hollow in the branches. */
export function drawCrownSlot(c: Ctx, x: number, y: number, time: number, hover: boolean) {
  // a dark hollow in the foliage so the marker reads against golden leaves
  const g = 0.5 + 0.5 * Math.sin(time * 3 + x);
  disc(c, x, y, 6 + (hover ? 1 : 0), '#140a1e');
  disc(c, x, y, 5 + (hover ? 1 : 0), '#2a1640');
  const r = 7 + g + (hover ? 2 : 0);
  for (let a = 0; a < 20; a++) {
    if (a % 2 && !hover) continue;
    const ang = (a / 20) * Math.PI * 2 + time;
    rect(c, x + Math.cos(ang) * r, y + Math.sin(ang) * r, 1, 1, hover ? PAL.white : '#b8f0ff');
  }
  rect(c, x - 3, y, 7, 1, hover ? PAL.white : '#c8f4ff');
  rect(c, x, y - 3, 1, 7, hover ? PAL.white : '#c8f4ff');
}
