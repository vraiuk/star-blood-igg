import {
  ABILITIES, ABILITY_STAGE_SCALING, CHORD, AFFIXES, ARMOR_FLOOR, ATTR_MAX, BROOD, ELITE, JUMP, RINGS, TUNNEL_SURFACE, TUNNELS, treeScale, attrCost, DAY, ECONOMY, ENEMIES, KEEPER, KEEPER_RANKS, RESTUN_FACTOR,
  SLOT_MARGIN, SLOTS, crownPos, ringsForCrownSlot, WORLD, WORM_LIGHT_MULT, FOG,
  type AbilityId, type AttrId, type EnemyKind, type SlotDef,
} from '../data/balance';
import { PATHS } from '../data/meta';
import { type ModPatch, type Mods, combine } from '../data/mods';
import { ASCEND, BASE_TIERS, MAX_TIER, MERGE, NESTS, SELL_REFUND, type Family, type NestStats, type Price, type SpecId } from '../data/nests';

/** Families that live in the Tree's crown (the crown also accepts a firefly hive). */
const CROWN_FAMILIES = new Set<Family>(['caterpillar', 'honeycomb', 'mender']);
import { ENDLESS, nightDef, type NightDef } from '../data/nights';
import {
  APOTHEOSIS_RANK, BASE_SLOTS, BOONS, DEV_SLOTS, EXTRA_SLOT_PRICE, FACETS, FACET_RANKS, RUNE_RANKS, removeCost, FORM_RANK, MAX_SLOTS, PROPERTIES, runeRankArea, runeRankCd, runeRankCost, runeRankLight,
  runeRankPower, boonById, maxRankForNight, propertyById,
  type FormId, type KeeperRuneId, type PropertyDef,
} from '../data/runes';
import { PATH_CAPSTONE, TREE, TREE_BRANCHES, TREE_PATHS, TREE_STAGES, branchById, pathCounts, type TreePath } from '../data/tree';
import { mulberry32 } from './rng';
import type { Drop, DropKind, Enemy, GameEvent, GameState, PendingSpawn, Projectile, Soldier, Structure, Tunnel } from './types';

/** Big underground Imago that toughen faster in endless nights. */
const HEAVY = new Set<EnemyKind>(['worm', 'guard']);
/** Underground creatures that dig Лазы for the others. */
/** Dragonflies are hunters of the air. */
const DRAGONFLY_VS_AIR = 1.6;
/** Weavers vs surface creatures: damage share, cooldown factor, share with the capstone. */
const SPIDER_SURFACE = { damage: 0.35, rate: 1.3, capstone: 0.7 } as const;
/** Dragonfly sorties: drones per nest (+tier, +merge), reach × light radius, sting dps per drone × burn. */
const STING = { drones: 2, reach: 2.6, share: 0.22 } as const;
/** Igg-Beam hive: beam life, damage tick, total damage vs one shot. */
const HIVE_BEAM = { time: 1.6, tick: 0.1, total: 1.0 } as const;
/** Families whose reach grows with the Circle (not hives — their beams are long enough). */
const REACH_FAMILIES = new Set<Family>(['dragonfly', 'beetle', 'termite', 'mender']);
/** Run statistics: who owns a projectile's damage. */
const PROJ_SRC: Record<string, string> = { arrow: 'hive', spark: 'tree', spear: 'spear', meteor: 'starfall', wave: 'hammer', acid: 'other', beam: 'hive' };
const DIGGERS = new Set<EnemyKind>(['worm', 'guard', 'tunneler']);

/** Seconds after the last spawn before dawn burns remaining creatures. */
export const NIGHT_GRACE = 60;


/** Piercing Beam channel time (seconds) and damage tick. */
export const BEAM_CHANNEL = 1.6;
/** Piercing Beam damage share by distance from the Ascended. */
export const beamFalloff = (d: number) => Math.max(0.25, 1 - Math.max(0, d - 120) / 500);
/** the sustained beam drains this many × the spear's Light cost per second */
const BEAM_DRAIN = 1.6;
const BEAM_TICK = 0.2;

/** Fixed simulation step in seconds. */
export const STEP = 1 / 60;

export interface GameOptions {
  seed?: number;
  /** override night definitions (tests); defaults to campaign + endless generator */
  nights?: NightDef[];
  /** mod patches from bought meta-tree nodes */
  meta?: ModPatch[];
  /** meta capstone «Дар Тинга»: start with a rune choice */
  startRune?: boolean;
  /** difficulty path index (0..2) */
  path?: number;
}

export type Target =
  | { kind: 'structure'; s: Structure; x: number }
  | { kind: 'soldier'; u: Soldier; x: number }
  | { kind: 'keeper'; x: number }
  | { kind: 'tree'; x: number };

/**
 * Deterministic simulation of one level. No DOM: rendering, UI and audio read
 * `state` and drain `state.events` every frame. All commands validate and emit
 * `denied` events with a reason the UI can show.
 */
export class Game {
  readonly state: GameState;
  private customNights?: NightDef[];
  /** stars earned at the night-10 milestone (0 if not reached) */
  milestoneStars = 0;
  readonly path: number;
  mods: Mods;
  private rand: () => number;
  private metaMods: ModPatch[];
  /** beetles to revive at dawn (meta capstone) */
  private graveyard: Array<{ slotId: string; tier: number; spec: SpecId | null }> = [];

  constructor(opts: GameOptions = {}) {
    this.rand = mulberry32(opts.seed ?? 1337);
    this.customNights = opts.nights;
    this.path = opts.path ?? 0;
    this.metaMods = opts.meta ?? [];
    this.mods = combine(this.metaMods);
    const st0 = TREE_STAGES[0];
    this.state = {
      phase: 'day', night: 0, phaseTime: 0, dayLeft: DAY.firstLength,
      amber: ECONOMY.startAmber + this.mods.startAmber, star: this.mods.startStar, devRunes: 0, wrath: 1, rushedDawns: 0,
      enemies: [], structures: [], projectiles: [], drops: [], workers: [], soldiers: [], tempLights: [], burns: [], tunnels: [],
      keeper: {
        x: WORLD.treeX - 28, dir: 1, hp: KEEPER.hp, alive: true, respawn: 0, light: KEEPER.startLight, move: 0,
        cooldowns: { spear: 0, hammer: 0, starfall: 0, radiance: 0, swarm: 0, timestop: 0 },
        cdMax: { spear: 1, hammer: 1, starfall: 1, radiance: 1, swarm: 1, timestop: 1 }, charge: 0, rank: 0,
        timeStopT: 0, timeStopMax: 0, timeStopNights: 0, chord: 0, chordT: 0, lastCast: null, heat: 0, heatT: 0,
        leapT: 0, leapDur: 0, leapFrom: 0, leapTo: 0, leapMult: 1, echo: 0, coldT: 0,
        radianceT: 0, swarmT: 0, swarmX: 0, channel: 0, channelDir: 1, channelDps: 0,
        props: { spear: [], hammer: [], starfall: [], radiance: [], swarm: [], timestop: [], light: [] },
        slots: { spear: BASE_SLOTS, hammer: BASE_SLOTS, starfall: BASE_SLOTS, radiance: BASE_SLOTS, swarm: BASE_SLOTS, timestop: BASE_SLOTS, light: BASE_SLOTS }, boons: [],
        attrs: { might: 0, spirit: 0, body: 0 },
        runeRank: { spear: 0, hammer: 0, starfall: 0, radiance: 0, swarm: 0, timestop: 0, light: 0 },
        forms: { spear: null, hammer: null, starfall: null },
        facets: [],
        learned: { spear: true, hammer: false, starfall: false, radiance: false, swarm: false, timestop: false },
        castAnim: 9, hitFlash: 0, walkT: 0, rhythm: 0, rhythmT: 0, freeCast: 0, lastLightCd: 0,
      },
      tree: {
        stage: 0, growth: 0, hp: st0.maxHp, radius: st0.radius, sparkCd: 0, hitFlash: 0,
        branches: [], shield: 0, shieldUsed: false, secondWindUsed: false, rings: 0,
      },
      pending: [], choices: [], events: [],
      stats: { kills: 0, amberCollected: 0, starCollected: 0, amberToTree: 0, time: 0, dmg: {}, casts: {}, killsBy: {}, treeDmgBy: {}, keeperDeaths: 0, rushes: 0, nights: [] },
      nextId: 1, time: 0,
    };
    this.recalc();
    this.state.tree.hp = this.treeMaxHp();
    this.state.keeper.hp = this.keeperMaxHp();
    if (opts.startRune) this.offerDawn(true);
  }

  // ───────────────────────────── derived stats ─────────────────────────

  get stageDef() { return TREE_STAGES[this.state.tree.stage]; }
  treeMaxHp() { return Math.round(this.stageDef.maxHp * (1 + this.mods.treeHp) * (1 + RINGS.hp * this.state.tree.rings)); }
  /** Nest / spark power: stage power × growth rings. */
  treePower() { return this.stageDef.power * (1 + RINGS.power * this.state.tree.rings); }
  treeRadius() {
    const flare = this.state?.keeper?.radianceT > 0
      ? ABILITIES.radiance.radius * this.runeArea('radiance') + (this.propCount('radiance', 'rd-wide') ? 0.15 : 0) + (this.state.keeper.facets.includes('rd-sun') ? 0.1 : 0) : 0;
    return this.stageDef.radius * (1 + this.mods.lightRadius + flare);
  }
  keeperMaxHp() { return Math.round((KEEPER_RANKS[this.state.keeper.rank].hp + this.mods.keeperHp) * (1 + 0.1 * this.state.keeper.attrs.body)); }
  maxLight() { return KEEPER_RANKS[this.state.keeper.rank].maxLight + this.mods.lightMax + 6 * this.state.keeper.attrs.spirit + (this.facet('lt-deep') ? 50 : 0); }
  /** Share of incoming damage the Ascended shrugs off. */
  keeperGuard() { return Math.min(0.8, KEEPER_RANKS[this.state.keeper.rank].guard + 0.04 * this.state.keeper.attrs.body); }
  /** Radiance dps burning creatures that touch the Ascended. */
  keeperAura() {
    return KEEPER_RANKS[this.state.keeper.rank].aura * (1 + 0.15 * this.state.keeper.attrs.body) * (1 + 0.1 * this.state.tree.stage);
  }
  /** Installed properties of a keeper rune. */
  runeProps(rune: KeeperRuneId): PropertyDef[] {
    return this.state.keeper.props[rune].map((id) => propertyById(id)!).filter(Boolean);
  }
  freeSlots(rune: KeeperRuneId) { return this.state.keeper.slots[rune] - this.state.keeper.props[rune].length; }
  /** Can this property be installed (slot free, stack limit)? */
  canInstall(p: PropertyDef): boolean {
    const k = this.state.keeper;
    return this.freeSlots(p.rune) > 0 && k.props[p.rune].filter((x) => x === p.id).length < p.stack && p.rank <= k.runeRank[p.rune];
  }

  /** Pull a Property out of a rune slot for Star Blood. */
  removeProperty(rune: KeeperRuneId, index: number): boolean {
    const k = this.state.keeper;
    const id = k.props[rune][index];
    const p = id ? propertyById(id) : undefined;
    if (!p) return false;
    const cost = removeCost(p);
    if (this.state.star < cost) return this.deny('Нужна Звёздная Кровь');
    this.state.star -= cost;
    k.props[rune].splice(index, 1);
    this.recalc();
    this.emit({ type: 'rune', id: `remove:${p.id}` });
    return true;
  }

  /** Rebuild aggregated mods from meta, tree branches and runes. */
  private recalc() {
    const s = this.state;
    const patches: ModPatch[] = [...this.metaMods];
    for (const id of s.tree.branches) { const b = branchById(id); if (b) patches.push(b.mods); }
    const counts = pathCounts(s.tree.branches);
    for (const p of Object.keys(counts) as TreePath[]) if (counts[p] >= PATH_CAPSTONE) patches.push(TREE_PATHS[p].mods);
    const k = s.keeper;
    for (const rune of Object.keys(k.props) as KeeperRuneId[]) for (const p of this.runeProps(rune)) patches.push(p.mods);
    for (const id of k.boons) { const b = boonById(id); if (b) patches.push(b.mods); }
    this.mods = combine(patches);
  }

  /** Effective stats of a nest including specialization, stage power and mods. */
  nestStats(st: Pick<Structure, 'family' | 'tier' | 'spec'> & Partial<Pick<Structure, 'merge' | 'ascend'>>): NestStats {
    const fam = NESTS[st.family];
    const base = st.tier < BASE_TIERS ? fam.levels[st.tier] : fam.specs[st.spec!].levels[st.tier - BASE_TIERS];
    const m = this.mods;
    const merge = st.merge ?? 0, asc = st.ascend ?? 0;
    const boost = (1 + MERGE.power * merge) * (1 + ASCEND.power * asc);
    const dmg = (1 + m.famDamage[st.family]) * this.treePower() * boost;
    const rng = (1 + m.famRange[st.family]) * (1 + MERGE.range * merge) * (REACH_FAMILIES.has(st.family) ? this.stageDef.reach : 1);
    const hpBoost = (1 + MERGE.hp * merge) * (1 + ASCEND.power * asc);
    return {
      ...base,
      hp: Math.round(base.hp * (1 + m.famHp[st.family]) * hpBoost),
      heal: base.heal !== undefined ? base.heal * boost : undefined,
      healTree: base.healTree !== undefined ? base.healTree * boost : undefined,
      income: base.income !== undefined ? base.income * boost : undefined,
      starIncome: base.starIncome !== undefined ? base.starIncome * boost : undefined,
      soldierHp: base.soldierHp !== undefined ? Math.round(base.soldierHp * hpBoost) : undefined,
      soldiers: base.soldiers !== undefined ? base.soldiers + merge : undefined,
      workers: base.workers !== undefined ? base.workers + merge : undefined,
      carry: base.carry !== undefined ? base.carry + merge * 2 : undefined,
      damage: base.damage * dmg,
      burn: base.burn !== undefined ? base.burn * dmg : undefined,
      poison: base.poison !== undefined ? base.poison * dmg : undefined,
      thorns: base.thorns !== undefined ? base.thorns * dmg : undefined,
      range: base.range * rng,
      light: base.light !== undefined ? base.light * rng : undefined,
    };
  }

  private scalePrice(p: Price): Price {
    return { amber: Math.round(p.amber * Math.max(0.5, 1 + this.mods.nestCost)), star: p.star };
  }

  buildPrice(family: Family): Price { return this.scalePrice(NESTS[family].costs[0]); }

  /** Price of the next linear upgrade (tiers 1–2 and spec mastery), or null. */
  upgradePrice(st: Structure): Price | null {
    const fam = NESTS[st.family];
    if (st.tier < BASE_TIERS - 1) return this.scalePrice(fam.costs[st.tier + 1]);
    if (st.tier === BASE_TIERS && st.spec) return this.scalePrice(fam.specs[st.spec].costs[1]);
    return null;
  }

  specPrice(st: Structure, spec: SpecId): Price { return this.scalePrice(NESTS[st.family].specs[spec].costs[0]); }

  canPay(p: Price) { return this.state.amber >= p.amber && this.state.star >= p.star; }

  abilityCost(id: AbilityId) {
    const own = id === 'spear' ? this.mods.spearCost : id === 'hammer' ? this.mods.hammerCost
      : id === 'radiance' && this.propCount('radiance', 'rd-cheap') ? -0.35
      : id === 'swarm' && this.propCount('swarm', 'sw-cheap') ? -0.35
      : id === 'timestop' ? -0.35 * this.propCount('timestop', 'ts-cheap') : 0;
    const facet = id === 'spear' && this.state?.keeper?.facets.includes('sp-swift') ? -0.25 : 0;
    const k = this.state?.keeper;
    const rank = k ? runeRankLight(k.runeRank[id]) : 1;
    const chord = k && k.chordT > 0 ? 1 - CHORD.discount * k.chord : 1;
    const heat = k && id === 'spear' && k.heatT > 0 ? 1 + Math.min(CHORD.heatMax, CHORD.heat * Math.max(0, k.heat + 2 - CHORD.heatFree)) : 1;
    return Math.round(ABILITIES[id].cost * Math.max(0.3, 1 + this.mods.abilityCost + own + facet) * rank * chord * heat);
  }

  /** The Keeper knows this rune and can cast it. */
  abilityUnlocked(id: AbilityId) { return this.state.keeper.learned[id]; }
  /** The tree is grown enough for the rune to be learned. */
  abilityAvailable(id: AbilityId) { return this.state.tree.stage + 1 >= ABILITIES[id].unlockStage; }

  /** Learn a rune for Star Blood (or for free as the Observer's gift). */
  learnAbility(id: AbilityId, gift = false): boolean {
    const s = this.state;
    if (s.keeper.learned[id]) return false;
    if (!gift && !this.abilityAvailable(id)) return this.deny(`Руна откроется на стадии Древа ${ABILITIES[id].unlockStage}`);
    if (!gift && s.star < ABILITIES[id].learn) return this.deny('Нужна Звёздная Кровь — её роняют Черви');
    if (!gift) s.star -= ABILITIES[id].learn;
    s.keeper.learned[id] = true;
    this.emit({ type: 'rune', id: `learn:${id}` });
    return true;
  }

  /** Damage multiplier of an ability: tree stage, keeper rank, generic and rune-specific bonuses. */
  abilityMult(id: AbilityId = 'spear') {
    const own = id === 'spear' ? this.mods.spearDamage : id === 'hammer' ? this.mods.hammerDamage : id === 'starfall' ? this.mods.starfallDamage : 0;
    return (1 + ABILITY_STAGE_SCALING * this.state.tree.stage + this.mods.abilityDamage + own)
      * KEEPER_RANKS[this.state.keeper.rank].power * (1 + 0.08 * this.state.keeper.attrs.might)
      * runeRankPower(this.state.keeper.runeRank[id])
      * (this.state.keeper.chordT > 0 ? 1 + CHORD.power * this.state.keeper.chord : 1)
      * (this.facet('lt-over') && this.state.keeper.light >= this.maxLight() * 0.95 ? 1.25 : 1);
  }

