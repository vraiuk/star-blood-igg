import type { AbilityId } from './balance';
import { ECONOMY } from './balance';
import type { Family } from './nests';
import type { NightDef } from './nights';
import { TREE_STAGES } from './tree';

/**
 * Worlds as data (IGG2 rework, docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md §1).
 * `legacy` is the original game, untouched; `micro` («Росток») and `medium` («Поляна») are the
 * Two Crowns–style worlds. Systems that a world switches off stay in the code and are gated by
 * `features`. `applyWorld` (balance.ts) applies the geometry; `Game` reads the rest.
 */
export type WorldId = 'legacy' | 'micro' | 'medium';

/** System switches. Everything is `true` / as-today in `legacy`. */
export interface WorldFeatures {
  /** build-in-the-world control scheme (walk up, hold S to pour; no mouse on the world) — spec §3 */
  inWorld: boolean;
  /** drops fly to the Tree by themselves (`false`: only the Keeper picks them up into the purse) */
  autoLoot: boolean;
  /** crown slots C0..C9 and crown families */
  crown: boolean;
  /** «Слияние» of neighbouring nests */
  merge: boolean;
  /** nest aspects ⚔◎⚡ */
  aspects: boolean;
  /** ★-builds (star-blood nests) */
  stars: boolean;
  /** rune facets («Огранка») and star ranks */
  facets: boolean;
  /** Observer properties in rune slots */
  props: boolean;
  /** Observer's Amber ↔ Star Blood exchange */
  exchange: boolean;
  /** «Натиск» — call the next night early while stragglers roam; also the ×5 speed */
  rush: boolean;
  /** Термитник family */
  termite: boolean;
  /** the Tablet («Скрижаль»): full in legacy, simplified at a stone in medium */
  tablet: boolean;
  /** Keeper Ascension ranks and attributes */
  keeperRanks: boolean;
  /** radial build/upgrade menu on click */
  ringMenu: boolean;
  /** Observer quests (onboarding list) */
  quests: boolean;
  /** meta tree (Observer's Coins) */
  meta: boolean;
}

/** How a nest family becomes available in a world. */
export type FamilyUnlock =
  | { kind: 'start' }
  /** opens when the Tree reaches this stage (0-based index) */
  | { kind: 'stage'; stage: number }
  /** opens when the Keeper wakes its Sleeping Creature (a `sleeper` object) */
  | { kind: 'sleeper' };
export interface FamilyRule { family: Family; unlock: FamilyUnlock }

/** Win condition. */
export type WinDef =
  /** no win: survive as long as you can (legacy record run) */
  | { kind: 'endless' }
  /** survive night `night` (1-based) with the Tree at stage ≥ `stage`, then carry the Seed out (micro) */
  | { kind: 'seed'; night: number; stage: number }
  /** seal `count` Void Rifts (medium) */
  | { kind: 'rifts'; count: number };

/** Price hooks: multipliers on the base tables (later phases may add explicit tables). */
export interface WorldPrices {
  /** nest build / upgrade Amber cost */
  nest: number;
  /** Tree growth cost */
  grow: number;
  /** rune rank (Star Blood) cost */
  rune: number;
}

/**
 * Interactive objects placed in the world (spec §5, §6). `x` is the world x; params per kind.
 * Content arrives in phases 5–6; the union is fixed now so code can switch on `kind`.
 */
export type WorldObjectDef =
  /** crystal geode: hold S 1.2 s to crack it open; `reveal` = Circle radius at which it shows (thicket) */
  | { kind: 'geode'; x: number; amber: number; reveal?: number }
  /** neutral grazing fireflies: wander within `range`, drop `drop` Amber each, regrow to `count` at dawn */
  | { kind: 'herd'; x: number; count: number; range: number; drop: [number, number] }
  /** visual thicket beyond the Circle; burns away as the Circle grows past it */
  | { kind: 'thicket'; x: number; width: number }
  /** Sleeping Creature (hermit): pour `cost` Amber to wake it — unlocks `family` */
  | { kind: 'sleeper'; x: number; family: Family; cost: number }
  /** Observer's stela: `star` Star Blood → a run blessing */
  | { kind: 'stela'; x: number; star: number; blessing: 'nestHp' | 'lightRegen'; power: number }
  /** dead Igg-Tree: pour `cost` to light it → small Circle of `radius`, `slots` nest slots, `hp` husk */
  | { kind: 'deadTree'; x: number; cost: number; radius: number; hp: number; slots: number }
  /** Void Rift: the source of its side's creatures; sealed with Amber + Star Blood */
  | { kind: 'rift'; x: number; side: 'L' | 'R'; amber: number; star: number; minStage: number };

