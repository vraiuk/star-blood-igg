/**
 * Core gameplay numbers. Rationale: design/game-brief.md, design/progression.md.
 * World units are pixels of the 640×360 internal canvas.
 */

export const WORLD = {
  width: 640,
  height: 360,
  groundY: 236,
  /** y of the underground worm lane */
  wormLaneY: 300,
  treeX: 320,
  /** half-width of the tree trunk zone that enemies must reach to attack it */
  treeReach: 16,
  spawnMargin: 14,
} as const;

export type EnemyKind = 'hound' | 'stalker' | 'spitter' | 'worm' | 'larva' | 'mother';
export type AbilityId = 'spear' | 'roots' | 'hammer' | 'starfall';

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  /** damage per hit */
  damage: number;
  /** seconds between hits */
  attackRate: number;
  /** multiplier on damage vs nests */
  structureMult: number;
  /** ranged attackers stop at this distance from their target */
  range: number;
  /** Amber dropped on death */
  amber: number;
  /** Star Blood dropped on death (worm kind) */
  star: number;
  /** charge added to the Starfall ultimate */
  charge: number;
  /** worm-type: x2 from Igg-light */
  worm: boolean;
  underground: boolean;
  /** stops at the first nest of any kind (not only blocking ones) */
  smashesStructures: boolean;
  /** stun / root effectiveness (bosses resist) */
  ccMult: number;
  /** body half-width for collisions / hit tests */
  radius: number;
  height: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  hound: {
    name: 'Найтволк-тень', hp: 36, speed: 46, damage: 6, attackRate: 0.8, structureMult: 1, range: 0,
    amber: 4, star: 0, charge: 2, worm: false, underground: false, smashesStructures: false, ccMult: 1, radius: 7, height: 12,
  },
  stalker: {
    name: 'Гигантопитек', hp: 260, speed: 19, damage: 28, attackRate: 1.5, structureMult: 1.5, range: 0,
    amber: 12, star: 0, charge: 8, worm: false, underground: false, smashesStructures: true, ccMult: 0.8, radius: 8, height: 34,
  },
  spitter: {
    name: 'Плевун', hp: 70, speed: 28, damage: 11, attackRate: 2.1, structureMult: 1, range: 95,
    amber: 8, star: 0, charge: 4, worm: false, underground: false, smashesStructures: false, ccMult: 1, radius: 8, height: 16,
  },
  worm: {
    name: 'Червь-прогрызатель', hp: 130, speed: 17, damage: 12, attackRate: 1, structureMult: 1, range: 0,
    amber: 6, star: 3, charge: 5, worm: true, underground: true, smashesStructures: false, ccMult: 1, radius: 12, height: 10,
  },
  larva: {
    name: 'Личинка Червя', hp: 16, speed: 38, damage: 3, attackRate: 0.7, structureMult: 1, range: 0,
    amber: 1, star: 0.34, charge: 1, worm: true, underground: false, smashesStructures: false, ccMult: 1, radius: 4, height: 5,
  },
  mother: {
    name: 'Матка Червей', hp: 3400, speed: 8, damage: 70, attackRate: 2, structureMult: 1, range: 0,
    amber: 40, star: 25, charge: 40, worm: true, underground: false, smashesStructures: true, ccMult: 0.25, radius: 26, height: 40,
  },
};

export const MOTHER_SPAWN = { every: 7, count: 3 } as const;

export interface SlotDef {
  id: string;
  x: number;
  underground: boolean;
  /** tree stage (1-based) at which the slot becomes buildable */
  unlockStage: number;
}

const SURFACE_OFFSETS: Array<[number, number]> = [[48, 1], [84, 1], [122, 2], [162, 3], [206, 4], [252, 5]];
const ROOT_OFFSETS: Array<[number, number]> = [[56, 1], [122, 3], [188, 4]];

