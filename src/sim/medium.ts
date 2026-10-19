import { ENEMIES, WORLD, type EnemyKind } from '../data/balance';
import { NESTS } from '../data/nests';
import type { NightDef, SpawnGroup } from '../data/nights';
import { MEDIUM, STAGE_INSTR, type WorldObjectDef } from '../data/worlds';
import type { Game } from './game';
import { registerProvider, type InteractProvider, type Interactable } from './interact';
import { objectsOf } from './objects';

/**
 * «Поляна», the medium world (spec §6, docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md):
 *
 * - **Void Rifts** at the world's edges are the source of their side's creatures (they come out at
 *   `max(rift, treeX − spawnReach)`). By day, at Tree stage ≥ `minStage`, the Keeper pours
 *   `amber × k` (k = Rifts already sealed + 1) and pays `star` Star Blood to seal one: the Eclipse
 *   cuts the day short and the next night is its retaliation wave (×(1.4 + 0.3 × sealed before));
 *   once that night is survived the side is silent for good. A second Rift can't be sealed while
 *   the first one's wave is still to come. Both silent → `won`.
 * - **Dead Trees**: pour `cost` to light one — a small Circle of `radius` (`isLit`), `slots` nest
 *   slots by it (`SlotDef.husk`), a husk of `hp` the creatures gnaw; gone out, it is dead again.
 * - **Sleeping Creatures**: pour `cost` to wake one — its family opens (`state.unlockedFamilies`).
 * - **Stelae**: `star` Star Blood → a run blessing (nests +20% HP / Light regen +30%).
 *
 * State lives in `GameState.mw` (snapshots carry it). Everything plugs into the verbs through
 * `registerProvider`.
 */

type Side = 'L' | 'R';
type Obj<K extends WorldObjectDef['kind']> = Extract<WorldObjectDef, { kind: K }>;

// ───────────────────────────── queries ─────────────────────────────

/** Is this Dead Tree burning? */
export const huskLit = (g: Game, id: string) => g.state.mw.husks[id] !== undefined;

/** Burning Dead Trees: where their small Circles are. */
export function litHusks(g: Game): Array<{ id: string; x: number; radius: number; hp: number; maxHp: number }> {
  const out: Array<{ id: string; x: number; radius: number; hp: number; maxHp: number }> = [];
  if (!g.state.mw) return out;
  for (const { o, id } of objectsOf(g, 'deadTree')) {
    const hp = g.state.mw.husks[id];
    if (hp !== undefined) out.push({ id, x: o.x, radius: o.radius, hp, maxHp: o.hp });
  }
  return out;
}

/** The Rift of a side (undefined in worlds without Rifts). */
export function riftOf(g: Game, side: Side): { o: Obj<'rift'>; id: string } | undefined {
  return objectsOf(g, 'rift').find((r) => r.o.side === side);
}

/** Has this side's retaliation wave been survived (no creature comes from it any more)? */
export const sideSilent = (g: Game, side: Side) => g.state.mw.silent.includes(side);

/**
 * Where a side's creatures come out: at its Rift, but never farther than `world.spawnReach` from
 * the trunk (spec §6); worlds without Rifts or a reach: just beyond the world's edge (as before).
 */
export function spawnX(g: Game, side: Side): number {
  const rift = riftOf(g, side);
  const reach = g.world.spawnReach;
  if (side === 'L') {
    const edge = rift ? rift.o.x : -WORLD.spawnMargin;
    return reach === undefined ? edge : Math.max(edge, WORLD.treeX - reach);
  }
  const edge = rift ? rift.o.x : WORLD.width + WORLD.spawnMargin;
  return reach === undefined ? edge : Math.min(edge, WORLD.treeX + reach);
}

/**
 * The outermost lit x on a side: the Circle's edge, or the far edge of a burning Dead Tree's small
 * Circle beyond it — where a side's creatures first meet the light.
 */
export function lightFront(g: Game, side: Side): number {
  const r = g.state.tree.radius;
  let front = side === 'L' ? WORLD.treeX - r : WORLD.treeX + r;
  for (const h of litHusks(g)) {
    if (side === 'L' && h.x < WORLD.treeX) front = Math.min(front, h.x - h.radius);
    if (side === 'R' && h.x > WORLD.treeX) front = Math.max(front, h.x + h.radius);
  }
  return front;
}