  /** Keeper Light regen factor by distance from the trunk: ×1.8 at the trunk → ×0.3 at the Circle edge. */
  lightRegenFactor(x = this.state.keeper.x): number {
    const d = Math.abs(x - WORLD.treeX) / Math.max(1, this.state.tree.radius);
    const near = KEEPER.regenNear * (1 + this.mods.nearRegen * Math.max(0, 1 - d * 2));
    return Math.max(KEEPER.regenFar, near - (near - KEEPER.regenFar) * Math.min(1, d));
  }

  /** Is a point lit? Surface uses the tree radius, dragonflies and temporary lights. */
  isLit(x: number, underground: boolean): boolean {
    const s = this.state;
    if (underground) {
      if (Math.abs(x - WORLD.treeX) <= s.tree.radius * TREE.rootLightFactor) return true;
      for (const st of s.structures) {
        if (!st.underground) continue;
        const light = this.nestStats(st).light;
        if (light && Math.abs(x - st.x) <= light) return true;
      }
      return false;
    }
    if (Math.abs(x - WORLD.treeX) <= s.tree.radius) return true;
    for (const st of s.structures) {
      if (st.family !== 'dragonfly') continue;
      if (Math.abs(x - st.x) <= this.nestStats(st).light!) return true;
    }
    for (const t of s.tempLights) if (Math.abs(x - t.x) <= t.radius) return true;
    return false;
  }

  slotUnlocked(slot: SlotDef): boolean {
    const r = this.treeRadius();
    if (slot.crown) {
      return this.state.tree.stage + 1 >= (slot.unlockStage ?? 1) && this.state.tree.rings >= ringsForCrownSlot(Number(slot.id.slice(1)));
    }
    if (slot.underground) return this.state.tree.stage + 1 >= (slot.unlockStage ?? 1);
    return slot.offset <= r - SLOT_MARGIN;
  }
  structureAt(slotId: string): Structure | undefined { return this.state.structures.find((s) => s.slotId === slotId); }

  /** Amber still needed for the next stage (0 at max stage). */
  growNeed(): number {
    const def = this.stageDef;
    return def.growCost === 0 ? 0 : def.growCost - this.state.tree.growth;
  }

  get over(): boolean { return this.state.phase === 'lost'; }

  /** Night definition by index (campaign, then endless generator). */
  night(n: number): NightDef {
    if (this.customNights) return this.customNights[Math.min(n, this.customNights.length - 1)];
    return nightDef(n);
  }

  /** Number of hand-made campaign nights (the milestone). */
  get campaignNights() { return this.customNights?.length ?? ENDLESS.campaignNights; }
  get choice() { return this.state.choices[0] ?? null; }

  /** Stars earned at the campaign milestone (night 10). */
  stars(): number { return this.milestoneStars; }

  private computeStars(): number {
    const s = this.state;
    let n = 1;
    if (s.tree.stage >= 4) n++;
    if (s.tree.stage >= 5 && s.tree.hp > this.treeMaxHp() * 0.5) n++;
    return n;
  }

  // ───────────────────────────── commands ────────────────────────────

  setMove(dir: -1 | 0 | 1) { this.state.keeper.move = dir; }
  /** The sustained beam goes out: now its cooldown starts. */
  private endChannel() {
    const k = this.state.keeper;
    k.channel = 0;
    const cd = this.abilityCooldown('spear');
    k.cooldowns.spear = cd;
    k.cdMax.spear = cd;
  }

  /** Is the Ascended channelling the Piercing Beam (rooted in place)? */
  channelling() { return this.state.keeper.channel > 0; }
  /** Turn the Ascended without moving (the spear flies where he faces). */
  face(dir: -1 | 1) { this.state.keeper.dir = dir; }

  build(slotId: string, family: Family): boolean {
    const s = this.state;
    if (this.over) return false;
    const slot = SLOTS.find((sl) => sl.id === slotId);
    if (!slot || !this.slotUnlocked(slot) || this.structureAt(slotId)) return this.deny('Руна недоступна');
    const def = NESTS[family];
    if (def.underground !== slot.underground) return this.deny('Не тот слой');
    if (!!slot.crown !== CROWN_FAMILIES.has(family) && !(slot.crown && family === 'hive')) return this.deny(slot.crown ? 'В крону — только утилитарные гнёзда' : 'Это гнездо живёт в кроне Древа');
    const price = this.buildPrice(family);
    if (!this.canPay(price)) return this.deny('Не хватает Янтаря');
    this.pay(price);
    const st: Structure = {
      id: s.nextId++, family, slotId, x: slot.x, y: slot.y, underground: slot.underground, crown: !!slot.crown, tier: 0, spec: null,
      hp: 0, maxHp: 0, cd: 0.4, spentAmber: price.amber, spentStar: price.star, hitFlash: 0, age: 0,
      aim: slot.x < WORLD.treeX ? -1 : 1, haste: 0, intercept: 0, merge: 0, ascend: 0,
    };
    if (st.crown) {
      const p = crownPos(s.tree.stage, Number(slotId.slice(1)), s.tree.rings);
      st.x = p.x; st.y = p.y;
    }
    st.maxHp = st.hp = this.nestStats(st).hp;
    s.structures.push(st);
    this.emit({ type: 'built', family, x: st.x, y: st.y, underground: slot.underground, tier: 0 });
    return true;
  }

  upgrade(structureId: number): boolean {
    const st = this.state.structures.find((x) => x.id === structureId);
    if (!st || this.over) return false;
    if (st.tier === BASE_TIERS - 1) return this.deny('Выбери специализацию');
    const price = this.upgradePrice(st);
    if (!price) return this.deny('Максимальный уровень');
    if (!this.canPay(price)) return this.deny(price.star > this.state.star ? 'Нужна Звёздная Кровь — её роняют Черви' : 'Не хватает Янтаря');
    this.pay(price);
    this.setTier(st, st.tier + 1, st.spec, price);
    return true;
  }

  specialize(structureId: number, spec: SpecId): boolean {
    const st = this.state.structures.find((x) => x.id === structureId);
    if (!st || this.over || st.tier !== BASE_TIERS - 1) return false;
    const price = this.specPrice(st, spec);
    if (!this.canPay(price)) return this.deny(price.star > this.state.star ? 'Нужна Звёздная Кровь — её роняют Черви' : 'Не хватает Янтаря');
    this.pay(price);
    this.setTier(st, BASE_TIERS, spec, price);
    return true;
  }

  private setTier(st: Structure, tier: number, spec: SpecId | null, price: Price) {
    st.tier = tier;
    st.spec = spec;
    st.spentAmber += price.amber;
    st.spentStar += price.star;
    const hp = this.nestStats(st).hp;
    st.hp += hp - st.maxHp;
    st.maxHp = hp;
    this.emit({ type: 'built', family: st.family, x: st.x, y: st.y, underground: st.underground, tier });
  }

  /** Two other nests of the same family and merge rank (lowest level first), or null. */
  mergePartners(st: Structure): Structure[] | null {
    const others = this.state.structures
      .filter((o) => o !== st && o.family === st.family && o.merge === st.merge && o.crown === st.crown)
      .sort((a, b) => a.tier - b.tier || a.ascend - b.ascend);
    return others.length >= 2 ? others.slice(0, 2) : null;
  }

  /** «Слияние»: fuse two same nests into this one — frees two slots, adds a merge star. */
  mergeNests(structureId: number): boolean {
    const s = this.state;
    const st = s.structures.find((x) => x.id === structureId);
    if (!st || this.over) return false;
    const partners = this.mergePartners(st);
    if (!partners) return this.deny('Нужно ещё 2 таких же гнезда того же ранга слияния');
    s.structures = s.structures.filter((x) => !partners.includes(x));
    st.merge++;
    st.spentAmber += partners.reduce((a, p) => a + p.spentAmber, 0);
    st.spentStar += partners.reduce((a, p) => a + p.spentStar, 0);
    const hp = this.nestStats(st).hp;
    st.maxHp = hp;
    st.hp = hp;
    this.emit({ type: 'merge', x: st.x, y: st.underground || st.crown ? st.y : WORLD.groundY - 14, from: partners.map((p) => [p.x, p.underground || p.crown ? p.y : WORLD.groundY - 10]) });
    return true;
  }

  /** «Возвышение»: endless levels after mastery, exponentially priced in Amber. */
  ascendCost(st: Structure) { return ASCEND.cost(st.ascend); }
  ascendNest(structureId: number): boolean {
    const s = this.state;
    const st = s.structures.find((x) => x.id === structureId);
    if (!st || this.over) return false;
    if (st.tier < MAX_TIER - 1) return this.deny('Сначала мастерство специализации');
    const c = this.ascendCost(st);
    if (s.amber < c) return this.deny('Не хватает Янтаря');
    s.amber -= c;
    st.spentAmber += c;
    st.ascend++;
    const hp = this.nestStats(st).hp;
    st.hp += hp - st.maxHp;
    st.maxHp = hp;
    this.emit({ type: 'built', family: st.family, x: st.x, y: st.y, underground: st.underground, tier: st.tier });
    return true;
  }

  sellValue(st: Structure): Price {
    return { amber: Math.floor(st.spentAmber * SELL_REFUND), star: Math.floor(st.spentStar * SELL_REFUND) };
  }

  sell(structureId: number): boolean {
    const s = this.state;
    const i = s.structures.findIndex((x) => x.id === structureId);
    if (i < 0 || this.over) return false;
    const st = s.structures[i];
    const v = this.sellValue(st);
    s.amber += v.amber;
    s.star += v.star;
    s.structures.splice(i, 1);
    this.emit({ type: 'sold', x: st.x });
    return true;
  }

  /** Invest Amber into the tree. Returns the amount actually invested. */
  feed(amount: number): number {
    const s = this.state;
    if (this.over) return 0;
    const need = this.growNeed();
    const give = Math.max(0, Math.min(Math.floor(amount), need, s.amber));
    if (give <= 0) {
      this.deny(need === 0 ? 'Древо уже Золотое' : 'Не хватает Янтаря');
      return 0;
    }
    s.amber -= give;
    s.tree.growth += give;
    s.stats.amberToTree += give;
    if (s.tree.growth >= this.stageDef.growCost) this.grow();
    return give;
  }

  /** Observer's quest reward (onboarding). */
  grantReward(amber: number, star = 0) {
    this.state.amber += amber;
    this.state.star += star;
    if (amber) this.emit({ type: 'pickup', kind: 'amber', x: this.state.keeper.x, y: WORLD.groundY - 20, value: amber });
  }

  /** Amber price of an immediate resurrection by the Tree. */
  reviveCost() { return 60 + 25 * this.state.night; }

  /** Rune that would lose a rank on a sacrifice (highest rank first), or a property to lose. */
  sacrificeTarget(): { rune: KeeperRuneId; kind: 'rank' | 'prop' } | null {
    const k = this.state.keeper;
    const ids: KeeperRuneId[] = ['spear', 'hammer', 'starfall', 'light'];
    const ranked = ids.filter((r) => k.runeRank[r] > 0).sort((a, b) => k.runeRank[b] - k.runeRank[a])[0];
    if (ranked) return { rune: ranked, kind: 'rank' };
    const withProp = ids.find((r) => k.props[r].length > 0);
    return withProp ? { rune: withProp, kind: 'prop' } : null;
  }

  /** Resurrect the fallen Ascended now: pay Amber to the Tree, or sacrifice a rune rank/property. */
  revive(mode: 'amber' | 'sacrifice'): boolean {
    const s = this.state;
    const k = s.keeper;
    if (k.alive) return false;
    if (mode === 'amber') {
      const c = this.reviveCost();
      if (s.amber < c) return this.deny('Не хватает Янтаря на воскрешение');
      s.amber -= c;
    } else {
      const t = this.sacrificeTarget();
      if (!t) return this.deny('Нечего отдать Вечности');
      if (t.kind === 'rank') {
        k.runeRank[t.rune]--;
        const fr = t.rune;
        if ((fr === 'spear' || fr === 'hammer' || fr === 'starfall') && k.runeRank[fr] < FORM_RANK) k.forms[fr] = null;
      } else {
        k.props[t.rune].pop();
      }
      this.recalc();
    }
    k.respawn = 0;
    return true;
  }

