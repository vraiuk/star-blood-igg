/**
 * Living defense: light-bearing creatures summoned by Rune-Creatures into wooden nests.
 * Levels 1–3 cost Amber. Level 4 = choose 1 of 2 specializations (Amber + Star Blood),
 * level 5 = specialization mastery (Star Blood). Design: design/progression.md.
 */

export type Family = 'hive' | 'beetle' | 'dragonfly' | 'spider' | 'caterpillar';
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
  /** dragonfly «Высвечивание»: enemies in its light take +X damage from all sources */
  vuln?: number;
  /** beetle healer: heals nests within `range` by `regen`-scaled amount per second */
  heal?: number;
  /** caterpillar collectors: how many crawl out, their speed, and bonus value of what they carry */
  workers?: number;
  speed?: number;
  bonus?: number;
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
    name: 'Улей светляков', creature: 'светляки',
    desc: 'Жалят тварей в свету Круга', underground: false, blocks: false,
    levels: [
      { hp: 160, damage: 14, rate: 0.9, range: 170 },
      { hp: 230, damage: 22, rate: 0.8, range: 185 },
      { hp: 320, damage: 32, rate: 0.72, range: 200 },
    ],
    costs: [p(40), p(65), p(100)],
    specs: {
      A: {
        name: 'Рой', desc: 'Жалит сразу несколько тварей', perk: '3 цели за залп, против стай',
        levels: [
          { hp: 380, damage: 30, rate: 0.62, range: 205, volley: 3 },
          { hp: 460, damage: 42, rate: 0.55, range: 215, volley: 4 },
        ],
        costs: [p(160, 8), p(120, 14)],
      },
      B: {
        name: 'Игг-Луч', desc: 'Сфокусированный луч прошивает строй и броню', perk: 'дальний луч, пробивает 3, против брони',
        levels: [
          { hp: 360, damage: 130, rate: 2.8, range: 290, pierce: 3 },
          { hp: 430, damage: 210, rate: 2.4, range: 320, pierce: 4 },
        ],
        costs: [p(160, 8), p(120, 14)],
      },
    },
  },
  beetle: {
    name: 'Светожук-щитоносец', creature: 'светожук',
    desc: 'Перекрывает путь: твари ближнего боя упираются в него и бьют его', underground: false, blocks: true,
    levels: [
      { hp: 420, damage: 0, rate: 0, range: 0, thorns: 6 },
      { hp: 750, damage: 0, rate: 0, range: 0, thorns: 10 },
      { hp: 1150, damage: 0, rate: 0, range: 0, thorns: 15, regen: 8 },
    ],
    costs: [p(30), p(55), p(85)],
    specs: {
      A: {
        name: 'Светожук-Целитель', desc: 'Световой купол лечит соседние гнёзда и самого жука', perk: 'лечит гнёзда рядом',
        levels: [
          { hp: 1700, damage: 0, rate: 0, range: 90, thorns: 18, regen: 18, heal: 10 },
          { hp: 2300, damage: 0, rate: 0, range: 110, thorns: 24, regen: 28, heal: 18 },
        ],
        costs: [p(140, 7), p(110, 12)],
      },
      B: {
        name: 'Жук-таран', desc: 'Бьёт рогом: отбрасывает и оглушает', perk: 'таран каждые 3.5 с',
        levels: [
          { hp: 1250, damage: 80, rate: 3.5, range: 28, thorns: 12, regen: 8, stun: 1.3, knock: 130 },
          { hp: 1550, damage: 140, rate: 2.8, range: 32, thorns: 16, regen: 12, stun: 1.7, knock: 160 },
        ],
        costs: [p(140, 7), p(110, 12)],
      },
    },
  },
  dragonfly: {
    name: 'Золотые Стрекозы', creature: 'стрекозы',
    desc: 'Высвечивают тварей: в их свету твари получают больше урона от всего', underground: false, blocks: false,
    levels: [
      { hp: 140, damage: 0, rate: 0, range: 0, light: 64, slow: 0.25, burn: 5, vuln: 0.3 },
      { hp: 200, damage: 0, rate: 0, range: 0, light: 78, slow: 0.3, burn: 8, vuln: 0.4 },
      { hp: 270, damage: 0, rate: 0, range: 0, light: 92, slow: 0.35, burn: 12, vuln: 0.5 },
    ],
    costs: [p(45), p(70), p(105)],
    specs: {
      A: {
        name: 'Солнечное гнездо', desc: 'Огромный ореол: сильнее Высвечивание и ожог', perk: 'свет 125, +70% урона по тварям',
        levels: [
          { hp: 360, damage: 0, rate: 0, range: 0, light: 125, slow: 0.45, burn: 22, vuln: 0.7 },
          { hp: 430, damage: 0, rate: 0, range: 0, light: 145, slow: 0.5, burn: 32, vuln: 0.9 },
        ],
        costs: [p(170, 8), p(130, 14)],
      },
      B: {
        name: 'Стрекоза-гроза', desc: 'Молния скачет по высвеченным тварям', perk: 'цепная молния ×5',
        levels: [
          { hp: 330, damage: 48, rate: 1.5, range: 0, light: 100, slow: 0.35, burn: 12, vuln: 0.5, chain: 5 },
          { hp: 400, damage: 72, rate: 1.2, range: 0, light: 112, slow: 0.4, burn: 14, vuln: 0.55, chain: 7 },
        ],
        costs: [p(170, 8), p(130, 14)],
      },
    },
  },
  spider: {
    name: 'Паук-ткач', creature: 'паук-ткач',
    desc: 'Под землёй кусает Червей у корней. Черви прогрызают его гнездо', underground: true, blocks: false,
    levels: [
      { hp: 180, damage: 16, rate: 0.8, range: 50, light: 38 },
      { hp: 280, damage: 26, rate: 0.75, range: 58, light: 44 },
      { hp: 400, damage: 38, rate: 0.7, range: 66, light: 52, slow: 0.3 },
    ],
    costs: [p(35), p(60), p(90)],
    specs: {
      A: {
        name: 'Ловчая сеть', desc: 'Сеть сковывает Червей', perk: 'сковывает на 2 с',
        levels: [
          { hp: 600, damage: 48, rate: 0.7, range: 76, light: 62, slow: 0.5, stun: 2 },
          { hp: 800, damage: 66, rate: 0.62, range: 86, light: 70, slow: 0.55, stun: 2.6 },
        ],
        costs: [p(130, 6), p(100, 11)],
      },
      B: {
        name: 'Ядовитая паучиха', desc: 'Яд разъедает всех Червей рядом, даже бронированных', perk: 'яд по площади сквозь броню',
        levels: [
          { hp: 550, damage: 36, rate: 0.8, range: 82, light: 58, slow: 0.3, poison: 34, poisonTime: 4 },
          { hp: 720, damage: 48, rate: 0.7, range: 92, light: 64, slow: 0.35, poison: 52, poisonTime: 5 },
        ],
        costs: [p(130, 6), p(100, 11)],
      },
    },
  },
  caterpillar: {
    name: 'Кокон гусениц', creature: 'гусеницы-сборщицы',
    desc: 'Гусеницы сами собирают Янтарь и Кровь в охвате и несут к Древу', underground: false, blocks: false,
    levels: [
      { hp: 120, damage: 0, rate: 0, range: 120, workers: 2, speed: 46 },
      { hp: 170, damage: 0, rate: 0, range: 160, workers: 3, speed: 54 },
      { hp: 230, damage: 0, rate: 0, range: 210, workers: 4, speed: 62 },
    ],
    costs: [p(35), p(60), p(95)],
    specs: {
      A: {
        name: 'Шелкопряды', desc: 'Больше гусениц, быстрее, собирают по всему краю', perk: '6 сборщиц, охват 320',
        levels: [
          { hp: 300, damage: 0, rate: 0, range: 320, workers: 6, speed: 78 },
          { hp: 360, damage: 0, rate: 0, range: 440, workers: 8, speed: 92 },
        ],
        costs: [p(120, 5), p(100, 9)],
      },
      B: {
        name: 'Медовые гусеницы', desc: 'Перерабатывают добычу: всё принесённое ценнее', perk: '+35% к добыче',
        levels: [
          { hp: 300, damage: 0, rate: 0, range: 240, workers: 4, speed: 64, bonus: 0.35 },
          { hp: 360, damage: 0, rate: 0, range: 280, workers: 5, speed: 70, bonus: 0.6 },
        ],
        costs: [p(120, 5), p(100, 9)],
      },
    },
  },
};

export const SELL_REFUND = 0.6;

/** Total level count: 3 base + 2 specialization. */
export const MAX_TIER = 5;
