import { ENEMIES, WORLD, type EnemyKind } from '../data/balance';
import type { NightDef } from '../data/nights';
import type { Game } from '../sim/game';
import { litHusks } from '../sim/medium';
import { geodeVisible, objectsOf } from '../sim/objects';

/**
 * The clarity layer (spec §7, docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md):
 * offscreen threat arrows, the strip map, the day digit's colour and the speed caps. The logic here
 * is pure (reads a Game, returns plain data) and tested in tests/igg2-clarity.test.ts; the small
 * DOM layer that draws it is `ClarityLayer` at the bottom.
 */

/** Clarity tuning (px of the world, seconds). */
export const CLARITY = {
  /** an offscreen creature counts for an arrow when it is this close to the light (spec §7: 500) */
  reach: 500,
  /** an offscreen hit on a nest / the Tree / a Dead Tree keeps its arrow urgent this long */
  hitHold: 1.6,
  /** «night soon»: the day digit warms up this many seconds before nightfall */
  soon: 15,
  /** the strip map draws at most this many creature dots */
  maxDots: 80,
} as const;

/** The view of the camera in world px. */
export interface View { x: number; w: number }

// ───────────────────────────── speed caps ─────────────────────────────

/** Every game speed, slowest first. */
export const ALL_SPEEDS = [1, 1.25, 1.5, 2, 5] as const;

/** The speeds a world offers (spec §7: ×2 at once everywhere; ×5 only where `maxSpeed` allows — medium). */
export function speedsFor(maxSpeed: number): number[] {
  return ALL_SPEEDS.filter((x) => x <= maxSpeed);
}

/** − / + step through the speeds without wrapping around (an unknown speed falls back to ×1). */
export function stepSpeedIn(list: number[], cur: number, d: 1 | -1): number {
  const i = list.indexOf(cur);
  if (i < 0) return list[0];
  return list[Math.max(0, Math.min(list.length - 1, i + d))];
}

// ───────────────────────────── light spans ─────────────────────────────

/** The lit stretches of the ground: the Circle and every burning Dead Tree's small Circle. */
export function litSpans(g: Game): Array<[number, number]> {
  const r = g.state.tree.radius;
  const out: Array<[number, number]> = [[WORLD.treeX - r, WORLD.treeX + r]];
  if (g.state.mw) for (const h of litHusks(g)) out.push([h.x - h.radius, h.x + h.radius]);
  return out;
}

/** Distance from x to the nearest light (0 inside it). */
export function distToLight(spans: Array<[number, number]>, x: number): number {
  let d = Infinity;
  for (const [a, b] of spans) d = Math.min(d, x < a ? a - x : x > b ? x - b : 0);
  return d;
}

// ───────────────────────────── threat arrows ─────────────────────────────

/** The Gigantopithecus is micro's mini-boss: its night reads like a boss night. */
const MINI_BOSS = new Set<EnemyKind>(['ape']);

/** How bad a group is: a boss, an elite (affix or a nest-smasher), or a plain pack. */
export type ThreatTier = 'pack' | 'elite' | 'boss';

/** One edge arrow: where, how many, how bad and how urgent. */
export interface ThreatArrow {
  side: 'L' | 'R';
  /** creatures offscreen on that side near the light */
  count: number;
  /** the rough count shown («3», «5+», «10+») */
  label: string;
  tier: ThreatTier;
  /** 0..1: the nearer the light (or a hit offscreen), the faster it pulses */
  urgency: number;
  /** something offscreen on that side is being hit right now */
  hit: boolean;
}

/** An offscreen hit on a nest / the Tree / a Dead Tree (x in world px, `t` seconds left). */
export interface OffscreenHit { x: number; t: number }

/** The rough count of an arrow: exact up to 3, then «5+», «10+», «20+». */
export function roughCount(n: number): string {
  if (n <= 3) return String(n);
  if (n < 10) return n >= 5 ? '5+' : String(n);
  return n >= 20 ? '20+' : '10+';
}

const tierOf = (kind: EnemyKind, affix: unknown): ThreatTier => {
  const d = ENEMIES[kind];
  if (d.boss) return 'boss';
  if (affix || MINI_BOSS.has(kind) || d.smashesStructures) return 'elite';
  return 'pack';
};
const worse = (a: ThreatTier, b: ThreatTier): ThreatTier => (a === 'boss' || b === 'boss' ? 'boss' : a === 'elite' || b === 'elite' ? 'elite' : 'pack');

/**
 * The edge arrows (spec §7): creatures outside the view that are within `CLARITY.reach` of the
 * light (Circle or a burning Dead Tree), aggregated per side; plus offscreen hits on nests / the
 * Tree / a Dead Tree. Neutral grazers never count. Empty in the day without creatures.
 */
