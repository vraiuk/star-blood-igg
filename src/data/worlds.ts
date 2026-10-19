import type { AbilityId } from './balance';
import { ECONOMY, ENEMIES } from './balance';
import type { Family } from './nests';
import { NIGHTS, generateNight, type NightDef } from './nights';
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
  /** Tree branch choices («Уклоны») on growth */
  branches: boolean;
  /** the Observer's dawn roulette (and the start-of-run rune choice) */
  roulette: boolean;
}

/** How a nest family becomes available in a world. */
export type FamilyUnlock =
  | { kind: 'start' }
  /** opens when the Tree reaches this stage (0-based index) */
  | { kind: 'stage'; stage: number }
  /** opens when the Keeper wakes its Sleeping Creature (a `sleeper` object) */
  | { kind: 'sleeper' };
export interface FamilyRule { family: Family; unlock: FamilyUnlock }

/** How an in-world rune becomes known (spec §4, §5, §6). */
export type RuneUnlockWhen =
  | { kind: 'start' }
  /** learned for free when the Tree reaches this stage (0-based index) */
  | { kind: 'stage'; stage: number }
  /** the Observer's fixed gift at the dawn after night `night` (1-based) */
  | { kind: 'gift'; night: number };
export interface RuneUnlock {
  rune: AbilityId;
  when: RuneUnlockWhen;
  /** the Observer's one line when it is learned (what it gives) */
  line?: string;
}

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
  /** Keeper runes available in this world (in-world: keys 1/2/3 in this order) */
  runes: AbilityId[];
  /** in-world: how each rune of `runes` is learned (legacy: undefined — the Tablet / roulette) */
  runeUnlocks?: RuneUnlock[];
  /** in-world: Tree stage (0-based) from which nests take the A/B specialization; undefined = never (nests stop at BASE_TIERS) */
  specStage?: number;
  /** in-world: Tree stage (0-based) from which the Tablet stone wakes (needs `features.tablet`) */
  tabletStage?: number;
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
  /**
   * in-world root wells shown in this world: only the first `count` (U0, U1, …), from the
   * 0-based night index `fromNight` on (the day before it), whatever the Circle (micro: spec §5).
   * undefined = all eight, opened by the Circle radius.
   */
  wells?: { fromNight: number; count: number };
  /** a scripted night list that has run out repeats its last night, creatures ×`repeatMul` hp per repeat (micro: 1.1) */
  repeatMul?: number;
  /** a scripted list that has run out goes on with this generator (0-based night index; medium: ENDLESS + truces) */
  generator?: (n: number) => NightDef;
  /** diggers drive tunnels («Лазы») only from this 0-based night index on (medium: 8 = night 9); undefined = always */
  tunnelsFrom?: number;
  /** «Зима»: every `every`-th night the dawn income is ×`mul` (medium: 8, 0.5) */
  winter?: { every: number; mul: number };
  /** creatures come out this far from the trunk at most (or at their side's Rift, if it is nearer) — medium 900 */
  spawnReach?: number;
  /**
   * seconds after nightfall the first group of a side reaches the outermost light on its side
   * (spec §6: «ночь стартует так, чтобы первые группы подходили к краю Круга»). The whole side's
   * schedule is shifted earlier by the lead; creatures already under way appear walked ahead.
   * undefined = no lead-in (legacy, micro).
   */
  arriveIn?: number;
  /** in-world: the Observer's one line for what a Tree stage (0-based) opens in this world (spec §6) */
  stageLines?: Record<number, string>;
  features: WorldFeatures;
}

const ALL_FEATURES: WorldFeatures = {
  inWorld: false, autoLoot: true, crown: true, merge: true, aspects: true, stars: true, facets: true, props: true,
  exchange: true, rush: true, termite: true, tablet: true, keeperRanks: true, ringMenu: true, quests: true, meta: true,
  branches: true, roulette: true,
};

/** IGG2 worlds: the in-world control scheme with the heavy systems switched off (spec §4). */
const IGG2_FEATURES: WorldFeatures = {
  inWorld: true, autoLoot: false, crown: false, merge: false, aspects: false, stars: false, facets: false, props: false,
  exchange: false, rush: false, termite: false, tablet: false, keeperRanks: false, ringMenu: false, quests: false, meta: false,
  branches: false, roulette: false,
};

