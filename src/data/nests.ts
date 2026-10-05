/**
 * Living defense: light-bearing creatures summoned by Rune-Creatures into wooden nests.
 * Levels 1–3 cost Amber. Level 4 = choose 1 of 2 specializations (Amber + Star Blood),
 * level 5 = specialization mastery (Star Blood). Design: design/progression.md.
 */

export type Family = 'hive' | 'beetle' | 'dragonfly' | 'spider';
export type SpecId = 'A' | 'B';

export interface NestStats {
  hp: number;
  /** damage per hit / per pulse */
  damage: number;
  /** seconds between attacks */
  rate: number;
  range: number;
  /** light radius (dragonfly, spider) */
  light?: number;
  slow?: number;
  burn?: number;
  thorns?: number;
  regen?: number;
  /** targets per volley (hive) */
  volley?: number;
  /** enemies hit by a beam behind the first (hive B) */
  pierce?: number;
  /** stun seconds (beetle B ram, spider A web) */
  stun?: number;
  /** knockback impulse (beetle B) */
  knock?: number;
  /** chain jumps (dragonfly B) */
  chain?: number;
  /** poison dps and duration (spider B) */
  poison?: number;
  poisonTime?: number;
}

export interface Price { amber: number; star: number; }

export interface SpecDef {
  name: string;
  desc: string;
  /** what makes it different, shown as the headline perk */
  perk: string;
  levels: [NestStats, NestStats];
  costs: [Price, Price];
}

export interface FamilyDef {
  name: string;
  /** creature name used in flavour text */
  creature: string;
  desc: string;
  underground: boolean;
  blocks: boolean;
  levels: [NestStats, NestStats, NestStats];
  costs: [Price, Price, Price];
  specs: Record<SpecId, SpecDef>;
}

const p = (amber: number, star = 0): Price => ({ amber, star });

