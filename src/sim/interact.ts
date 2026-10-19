import { SLOTS, WORLD } from '../data/balance';
import { BASE_TIERS, MAX_TIER, NESTS, NEST_ROLE, type Family, type SpecId } from '../data/nests';
import { TREE_STAGES } from '../data/tree';
import { INWORLD, STAGE_INSTR } from '../data/worlds';
import type { Game } from './game';
import type { DropKind, Structure } from './types';

/**
 * In-world verbs (spec §3, docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md):
 * the Keeper walks up to an object and holds S to pour Amber into it, W to take from the
 * Treasury, Q/E to choose an option, X to sell a nest. Objects come from *providers* — each
 * returns the interactables of one kind (slots and nests, trunk objects; later phases add
 * geodes, sleepers, stelae, dead trees, rifts, the seed) — so new kinds plug in with
 * `registerProvider` without touching the verbs.
 *
 * Pouring goes into a *pledge* (`state.pledges[id]`): a partial payment that stays with the
 * object across releases and option changes. When the pledge covers the price the object's
 * `act` runs prepaid (`Game.withPrepaid`), so the Treasury is not charged again.
 */

/** One choice of an object (Q/E cycles them). */
export interface FocusOption {
  id: string;
  label: string;
  /** Amber price */
  price: number;
  /** Star Blood paid from `state.star` when the action runs */
  star?: number;
}

/** What S does at an object. */
export type PourMode = 'pledge' | 'deposit';

/** An object the Keeper can interact with, as a provider describes it. */
export interface Interactable {
  /** 'slot' | 'nest' | 'well' | 'altar' | 'treasury' | 'stone' (later: 'geode', 'sleeper', …) */
  kind: string;
  /** stable id — also the pledge key */
  id: string;
  x: number;
  label: string;
  /** one line: what it is for */
  role: string;
  /** surface or root layer (for the plate) */
  underground?: boolean;
  options?: FocusOption[];
  /** default option index when the player hasn't chosen */
  defaultOption?: number;
  /** price when there are no options (e.g. the altar) */
  price?: number;
  /** S at this object: pour into the pledge, or hand the purse over (Treasury) */
  pour?: PourMode;
  /** W takes from the Treasury here */
  take?: boolean;
  /** X sells here */
  sell?: boolean;
  /** pouring also draws from the Treasury when the purse is empty (you stand next to it) */
  useTreasury?: boolean;
  /** false: verbs do nothing (shown with `reason`) */
  canAct: boolean;
  reason?: string;
  /** custom pledge (the altar's pledge is the Tree's growth) */
  getPledge?: () => number;
  addPledge?: (n: number) => void;
  /** run the chosen option, paid from the fulfilled pledge (inside `Game.withPrepaid`) */
  act?: (opt: FocusOption | undefined) => boolean;
  /** run the sale (X held) */
  sellAct?: () => boolean;
  /** S held this many seconds runs `holdAct` (no Amber: a geode, the Seed — 0 = on the press) */
  hold?: number;
  holdAct?: () => boolean;
}

/** The focused object as the UI and bots see it. */
export interface Focus {
  kind: string;
  id: string;
  x: number;
  label: string;
  role: string;
  underground: boolean;
  options: FocusOption[];
  optionIndex: number;
  /** Amber price of the chosen option (0 = no price) */
  price: number;
  /** Star Blood price of the chosen option */
  star: number;
  /** Amber already poured */
  pledged: number;
  canAct: boolean;
  reason?: string;
  verbs: { pour: PourMode | null; take: boolean; sell: boolean };
  /** seconds X has been held here (0..INWORLD.sellHold) */
  sellT: number;
  /** S-hold objects: seconds to hold (0 = none) and how long S has been held here */
  hold: number;
  holdT: number;
}

/** Returns every interactable of one kind in the world (not filtered by reach). */
export type InteractProvider = (g: Game) => Interactable[];

// ───────────────────────────── providers ─────────────────────────────

