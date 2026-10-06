/**
 * Core gameplay numbers. Rationale: design/game-brief.md, design/progression.md, design/v3-plan.md.
 * World units are art pixels of the 960×540 world; the camera shows 640×360 → 960×540.
 */

export const WORLD = {
  width: 960,
  height: 540,
  groundY: 380,
  /** y of the underground worm lane */
  wormLaneY: 448,
  treeX: 480,
  /** half-width of the tree trunk zone that enemies must reach to attack it */
  treeReach: 16,
  spawnMargin: 14,
} as const;

/**
 * Enemies use canon names from the books: shadow beasts of the Lands of Shadow
 * (найтволк, ледозуб, найторакс) and the Worms (Имаго-…).
 */
export type EnemyKind =
  | 'hound' | 'stalker' | 'spitter'
  | 'forager' | 'worm' | 'guard' | 'larva' | 'reaper'
  | 'mother' | 'executioner';
export type AbilityId = 'spear' | 'hammer' | 'starfall';

export interface EnemyDef {
  name: string;
  hp: number;
  /** flat damage reduction per hit (at least 25% of a hit always passes) */
  armor: number;
  speed: number;
  damage: number;
  attackRate: number;
  structureMult: number;
  range: number;
  amber: number;
  /** Star Blood drop (fractional = chance) */
  star: number;
  /** chance to drop a Lesser Rune of Development */
  devRune: number;
  charge: number;
  /** worm-type: burned by Igg-light and x2 damage in light */
  worm: boolean;
  underground: boolean;
  smashesStructures: boolean;
  ccMult: number;
  radius: number;
  height: number;
  boss?: boolean;
}

const E = (o: Partial<EnemyDef> & Pick<EnemyDef, 'name' | 'hp' | 'speed' | 'damage' | 'amber'>): EnemyDef => ({
  armor: 0, attackRate: 1, structureMult: 1, range: 0, star: 0, devRune: 0, charge: 2, worm: false, underground: false,
  smashesStructures: false, ccMult: 1, radius: 7, height: 12, ...o,
});

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  hound: E({ name: 'Найтволк', hp: 55, speed: 48, damage: 7, attackRate: 0.8, amber: 6, charge: 2, radius: 7, height: 12 }),
  stalker: E({
    name: 'Ледозуб', hp: 420, armor: 6, speed: 18, damage: 34, attackRate: 1.5, structureMult: 1.5, amber: 20,
    charge: 8, smashesStructures: true, ccMult: 0.8, radius: 9, height: 34,
  }),
  spitter: E({ name: 'Найторакс', hp: 110, speed: 28, damage: 13, attackRate: 2.1, range: 100, amber: 12, charge: 4, radius: 8, height: 16 }),
  forager: E({
    name: 'Имаго-Фуражир', hp: 70, speed: 40, damage: 8, attackRate: 0.9, amber: 5, star: 0.25, charge: 2,
    worm: true, radius: 7, height: 10,
  }),
  worm: E({
    name: 'Имаго-Копатель', hp: 210, speed: 17, damage: 14, attackRate: 1, amber: 10, star: 2, devRune: 0.006, charge: 5,
    worm: true, underground: true, radius: 12, height: 10,
  }),
  guard: E({
    name: 'Имаго-Страж', hp: 520, armor: 10, speed: 12, damage: 22, attackRate: 1.2, amber: 19, star: 4, devRune: 0.03, charge: 9,
    worm: true, underground: true, ccMult: 0.6, radius: 14, height: 12,
  }),
  reaper: E({
    name: 'Имаго-Жнец', hp: 900, armor: 9, speed: 24, damage: 46, attackRate: 1.3, structureMult: 1.3, amber: 28, star: 1,
    charge: 10, worm: true, smashesStructures: true, ccMult: 0.7, radius: 10, height: 30,
  }),
  larva: E({ name: 'Личинка', hp: 18, speed: 38, damage: 3, attackRate: 0.7, amber: 1, star: 0.2, charge: 1, worm: true, radius: 4, height: 5 }),
  mother: E({
    name: 'Имаго-Матерь', hp: 5200, armor: 4, speed: 8, damage: 80, attackRate: 2, amber: 79, star: 30, devRune: 1, charge: 40,
    worm: true, smashesStructures: true, ccMult: 0.25, radius: 26, height: 40, boss: true,
  }),
  executioner: E({
    name: 'Имаго-Палач', hp: 11000, armor: 14, speed: 10, damage: 120, attackRate: 1.6, structureMult: 1.5, amber: 158, star: 60,
    devRune: 1, charge: 60, worm: true, smashesStructures: true, ccMult: 0.2, radius: 22, height: 52, boss: true,
  }),
};

/** Mother spawns larvae; the Executioner spawns foragers. */
export const BROOD: Partial<Record<EnemyKind, { every: number; count: number; kind: EnemyKind }>> = {
  mother: { every: 7, count: 3, kind: 'larva' },
  executioner: { every: 9, count: 2, kind: 'forager' },
};

/** Minimum share of a hit that passes armor. */
export const ARMOR_FLOOR = 0.25;

export interface SlotDef {
  id: string;
  x: number;
  underground: boolean;
  /** distance from the trunk (used for unlocking by Circle radius) */
  offset: number;
}

