import type { ModPatch } from './mods';

/**
 * Rune system after the books: the Keeper carries Rune-Items (Копьё Игг-Света, Игг-Молот,
 * Звездопад) and the Руна Света. Each rune has 3 slots for Properties (Свойства) bought in
 * the Observer's treasury for Star Blood («Наблюдатель продаёт только Свойства»), e.g.
 * Усиление (up to three upgrades), Уменьшение (cheaper activation). A Lesser Rune of
 * Development (rare drop) opens a 4th slot. At dawn the Observer's roulette offers 1 of 3.
 */
export type RuneRank = 0 | 1 | 2 | 3 | 4;
export const RUNE_RANKS = ['Дерево', 'Бронза', 'Серебро', 'Золото', 'Небо'] as const;
export const RUNE_RANK_COLORS = ['#b08a5a', '#d9883a', '#c9d4e6', '#ffd24a', '#8fd0ff'] as const;

export type KeeperRuneId = 'spear' | 'hammer' | 'starfall' | 'radiance' | 'swarm' | 'light';

export const KEEPER_RUNES: Record<KeeperRuneId, { name: string; icon: string; desc: string }> = {
  spear: { name: 'Копьё Игг-Света', icon: 'spear', desc: 'Руна-Предмет (золото)' },
  hammer: { name: 'Игг-Молот', icon: 'hammer', desc: 'Руна-Предмет (золото)' },
  starfall: { name: 'Звездопад', icon: 'starfall', desc: 'Руна-Заклинание' },
  radiance: { name: 'Сияние Игг', icon: 'radiance', desc: 'Руна-Умение' },
  swarm: { name: 'Зов Роя', icon: 'swarm', desc: 'Руна-Умение' },
  light: { name: 'Руна Света', icon: 'light', desc: 'Руна-Свойство Восходящего' },
};

export const BASE_SLOTS = 3;
export const MAX_SLOTS = 4;

export interface PropertyDef {
  id: string;
  rune: KeeperRuneId;
  /** Property type from the books: Усиление, Уменьшение, Изменение… */
  type: string;
  name: string;
  desc: string;
  rank: RuneRank;
  /** price in Star Blood */
  price: number;
  /** how many copies may be installed on the rune (Усиление: up to 3) */
  stack: number;
  mods: ModPatch;
}

const P = (o: PropertyDef) => o;