export interface WorldDef {
  id: WorldId;
  /** title-screen name */
  name: string;
  width: number;
  treeX: number;
  /** night list; 'campaign' = the legacy campaign + endless generator (`nightDef`) */
  nights: 'campaign' | NightDef[];
  /** after the list ends: generated endless nights (true) or repeat the last one */
  endless: boolean;
  /** index of the last Tree stage reachable in this world */
  maxStage: number;
  families: FamilyRule[];
  /** Keeper runes available in this world */
  runes: AbilityId[];
  objects: WorldObjectDef[];
  /** starting Amber in the Treasury (`state.amber`) */
  startTreasury: number;
  /** Keeper purse capacity by Tree stage (0-based); Infinity = no purse (legacy) */
  purseCap: (stage: number) => number;
  prices: WorldPrices;
  win: WinDef;
  /** highest game speed offered (×5 only where `rush`) */
  maxSpeed: number;
  /** in-world: Tree stage (0-based) from which nests can take «Возвышение»; undefined = never */
  ascendStage?: number;
  /** in-world dawn income into the Treasury: `base + perStage × stage` (spec §3) */
  dawnIncome?: { base: number; perStage: number };
  features: WorldFeatures;
}

const ALL_FEATURES: WorldFeatures = {
  inWorld: false, autoLoot: true, crown: true, merge: true, aspects: true, stars: true, facets: true, props: true,
  exchange: true, rush: true, termite: true, tablet: true, keeperRanks: true, ringMenu: true, quests: true, meta: true,
};

/** IGG2 worlds: the in-world control scheme with the heavy systems switched off (spec §4). */
const IGG2_FEATURES: WorldFeatures = {
  inWorld: true, autoLoot: false, crown: false, merge: false, aspects: false, stars: false, facets: false, props: false,
  exchange: false, rush: false, termite: false, tablet: false, keeperRanks: false, ringMenu: false, quests: false, meta: false,
};

const ALL_FAMILIES: Family[] = ['hive', 'beetle', 'dragonfly', 'spider', 'caterpillar', 'termite', 'honeycomb', 'mender'];
const start = (family: Family): FamilyRule => ({ family, unlock: { kind: 'start' } });

export const WORLDS: Record<WorldId, WorldDef> = {
  legacy: {
    id: 'legacy', name: 'Древо Игг (классика)', width: 1440, treeX: 720,
    nights: 'campaign', endless: true, maxStage: TREE_STAGES.length - 1,
    families: ALL_FAMILIES.map(start),
    runes: ['spear', 'hammer', 'starfall', 'radiance', 'swarm', 'timestop'],
    objects: [],
    startTreasury: ECONOMY.startAmber,
    purseCap: () => Infinity,
    prices: { nest: 1, grow: 1, rune: 1 },
    win: { kind: 'endless' },
    maxSpeed: 5,
    features: { ...ALL_FEATURES },
  },
  micro: {
    id: 'micro', name: 'Росток', width: 1440, treeX: 720,
    // placeholder until phase 5 (nights 1–4 + repeat of night 4)
    nights: 'campaign', endless: false, maxStage: 2,
    families: [start('hive'), start('beetle'), start('spider'), { family: 'caterpillar', unlock: { kind: 'stage', stage: 1 } }],
    runes: ['spear', 'hammer'],
    objects: [],
    startTreasury: 40,
    purseCap: (stage) => 30 + 15 * stage,
    prices: { nest: 1, grow: 1, rune: 1 },
    win: { kind: 'seed', night: 4, stage: 2 },
    maxSpeed: 2,
    dawnIncome: { base: 25, perStage: 15 },
    features: { ...IGG2_FEATURES },
  },
  medium: {
    id: 'medium', name: 'Поляна', width: 3200, treeX: 1600,
    // placeholder until phase 6 (nights 1–7, shifted campaign, generator with truces and «winter»)
    nights: 'campaign', endless: true, maxStage: 5,
    families: [
      start('hive'), start('beetle'), start('spider'),
      { family: 'caterpillar', unlock: { kind: 'sleeper' } }, { family: 'dragonfly', unlock: { kind: 'sleeper' } },
    ],
    runes: ['spear', 'hammer', 'starfall'],
    objects: [],
    startTreasury: 60,
    purseCap: (stage) => 40 + 20 * stage,
    prices: { nest: 1, grow: 1, rune: 1 },
    win: { kind: 'rifts', count: 2 },
    maxSpeed: 5,
    ascendStage: 3,
    dawnIncome: { base: 30, perStage: 20 },
    features: { ...IGG2_FEATURES, rush: true, tablet: true },
  },
};

/** In-world verbs and trunk objects (spec §3). Distances in world px, times in seconds. */
export const INWORLD = {
  /** focus reach around the Keeper */
  reach: 14,
  /** pour / take rate: starts at `rate0` Amber/s and ramps linearly to `rate1` over `rampT` */
  rate0: 8, rate1: 60, rampT: 2,
  /** hold X this long on a nest to sell it */
  sellHold: 1.5,
  /** hold S this long to crack a geode (phase 5) */
  geodeHold: 1.2,
  /** Amber knocked out of the purse per hit; seconds the knocked drops can't be re-picked */
  dropsPerHit: 2, knockLock: 1.2,
  /** seconds until the fallen Keeper rises at the Tree (day or night) */
  respawn: 8,
  /** trunk objects: offsets from treeX */
  treasury: -22, altar: 0, stone: 22,
  /** runes cast ahead of the Keeper without the mouse (hammer / starfall; phase 4 refines) */
  castAhead: 80,
} as const;

export const isWorldId = (x: unknown): x is WorldId => x === 'legacy' || x === 'micro' || x === 'medium';
