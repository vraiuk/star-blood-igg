import type { ModPatch } from './mods';

/**
 * Igg-Tree stages follow the Ascension ranks of the books: a sprout, then
 * Wooden → Bronze → Silver → Golden Igg-Tree. Every growth gives a fixed unlock
 * (shown in advance so growing is a planned goal) and a choice of 1 of 2 branches.
 */
export interface TreeStage {
  name: string;
  rank: string;
  /** horizontal light radius on the surface ("the Circle") */
  radius: number;
  maxHp: number;
  /** keeper Light regen per second */
  lightRegen: number;
  /** Amber needed to reach the NEXT stage (0 at max) */
  growCost: number;
  /** damage multiplier for nests and tree sparks */
  power: number;
  /** fixed unlocks of this stage, as display lines */
  unlocks: string[];
}

export const TREE_STAGES: TreeStage[] = [
  {
    name: 'Росток Игг', rank: 'росток', radius: 110, maxHp: 500, lightRegen: 5, growCost: 50, power: 1,
    unlocks: ['Круг света 110', 'Копьё Игг-Света [1]', '4 руны гнёзд, 2 корневых узла'],
  },
  {
    name: 'Деревянное Игг-Древо', rank: 'дерево', radius: 150, maxHp: 650, lightRegen: 6, growCost: 90, power: 1.12,
    unlocks: ['Круг света 150', 'Корни Игг [2]', 'Древо стреляет искрами', '+2 руны гнёзд'],
  },
  {
    name: 'Бронзовое Игг-Древо', rank: 'бронза', radius: 190, maxHp: 800, lightRegen: 7, growCost: 140, power: 1.25,
    unlocks: ['Круг света 190', 'Игг-Молот [3]', '+2 руны, +2 корневых узла'],
  },
  {
    name: 'Серебряное Игг-Древо', rank: 'серебро', radius: 235, maxHp: 950, lightRegen: 8, growCost: 200, power: 1.4,
    unlocks: ['Круг света 235', 'Звездопад [4]', 'корни жгут Червей у ствола', '+2 руны, +2 корневых узла'],
  },
  {
    name: 'Золотое Игг-Древо', rank: 'золото', radius: 285, maxHp: 1100, lightRegen: 9.5, growCost: 0, power: 1.6,
    unlocks: ['Круг света 285', 'Нагрудник Светоносных: раз за ночь щит Древа', '+2 руны гнёзд'],
  },
];

export const TREE = {
  /** fraction of max hp healed on growth */
  growHeal: 0.5,
  dayRegen: 4,
  /** underground lit zone = radius * this */
  rootLightFactor: 0.45,
  /** stage 2+: sparks (damage scaled by stage power) */
  sparkStage: 2, sparkDamage: 10, sparkRate: 0.8, sparkRange: 120,
  /** stage 4+: root burn vs worms near the trunk */
  rootBurnStage: 4, rootBurnDps: 12, rootBurnRange: 75,
  /** stage 5: shield absorbs damage once per night when hp < 40% */
  shieldStage: 5, shieldAmount: 400, shieldThreshold: 0.4,
  /** damage to enemies that get caught by the new light on growth */
  growBurn: 25,
} as const;

export interface BranchDef {
  id: string;
  name: string;
  desc: string;
  mods: ModPatch;
}

/** Branch choice offered when the tree reaches stage index i (1..4). */
export const TREE_BRANCHES: Record<number, [BranchDef, BranchDef]> = {
  1: [
    { id: 'resin', name: 'Смоляные слёзы', desc: '+30% Янтаря с тварей', mods: { amberGain: 0.3 } },
    { id: 'sap', name: 'Терпкий сок', desc: 'Древо лечится 3 HP/с и ночью', mods: { treeRegen: 3 } },
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
    { id: 'beacon', name: 'Крона-маяк', desc: 'Искры Древа бьют тремя целями, гнёзда +10% дальности', mods: { sparkCount: 2, famRange: { hive: 0.1, dragonfly: 0.1 } } },
    { id: 'worldroot', name: 'Корень мира', desc: 'Все гнёзда +20% прочности, жуки +30%', mods: { famHp: { hive: 0.2, dragonfly: 0.2, beetle: 0.5 } } },
  ],
};