const SURFACE_OFFSETS = [42, 76, 112, 150, 190, 232, 276, 322, 370, 420];
const ROOT_OFFSETS = [50, 104, 160, 220, 284, 350];

export const SLOTS: SlotDef[] = [
  ...SURFACE_OFFSETS.flatMap((o, i) => [
    { id: `L${i}`, x: WORLD.treeX - o, underground: false, offset: o },
    { id: `R${i}`, x: WORLD.treeX + o, underground: false, offset: o },
  ]),
  ...ROOT_OFFSETS.flatMap((o, i) => [
    { id: `UL${i}`, x: WORLD.treeX - o, underground: true, offset: o },
    { id: `UR${i}`, x: WORLD.treeX + o, underground: true, offset: o },
  ]),
];
/** A slot opens when the Circle reaches it (surface: offset ≤ radius − margin; roots: offset ≤ radius × reach). */
export const SLOT_MARGIN = 14;
export const ROOT_SLOT_REACH = 0.85;

/** Igg-light multiplier for worm-type enemies standing in light */
export const WORM_LIGHT_MULT = 2;

export const KEEPER = {
  hp: 100, speed: 92, regenLit: 6, respawn: 3,
  pickupRadius: 10, magnetRadius: 38, magnetSpeed: 170,
  maxLight: 100, startLight: 60,
  /** Light regen multiplier at the trunk and at/after the Circle edge */
  regenNear: 1.8, regenFar: 0.3,
} as const;

/** Keeper Ascension ranks (дерево → бронза → серебро → золото → небо). */
/** `guard` = share of incoming damage negated; `aura` = radiance dps on adjacent creatures. */
export const KEEPER_RANKS = [
  { name: 'Дерево', cost: 0, hp: 100, maxLight: 100, power: 1, guard: 0, aura: 6 },
  { name: 'Бронза', cost: 20, hp: 150, maxLight: 115, power: 1.2, guard: 0.15, aura: 16 },
  { name: 'Серебро', cost: 50, hp: 230, maxLight: 130, power: 1.45, guard: 0.3, aura: 34 },
  { name: 'Золото', cost: 100, hp: 340, maxLight: 150, power: 1.75, guard: 0.45, aura: 70 },
  { name: 'Небо', cost: 180, hp: 500, maxLight: 175, power: 2.1, guard: 0.6, aura: 140 },
] as const;

/**
 * Attributes of an Ascended (from the books: «Атрибут Духа повышен 2/10»). Late-game Star
 * Blood sink; a Lesser Rune of Development also raises one level.
 */
export type AttrId = 'might' | 'spirit' | 'body';
export const ATTRIBUTES: Record<AttrId, { name: string; desc: string }> = {
  might: { name: 'Сила', desc: '+8% урона умений' },
  spirit: { name: 'Дух', desc: '+8% регенерации Света, +6 к запасу' },
  body: { name: 'Тело', desc: '+10% HP, +4% защиты, +15% сияния' },
};
export const ATTR_MAX = 10;
export const attrCost = (level: number) => 6 + level * 5;

/** Growth rings after the Great Igg-Tree: endless Amber sink. */
export const RINGS = {
  cost: (r: number) => Math.round(900 * Math.pow(1.32, r)),
  power: 0.07,
  hp: 0.1,
} as const;

export interface AbilityDef {
  name: string;
  desc: string;
  cost: number;
  cooldown: number;
  unlockStage: number;
  key: string;
}

/**
 * Abilities are Rune-Items from the books (Копьё Игг-Света, Игг-Молот: «Сияние»,
 * «Сотрясение Тверди»). Each has 3 slots for Observer properties (+1 with a Lesser
 * Rune of Development). Base numbers are meaningful on their own; properties shape them.
 */
export const ABILITIES = {
  spear: {
    name: 'Копьё Игг-Света', desc: 'Пронзающий луч игг-сияния к курсору: пробивает 3 тварей, бьёт и во тьме.',
    cost: 14, cooldown: 0.55, unlockStage: 1, key: '1',
    damage: 52, pierce: 3, falloff: 0.2, speed: 420, range: 320,
  },
  hammer: {
    name: 'Игг-Молот', desc: '«Сияние»: удар вокруг Хранителя, оглушает и отбрасывает, зажигает свет.',
    cost: 34, cooldown: 11, unlockStage: 2, key: '2',
    damage: 70, radius: 92, stun: 1.6, knockback: 50, lightTime: 6, lightRadius: 80, restunWindow: 4,
  },
  starfall: {
    name: 'Звездопад', desc: 'Заряжается убийствами. Пять огромных звёзд падают у курсора: оглушают, рвут броню и выжигают землю.',
    cost: 0, cooldown: 70, unlockStage: 4, key: '3',
    damage: 520, meteors: 5, spread: 60, burnDps: 60, burnTime: 5, chargeMax: 100, impactRadius: 34, stun: 1.2,
  },
} satisfies Record<AbilityId, AbilityDef & Record<string, number | string>>;

/** Ability damage multiplier per tree stage above the first. */
export const ABILITY_STAGE_SCALING = 0.08;
export const RESTUN_FACTOR = 0.5;

export const ECONOMY = {
  startAmber: 90,
  dawnBase: 50,
  dawnPerNight: 12,
  earlyCallPerSecond: 1,
  dropLifeLit: 25,
  dropLifeDark: 12,
} as const;

export const DAY = { firstLength: 40, length: 25 } as const;