const familyLabel = (f: Family) => NESTS[f].name;

/** Empty unlocked slots and wells: build one of the families open on that layer. */
const slotProvider: InteractProvider = (g) => {
  const out: Interactable[] = [];
  for (const slot of SLOTS) {
    if (slot.crown || !g.slotUnlocked(slot)) continue;
    const st = g.structureAt(slot.id);
    if (st) { out.push(nestTarget(g, st)); continue; }
    const fams = g.world.families.map((r) => r.family)
      .filter((f) => g.familyOpen(f) && NESTS[f].underground === slot.underground);
    const options = fams.map((f) => {
      const p = g.buildPrice(f);
      return { id: f, label: familyLabel(f), price: p.amber, star: p.star };
    });
    const well = !!slot.well;
    out.push({
      kind: well ? 'well' : 'slot', id: `slot:${slot.id}`, x: slot.x, underground: slot.underground,
      label: well ? 'Корневой колодец' : 'Место для гнезда',
      role: well ? 'Под колодцем селится Паук — страж корней' : 'Влей Янтарь — вырастет гнездо',
      options, defaultOption: Math.max(0, fams.indexOf(well ? 'spider' : 'hive')),
      pour: 'pledge', canAct: options.length > 0, reason: options.length ? undefined : 'Нечего строить',
      act: (o) => !!o && g.build(slot.id, o.id as Family),
    });
  }
  return out;
};

/** A built nest: next level, the A/B fork, then «Возвышение» where the world allows it. */
function nestTarget(g: Game, st: Structure): Interactable {
  const fam = NESTS[st.family];
  const options: FocusOption[] = [];
  let act: Interactable['act'];
  let reason: string | undefined;
  if (st.tier === BASE_TIERS - 1 && !g.specOpen()) {
    // the fork is shown locked until the world's stage opens it (micro: never — the nest is at its top)
    reason = g.specLockReason() ?? undefined;
  } else if (st.tier === BASE_TIERS - 1) {
    for (const spec of ['A', 'B'] as SpecId[]) {
      const p = g.specPrice(st, spec);
      options.push({ id: spec, label: fam.specs[spec].name, price: p.amber, star: p.star });
    }
    act = (o) => !!o && g.specialize(st.id, o.id as SpecId);
  } else if (st.tier < MAX_TIER - 1) {
    const p = g.upgradePrice(st);
    if (p) options.push({ id: 'up', label: `Уровень ${st.tier + 2}`, price: p.amber, star: p.star });
    act = () => g.upgrade(st.id);
  } else if (g.world.ascendStage !== undefined && g.ascendOpen()) {
    options.push({ id: 'ascend', label: `Возвышение ${st.ascend + 1}`, price: g.ascendCost(st) });
    act = () => g.ascendNest(st.id);
  } else {
    reason = 'Гнездо на пределе';
  }
  const name = st.spec ? `${fam.name} · ${fam.specs[st.spec].name}` : fam.name;
  return {
    kind: 'nest', id: `nest:${st.id}`, x: st.x, underground: st.underground,
    label: `${name} · ур. ${st.tier + 1}`, role: NEST_ROLE[st.family],
    options, pour: 'pledge', sell: true, canAct: options.length > 0, reason, act,
    sellAct: () => g.sell(st.id),
  };
}

