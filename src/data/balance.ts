import { SHAPES } from './treeShape';

/**
 * Core gameplay numbers. Rationale: design/game-brief.md, design/progression.md, design/v3-plan.md.
 * World units are art pixels of the 960×540 world; the camera shows 640×360 → 960×540.
 */

export const WORLD = {
  width: 1440,
  height: 720,
  groundY: 560,
  /** y of the underground worm lane */
  wormLaneY: 628,
  treeX: 720,
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
  | 'forager' | 'worm' | 'guard' | 'larva' | 'reaper' | 'jumper' | 'tunneler' | 'tunnelerUp'
  | 'moth' | 'bomber' | 'tyrant' | 'devourer'
  | 'mother' | 'executioner';
export type AbilityId = 'spear' | 'hammer' | 'starfall' | 'radiance' | 'swarm' | 'timestop';

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
  /** flies above the Circle: beetles, weavers, termites and the Hammer can't reach it */
  air: boolean;
  /** flight height above the ground (air only) */
  altitude: number;
  smashesStructures: boolean;
  /** sweeping bite: also hits every soldier within this many px */
  cleave?: number;
  /** «Туман Тьмы» radius: shields creatures inside from Igg-light and auras */
  fog?: number;
  /** spiked carapace (extra hp pool) that has to be broken before the body is hurt */
  plates?: number;
  ccMult: number;
  radius: number;
  height: number;
  boss?: boolean;
}

const E = (o: Partial<EnemyDef> & Pick<EnemyDef, 'name' | 'hp' | 'speed' | 'damage' | 'amber'>): EnemyDef => ({
  armor: 0, attackRate: 1, structureMult: 1, range: 0, star: 0, devRune: 0, charge: 2, worm: false, underground: false, air: false, altitude: 0,
  smashesStructures: false, ccMult: 1, radius: 7, height: 12, ...o,
  // the global pace: every creature walks a little slower so the player can keep up
  speed: o.speed * 0.88,
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
    worm: true, underground: true, ccMult: 0.6, radius: 12, height: 10, cleave: 18, fog: 30,
  }),
  guard: E({
    name: 'Имаго-Страж', hp: 520, armor: 10, speed: 12, damage: 22, attackRate: 1.2, amber: 19, star: 4, devRune: 0.03, charge: 9,
    worm: true, underground: true, ccMult: 0.45, radius: 14, height: 12, cleave: 26, fog: 48,
  }),
  reaper: E({
    name: 'Имаго-Жнец', hp: 900, armor: 9, speed: 24, damage: 46, attackRate: 1.3, structureMult: 1.3, amber: 28, star: 1,
    charge: 10, worm: true, smashesStructures: true, ccMult: 0.5, radius: 10, height: 30,
  }),
  jumper: E({
    name: 'Имаго-Прыгун', hp: 90, speed: 52, damage: 10, attackRate: 0.8, amber: 6, star: 0.3, charge: 3,
    worm: true, radius: 6, height: 12,
  }),
  tunneler: E({
    name: 'Имаго-Землерой', hp: 260, armor: 4, speed: 22, damage: 18, attackRate: 1, amber: 10, star: 1, charge: 6,
    worm: true, underground: true, radius: 10, height: 10,
  }),
  tunnelerUp: E({
    name: 'Имаго-Землерой', hp: 260, armor: 4, speed: 26, damage: 18, attackRate: 1, amber: 10, star: 1, charge: 6,
    worm: true, smashesStructures: true, radius: 9, height: 14,
  }),
  tyrant: E({
    name: 'Отродье Тирана', hp: 2200, plates: 2200, armor: 12, speed: 9, damage: 70, attackRate: 1.6, structureMult: 2.5, amber: 60, star: 8, devRune: 0.08, charge: 25,
    worm: true, smashesStructures: true, ccMult: 0.2, radius: 20, height: 30, cleave: 30, fog: 50,
  }),
  devourer: E({
    name: 'Тень Пожирателя', hp: 14000, plates: 10000, armor: 16, speed: 5, damage: 180, attackRate: 2, structureMult: 4, amber: 320, star: 80, devRune: 1, charge: 80,
    worm: true, smashesStructures: true, ccMult: 0.1, radius: 40, height: 100, cleave: 48, fog: 90, boss: true,
  }),
  moth: E({
    name: 'Тенекрыл', hp: 75, speed: 44, damage: 9, attackRate: 0.8, amber: 6, star: 0.2, charge: 3,
    air: true, altitude: 95, radius: 7, height: 10,
  }),
  bomber: E({
    name: 'Имаго-Кислотник', hp: 240, armor: 3, speed: 22, damage: 22, attackRate: 2.4, structureMult: 1.2, amber: 15, star: 0.6, charge: 6,
    worm: true, air: true, altitude: 130, radius: 10, height: 14,
  }),
  larva: E({ name: 'Личинка', hp: 18, speed: 38, damage: 3, attackRate: 0.7, amber: 1, star: 0.2, charge: 1, worm: true, radius: 4, height: 5 }),
  mother: E({
    name: 'Имаго-Матерь', hp: 7000, armor: 6, speed: 8, damage: 100, attackRate: 2, amber: 79, star: 30, devRune: 1, charge: 40,
    worm: true, smashesStructures: true, ccMult: 0.25, radius: 26, height: 40, boss: true, cleave: 34, fog: 70,
  }),
  executioner: E({
    name: 'Имаго-Палач', hp: 11000, armor: 14, speed: 10, damage: 120, attackRate: 1.6, structureMult: 1.5, amber: 158, star: 60,
    devRune: 1, charge: 60, worm: true, smashesStructures: true, ccMult: 0.2, radius: 22, height: 52, boss: true,
  }),
};

