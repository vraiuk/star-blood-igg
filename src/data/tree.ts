import type { ModPatch } from './mods';

/**
 * Igg-Tree growth ladder from the books: Семя («не пророщено, содержит Звёздную Кровь»)
 * → Росток («в два человеческих роста… два полупрозрачных листика», качество: золото)
 * → Малое Игг-Древо («световая ограда Круга») → Великое Игг-Древо.
 * «Чем оно старше — тем больше его световой радиус.» Every growth gives a fixed unlock
 * and a choice of 1 of 2 branches.
 */
export interface TreeStage {
  name: string;
  /** short label for compact UI */
  short: string;
  /** horizontal light radius on the surface ("the Circle") */
  radius: number;
  maxHp: number;
  /** keeper Light regen per second (before the distance factor) */
  lightRegen: number;
  /** Amber needed to reach the NEXT stage (0 at max) */
  growCost: number;
  /** damage multiplier for nests and tree sparks */
  power: number;
  /** Igg-light burn on worm-type enemies standing in light (dps) */
  wormBurn: number;
  /** surface & crown nests reach farther as the Circle widens (range / light multiplier) */
  reach: number;
  /** fixed unlocks of this stage, as display lines */
  unlocks: string[];
}

export const TREE_STAGES: TreeStage[] = [
  {
    name: 'Семя Игг-Древа', short: 'Семя', radius: 72, maxHp: 400, lightRegen: 5, growCost: 55, power: 1, wormBurn: 3, reach: 1,
    unlocks: ['Круг 72', 'Копьё Игг-Света [1]', 'Семя само защищает себя'],
  },
  {
    name: 'Пробуждённый Росток', short: 'Росток', radius: 112, maxHp: 650, lightRegen: 6, growCost: 150, power: 1.15, wormBurn: 5, reach: 1.05,
    unlocks: ['Круг 112', 'Игг-Молот [2]', 'Искры Древа'],
  },
  {
    name: 'Юный Игг', short: 'Юный Игг', radius: 160, maxHp: 950, lightRegen: 7, growCost: 450, power: 1.3, wormBurn: 8, reach: 1.15,
    unlocks: ['Круг 160', 'Слеза Ростка: лечение днём ×2', 'новые руны и корневые узлы'],
  },
  {
    name: 'Окрепший Росток', short: 'Окрепший', radius: 225, maxHp: 1350, lightRegen: 8, growCost: 1300, power: 1.5, wormBurn: 12, reach: 1.25,
    unlocks: ['Круг 225', 'Звездопад [3]', 'Полярии слетаются к Древу'],
  },
  {
    name: 'Малое Игг-Древо', short: 'Малое Древо', radius: 315, maxHp: 1850, lightRegen: 9, growCost: 3000, power: 1.75, wormBurn: 17, reach: 1.4,
    unlocks: ['Круг 315', 'корни жгут Червей у ствола', '«световая ограда Круга»'],
  },
  {
    name: 'Великое Игг-Древо', short: 'Великое Древо', radius: 440, maxHp: 2500, lightRegen: 10.5, growCost: 0, power: 2, wormBurn: 24, reach: 1.55,
    unlocks: ['Круг 440 — свет на весь край', 'Нагрудник Светоносных: щит раз за ночь'],
  },
];

export const TREE = {
  /** fraction of max hp healed on growth */
  growHeal: 0.5,
  dayRegen: 5,
  /** stage 3+: «Слеза Ростка» doubles day regen */
  tearStage: 3,
  /** underground lit zone = radius * this */
  rootLightFactor: 0.45,
  /** stage 2+: sparks (damage scaled by stage power) */
  sparkStage: 2, sparkDamage: 14, sparkRate: 0.8, sparkRange: 140,
  /** stage 4+: polaria — golden jellyfish drones that drift around the crown and zap */
  polariaStage: 4, polariaCount: 3, polariaDamage: 16, polariaRate: 1.1, polariaRange: 120,
  /** stage 5+: root burn vs worms near the trunk */
  rootBurnStage: 5, rootBurnDps: 20, rootBurnRange: 110,
  /** stage 6: shield absorbs damage once per night when hp < 40% */
  shieldStage: 6, shieldAmount: 900, shieldThreshold: 0.4,
  /** damage to enemies that get caught by the new light on growth */
  growBurn: 40,
} as const;

/**
 * Уклон Древа: every branch belongs to one of four paths. Three branches of one path turn
 * the tree into that kind of Igg-Tree for the run (a strong capstone).
 */