/** The trunk: the hollow (Treasury), the growth altar, the Tablet stone (if the world has it). */
const trunkProvider: InteractProvider = (g) => {
  const s = g.state;
  const tx = WORLD.treeX;
  const atMax = s.tree.stage >= g.world.maxStage;
  const next = TREE_STAGES[s.tree.stage + 1];
  const out: Interactable[] = [
    {
      kind: 'treasury', id: 'treasury', x: tx + INWORLD.treasury, label: 'Дупло — Казна Древа',
      role: 'W — взять Янтарь в кошель, S — сдать', pour: 'deposit', take: true, canAct: true,
    },
    {
      kind: 'altar', id: 'altar', x: tx + INWORLD.altar, label: 'Алтарь роста',
      role: atMax ? 'Древо достигло предела этого мира' : `Влей Янтарь — Древо станет «${next?.short ?? ''}», Круг шире`,
      price: g.growCost(), pour: 'pledge', useTreasury: true, canAct: !atMax,
      reason: atMax ? 'Древо достигло предела этого мира' : undefined,
      getPledge: () => s.tree.growth,
      addPledge: (n) => g.pourGrowth(n),
    },
  ];
  if (g.world.features.tablet) {
    out.push({
      kind: 'stone', id: 'stone', x: tx + INWORLD.stone, label: 'Камень Скрижали',
      role: 'S или W — открыть Скрижаль: ранги рун за Звёздную Кровь',
      canAct: s.tree.stage >= (g.world.tabletStage ?? 0),
      reason: s.tree.stage >= (g.world.tabletStage ?? 0) ? undefined : `Скрижаль пробудится, когда Древо станет ${STAGE_INSTR[g.world.tabletStage ?? 0]}`,
    });
  }
  return out;
};

/** Registered providers, in priority order for exact ties. */
export const PROVIDERS: InteractProvider[] = [trunkProvider, slotProvider];

/** Add a provider of a new interactable kind (later phases: geode, sleeper, stela, …). */
export function registerProvider(p: InteractProvider) {
  if (!PROVIDERS.includes(p)) PROVIDERS.push(p);
}

/** Every interactable in the world. */
export function allInteractables(g: Game): Interactable[] {
  return PROVIDERS.flatMap((p) => p(g));
}

/** The nearest interactable within reach of the Keeper; a tie goes to the one he faces. */
export function focusTarget(g: Game): Interactable | null {
  const k = g.state.keeper;
  if (!k.alive) return null;
  let best: Interactable | null = null;
  let bd = Infinity;
  for (const t of allInteractables(g)) {
    const d = Math.abs(t.x - k.x);
    if (d > INWORLD.reach) continue;
    const faces = (t.x - k.x) * k.dir > 0;
    const bestFaces = best ? (best.x - k.x) * k.dir > 0 : false;
    if (d < bd - 1e-6 || (Math.abs(d - bd) <= 1e-6 && faces && !bestFaces)) { best = t; bd = d; }
  }
  return best;
}

const optionIndex = (g: Game, t: Interactable) => {
  const n = t.options?.length ?? 0;
  if (!n) return 0;
  const i = g.state.interact.opt[t.id] ?? t.defaultOption ?? 0;
  return ((i % n) + n) % n;
};
const optionOf = (g: Game, t: Interactable) => t.options?.[optionIndex(g, t)];
const priceOf = (g: Game, t: Interactable) => optionOf(g, t)?.price ?? t.price ?? 0;
const pledgeOf = (g: Game, t: Interactable) => (t.getPledge ? t.getPledge() : g.state.pledges[t.id] ?? 0);

/** Star Blood short for the chosen option: the action can't run (and isn't poured into). */
function blocked(g: Game, t: Interactable): string | undefined {
  if (!t.canAct) return t.reason;
  const o = optionOf(g, t);
  if (o?.star && g.state.star < o.star) return `Нужна Звёздная Кровь: ${o.star}`;
  return undefined;
}

/** Public view of the focus. */
export function focusOf(g: Game): Focus | null {
  const t = focusTarget(g);
  if (!t) return null;
  const o = optionOf(g, t);
  const why = blocked(g, t);
  return {
    kind: t.kind, id: t.id, x: t.x, label: t.label, role: t.role, underground: !!t.underground,
    options: t.options ?? [], optionIndex: optionIndex(g, t), price: priceOf(g, t), star: o?.star ?? 0,
    pledged: pledgeOf(g, t), canAct: !why, reason: why,
    verbs: { pour: t.pour ?? null, take: !!t.take, sell: !!t.sell },
    sellT: g.state.interact.focusId === t.id ? g.state.interact.sellT : 0,
    hold: t.hold ?? 0,
    holdT: t.hold !== undefined && g.state.interact.focusId === t.id && g.state.interact.pour ? g.state.interact.holdT : 0,
  };
}