/** The Observer's lines for the in-world rune unlocks. */
const RUNE_LINES = {
  hammer: 'Игг-Молот [2]: прыжок вперёд и удар — оглушает и отбрасывает тварей.',
  starfall: 'Звездопад [3]: заряжается убийствами; звёзды падают на самую густую стаю впереди.',
} as const;

/** Spawn group helper for the scripted world nights (same shape as src/data/nights.ts). */
const grp = (at: number, kind: NightDef['groups'][number]['kind'], side: 'L' | 'R' | 'B', count: number, every = 1.6) => ({ at, kind, side, count, every });

/**
 * «Росток» nights (spec §5): one new thing per night. Counts are exact (the legacy group growth
 * by night index does not apply to scripted worlds); night 4 repeats with ×`repeatMul` hp.
 */
const MICRO_NIGHTS: NightDef[] = [
  {
    title: 'Первая ночь', hpMul: 1,
    hint: 'Найтволки идут слева. Стой у гнезда и бей Копьём [1] — оно летит туда, куда смотришь.',
    groups: [grp(2, 'hound', 'L', 3, 1.8), grp(14, 'hound', 'L', 3, 1.4)],
  },
  {
    title: 'Вторая ночь', hpMul: 1.1,
    hint: 'Найтволки с обеих сторон. Игг-Молот [2] прыгает вперёд и отбрасывает стаю от гнёзд.',
    groups: [grp(2, 'hound', 'B', 3, 1.6), grp(16, 'hound', 'B', 2, 1.2)],
  },
  {
    title: 'Третья ночь', hpMul: 1.2,
    hint: 'Под землёй ползёт Червь! Корневые колодцы засветились — посади в колодец Паука.',
    groups: [grp(2, 'hound', 'B', 3, 1.4), grp(10, 'worm', 'L', 1), grp(22, 'hound', 'R', 3, 1.2)],
  },
  {
    title: 'Ночь Гигантопитека', hpMul: 1.3,
    hint: 'Гигантопитек ломает гнёзда. Игг-Молот [2] оглушает его, ульи жалят издалека.',
    groups: [grp(2, 'hound', 'L', 3, 1.2), grp(8, 'ape', 'R', 1), grp(18, 'hound', 'B', 3, 1)],
  },
];

// ───────────────────────────── «Поляна» (spec §6) ─────────────────────────────

/** seconds a truce night lasts */
const MEDIUM_TRUCE_T = 30;
/** 0-based night index from which diggers drive «Лазы» in the medium world (night 9) */
const MEDIUM_TUNNELS_FROM = 8;

/** A truce night (medium): nobody comes; it lasts `MEDIUM.truceT` seconds. */
const truce = (n: number): NightDef => ({
  title: `Ночь ${n + 1}: Перемирие`, hpMul: 1, groups: [], quiet: MEDIUM_TRUCE_T, truce: true,
  hint: 'Тьма переводит дух — ни одна тварь не придёт. Строй, копи, зажигай Мёртвые Древа.',
});

/**
 * «Поляна» nights 1–7 (spec §6): one new thing a night, both Rifts send their share. Night 6 is the
 * Mother, night 7 a truce. Counts are exact (scripted world: no growth by night index, no elites).
 */
