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

export type KeeperRuneId = 'spear' | 'hammer' | 'starfall' | 'radiance' | 'swarm' | 'timestop' | 'light';

export const KEEPER_RUNES: Record<KeeperRuneId, { name: string; icon: string; desc: string }> = {
  spear: { name: 'Копьё Игг-Света', icon: 'spear', desc: 'Руна-Предмет (золото)' },
  hammer: { name: 'Игг-Молот', icon: 'hammer', desc: 'Руна-Предмет (золото)' },
  starfall: { name: 'Звездопад', icon: 'starfall', desc: 'Руна-Заклинание' },
  radiance: { name: 'Сияние Игг', icon: 'radiance', desc: 'Руна-Умение' },
  swarm: { name: 'Зов Роя', icon: 'swarm', desc: 'Руна-Умение' },
  timestop: { name: 'Остановка Времени', icon: 'timestop', desc: 'Руна-Заклинание' },
  light: { name: 'Руна Света', icon: 'light', desc: 'Руна-Свойство Восходящего' },
};

export const BASE_SLOTS = 3;
/** the 4th slot comes from a Lesser Rune of Development */
export const DEV_SLOTS = 4;
/** the 5th and 6th are forged for a fortune */
export const MAX_SLOTS = 6;
export const EXTRA_SLOT_PRICE = [{ amber: 1500, star: 120 }, { amber: 4000, star: 300 }];

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
  P({ id: 'sp-power', rune: 'spear', type: 'Усиление', name: 'Усиление: Копьё', desc: '+35% урона Копья', rank: 1, price: 6, stack: 4, mods: { spearDamage: 0.35 } }),
  P({ id: 'sp-cheap', rune: 'spear', type: 'Уменьшение', name: 'Уменьшение: Копьё', desc: 'Копьё на 35% дешевле', rank: 1, price: 6, stack: 2, mods: { spearCost: -0.35 } }),
  P({ id: 'sp-pierce', rune: 'spear', type: 'Изменение', name: 'Длинное древко', desc: 'Пробивает на 2 тварей больше', rank: 1, price: 7, stack: 1, mods: { spearPierce: 2 } }),
  P({ id: 'sp-ricochet', rune: 'spear', type: 'Изменение', name: 'Рикошет', desc: 'После пробития отскакивает к ближайшей твари (60%)', rank: 2, price: 10, stack: 1, mods: { spearRicochet: true } }),
  P({ id: 'sp-beacon', rune: 'spear', type: 'Изменение', name: 'Метка-маяк', desc: 'Задетые твари 4 с получают +25% урона от гнёзд', rank: 2, price: 10, stack: 1, mods: { spearBeacon: true } }),
  P({ id: 'sp-rhythm', rune: 'spear', type: 'Изменение', name: 'Ритм', desc: 'Каждое 3-е попадание подряд — ×2 урона', rank: 2, price: 9, stack: 1, mods: { spearRhythm: true } }),
  // ── Игг-Молот
  P({ id: 'hm-power', rune: 'hammer', type: 'Усиление', name: 'Усиление: Молот', desc: '+35% урона Молота', rank: 1, price: 6, stack: 4, mods: { hammerDamage: 0.35 } }),
  P({ id: 'hm-cheap', rune: 'hammer', type: 'Уменьшение', name: 'Уменьшение: Молот', desc: 'Молот на 35% дешевле и перезаряжается на 25% быстрее', rank: 1, price: 7, stack: 2, mods: { hammerCost: -0.35 } }),
  P({ id: 'hm-quake', rune: 'hammer', type: 'Изменение', name: 'Сотрясение Тверди', desc: 'Молот бьёт и Червей под землёй, радиус +25%', rank: 2, price: 10, stack: 1, mods: { hammerQuake: true, hammerRadius: 0.25 } }),
  P({ id: 'hm-refund', rune: 'hammer', type: 'Изменение', name: 'Солнечный откат', desc: '+5 Света за каждую задетую тварь', rank: 1, price: 7, stack: 1, mods: { hammerRefund: true } }),
  P({ id: 'hm-eclipse', rune: 'hammer', type: 'Изменение', name: 'Затмение', desc: 'После удара 5 с держится поле: −35% скорости тварей', rank: 2, price: 9, stack: 1, mods: { hammerEclipse: true } }),
  // ── Звездопад
  P({ id: 'sf-power', rune: 'starfall', type: 'Усиление', name: 'Усиление: Звездопад', desc: '+35% урона звёзд', rank: 2, price: 8, stack: 4, mods: { starfallDamage: 0.35 } }),
  P({ id: 'sf-charge', rune: 'starfall', type: 'Уменьшение', name: 'Звёздный след', desc: 'Заряжается на 45% быстрее', rank: 1, price: 7, stack: 2, mods: { chargeGain: 0.45 } }),
  P({ id: 'sf-rain', rune: 'starfall', type: 'Изменение', name: 'Ливень', desc: '+3 звезды (Сверхзвезду сопровождают 3 звезды, Звёздный ливень — +6)', rank: 3, price: 14, stack: 1, mods: { starfallMeteors: 3 } }),
  P({ id: 'sf-scorch', rune: 'starfall', type: 'Изменение', name: 'Выжженная земля', desc: 'Пламя от звёзд жжёт вдвое сильнее', rank: 2, price: 9, stack: 1, mods: { starfallBurn: 1 } }),
  // ── Сияние Игг
  P({ id: 'rd-long', rune: 'radiance', type: 'Усиление', name: 'Долгое сияние', desc: 'Сияние длится на 50% дольше', rank: 1, price: 7, stack: 4, mods: {} }),
  P({ id: 'rd-heal', rune: 'radiance', type: 'Изменение', name: 'Целящий свет', desc: 'Во время Сияния Древо лечится 20 HP/с', rank: 2, price: 9, stack: 1, mods: {} }),
  P({ id: 'rd-cheap', rune: 'radiance', type: 'Уменьшение', name: 'Уменьшение: Сияние', desc: 'Сияние на 35% дешевле и перезаряжается на 20% быстрее', rank: 1, price: 7, stack: 2, mods: {} }),
  P({ id: 'rd-wide', rune: 'radiance', type: 'Усиление', name: 'Широкое сияние', desc: 'Во время Сияния Круг шире ещё на 15%', rank: 2, price: 9, stack: 4, mods: {} }),
  // ── Зов Роя
  P({ id: 'sw-wide', rune: 'swarm', type: 'Усиление', name: 'Широкий зов', desc: 'Охват Зова Роя +40%', rank: 1, price: 6, stack: 4, mods: {} }),
  P({ id: 'sw-fury', rune: 'swarm', type: 'Изменение', name: 'Ярость роя', desc: 'Гнёзда под Зовом наносят +40% урона', rank: 2, price: 10, stack: 1, mods: {} }),
  P({ id: 'sw-cheap', rune: 'swarm', type: 'Уменьшение', name: 'Уменьшение: Зов', desc: 'Зов Роя на 35% дешевле и перезаряжается на 20% быстрее', rank: 1, price: 7, stack: 2, mods: {} }),
  P({ id: 'sw-long', rune: 'swarm', type: 'Усиление', name: 'Долгий зов', desc: 'Зов Роя длится на 50% дольше', rank: 1, price: 7, stack: 4, mods: {} }),
  P({ id: 'sw-shield', rune: 'swarm', type: 'Изменение', name: 'Хитиновый зов', desc: 'Гнёзда под Зовом получают на 30% меньше урона', rank: 2, price: 10, stack: 1, mods: {} }),
  // ── Остановка Времени
  P({ id: 'ts-long', rune: 'timestop', type: 'Усиление', name: 'Долгий миг', desc: 'Время стоит на 25% дольше', rank: 1, price: 9, stack: 4, mods: {} }),
  P({ id: 'ts-cheap', rune: 'timestop', type: 'Уменьшение', name: 'Уменьшение: Миг', desc: 'Остановка на 35% дешевле по Свету', rank: 1, price: 7, stack: 2, mods: {} }),
  P({ id: 'ts-quick', rune: 'timestop', type: 'Изменение', name: 'Короткая ночь', desc: 'Руна восстанавливается на 1 ночь быстрее', rank: 3, price: 18, stack: 1, mods: {} }),
  P({ id: 'ts-shatter', rune: 'timestop', type: 'Изменение', name: 'Хрупкий лёд', desc: 'Замершие твари получают +35% урона', rank: 2, price: 12, stack: 1, mods: {} }),
  // ── Руна Света
  P({ id: 'lt-spring', rune: 'light', type: 'Усиление', name: 'Родник Света', desc: '+30% регенерации Света', rank: 1, price: 6, stack: 4, mods: { lightRegen: 0.3 } }),
  P({ id: 'lt-vessel', rune: 'light', type: 'Усиление', name: 'Сосуд', desc: '+40 к запасу Света, +40 HP', rank: 1, price: 6, stack: 4, mods: { lightMax: 40, keeperHp: 40 } }),
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
  /** the Observer gifts a keeper rune */
  learn?: import('./balance').AbilityId;
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
  { id: 'l-hammer', kind: 'gift', category: 'Руна-Предмет в дар', name: 'Игг-Молот', icon: 'hammer', rank: 0, desc: 'Наблюдатель дарит руну: удар вокруг Хранителя, рушит Лазы', mods: {}, learn: 'hammer' },
  { id: 'l-swarm', kind: 'gift', category: 'Руна-Умение в дар', name: 'Зов Роя', icon: 'swarm', rank: 0, desc: 'Наблюдатель дарит руну: гнёзда рядом бьют быстрее и чинятся', mods: {}, learn: 'swarm' },
  { id: 'l-radiance', kind: 'gift', category: 'Руна-Умение в дар', name: 'Сияние Игг', icon: 'radiance', rank: 1, desc: 'Наблюдатель дарит руну: Древо вспыхивает, Круг шире', mods: {}, learn: 'radiance' },
  { id: 'l-starfall', kind: 'gift', category: 'Руна-Заклинание в дар', name: 'Звездопад', icon: 'starfall', rank: 1, desc: 'Наблюдатель дарит руну: звёзды падают у курсора', mods: {}, learn: 'starfall' },
  { id: 'l-timestop', kind: 'gift', category: 'Руна-Заклинание в дар', name: 'Остановка Времени', icon: 'timestop', rank: 2, desc: 'Наблюдатель дарит руну: время в Круге застывает', mods: {}, learn: 'timestop' },
  { id: 'g-resin', kind: 'gift', category: 'Руна-Свойство', name: 'Янтарная жила', icon: 'amber', rank: 1, desc: '+20% Янтаря с тварей до конца ночей', mods: { amberGain: 0.2 } },
];