/** Mother spawns larvae; the Executioner spawns foragers. */
export const BROOD: Partial<Record<EnemyKind, { every: number; count: number; kind: EnemyKind }>> = {
  mother: { every: 6, count: 4, kind: 'larva' },
  executioner: { every: 9, count: 2, kind: 'forager' },
  devourer: { every: 10, count: 2, kind: 'worm' },
};

/** Elite affixes (from night 6): readable modifiers with an aura and a glyph. */
export type Affix = 'armored' | 'swift' | 'regen' | 'volatile';
export const AFFIXES: Record<Affix, { name: string; glyph: string; color: string }> = {
  armored: { name: 'Бронированный', glyph: '◆', color: '#b8c4d8' },
  swift: { name: 'Быстрый', glyph: '»', color: '#8fd0ff' },
  regen: { name: 'Регенерирующий', glyph: '+', color: '#8aff8a' },
  volatile: { name: 'Взрывной', glyph: '!', color: '#ff8a4a' },
};
/**
 * Online co-op scaling, per Ascended beyond the first. Each one grows their own runes from the
 * shared Star Blood, so the creatures drop more of it; the extra hands are paid back with
 * tougher creatures. Tuned with the co-op bot (tests/coopBot.ts): a team lives about as many
 * nights as a lone Ascended.
 */
export const COOP = {
  /** creature HP: +share per extra Ascended */
  enemyHp: 0.2,
  /** Star Blood dropped by creatures: +share per extra Ascended */
  star: 0.25,
} as const;

export const ELITE = {
  fromNight: 5,
  chance: (n: number) => Math.min(0.35, 0.04 + 0.015 * n),
  hp: 1.35, armor: 8, speed: 1.6, regen: 0.03, blast: 50, blastRadius: 34, loot: 1.6,
} as const;
/** Jumpers leap over blockers; tunnellers surface this close to the trunk. */
export const JUMP = { distance: 46, cooldown: 3.5, time: 0.55 } as const;
export const TUNNEL_SURFACE = 70;
/**
 * Лазы: diggers (Копатель, Страж, Землерой) start a tunnel at the Circle's edge and break
 * out behind the defenses; ground creatures that reach the mouth dive in and skip the nests.
 * The Keeper seals a mouth by standing on it; the Igg-Hammer caves tunnels in at once.
 */