export const SLOTS: SlotDef[] = [
  ...SURFACE_OFFSETS.flatMap(([o, st], i) => [
    { id: `L${i}`, x: WORLD.treeX - o, underground: false, unlockStage: st },
    { id: `R${i}`, x: WORLD.treeX + o, underground: false, unlockStage: st },
  ]),
  ...ROOT_OFFSETS.flatMap(([o, st], i) => [
    { id: `UL${i}`, x: WORLD.treeX - o, underground: true, unlockStage: st },
    { id: `UR${i}`, x: WORLD.treeX + o, underground: true, unlockStage: st },
  ]),
];

/** Igg-light multiplier for worm-type enemies standing in light */
export const WORM_LIGHT_MULT = 2;

export const KEEPER = {
  hp: 100, speed: 92, regenLit: 6, respawn: 6,
  pickupRadius: 10, magnetRadius: 38, magnetSpeed: 170,
  maxLight: 100, startLight: 60,
} as const;

/**
 * Keeper Ascension ranks (Дерево → Бронза → Серебро → Золото), bought with Star Blood.
 * Ranks open rune slots rather than raw percentages (KR hero-level lesson).
 */
export const KEEPER_RANKS = [
  { name: 'Дерево', cost: 0, runeSlots: 2, hp: 100, maxLight: 100 },
  { name: 'Бронза', cost: 8, runeSlots: 3, hp: 125, maxLight: 110 },
  { name: 'Серебро', cost: 16, runeSlots: 4, hp: 150, maxLight: 120 },
  { name: 'Золото', cost: 28, runeSlots: 5, hp: 180, maxLight: 135 },
] as const;

export interface AbilityDef {
  name: string;
  desc: string;
  /** Light cost (0 for the charged ultimate) */
  cost: number;
  cooldown: number;
  /** 1-based tree stage that unlocks it */
  unlockStage: number;
  key: string;
}

/**
 * Abilities: spear = sustain finisher, roots = setup (hold enemies in nest fire),
 * hammer = emergency control, starfall = charged ultimate.
 * Ability damage grows ×~1.5 over a run (+12%/stage) while nests grow ×6.
 */
export const ABILITIES = {
  spear: {
    name: 'Копьё Игг-Света', desc: 'Луч в сторону курсора. Пробивает 3 тварей (100/75/50% урона), бьёт и во тьме.',
    cost: 14, cooldown: 0.6, unlockStage: 1, key: '1',
    damage: 28, pierce: 3, falloff: 0.25, speed: 380, range: 270,
  },
  roots: {
    name: 'Корни Игг', desc: 'Корни в точке курсора держат тварей под огнём гнёзд и рвут Червей под землёй.',
    cost: 30, cooldown: 8, unlockStage: 2, key: '2',
    damage: 22, rootDps: 8, wormDamage: 90, halfWidth: 30, root: 2.4,
  },
  hammer: {
    name: 'Игг-Молот', desc: 'Удар вокруг Хранителя: оглушает и отбрасывает, ненадолго зажигает свет.',
    cost: 40, cooldown: 14, unlockStage: 3, key: '3',
    damage: 30, radius: 84, stun: 1.5, knockback: 46, lightTime: 5, lightRadius: 72, restunWindow: 4,
  },
  starfall: {
    name: 'Звездопад', desc: 'Заряжается убийствами. Пять звёзд падают у курсора и выжигают землю.',
    cost: 0, cooldown: 45, unlockStage: 4, key: '4',
    damage: 85, meteors: 5, spread: 46, burnDps: 12, burnTime: 3, chargeMax: 100,
  },
} satisfies Record<AbilityId, AbilityDef & Record<string, number | string>>;

/** Ability damage multiplier per tree stage above the first. */
export const ABILITY_STAGE_SCALING = 0.07;
/** Re-stun within the window is halved (diminishing returns). */
export const RESTUN_FACTOR = 0.5;

export const ECONOMY = {
  startAmber: 70,
  dawnBase: 30,
  dawnPerNight: 10,
  earlyCallPerSecond: 1,
  dropLifeLit: 25,
  dropLifeDark: 12,
} as const;

export const DAY = { firstLength: 40, length: 25 } as const;