/**
 * Night lead-in (spec §6, `world.arriveIn`): how many seconds earlier a side's schedule starts so
 * that its first creature (`kind`, due `firstAt` s after nightfall) reaches the light on its side
 * `arriveIn` s after nightfall. 0 = no lead (the walk is already short enough, or no lead-in here).
 */
export function nightLead(g: Game, side: Side, kind: EnemyKind, firstAt: number): number {
  const arrive = g.world.arriveIn;
  if (arrive === undefined) return 0;
  const dist = Math.abs(spawnX(g, side) - lightFront(g, side));
  const v = Math.max(1, ENEMIES[kind].speed);
  return Math.max(0, firstAt + dist / v - arrive);
}

/** How far (px) from its Rift a creature that has walked `ahead` s appears — never into the light. */
export function aheadDistance(g: Game, side: Side, kind: EnemyKind, ahead: number): number {
  const dist = Math.abs(spawnX(g, side) - lightFront(g, side));
  return Math.max(0, Math.min(ENEMIES[kind].speed * ahead, dist - MEDIUM.leadGap));
}

/** Summed power of the bought stela blessings of one kind (0 = none). */
export function blessing(g: Game, kind: 'nestHp' | 'lightRegen'): number {
  const b = g.state.mw?.blessed;
  if (!b?.length) return 0;
  let sum = 0;
  for (const { o, id } of objectsOf(g, 'stela')) if (o.blessing === kind && b.includes(id)) sum += o.power;
  return sum;
}

/** Amber the next Rift seal costs: `amber × k`, k = Rifts already sealed + 1. */
export const sealPrice = (g: Game, o: Obj<'rift'>) => o.amber * (g.state.mw.sealed.length + 1);

/** Why this Rift can't be sealed right now (null = it can; Star Blood is checked by the pour). */
export function sealBlock(g: Game, o: Obj<'rift'>): string | null {
  const s = g.state, mw = s.mw;
  if (mw.sealed.includes(o.side)) return mw.silent.includes(o.side) ? 'Разлом запечатан — с этой стороны тьма молчит' : 'Разлом запечатан — переживи его ответную волну';
  if (s.tree.stage < o.minStage) return `Разлом запечатывается, когда Древо станет ${STAGE_INSTR[o.minStage]}`;
  if (mw.wave) return 'Сначала переживи ответную волну первого Разлома';
  if (s.phase !== 'day') return 'Запечатывать Разлом — только днём';
  return null;
}

// ───────────────────────────── actions ─────────────────────────────

/** Seal a Rift (paid: the pledge's Amber + Star Blood): the Eclipse falls, its wave comes next night. */
export function sealRift(g: Game, id: string): boolean {
  const s = g.state;
  const hit = objectsOf(g, 'rift').find((r) => r.id === id);
  if (!hit) return false;
  const why = sealBlock(g, hit.o);
  if (why) return g.deny(why);
  if (!g.spend({ amber: sealPrice(g, hit.o), star: hit.o.star })) return false;
  s.mw.sealed.push(hit.o.side);
  s.mw.wave = hit.o.side;
  s.mw.waveNight = null;
  s.mw.eclipse = MEDIUM.eclipseT;
  // the Eclipse: the day ends soon — the Rift's answer is coming
  s.dayLeft = Math.min(s.dayLeft, MEDIUM.eclipseDay);
  g.emit({ type: 'riftSealed', x: hit.o.x, side: hit.o.side, sealed: s.mw.sealed.length });
  return true;
}

/** Light a Dead Tree (paid by its pledge). */
export function lightHusk(g: Game, id: string): boolean {
  const hit = objectsOf(g, 'deadTree').find((r) => r.id === id);
  if (!hit || huskLit(g, id)) return false;
  if (!g.spend({ amber: hit.o.cost, star: 0 })) return false;
  g.state.mw.husks[id] = hit.o.hp;
  g.emit({ type: 'huskLit', x: hit.o.x });
  return true;
}