export const PROPERTIES: PropertyDef[] = [
  // ── Копьё Игг-Света
  P({ id: 'sp-power', rune: 'spear', type: 'Усиление', name: 'Усиление: Копьё', desc: '+35% урона Копья', rank: 1, price: 6, stack: 3, mods: { spearDamage: 0.35 } }),
  P({ id: 'sp-cheap', rune: 'spear', type: 'Уменьшение', name: 'Уменьшение: Копьё', desc: 'Копьё на 35% дешевле', rank: 1, price: 6, stack: 1, mods: { spearCost: -0.35 } }),
  P({ id: 'sp-pierce', rune: 'spear', type: 'Изменение', name: 'Длинное древко', desc: 'Пробивает на 2 тварей больше', rank: 1, price: 7, stack: 1, mods: { spearPierce: 2 } }),
  P({ id: 'sp-ricochet', rune: 'spear', type: 'Изменение', name: 'Рикошет', desc: 'После пробития отскакивает к ближайшей твари (60%)', rank: 2, price: 10, stack: 1, mods: { spearRicochet: true } }),
  P({ id: 'sp-beacon', rune: 'spear', type: 'Изменение', name: 'Метка-маяк', desc: 'Задетые твари 4 с получают +25% урона от гнёзд', rank: 2, price: 10, stack: 1, mods: { spearBeacon: true } }),
  P({ id: 'sp-rhythm', rune: 'spear', type: 'Изменение', name: 'Ритм', desc: 'Каждое 3-е попадание подряд — ×2 урона', rank: 2, price: 9, stack: 1, mods: { spearRhythm: true } }),
  // ── Игг-Молот
  P({ id: 'hm-power', rune: 'hammer', type: 'Усиление', name: 'Усиление: Молот', desc: '+35% урона Молота', rank: 1, price: 6, stack: 3, mods: { hammerDamage: 0.35 } }),
  P({ id: 'hm-cheap', rune: 'hammer', type: 'Уменьшение', name: 'Уменьшение: Молот', desc: 'Молот на 35% дешевле и перезаряжается на 25% быстрее', rank: 1, price: 7, stack: 1, mods: { hammerCost: -0.35 } }),
  P({ id: 'hm-quake', rune: 'hammer', type: 'Изменение', name: 'Сотрясение Тверди', desc: 'Молот бьёт и Червей под землёй, радиус +25%', rank: 2, price: 10, stack: 1, mods: { hammerQuake: true, hammerRadius: 0.25 } }),
  P({ id: 'hm-refund', rune: 'hammer', type: 'Изменение', name: 'Солнечный откат', desc: '+5 Света за каждую задетую тварь', rank: 1, price: 7, stack: 1, mods: { hammerRefund: true } }),
  P({ id: 'hm-eclipse', rune: 'hammer', type: 'Изменение', name: 'Затмение', desc: 'После удара 5 с держится поле: −35% скорости тварей', rank: 2, price: 9, stack: 1, mods: { hammerEclipse: true } }),
  // ── Звездопад
  P({ id: 'sf-power', rune: 'starfall', type: 'Усиление', name: 'Усиление: Звездопад', desc: '+35% урона звёзд', rank: 2, price: 8, stack: 3, mods: { starfallDamage: 0.35 } }),
  P({ id: 'sf-charge', rune: 'starfall', type: 'Уменьшение', name: 'Звёздный след', desc: 'Заряжается на 45% быстрее', rank: 1, price: 7, stack: 1, mods: { chargeGain: 0.45 } }),
  P({ id: 'sf-rain', rune: 'starfall', type: 'Изменение', name: 'Ливень', desc: '+3 звезды', rank: 3, price: 14, stack: 1, mods: { starfallMeteors: 3 } }),
  P({ id: 'sf-scorch', rune: 'starfall', type: 'Изменение', name: 'Выжженная земля', desc: 'Пламя от звёзд жжёт вдвое сильнее', rank: 2, price: 9, stack: 1, mods: { starfallBurn: 1 } }),
  // ── Сияние Игг
  P({ id: 'rd-long', rune: 'radiance', type: 'Усиление', name: 'Долгое сияние', desc: 'Сияние длится на 50% дольше', rank: 1, price: 7, stack: 2, mods: {} }),
  P({ id: 'rd-heal', rune: 'radiance', type: 'Изменение', name: 'Целящий свет', desc: 'Во время Сияния Древо лечится 20 HP/с', rank: 2, price: 9, stack: 1, mods: {} }),
  // ── Зов Роя
  P({ id: 'sw-wide', rune: 'swarm', type: 'Усиление', name: 'Широкий зов', desc: 'Охват Зова Роя +40%', rank: 1, price: 6, stack: 2, mods: {} }),
  P({ id: 'sw-fury', rune: 'swarm', type: 'Изменение', name: 'Ярость роя', desc: 'Гнёзда под Зовом наносят +40% урона', rank: 2, price: 10, stack: 1, mods: {} }),
  // ── Руна Света
  P({ id: 'lt-spring', rune: 'light', type: 'Усиление', name: 'Родник Света', desc: '+30% регенерации Света', rank: 1, price: 6, stack: 2, mods: { lightRegen: 0.3 } }),
  P({ id: 'lt-vessel', rune: 'light', type: 'Усиление', name: 'Сосуд', desc: '+40 к запасу Света, +40 HP', rank: 1, price: 6, stack: 2, mods: { lightMax: 40, keeperHp: 40 } }),
  P({ id: 'lt-root', rune: 'light', type: 'Изменение', name: 'Корень Света', desc: 'У ствола Древа Свет течёт ещё вдвое быстрее', rank: 2, price: 8, stack: 1, mods: { nearRegen: 1 } }),
  P({ id: 'lt-step', rune: 'light', type: 'Изменение', name: 'Лёгкий шаг', desc: '+25% скорости, +50% радиус сбора', rank: 0, price: 4, stack: 1, mods: { keeperSpeed: 0.25, magnet: 0.5 } }),
  P({ id: 'lt-last', rune: 'light', type: 'Изменение', name: 'Последний свет', desc: 'Когда Света < 20 — 3 с умения бесплатны (раз в 45 с)', rank: 3, price: 12, stack: 1, mods: { lastLight: true } }),
];