// ───────────────────────────── verbs ─────────────────────────────

/** Press / release a held verb. A new press restarts the rate ramp. */
export function setVerb(g: Game, verb: 'pour' | 'take' | 'sell', on: boolean) {
  const it = g.state.interact;
  if (it[verb] === on) return;
  it[verb] = on;
  it.holdT = 0;
  it.acc = 1; // the first drop flows at once
  it.told = false;
  if (verb === 'sell') it.sellT = 0;
}

/** Q/E at the focused object. */
export function cycleFocusOption(g: Game, step: number) {
  const t = focusTarget(g);
  if (!t?.options || t.options.length < 2) return;
  const n = t.options.length;
  g.state.interact.opt[t.id] = (((optionIndex(g, t) + step) % n) + n) % n;
}

/**
 * Spill `total` of a resource as lying drops around `x` (pieces of up to 3). `lock`: seconds
 * before the Keeper's magnet may take them.
 */
export function spillAmber(g: Game, x: number, total: number, kind: DropKind = 'amber', lock = 0) {
  if (total <= 0) return;
  const s = g.state;
  const pieces = Math.max(1, Math.min(10, Math.ceil(total / 3)));
  let left = total;
  for (let i = 0; i < pieces; i++) {
    const v = i === pieces - 1 ? left : Math.floor(total / pieces);
    left -= v;
    if (v <= 0) continue;
    const dx = (i - (pieces - 1) / 2) * 6 + (i % 2 ? 8 : -8);
    g.dropAt(Math.max(8, Math.min(WORLD.width - 8, x + dx)), kind, v);
    const d = s.drops[s.drops.length - 1];
    if (lock > 0) d.lock = lock;
  }
}

/** Give a pledge back as drops at the object's place (the object is gone). */
export function refundPledge(g: Game, id: string) {
  const s = g.state;
  const v = s.pledges[id] ?? 0;
  const x = s.interact.pledgeX[id] ?? WORLD.treeX;
  delete s.pledges[id];
  delete s.interact.pledgeX[id];
  spillAmber(g, x, v);
}

/** Amber the current rate lets flow this step (ramping 8/s → 60/s over 2 s of holding). */
function flow(g: Game, dt: number): number {
  const it = g.state.interact;
  const rate = INWORLD.rate0 + (INWORLD.rate1 - INWORLD.rate0) * Math.min(1, it.holdT / INWORLD.rampT);
  it.holdT += dt;
  it.acc += rate * dt;
  const n = Math.floor(it.acc);
  it.acc -= n;
  return n;
}

/** Put Amber back into the purse (up to its cap); the overflow falls as drops at `x`. */
function toPurse(g: Game, n: number, x: number) {
  const k = g.state.keeper;
  const fit = Math.max(0, Math.min(n, g.purseCap() - k.purse));
  k.purse += fit;
  if (n - fit > 0) spillAmber(g, x, n - fit);
}