/**
 * Панцирь Тирана: carapace damage share per source — heavy blows crack it, small hits barely
 * scratch it. While plated the body takes `bleed` of the hits; a broken carapace leaves the
 * Tyrant exposed (no armor, +`exposed` damage taken).
 */
export const PLATES = {
  share: { hammer: 3, starfall: 2.5, spear: 1, thorns: 0.5 } as Record<string, number>,
  other: 0.35, bleed: 0.1, exposed: 0.25,
} as const;

/** «Туман Тьмы» around big worms: Igg-light can't burn inside, auras deal only this share. */
export const FOG = { aura: 0.4, fromNight: 10 } as const;

export const TUNNELS = {
  /** the entry mouth opens this far outside the Circle */
  entryPad: 30,
  /** diggers break out at max(exitMin, radius × exitShare) from the trunk */
  exitMin: 56, exitShare: 0.3,
  /** speed of ground creatures inside a tunnel */
  crawl: 1.0,
  /** creatures a tunnel lets through before it caves in by itself (grows with the night) */
  capacity: (night: number) => 3 + Math.floor(night / 3),
  /** seconds the Keeper needs to seal a mouth */
  sealTime: 1.4, sealReach: 18,
  /** Корневое Древо: roots seal a lit mouth by themselves at this rate (per second) */
  rootSeal: 0.25,
  /** creatures buried by a collapse lose this share of max hp */
  collapseDamage: 0.25,
} as const;

/** Minimum share of a hit that passes armor. */
export const ARMOR_FLOOR = 0.25;

export interface SlotDef {
  id: string;
  x: number;
  /** nest anchor y (ground line for surface slots, root knot for underground) */
  y: number;
  underground: boolean;
  /** distance from the trunk (surface slots unlock by Circle radius) */
  offset: number;
  /** root nodes and crown slots unlock by tree stage (1-based) */
  unlockStage?: number;
  /** utility slot in the Igg-Tree's crown (not reachable by creatures) */
  crown?: boolean;
}

/** Crown slots: the Tree as a tower. Index i opens at stage 2 + i. Positions are drawn by the renderer. */
export const CROWN_SLOTS = 10;
export const CROWN_X = [-36, 36, -72, 72, 0, -100, 100, -128, 128, -16] as const;
/** Growth rings make the Great Tree bigger; every 2 rings open one more crown slot. */
export const treeScale = (rings: number) => 1 + Math.min(0.45, 0.035 * rings);
export const ringsForCrownSlot = (i: number) => (i < 5 ? 0 : (i - 4) * 2);
/**
 * Crown slot anchors sit on real leaf clusters of the current stage's crown (so they never
 * hang in the air): slot i aims at a point across the crown and takes the nearest free cluster.
 */
const crownCache = new Map<number, Array<{ x: number; y: number }>>();
export function crownPos(stage: number, i: number, rings = 0): { x: number; y: number } {
  const p = crownBase(stage, i);
  const k = treeScale(rings);
  return { x: Math.round(WORLD.treeX + (p.x - WORLD.treeX) * k), y: Math.round(WORLD.groundY + (p.y - WORLD.groundY) * k) };
}

