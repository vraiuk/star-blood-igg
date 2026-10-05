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
  /** fixed unlocks of this stage, as display lines */
  unlocks: string[];
}

export const TREE_STAGES: TreeStage[] = [
  {
    name: 'Семя Игг-Древа', short: 'Семя', radius: 72, maxHp: 400, lightRegen: 5, growCost: 40, power: 1, wormBurn: 3,
    unlocks: ['Круг 72', 'Копьё Игг-Света [1]', 'Семя само защищает себя'],
  },
  {
    name: 'Пробуждённый Росток', short: 'Росток', radius: 112, maxHp: 650, lightRegen: 6, growCost: 90, power: 1.15, wormBurn: 5,
    unlocks: ['Круг 112', 'Игг-Молот [2]', 'Искры Древа'],
  },
  {
    name: 'Юный Игг', short: 'Юный Игг', radius: 160, maxHp: 950, lightRegen: 7, growCost: 160, power: 1.3, wormBurn: 8,
    unlocks: ['Круг 160', 'Слеза Ростка: лечение днём ×2', 'новые руны и корневые узлы'],
  },
  {
    name: 'Окрепший Росток', short: 'Окрепший', radius: 225, maxHp: 1350, lightRegen: 8, growCost: 260, power: 1.5, wormBurn: 12,
    unlocks: ['Круг 225', 'Звездопад [3]', 'Полярии слетаются к Древу'],
  },
  {
    name: 'Малое Игг-Древо', short: 'Малое Древо', radius: 315, maxHp: 1850, lightRegen: 9, growCost: 400, power: 1.75, wormBurn: 17,
    unlocks: ['Круг 315', 'корни жгут Червей у ствола', '«световая ограда Круга»'],
  },
  {
    name: 'Великое Игг-Древо', short: 'Великое Древо', radius: 440, maxHp: 2500, lightRegen: 10.5, growCost: 0, power: 2, wormBurn: 24,
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

export interface BranchDef {
  id: string;
  name: string;
  desc: string;
  mods: ModPatch;
}

/** Branch choice offered when the tree reaches stage index i (1..5). */
export const TREE_BRANCHES: Record<number, [BranchDef, BranchDef]> = {
  1: [
    { id: 'resin', name: 'Смоляные слёзы', desc: '+30% Янтаря с тварей', mods: { amberGain: 0.3 } },
    { id: 'sap', name: 'Терпкий сок', desc: 'Древо лечится 5 HP/с и ночью', mods: { treeRegen: 5 } },
  ],
  2: [
    { id: 'undergrowth', name: 'Светлый подлесок', desc: 'Стрекозы +25% света, ульи +15% урона', mods: { famRange: { dragonfly: 0.25 }, famDamage: { hive: 0.15 } } },
    { id: 'deeproots', name: 'Глубокие корни', desc: 'Пауки +35% урона, Черви роняют +1 Кровь', mods: { famDamage: { spider: 0.35 }, wormStar: 1 } },
  ],
  3: [
    { id: 'bark', name: 'Янтарная кора', desc: 'Древо отражает 30% урона в атакующих', mods: { treeReflect: 0.3 } },
    { id: 'song', name: 'Песнь листвы', desc: 'Свет Хранителя +40% регенерации, умения +15%', mods: { lightRegen: 0.4, abilityDamage: 0.15 } },
  ],
  4: [
    { id: 'beacon', name: 'Крона-маяк', desc: 'Искры бьют тремя целями, Полярий на 2 больше', mods: { sparkCount: 2, polaria: 2 } },
    { id: 'worldroot', name: 'Корень мира', desc: 'Гнёзда +20% прочности, жуки +50%', mods: { famHp: { hive: 0.2, dragonfly: 0.2, spider: 0.2, beetle: 0.5 } } },
  ],
  5: [
    { id: 'goldenrain', name: 'Золотой дождь', desc: 'Игг-свет жжёт Червей вдвое сильнее', mods: { wormBurn: 1 } },
    { id: 'starcrown', name: 'Звёздная крона', desc: 'Все гнёзда +20% урона, Звездопад заряжается быстрее', mods: { famDamage: { hive: 0.2, beetle: 0.2, dragonfly: 0.2, spider: 0.2 }, chargeGain: 0.3 } },
  ],
};