/** Dawn roulette extras: creature runes (nest boons) and one-shot gifts. */
export interface BoonDef {
  id: string;
  kind: 'creature' | 'gift';
  category: string;
  name: string;
  desc: string;
  rank: RuneRank;
  icon: string;
  mods: ModPatch;
  amber?: number;
  star?: number;
  devRune?: number;
}

export const BOONS: BoonDef[] = [
  { id: 'c-hive', kind: 'creature', category: 'Руна-Существо', name: 'Матка светляков', icon: 'hive', rank: 0, desc: 'Ульи светляков +20% урона', mods: { famDamage: { hive: 0.2 } } },
  { id: 'c-beetle', kind: 'creature', category: 'Руна-Существо', name: 'Хитин Светожука', icon: 'beetle', rank: 0, desc: 'Светожуки +35% прочности', mods: { famHp: { beetle: 0.35 } } },
  { id: 'c-dragonfly', kind: 'creature', category: 'Руна-Существо', name: 'Крылья Хранителей', icon: 'dragonfly', rank: 1, desc: 'Высвечивание стрекоз +15%, свет +20%', mods: { vuln: 0.15, famRange: { dragonfly: 0.2 } } },
  { id: 'c-spider', kind: 'creature', category: 'Руна-Существо', name: 'Шёлк глубин', icon: 'spider', rank: 0, desc: 'Пауки-ткачи +30% урона и охвата', mods: { famDamage: { spider: 0.3 }, famRange: { spider: 0.3 } } },
  { id: 'c-thrift', kind: 'creature', category: 'Руна-Существо', name: 'Бережливый рой', icon: 'hive', rank: 1, desc: 'Гнёзда на 15% дешевле', mods: { nestCost: -0.15 } },
  { id: 'c-wormhunt', kind: 'creature', category: 'Руна-Свойство', name: 'Охотник на Червей', icon: 'star', rank: 2, desc: 'Черви роняют +1 Звёздную Кровь, Крови +25%', mods: { wormStar: 1, starGain: 0.25 } },
  { id: 'g-amber', kind: 'gift', category: 'Дар Наблюдателя', name: 'Сто Монет', icon: 'amber', rank: 0, desc: 'Наблюдатель меняет Монеты на 90 Янтаря', mods: {}, amber: 90 },
  { id: 'g-star', kind: 'gift', category: 'Дар Наблюдателя', name: 'Капли Звёздной Крови', icon: 'star', rank: 1, desc: '+10 Звёздной Крови', mods: {}, star: 10 },
  { id: 'g-dev', kind: 'gift', category: 'Руна (серебро)', name: 'Малая Руна Развития', icon: 'rune', rank: 2, desc: 'Открывает 4-й слот у любой руны Хранителя', mods: {}, devRune: 1 },
  { id: 'g-resin', kind: 'gift', category: 'Руна-Свойство', name: 'Янтарная жила', icon: 'amber', rank: 1, desc: '+20% Янтаря с тварей до конца ночей', mods: { amberGain: 0.2 } },
];