export function threatArrows(g: Game, view: View, hits: OffscreenHit[] = []): ThreatArrow[] {
  const spans = litSpans(g);
  const x0 = view.x, x1 = view.x + view.w;
  const out: ThreatArrow[] = [];
  for (const side of ['L', 'R'] as const) {
    const off = (x: number) => (side === 'L' ? x < x0 : x > x1);
    let count = 0, tier: ThreatTier = 'pack', near = Infinity;
    for (const e of g.state.enemies) {
      if (e.dead || e.neutral || !off(e.x)) continue;
      const d = distToLight(spans, e.x);
      if (d > CLARITY.reach) continue;
      count++;
      tier = worse(tier, tierOf(e.kind, e.affix));
      near = Math.min(near, d);
    }
    const hit = hits.some((h) => h.t > 0 && off(h.x));
    if (!count && !hit) continue;
    const urgency = hit ? 1 : Math.max(0.15, Math.min(1, 1 - near / CLARITY.reach));
    out.push({ side, count, label: count ? roughCount(count) : '!', tier, urgency, hit });
  }
  return out;
}

// ───────────────────────────── strip map ─────────────────────────────

/** What a strip-map mark stands for. */
export type StripKind =
  | 'tree' | 'keeper' | 'husk' | 'huskLit' | 'rift' | 'riftSealed' | 'riftSilent'
  | 'sleeper' | 'stela' | 'geode' | 'seed' | 'enemy' | 'elite' | 'boss';

/** One mark on the strip: its kind and its place along the world, 0..1. */
export interface StripMark { kind: StripKind; f: number }

/** The whole strip: the Circle and Dead-Tree lights as spans, the camera window, the marks. */
export interface StripMapData {
  circle: [number, number];
  lights: Array<[number, number]>;
  view: [number, number] | null;
  marks: StripMark[];
}

/** World x → place along the strip (0 = left edge of the world, 1 = right edge). */
export const stripF = (x: number, width = WORLD.width) => Math.max(0, Math.min(1, x / width));

/**
 * The strip map (spec §7): the whole world as one line — the Tree, the Circle radius, the Keeper,
 * Dead Trees (lit or dark), Rifts (open / sealed / silent), Sleepers still asleep, stelae not yet
 * blessed, geodes the Keeper can see, the Seed, and creatures during the night.
 */
export function stripMap(g: Game, view?: View): StripMapData {
  const s = g.state, W = WORLD.width, r = s.tree.radius;
  const f = (x: number) => stripF(x, W);
  const marks: StripMark[] = [];
  const lights: Array<[number, number]> = [];
  const mw = s.mw;
  if (mw) {
    for (const { o, id } of objectsOf(g, 'deadTree')) {
      const lit = mw.husks[id] !== undefined;
      if (lit) lights.push([f(o.x - o.radius), f(o.x + o.radius)]);
      marks.push({ kind: lit ? 'huskLit' : 'husk', f: f(o.x) });
    }
    for (const { o } of objectsOf(g, 'rift')) {
      marks.push({ kind: mw.silent.includes(o.side) ? 'riftSilent' : mw.sealed.includes(o.side) ? 'riftSealed' : 'rift', f: f(o.x) });
    }
    for (const { o, id } of objectsOf(g, 'sleeper')) if (!mw.woken.includes(id)) marks.push({ kind: 'sleeper', f: f(o.x) });
    for (const { o, id } of objectsOf(g, 'stela')) if (!mw.blessed.includes(id)) marks.push({ kind: 'stela', f: f(o.x) });
  }
  for (const { o, id } of objectsOf(g, 'geode')) if (geodeVisible(g, o, id)) marks.push({ kind: 'geode', f: f(o.x) });
  if (s.seed) marks.push({ kind: 'seed', f: f(s.seed.carried ? s.keeper.x : s.seed.x) });
  if (s.phase === 'night') {
    let n = 0;
    for (const e of s.enemies) {
      if (e.dead || e.neutral) continue;
      if (n++ >= CLARITY.maxDots) break;
      const t = tierOf(e.kind, e.affix);
      marks.push({ kind: t === 'boss' ? 'boss' : t === 'elite' ? 'elite' : 'enemy', f: f(e.x) });
    }
  }
  marks.push({ kind: 'tree', f: f(WORLD.treeX) });
  marks.push({ kind: 'keeper', f: f(s.keeper.x) });
  return {
    circle: [f(WORLD.treeX - r), f(WORLD.treeX + r)],
    lights,
    view: view ? [f(view.x), f(view.x + view.w)] : null,
    marks,
  };
}

// ───────────────────────────── the day digit ─────────────────────────────

/**
 * The colour state of the night number (spec §7): red — a boss night or the retaliation wave (and
 * the Eclipse before it); blue — a truce; pale blue — «winter» (halved dawn income); amber — the
 * night is near; plain — a safe day; violet — an ordinary night.
 */
export type DayMood = 'safe' | 'soon' | 'night' | 'truce' | 'winter' | 'wave' | 'boss';

const bossNight = (d: NightDef) => d.groups.some((x) => ENEMIES[x.kind].boss || MINI_BOSS.has(x.kind));