export type TreePath = 'amber' | 'light' | 'root' | 'star';
export const TREE_PATHS: Record<TreePath, { name: string; tree: string; color: string; capstone: string; mods: ModPatch }> = {
  amber: { name: 'Янтарный', tree: 'Янтарное Древо', color: '#ff9a3c', capstone: 'Янтарь с тварей +25%, Звёздной Крови +20%, рассветный дар +50%', mods: { amberGain: 0.25, starGain: 0.2, dawnGift: 0.5 } },
  light: { name: 'Светоносный', tree: 'Светоносное Древо', color: '#ffe58a', capstone: 'Игг-свет истончает Туман Тьмы вдвое, Круг +10%, Высвечивание +20%', mods: { fogPierce: true, lightRadius: 0.1, vuln: 0.2 } },
  root: { name: 'Корневой', tree: 'Корневое Древо', color: '#8fd06a', capstone: 'Корни сами засыпают Лазы, гнёзда +20% прочности, Древо +20% здоровья', mods: { rootSeal: true, famHp: { hive: 0.2, beetle: 0.2, dragonfly: 0.2, spider: 0.2, termite: 0.2 }, treeHp: 0.2 } },
  star: { name: 'Звёздный', tree: 'Звёздное Древо', color: '#8fd0ff', capstone: 'Умения Хранителя перезаряжаются на 25% быстрее и бьют на 20% сильнее', mods: { abilityCd: -0.25, abilityDamage: 0.2 } },
};
/** Branches of one path needed for its capstone. */
export const PATH_CAPSTONE = 3;

export interface BranchDef {
  id: string;
  name: string;
  desc: string;
  path: TreePath;
  mods: ModPatch;
}

/** Branch choice offered when the tree reaches stage index i (1..5): one of three paths. */
export const TREE_BRANCHES: Record<number, BranchDef[]> = {
  1: [
    { id: 'resin', path: 'amber', name: 'Смоляные слёзы', desc: '+30% Янтаря с тварей', mods: { amberGain: 0.3 } },
    { id: 'sap', path: 'root', name: 'Терпкий сок', desc: 'Древо лечится 6 HP/с и ночью, +15% здоровья', mods: { treeRegen: 6, treeHp: 0.15 } },
    { id: 'dew', path: 'star', name: 'Звёздная роса', desc: 'Умения на 20% дешевле, +20% регенерации Света', mods: { abilityCost: -0.2, lightRegen: 0.2 } },
  ],
  2: [
    { id: 'undergrowth', path: 'light', name: 'Светлый подлесок', desc: 'Стрекозы +25% света, ульи +15% урона', mods: { famRange: { dragonfly: 0.25 }, famDamage: { hive: 0.15 } } },
    { id: 'deeproots', path: 'root', name: 'Глубокие корни', desc: 'Пауки +35% урона, Черви роняют +1 Кровь', mods: { famDamage: { spider: 0.35 }, wormStar: 1 } },
    { id: 'honeyflow', path: 'amber', name: 'Щедрая крона', desc: 'Гнёзда на 15% дешевле, Звёздной Крови +15%', mods: { nestCost: -0.15, starGain: 0.15 } },
  ],
  3: [
    { id: 'bark', path: 'root', name: 'Янтарная кора', desc: 'Древо отражает 30% урона в атакующих', mods: { treeReflect: 0.3 } },
    { id: 'song', path: 'star', name: 'Песнь листвы', desc: 'Свет Хранителя +40% регенерации, умения +15%', mods: { lightRegen: 0.4, abilityDamage: 0.15 } },
    { id: 'glare', path: 'light', name: 'Слепящий блеск', desc: 'Высвечивание +25%, стрекозы +30% урона (и по летунам)', mods: { vuln: 0.25, famDamage: { dragonfly: 0.3 } } },
  ],
  4: [
    { id: 'beacon', path: 'light', name: 'Крона-маяк', desc: 'Искры бьют тремя целями, Полярий на 2 больше', mods: { sparkCount: 2, polaria: 2 } },
    { id: 'worldroot', path: 'root', name: 'Корень мира', desc: 'Гнёзда +20% прочности, жуки +50%', mods: { famHp: { hive: 0.2, dragonfly: 0.2, spider: 0.2, beetle: 0.5 } } },
    { id: 'goldleaf', path: 'amber', name: 'Золотая листва', desc: 'Рассветный дар +60%, Янтарь +15%', mods: { dawnGift: 0.6, amberGain: 0.15 } },
  ],
  5: [
    { id: 'goldenrain', path: 'light', name: 'Золотой дождь', desc: 'Игг-свет жжёт Червей вдвое сильнее', mods: { wormBurn: 1 } },
    { id: 'starcrown', path: 'star', name: 'Звёздная крона', desc: 'Все гнёзда +20% урона, Звездопад заряжается быстрее', mods: { famDamage: { hive: 0.2, beetle: 0.2, dragonfly: 0.2, spider: 0.2 }, chargeGain: 0.3 } },
    { id: 'rootwall', path: 'root', name: 'Стена корней', desc: 'Корни жгут Червей вдвое сильнее, Древо +25% здоровья', mods: { rootBurn: 1, treeHp: 0.25 } },
  ],
};

/** Branch definition by id. */
export function branchById(id: string): BranchDef | undefined {
  for (const list of Object.values(TREE_BRANCHES)) for (const b of list) if (b.id === id) return b;
  return undefined;
}

/** How many branches of each path are chosen. */
export function pathCounts(branches: string[]): Record<TreePath, number> {
  const out: Record<TreePath, number> = { amber: 0, light: 0, root: 0, star: 0 };
  for (const id of branches) { const b = branchById(id); if (b) out[b.path]++; }
  return out;
}