function crownBase(stage: number, i: number): { x: number; y: number } {
  let list = crownCache.get(stage);
  if (!list) {
    const shape = SHAPES[stage];
    const top = shape.height;
    const width = Math.max(...shape.leaves.map((l) => Math.abs(l.x))) || 20;
    const used = new Set<number>();
    const placed: Array<{ x: number; y: number }> = [];
    // slots keep apart: a cluster closer than this to a taken slot is skipped (if any other is left)
    const MIN_GAP = 18;
    list = CROWN_X.map((dx) => {
      const tx = Math.max(-width, Math.min(width, (dx / 72) * width * 0.75));
      const ty = -top * (Math.abs(dx) > 90 ? 0.5 : Math.abs(dx) > 50 ? 0.55 : 0.68);
      let best = -1, bd = Infinity, fallback = 0, fd = Infinity;
      shape.leaves.forEach((l, k) => {
        if (used.has(k)) return;
        const d = Math.abs(l.x - tx) + Math.abs(l.y - ty) * 0.7;
        if (d < fd) { fd = d; fallback = k; }
        if (placed.some((p) => Math.hypot(p.x - l.x, p.y - l.y) < MIN_GAP)) return;
        if (d < bd) { bd = d; best = k; }
      });
      if (best < 0) best = fallback;
      used.add(best);
      placed.push({ x: shape.leaves[best].x, y: shape.leaves[best].y });
      const l = shape.leaves[best];
      return { x: WORLD.treeX + Math.round(l.x), y: WORLD.groundY + Math.round(l.y) + 3 };
    });
    crownCache.set(stage, list);
  }
  return list[i];
}

function CROWN_X_LIST(): number[] { return [...CROWN_X]; }

const SURFACE_OFFSETS = [42, 76, 112, 150, 190, 232, 276, 322, 370, 420];
/**
 * Root nodes form two arcs (a bowl) around the root ball, so several weavers can bite a
 * worm gnawing at the trunk at once; the outer arc meets worms on their way in.
 * [arc radius, angle in degrees (0 = right, 90 = straight down), unlock stage]
 */
const ROOT_ARC: Array<[number, number, number]> = [
  [60, 90, 1], [60, 55, 1], [60, 125, 2], [60, 22, 2], [60, 158, 3],
  [118, 72, 3], [118, 108, 4], [118, 40, 4], [118, 140, 5], [118, 14, 5], [118, 166, 6],
];

export const SLOTS: SlotDef[] = [
  ...SURFACE_OFFSETS.flatMap((o, i) => [
    { id: `L${i}`, x: WORLD.treeX - o, y: WORLD.groundY, underground: false, offset: o },
    { id: `R${i}`, x: WORLD.treeX + o, y: WORLD.groundY, underground: false, offset: o },
  ]),
  ...CROWN_X_LIST().map((dx, i) => ({
    id: `C${i}`, x: WORLD.treeX + dx, y: WORLD.groundY - 90, underground: false, offset: 0, unlockStage: Math.min(6, 2 + i), crown: true,
  })),
  ...ROOT_ARC.map(([r, deg, st], i) => {
    const a = (deg * Math.PI) / 180;
    const x = Math.round(WORLD.treeX + Math.cos(a) * r * 1.25);
    return {
      id: `U${i}`, x, y: Math.round(WORLD.groundY + 16 + Math.sin(a) * r * 0.62), underground: true,
      offset: Math.abs(x - WORLD.treeX), unlockStage: st,
    };
  }),
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
  cost: (r: number) => Math.round(1400 * Math.pow(1.38, r)),
  power: 0.07,
  hp: 0.1,
} as const;

export interface AbilityDef {
  name: string;
  desc: string;
  cost: number;
  cooldown: number;
  unlockStage: number;
  /** Star Blood to learn the rune (spear is known from the start) */
  learn: number;
  key: string;
}

/**
 * Abilities are Rune-Items from the books (Копьё Игг-Света, Игг-Молот: «Сияние»,
 * «Сотрясение Тверди»). Each has 3 slots for Observer properties (+1 with a Lesser
 * Rune of Development). Base numbers are meaningful on their own; properties shape them.
 */
