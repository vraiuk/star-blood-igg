import type { ModPatch } from './mods';

/**
 * Runes are granted by the Observer (Тот-Кто-Наблюдает) through the Tablet (Скрижаль):
 * at every dawn the Keeper picks 1 of 3. Ranks mirror the books: Дерево, Бронза,
 * Серебро, Золото — rarer ranks appear in later nights.
 */
export type RuneRank = 0 | 1 | 2 | 3;
export const RUNE_RANKS = ['Дерево', 'Бронза', 'Серебро', 'Золото'] as const;
export const RUNE_RANK_COLORS = ['#b08a5a', '#d9883a', '#c9d4e6', '#ffd24a'] as const;

export type OfferKind = 'rune' | 'creature' | 'gift';

export interface RuneDef {
  id: string;
  kind: OfferKind;
  /** Rune category from the books: Свойство, Умение, Существо… */
  category: string;
  name: string;
  desc: string;
  rank: RuneRank;
  mods: ModPatch;
  /** one-shot resources for gifts */
  amber?: number;
  star?: number;
  /** icon id */
  icon: string;
}

export const RUNES: RuneDef[] = [
  // ── Умения: change how abilities behave
  { id: 'ricochet', kind: 'rune', category: 'Руна-Умение', name: 'Рикошет', icon: 'spear', rank: 1,
    desc: 'Копьё после последнего пробития отскакивает к ближайшей твари (50% урона)', mods: { spearRicochet: true } },
  { id: 'beacon', kind: 'rune', category: 'Руна-Умение', name: 'Метка-маяк', icon: 'spear', rank: 2,
    desc: 'Копьё оставляет метку: твари рядом 4 с получают +25% урона от гнёзд', mods: { spearBeacon: true } },
  { id: 'rhythm', kind: 'rune', category: 'Руна-Умение', name: 'Ритм', icon: 'spear', rank: 1,
    desc: 'Каждое 3-е попадание Копья подряд (за 2 с) наносит ×2 урона', mods: { spearRhythm: true } },
  { id: 'pierce', kind: 'rune', category: 'Руна-Свойство', name: 'Длинное древко', icon: 'spear', rank: 0,
    desc: 'Копьё пробивает на 1 тварь больше', mods: { spearPierce: 1 } },
  { id: 'refund', kind: 'rune', category: 'Руна-Умение', name: 'Солнечный откат', icon: 'hammer', rank: 1,
    desc: 'Игг-Молот возвращает 4 Света за каждую задетую тварь', mods: { hammerRefund: true } },
  { id: 'eclipse', kind: 'rune', category: 'Руна-Умение', name: 'Затмение', icon: 'hammer', rank: 2,
    desc: 'После Молота 4 с держится поле света: −30% скорости тварей', mods: { hammerEclipse: true } },
  { id: 'spread', kind: 'rune', category: 'Руна-Умение', name: 'Прорастание', icon: 'roots', rank: 1,
    desc: 'Корни через секунду переползают ещё на соседнюю тварь', mods: { rootsSpread: true } },
  { id: 'brittle', kind: 'rune', category: 'Руна-Умение', name: 'Хрупкость', icon: 'roots', rank: 2,
    desc: 'Оглушённые твари получают от Корней ×2 урона', mods: { rootsBrittle: true } },
  { id: 'sower', kind: 'rune', category: 'Руна-Умение', name: 'Сеятель', icon: 'roots', rank: 1,
    desc: 'Корни рядом с гнездом ускоряют его атаки на 30% на 5 с', mods: { rootsSower: true } },
  { id: 'harvest', kind: 'rune', category: 'Руна-Умение', name: 'Жатва', icon: 'roots', rank: 2,
    desc: 'Твари, убитые в корнях, дают +1 Звёздную Кровь', mods: { rootsHarvest: true } },
  { id: 'lastlight', kind: 'rune', category: 'Руна-Свойство', name: 'Последний свет', icon: 'light', rank: 3,
    desc: 'Когда Света меньше 20, на 3 с умения бесплатны (раз в 45 с)', mods: { lastLight: true } },
  // ── Свойства: keeper stats
  { id: 'swift', kind: 'rune', category: 'Руна-Свойство', name: 'Лёгкий шаг', icon: 'light', rank: 0,
    desc: '+20% скорости Хранителя, +30% радиус сбора', mods: { keeperSpeed: 0.2, magnet: 0.3 } },
  { id: 'wellspring', kind: 'rune', category: 'Руна-Свойство', name: 'Родник Света', icon: 'light', rank: 0,
    desc: '+25% регенерации Света', mods: { lightRegen: 0.25 } },
  { id: 'vessel', kind: 'rune', category: 'Руна-Свойство', name: 'Сосуд', icon: 'light', rank: 1,
    desc: '+30 к запасу Света, +30 HP Хранителя', mods: { lightMax: 30, keeperHp: 30 } },
  { id: 'focus', kind: 'rune', category: 'Руна-Свойство', name: 'Фокус Восходящего', icon: 'star', rank: 2,
    desc: 'Умения +20% урона и на 15% дешевле', mods: { abilityDamage: 0.2, abilityCost: -0.15 } },
  { id: 'meteor', kind: 'rune', category: 'Руна-Свойство', name: 'Звёздный след', icon: 'star', rank: 1,
    desc: 'Звездопад заряжается на 40% быстрее', mods: { chargeGain: 0.4 } },
  { id: 'wormhunt', kind: 'rune', category: 'Руна-Свойство', name: 'Охотник на Червей', icon: 'blood', rank: 2,
    desc: 'Черви роняют +1 Звёздную Кровь, Звёздной Крови +25%', mods: { wormStar: 1, starGain: 0.25 } },
  // ── Руны-Существа: family boons
  { id: 'c-hive', kind: 'creature', category: 'Руна-Существо', name: 'Матка светляков', icon: 'hive', rank: 0,
    desc: 'Ульи светляков +20% урона', mods: { famDamage: { hive: 0.2 } } },
  { id: 'c-beetle', kind: 'creature', category: 'Руна-Существо', name: 'Хитиновый панцирь', icon: 'beetle', rank: 0,
    desc: 'Жуки-щитоносцы +35% прочности', mods: { famHp: { beetle: 0.35 } } },
  { id: 'c-dragonfly', kind: 'creature', category: 'Руна-Существо', name: 'Крылья зари', icon: 'dragonfly', rank: 0,
    desc: 'Стрекозы +20% света и +30% ожога', mods: { famRange: { dragonfly: 0.2 }, famDamage: { dragonfly: 0.3 } } },
  { id: 'c-spider', kind: 'creature', category: 'Руна-Существо', name: 'Шёлк глубин', icon: 'spider', rank: 0,
    desc: 'Пауки-ткачи +30% урона и охвата', mods: { famDamage: { spider: 0.3 }, famRange: { spider: 0.3 } } },
  { id: 'c-thrift', kind: 'creature', category: 'Руна-Существо', name: 'Бережливый рой', icon: 'hive', rank: 1,
    desc: 'Гнёзда на 15% дешевле', mods: { nestCost: -0.15 } },
  // ── Дары: one-shot resources
  { id: 'g-amber', kind: 'gift', category: 'Дар Наблюдателя', name: '30 Монет', icon: 'amber', rank: 0,
    desc: 'Наблюдатель меняет Монеты на 60 Янтаря', mods: {}, amber: 60 },
  { id: 'g-star', kind: 'gift', category: 'Дар Наблюдателя', name: 'Капля Звёздной Крови', icon: 'blood', rank: 1,
    desc: '+8 Звёздной Крови', mods: {}, star: 8 },
  { id: 'g-resin', kind: 'gift', category: 'Руна-Свойство', name: 'Янтарная жила', icon: 'amber', rank: 1,
    desc: '+20% Янтаря с тварей до конца ночей', mods: { amberGain: 0.2 } },
];

/** Max rune rank offered at a given dawn (0-based night just finished). */
export function maxRankForNight(night: number): RuneRank {
  return Math.min(3, night) as RuneRank;
}