/** The mood of the coming night (by day) or of this night (at night). */
export function dayMood(g: Game): DayMood {
  const s = g.state, mw = s.mw;
  const n = s.night;
  const wave = !!mw?.wave && (mw.waveNight === null || mw.waveNight === n);
  if (s.phase === 'night') {
    if (wave) return 'wave';
    const d = g.night(n);
    if (bossNight(d)) return 'boss';
    if (d.truce) return 'truce';
    if (g.isWinter(n)) return 'winter';
    return 'night';
  }
  if (wave || (mw?.eclipse ?? 0) > 0) return 'wave';
  const d = g.night(n);
  if (bossNight(d)) return 'boss';
  if (d.truce) return 'truce';
  if (g.isWinter(n)) return 'winter';
  return s.phase === 'day' && s.dayLeft <= CLARITY.soon && !s.seed ? 'soon' : 'safe';
}

/** One short word that names a mood (colour is never the only signal). */
export const MOOD_WORD: Record<DayMood, string> = {
  safe: '', soon: '', night: '', truce: 'перемирие', winter: 'зима', wave: 'ответная волна', boss: 'босс',
};

// ───────────────────────────── DOM ─────────────────────────────

const MARK_TIP: Partial<Record<StripKind, string>> = {
  tree: 'Древо', keeper: 'Хранитель', husk: 'Мёртвое Древо', huskLit: 'Мёртвое Древо горит', rift: 'Разлом Пустоты',
  riftSealed: 'Разлом запечатан', riftSilent: 'Разлом затих', sleeper: 'Спящее Существо', stela: 'Стела', geode: 'Жеода', seed: 'Семя',
};

/**
 * Draws the arrows and the strip map as two quiet HUD pieces (in-world worlds only). Reads the
 * game, never changes it.
 */
export class ClarityLayer {
  private strip: HTMLElement;
  private arrows: Record<'L' | 'R', HTMLElement>;
  private hits: OffscreenHit[] = [];
  private sig = '';
  private arrowSig: Record<'L' | 'R', string> = { L: '', R: '' };

  constructor(root: HTMLElement) {
    this.strip = document.createElement('div');
    this.strip.id = 'strip';
    root.appendChild(this.strip);
    const mk = (side: 'L' | 'R') => {
      const a = document.createElement('div');
      a.className = `threat ${side === 'L' ? 'l' : 'r'}`;
      root.appendChild(a);
      return a;
    };
    this.arrows = { L: mk('L'), R: mk('R') };
  }

  /** Remember an offscreen hit (the layer decides at update whether it is offscreen). */
  hitAt(x: number) { this.hits.push({ x, t: CLARITY.hitHold }); }

  /** Forget the hits (a new run). */
  reset() { this.hits = []; }

  update(g: Game, view: View | null, dt: number, groundY: number) {
    const show = g.world.features.inWorld && !g.over && !!view;
    this.strip.classList.toggle('show', show);
    for (const h of this.hits) h.t -= dt;
    this.hits = this.hits.filter((h) => h.t > 0);
    if (!show || !view) { for (const a of Object.values(this.arrows)) a.classList.remove('show'); return; }
    // ── the strip
    const m = stripMap(g, view);
    const pc = (v: number) => `${(v * 100).toFixed(1)}%`;
    const span = (cls: string, [a, b]: [number, number]) => `<i class="${cls}" style="left:${pc(a)};width:${pc(Math.max(0.002, b - a))}"></i>`;
    let h = span('circle', m.circle);
    for (const l of m.lights) h += span('light', l);
    if (m.view) h += span('view', m.view);
    // creatures first, objects over them, the Tree and the Keeper on top
    const order = (k: StripKind) => (k === 'enemy' || k === 'elite' || k === 'boss' ? 0 : k === 'tree' ? 2 : k === 'keeper' ? 3 : 1);
    for (const mk of [...m.marks].sort((a, b) => order(a.kind) - order(b.kind))) {
      const tip = MARK_TIP[mk.kind];
      h += `<b class="${mk.kind}" style="left:${pc(mk.f)}"${tip ? ` title="${tip}"` : ''}></b>`;
    }
    if (h !== this.sig) { this.sig = h; this.strip.innerHTML = h; }
    // ── the arrows
    const list = threatArrows(g, view, this.hits);
    for (const side of ['L', 'R'] as const) {
      const el = this.arrows[side];
      const a = list.find((x) => x.side === side);
      el.classList.toggle('show', !!a);
      if (!a) continue;
      el.style.top = `${groundY}px`;
      const sig = `${a.label}|${a.tier}|${a.hit}|${Math.round(a.urgency * 4)}`;
      if (sig === this.arrowSig[side]) continue;
      this.arrowSig[side] = sig;
      el.className = `threat ${side === 'L' ? 'l' : 'r'} show ${a.tier}${a.hit ? ' hit' : ''}`;
      // the nearer, the faster the pulse (1.4 s far … 0.45 s at the edge)
      el.style.setProperty('--pulse', `${(1.4 - 0.95 * a.urgency).toFixed(2)}s`);
      el.innerHTML = side === 'L' ? `<span class="chev"></span><span class="n">${a.label}</span>` : `<span class="n">${a.label}</span><span class="chev"></span>`;
    }
  }
}
