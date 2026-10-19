import { ENEMIES, WORLD } from '../data/balance';
import { INWORLD, WORLD_OBJ, type WorldObjectDef } from '../data/worlds';
import type { Game } from './game';
import { registerProvider, spillAmber, type InteractProvider } from './interact';
import type { Enemy } from './types';

/**
 * World objects of the in-world worlds (spec §5, docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md):
 * geodes (hold S to crack → Amber drops; the Hammer cracks them too), thickets (burn away as
 * the Circle reaches them, hiding what is inside until then), neutral grazing herds (wander at
 * the edge, flee the Keeper, drop Amber when hunted, regrow at dawn) and the micro Seed (the
 * grown Tree drops it; the Keeper carries it to the Circle's edge → `won`).
 *
 * Object ids are `${kind}:${index into world.objects}`. Per-object state lives in
 * `GameState.wobj` / `herd` / `seed`, so snapshots carry it.
 */

/** id of the world object at index `i` */
export const objId = (o: WorldObjectDef, i: number) => `${o.kind}:${i}`;

/** Every world object of one kind, with its id. */
export function objectsOf<K extends WorldObjectDef['kind']>(g: Game, kind: K): Array<{ o: Extract<WorldObjectDef, { kind: K }>; id: string; i: number }> {
  const out: Array<{ o: Extract<WorldObjectDef, { kind: K }>; id: string; i: number }> = [];
  g.world.objects.forEach((o, i) => { if (o.kind === kind) out.push({ o: o as Extract<WorldObjectDef, { kind: K }>, id: objId(o, i), i }); });
  return out;
}

/** Thicket span [a, b] in world x. */
const span = (t: { x: number; width: number }) => [t.x - t.width / 2, t.x + t.width / 2] as const;

/** Has the Circle burnt this thicket (its inner edge + `WORLD_OBJ.thicketBite` is inside the light)? */
export function thicketBurnt(g: Game, id: string): boolean { return g.state.wobj.burnt.includes(id); }

/** Is world x hidden inside a thicket that still stands? */
export function inThicket(g: Game, x: number): boolean {
  return objectsOf(g, 'thicket').some(({ o, id }) => {
    const [a, b] = span(o);
    return x >= a && x <= b && !thicketBurnt(g, id);
  });
}

/** Can the Keeper see / reach this geode (not cracked, not hidden by a thicket or the dark)? */
export function geodeVisible(g: Game, o: Extract<WorldObjectDef, { kind: 'geode' }>, id: string): boolean {
  if (g.state.wobj.cracked.includes(id)) return false;
  if (o.reveal !== undefined && g.state.tree.radius < o.reveal) return false;
  return !inThicket(g, o.x);
}

/** Crack a geode: its Amber spills as drops around it. */
export function crackGeode(g: Game, id: string): boolean {
  const s = g.state;
  const hit = objectsOf(g, 'geode').find((x) => x.id === id);
  if (!hit || s.wobj.cracked.includes(id)) return false;
  s.wobj.cracked.push(id);
  spillAmber(g, hit.o.x, hit.o.amber);
  g.emit({ type: 'geodeCracked', x: hit.o.x, amber: hit.o.amber });
  return true;
}

const geodeProvider: InteractProvider = (g) => {
  if (!g.world.features.inWorld) return [];
  return objectsOf(g, 'geode').filter(({ o, id }) => geodeVisible(g, o, id)).map(({ o, id }) => ({
    kind: 'geode', id, x: o.x, label: 'Жеода',
    role: `Держи S — расколоть: внутри ${o.amber} Янтаря`,
    hold: INWORLD.geodeHold, canAct: true, holdAct: () => crackGeode(g, id),
  }));
};

const seedProvider: InteractProvider = (g) => {
  const seed = g.state.seed;
  if (!seed || seed.carried) return [];
  return [{
    kind: 'seed', id: 'seed', x: seed.x, label: 'Семя Игг-Древа',
    role: 'S — взять Семя и вынести за край Круга', hold: 0, canAct: true,
    holdAct: () => takeSeed(g),
  }];
};

registerProvider(geodeProvider);
registerProvider(seedProvider);

// ───────────────────────────── the Seed ─────────────────────────────

/** The Keeper picks the Seed up (S at it). */
export function takeSeed(g: Game): boolean {
  const seed = g.state.seed;
  if (!seed || seed.carried || !g.state.keeper.alive) return false;
  seed.carried = true;
  g.emit({ type: 'seedTaken', x: seed.x });
  return true;
}

/**
 * Micro win rule (spec §5): once night `win.night` is survived and the Tree is at stage
 * ≥ `win.stage`, the Tree drops the Seed by its trunk (by day). Called at dawn and on growth.
 */
export function maybeDropSeed(g: Game) {
  const s = g.state;
  const w = g.world.win;
  if (w.kind !== 'seed' || s.seed || s.phase !== 'day') return;
  if (s.night < w.night || s.tree.stage < w.stage) return;
  s.seed = { x: WORLD.treeX + WORLD_OBJ.seedOffset, carried: false };
  g.emit({ type: 'seedDropped', x: s.seed.x });
}

// ───────────────────────────── herds ─────────────────────────────