/** A creature gnaws a burning Dead Tree; at 0 it goes out (dead again, its slots close). */
export function damageHusk(g: Game, id: string, amount: number) {
  const mw = g.state.mw;
  const hp = mw.husks[id];
  if (hp === undefined) return;
  const hit = objectsOf(g, 'deadTree').find((r) => r.id === id)!;
  mw.husks[id] = hp - amount;
  g.emit({ type: 'huskHit', x: hit.o.x, id });
  if (mw.husks[id] <= 0) {
    delete mw.husks[id];
    g.emit({ type: 'huskOut', x: hit.o.x });
  }
}

/** Wake a Sleeping Creature (paid by its pledge): its family opens for building. */
export function wakeSleeper(g: Game, id: string): boolean {
  const s = g.state;
  const hit = objectsOf(g, 'sleeper').find((r) => r.id === id);
  if (!hit || s.mw.woken.includes(id)) return false;
  if (!g.spend({ amber: hit.o.cost, star: 0 })) return false;
  s.mw.woken.push(id);
  if (!s.unlockedFamilies.includes(hit.o.family)) s.unlockedFamilies.push(hit.o.family);
  g.emit({ type: 'sleeperWoken', x: hit.o.x, family: hit.o.family });
  return true;
}

/** Buy a stela's run blessing for Star Blood. */
export function blessStela(g: Game, id: string): boolean {
  const s = g.state;
  const hit = objectsOf(g, 'stela').find((r) => r.id === id);
  if (!hit || s.mw.blessed.includes(id)) return false;
  if (!g.spend({ amber: 0, star: hit.o.star })) return false;
  s.mw.blessed.push(id);
  g.refreshNestHp();
  g.emit({ type: 'stelaBlessed', x: hit.o.x, blessing: hit.o.blessing });
  return true;
}

// ───────────────────────────── nights ─────────────────────────────

/** Retaliation multiplier of the wave of the `sealedBefore + 1`-th Rift. */
export const waveMul = (sealedBefore: number) => MEDIUM.waveBase + MEDIUM.waveStep * sealedBefore;

/**
 * Shape a night for a world with Rifts (called when night `n` is queued): silent sides send no one;
 * the retaliation wave multiplies the groups (a truce is broken: the night before it comes again).
 * Returns the groups and the night's quiet seconds.
 */
export function shapeNight(g: Game, def: NightDef, n: number): { groups: SpawnGroup[]; quiet: number } {
  const mw = g.state.mw;
  let groups = def.groups;
  let quiet = def.quiet ?? 0;
  if (mw.wave && mw.waveNight === null) mw.waveNight = n;
  if (mw.wave && mw.waveNight === n) {
    if (def.quiet) { groups = g.night(Math.max(0, n - 1)).groups; quiet = 0; }
    const mul = waveMul(mw.sealed.length - 1);
    groups = groups.map((x) => (g.isBoss(x.kind) ? x : { ...x, count: Math.max(1, Math.round(x.count * mul)) }));
  }
  if (mw.silent.length) {
    groups = groups.flatMap((x): SpawnGroup[] => {
      if (x.side === 'B') {
        const open = (['L', 'R'] as Side[]).filter((sd) => !sideSilent(g, sd));
        return open.length === 2 ? [x] : open.map((sd) => ({ ...x, side: sd }));
      }
      return sideSilent(g, x.side) ? [] : [x];
    });
  }
  return { groups, quiet };
}

/**
 * Dawn after night `finished`: a survived retaliation wave silences its side; all Rifts silent →
 * the world is won. Returns true when the run is won.
 */
export function riftsDawn(g: Game, finished: number): boolean {
  const s = g.state, mw = s.mw;
  if (mw.wave && mw.waveNight !== null && finished >= mw.waveNight) {
    const side = mw.wave;
    if (!mw.silent.includes(side)) mw.silent.push(side);
    mw.wave = null;
    mw.waveNight = null;
    g.emit({ type: 'riftSilent', side });
  }
  const w = g.world.win;
  if (w.kind === 'rifts' && mw.silent.length >= w.count) {
    s.phase = 'won';
    g.emit({ type: 'won' });
    return true;
  }
  return false;
}