/** Max rank offered at a given dawn (0-based night just finished). */
export function maxRankForNight(night: number): RuneRank {
  return Math.min(4, Math.floor(night / 2) + 1) as RuneRank;
}

/** Star Blood to pull a Property out of a rune (frees the slot, no refund). */
export const removeCost = (p: PropertyDef) => 4 + p.rank * 3;

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
/** a stronger rune is heavier: every rank lengthens its cooldown */
const RANK_CD = [1, 1.08, 1.16, 1.25, 1.35];
/**
 * Beyond «Небо» runes climb endless Star ranks. Endless creatures thicken ~8–9% a night, so a
 * Star rank must be felt: +30% power each, price growing ×1.3 (playtest: +15% / ×1.45 was
 * expensive and invisible by night 25+).
 */
export const STAR_RANK = { power: 1.3, cost: 1.3 } as const;
export const runeRankCost = (r: number) => (r < RANK_COST.length ? RANK_COST[r] : Math.round(80 * Math.pow(STAR_RANK.cost, r - 4)));
export const runeRankPower = (r: number) => (r < RANK_POWER.length ? RANK_POWER[r] : 3.2 * Math.pow(STAR_RANK.power, r - 4));
export const runeRankArea = (r: number) => RANK_AREA[Math.min(r, RANK_AREA.length - 1)];
/** a stronger rune also burns more Light per cast (so Дух — light regen — matters) */
const RANK_LIGHT = [1, 1.15, 1.3, 1.5, 1.7];
export const runeRankLight = (r: number) => (r < RANK_LIGHT.length ? RANK_LIGHT[r] : 1.7 * Math.pow(1.08, r - 4));
export const runeRankCd = (r: number) => (r < RANK_CD.length ? RANK_CD[r] : 1.35 * Math.pow(1.05, r - 4));
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
    B: { name: 'Пронзающий луч', desc: 'Восходящий замирает и держит луч до края мира, пока хватает Света (нажми ещё раз — отпустить): урон всем на линии, вблизи сильнее — вдали луч рассеивается', apo: 'Апофеоз: луч прожигает сильнее и метит тварей для гнёзд' },
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