const MEDIUM_OWN: NightDef[] = [
  {
    title: 'Первая ночь', hpMul: 1,
    hint: 'Найтволки выходят из обоих Разломов. Ульи у края Круга, Копьё [1] навстречу стае.',
    groups: [grp(2, 'hound', 'B', 3, 1.6), grp(16, 'hound', 'B', 3, 1.3)],
  },
  {
    title: 'Вторая ночь', hpMul: 1.1,
    hint: 'Имаго-Фуражиры идут роем — в свете Древа они горят. Шире Круг — больше сгорит.',
    groups: [grp(2, 'hound', 'B', 3, 1.4), grp(10, 'forager', 'B', 5, 1), grp(24, 'hound', 'B', 2, 1.2)],
  },
  {
    title: 'Третья ночь', hpMul: 1.25,
    hint: 'Под землёй ползут Черви — Паук в колодце встретит их. С Червей падает Звёздная Кровь.',
    groups: [grp(2, 'hound', 'B', 4, 1.3), grp(10, 'worm', 'L', 1), grp(18, 'forager', 'B', 4, 1), grp(24, 'worm', 'R', 1)],
  },
  {
    title: 'Четвёртая ночь', hpMul: 1.4,
    hint: 'Ледозубы ломают гнёзда. Светожук держит строй, Игг-Молот [2] оглушает.',
    groups: [grp(2, 'hound', 'B', 4, 1.2), grp(8, 'stalker', 'L', 1), grp(14, 'forager', 'B', 5, 0.9), grp(20, 'stalker', 'R', 1), grp(26, 'worm', 'B', 1)],
  },
  {
    title: 'Пятая ночь', hpMul: 1.55,
    hint: 'Найтораксы плюются кислотой издалека. Копьё [1] бьёт и во тьме, стрекозы высвечивают их.',
    groups: [grp(2, 'hound', 'B', 5, 1.1), grp(8, 'spitter', 'B', 2, 3), grp(16, 'stalker', 'B', 1), grp(22, 'forager', 'B', 5, 0.9), grp(28, 'worm', 'B', 1)],
  },
  {
    title: 'Ночь Матери', hpMul: 1.7,
    hint: 'Имаго-Матерь — родильная гора Червей. Игг-свет жжёт её и её личинок; бей Молотом и Звездопадом.',
    groups: [grp(2, 'hound', 'B', 5, 1), grp(8, 'mother', 'R', 1), grp(14, 'forager', 'B', 6, 0.8), grp(22, 'spitter', 'B', 2, 3), grp(30, 'worm', 'B', 1)],
  },
  truce(6),
];

/** Medium nights 8–12 = the legacy nights 6–10, renamed; no Землерой before night 9 (spec §6). */
const SHIFT_TITLES = ['Восьмая ночь', 'Девятая ночь', 'Десятая ночь', 'Одиннадцатая ночь', 'Ночь Палача'];
const SHIFT_HINTS: Record<number, string> = {
  0: 'Имаго-Стражи в броне ползут под землёй, Жнецы косят гнёзда. Светожуки, держите строй!',
};
const MEDIUM_SHIFT = NIGHTS.slice(5, 10).map((d, i): NightDef => ({
  ...d, title: SHIFT_TITLES[i], hint: SHIFT_HINTS[i] ?? d.hint,
  // the medium night index is 7 + i: tunnellers only from night 9 (index 8)
  groups: d.groups.filter((x) => x.kind !== 'tunneler' || 7 + i >= MEDIUM_TUNNELS_FROM),
}));

/** The scripted «Поляна» list: nights 1–12. */
export const MEDIUM_NIGHTS: NightDef[] = [...MEDIUM_OWN, ...MEDIUM_SHIFT];

/** Does a night bring a boss (Mother, Executioner, Devourer)? */
export const isBossNight = (d: NightDef) => d.groups.some((x) => ENEMIES[x.kind].boss);

/** legacy generator index the medium endless starts from (its night 13 = legacy generated night 11) */
const MEDIUM_GEN_FROM = 10;
const mediumEndlessCache: NightDef[] = [];
/**
 * «Поляна» after night 12: the ENDLESS generator with its 5-night rhythm, and a truce after every
 * boss night (spec §6). Deterministic; `n` is the 0-based medium night index (≥ the list length).
 */
export function mediumEndless(n: number): NightDef {
  const L = MEDIUM_NIGHTS.length;
  let gi = MEDIUM_GEN_FROM + mediumEndlessCache.filter((d) => !d.truce).length;
  while (mediumEndlessCache.length <= n - L) {
    const idx = L + mediumEndlessCache.length;
    const prev = mediumEndlessCache.length ? mediumEndlessCache[mediumEndlessCache.length - 1] : MEDIUM_NIGHTS[L - 1];
    if (isBossNight(prev)) { mediumEndlessCache.push(truce(idx)); continue; }
    const d = generateNight(gi++);
    mediumEndlessCache.push({ ...d, title: d.title.replace(/^Ночь \d+/, `Ночь ${idx + 1}`) });
  }
  return mediumEndlessCache[n - L];
}