/** Max rank offered at a given dawn (0-based night just finished). */
export function maxRankForNight(night: number): RuneRank {
  return Math.min(4, Math.floor(night / 2) + 1) as RuneRank;
}

export function propertyById(id: string) { return PROPERTIES.find((p) => p.id === id); }
export function boonById(id: string) { return BOONS.find((b) => b.id === id); }

// ───────────────────────────── rune ranks & forms ─────────────────────────────

/**
 * Each keeper rune has its own rank (Повышение — a Property from the books that raises a
 * rune's rank). Ranks scale power and area; at Серебро the rune takes one of two Forms
 * that change how it is used; at Небо the chosen Form reaches its Apotheosis.
 */
const RANK_COST = [0, 12, 25, 45, 80];
const RANK_POWER = [1, 1.35, 1.8, 2.4, 3.2];
const RANK_AREA = [1, 1.1, 1.2, 1.35, 1.5];
const RANK_CD = [1, 0.95, 0.9, 0.85, 0.8];
/** Beyond «Небо» runes climb endless Star ranks: +15% power each, exponentially priced. */
export const runeRankCost = (r: number) => (r < RANK_COST.length ? RANK_COST[r] : Math.round(80 * Math.pow(1.45, r - 4)));
export const runeRankPower = (r: number) => (r < RANK_POWER.length ? RANK_POWER[r] : 3.2 * Math.pow(1.15, r - 4));
export const runeRankArea = (r: number) => RANK_AREA[Math.min(r, RANK_AREA.length - 1)];
export const runeRankCd = (r: number) => RANK_CD[Math.min(r, RANK_CD.length - 1)];
export const runeRankName = (r: number) => (r < RUNE_RANKS.length ? RUNE_RANKS[r] : `Звезда ${r - 4}`);
/** Ability colour by rune rank: the rank ladder, then violet → crimson → emerald → white for Star ranks. */
const STAR_COLORS = ['#b48cff', '#ff5a6a', '#7af0a0', '#ffffff'];
export const runeColor = (r: number) => (r < RUNE_RANK_COLORS.length ? (r === 0 ? '#ffe58a' : RUNE_RANK_COLORS[r]) : STAR_COLORS[(r - 5) % STAR_COLORS.length]);
/** rank index where a Form is chosen / reaches Apotheosis */
export const FORM_RANK = 2;
export const APOTHEOSIS_RANK = 4;

export type FormId = 'A' | 'B';
export interface FormDef { name: string; desc: string; apo: string; }

export const RUNE_FORMS: Record<'spear' | 'hammer' | 'starfall', Record<FormId, FormDef>> = {
  spear: {
    A: { name: 'Веер Игг', desc: 'Пять коротких копий веером: разрывает толпу у ног Восходящего', apo: 'Апофеоз: семь копий, каждое отбрасывает' },
    B: { name: 'Пронзающий луч', desc: 'Восходящий замирает и 1.6 с держит луч до края мира: урон всем на линии, пока луч горит', apo: 'Апофеоз: луч прожигает сильнее и метит тварей для гнёзд' },
  },
  hammer: {
    A: { name: 'Сотрясение Тверди', desc: 'Волна бежит по земле в обе стороны, бьёт и Червей под землёй', apo: 'Апофеоз: волна вдвое дальше и оглушает' },
    B: { name: 'Купол Сияния', desc: 'Купол света на 6 с: замедляет и жжёт тварей, ускоряет гнёзда внутри', apo: 'Апофеоз: купол 10 с и лечит гнёзда и Древо' },
  },
  starfall: {
    A: { name: 'Сверхзвезда', desc: 'Одна гигантская звезда: огромный урон по точке, ломает броню', apo: 'Апофеоз: кратер горит 8 с, броня тварей рушится надолго' },
    B: { name: 'Звёздный ливень', desc: '20 звёзд падают по всему Кругу за 5 секунд', apo: 'Апофеоз: 35 звёзд, сами ищут тварей' },
  },
};
