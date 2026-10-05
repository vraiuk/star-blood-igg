import type { ModPatch } from './mods';

/**
 * Meta-progression between runs: the Igg-Tree talent tree, paid with the Observer's
 * Coins (Монеты Наблюдателя). Shape: a literal tree — trunk (the Tree), four crown
 * branches (creature families), roots (the Keeper). The last node of every branch is
 * qualitative (new mechanic), not a percentage. Free full respec.
 */
export type MetaBranch = 'trunk' | 'hive' | 'beetle' | 'dragonfly' | 'spider' | 'roots';

export interface MetaNode {
  id: string;
  branch: MetaBranch;
  /** position along the branch, 0 = closest to the trunk */
  tier: number;
  name: string;
  desc: string;
  cost: number;
  mods: ModPatch;
  /** node id that must be bought first */
  requires?: string;
  /** qualitative capstone */
  capstone?: boolean;
}

export const META_BRANCH_NAMES: Record<MetaBranch, string> = {
  trunk: 'Ствол Игг', hive: 'Ветвь светляков', beetle: 'Ветвь щитоносцев',
  dragonfly: 'Ветвь стрекоз', spider: 'Ветвь пауков', roots: 'Корни Хранителя',
};

const chain = (branch: MetaBranch, nodes: Array<Omit<MetaNode, 'branch' | 'tier' | 'requires'>>): MetaNode[] =>
  nodes.map((n, i) => ({ ...n, branch, tier: i, requires: i > 0 ? nodes[i - 1].id : undefined }));

export const META_NODES: MetaNode[] = [
  ...chain('trunk', [
    { id: 't1', name: 'Живица', desc: '+25 Янтаря в начале', cost: 1, mods: { startAmber: 25 } },
    { id: 't2', name: 'Толстая кора', desc: 'Древо +15% здоровья', cost: 1, mods: { treeHp: 0.15 } },
    { id: 't3', name: 'Широкий Круг', desc: 'Круг света +8%', cost: 2, mods: { lightRadius: 0.08 } },
    { id: 't4', name: 'Щедрый рассвет', desc: 'Рассветный дар +40%', cost: 2, mods: { dawnGift: 0.4 } },
    { id: 't5', name: 'Второе дыхание', desc: 'Раз за забег Древо не погибает, а остаётся с 30% здоровья', cost: 4, mods: { secondWind: true }, capstone: true },
  ]),
  ...chain('hive', [
    { id: 'h1', name: 'Жгучее жало', desc: 'Ульи +10% урона', cost: 1, mods: { famDamage: { hive: 0.1 } } },
    { id: 'h2', name: 'Дальний полёт', desc: 'Ульи +10% дальности', cost: 1, mods: { famRange: { hive: 0.1 } } },
    { id: 'h3', name: 'Ярость роя', desc: 'Ульи +15% урона', cost: 2, mods: { famDamage: { hive: 0.15 } } },
    { id: 'h4', name: 'Сумеречное зрение', desc: 'Светляки бьют тварей во тьме у края Круга (+30 к зоне)', cost: 3, mods: { hiveSeesDark: true }, capstone: true },
  ]),
  ...chain('beetle', [
    { id: 'b1', name: 'Хитин', desc: 'Жуки +15% прочности', cost: 1, mods: { famHp: { beetle: 0.15 } } },
    { id: 'b2', name: 'Дешёвые коконы', desc: 'Все гнёзда −8% цены', cost: 1, mods: { nestCost: -0.08 } },
    { id: 'b3', name: 'Колючий панцирь', desc: 'Жуки +25% прочности', cost: 2, mods: { famHp: { beetle: 0.25 } } },
    { id: 'b4', name: 'Новая линька', desc: 'Погибший жук возрождается на рассвете бесплатно', cost: 3, mods: { beetleRevive: true }, capstone: true },
  ]),
  ...chain('dragonfly', [
    { id: 'd1', name: 'Светлое крыло', desc: 'Стрекозы +10% света', cost: 1, mods: { famRange: { dragonfly: 0.1 } } },
    { id: 'd2', name: 'Жар крыльев', desc: 'Стрекозы +20% урона', cost: 1, mods: { famDamage: { dragonfly: 0.2 } } },
    { id: 'd3', name: 'Ореол', desc: 'Стрекозы +15% света', cost: 2, mods: { famRange: { dragonfly: 0.15 } } },
    { id: 'd4', name: 'Попутный ветер', desc: 'Гнёзда в свету стрекоз атакуют на 20% быстрее', cost: 3, mods: { dragonflyHaste: true }, capstone: true },
  ]),
  ...chain('spider', [
    { id: 's1', name: 'Липкий шёлк', desc: 'Пауки +15% урона', cost: 1, mods: { famDamage: { spider: 0.15 } } },
    { id: 's2', name: 'Чутьё глубин', desc: 'Пауки +20% охвата', cost: 1, mods: { famRange: { spider: 0.2 } } },
    { id: 's3', name: 'Кровавый урожай', desc: 'Черви роняют +1 Звёздную Кровь', cost: 2, mods: { wormStar: 1 } },
    { id: 's4', name: 'Паутина над землёй', desc: 'Пауки бьют и личинок с Маткой на поверхности', cost: 3, mods: { spiderSurface: true }, capstone: true },
  ]),
  ...chain('roots', [
    { id: 'r1', name: 'Закалка', desc: 'Хранитель +25 HP', cost: 1, mods: { keeperHp: 25 } },
    { id: 'r2', name: 'Чистый Свет', desc: '+15% регенерации Света', cost: 1, mods: { lightRegen: 0.15 } },
    { id: 'r3', name: 'Звёздная жила', desc: '+5 Звёздной Крови в начале', cost: 2, mods: { startStar: 5 } },
    { id: 'r4', name: 'Рука Восходящего', desc: 'Умения +15% урона', cost: 2, mods: { abilityDamage: 0.15 } },
    { id: 'r5', name: 'Дар Тинга', desc: 'В начале забега Наблюдатель даёт выбрать Руну', cost: 4, mods: {}, capstone: true },
  ]),
];

/** Coins awarded after a run. */
export function coinsForRun(nightsSurvived: number, stars: number, path: number): number {
  return Math.round((nightsSurvived + stars * 2) * (1 + (path - 1) * 0.5));
}

/** Difficulty paths: enemy hp multiplier and amber income multiplier. */
export const PATHS = [
  { name: 'Тропа Ростка', desc: 'Обычная сложность', hp: 1, amber: 1 },
  { name: 'Тропа Сумерек', desc: 'Твари +30% здоровья', hp: 1.3, amber: 1 },
  { name: 'Тропа Земель Теней', desc: 'Твари +60% здоровья, Янтаря −15%', hp: 1.6, amber: 0.85 },
] as const;