/** «Поляна» rules (spec §6). Distances in world px, times in seconds. */
export const MEDIUM = {
  /** a sealed Rift answers: the day ends this soon (the Eclipse), and the sky stays dark this long */
  eclipseDay: 12, eclipseT: 12,
  /** the retaliation wave: the night's groups ×(base + step × Rifts sealed before this one) */
  waveBase: 1.4, waveStep: 0.3,
  /** a truce night lasts this long */
  truceT: MEDIUM_TRUCE_T,
  /** a lit Dead Tree's two nest slots sit this far either side of its trunk */
  huskSlotGap: 24,
  /** creatures this close to a lit Dead Tree stop and gnaw it */
  huskReach: 10,
  /** the night lead-in never puts a creature nearer than this to the light on its side (px) */
  leadGap: 60,
} as const;

/** Observer lines for what each «Поляна» Tree stage opens (spec §6: every opening = a banner + one line). */
const MEDIUM_STAGE_LINES: Record<number, string> = {
  1: 'Звёздная Кровь пробудилась: её роняют Черви, Хранитель берёт её сразу в общий счёт. Камень Скрижали у Древа принимает её за ранги рун.',
  2: 'Гнёзда третьего уровня теперь выбирают путь: Q/E у гнезда — развилка A или B, за Янтарь и Звёздную Кровь.',
  3: 'Древо достаточно сильно, чтобы запечатать Разлом: 120 Янтаря и 3 Звёздной Крови у его края. И руна Звездопад [3] проснулась.',
  4: 'Гнёзда на пределе могут Возвыситься — ещё сильнее и крепче, за Янтарь.',
  5: 'Великое Древо — предел Поляны. Запечатай оба Разлома, и Тьма уйдёт с Поляны.',
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
    nights: MICRO_NIGHTS, endless: false, repeatMul: 1.1, maxStage: 2,
    families: [start('hive'), start('beetle'), start('spider'), { family: 'caterpillar', unlock: { kind: 'stage', stage: 1 } }],
    runes: ['spear', 'hammer'],
    runeUnlocks: [
      { rune: 'spear', when: { kind: 'start' } },
      { rune: 'hammer', when: { kind: 'gift', night: 1 }, line: RUNE_LINES.hammer },
    ],
    // spec §5: the hollow-side geode at the edge of the dark, a geode in the thicket to the right
    // (the thicket burns when the Circle reaches it), a grazing herd at the left edge
    objects: [
      { kind: 'geode', x: 720 - 132, amber: 20 },
      { kind: 'thicket', x: 720 + 128, width: 56 },
      { kind: 'geode', x: 720 + 128, amber: 30 },
      { kind: 'herd', x: 160, count: 4, range: 100, drop: [3, 5] },
    ],
    wells: { fromNight: 2, count: 2 },
    startTreasury: 40,
    purseCap: (stage) => 30 + 15 * stage,
    // nests ×0.75: the first Улей (30) fits the starting purse (30) and Treasury (40) — spec §5/§7
    prices: { nest: 0.75, grow: 1, rune: 1 },
    win: { kind: 'seed', night: 4, stage: 2 },
    maxSpeed: 2,
    dawnIncome: { base: 25, perStage: 15 },
    features: { ...IGG2_FEATURES },
  },
  medium: {
    id: 'medium', name: 'Поляна', width: 3200, treeX: 1600,
    // nights 1–7, then the legacy nights 6–10 shifted, then the generator with truces (spec §6)
    nights: MEDIUM_NIGHTS, endless: true, generator: mediumEndless, maxStage: 5,
    tunnelsFrom: MEDIUM_TUNNELS_FROM,
    winter: { every: 8, mul: 0.5 },
    spawnReach: 900,
    arriveIn: 9,
    families: [
      start('hive'), start('beetle'), start('spider'),
      { family: 'caterpillar', unlock: { kind: 'sleeper' } }, { family: 'dragonfly', unlock: { kind: 'sleeper' } },
    ],
    runes: ['spear', 'hammer', 'starfall'],
    runeUnlocks: [
      { rune: 'spear', when: { kind: 'start' } },
      { rune: 'hammer', when: { kind: 'start' } },
      { rune: 'starfall', when: { kind: 'stage', stage: 3 }, line: RUNE_LINES.starfall },
    ],
    specStage: 2,
    tabletStage: 1,
    // treeX 1600: Rifts at the edges, Dead Trees ∓700, Sleepers ∓1000, stelae ∓450 (spec ∓420 sits on slots L9/R9 — moved clear of them), 6 geodes, 2 herds
    objects: [
      { kind: 'rift', x: 140, side: 'L', amber: 120, star: 3, minStage: 3 },
      { kind: 'rift', x: 3060, side: 'R', amber: 120, star: 3, minStage: 3 },
      { kind: 'deadTree', x: 900, cost: 60, radius: 110, hp: 400, slots: 2 },
      { kind: 'deadTree', x: 2300, cost: 60, radius: 110, hp: 400, slots: 2 },
      { kind: 'sleeper', x: 600, family: 'caterpillar', cost: 30 },
      { kind: 'sleeper', x: 2600, family: 'dragonfly', cost: 30 },
      { kind: 'stela', x: 1150, star: 4, blessing: 'nestHp', power: 0.2 },
      { kind: 'stela', x: 2050, star: 4, blessing: 'lightRegen', power: 0.3 },
      { kind: 'geode', x: 1340, amber: 20 },
      { kind: 'geode', x: 1860, amber: 20 },
      { kind: 'geode', x: 1050, amber: 30 },
      { kind: 'geode', x: 2150, amber: 30 },
      { kind: 'geode', x: 760, amber: 45 },
      { kind: 'geode', x: 2440, amber: 45 },
      { kind: 'herd', x: 420, count: 4, range: 120, drop: [3, 5] },
      { kind: 'herd', x: 2780, count: 4, range: 120, drop: [3, 5] },
    ],
    stageLines: MEDIUM_STAGE_LINES,
    startTreasury: 60,
    purseCap: (stage) => 40 + 20 * stage,
    prices: { nest: 1, grow: 1, rune: 1 },
    win: { kind: 'rifts', count: 2 },
    maxSpeed: 5,
    ascendStage: 4,
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
  /** runes cast ahead of the Keeper without the mouse: the fallback point (starfall with no pack ahead) */
  castAhead: 80,
  /** Starfall looks for the densest pack this far ahead of the Keeper, and this far behind */
  starAhead: 260, starBehind: 40,
  /** a creature this close outside the light still counts as «near-lit» for the Starfall */
  starNearLit: 40,
  /** the Hammer lands this far before the nearest creature on its leap */
  hammerStop: 6,
  /** highest rune rank at the Tablet stone (Дерево → Бронза → Серебро → Золото) */
  maxRuneRank: 3,
} as const;