  /** Growth ring after the Great Igg-Tree (endless Amber sink). */
  ringCost() { return RINGS.cost(this.state.tree.rings); }
  addRing(): boolean {
    const s = this.state;
    if (this.growNeed() > 0) return this.deny('Сначала вырасти Великое Игг-Древо');
    const c = this.ringCost();
    if (s.amber < c) return this.deny('Не хватает Янтаря');
    s.amber -= c;
    s.tree.rings++;
    s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + this.treeMaxHp() * 0.2);
    this.refreshNestHp();
    this.emit({ type: 'treeGrew', stage: s.tree.stage });
    return true;
  }

  /** Raise an Ascended attribute with Star Blood or a Lesser Rune of Development. */
  raiseAttr(id: AttrId, useDevRune = false): boolean {
    const s = this.state;
    const lv = s.keeper.attrs[id];
    if (lv >= ATTR_MAX) return this.deny('Атрибут развит до предела 10/10');
    if (useDevRune) {
      if (s.devRunes <= 0) return this.deny('Нет Малой Руны Развития');
      s.devRunes--;
    } else {
      if (s.star < attrCost(lv)) return this.deny('Нужна Звёздная Кровь');
      s.star -= attrCost(lv);
    }
    s.keeper.attrs[id]++;
    if (id === 'body') s.keeper.hp = Math.min(this.keeperMaxHp(), s.keeper.hp + this.keeperMaxHp() * 0.1);
    this.emit({ type: 'rankUp', rank: s.keeper.rank });
    return true;
  }

  /** Keeper Ascension: spend Star Blood for the next rank. */
  ascend(): boolean {
    const k = this.state.keeper;
    const next = KEEPER_RANKS[k.rank + 1];
    if (!next) return this.deny('Высший ранг');
    if (this.state.star < next.cost) return this.deny('Нужна Звёздная Кровь — её роняют Черви');
    this.state.star -= next.cost;
    k.rank++;
    k.hp = this.keeperMaxHp();
    this.emit({ type: 'rankUp', rank: k.rank });
    return true;
  }

  /** Resolve the current dawn offer or tree branch choice. */
  choose(index: number): boolean {
    const s = this.state;
    const c = this.choice;
    if (!c) return false;
    if (c.kind === 'facet') {
      const id = c.offers[index];
      if (!id) return false;
      s.keeper.facets.push(id);
      this.emit({ type: 'rune', id: `facet:${id}` });
      s.choices.shift();
      return true;
    }
    if (c.kind === 'branch') {
      const b = TREE_BRANCHES[c.stage]?.[index];
      if (!b) return false;
      s.tree.branches.push(b.id);
    } else {
      const id = c.offers[index];
      if (!id) return false;
      const prop = propertyById(id);
      if (prop) {
        if (this.canInstall(prop)) s.keeper.props[prop.rune].push(prop.id);
        else s.star += prop.price; // no room: the Observer refunds its value
      } else {
        const b = boonById(id);
        if (!b) return false;
        if (b.learn) this.learnAbility(b.learn, true);
        else if (b.kind === 'gift' && (b.amber || b.star || b.devRune)) {
          s.amber += b.amber ?? 0;
          s.star += b.star ?? 0;
          s.devRunes += b.devRune ?? 0;
        } else {
          s.keeper.boons.push(b.id);
        }
      }
      this.emit({ type: 'rune', id });
    }
    s.choices.shift();
    this.recalc();
    this.refreshNestHp();
    return true;
  }

  /** The Observer's treasury: buy a Property for Star Blood and install it into a rune slot. */
  buyProperty(id: string): boolean {
    const p = propertyById(id);
    if (!p || this.over) return false;
    if (!this.canInstall(p)) {
      const k = this.state.keeper;
      return this.deny(p.rank > k.runeRank[p.rune] ? `Свойство ранга «${RUNE_RANKS[p.rank]}» не встанет в руну ранга «${RUNE_RANKS[Math.min(4, k.runeRank[p.rune])]}» — повысь руну`
        : this.freeSlots(p.rune) <= 0 ? 'Нет свободных слотов в руне' : 'Больше этого Свойства не вставить');
    }
    if (this.state.star < p.price) return this.deny('Нужна Звёздная Кровь — её роняют Черви');
    this.state.star -= p.price;
    this.state.keeper.props[p.rune].push(p.id);
    this.recalc();
    this.emit({ type: 'rune', id: p.id });
    return true;
  }

  /** Price of the 5th/6th rune slot (or null when the next slot is opened by a development rune / none left). */
  slotPrice(rune: KeeperRuneId): Price | null {
    const n = this.state.keeper.slots[rune];
    return n >= DEV_SLOTS && n < MAX_SLOTS ? EXTRA_SLOT_PRICE[n - DEV_SLOTS] : null;
  }

  /** Forge a 5th or 6th slot into a rune for a lot of Amber and Star Blood. */
  buyRuneSlot(rune: KeeperRuneId): boolean {
    const p = this.slotPrice(rune);
    if (!p) return this.deny(this.state.keeper.slots[rune] < DEV_SLOTS ? 'Сначала 4-й слот — Малой Руной Развития' : 'В руне уже 6 слотов');
    if (!this.canPay(p)) return this.deny('Нужно больше Янтаря и Звёздной Крови');
    this.pay(p);
    this.state.keeper.slots[rune]++;
    this.emit({ type: 'rankUp', rank: this.state.keeper.rank });
    return true;
  }

  /** Apply a Lesser Rune of Development: opens the 4th slot of a keeper rune. */
  developRune(rune: KeeperRuneId): boolean {
    const k = this.state.keeper;
    if (this.state.devRunes <= 0) return this.deny('Нет Малой Руны Развития');
    if (k.slots[rune] >= DEV_SLOTS) return this.deny('4-й слот уже открыт — 5-й и 6-й куются за Янтарь и Кровь');
    this.state.devRunes--;
    k.slots[rune]++;
    this.emit({ type: 'rankUp', rank: k.rank });
    return true;
  }

  /** «Натиск» is possible: every creature of this night is out and the next night isn't the last one. */
  canRush(): boolean {
    const s = this.state;
    return s.phase === 'night' && s.pending.length === 0 && s.enemies.length > 0 && s.choices.length === 0;
  }

  /** What «Натиск» pays right now. */
  rushReward(): { amber: number; star: number } {
    const s = this.state;
    const gift = (ECONOMY.dawnBase + ECONOMY.dawnPerNight * (s.night + 1)) * (1 + this.mods.dawnGift);
    return {
      amber: Math.round(gift * ECONOMY.rushGiftShare + s.enemies.length * ECONOMY.rushPerEnemy * ENDLESS.bounty(s.night)),
      star: ECONOMY.rushStar + Math.floor(s.night / 5),
    };
  }

  /**
   * «Натиск»: the next night starts on top of this one. Its dawn (gift, roulette, beetle
   * revival) is postponed to the next real dawn; the risk is paid up front.
   */
  private rushNight(): boolean {
    const s = this.state;
    if (!this.canRush()) return this.deny('Натиск — когда все твари этой ночи уже вышли');
    const r = this.rushReward();
    s.amber += r.amber;
    s.star += r.star;
    this.snapNight(true);
    s.stats.rushes++;
    this.adaptWrath(s.night);
    s.night++;
    s.rushedDawns++;
    if (s.night === this.campaignNights) {
      this.milestoneStars = this.computeStars();
      this.emit({ type: 'milestone', stars: this.milestoneStars });
    }
    this.emit({ type: 'rush', night: s.night, amber: r.amber, star: r.star });
    this.queueNight(s.phaseTime);
    return true;
  }

  /** Ends the day early (bonus per remaining second), or at night calls «Натиск». */
  callNight(): boolean {
    const s = this.state;
    if (s.phase === 'night') return this.rushNight();
    if (s.phase !== 'day') return false;
    if (s.choices.length) return this.deny('Сначала сделай выбор');
    s.amber += Math.floor(s.dayLeft) * ECONOMY.earlyCallPerSecond;
    this.startNight();
    return true;
  }

  cast(id: AbilityId, tx: number, _ty = 0): boolean {
    const s = this.state;
    const k = s.keeper;
    if (this.over || !k.alive) return false;
    if (!this.abilityUnlocked(id)) return this.deny(this.abilityAvailable(id) ? `Изучи руну «${ABILITIES[id].name}» в Скрижали [R]` : `Руна откроется на стадии Древа ${ABILITIES[id].unlockStage}`);
    // pressing the spear again lets go of the sustained beam
    if (id === 'spear' && k.channel > 0) { this.endChannel(); return true; }
    if (k.cooldowns[id] > 0) return false;
    if (id === 'timestop' && k.timeStopNights > 0) return this.deny(`Остановка Времени восстановится через ${k.timeStopNights} ноч.`);
    if (id === 'timestop' && s.phase !== 'night') return this.deny('Время останавливают ночью');
    const def = ABILITIES[id];
    const form = id === 'spear' || id === 'hammer' || id === 'starfall' ? k.forms[id] : null;
    if (id === 'starfall') {
      if (k.charge < ABILITIES.starfall.chargeMax) return this.deny('Звездопад ещё не заряжен');
    } else {
      // the piercing beam costs twice the Light
      const cost = this.abilityCost(id) * (id === 'spear' && form === 'B' ? 2 : 1);
      // Эхо Света: every 5th cast costs nothing
      const echoFree = this.facet('lt-echo') && (k.echo + 1) % 5 === 0;
      if (this.facet('lt-echo')) k.echo++;
      if (k.freeCast <= 0 && !echoFree) {
        if (k.light < cost) return this.deny('Мало Света');
        k.light -= cost;
      }
    }
    void def;
    void form;
    const cd = this.abilityCooldown(id);
    s.stats.casts[id] = (s.stats.casts[id] ?? 0) + 1;
    // Созвучие grows when the runes are rotated; Перегрев when the spear is spammed
    if (id === 'spear') { k.heat = k.heatT > 0 ? k.heat + 1 : 0; k.heatT = CHORD.heatWindow; }
    const chordGain = k.lastCast !== null && k.lastCast !== id && k.chordT > 0;
    this.src = id;
    k.cooldowns[id] = cd;
    k.cdMax[id] = cd;
    k.castAnim = 0;
    if (id === 'spear') this.castSpear(tx, this.abilityMult('spear'));
    else if (id === 'hammer') this.leapHammer(tx, this.abilityMult('hammer'));
    else if (id === 'radiance') this.castRadiance();
    else if (id === 'swarm') this.castSwarm();
    else if (id === 'timestop') this.castTimeStop();
    else this.castStarfall(tx, this.abilityMult('starfall'));
    // the stack applies from the next cast on
    if (chordGain) k.chord = Math.min(CHORD.max, k.chord + 1);
    else if (k.chordT <= 0) k.chord = 0;
    k.chordT = CHORD.window;
    k.lastCast = id;
    this.emit({ type: 'cast', ability: id, x: k.x, tx });
    return true;
  }

  /** Cooldown of an ability after rank, form, properties, facets and tree mods. */
  abilityCooldown(id: AbilityId): number {
    const k = this.state.keeper;
    let cd = ABILITIES[id].cooldown * (id === 'hammer' && this.mods.hammerCost < 0 ? 0.75 : 1) * runeRankCd(k.runeRank[id]);
    if ((id === 'radiance' && this.propCount('radiance', 'rd-cheap')) || (id === 'swarm' && this.propCount('swarm', 'sw-cheap'))) cd *= 0.8;
    if (id === 'spear' && k.forms.spear === 'B') cd = Math.max(cd, 6 * runeRankCd(k.runeRank[id]));
    if (id === 'spear' && k.forms.spear === 'A') cd = Math.max(cd, 1.1 * runeRankCd(k.runeRank[id]));
    if (id === 'spear' && this.facet('sp-swift')) cd *= 0.65;
    return cd * Math.max(0.4, 1 + this.mods.abilityCd);
  }

  private propCount(rune: KeeperRuneId, id: string) { return this.state.keeper.props[rune].filter((x) => x === id).length; }

  /** Сияние Игг: the Tree flares up. */
  private castRadiance() {
    const k = this.state.keeper;
    const def = ABILITIES.radiance;
    k.radianceT = def.duration * this.runeArea('radiance') * (1 + 0.5 * this.propCount('radiance', 'rd-long')) * (this.facet('rd-sun') ? 1.5 : 1);
    if (this.facet('rd-burst')) {
      // Вспышка: the flare strikes every creature in the Circle and blinds it
      const s = this.state;
      for (const e of s.enemies) {
        if (e.dead || e.layer === 'under' || !e.lit) continue;
        this.damageEnemy(e, 120 * this.abilityMult('radiance'));
        this.stunEnemy(e, 1);
      }
    }
  }
  radianceActive() { return this.state.keeper.radianceT > 0; }

  /** Остановка Времени: the Circle freezes; the rune recovers over nights. */
  private castTimeStop() {
    const k = this.state.keeper;
    const def = ABILITIES.timestop;
    k.timeStopMax = k.timeStopT = def.duration * this.runeArea('timestop') * (1 + 0.25 * this.propCount('timestop', 'ts-long')) + (this.facet('ts-eternal') ? 3 : 0);
    k.timeStopNights = Math.max(1, def.nights - this.propCount('timestop', 'ts-quick'));
  }
  /** Is this creature held by frozen time? (bosses break free at half time) */
  frozen(e: Enemy) {
    const k = this.state.keeper;
    return k.timeStopT > (ENEMIES[e.kind].boss ? k.timeStopMax * 0.5 : 0);
  }

  /** Зов Роя: nests around the Ascended rally. */
  private castSwarm() {
    const s = this.state;
    const k = s.keeper;
    const def = ABILITIES.swarm;
    k.swarmT = def.duration * this.runeArea('swarm') * (this.propCount('swarm', 'sw-long') ? 1.5 : 1) * (this.facet('sw-long2') ? 1.6 : 1);
    if (this.facet('sw-termite')) {
      for (const u of s.soldiers) if (Math.abs(u.x - k.x) <= this.swarmReach() * 1.2) { u.hp = u.maxHp; u.respawn = 0; }
    }
    k.swarmX = k.x;
    const reach = this.swarmReach();
    for (const st of s.structures) {
      if (st.crown || Math.abs(st.x - k.x) > reach) continue;
      const h = st.maxHp * def.heal * runeRankPower(k.runeRank.swarm) ** 0.5;
      st.hp = Math.min(st.maxHp, st.hp + h);
      this.healFx(st.id, st.x, st.underground ? st.y : WORLD.groundY - 20, 99);
    }
  }
  swarmReach() { return ABILITIES.swarm.reach * this.runeArea('swarm') * (1 + 0.4 * this.propCount('swarm', 'sw-wide')); }

  /** Rune area multiplier (rank). */
  runeArea(rid: KeeperRuneId) { return runeRankArea(this.state.keeper.runeRank[rid]); }
  private apotheosis(rid: KeeperRuneId) { return this.state.keeper.runeRank[rid] >= APOTHEOSIS_RANK; }

  private castSpear(tx: number, mult: number) {
    const s = this.state;
    const k = s.keeper;
    const def = ABILITIES.spear;
    // the spear always flies where the Ascended faces (direction of movement)
    const dir = k.dir;
    void tx;
    const form = k.forms.spear;
    const range = def.range * this.runeArea('spear') * (this.facet('sp-sky') ? 1.4 : 1);
    const airMult = this.facet('sp-sky') ? 1.8 : 1;
    const before = s.projectiles.length;
    if (form === 'B') {
      // Пронзающий луч: the Ascended stands still and holds a beam to the edge of the world
      // for as long as the Light lasts (press again to let go); the cooldown starts after
      k.channel = 0.001;
      k.channelDir = dir;
      k.channelDps = (def.damage * 2.2 * mult) / BEAM_CHANNEL;
      k.move = 0;
      k.cooldowns.spear = 0.25;
      k.cdMax.spear = 0.25;
      return;
    }
    if (form === 'A') {
      // Веер Игг: short fan of spears around the keeper
      const n = this.apotheosis('spear') ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) / ((n - 1) / 2);
        s.projectiles.push({
          id: s.nextId++, kind: 'spear', x: k.x + dir * 4, y: WORLD.groundY - 11 + spread * 6, vx: dir * def.speed * (0.8 + 0.2 * Math.abs(spread)),
          vy: spread * 30, damage: def.damage * 0.8 * mult, targetId: 0, tx: 0, ty: 0, pierce: 2 + this.mods.spearPierce, hit: [],
          life: (150 * this.runeArea('spear')) / def.speed, age: 0, knock: this.apotheosis('spear') ? 140 : 0, airMult,
        });
      }
    } else {
      s.projectiles.push({
        id: s.nextId++, kind: 'spear', x: k.x + dir * 6, y: WORLD.groundY - 11, vx: dir * def.speed, vy: 0,
        damage: def.damage * mult, targetId: 0, tx: 0, ty: 0, pierce: def.pierce + this.mods.spearPierce + (k.runeRank.spear >= 1 ? 1 : 0) + (k.runeRank.spear >= 3 ? 1 : 0), hit: [],
        life: range / def.speed, age: 0, airMult,
      });
    }
    // Обоюдное древко: the same throw flies backwards too
    if (this.facet('sp-twin')) {
      for (const p of s.projectiles.slice(before)) {
        s.projectiles.push({ ...p, id: s.nextId++, x: k.x - (p.x - k.x), vx: -p.vx, damage: p.damage * 0.6, hit: [] });
      }
    }
  }

  /** Прыжок Молота: fly to the target (within reach) and slam on landing. */
  private leapHammer(tx: number, mult: number) {
    const k = this.state.keeper;
    const def = ABILITIES.hammer;
    const reach = def.leap * this.runeArea('hammer');
    const to = Math.max(8, Math.min(WORLD.width - 8, k.x + Math.max(-reach, Math.min(reach, tx - k.x))));
    if (Math.abs(to - k.x) < 12) { this.castHammer(mult); return; }
    k.dir = to > k.x ? 1 : -1;
    k.leapFrom = k.x;
    k.leapTo = to;
    k.leapDur = k.leapT = def.leapTime;
    k.leapMult = mult;
    k.channel = 0;
  }
  /** Is the Ascended mid-leap (for the renderer: 0..1 of the flight, or -1)? */
  leapProgress() { const k = this.state.keeper; return k.leapT > 0 ? 1 - k.leapT / k.leapDur : -1; }

  private castHammer(mult: number, echo = false) {
    const s = this.state;
    const k = s.keeper;
    const def = ABILITIES.hammer;
    const form = k.forms.hammer;
    const area = this.runeArea('hammer');
    if (!echo && this.facet('hm-after')) {
      const x = k.x;
      this.later(0.8, () => {
        const back = k.x;
        k.x = x;
        this.castHammer(mult * 0.5, true);
        k.x = back;
        this.emit({ type: 'cast', ability: 'hammer', x, tx: x });
      });
    }
    if (this.facet('hm-shield')) {
      for (const st of s.structures) {
        if (st.crown || Math.abs(st.x - k.x) > def.radius * area * 1.3) continue;
        st.hp = Math.min(st.maxHp, st.hp + st.maxHp * 0.3);
        this.healFx(st.id, st.x, st.underground ? st.y : WORLD.groundY - 20, 99);
      }
    }
    if (form === 'A') {
      // Сотрясение Тверди: a ground wave running both ways, hits underground too
      const reach = (this.apotheosis('hammer') ? 520 : 260) * area;
      for (const dir of [-1, 1] as const) {
        s.projectiles.push({
          id: s.nextId++, kind: 'wave', x: k.x, y: WORLD.groundY, vx: dir * 330, vy: 0, damage: def.damage * 1.2 * mult,
          targetId: 0, tx: 0, ty: 0, pierce: 999, hit: [], life: reach / 330, age: 0, knock: 90,
          stun: this.apotheosis('hammer') ? 1.4 : 0, deep: true,
        });
      }
      s.tempLights.push({ x: k.x, radius: def.lightRadius * area, life: def.lightTime, maxLife: def.lightTime });
      return;
    }
    if (form === 'B') {
      // Купол Сияния: a lasting dome that burns, slows and hastes nests
      const apo = this.apotheosis('hammer');
      const life = apo ? 10 : 6;
      s.tempLights.push({
        x: k.x, radius: 100 * area, life, maxLife: life, slow: 0.5, dps: 34 * mult, haste: 0.4, heal: apo ? 30 : 0,
      });
      for (const e of s.enemies) {
        if (e.dead || e.layer !== 'ground' || Math.abs(e.x - k.x) > 100 * area) continue;
        this.damageEnemy(e, def.damage * 0.5 * mult);
      }
      return;
    }
    let hits = 0;
    const radius = def.radius * (1 + this.mods.hammerRadius) * area;
    for (const e of s.enemies) {
      const under = (e.layer === 'under');
      if (e.dead || e.layer === 'air' || (under && !this.mods.hammerQuake)) continue;
      const d = e.x - k.x;
      if (Math.abs(d) > radius) continue;
      hits++;
      const stun = def.stun * (this.facet('hm-tremor') ? 1.6 : 1);
      if (under) { this.damageEnemy(e, def.damage * mult * (this.facet('hm-deep') ? 2 : 1)); this.stunEnemy(e, stun); continue; }
      e.armorBreak = Math.max(e.armorBreak, def.armorBreak);
      this.damageEnemy(e, def.damage * mult);
      this.stunEnemy(e, stun);
      if (e.kind !== 'mother') e.kick = this.facet('hm-pull') ? -Math.sign(d) * Math.min(Math.abs(d) * 2.5, def.knockback * 3) : Math.sign(d || -e.dir) * def.knockback * 3;
    }
    const caveR = radius * (this.facet('hm-deep') ? 2 : 1);
    for (const tn of [...s.tunnels]) {
      if (tn.open && (Math.abs(tn.headX - k.x) <= caveR || Math.abs(tn.entryX - k.x) <= caveR)) this.collapseTunnel(tn, 'hammer');
    }
    if (this.mods.hammerRefund) {
      const sun = this.facet('hm-sun');
      k.light = Math.min(this.maxLight(), k.light + Math.min(sun ? 60 : 30, hits * (sun ? 10 : 5)));
      if (sun) k.hp = Math.min(this.keeperMaxHp(), k.hp + hits * 4);
    }
    s.tempLights.push({ x: k.x, radius: def.lightRadius * area, life: def.lightTime, maxLife: def.lightTime });
    if (this.mods.hammerEclipse) {
      const night = this.facet('hm-night');
      s.tempLights.push({ x: k.x, radius: radius, life: night ? 8 : 5, maxLife: night ? 8 : 5, slow: night ? 0.55 : 0.35 });
    }
  }

  /** Stun with boss resistance and diminishing returns. */
  stunEnemy(e: Enemy, secs: number) {
    const def = ENEMIES[e.kind];
    let t = secs * def.ccMult;
    if (e.sinceStun < ABILITIES.hammer.restunWindow) t *= RESTUN_FACTOR;
    e.stun = Math.max(e.stun, t);
    e.sinceStun = 0;
  }

  private meteor(x: number, fall: number, damage: number, radius: number, extra: Partial<Projectile> = {}) {
    const s = this.state;
    if (this.facet('sf-hunt')) {
      // Звёзды-охотницы: each star bends toward the nearest creature
      const t = s.enemies.filter((e) => !e.dead && e.layer !== 'under' && Math.abs(e.x - x) <= 80)
        .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
      if (t) x = t.x + t.dir * ENEMIES[t.kind].speed * fall * 0.6;
    }
    s.projectiles.push({
      id: s.nextId++, kind: 'meteor', x: x - 70, y: -30, vx: 70 / fall, vy: (WORLD.groundY + 30) / fall,
      damage, targetId: 0, tx: x, ty: WORLD.groundY, pierce: 0, hit: [], life: fall, age: 0, radius, ...extra,
    });
  }

  private castStarfall(tx: number, mult: number) {
    const s = this.state;
    const def = ABILITIES.starfall;
    s.keeper.charge = 0;
    const form = s.keeper.forms.starfall;
    const area = this.runeArea('starfall');
    const apo = this.apotheosis('starfall');
    if (form === 'A') {
      // Сверхзвезда: one giant star
      this.meteor(tx, 1.1, def.damage * 4.5 * mult, def.impactRadius * 1.9 * area, {
        stun: 2.5, breakArmor: apo ? 20 : 8, burnTime: apo ? 8 : def.burnTime,
      });
      if (this.facet('sf-storm')) for (let i = 0; i < 4; i++) this.meteor(tx + (i - 1.5) * 40, 1.3 + i * 0.1, def.damage * mult, def.impactRadius * area);
      return;
    }
    if (form === 'B') {
      // Звёздный ливень: stars rain over the whole Circle for a few seconds
      const n = (apo ? 35 : 20) + (this.facet('sf-storm') ? 8 : 0);
      const targets = s.enemies.filter((e) => !e.dead && !(e.layer === 'under') && e.lit);
      for (let i = 0; i < n; i++) {
        let x: number;
        if (apo && targets.length) x = targets[i % targets.length].x + (this.rand() - 0.5) * 16;
        else x = WORLD.treeX + (this.rand() * 2 - 1) * (s.tree.radius + 40);
        this.meteor(x, 0.7 + (i / n) * 5, def.damage * 0.55 * mult, def.impactRadius * 0.8 * area, { burnTime: 1.5 });
      }
      return;
    }
    const n = def.meteors + this.mods.starfallMeteors + (this.facet('sf-storm') ? 4 : 0);
    for (let i = 0; i < n; i++) {
      const x = tx + (i - (n - 1) / 2) * ((def.spread * area * 2) / (n - 1)) + (this.rand() - 0.5) * 10;
      this.meteor(x, 0.7 + i * 0.12, def.damage * mult, def.impactRadius * area);
    }
  }

  /** Who is dealing damage right now (for run statistics). */
  private src = 'other';
  private logDmg(v: number) {
    const d = this.state.stats.dmg;
    d[this.src] = (d[this.src] ?? 0) + v;
  }
  private killsAtNight = 0;
  private snapNight(rushed: boolean) {
    const s = this.state;
    s.stats.nights.push({
      night: s.night + 1, time: Math.round(s.stats.time), treeDmg: Math.round(this.nightTreeDmg), kills: s.stats.kills - this.killsAtNight,
      amber: s.amber, star: s.star, wrath: +s.wrath.toFixed(2), rushed,
    });
    this.killsAtNight = s.stats.kills;
  }

  /**
   * How thick the «Туман Тьмы» around a creature is: 1 = full shroud, 0.5 = thinned by one
   * source (Светоносное Древо or «Рассеять Туман» under Сияние), 0 = both or no fog.
   */
  fogLevel(e: Enemy): number {
    if (!e.fogged) return 0;
    const thin = (this.mods.fogPierce ? 1 : 0) + (this.state.keeper.radianceT > 0 && this.facet('rd-fog') ? 1 : 0);
    return thin >= 2 ? 0 : thin === 1 ? 0.5 : 1;
  }

  /** Delayed sim actions (e.g. the Hammer's echo). */
  private timers: Array<{ t: number; fn: () => void }> = [];
  private later(t: number, fn: () => void) { this.timers.push({ t, fn }); }
  private updateTimers(dt: number) {
    if (!this.timers.length) return;
    const due: Array<() => void> = [];
    this.timers = this.timers.filter((x) => { x.t -= dt; if (x.t <= 0) { due.push(x.fn); return false; } return true; });
    for (const fn of due) fn();
  }

  /** Has the Keeper turned this facet? */
  facet(id: string) { return this.state.keeper.facets.includes(id); }

  /** Facets a rune may turn at a rank: base ones plus resonances with installed Properties. */
  facetOffers(rid: KeeperRuneId, rank: number): string[] {
    const k = this.state.keeper;
    return FACETS.filter((f) => f.rune === rid && f.rank === rank && (!f.requires || k.props[rid].includes(f.requires))).map((f) => f.id);
  }

  /** «Повышение»: raise a keeper rune's rank for Star Blood. */
  promoteRune(rid: KeeperRuneId): boolean {
    const k = this.state.keeper;
    const r = k.runeRank[rid];
    const cost = runeRankCost(r + 1);
    if (this.state.star < cost) return this.deny('Нужна Звёздная Кровь');
    this.state.star -= cost;
    k.runeRank[rid]++;
    if (FACET_RANKS.includes(k.runeRank[rid])) {
      const offers = this.facetOffers(rid, k.runeRank[rid]);
      if (offers.length) this.state.choices.push({ kind: 'facet', rune: rid, rank: k.runeRank[rid], offers });
    }
    this.emit({ type: 'rankUp', rank: k.rank });
    return true;
  }

  /** Choose the Form of an ability rune (once, at Серебро). */
  chooseForm(rid: 'spear' | 'hammer' | 'starfall', form: FormId): boolean {
    const k = this.state.keeper;
    if (k.runeRank[rid] < FORM_RANK) return this.deny('Форма открывается на ранге руны «Серебро»');
    if (k.forms[rid]) return this.deny('Форма уже выбрана');
    k.forms[rid] = form;
    this.emit({ type: 'rune', id: `form:${rid}:${form}` });
    return true;
  }

  // ───────────────────────────── tick ────────────────────────────────

  /** Advance the simulation by exactly one fixed step. */
  step(): void {
    const s = this.state;
    if (this.over) return;
    const dt = STEP;
    s.time += dt;
    s.stats.time += dt;
    s.phaseTime += dt;

    this.updateTreeRadius(dt);
    if (s.phase === 'day') this.updateDay(dt);
    else this.updateSpawns();

    this.updateTimers(dt);
    s.keeper.coldT = Math.max(0, s.keeper.coldT - dt);
    if (s.keeper.timeStopT > 0) {
      s.keeper.timeStopT = Math.max(0, s.keeper.timeStopT - dt);
      if (s.keeper.timeStopT <= 0 && this.facet('ts-cold')) s.keeper.coldT = 4;
      if (this.facet('ts-mend')) {
        s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + this.treeMaxHp() * 0.03 * dt);
        for (const st of s.structures) st.hp = Math.min(st.maxHp, st.hp + st.maxHp * 0.03 * dt);
      }
      // the darkness can't send anyone while time stands
      for (const p of s.pending) p.at += dt;
      this.nightDeadline += dt;
    }
    this.updateKeeper(dt);
    this.updateEnemies(dt);
    this.updateTunnels(dt);
    this.updateStructures(dt);
    this.updateTree(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.updateWorkers(dt);
    this.updateSoldiers(dt);
    this.updateTempLights(dt);
    this.cleanup();

    if (s.tree.hp <= 0) {
      if (this.mods.secondWind && !s.tree.secondWindUsed) {
        s.tree.secondWindUsed = true;
        s.tree.hp = this.treeMaxHp() * 0.3;
        this.emit({ type: 'secondWind' });
      } else {
        s.tree.hp = 0;
        s.phase = 'lost';
        this.emit({ type: 'lost' });
        return;
      }
    }
    if (s.phase === 'night' && s.pending.length === 0 && s.enemies.length > 0 && s.phaseTime > this.nightDeadline) {
      // dawn burns the stragglers away (no rewards)
      for (const e of s.enemies) { e.dead = true; this.emit({ type: 'enemyDied', kind: e.kind, x: e.x, y: e.y }); }
      s.enemies = [];
      this.emit({ type: 'denied', reason: 'Рассвет выжег тварей во тьме' });
    }
    if (s.phase === 'night' && s.pending.length === 0 && s.enemies.length === 0) this.endNight();
  }

  // ───────────────────────────── phases ──────────────────────────────

  private updateDay(dt: number) {
    const s = this.state;
    if (s.choices.length === 0) s.dayLeft -= dt;
    const tear = s.tree.stage + 1 >= TREE.tearStage ? 2 : 1;
    if (s.tree.hp < this.treeMaxHp()) {
      const h = (TREE.dayRegen * tear + this.mods.treeRegen) * dt;
      s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + h);
      this.healFx(-1, WORLD.treeX, WORLD.groundY - 40, h);
    }
    if (s.dayLeft <= 0) this.startNight();
  }

  private startNight() {
    const s = this.state;
    s.phase = 'night';
    s.phaseTime = 0;
    s.dayLeft = 0;
    s.tree.shieldUsed = false;
    this.nightMinReach = Infinity;
    this.nightTreeDmg = 0;
    this.queueNight(0);
  }

  /** Schedule the spawns of the current night index, starting at phase time `t0`. */
  private queueNight(t0: number) {
    const s = this.state;
    const def = this.night(s.night);
    const handMade = s.night < this.campaignNights;
    const pending: PendingSpawn[] = [];
    for (const g of def.groups) {
      const sides: Array<'L' | 'R'> = g.side === 'B' ? ['L', 'R'] : [g.side];
      for (const side of sides) {
        const boss = ENEMIES[g.kind].boss;
        // worms dig in ever larger numbers
        const wormGrow = ENEMIES[g.kind].underground ? 1 + ENDLESS.wormCount * s.night : 1;
        const grow = (handMade ? ENDLESS.count(s.night) : 1) * wormGrow;
        const count = boss ? g.count : Math.round(g.count * grow);
        const every = boss ? g.every : g.every / Math.sqrt(grow);
        for (let i = 0; i < count; i++) {
          const stagger = g.side === 'B' && side === 'R' ? every * 0.5 : 0;
          pending.push({ at: t0 + g.at + i * every + stagger, kind: g.kind, side });
        }
      }
    }
    pending.sort((a, b) => a.at - b.at);
    s.pending = [...s.pending, ...pending].sort((a, b) => a.at - b.at);
    this.nightDeadline = (pending[pending.length - 1]?.at ?? 0) + NIGHT_GRACE;
    this.emit({ type: 'nightStart', night: s.night });
  }

  private endNight() {
    const s = this.state;
    this.snapNight(false);
    const finished = s.night;
    s.night++;
    if (s.night === this.campaignNights) {
      this.milestoneStars = this.computeStars();
      this.emit({ type: 'milestone', stars: this.milestoneStars });
    }
    let gift = Math.round((ECONOMY.dawnBase + ECONOMY.dawnPerNight * (finished + 1)) * (1 + this.mods.dawnGift));
    // dawns skipped by «Натиск» arrive now: their gifts (the half not paid up front) and roulettes
    for (let i = 1; i <= s.rushedDawns; i++) {
      gift += Math.round((ECONOMY.dawnBase + ECONOMY.dawnPerNight * (finished + 1 - i)) * (1 + this.mods.dawnGift) * (1 - ECONOMY.rushGiftShare));
    }
    const extraDawns = s.rushedDawns;
    s.rushedDawns = 0;
    s.amber += gift;
    s.phase = 'day';
    s.phaseTime = 0;
    s.dayLeft = DAY.length;
    for (const g of this.graveyard) {
      if (this.structureAt(g.slotId)) continue;
      const slot = SLOTS.find((x) => x.id === g.slotId)!;
      const st: Structure = {
        id: s.nextId++, family: 'beetle', slotId: g.slotId, x: slot.x, y: slot.y, underground: false, crown: false, tier: g.tier, spec: g.spec,
        hp: 0, maxHp: 0, cd: 0, spentAmber: 0, spentStar: 0, hitFlash: 0, age: 0, aim: slot.x < WORLD.treeX ? -1 : 1, haste: 0, intercept: 0, merge: 0, ascend: 0,
      };
      st.hp = st.maxHp = this.nestStats(st).hp;
      s.structures.push(st);
      this.emit({ type: 'built', family: 'beetle', x: slot.x, y: slot.y, underground: false, tier: g.tier });
    }
    this.graveyard = [];
    s.tunnels = [];
    s.keeper.timeStopNights = Math.max(0, s.keeper.timeStopNights - 1);
    if (!s.keeper.alive) s.keeper.respawn = 0.5;
    this.adaptWrath(finished);
    this.emit({ type: 'dawn', night: finished, gift });
    this.offerDawn(false);
    for (let i = 0; i < extraDawns; i++) this.offerDawn(false);
  }

  /**
   * The Observer's roulette: one offer per class — the Ascended (a rune Property), the
   * creatures (a nest boon) and the Tree/economy (a gift) — so every dawn has a real choice.
   */
  private offerDawn(start: boolean) {
    const s = this.state;
    const offers = this.rollOffers(start ? 1 : maxRankForNight(s.night - 1));
    if (offers.length) s.choices.push({ kind: 'dawn', offers, start });
  }

  private rollOffers(maxRank: number): string[] {
    const s = this.state;
    type Cand = { id: string; rank: number };
    const weight = (c: Cand) => [6, 4.5, 3, 2, 1.2][c.rank] ?? 1;
    const pick = (pool: Cand[]): string | null => {
      if (!pool.length) return null;
      const total = pool.reduce((a, c) => a + weight(c), 0);
      let r = this.rand() * total;
      for (const c of pool) { r -= weight(c); if (r <= 0) return c.id; }
      return pool[0].id;
    };
    const keeper = PROPERTIES.filter((p) => p.rank <= maxRank && this.canInstall(p) && this.abilityUnlocked(p.rune === 'light' ? 'spear' : p.rune))
      .map((p) => ({ id: p.id, rank: p.rank }));
    const creatures = BOONS.filter((b) => b.kind === 'creature' && b.rank <= maxRank && !s.keeper.boons.includes(b.id))
      .map((b) => ({ id: b.id, rank: b.rank }));
    const gifts = BOONS.filter((b) => b.kind === 'gift' && b.rank <= maxRank && !(b.mods && Object.keys(b.mods).length && s.keeper.boons.includes(b.id))
      && (!b.learn || (!s.keeper.learned[b.learn] && this.abilityAvailable(b.learn))))
      .map((b) => ({ id: b.id, rank: b.rank }));
    const out: string[] = [];
    for (const pool of [keeper, creatures, gifts]) {
      const id = pick(pool.filter((c) => !out.includes(c.id)));
      if (id) out.push(id);
    }
    // top up from any pool if a class was empty
    const all = [...keeper, ...creatures, ...gifts].filter((c) => !out.includes(c.id));
    while (out.length < 3 && all.length) {
      const id = pick(all)!;
      out.push(id);
      all.splice(all.findIndex((c) => c.id === id), 1);
    }
    return out;
  }

  /** Re-roll the current dawn offers for Star Blood (price grows with each re-roll). */
  rerollCost() { return 3 + 3 * this.rerolls; }
  rerollDawn(): boolean {
    const s = this.state;
    const c = this.choice;
    if (!c || c.kind !== 'dawn') return false;
    const cost = this.rerollCost();
    if (s.star < cost) return this.deny('Нужна Звёздная Кровь');
    s.star -= cost;
    this.rerolls++;
    c.offers = this.rollOffers(maxRankForNight(Math.max(0, s.night - 1)));
    return true;
  }
  private rerolls = 0;

  private updateSpawns() {
    const s = this.state;
    while (s.pending.length && s.pending[0].at <= s.phaseTime) {
      const p = s.pending.shift()!;
      const x = p.side === 'L' ? -WORLD.spawnMargin : WORLD.width + WORLD.spawnMargin;
      this.spawnEnemy(p.kind, x, p.side === 'L' ? 1 : -1);
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, dir: 1 | -1): Enemy {
    const s = this.state;
    const def = ENEMIES[kind];
    const nightMul = this.night(s.night).hpMul;
    const pathMul = PATHS[this.path].hp;
    // bosses are tuned at their absolute value on first appearance, then grow slowly
    let hp = Math.round(def.hp * (def.boss ? ENDLESS.bossHp(s.night) : nightMul) * pathMul * s.wrath
      * (HEAVY.has(kind) ? ENDLESS.heavyHp(s.night) : 1) * (def.worm && !def.boss ? ENDLESS.wormHp(s.night) : 1));
    let affix: Enemy['affix'] = null;
    if (!def.boss && kind !== 'larva' && s.night >= ELITE.fromNight && this.rand() < ELITE.chance(s.night)) {
      const list = Object.keys(AFFIXES) as Array<NonNullable<Enemy['affix']>>;
      affix = list[Math.floor(this.rand() * list.length)];
      hp = Math.round(hp * ELITE.hp);
    }
    const e: Enemy = {
      id: s.nextId++, kind, x, y: def.underground ? WORLD.wormLaneY : def.air ? WORLD.groundY - def.altitude : WORLD.groundY, dir,
      hp, maxHp: hp, speedMul: 0.92 + this.rand() * 0.16, attackCd: 0.3 + this.rand() * 0.4,
      stun: 0, sinceStun: 99, rooted: 0, slow: 0, poison: 0, poisonTime: 0, marked: 0, burn: 0, vuln: 0, armorBreak: 0, web: 0, affix, jumpCd: 0, jumping: 0,
      attacking: false, lit: false, age: this.rand() * 3, hitFlash: 0,
      broodCd: (BROOD[kind]?.every ?? 5) * 0.6, kick: 0, dead: false,
      layer: def.underground ? 'under' : def.air ? 'air' : 'ground', tunnel: 0, usedTunnel: false, fogged: false,
    };
    if (DIGGERS.has(kind)) {
      // every digger drives a tunnel toward the trunk
      const tn: Tunnel = { id: s.nextId++, dir, entryX: NaN, headX: x, open: false, seal: 0, left: TUNNELS.capacity(s.night) };
      s.tunnels.push(tn);
      e.tunnel = tn.id;
    }
    s.enemies.push(e);
    return e;
  }

  // ───────────────────────────── keeper ──────────────────────────────

  private updateKeeper(dt: number) {
    const s = this.state;
    const k = s.keeper;
    k.castAnim += dt;
    k.chordT = Math.max(0, k.chordT - dt);
    if (k.chordT <= 0) k.chord = 0;
    k.heatT = Math.max(0, k.heatT - dt);
    if (k.heatT <= 0) k.heat = 0;
    k.radianceT = Math.max(0, k.radianceT - dt);
    k.swarmT = Math.max(0, k.swarmT - dt);
    if (k.radianceT > 0 && this.propCount('radiance', 'rd-heal')) {
      const bloom = this.facet('rd-bloom');
      const h = (bloom ? 40 : 20) * dt;
      if (s.tree.hp < this.treeMaxHp()) {
        s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + h);
        this.healFx(-1, WORLD.treeX, WORLD.groundY - 40, h);
      }
      if (bloom) for (const st of s.structures) if (st.hp < st.maxHp) st.hp = Math.min(st.maxHp, st.hp + 10 * dt);
    }
    if (k.swarmT > 0 && this.facet('sw-follow')) k.swarmX = k.x;
    k.hitFlash = Math.max(0, k.hitFlash - dt);
    k.rhythmT = Math.max(0, k.rhythmT - dt);
    if (k.rhythmT <= 0) k.rhythm = 0;
    k.freeCast = Math.max(0, k.freeCast - dt);
    k.lastLightCd = Math.max(0, k.lastLightCd - dt);
    const hurry = k.timeStopT > 0 && this.facet('ts-hurry') ? 3 : 1;
    for (const id of Object.keys(k.cooldowns) as AbilityId[]) k.cooldowns[id] = Math.max(0, k.cooldowns[id] - dt * hurry);
    const maxL = this.maxLight();
    k.light = Math.min(maxL, k.light + this.stageDef.lightRegen * (1 + this.mods.lightRegen + 0.08 * k.attrs.spirit + (this.facet('lt-flow') ? 0.25 : 0)) * this.lightRegenFactor() * dt);
    if (this.mods.lastLight && k.light < 20 && k.lastLightCd <= 0 && s.phase === 'night') {
      k.freeCast = 3;
      k.lastLightCd = this.facet('lt-last2') ? 25 : 45;
    }

    if (!k.alive) {
      k.respawn -= dt;
      if (k.respawn <= 0) {
        k.alive = true;
        k.hp = this.keeperMaxHp();
        k.x = WORLD.treeX;
        this.emit({ type: 'keeperBack' });
      }
      return;
    }
    if (k.leapT > 0) {
      // in the air: untouchable, lands with the slam
      k.leapT = Math.max(0, k.leapT - dt);
      const p = 1 - k.leapT / k.leapDur;
      k.x = k.leapFrom + (k.leapTo - k.leapFrom) * p;
      if (k.leapT <= 0) {
        k.x = k.leapTo;
        this.src = 'hammer';
        this.castHammer(k.leapMult);
        this.emit({ type: 'slam', x: k.x });
      }
      return;
    }
    this.src = 'spear';
    if (k.channel > 0) {
      const before = k.channel;
      k.channel += dt;
      // the beam feeds on Light; when it runs dry the beam goes out
      const drain = this.abilityCost('spear') * BEAM_DRAIN * dt;
      if (k.freeCast <= 0) {
        if (k.light < drain) { this.endChannel(); k.walkT = 0; return; }
        k.light -= drain;
      }
      // damage ticks every BEAM_TICK seconds along the whole line
      if (Math.floor(before / BEAM_TICK) !== Math.floor(k.channel / BEAM_TICK)) {
        const apo = this.apotheosis('spear');
        for (const e of s.enemies) {
          if (e.dead || (e.layer === 'under') || (e.x - k.x) * k.channelDir < 0) continue;
          // the beam scatters with distance: full power up close, a quarter at the far end
          const fall = beamFalloff(Math.abs(e.x - k.x));
          this.damageEnemy(e, k.channelDps * BEAM_TICK * fall);
          if (apo) { e.marked = Math.max(e.marked, 3); this.damageQuiet(e, k.channelDps * BEAM_TICK * 0.4 * fall); }
        }
      }
      k.walkT = 0;
    } else if (k.move !== 0) {
      k.dir = k.move;
      k.x = Math.max(8, Math.min(WORLD.width - 8, k.x + k.move * KEEPER.speed * (1 + this.mods.keeperSpeed + (this.facet('lt-dash') ? 0.2 : 0)) * dt));
      k.walkT += dt;
    } else {
      k.walkT = 0;
    }
    if (this.isLit(k.x, false)) k.hp = Math.min(this.keeperMaxHp(), k.hp + KEEPER.regenLit * (1 + k.rank) * dt);
    if (this.facet('lt-tree') && Math.abs(k.x - WORLD.treeX) <= 80) k.hp = Math.min(this.keeperMaxHp(), k.hp + 8 * dt);
    // radiance: the Ascended burns creatures pressing against him
    this.src = 'keeper';
    const aura = this.keeperAura();
    for (const e of s.enemies) {
      if (e.dead || e.layer !== 'ground' || Math.abs(e.x - k.x) > ENEMIES[e.kind].radius + 14) continue;
      this.damageQuiet(e, aura * dt);
    }
  }

  private damageKeeper(amount: number) {
    const s0 = this.state;
    const k = s0.keeper;
    if (!k.alive || k.leapT > 0) return;
    const shield = this.facet('lt-guard') && k.light >= this.maxLight() * 0.7 ? 0.75 : 1;
    k.hp -= amount * (1 - this.keeperGuard()) * shield;
    k.hitFlash = 0.15;
    this.emit({ type: 'keeperHit' });
    if (k.hp <= 0) {
      k.hp = 0;
      k.alive = false;
      k.channel = 0;
      s0.stats.keeperDeaths++;
      // no free resurrection: wait for dawn, pay the Tree, or sacrifice to Eternity
      k.respawn = s0.phase === 'night' ? Infinity : KEEPER.respawn;
      k.charge = 0;
      const spill = Math.floor(s0.star * 0.25);
      if (spill > 0) {
        s0.star -= spill;
        for (let i = 0; i < Math.min(6, spill); i++) {
          const v = i === Math.min(6, spill) - 1 ? spill - Math.floor(spill / Math.min(6, spill)) * i : Math.floor(spill / Math.min(6, spill));
          s0.drops.push({
            id: s0.nextId++, kind: 'star', x: k.x + (i - 2.5) * 4, y: WORLD.groundY - 3, vx: 0, vy: 0, value: v, life: 90,
            grounded: true, pulled: false, age: 0, claimed: -1, rooted: false, mode: 1, hover: 0,
          });
        }
      }
      k.move = 0;
      this.emit({ type: 'keeperDown' });
    }
  }

  // ───────────────────────────── enemies ─────────────────────────────

  /** Apply damage with the Igg-light worm multiplier and beacon mark. Returns damage dealt. */
  damageEnemy(e: Enemy, amount: number, lightMult = true, fromNest = false, pierceArmor = false): number {
    if (e.dead) return 0;
    const def = ENEMIES[e.kind];
    const fog = this.fogLevel(e);
    const worm = lightMult && def.worm && fog < 1 && this.isLit(e.x, e.layer === 'under');
    const k0 = this.state.keeper;
    const fury = fromNest && k0.swarmT > 0 && this.propCount('swarm', 'sw-fury') > 0 ? (k0.facets.includes('sw-frenzy') ? 1.7 : 1.4) : 1;
    const mark = (fromNest && e.marked > 0 ? (k0.facets.includes('sp-mark') ? 1.45 : 1.25) : 1) * fury
      * (fromNest && k0.radianceT > 0 && k0.facets.includes('rd-nests') ? 1.25 : 1);
    const raw = amount * (worm ? WORM_LIGHT_MULT - (WORM_LIGHT_MULT - 1) * fog : 1) * mark * (1 + e.vuln);
    const armor = e.armorBreak > 0 || pierceArmor ? 0 : def.armor + (e.affix === 'armored' ? ELITE.armor : 0) + (def.armor > 0 && HEAVY.has(e.kind) ? ENDLESS.heavyArmor(this.state.night) : 0);
    const dmg = Math.max(raw * ARMOR_FLOOR, raw - armor);
    this.logDmg(Math.min(dmg, Math.max(0, e.hp)));
    e.hp -= dmg;
    e.hitFlash = 0.12;
    this.emit({ type: 'hit', x: e.x, y: e.layer === 'under' ? e.y : e.y - def.height * 0.6, amount: dmg, crit: worm });
    if (e.hp <= 0) this.killEnemy(e);
    return dmg;
  }

  private killEnemy(e: Enemy) {
    const s = this.state;
    e.dead = true;
    if (e.tunnel && DIGGERS.has(e.kind)) s.tunnels = s.tunnels.filter((t) => t.id !== e.tunnel || t.open);
    s.stats.kills++;
    s.stats.killsBy[e.kind] = (s.stats.killsBy[e.kind] ?? 0) + 1;
    const def = ENEMIES[e.kind];
    const k = s.keeper;
    if (this.abilityUnlocked('starfall')) {
      k.charge = Math.min(ABILITIES.starfall.chargeMax, k.charge + def.charge * (1 + this.mods.chargeGain + (this.facet('sf-hunger') ? 0.5 : 0)));
    }
    this.emit({ type: 'enemyDied', kind: e.kind, x: e.x, y: e.y });
    const bounty = ENDLESS.bounty(s.night) * (e.affix ? ELITE.loot : 1);
    if (e.affix === 'volatile') {
      for (const st of s.structures) {
        if (st.underground || st.crown || Math.abs(st.x - e.x) > ELITE.blastRadius) continue;
        this.damageStructure(st, ELITE.blast * this.enemyDamageMul());
      }
      this.emit({ type: 'blast', x: e.x, y: e.y - 6 });
    }
    const amber = Math.round(def.amber * bounty * (1 + this.mods.amberGain) * PATHS[this.path].amber);
    let star = 0;
    if (def.star >= 1) star = Math.round(def.star * Math.sqrt(bounty)) + this.mods.wormStar;
    else if (def.star > 0 && this.rand() < def.star) star = 1;
    star = Math.round(star * (1 + this.mods.starGain));
    if (def.devRune > 0 && this.rand() < def.devRune) {
      s.devRunes++;
      this.emit({ type: 'devRune', x: e.x });
    }
    this.dropLoot('amber', amber, e);
    this.dropLoot('star', star, e);
  }

  private dropLoot(kind: DropKind, total: number, e: Enemy) {
    if (total <= 0) return;
    const s = this.state;
    const def = ENEMIES[e.kind];
    const per = kind === 'amber' ? 3 : 2;
    const pieces = Math.max(1, Math.min(8, Math.ceil(total / per)));
    let left = total;
    for (let i = 0; i < pieces; i++) {
      const v = i === pieces - 1 ? left : Math.floor(total / pieces);
      left -= v;
      if (v <= 0) continue;
      const d: Drop = {
        id: s.nextId++, kind, x: Math.max(8, Math.min(WORLD.width - 8, e.x)),
        y: e.layer === 'under' ? WORLD.groundY - 2 : e.y - def.height * 0.5,
        vx: (this.rand() - 0.5) * 70, vy: -60 - this.rand() * 60, value: v,
        life: 0, grounded: false, pulled: false, age: 0, claimed: 0, rooted: false, mode: 0, hover: 0,
      };
      d.life = (this.isLit(d.x, false) ? ECONOMY.dropLifeLit : ECONOMY.dropLifeDark) * (kind === 'star' ? 1.6 : 1);
      s.drops.push(d);
    }
  }

  private updateEnemies(dt: number) {
    const s = this.state;
    // «Туман Тьмы»: big worms shroud everything around them
    const fogs = s.night >= FOG.fromNight ? s.enemies.filter((e) => !e.dead && ENEMIES[e.kind].fog) : [];
    for (const e of s.enemies) {
      e.fogged = fogs.some((f) => f.layer === e.layer && Math.abs(f.x - e.x) <= ENEMIES[f.kind].fog!);
    }
    for (const e of s.enemies) {
      if (e.dead) continue;
      const def = ENEMIES[e.kind];
      e.age += dt;
      e.sinceStun += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.marked = Math.max(0, e.marked - dt);
      e.armorBreak = Math.max(0, e.armorBreak - dt);
      e.web = Math.max(0, e.web - dt);
      e.jumpCd = Math.max(0, e.jumpCd - dt);
      if (e.affix === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * ELITE.regen * dt);
      if (e.jumping > 0) {
        e.jumping -= dt;
        e.x += e.dir * (JUMP.distance / JUMP.time) * dt;
        continue;
      }
      e.lit = this.isLit(e.x, e.layer === 'under');
      const reach = Math.abs(e.x - WORLD.treeX);
      if (reach < this.nightMinReach) this.nightMinReach = reach;
      e.attacking = false;
      e.slow = this.slowAt(e);
      e.vuln = this.vulnAt(e);
      e.attackCd -= dt;
      this.src = 'tree';
      const fog = this.fogLevel(e);
      if (def.worm && e.lit && fog < 1) {
        // Igg-light burns worms: «личинка сгорает за одну-две секунды» (the shroud dims it)
        const flare = s.keeper.radianceT > 0 ? ABILITIES.radiance.burn : 1;
        e.hp -= this.stageDef.wormBurn * (1 + this.mods.wormBurn) * flare * (def.boss ? 0.5 : 1) * (1 - fog) * dt;
        if (e.hp <= 0) { this.killEnemy(e); continue; }
      }
      this.src = 'spider';
      if (e.poisonTime > 0) {
        e.poisonTime -= dt;
        this.damageQuiet(e, e.poison * dt, false);
        if (e.dead) continue;
      }
      this.src = 'starfall';
      for (const b of s.burns) {
        if (e.layer === 'ground' && Math.abs(e.x - b.x) <= b.halfWidth) this.damageQuiet(e, b.dps * dt);
      }
      this.src = 'hammer';
      for (const t of s.tempLights) {
        if (t.dps && e.layer !== 'under' && Math.abs(e.x - t.x) <= t.radius) this.damageQuiet(e, t.dps * dt);
      }
      if (e.dead) continue;

      this.src = 'thorns';
      if (this.frozen(e)) { e.attacking = false; continue; }
      if (e.kick !== 0) {
        e.x += e.kick * dt;
        e.kick *= Math.pow(0.02, dt);
        if (Math.abs(e.kick) < 2) e.kick = 0;
      }
      if (e.stun > 0) { e.stun -= dt; e.sinceStun = 0; continue; }

      const brood = BROOD[e.kind];
      if (brood) {
        e.broodCd -= dt;
        if (e.broodCd <= 0) {
          e.broodCd = brood.every;
          for (let i = 0; i < brood.count; i++) {
            const l = this.spawnEnemy(brood.kind, e.x + (this.rand() - 0.5) * 30, e.dir);
            l.kick = e.dir * (20 + this.rand() * 60);
          }
          this.emit({ type: 'brood', x: e.x });
        }
      }

      if (e.kind === 'tunneler' && Math.abs(e.x - WORLD.treeX) <= TUNNEL_SURFACE) {
        // the tunneller breaks out behind the defenses, right next to the trunk
        e.dead = true;
        const up = this.spawnEnemy('tunnelerUp', e.x, e.dir);
        up.hp = up.maxHp * (e.hp / e.maxHp);
        up.affix = e.affix;
        this.openTunnel(e);
        this.emit({ type: 'emerge', x: e.x });
        continue;
      }
      if (e.layer === 'air') { this.updateFlyer(e, dt); continue; }
      if (e.layer === 'under' && !def.underground) { this.crawlTunnel(e, dt); continue; }
      if (e.layer === 'under') { this.updateWorm(e, dt); continue; }
      if (!e.usedTunnel && !def.boss && e.jumping <= 0 && this.diveIntoTunnel(e)) continue;

      const target = this.pickTarget(e);
      // jumpers leap over blocking nests
      if (e.kind === 'jumper' && target?.kind === 'structure' && e.jumpCd <= 0) {
        e.jumpCd = JUMP.cooldown;
        e.jumping = JUMP.time;
        this.emit({ type: 'jump', x: e.x });
        continue;
      }
      if (target) {
        e.attacking = true;
        if (e.attackCd <= 0) {
          e.attackCd = def.attackRate;
          const dmg = def.damage * this.enemyDamageMul(e.kind);
          if (def.cleave) {
            // sweeping bite mows down the termite squad around it
            let hit = 0;
            for (const u of s.soldiers) {
              if (u.hp > 0 && Math.abs(u.x - e.x) <= def.cleave + def.radius) { this.damageSoldier(u, dmg, e); hit++; }
            }
            if (hit) this.emit({ type: 'cleave', x: e.x, r: def.cleave });
          }
          if (def.range > 0) this.spitAcid(e, target);
          else if (target.kind === 'structure') this.damageStructure(target.s, dmg * def.structureMult, e);
          else if (target.kind === 'soldier') { if (!def.cleave) this.damageSoldier(target.u, dmg, e); }
          else if (target.kind === 'keeper') this.damageKeeper(dmg);
          else this.damageTree(dmg, e.kind, e);
        }
        continue;
      }
      if (e.rooted > 0) { e.rooted -= dt; continue; }
      e.x += e.dir * def.speed * e.speedMul * (e.affix === 'swift' ? ELITE.speed : 1) * (1 - e.slow) * dt;
    }
  }

  private updateWorm(e: Enemy, dt: number) {
    const def = ENEMIES[e.kind];
    // worms gnaw through spider nests in their way
    const nest = this.state.structures.find((st) => st.underground && (st.x - e.x) * e.dir >= -def.radius
      && Math.hypot(st.x - e.x, st.y - e.y) <= def.radius + 8);
    if (nest) {
      e.attacking = true;
      if (e.attackCd <= 0) {
        e.attackCd = def.attackRate;
        this.damageStructure(nest, def.damage * def.structureMult * this.enemyDamageMul(e.kind), e);
      }
      return;
    }
    if (Math.abs(e.x - WORLD.treeX) <= 22) {
      e.attacking = true;
      if (e.attackCd <= 0) {
        e.attackCd = def.attackRate;
        this.damageTree(def.damage * this.enemyDamageMul(e.kind), e.kind, e);
      }
      return;
    }
    if (e.rooted > 0) { e.rooted -= dt; return; }
    const dist = Math.abs(e.x - WORLD.treeX);
    const tn = this.state.tunnels.find((t) => t.id === e.tunnel);
    if (tn) {
      if (Number.isNaN(tn.entryX) && dist <= this.treeRadius() + TUNNELS.entryPad) tn.entryX = e.x;
      tn.headX = e.x;
      if (e.kind !== 'tunneler' && dist <= this.tunnelExit()) {
        // the digger breaks out behind the defenses: now the Keeper and the nests can hit it
        this.openTunnel(e);
        e.layer = 'ground';
        e.y = WORLD.groundY - 6;
        e.usedTunnel = true;
        this.emit({ type: 'emerge', x: e.x });
        return;
      }
    }
    const targetY = dist < 90 ? WORLD.wormLaneY - (1 - dist / 90) * 30 : WORLD.wormLaneY;
    e.y += (targetY - e.y) * Math.min(1, dt * 2);
    e.x += e.dir * def.speed * e.speedMul * (1 - e.slow) * dt;
  }

  /** Distance from the trunk where diggers break out. */
  tunnelExit() { return Math.max(TUNNELS.exitMin, this.treeRadius() * TUNNELS.exitShare); }

  private openTunnel(e: Enemy) {
    const tn = this.state.tunnels.find((t) => t.id === e.tunnel);
    e.tunnel = 0;
    if (!tn) return;
    if (Number.isNaN(tn.entryX)) { this.state.tunnels = this.state.tunnels.filter((t) => t !== tn); return; }
    tn.headX = e.x;
    tn.open = true;
    this.emit({ type: 'tunnelOpen', x: e.x });
  }

  /** A ground creature between a tunnel's mouths dives in and skips the nests. */
  private diveIntoTunnel(e: Enemy): boolean {
    for (const tn of this.state.tunnels) {
      if (!tn.open || tn.dir !== e.dir) continue;
      if ((e.x - tn.entryX) * e.dir < 0 || (tn.headX - e.x) * e.dir <= 8) continue;
      e.layer = 'under';
      e.tunnel = tn.id;
      e.y = WORLD.wormLaneY - 14;
      e.attacking = false;
      this.emit({ type: 'emerge', x: e.x });
      // the passage wears out: after the last crawler leaves, the tunnel caves in
      tn.left--;
      if (tn.left <= 0) tn.open = false;
      return true;
    }
    return false;
  }

  private crawlTunnel(e: Enemy, dt: number) {
    const def = ENEMIES[e.kind];
    const tn = this.state.tunnels.find((t) => t.id === e.tunnel);
    if (!tn || (e.x - tn.headX) * e.dir >= 0) {
      this.surface(e, !!tn);
      if (tn && tn.left <= 0 && !this.state.enemies.some((o) => !o.dead && o.tunnel === tn.id)) this.collapseTunnel(tn, 'worn');
      return;
    }
    if (e.rooted > 0) { e.rooted -= dt; return; }
    e.x += e.dir * def.speed * TUNNELS.crawl * e.speedMul * (1 - e.slow) * dt;
  }

  /** Back to the surface: at the exit mouth, or buried by a collapse. */
  private surface(e: Enemy, viaExit: boolean) {
    e.layer = 'ground';
    e.y = WORLD.groundY;
    e.tunnel = 0;
    e.usedTunnel = true;
    if (!viaExit) this.damageQuiet(e, e.maxHp * TUNNELS.collapseDamage);
    this.emit({ type: 'emerge', x: e.x });
  }

  private collapseTunnel(tn: Tunnel, by: 'keeper' | 'hammer' | 'worn') {
    const s = this.state;
    s.tunnels = s.tunnels.filter((t) => t !== tn);
    for (const e of s.enemies) if (!e.dead && e.tunnel === tn.id && !DIGGERS.has(e.kind)) this.surface(e, false);
    this.emit({ type: 'tunnelSealed', x: tn.headX, by });
  }

  /** The Keeper standing on a mouth fills it in. */
  private updateTunnels(dt: number) {
    const s = this.state;
    const k = s.keeper;
    for (const tn of [...s.tunnels]) {
      if (!tn.open) continue;
      const near = k.alive && (Math.abs(k.x - tn.headX) <= TUNNELS.sealReach || Math.abs(k.x - tn.entryX) <= TUNNELS.sealReach);
      const roots = this.mods.rootSeal && this.isLit(tn.headX, false) ? TUNNELS.rootSeal : 0;
      tn.seal = near ? tn.seal + dt / TUNNELS.sealTime + roots * dt : roots > 0 ? tn.seal + roots * dt : Math.max(0, tn.seal - dt * 0.5);
      if (tn.seal >= 1) this.collapseTunnel(tn, 'keeper');
    }
  }

  /**
   * Flyers ignore blockers: Тенекрылы go for crown nests (then the crown itself),
   * Кислотники hover over surface nests and drop acid.
   */
  private updateFlyer(e: Enemy, dt: number) {
    const s = this.state;
    const def = ENEMIES[e.kind];
    const bob = Math.sin(e.age * 2.4 + e.id) * 5;
    let tx: number = WORLD.treeX, ty: number = WORLD.groundY - def.altitude;
    let nest: Structure | null = null;
    if (e.kind === 'moth') {
      let bd = Infinity;
      for (const st of s.structures) {
        if (!st.crown) continue;
        const d = Math.abs(st.x - e.x);
        if (d < bd) { bd = d; nest = st; }
      }
      if (nest) { tx = nest.x; ty = nest.y + 4; } else ty = WORLD.groundY - 110 * treeScale(s.tree.rings);
    } else {
      let bd = Infinity;
      for (const st of s.structures) {
        if (st.underground || st.crown || (st.x - e.x) * e.dir < -6) continue;
        const d = Math.abs(st.x - e.x);
        if (d < bd) { bd = d; nest = st; }
      }
      if (nest) tx = nest.x;
    }
    const dx = tx - e.x;
    const close = e.kind === 'moth' ? Math.abs(dx) <= 6 && Math.abs(ty - e.y) <= 8 : Math.abs(dx) <= (nest ? 6 : WORLD.treeReach);
    e.attacking = close;
    if (close) {
      e.y += (ty + bob * 0.3 - e.y) * Math.min(1, dt * 3);
      if (e.attackCd > 0) return;
      e.attackCd = def.attackRate;
      const dmg = def.damage * this.enemyDamageMul(e.kind);
      if (e.kind === 'bomber') { this.dropBomb(e, nest); return; }
      if (nest) this.damageStructure(nest, dmg * def.structureMult, e);
      else this.damageTree(dmg, e.kind, e);
      return;
    }
    if (e.rooted > 0) { e.rooted -= dt; return; }
    const sp = def.speed * e.speedMul * (e.affix === 'swift' ? ELITE.speed : 1) * (1 - e.slow);
    const dir = Math.sign(dx) || e.dir;
    e.x += dir * Math.min(Math.abs(dx), sp * dt);
    const goalY = Math.abs(dx) < 60 ? ty : WORLD.groundY - def.altitude + bob;
    e.y += (goalY - e.y) * Math.min(1, dt * 1.5);
  }

  private dropBomb(e: Enemy, nest: Structure | null) {
    const s = this.state;
    const tx = nest ? nest.x : WORLD.treeX + (this.rand() - 0.5) * 16;
    const ty = WORLD.groundY - (nest ? 12 : 40);
    const flight = 0.6;
    s.projectiles.push({
      id: s.nextId++, kind: 'acid', x: e.x, y: e.y, vx: (tx - e.x) / flight,
      vy: (ty - e.y) / flight - 0.5 * 260 * flight, damage: ENEMIES[e.kind].damage * this.enemyDamageMul(e.kind) * (nest ? ENEMIES[e.kind].structureMult : 1),
      targetId: nest ? nest.id : -1, tx, ty, pierce: 0, hit: [], life: flight, age: 0,
    });
    this.emit({ type: 'shoot', kind: 'acid', x: e.x, y: e.y });
  }

  private slowAt(e: Enemy): number {
    let slow = 0;
    for (const st of this.state.structures) {
      if (st.underground !== (e.layer === 'under') || e.layer === 'air' && st.family !== 'dragonfly') continue;
      const ns = this.nestStats(st);
      if (!ns.slow) continue;
      const reach = st.family === 'spider' ? ns.range : ns.light!;
      if (Math.abs(e.x - st.x) <= reach) slow = Math.max(slow, ns.slow);
    }
    for (const t of this.state.tempLights) {
      if (t.slow && e.layer !== 'under' && Math.abs(e.x - t.x) <= t.radius) slow = Math.max(slow, t.slow);
    }
    if (e.web > 0) slow = Math.max(slow, 0.35);
    if (this.state.keeper.coldT > 0) slow = Math.max(slow, 0.4);
    if (e.lit && this.state.keeper.radianceT > 0 && this.facet('rd-dawn')) slow = Math.max(slow, 0.3);
    return Math.min(0.7, slow * (e.kind === 'mother' ? 0.5 : 1));
  }

  /** Enemy damage grows with the night (fatter and meaner) and with the Darkness' wrath. */
  enemyDamageMul(kind?: EnemyKind) {
    return ENDLESS.damage(this.state.night) * Math.sqrt(this.state.wrath) * (kind && HEAVY.has(kind) ? ENDLESS.heavyDamage(this.state.night) : 1);
  }

  /**
   * «Гнев Тьмы»: in the endless night the Darkness answers your strength. If no creature even
   * reached the edge of the Circle and the Tree went unharmed, the next night is fatter;
   * if the Tree suffered badly, the wrath eases.
   */
  private adaptWrath(finished: number) {
    const s = this.state;
    if (finished < this.campaignNights - 1) return;
    const max = this.treeMaxHp();
    const before = s.wrath;
    const unharmed = this.nightTreeDmg <= max * 0.02;
    if (unharmed && this.nightMinReach > s.tree.radius * 0.8) s.wrath *= 1.3;
    else if (unharmed && this.nightMinReach > s.tree.radius * 0.4) s.wrath *= 1.12;
    else if (this.nightTreeDmg > max * 0.15) s.wrath = Math.max(1, s.wrath * 0.85);
    if (Math.abs(s.wrath - before) > 0.01) this.emit({ type: 'wrath', value: s.wrath, up: s.wrath > before });
  }

  /** «Высвечивание»: the strongest dragonfly light covering this enemy. */
  private vulnAt(e: Enemy): number {
    const shatter = this.frozen(e) && this.propCount('timestop', 'ts-shatter') ? (this.facet('ts-crack') ? 0.7 : 0.35) : 0;
    if ((e.layer === 'under')) return shatter;
    let v = shatter + this.state.keeper.radianceT > 0 && e.lit ? ABILITIES.radiance.vuln * runeRankPower(this.state.keeper.runeRank.radiance) ** 0.5 : 0;
    for (const st of this.state.structures) {
      if (st.family !== 'dragonfly') continue;
      const ns = this.nestStats(st);
      if (Math.abs(e.x - st.x) <= ns.light!) v = Math.max(v, (ns.vuln ?? 0) + this.mods.vuln);
    }
    return v;
  }

  private pickTarget(e: Enemy): Target | null {
    const s = this.state;
    const def = ENEMIES[e.kind];
    const ahead = (x: number) => (x - e.x) * e.dir >= -def.radius;
    const contact = def.radius + 5;

    if (def.range > 0) {
      let best: Structure | null = null;
      let bd = Infinity;
      for (const st of s.structures) {
        if (st.underground || st.crown || !ahead(st.x)) continue;
        const d = Math.abs(st.x - e.x);
        if (d < bd) { bd = d; best = st; }
      }
      const treeD = Math.abs(WORLD.treeX - e.x) - WORLD.treeReach;
      if (best && bd <= def.range && bd <= treeD) return { kind: 'structure', s: best, x: best.x };
      if (treeD <= def.range) return { kind: 'tree', x: WORLD.treeX };
      return null;
    }

    for (const u of s.soldiers) {
      if (u.hp <= 0 || !ahead(u.x)) continue;
      if (Math.abs(u.x - e.x) <= contact + 2) return { kind: 'soldier', u, x: u.x };
    }
    for (const st of s.structures) {
      if (st.underground || st.crown) continue;
      if (!NESTS[st.family].blocks && !def.smashesStructures) continue;
      if (!ahead(st.x)) continue;
      if (Math.abs(st.x - e.x) <= contact + 4) return { kind: 'structure', s: st, x: st.x };
    }
    const k = s.keeper;
    if (k.alive && e.kind !== 'mother' && Math.abs(k.x - e.x) <= contact) return { kind: 'keeper', x: k.x };
    if (Math.abs(WORLD.treeX - e.x) <= WORLD.treeReach + def.radius) return { kind: 'tree', x: WORLD.treeX };
    return null;
  }

  private spitAcid(e: Enemy, target: Target) {
    const s = this.state;
    const sx = e.x + e.dir * 6;
    const sy = WORLD.groundY - 14;
    const tx = target.x;
    const ty = WORLD.groundY - (target.kind === 'tree' ? 40 : 14);
    const flight = 0.9;
    s.projectiles.push({
      id: s.nextId++, kind: 'acid', x: sx, y: sy, vx: (tx - sx) / flight,
      vy: (ty - sy) / flight - 0.5 * 260 * flight, damage: ENEMIES[e.kind].damage * this.enemyDamageMul(),
      targetId: target.kind === 'tree' ? -1 : target.kind === 'structure' ? target.s.id : -2,
      tx, ty, pierce: 0, hit: [], life: flight, age: 0,
    });
    this.emit({ type: 'shoot', kind: 'acid', x: sx, y: sy });
  }

  // ───────────────────────────── nests ───────────────────────────────

  private damageStructure(st: Structure, amount: number, attacker?: Enemy) {
    const s = this.state;
    const k = s.keeper;
    const chitin = k.swarmT > 0 && this.propCount('swarm', 'sw-shield') && Math.abs(st.x - k.swarmX) <= this.swarmReach() ? (this.facet('sw-carapace') ? 0.5 : 0.7) : 1;
    st.hp -= amount * chitin;
    st.hitFlash = 0.12;
    this.emit({ type: 'structureHit', id: st.id, x: st.x });
    const ns = this.nestStats(st);
    if (attacker && ns.thorns) this.damageEnemy(attacker, ns.thorns);
    if (st.hp <= 0) {
      s.structures = s.structures.filter((x) => x !== st);
      if (st.family === 'beetle' && this.mods.beetleRevive) this.graveyard.push({ slotId: st.slotId, tier: st.tier, spec: st.spec });
      this.emit({ type: 'structureLost', family: st.family, x: st.x, y: st.y, underground: st.underground });
    }
  }

  private refreshNestHp() {
    for (const st of this.state.structures) {
      const hp = this.nestStats(st).hp;
      if (hp !== st.maxHp) { st.hp += hp - st.maxHp; st.maxHp = hp; }
    }
  }

  /** Can a nest target this surface enemy? (lit, or near the light with the hive capstone) */
  private visibleTo(st: Structure, e: Enemy): boolean {
    if (e.lit) return true;
    if (st.family === 'hive' && this.mods.hiveSeesDark) {
      return this.isLit(e.x + Math.sign(WORLD.treeX - e.x) * 30, false);
    }
    return false;
  }

  private hasteMult(st: Structure): number {
    let m = st.haste > 0 ? 1.3 : 1;
    if (this.state.keeper.timeStopT > 0 && this.facet('ts-hush')) m *= 1.5;
    for (const t of this.state.tempLights) if (t.haste && Math.abs(st.x - t.x) <= t.radius) { m *= 1 + t.haste; break; }
    const k = this.state.keeper;
    if (k.swarmT > 0 && Math.abs(st.x - k.swarmX) <= this.swarmReach()) m *= 1 + ABILITIES.swarm.haste * runeRankPower(k.runeRank.swarm) ** 0.5;
    if (this.mods.dragonflyHaste) {
      for (const d of this.state.structures) {
        if (d.family === 'dragonfly' && d !== st && Math.abs(d.x - st.x) <= this.nestStats(d).light!) { m *= 1.2; break; }
      }
    }
    return m;
  }

  private updateStructures(dt: number) {
    for (const st of this.state.structures) {
      if (st.crown) {
        const p = crownPos(this.state.tree.stage, Number(st.slotId.slice(1)), this.state.tree.rings);
        st.x = p.x; st.y = p.y;
      }
      st.age += dt;
      st.hitFlash = Math.max(0, st.hitFlash - dt);
      st.haste = Math.max(0, st.haste - dt);
      st.intercept = Math.max(0, st.intercept - dt);
      st.cd -= dt * this.hasteMult(st);
      this.src = st.family;
      const ns = this.nestStats(st);
      switch (st.family) {
        case 'hive': this.tickHive(st, ns, dt); break;
        case 'beetle': this.tickBeetle(st, ns, dt); break;
        case 'dragonfly': this.tickDragonfly(st, ns, dt); break;
        case 'spider': this.tickSpider(st, ns); break;
        case 'caterpillar': break;
        case 'termite': break;
        case 'honeycomb': this.tickHoneycomb(st, ns, dt); break;
        case 'mender': this.tickMender(st, ns, dt); break;
      }
    }
  }

  private surfaceTargets(st: Structure, range: number): Enemy[] {
    return this.state.enemies
      .filter((e) => !e.dead && !(e.layer === 'under') && this.visibleTo(st, e) && Math.abs(e.x - st.x) <= range)
      .sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
  }

  private tickHive(st: Structure, ns: NestStats, dt: number) {
    if (ns.pierce && (st.beamT ?? 0) > 0) { this.burnBeam(st, ns, dt); return; }
    if (st.cd > 0) return;
    const targets = this.surfaceTargets(st, ns.range);
    if (!targets.length) return;
    st.cd = ns.rate;
    if (ns.pierce) {
      // Igg-Beam: a lasting beam that burns the target and the creatures behind it
      st.beamT = HIVE_BEAM.time;
      st.beamTo = targets[0].id;
      st.beamTick = 0;
      this.burnBeam(st, ns, 0);
      return;
    }
    const volley = ns.volley ?? 1;
    for (let i = 0; i < volley; i++) {
      const t = targets[i % targets.length];
      st.aim = Math.sign(t.x - st.x) || st.aim;
      this.fireHoming('arrow', st.x + (i - (volley - 1) / 2) * 3, (st.crown ? st.y + 3 : WORLD.groundY - 34) - i * 2, t, ns.damage, 300);
    }
    this.emit({ type: 'shoot', kind: 'arrow', x: st.x, y: st.crown ? st.y : WORLD.groundY - 34 });
  }

  /** Igg-Beam tick: re-aims at the target (or the next one) and burns the line behind it. */
  private burnBeam(st: Structure, ns: NestStats, dt: number) {
    const s = this.state;
    st.beamT = (st.beamT ?? 0) - dt;
    let t = s.enemies.find((e) => e.id === st.beamTo && !e.dead && e.layer !== 'under' && Math.abs(e.x - st.x) <= ns.range * 1.1);
    if (!t) {
      t = this.surfaceTargets(st, ns.range)[0];
      if (!t) { st.beamT = 0; return; }
      st.beamTo = t.id;
    }
    st.aim = Math.sign(t.x - st.x) || st.aim;
    st.beamTick = (st.beamTick ?? 0) - dt;
    if (st.beamTick > 0) return;
    st.beamTick = HIVE_BEAM.tick;
    const out = Math.sign(t.x - WORLD.treeX) || 1;
    const line = s.enemies
      .filter((e) => !e.dead && e.layer !== 'under' && (e.x - t!.x) * out >= 0 && Math.abs(e.x - t!.x) <= 70)
      .sort((a, b) => Math.abs(a.x - t!.x) - Math.abs(b.x - t!.x))
      .slice(0, ns.pierce);
    // the volley's damage is spread over the beam's life (a bit more in total for holding it)
    const per = ns.damage * HIVE_BEAM.total * (HIVE_BEAM.tick / HIVE_BEAM.time);
    for (const e of line) this.damageEnemy(e, per, true, true, true);
  }

  /** Медовые соты: passive income, shown as a small gift every few seconds. */
  private honeyAcc = new Map<number, { a: number; s: number }>();
  private tickHoneycomb(st: Structure, ns: NestStats, dt: number) {
    const acc = this.honeyAcc.get(st.id) ?? { a: 0, s: 0 };
    acc.a += (ns.income ?? 0) * dt;
    acc.s += (ns.starIncome ?? 0) * dt;
    const s = this.state;
    if (acc.a >= 5) {
      const v = Math.floor(acc.a);
      acc.a -= v;
      s.amber += v; s.stats.amberCollected += v;
      this.emit({ type: 'pickup', kind: 'amber', x: st.x, y: st.y, value: v });
    }
    if (acc.s >= 1) {
      const v = Math.floor(acc.s);
      acc.s -= v;
      s.star += v; s.stats.starCollected += v;
      this.emit({ type: 'pickup', kind: 'star', x: st.x, y: st.y, value: v });
    }
    this.honeyAcc.set(st.id, acc);
  }

  /** Жуки-лекари: heal the weakest nest in range (or all of them), and the tree with Живица. */
  private tickMender(st: Structure, ns: NestStats, dt: number) {
    const s = this.state;
    const hurt = s.structures.filter((o) => !o.crown && o.hp < o.maxHp && Math.abs(o.x - st.x) <= ns.range);
    const targets = ns.healAll ? hurt : hurt.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp).slice(0, 1);
    for (const o of targets) {
      o.hp = Math.min(o.maxHp, o.hp + (ns.heal ?? 0) * dt);
      this.healFx(o.id, o.x, o.underground ? o.y : WORLD.groundY - 20, (ns.heal ?? 0) * dt);
      if (st.cd <= 0) this.emit({ type: 'mend', x: st.x, y: st.y, tx: o.x, ty: o.underground ? o.y : WORLD.groundY - 14 });
    }
    if (st.cd <= 0 && targets.length) st.cd = 0.5;
    if (ns.healTree && s.tree.hp < this.treeMaxHp()) {
      s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + ns.healTree * dt);
      this.healFx(-1, WORLD.treeX, WORLD.groundY - 40, ns.healTree * dt);
    }
  }

  private tickBeetle(st: Structure, ns: NestStats, dt: number) {
    if (ns.regen && this.isLit(st.x, false)) st.hp = Math.min(st.maxHp, st.hp + ns.regen * dt);
    if (ns.heal) {
      // Светожук-Целитель: healing light dome over neighbouring nests
      for (const o of this.state.structures) {
        if (o === st || Math.abs(o.x - st.x) > ns.range || o.hp >= o.maxHp) continue;
        o.hp = Math.min(o.maxHp, o.hp + ns.heal * dt);
        this.healFx(o.id, o.x, o.underground ? o.y : WORLD.groundY - 20, ns.heal * dt);
      }
      st.cd -= 0;
    }
    if (!ns.knock || st.cd > 0) return;
    const out = st.x < WORLD.treeX ? -1 : 1;
    const hit = this.state.enemies.filter((e) => !e.dead && e.layer === 'ground'
      && (e.x - st.x) * out >= -4 && Math.abs(e.x - st.x) <= ns.range);
    if (!hit.length) return;
    st.cd = ns.rate;
    for (const e of hit) {
      this.damageEnemy(e, ns.damage, true, true);
      this.stunEnemy(e, ns.stun ?? 1);
      if (e.kind !== 'mother') e.kick = out * ns.knock! * ENEMIES[e.kind].ccMult;
    }
    this.emit({ type: 'ram', x: st.x, dir: out });
  }

  /** Little dragonflies of a nest (more with level and merge stars). */
  dragonflyDrones(st: Structure) {
    const k = this.state.keeper;
    const vortex = k.swarmT > 0 && this.facet('sw-sky') && Math.abs(st.x - k.swarmX) <= this.swarmReach() ? 2 : 1;
    return (STING.drones + st.tier + st.merge) * vortex;
  }

  private tickDragonfly(st: Structure, ns: NestStats, dt: number) {
    const s = this.state;
    const r = ns.light!;
    // sorties: the swarm flies out to a creature in the Igg-Tree's light and stings it
    const reach = r * STING.reach;
    let foe = s.enemies.find((e) => e.id === st.stingTo && !e.dead && e.layer !== 'under' && e.lit && Math.abs(e.x - st.x) <= reach);
    if (!foe) {
      foe = s.enemies
        .filter((e) => !e.dead && e.layer !== 'under' && e.lit && Math.abs(e.x - st.x) <= reach)
        .sort((a, b) => Math.abs(a.x - st.x) - Math.abs(b.x - st.x))[0];
      st.stingTo = foe?.id ?? 0;
    }
    if (foe) this.damageQuiet(foe, ns.burn! * STING.share * this.dragonflyDrones(st) * (foe.layer === 'air' ? DRAGONFLY_VS_AIR : 1) * dt, false);
    for (const e of s.enemies) {
      if (e.dead || (e.layer === 'under') || Math.abs(e.x - st.x) > r) continue;
      this.damageQuiet(e, ns.burn! * dt * (e.layer === 'air' ? DRAGONFLY_VS_AIR : 1));
    }
    if (!ns.chain || st.cd > 0) return;
    let cur: Enemy | undefined = s.enemies
      .filter((e) => !e.dead && !(e.layer === 'under') && Math.abs(e.x - st.x) <= r)
      .sort((a, b) => Math.abs(a.x - st.x) - Math.abs(b.x - st.x))[0];
    if (!cur) return;
    st.cd = ns.rate;
    const pts: Array<[number, number]> = [[st.x, WORLD.groundY - 34]];
    const hit = new Set<number>();
    for (let i = 0; i < ns.chain && cur; i++) {
      hit.add(cur.id);
      pts.push([cur.x, cur.y - ENEMIES[cur.kind].height * 0.6]);
      this.damageEnemy(cur, ns.damage * (1 - i * 0.1) * (cur.layer === 'air' ? DRAGONFLY_VS_AIR : 1), true, true);
      const from: Enemy = cur;
      cur = s.enemies
        .filter((e) => !e.dead && !hit.has(e.id) && !(e.layer === 'under') && e.lit && Math.abs(e.x - from.x) <= 70)
        .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))[0];
    }
    this.emit({ type: 'chain', points: pts });
  }

  /**
   * Weavers bite worms underground first; with nothing below they strike creatures walking on
   * the surface above their knot (half damage, full with the «Паутина над землёй» capstone).
   */
  private tickSpider(st: Structure, ns: NestStats) {
    if (st.cd > 0) return;
    const s = this.state;
    const inReach = (e: Enemy) => !e.dead && e.jumping <= 0 && Math.hypot(e.x - st.x, (e.y - st.y) * 0.8) <= ns.range;
    // silk shot straight up through the soil: surface creatures above the knot (horizontal reach)
    const above = (e: Enemy) => !e.dead && e.jumping <= 0 && Math.abs(e.x - st.x) <= ns.range * 1.2;
    const worms = s.enemies.filter((e) => (e.layer === 'under') && inReach(e));
    const surface = worms.length ? [] : s.enemies.filter((e) => e.layer === 'ground' && above(e));
    const prey = worms.length ? worms : surface;
    if (!prey.length) return;
    prey.sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
    const t = prey[0];
    const onSurface = !(t.layer === 'under');
    // silk shot up through the soil is a side job: weaker and slower than biting worms
    st.cd = ns.rate * (onSurface ? SPIDER_SURFACE.rate : 1);
    const mult = onSurface ? (this.mods.spiderSurface ? SPIDER_SURFACE.capstone : SPIDER_SURFACE.damage) : 1;
    this.damageEnemy(t, ns.damage * mult, true, true);
    if (onSurface) t.web = Math.max(t.web, 1.2);
    if (ns.stun) t.rooted = Math.max(t.rooted, ns.stun * ENEMIES[t.kind].ccMult * (onSurface ? 0.6 : 1));
    if (ns.poison) {
      for (const e of prey) { e.poison = ns.poison * mult; e.poisonTime = ns.poisonTime ?? 4; }
    }
    this.emit({ type: 'spikeStrike', x: st.x, y: st.y, tx: t.x, ty: onSurface ? t.y - 4 : t.y, web: !!ns.stun || onSurface });
  }

  /** Damage-over-time without spamming hit events. */
  private damageQuiet(e: Enemy, amount: number, aura = true) {
    if (e.dead) return;
    const def = ENEMIES[e.kind];
    const fog = this.fogLevel(e);
    const lit = def.worm && this.isLit(e.x, e.layer === 'under') ? WORM_LIGHT_MULT - (WORM_LIGHT_MULT - 1) * fog : 1;
    const mult = aura ? lit * (1 - (1 - FOG.aura) * fog) : lit;
    this.logDmg(Math.min(amount * mult, Math.max(0, e.hp)));
    e.hp -= amount * mult;
    if (e.hp <= 0) this.killEnemy(e);
  }

  private fireHoming(kind: 'arrow' | 'spark', x: number, y: number, t: Enemy, damage: number, speed: number) {
    const s = this.state;
    const ty = t.y - ENEMIES[t.kind].height * 0.5;
    const d = Math.hypot(t.x - x, ty - y) || 1;
    s.projectiles.push({
      id: s.nextId++, kind, x, y, vx: ((t.x - x) / d) * speed, vy: ((ty - y) / d) * speed - (kind === 'arrow' ? 40 : 0),
      damage, targetId: t.id, tx: t.x, ty, pierce: 0, hit: [], life: 3, age: 0,
    });
  }

  // ───────────────────────────── tree ────────────────────────────────

  private damageTree(amount: number, by: EnemyKind, attacker?: Enemy) {
    const t = this.state.tree;
    this.nightTreeDmg += amount;
    this.state.stats.treeDmgBy[by] = (this.state.stats.treeDmgBy[by] ?? 0) + amount;
    let dmg = amount;
    if (t.shield > 0) {
      const absorbed = Math.min(t.shield, dmg);
      t.shield -= absorbed;
      dmg -= absorbed;
    }
    t.hp -= dmg;
    t.hitFlash = 0.15;
    if (attacker && this.mods.treeReflect > 0 && ENEMIES[attacker.kind].range === 0) {
      this.damageEnemy(attacker, amount * this.mods.treeReflect);
    }
    if (t.stage + 1 >= TREE.shieldStage && !t.shieldUsed && t.hp < this.treeMaxHp() * TREE.shieldThreshold) {
      t.shieldUsed = true;
      t.shield = TREE.shieldAmount;
      this.emit({ type: 'shield' });
    }
    this.emit({ type: 'treeHit', amount: dmg, by });
  }

  private grow() {
    const s = this.state;
    const t = s.tree;
    const prevR = s.tree.radius;
    t.growth -= this.stageDef.growCost;
    t.stage++;
    const prevMax = Math.round(TREE_STAGES[t.stage - 1].maxHp * (1 + this.mods.treeHp));
    t.hp = Math.min(this.treeMaxHp(), t.hp + (this.treeMaxHp() - prevMax) + this.treeMaxHp() * TREE.growHeal);
    for (const e of s.enemies) {
      if (e.dead || (e.layer === 'under')) continue;
      const d = Math.abs(e.x - WORLD.treeX);
      if (d > prevR && d <= this.treeRadius()) this.damageEnemy(e, TREE.growBurn);
    }
    this.refreshNestHp();
    if (TREE_BRANCHES[t.stage]) s.choices.push({ kind: 'branch', stage: t.stage });
    this.emit({ type: 'treeGrew', stage: t.stage });
  }

  private updateTreeRadius(dt: number) {
    const t = this.state.tree;
    const target = this.treeRadius();
    if (t.radius < target) t.radius = Math.min(target, t.radius + 70 * dt);
    else t.radius = target;
  }

  private updateTree(dt: number) {
    this.src = 'tree';
    const s = this.state;
    const t = s.tree;
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    if (s.phase === 'night' && this.mods.treeRegen > 0) t.hp = Math.min(this.treeMaxHp(), t.hp + this.mods.treeRegen * dt);
    const stageNo = t.stage + 1;
    if (stageNo >= TREE.sparkStage) {
      t.sparkCd -= dt;
      if (t.sparkCd <= 0) {
        const cands = s.enemies
          .filter((e) => !e.dead && !(e.layer === 'under') && e.lit && Math.abs(e.x - WORLD.treeX) <= TREE.sparkRange)
          .sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
        if (cands.length) {
          t.sparkCd = TREE.sparkRate;
          const n = 1 + this.mods.sparkCount;
          for (let i = 0; i < n; i++) {
            const e = cands[i % cands.length];
            this.fireHoming('spark', WORLD.treeX + (e.x < WORLD.treeX ? -10 : 10), WORLD.groundY - 70, e,
              TREE.sparkDamage * this.treePower() * (1 + this.mods.sparkDamage), 220);
          }
          this.emit({ type: 'shoot', kind: 'spark', x: WORLD.treeX, y: WORLD.groundY - 70 });
        }
      }
    }
    if (stageNo >= TREE.polariaStage) this.tickPolaria(dt);
    if (stageNo >= TREE.rootBurnStage) {
      for (const e of s.enemies) {
        if (e.dead || !(e.layer === 'under')) continue;
        if (Math.abs(e.x - WORLD.treeX) <= TREE.rootBurnRange) this.damageQuiet(e, TREE.rootBurnDps * (1 + this.mods.rootBurn) * dt);
      }
    }
  }

  private polariaCd: number[] = [];
  /** per-night measurements for «Гнев Тьмы» */
  private nightMinReach = Infinity;
  private nightTreeDmg = 0;
  private healAcc = new Map<number, number>();

  /** Throttled heal feedback: one event per target every ~0.4 s with the healed amount. */
  private healFx(key: number, x: number, y: number, amount: number) {
    const acc = (this.healAcc.get(key) ?? 0) + amount;
    if (acc >= 6 || (acc > 0 && this.state.time % 0.4 < STEP)) {
      this.emit({ type: 'heal', x, y, amount: acc });
      this.healAcc.set(key, 0);
    } else this.healAcc.set(key, acc);
  }
  private nightDeadline = Infinity;

  /** Polaria drone positions (golden jellyfish drifting around the crown). */
  polariaPositions(): Array<[number, number]> {
    const n = TREE.polariaCount + this.mods.polaria;
    const t = this.state.time;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.35;
      out.push([WORLD.treeX + Math.cos(a) * (70 + (i % 2) * 40), WORLD.groundY - 120 + Math.sin(a * 1.3) * 26]);
    }
    return out;
  }

  private tickPolaria(dt: number) {
    const s = this.state;
    const pos = this.polariaPositions();
    for (let i = 0; i < pos.length; i++) {
      this.polariaCd[i] = (this.polariaCd[i] ?? this.rand()) - dt;
      if (this.polariaCd[i] > 0) continue;
      const [px, py] = pos[i];
      const t = s.enemies
        .filter((e) => !e.dead && !(e.layer === 'under') && e.lit && Math.abs(e.x - px) <= TREE.polariaRange)
        .sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px))[0];
      if (!t) continue;
      this.polariaCd[i] = TREE.polariaRate;
      this.damageEnemy(t, TREE.polariaDamage * this.treePower(), true, true);
      this.emit({ type: 'polaria', x: px, y: py, tx: t.x, ty: t.y - ENEMIES[t.kind].height * 0.5 });
    }
  }

  // ───────────────────────────── projectiles ─────────────────────────

  private updateProjectiles(dt: number) {
    const s = this.state;
    const k = s.keeper;
    const spawned: typeof s.projectiles = [];
    for (const p of s.projectiles) {
      p.age += dt;
      p.life -= dt;
      this.src = PROJ_SRC[p.kind];
      if (p.kind === 'acid') {
        p.vy += 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        // dragonflies (level 2+) shoot acid globs out of the air inside their light
        const df = s.structures.find((st) => st.family === 'dragonfly' && st.tier >= 1 && st.intercept <= 0
          && Math.abs(p.x - st.x) <= this.nestStats(st).light!);
        if (df) {
          df.intercept = 1.4;
          this.emit({ type: 'intercept', x: p.x, y: p.y, fx: df.x, fy: WORLD.groundY - 34 });
          p.life = 0;
          continue;
        }
        if (p.life <= 0) {
          if (p.targetId === -1) this.damageTree(p.damage, 'spitter');
          else {
            const st = s.structures.find((x) => x.id === p.targetId);
            if (st) this.damageStructure(st, p.damage);
          }
          this.emit({ type: 'acidSplash', x: p.tx, y: p.ty });
        }
        continue;
      }
      if (p.kind === 'meteor') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          const def = ABILITIES.starfall;
          for (const e of s.enemies) {
            if (e.dead || (e.layer === 'under') || Math.abs(e.x - p.tx) > (p.radius ?? def.impactRadius) + ENEMIES[e.kind].radius) continue;
            if (p.breakArmor) e.armorBreak = p.breakArmor;
            this.damageEnemy(e, p.damage * (e.layer === 'air' && this.facet('sf-sky') ? 2 : 1));
            this.stunEnemy(e, p.stun ?? def.stun);
            if (e.dead && this.facet('sf-refund')) k.charge = Math.min(def.chargeMax, k.charge + 4);
          }
          s.burns.push({ x: p.tx, halfWidth: (p.radius ?? def.impactRadius) * 0.7, dps: def.burnDps * this.abilityMult('starfall') * (1 + this.mods.starfallBurn), life: (p.burnTime ?? def.burnTime) * (this.facet('sf-ash') ? 2 : 1) });
          this.emit({ type: 'meteor', x: p.tx });
        }
        continue;
      }
      if (p.kind === 'wave') {
        p.x += p.vx * dt;
        for (const e of s.enemies) {
          if (e.dead || p.hit.includes(e.id) || Math.abs(e.x - p.x) > ENEMIES[e.kind].radius + 6) continue;
          if ((e.layer === 'under') && !p.deep || e.layer === 'air') continue;
          p.hit.push(e.id);
          this.damageEnemy(e, p.damage);
          if (p.stun) this.stunEnemy(e, p.stun);
          if (p.knock && !ENEMIES[e.kind].boss && e.layer === 'ground') e.kick = Math.sign(p.vx) * p.knock * ENEMIES[e.kind].ccMult;
        }
        continue;
      }
      if (p.kind === 'spear') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const def = ABILITIES.spear;
        for (const e of s.enemies) {
          if (e.dead || p.pierce <= 0 || p.hit.includes(e.id)) continue;
          const ed = ENEMIES[e.kind];
          if (e.layer === 'under') continue;
          if (Math.abs(e.x - p.x) <= ed.radius + 3 && p.y >= e.y - ed.height - 4) {
            const n = p.hit.length;
            p.hit.push(e.id);
            p.pierce--;
            let dmg = p.damage * Math.max(0.25, 1 - (this.facet('sp-lance') ? 0 : def.falloff) * n);
            if (e.layer === 'air') dmg *= p.airMult ?? 1;
            if (this.mods.spearRhythm) {
              k.rhythm++;
              k.rhythmT = 2;
              if (k.rhythm % 3 === 0) dmg *= this.facet('sp-crescendo') ? 3 : 2;
            }
            if (this.mods.spearBeacon) e.marked = this.facet('sp-mark') ? 8 : 4;
            if (this.facet('sp-flame')) s.burns.push({ x: e.x, halfWidth: 12, dps: p.damage * 0.25, life: 2.5 });
            this.damageEnemy(e, dmg);
            if (p.knock && !ENEMIES[e.kind].boss) e.kick = Math.sign(p.vx) * p.knock * ENEMIES[e.kind].ccMult;
          }
        }
        if (p.pierce <= 0 && this.mods.spearRicochet && (p.bounces ?? 0) < (this.facet('sp-chain') ? 2 : 1)) {
          const next = s.enemies
            .filter((e) => !e.dead && !p.hit.includes(e.id) && !(e.layer === 'under') && Math.abs(e.x - p.x) < 130)
            .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
          if (next) {
            const dir = Math.sign(next.x - p.x) || 1;
            spawned.push({
              ...p, id: s.nextId++, vx: dir * def.speed, damage: p.damage * 0.6, pierce: 1, hit: [...p.hit],
              life: 0.5, age: 0, bounced: true, bounces: (p.bounces ?? 0) + 1,
            });
          }
        }
        if (p.pierce <= 0 || p.x < -20 || p.x > WORLD.width + 20) p.life = 0;
        continue;
      }
      // homing arrow / spark
      const t = s.enemies.find((e) => e.id === p.targetId && !e.dead);
      if (t) {
        p.tx = t.x;
        p.ty = t.y - ENEMIES[t.kind].height * 0.5;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const speed = Math.hypot(p.vx, p.vy);
      if (d <= speed * dt + 2) {
        if (t) this.damageEnemy(t, p.damage, true, true);
        p.life = 0;
        continue;
      }
      const kk = Math.min(1, dt * 12);
      p.vx += ((dx / d) * speed - p.vx) * kk;
      p.vy += ((dy / d) * speed - p.vy) * kk;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    s.projectiles.push(...spawned);
  }

  // ───────────────────────────── drops ───────────────────────────────

  /**
   * Loot life-cycle (readable and chore-free):
   * falls → after a moment rises and hovers with a glow → inside the Circle it flies to the
   * Tree by itself; outside the light it hovers for a while, then drifts up to the sky and is
   * lost unless the Ascended or the caterpillars grab it first.
   */
  private updateDrops(dt: number) {
    const s = this.state;
    const k = s.keeper;
    const magnet = KEEPER.magnetRadius * (1 + this.mods.magnet);
    const bank = (d: Drop) => {
      if (d.kind === 'amber') { s.amber += d.value; s.stats.amberCollected += d.value; } else { s.star += d.value; s.stats.starCollected += d.value; }
      d.life = 0;
      this.emit({ type: 'pickup', kind: d.kind, x: d.x, y: d.y, value: d.value });
    };
    for (const d of s.drops) {
      d.age += dt;
      if (d.mode === 3) {
        // drifting away to the sky
        d.y -= (40 + d.age * 10) * dt;
        if (d.y < WORLD.groundY - 140) d.life = 0;
        continue;
      }
      const dist = Math.abs(d.x - k.x) + Math.abs(d.y - (WORLD.groundY - 10)) * 0.4;
      if (k.alive && dist <= magnet && d.mode !== 2) d.pulled = true;
      if (d.pulled && k.alive) {
        const dx = k.x - d.x;
        const dy = WORLD.groundY - 10 - d.y;
        const len = Math.hypot(dx, dy) || 1;
        const sp = KEEPER.magnetSpeed + d.age * 40;
        d.x += (dx / len) * sp * dt;
        d.y += (dy / len) * sp * dt;
        if (len <= KEEPER.pickupRadius) bank(d);
        continue;
      }
      if (d.mode === 2) {
        // flying home to the crown
        const tx = WORLD.treeX, ty = WORLD.groundY - 50;
        const dx = tx - d.x, dy = ty - d.y;
        const len = Math.hypot(dx, dy) || 1;
        const sp = 120 + d.age * 30;
        d.x += (dx / len) * sp * dt;
        d.y += (dy / len) * sp * dt - Math.sin(Math.min(1, len / 200) * Math.PI) * 20 * dt;
        if (len < 6) bank(d);
        continue;
      }
      if (d.mode === 0) {
        d.vy += 300 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.x = Math.max(6, Math.min(WORLD.width - 6, d.x));
        if (d.y >= WORLD.groundY - 3) {
          d.y = WORLD.groundY - 3;
          d.grounded = true;
          d.vx = 0;
          d.vy = 0;
          d.mode = 1;
          d.hover = 0;
        }
        continue;
      }
      // hovering: rise to eye level and glow
      d.hover += dt;
      const hy = WORLD.groundY - 12 - Math.sin(d.age * 3 + d.id) * 2;
      if (d.hover > 0.6) d.y += (hy - d.y) * Math.min(1, dt * 4);
      const lit = Math.abs(d.x - WORLD.treeX) <= s.tree.radius;
      if (lit && d.hover > 1.6 && d.claimed === 0) { d.mode = 2; d.age = 0; continue; }
      if (!lit) {
        d.life -= dt;
        if (d.life <= 0) { d.mode = 3; d.age = 0; d.life = 9; this.emit({ type: 'lostLoot', x: d.x, y: d.y }); }
      }
    }
  }

  /**
   * Caterpillar collectors. Each gathers up to `carry` drops per trip within its nest's reach,
   * picking targets so that workers spread out (a drop already aimed at, or one right next to
   * another worker's target, costs extra), then carries the bundle to the Tree. Idle workers
   * wander around their cocoon instead of piling up.
   */
  private updateWorkers(dt: number) {
    const s = this.state;
    const nests = s.structures.filter((x) => x.family === 'caterpillar');
    s.workers = s.workers.filter((w) => {
      if (nests.some((n) => n.id === w.nestId)) return true;
      if (w.carry.amber) this.dropAt(w.x, 'amber', w.carry.amber);
      if (w.carry.star) this.dropAt(w.x, 'star', w.carry.star);
      return false;
    });
    for (const n of nests) {
      const want = this.nestStats(n).workers ?? 0;
      const have = s.workers.filter((w) => w.nestId === n.id).length;
      for (let i = have; i < want; i++) {
        s.workers.push({
          id: s.nextId++, nestId: n.id, x: n.x, dir: 1, carry: { amber: 0, star: 0, n: 0 }, target: 0, walk: this.rand() * 3,
          home: false, descend: n.crown ? 0.9 + i * 0.3 : 0, fromY: n.y,
        });
      }
    }
    const aimed = new Map<number, number>();
    for (const w of s.workers) if (w.target) aimed.set(w.target, w.id);
    for (const w of s.workers) {
      if (w.descend > 0) { w.descend -= dt; continue; }
      const nest = nests.find((n) => n.id === w.nestId)!;
      const ns = this.nestStats(nest);
      const speed = ns.speed ?? 40;
      const cap = ns.carry ?? 3;
      let goal: number;
      if (w.home) {
        goal = WORLD.treeX;
        if (Math.abs(w.x - goal) < 6) {
          const bonus = 1 + (ns.bonus ?? 0);
          const a = Math.round(w.carry.amber * bonus), st = Math.round(w.carry.star * bonus);
          if (a) { s.amber += a; s.stats.amberCollected += a; this.emit({ type: 'pickup', kind: 'amber', x: w.x, y: WORLD.groundY - 4, value: a }); }
          if (st) { s.star += st; s.stats.starCollected += st; this.emit({ type: 'pickup', kind: 'star', x: w.x, y: WORLD.groundY - 4, value: st }); }
          w.carry = { amber: 0, star: 0, n: 0 };
          w.home = false;
        }
      } else {
        let d = s.drops.find((x) => x.id === w.target && x.life > 0 && !x.pulled && x.mode !== 3);
        if (!d) {
          if (w.target) aimed.delete(w.target);
          w.target = 0;
          // spread out: penalise drops near other workers' targets
          const targets = [...aimed.keys()].map((id) => s.drops.find((x) => x.id === id)).filter((x): x is Drop => !!x);
          let best: Drop | undefined;
          let bestScore = Infinity;
          for (const x of s.drops) {
            if (x.pulled || x.mode === 2 || x.mode === 3 || x.claimed !== 0 || aimed.has(x.id)) continue;
            // the whole world is in reach; drops beyond the nest's reach just cost more to choose
            const far = Math.max(0, Math.abs(x.x - nest.x) - ns.range);
            const crowd = targets.filter((t) => Math.abs(t.x - x.x) < 24).length;
            const score = Math.abs(x.x - w.x) + crowd * 60 + far * 0.5;
            if (score < bestScore) { bestScore = score; best = x; }
          }
          if (best) { d = best; d.claimed = w.id; w.target = d.id; aimed.set(d.id, w.id); }
        }
        if (d) {
          goal = d.x;
          if (Math.abs(w.x - d.x) < 4) {
            if (d.kind === 'amber') w.carry.amber += d.value; else w.carry.star += d.value;
            w.carry.n++;
            d.life = 0;
            aimed.delete(d.id);
            w.target = 0;
            if (w.carry.n >= cap) w.home = true;
          }
        } else if (w.carry.n > 0) {
          w.home = true;
          goal = WORLD.treeX;
        } else {
          // idle: wander around the cocoon
          goal = nest.x + Math.sin(s.time * 0.5 + w.id * 1.7) * 26;
        }
      }
      const dx = goal - w.x;
      if (Math.abs(dx) > 1) {
        w.dir = dx > 0 ? 1 : -1;
        // outside the light they crawl slower
        const dark = this.isLit(w.x, false) ? 1 : 0.55;
        w.x += w.dir * Math.min(Math.abs(dx), speed * dark * (w.home || w.target ? 1 : 0.4) * dt);
        w.walk += dt;
      }
    }
  }

  /**
   * Golden Termite squads: warriors hold a rally line at their mound, charge creatures that
   * come within the mound's reach, bite them in melee and block their way. Fallen warriors
   * hatch again after `respawn` seconds.
   */
  private updateSoldiers(dt: number) {
    this.src = 'termite';
    const s = this.state;
    const mounds = s.structures.filter((x) => x.family === 'termite');
    s.soldiers = s.soldiers.filter((u) => mounds.some((m) => m.id === u.nestId));
    for (const m of mounds) {
      const ns = this.nestStats(m);
      const want = ns.soldiers ?? 0;
      const squad = s.soldiers.filter((u) => u.nestId === m.id);
      for (let i = squad.length; i < want; i++) {
        const u: Soldier = { id: s.nextId++, nestId: m.id, x: m.x, dir: 1, hp: ns.soldierHp ?? 80, maxHp: ns.soldierHp ?? 80, cd: 0, respawn: 0, walk: 0, hitFlash: 0 };
        s.soldiers.push(u);
        squad.push(u);
      }
      const out = m.x < WORLD.treeX ? -1 : 1;
      // the squad holds the edge of the Circle on its side and fights whatever comes near
      const rally = WORLD.treeX + out * Math.max(Math.abs(m.x - WORLD.treeX) + 10, s.tree.radius - 8);
      squad.forEach((u, i) => {
        u.maxHp = ns.soldierHp ?? u.maxHp;
        u.hitFlash = Math.max(0, u.hitFlash - dt);
        if (u.hp <= 0) {
          u.respawn -= dt;
          if (u.respawn <= 0) { u.hp = u.maxHp; u.x = m.x; }
          return;
        }
        u.cd -= dt;
        let foe: Enemy | undefined;
        let fd = Infinity;
        for (const e of s.enemies) {
          if (e.dead || e.layer !== 'ground' || e.jumping > 0 || Math.abs(e.x - rally) > ns.range) continue;
          const d = Math.abs(e.x - u.x);
          if (d < fd) { fd = d; foe = e; }
        }
        let goal = rally - out * ((i % 4) * 6);
        if (foe) {
          goal = foe.x - Math.sign(foe.x - u.x) * (ENEMIES[foe.kind].radius + 3);
          if (fd <= ENEMIES[foe.kind].radius + 5 && u.cd <= 0) {
            u.cd = ns.rate;
            const clich = s.keeper.swarmT > 0 && this.facet('sw-termite') && Math.abs(u.x - s.keeper.swarmX) <= this.swarmReach() ? 1.5 : 1;
            this.damageEnemy(foe, ns.damage * clich, true, true);
          }
        }
        const dx = goal - u.x;
        if (Math.abs(dx) > 1) {
          u.dir = dx > 0 ? 1 : -1;
          u.x += u.dir * Math.min(Math.abs(dx), 70 * dt);
          u.walk += dt;
        }
      });
    }
  }

  private damageSoldier(u: Soldier, amount: number, attacker?: Enemy) {
    u.hp -= amount;
    u.hitFlash = 0.12;
    const m = this.state.structures.find((x) => x.id === u.nestId);
    const ns = m ? this.nestStats(m) : null;
    if (attacker && ns?.thorns) this.damageEnemy(attacker, ns.thorns);
    if (u.hp <= 0) {
      u.hp = 0;
      u.respawn = ns?.respawn ?? 8;
    }
  }

  private dropAt(x: number, kind: DropKind, value: number) {
    const s = this.state;
    s.drops.push({
      id: s.nextId++, kind, x, y: WORLD.groundY - 3, vx: 0, vy: 0, value, life: 20, grounded: true, pulled: false,
      age: 0, claimed: 0, rooted: false, mode: 1, hover: 0,
    });
  }

  private updateTempLights(dt: number) {
    const s = this.state;
    for (const t of s.tempLights) {
      t.life -= dt;
      if (!t.heal) continue;
      for (const st of s.structures) {
        if (Math.abs(st.x - t.x) > t.radius || st.hp >= st.maxHp) continue;
        st.hp = Math.min(st.maxHp, st.hp + t.heal * dt);
        this.healFx(st.id, st.x, WORLD.groundY - 20, t.heal * dt);
      }
      if (Math.abs(WORLD.treeX - t.x) <= t.radius && s.tree.hp < this.treeMaxHp()) {
        s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + t.heal * dt);
        this.healFx(-1, WORLD.treeX, WORLD.groundY - 40, t.heal * dt);
      }
    }
    for (const b of this.state.burns) b.life -= dt;
  }

  private cleanup() {
    const s = this.state;
    s.enemies = s.enemies.filter((e) => !e.dead && e.x > -60 && e.x < WORLD.width + 60);
    s.projectiles = s.projectiles.filter((p) => p.life > 0);
    s.drops = s.drops.filter((d) => d.life > 0);
    s.tempLights = s.tempLights.filter((t) => t.life > 0);
    s.burns = s.burns.filter((b) => b.life > 0);
  }

  // ───────────────────────────── util ────────────────────────────────

  private pay(p: Price) {
    this.state.amber -= p.amber;
    this.state.star -= p.star;
  }

  private emit(e: GameEvent) { this.state.events.push(e); }

  private deny(reason: string): false {
    this.emit({ type: 'denied', reason });
    return false;
  }

  /** Remove and return all events emitted since the last drain. */
  drainEvents(): GameEvent[] {
    const ev = this.state.events;
    this.state.events = [];
    return ev;
  }
}