/** One step of the medium objects (the Eclipse sky fades). */
export function updateMedium(g: Game, dt: number) {
  const mw = g.state.mw;
  if (mw.eclipse > 0) mw.eclipse = Math.max(0, mw.eclipse - dt);
}

// ───────────────────────────── providers ─────────────────────────────

const STELA_TEXT: Record<'nestHp' | 'lightRegen', (p: number) => [string, string]> = {
  nestHp: (p) => ['Стела Крепости', `Благословение на забег: все гнёзда +${Math.round(p * 100)}% прочности`],
  lightRegen: (p) => ['Стела Света', `Благословение на забег: Свет Хранителя восстанавливается на ${Math.round(p * 100)}% быстрее`],
};

/** Display names of the stela blessings (HUD). */
export const stelaName = (b: 'nestHp' | 'lightRegen') => STELA_TEXT[b](0)[0];

const riftProvider: InteractProvider = (g) => objectsOf(g, 'rift').map(({ o, id }): Interactable => {
  const why = sealBlock(g, o);
  const sealed = g.state.mw.sealed.includes(o.side);
  return {
    kind: 'rift', id, x: o.x,
    label: sealed ? 'Запечатанный Разлом' : 'Разлом Пустоты',
    role: sealed ? 'Печать держит — ' + (sideSilent(g, o.side) ? 'отсюда больше никто не придёт' : 'ночью придёт ответная волна')
      : `Отсюда идут твари. Влей ${sealPrice(g, o)} Янтаря + ${o.star} Звёздной Крови — запечатать`,
    options: sealed ? [] : [{ id: 'seal', label: 'Запечатать', price: sealPrice(g, o), star: o.star }],
    pour: sealed ? undefined : 'pledge', canAct: !why, reason: why ?? undefined,
    act: () => sealRift(g, id),
  };
});

const huskProvider: InteractProvider = (g) => objectsOf(g, 'deadTree').map(({ o, id }): Interactable => {
  const hp = g.state.mw.husks[id];
  if (hp !== undefined) {
    return {
      kind: 'deadTree', id, x: o.x, label: 'Мёртвое Древо горит',
      role: `Малый Круг ${o.radius}, ${o.slots} места для гнёзд · прочность ${Math.ceil(hp)}/${o.hp}`,
      canAct: false, reason: 'Уже горит — защити его от тварей',
    };
  }
  return {
    kind: 'deadTree', id, x: o.x, label: 'Мёртвое Древо',
    role: `Влей ${o.cost} Янтаря — зажги: малый Круг ${o.radius} и ${o.slots} места для гнёзд`,
    options: [{ id: 'light', label: 'Зажечь', price: o.cost }], pour: 'pledge', canAct: true,
    act: () => lightHusk(g, id),
  };
});

const sleeperProvider: InteractProvider = (g) => objectsOf(g, 'sleeper')
  .filter(({ id }) => !g.state.mw.woken.includes(id))
  .map(({ o, id }): Interactable => ({
    kind: 'sleeper', id, x: o.x, label: `Спящее Существо: ${NESTS[o.family].name}`,
    role: `Влей ${o.cost} Янтаря — разбуди: откроется гнездо «${NESTS[o.family].name}»`,
    options: [{ id: 'wake', label: 'Разбудить', price: o.cost }], pour: 'pledge', canAct: true,
    act: () => wakeSleeper(g, id),
  }));

const stelaProvider: InteractProvider = (g) => objectsOf(g, 'stela').map(({ o, id }): Interactable => {
  const [name, gives] = STELA_TEXT[o.blessing](o.power);
  const done = g.state.mw.blessed.includes(id);
  return {
    kind: 'stela', id, x: o.x, label: name, role: done ? `${gives} — получено` : `${gives} · ${o.star} Звёздной Крови`,
    options: done ? [] : [{ id: 'bless', label: 'Благословение', price: 0, star: o.star }],
    pour: done ? undefined : 'pledge', canAct: !done, reason: done ? 'Благословение уже с тобой' : undefined,
    act: () => blessStela(g, id),
  };
});

registerProvider(riftProvider);
registerProvider(huskProvider);
registerProvider(sleeperProvider);
registerProvider(stelaProvider);