export const NESTS: Record<Family, FamilyDef> = {
  hive: {
    name: 'Улей светляков', creature: 'Игг-светляки',
    desc: 'Светляки жалят тварей в свету Круга', underground: false, blocks: false,
    levels: [
      { hp: 140, damage: 12, rate: 0.9, range: 165 },
      { hp: 200, damage: 19, rate: 0.8, range: 178 },
      { hp: 270, damage: 27, rate: 0.72, range: 190 },
    ],
    costs: [p(30), p(45), p(65)],
    specs: {
      A: {
        name: 'Рой', desc: 'Жалит сразу трёх тварей', perk: '3 цели за залп',
        levels: [
          { hp: 320, damage: 26, rate: 0.62, range: 190, volley: 3 },
          { hp: 380, damage: 34, rate: 0.55, range: 200, volley: 4 },
        ],
        costs: [p(80, 5), p(0, 10)],
      },
      B: {
        name: 'Игг-Луч', desc: 'Сфокусированный луч прошивает строй', perk: 'дальний луч, пробивает 3',
        levels: [
          { hp: 300, damage: 90, rate: 1.6, range: 270, pierce: 3 },
          { hp: 360, damage: 140, rate: 1.45, range: 300, pierce: 4 },
        ],
        costs: [p(80, 5), p(0, 10)],
      },
    },
  },
  beetle: {
    name: 'Жук-щитоносец', creature: 'щитоносец',
    desc: 'Панцирь перекрывает путь тварям', underground: false, blocks: true,
    levels: [
      { hp: 320, damage: 0, rate: 0, range: 0 },
      { hp: 560, damage: 0, rate: 0, range: 0, thorns: 5 },
      { hp: 820, damage: 0, rate: 0, range: 0, thorns: 8, regen: 6 },
    ],
    costs: [p(20), p(35), p(55)],
    specs: {
      A: {
        name: 'Панцирная стена', desc: 'Почти неразрушим в свету', perk: 'прочность ×1.6, лечение',
        levels: [
          { hp: 1300, damage: 0, rate: 0, range: 0, thorns: 14, regen: 14 },
          { hp: 1800, damage: 0, rate: 0, range: 0, thorns: 22, regen: 22 },
        ],
        costs: [p(70, 5), p(0, 10)],
      },
      B: {
        name: 'Жук-таран', desc: 'Бьёт рогом: отбрасывает и оглушает', perk: 'таран каждые 4 с',
        levels: [
          { hp: 900, damage: 45, rate: 4, range: 26, thorns: 8, regen: 6, stun: 1.2, knock: 120 },
          { hp: 1100, damage: 80, rate: 3.2, range: 30, thorns: 10, regen: 8, stun: 1.6, knock: 150 },
        ],
        costs: [p(70, 5), p(0, 10)],
      },
    },
  },
  dragonfly: {
    name: 'Стрекозы-светоносицы', creature: 'стрекозы',
    desc: 'Несут свет за край Круга: замедляют и жгут', underground: false, blocks: false,
    levels: [
      { hp: 120, damage: 0, rate: 0, range: 0, light: 62, slow: 0.3, burn: 4 },
      { hp: 170, damage: 0, rate: 0, range: 0, light: 76, slow: 0.35, burn: 7 },
      { hp: 230, damage: 0, rate: 0, range: 0, light: 90, slow: 0.4, burn: 10 },
    ],
    costs: [p(40), p(55), p(80)],
    specs: {
      A: {
        name: 'Солнечное гнездо', desc: 'Огромный ореол, тварей жжёт сильнее', perk: 'свет 120, ожог ×2',
        levels: [
          { hp: 300, damage: 0, rate: 0, range: 0, light: 115, slow: 0.45, burn: 20 },
          { hp: 360, damage: 0, rate: 0, range: 0, light: 135, slow: 0.5, burn: 30 },
        ],
        costs: [p(90, 6), p(0, 12)],
      },
      B: {
        name: 'Стрекоза-гроза', desc: 'Молния скачет по тварям в свету', perk: 'цепная молния ×4',
        levels: [
          { hp: 280, damage: 34, rate: 1.6, range: 0, light: 95, slow: 0.4, burn: 10, chain: 4 },
          { hp: 330, damage: 50, rate: 1.3, range: 0, light: 105, slow: 0.4, burn: 12, chain: 6 },
        ],
        costs: [p(90, 6), p(0, 12)],
      },
    },
  },
  spider: {
    name: 'Паук-ткач', creature: 'паук-ткач',
    desc: 'Под землёй: кусает Червей у корней', underground: true, blocks: false,
    levels: [
      { hp: 1, damage: 14, rate: 0.8, range: 52, light: 40 },
      { hp: 1, damage: 22, rate: 0.75, range: 58, light: 46 },
      { hp: 1, damage: 32, rate: 0.7, range: 64, light: 52, slow: 0.3 },
    ],
    costs: [p(30), p(45), p(65)],
    specs: {
      A: {
        name: 'Ловчая сеть', desc: 'Сеть сковывает Червей', perk: 'сковывает на 2 с',
        levels: [
          { hp: 1, damage: 40, rate: 0.7, range: 72, light: 60, slow: 0.5, stun: 2 },
          { hp: 1, damage: 55, rate: 0.62, range: 80, light: 66, slow: 0.55, stun: 2.6 },
        ],
        costs: [p(70, 4), p(0, 9)],
      },
      B: {
        name: 'Ядовитая паучиха', desc: 'Яд разъедает всех Червей рядом', perk: 'яд по площади',
        levels: [
          { hp: 1, damage: 30, rate: 0.8, range: 78, light: 56, slow: 0.3, poison: 26, poisonTime: 4 },
          { hp: 1, damage: 40, rate: 0.7, range: 88, light: 62, slow: 0.35, poison: 40, poisonTime: 5 },
        ],
        costs: [p(70, 4), p(0, 9)],
      },
    },
  },
};

export const SELL_REFUND = 0.6;

/** Total level count: 3 base + 2 specialization. */
export const MAX_TIER = 5;