/** World objects (spec §5): distances in world px, speeds in px/s. */
export const WORLD_OBJ = {
  /** a thicket burns when the Circle passes its inner edge by this much */
  thicketBite: 6,
  /** the Seed falls this far right of the trunk (clear of the altar and the hollow) */
  seedOffset: 28,
  /** grazers: wandering pace; they bolt from a Keeper this close, at this speed */
  grazeSpeed: 7, fleeDist: 56, fleeSpeed: 46,
} as const;

/** In-world rune descriptions (no mouse: everything goes along the Keeper's facing). */
export const INWORLD_RUNE_DESC: Partial<Record<AbilityId, string>> = {
  spear: 'Копьё летит туда, куда смотрит Хранитель: пробивает тварей, бьёт и во тьме.',
  hammer: 'Игг-Молот: Хранитель прыгает вперёд (до ближайшей твари) и бьёт — оглушает, отбрасывает, ломает броню, рушит Лазы.',
  starfall: 'Заряжается убийствами. Звёзды падают на самую густую стаю впереди; нет стаи — прямо перед Хранителем.',
};

/** Tree stage names in the instrumental case («когда Древо станет …»), by 0-based stage. */
export const STAGE_INSTR = ['Семенем', 'Ростком', 'Юным Игг', 'Малым Древом', 'Игг-Древом', 'Великим Древом'] as const;

/** In-world rune keys: 1/2/3 → the world's runes in the order spear, hammer, starfall (spec §3). */
export const INWORLD_RUNE_KEYS: Record<string, AbilityId> = { 1: 'spear', 2: 'hammer', 3: 'starfall' };

export const isWorldId = (x: unknown): x is WorldId => x === 'legacy' || x === 'micro' || x === 'medium';