/** A new grazer of herd `i` somewhere in its range. */
function spawnGrazer(g: Game, rand: () => number, o: Extract<WorldObjectDef, { kind: 'herd' }>, i: number): Enemy {
  const s = g.state;
  const def = ENEMIES.grazer;
  const x = clampHerd(o, o.x + (rand() * 2 - 1) * o.range * 0.8);
  return {
    id: s.nextId++, kind: 'grazer', neutral: true, herd: i, home: o.x, wanderTo: x, wanderT: 1 + rand() * 3,
    x, y: WORLD.groundY, dir: rand() < 0.5 ? -1 : 1, hp: def.hp, maxHp: def.hp, speedMul: 1, attackCd: 0, stun: 0, sinceStun: 99,
    rooted: 0, slow: 0, poison: 0, poisonTime: 0, marked: 0, burn: 0, vuln: 0, armorBreak: 0, web: 0, affix: null, jumpCd: 0, jumping: 0,
    attacking: false, lit: false, age: rand() * 3, hitFlash: 0, broodCd: 0, kick: 0, layer: 'ground', tunnel: 0, usedTunnel: false,
    fogged: false, plates: 0, maxPlates: 0, dead: false,
  };
}

const clampHerd = (o: { x: number; range: number }, x: number) => Math.max(Math.max(8, o.x - o.range), Math.min(Math.min(WORLD.width - 8, o.x + o.range), x));

/** Fill every herd up to its count (run start and every dawn). */
export function regrowHerds(g: Game, rand: () => number) {
  const s = g.state;
  for (const { o, i } of objectsOf(g, 'herd')) {
    const have = s.herd.filter((e) => e.herd === i && !e.dead).length;
    for (let n = have; n < o.count; n++) s.herd.push(spawnGrazer(g, rand, o, i));
  }
}

/** Grazers wander slowly around their herd's centre and flee from the Keeper. */
function updateHerd(g: Game, rand: () => number, dt: number) {
  const s = g.state;
  const k = s.keeper;
  for (const e of s.herd) {
    if (e.dead) continue;
    const o = g.world.objects[e.herd ?? -1];
    if (!o || o.kind !== 'herd') continue;
    e.age += dt;
    e.hitFlash = Math.max(0, e.hitFlash - dt);
    e.lit = g.isLit(e.x, false);
    if (e.stun > 0) { e.stun -= dt; continue; }
    if (e.kick !== 0) {
      e.x += e.kick * dt;
      e.kick *= Math.pow(0.02, dt);
      if (Math.abs(e.kick) < 2) e.kick = 0;
    }
    const away = e.x - k.x;
    let speed: number = WORLD_OBJ.grazeSpeed;
    let to = e.wanderTo ?? e.x;
    if (k.alive && Math.abs(away) < WORLD_OBJ.fleeDist) {
      // startled: run from the Keeper (cornered at the edge of the range, it stops)
      speed = WORLD_OBJ.fleeSpeed;
      to = e.x + Math.sign(away || e.dir) * 40;
      e.wanderT = 0.5 + rand();
    } else {
      e.wanderT = (e.wanderT ?? 0) - dt;
      if (e.wanderT <= 0) {
        e.wanderTo = clampHerd(o, o.x + (rand() * 2 - 1) * o.range);
        e.wanderT = 2 + rand() * 4;
      }
    }
    to = clampHerd(o, to);
    const d = to - e.x;
    if (Math.abs(d) > 0.5) {
      e.dir = d > 0 ? 1 : -1;
      e.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
      e.attacking = false;
    } else e.attacking = true; // standing: «grazing» pose
  }
  s.herd = s.herd.filter((e) => !e.dead);
}

/**
 * Hurt a grazer (the Spear and the Hammer hunt them). Killed, it drops `drop` Amber (spec §5).
 * Returns the damage dealt.
 */
export function hurtGrazer(g: Game, rand: () => number, e: Enemy, amount: number): number {
  if (e.dead) return 0;
  e.hp -= amount;
  e.hitFlash = 0.12;
  g.emit({ type: 'hit', x: e.x, y: e.y - ENEMIES.grazer.height * 0.6, amount, crit: false });
  if (e.hp > 0) return amount;
  e.dead = true;
  g.emit({ type: 'enemyDied', kind: 'grazer', x: e.x, y: e.y });
  const o = g.world.objects[e.herd ?? -1];
  const [lo, hi] = o && o.kind === 'herd' ? o.drop : [3, 5];
  spillAmber(g, e.x, lo + Math.floor(rand() * (hi - lo + 1)));
  return amount;
}

// ───────────────────────────── per step ─────────────────────────────

/** One step of the world objects (in-world worlds; called by `Game.step`). */
export function updateWorldObjects(g: Game, rand: () => number, dt: number) {
  const s = g.state;
  // thickets burn as the Circle reaches them
  for (const { o, id } of objectsOf(g, 'thicket')) {
    if (s.wobj.burnt.includes(id)) continue;
    const inner = Math.min(...span(o).map((x) => Math.abs(x - WORLD.treeX)));
    if (s.tree.radius >= inner + WORLD_OBJ.thicketBite) {
      s.wobj.burnt.push(id);
      g.emit({ type: 'thicketBurnt', x: o.x });
    }
  }
  updateHerd(g, rand, dt);
  // the Seed rides with the Keeper; dropped where he falls; out of the Circle = victory
  const seed = s.seed;
  const k = s.keeper;
  if (seed?.carried) {
    if (!k.alive) {
      seed.carried = false;
      seed.x = k.x;
      g.emit({ type: 'seedLost', x: k.x });
    } else {
      seed.x = k.x;
      if (Math.abs(k.x - WORLD.treeX) >= s.tree.radius) {
        s.phase = 'won';
        g.emit({ type: 'won' });
      }
    }
  }
}