export const ABILITIES = {
  spear: {
    name: 'Копьё Игг-Света', desc: 'Пронзающий луч игг-сияния туда, куда смотрит Восходящий: пробивает 3 тварей, бьёт и во тьме.',
    cost: 14, cooldown: 0.55, unlockStage: 1, learn: 0, key: '1',
    damage: 52, pierce: 3, falloff: 0.2, speed: 420, range: 320,
  },
  hammer: {
    name: 'Игг-Молот', desc: 'Прыжок Молота: Хранитель прыгает к курсору и бьёт в точке приземления — оглушает, отбрасывает, ломает броню, рушит Лазы, зажигает свет.',
    cost: 34, cooldown: 8, unlockStage: 2, learn: 4, key: '2',
    leap: 200, leapTime: 0.35, armorBreak: 4,
    damage: 95, radius: 92, stun: 1.6, knockback: 50, lightTime: 6, lightRadius: 80, restunWindow: 4,
  },
  starfall: {
    name: 'Звездопад', desc: 'Заряжается убийствами. Пять огромных звёзд падают у курсора: оглушают, рвут броню и выжигают землю.',
    cost: 0, cooldown: 70, unlockStage: 4, learn: 20, key: '3',
    damage: 520, meteors: 5, spread: 60, burnDps: 60, burnTime: 5, chargeMax: 100, impactRadius: 34, stun: 1.2,
  },
  radiance: {
    name: 'Сияние Игг', desc: 'Древо вспыхивает: Круг шире на 25%, Игг-свет жжёт Червей втрое, освещённые твари получают +30% урона.',
    cost: 45, cooldown: 26, unlockStage: 3, learn: 12, key: '4',
    duration: 8, radius: 0.25, burn: 3, vuln: 0.3,
  },
  swarm: {
    name: 'Зов Роя', desc: 'Гнёзда рядом с Восходящим 6 с атакуют на 60% быстрее и сразу чинятся на 25%.',
    cost: 40, cooldown: 20, unlockStage: 2, learn: 8, key: '5',
    duration: 6, reach: 170, haste: 0.6, heal: 0.35,
  },
  timestop: {
    name: 'Остановка Времени', desc: 'Руна-Заклинание: время в Круге застывает — твари замирают (боссы вдвое короче), новые не выходят из тьмы. Восстанавливается за ночи, а не секунды.',
    cost: 60, cooldown: 0, unlockStage: 3, learn: 25, key: '6',
    duration: 4, nights: 1,
  },
} satisfies Record<AbilityId, AbilityDef & Record<string, number | string>>;

/** Ability damage multiplier per tree stage above the first. */
export const ABILITY_STAGE_SCALING = 0.08;
/**
 * Созвучие: casting a different rune within `window` seconds of the last one adds a stack
 * (up to `max`); each stack makes the next casts stronger and cheaper. Rotating runes beats
 * spamming one. Перегрев: the Spear thrown again within `heatWindow` costs more each time.
 */
export const CHORD = { window: 6, max: 3, power: 0.15, discount: 0.1, heatWindow: 2.5, heat: 0.1, heatMax: 1, heatFree: 2 } as const;
export const RESTUN_FACTOR = 0.5;

/** «Жертва Света»: the Ascended bursts to save the Tree — a last resort. */
export const SACRIFICE = { radius: 170, damage: 420, knock: 260, stun: 2.2, reviveMul: 3 } as const;
/** The Observer's exchange: Amber ↔ Star Blood. */
export const EXCHANGE = { amberPerStar: 60, starToAmber: 25 } as const;

export const ECONOMY = {
  startAmber: 90,
  dawnBase: 50,
  dawnPerNight: 12,
  earlyCallPerSecond: 1,
  /**
   * «Натиск»: call the next night while stragglers of this one still roam (all of them
   * already spawned). Pays a share of the skipped dawn gift up front plus a bounty per
   * creature still alive; the skipped dawn (gift, roulette) arrives at the next real dawn.
   */
  /** the dawn gift is never paid up front any more (it arrives at the next dawn in full) */
  rushGiftShare: 0, rushPerEnemy: 5, rushStar: 2,
  /** share of the night's creatures that must be out before «Натиск» opens */
  rushOpen: 0.6,
  dropLifeLit: 25,
  dropLifeDark: 12,
} as const;

/** Pace: days to build and think, nights stretched so the player keeps up (playtest: «too fast»). */
export const DAY = { firstLength: 55, length: 35 } as const;
export const PACE = { spawnStretch: 1.25, enemySpeed: 0.88 } as const;