/** One simulation step of the in-world verbs (called by `Game.step` in in-world worlds). */
export function updateInteract(g: Game, dt: number) {
  const s = g.state;
  const it = s.interact;
  const k = s.keeper;
  // pledges of objects that vanished (a sold or eaten nest) fall out as drops
  const ids = Object.keys(s.pledges);
  if (ids.length) {
    const all = allInteractables(g);
    for (const id of ids) {
      const t = all.find((x) => x.id === id);
      if (!t) refundPledge(g, id);
      else it.pledgeX[id] = t.x;
    }
  }
  const t = focusTarget(g);
  if ((t?.id ?? null) !== it.focusId) {
    // a new object: the ramp and the sale start over
    it.focusId = t?.id ?? null;
    it.holdT = 0;
    it.acc = 1;
    it.sellT = 0;
    it.told = false;
  }
  if (!t || !k.alive) return;

  if (it.sell && t.sell && t.sellAct) {
    it.sellT += dt;
    if (it.sellT >= INWORLD.sellHold) {
      it.sellT = 0;
      it.sell = false;
      t.sellAct();
    }
    return;
  }

  if (it.take && t.take) {
    const units = flow(g, dt);
    if (units <= 0) return;
    const n = Math.min(units, s.amber, Math.max(0, g.purseCap() - k.purse));
    if (n > 0) {
      s.amber -= n;
      k.purse += n;
      g.emit({ type: 'take', x: t.x, amount: n });
    } else if (!it.told) {
      it.told = true;
      g.deny(s.amber <= 0 ? 'Казна пуста' : 'Кошель полон');
    }
    return;
  }

  if (it.pour && t.hold !== undefined && t.holdAct) {
    // hold S (no Amber): crack a geode, take the Seed
    if (!t.canAct) { if (!it.told) { it.told = true; if (t.reason) g.deny(t.reason); } return; }
    it.holdT += dt;
    if (it.holdT + 1e-9 >= t.hold) {
      it.pour = false;
      it.holdT = 0;
      if (t.holdAct()) g.emit({ type: 'pledgeDone', x: t.x, target: t.id });
    }
    return;
  }

  if (!it.pour || !t.pour) return;
  if (t.pour === 'deposit') {
    const units = flow(g, dt);
    if (units <= 0) return;
    const n = Math.min(units, k.purse);
    if (n > 0) {
      k.purse -= n;
      s.amber += n;
      g.emit({ type: 'pour', x: t.x, target: t.id, amount: n, progress: 0 });
    } else if (!it.told) { it.told = true; g.deny('Кошель пуст'); }
    return;
  }
  const why = blocked(g, t);
  if (why) {
    if (!it.told) { it.told = true; g.deny(why); }
    return;
  }
  const price = priceOf(g, t);
  let pledged = pledgeOf(g, t);
  if (pledged < price) {
    const units = flow(g, dt);
    if (units <= 0) return;
    const want = Math.min(units, price - pledged);
    const fromPurse = Math.min(want, k.purse);
    const fromTreasury = t.useTreasury ? Math.min(want - fromPurse, s.amber) : 0;
    const n = fromPurse + fromTreasury;
    if (n <= 0) {
      if (!it.told) { it.told = true; g.deny(t.useTreasury ? 'Нет Янтаря ни в кошеле, ни в Казне' : 'Кошель пуст — возьми Янтарь из Казны (W у дупла)'); }
      return;
    }
    k.purse -= fromPurse;
    s.amber -= fromTreasury;
    const stage = s.tree.stage;
    if (t.addPledge) {
      t.addPledge(n);
      if (s.tree.stage !== stage) {
        // the Tree grew: the pour ends here (press S again for the next stage)
        g.emit({ type: 'pour', x: t.x, target: t.id, amount: n, progress: 1 });
        g.emit({ type: 'pledgeDone', x: t.x, target: t.id });
        it.pour = false;
        return;
      }
    }
    else {
      s.pledges[t.id] = pledged + n;
      it.pledgeX[t.id] = t.x;
    }
    pledged += n;
    g.emit({ type: 'pour', x: t.x, target: t.id, amount: n, progress: price > 0 ? Math.min(1, pledged / price) : 1 });
  }
  if (pledged >= price && t.act && !t.addPledge) {
    const o = optionOf(g, t);
    const r = g.withPrepaid(pledged, () => t.act!(o));
    if (r.ok) {
      delete s.pledges[t.id];
      delete it.pledgeX[t.id];
      if (r.left > 0) toPurse(g, r.left, t.x);
      // the action is done: the pour ends (press S again to go on with the next level)
      it.pour = false;
      g.emit({ type: 'pledgeDone', x: t.x, target: t.id });
    }
  }
}