// ───────────────────────────── facets (Грани) ─────────────────────────────

/**
 * Грани: at Бронза and Золото every ability rune turns one more facet — a pick of 2 base
 * options, plus resonance options that appear only when a matching Property is installed.
 * So the build of a rune (its Properties) shapes how it can grow.
 */
export interface FacetDef {
  id: string;
  rune: 'spear' | 'hammer' | 'starfall' | 'radiance' | 'swarm' | 'timestop' | 'light';
  rank: number;
  name: string;
  desc: string;
  /** Property id that must sit in the rune for this resonance facet to be offered */
  requires?: string;
}
export const FACET_RANKS = [1, 3];
/** Огранка: a facet can be ground up to this level on Star ranks */
export const FACET_MAX = 5;
const F = (o: FacetDef) => o;
export const FACETS: FacetDef[] = [
  // Копьё
  F({ id: 'sp-twin', rune: 'spear', rank: 1, name: 'Обоюдное древко', desc: 'Копьё летит сразу в обе стороны (назад — 60% урона)' }),
  F({ id: 'sp-pin', rune: 'spear', rank: 1, name: 'Пригвождение', desc: 'Первая задетая тварь пригвождена на 1 с и получает +40% урона (луч держит ближнюю тварь на месте)' }),
  F({ id: 'sp-lance', rune: 'spear', rank: 1, name: 'Сквозь строй', desc: 'Копьё не теряет урона, пробивая тварей', requires: 'sp-pierce' }),
  F({ id: 'sp-mark', rune: 'spear', rank: 1, name: 'Маяк стаи', desc: 'Метка держится 8 с и даёт гнёздам +45% урона', requires: 'sp-beacon' }),
  F({ id: 'sp-flame', rune: 'spear', rank: 3, name: 'Огненный след', desc: 'Где копьё ударило — 2.5 с горит земля' }),
  F({ id: 'sp-swift', rune: 'spear', rank: 3, name: 'Быстрая рука', desc: 'Копьё перезаряжается на 35% быстрее и на 25% дешевле' }),
  F({ id: 'sp-chain', rune: 'spear', rank: 3, name: 'Цепной рикошет', desc: 'Рикошет отскакивает дважды', requires: 'sp-ricochet' }),
  F({ id: 'sp-crescendo', rune: 'spear', rank: 3, name: 'Крещендо', desc: 'Каждое 3-е попадание подряд — ×3 урона', requires: 'sp-rhythm' }),
  // Молот
  F({ id: 'hm-after', rune: 'hammer', rank: 1, name: 'Отголосок', desc: 'Через 0.8 с руна бьёт ещё раз с силой 50%' }),
  F({ id: 'hm-pull', rune: 'hammer', rank: 1, name: 'Притяжение', desc: 'Молот не отбрасывает, а стягивает тварей к Хранителю' }),
  F({ id: 'hm-deep', rune: 'hammer', rank: 1, name: 'Глубинный удар', desc: 'По подземным ×2, Лазы рушатся в двойном радиусе', requires: 'hm-quake' }),
  F({ id: 'hm-sun', rune: 'hammer', rank: 1, name: 'Солнечное сердце', desc: '+10 Света и +4 HP Хранителю за каждую задетую тварь', requires: 'hm-refund' }),
  F({ id: 'hm-tremor', rune: 'hammer', rank: 3, name: 'Тектоника', desc: 'Оглушение Молота на 60% дольше' }),
  F({ id: 'hm-shield', rune: 'hammer', rank: 3, name: 'Хитиновый звон', desc: 'Удар чинит гнёзда вокруг на 30% прочности' }),
  F({ id: 'hm-night', rune: 'hammer', rank: 3, name: 'Полное затмение', desc: 'Поле Затмения держится 8 с и замедляет на 55%', requires: 'hm-eclipse' }),
  // Звездопад
  F({ id: 'sf-hunt', rune: 'starfall', rank: 1, name: 'Звёзды-охотницы', desc: 'Каждая звезда сама доворачивает к ближайшей твари' }),
  F({ id: 'sf-hunger', rune: 'starfall', rank: 1, name: 'Звёздный голод', desc: '+50% заряда Звездопада за убийства' }),
  F({ id: 'sf-ash', rune: 'starfall', rank: 1, name: 'Пепел', desc: 'Пламя звёзд горит вдвое дольше', requires: 'sf-scorch' }),
  F({ id: 'sf-sky', rune: 'starfall', rank: 3, name: 'Небесный свод', desc: 'Звёзды бьют летунов вдвое сильнее' }),
  F({ id: 'sf-refund', rune: 'starfall', rank: 3, name: 'Возврат звезды', desc: 'Каждая тварь, убитая звездой, возвращает 4 заряда' }),
  F({ id: 'sf-storm', rune: 'starfall', rank: 3, name: 'Звёздная буря', desc: 'Звёзд больше: +4 (ливень +8)', requires: 'sf-rain' }),
  // Сияние
  F({ id: 'rd-fog', rune: 'radiance', rank: 1, name: 'Рассеять Туман', desc: 'Пока горит Сияние, Туман Тьмы истончается вдвое (вместе со Светоносным Древом — рассеивается)' }),
  F({ id: 'rd-nests', rune: 'radiance', rank: 1, name: 'Свет гнёздам', desc: 'Пока горит Сияние, гнёзда наносят +25% урона' }),
  F({ id: 'rd-bloom', rune: 'radiance', rank: 1, name: 'Цветение', desc: 'Целящий свет вдвое сильнее и лечит гнёзда 10 HP/с', requires: 'rd-heal' }),
  F({ id: 'rd-sun', rune: 'radiance', rank: 3, name: 'Второе солнце', desc: 'Сияние на 50% дольше, Круг шире ещё на 10%' }),
  F({ id: 'rd-burst', rune: 'radiance', rank: 3, name: 'Вспышка', desc: 'В начале Сияния все твари в Круге получают удар светом и слепнут на 1 с' }),
  F({ id: 'rd-dawn', rune: 'radiance', rank: 3, name: 'Ложный рассвет', desc: 'Пока горит Сияние, твари в свету замедлены на 30%', requires: 'rd-wide' }),
  // Зов Роя
  F({ id: 'sw-termite', rune: 'swarm', rank: 1, name: 'Боевой клич', desc: 'Термиты под Зовом +50% урона и сразу встают в строй' }),
  F({ id: 'sw-follow', rune: 'swarm', rank: 1, name: 'Рой следует', desc: 'Зона Зова движется вместе с Хранителем' }),
  F({ id: 'sw-frenzy', rune: 'swarm', rank: 1, name: 'Неистовство', desc: 'Ярость роя: +70% урона вместо +40%', requires: 'sw-fury' }),
  F({ id: 'sw-sky', rune: 'swarm', rank: 3, name: 'Стрекозиный вихрь', desc: 'Под Зовом из гнёзд вылетает вдвое больше стрекоз' }),
  F({ id: 'sw-long2', rune: 'swarm', rank: 3, name: 'Долгий гул', desc: 'Зов Роя длится на 60% дольше' }),
  F({ id: 'sw-carapace', rune: 'swarm', rank: 3, name: 'Панцирь', desc: 'Гнёзда под Зовом получают на 50% меньше урона', requires: 'sw-shield' }),
  // Остановка Времени
  F({ id: 'ts-hush', rune: 'timestop', rank: 1, name: 'Тишина', desc: 'Пока время стоит, гнёзда атакуют на 50% быстрее' }),
  F({ id: 'ts-cold', rune: 'timestop', rank: 1, name: 'Стужа', desc: 'Когда время снова идёт, твари 4 с замедлены на 40%' }),
  F({ id: 'ts-crack', rune: 'timestop', rank: 1, name: 'Трещины', desc: 'Хрупкий лёд: замершие получают +70% урона вместо +35%', requires: 'ts-shatter' }),
  F({ id: 'ts-mend', rune: 'timestop', rank: 3, name: 'Застывший миг', desc: 'Пока время стоит, Древо и гнёзда лечатся на 3% в секунду' }),
  F({ id: 'ts-hurry', rune: 'timestop', rank: 3, name: 'Вне времени', desc: 'Пока время стоит, откаты рун Хранителя идут втрое быстрее' }),
  F({ id: 'ts-eternal', rune: 'timestop', rank: 3, name: 'Вечный миг', desc: 'Время стоит на 3 с дольше', requires: 'ts-long' }),
  // Руна Света
  F({ id: 'lt-flow', rune: 'light', rank: 1, name: 'Поток Света', desc: '+25% регенерации Света' }),
  F({ id: 'lt-guard', rune: 'light', rank: 1, name: 'Светлый щит', desc: 'Пока Света не меньше 70%, Хранитель получает на 25% меньше урона' }),
  F({ id: 'lt-deep', rune: 'light', rank: 1, name: 'Глубокий сосуд', desc: '+50 к запасу Света', requires: 'lt-vessel' }),
  F({ id: 'lt-dash', rune: 'light', rank: 1, name: 'Ветер в спину', desc: '+20% скорости Хранителя', requires: 'lt-step' }),
  F({ id: 'lt-over', rune: 'light', rank: 3, name: 'Переполнение', desc: 'При полном Свете руны бьют на 25% сильнее' }),
  F({ id: 'lt-echo', rune: 'light', rank: 3, name: 'Эхо Света', desc: 'Каждое 5-е применение руны — бесплатно' }),
  F({ id: 'lt-tree', rune: 'light', rank: 3, name: 'Сок Древа', desc: 'У ствола Древа Хранитель лечится 8 HP/с', requires: 'lt-root' }),
  F({ id: 'lt-last2', rune: 'light', rank: 3, name: 'Вечный свет', desc: 'Последний свет возвращается за 25 с вместо 45', requires: 'lt-last' }),
];
export function facetById(id: string) { return FACETS.find((f) => f.id === id); }
