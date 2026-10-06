/**
 * Living defense: light-bearing creatures summoned by Rune-Creatures into wooden nests.
 * Levels 1–2 cost Amber. Level 3 = choose 1 of 2 specializations (Amber + Star Blood),
 * level 4 = specialization mastery. Design: design/progression.md.
 */

export type Family = 'hive' | 'beetle' | 'dragonfly' | 'spider' | 'caterpillar' | 'termite' | 'honeycomb' | 'mender';
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
  /** drops a worker gathers per trip */
  carry?: number;
  /** termite warriors: squad size, warrior hp, respawn seconds */
  soldiers?: number;
  soldierHp?: number;
  respawn?: number;
  /** honeycomb: Amber / Star Blood per second */
  income?: number;
  starIncome?: number;
  /** mender: heals every nest in range (not just the weakest) / also heals the tree (hp/s) */
  healAll?: boolean;
  healTree?: number;
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
  levels: [NestStats, NestStats];
  costs: [Price, Price];
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
    ],
    costs: [p(40), p(65)],
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
        name: 'Игг-Луч', desc: 'Долгий луч 1.6 с жжёт цель и тварей за ней, игнорируя броню', perk: 'длительный луч, пробивает 3, сквозь броню',
        levels: [
          { hp: 360, damage: 95, rate: 3.2, range: 260, pierce: 3 },
          { hp: 430, damage: 150, rate: 2.8, range: 290, pierce: 4 },
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
    ],
    costs: [p(30), p(55)],
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
    desc: 'Высвечивают тварей: в их свету твари получают больше урона от всего. Шкуру гигантских Червей жалят слабо', underground: false, blocks: false,
    levels: [
      { hp: 140, damage: 0, rate: 0, range: 0, light: 64, slow: 0.25, burn: 5, vuln: 0.3 },
      { hp: 200, damage: 0, rate: 0, range: 0, light: 78, slow: 0.3, burn: 8, vuln: 0.4 },
    ],
    costs: [p(45), p(70)],
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
    desc: 'Из корневого котла бьёт Червей, а без них — стреляет нитью вверх по тварям на земле: укус и паутина (замедление)', underground: true, blocks: false,
    levels: [
      { hp: 180, damage: 16, rate: 0.8, range: 50, light: 38 },
      { hp: 280, damage: 26, rate: 0.75, range: 58, light: 44 },
    ],
    costs: [p(35), p(60)],
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
  termite: {
    name: 'Термитник', creature: 'Золотые Термиты',
    desc: 'Выпускает отряд Золотых Термитов: они держат край Круга и сами бьются с тварями — даже с плевунами за краем. Гигантов не удержат: те их затаптывают', underground: false, blocks: false,
    levels: [
      { hp: 260, damage: 9, rate: 0.8, range: 80, soldiers: 3, soldierHp: 90, respawn: 9 },
      { hp: 340, damage: 14, rate: 0.75, range: 95, soldiers: 4, soldierHp: 130, respawn: 8 },
    ],
    costs: [p(50), p(80)],
    specs: {
      A: {
        name: 'Термиты-копейщики', desc: 'Больше бойцов, жалят сильнее и чаще', perk: '6 бойцов, урон ×1.7',
        levels: [
          { hp: 420, damage: 24, rate: 0.6, range: 110, soldiers: 6, soldierHp: 140, respawn: 7 },
          { hp: 500, damage: 34, rate: 0.55, range: 125, soldiers: 8, soldierHp: 170, respawn: 6 },
        ],
        costs: [p(150, 6), p(120, 12)],
      },
      B: {
        name: 'Термиты-щитоносцы', desc: 'Живучие бойцы держат строй и отвлекают тварей', perk: 'бойцы ×3 HP, шипы',
        levels: [
          { hp: 520, damage: 16, rate: 0.75, range: 100, soldiers: 4, soldierHp: 380, respawn: 9, thorns: 6 },
          { hp: 620, damage: 22, rate: 0.7, range: 115, soldiers: 5, soldierHp: 560, respawn: 8, thorns: 10 },
        ],
        costs: [p(150, 6), p(120, 12)],
      },
    },
  },
  honeycomb: {
    name: 'Медовые соты', creature: 'пчёлы-медоносы',
    desc: 'В кроне Древа: соты сами копят Янтарь', underground: false, blocks: false,
    levels: [
      { hp: 1, damage: 0, rate: 0, range: 0, income: 0.6 },
      { hp: 1, damage: 0, rate: 0, range: 0, income: 1.1 },
    ],
    costs: [p(70), p(110)],
    specs: {
      A: {
        name: 'Смоляные соты', desc: 'Густая смола: много Янтаря', perk: '2.4 Янтаря/с',
        levels: [{ hp: 1, damage: 0, rate: 0, range: 0, income: 2.4 }, { hp: 1, damage: 0, rate: 0, range: 0, income: 3.6 }],
        costs: [p(200, 6), p(220, 12)],
      },
      B: {
        name: 'Звёздные соты', desc: 'Соты копят и Звёздную Кровь', perk: '1.2 Янтаря/с + Кровь',
        levels: [{ hp: 1, damage: 0, rate: 0, range: 0, income: 1.2, starIncome: 0.05 }, { hp: 1, damage: 0, rate: 0, range: 0, income: 1.6, starIncome: 0.09 }],
        costs: [p(200, 6), p(220, 12)],
      },
    },
  },
  mender: {
    name: 'Жуки-лекари', creature: 'жуки-лекари',
    desc: 'В кроне Древа: слетают чинить самое израненное гнездо', underground: false, blocks: false,
    levels: [
      { hp: 1, damage: 0, rate: 0, range: 200, heal: 8 },
      { hp: 1, damage: 0, rate: 0, range: 260, heal: 13 },
    ],
    costs: [p(60), p(95)],
    specs: {
      A: {
        name: 'Рой лекарей', desc: 'Чинит все гнёзда в охвате разом', perk: 'лечит всех в охвате',
        levels: [{ hp: 1, damage: 0, rate: 0, range: 300, heal: 10, healAll: true }, { hp: 1, damage: 0, rate: 0, range: 380, heal: 16, healAll: true }],
        costs: [p(170, 6), p(150, 12)],
      },
      B: {
        name: 'Живица', desc: 'Лекари лечат и само Древо', perk: 'Древо +15 HP/с',
        levels: [{ hp: 1, damage: 0, rate: 0, range: 260, heal: 14, healTree: 15 }, { hp: 1, damage: 0, rate: 0, range: 320, heal: 20, healTree: 28 }],
        costs: [p(170, 6), p(150, 12)],
      },
    },
  },
  caterpillar: {
    name: 'Кокон гусениц', creature: 'гусеницы-сборщицы',
    desc: 'В кроне Древа: гусеницы собирают добычу по всему краю, во тьме — медленнее', underground: false, blocks: false,
    levels: [
      { hp: 120, damage: 0, rate: 0, range: 240, workers: 2, speed: 50, carry: 4 },
      { hp: 170, damage: 0, rate: 0, range: 300, workers: 3, speed: 58, carry: 7 },
    ],
    costs: [p(35), p(60)],
    specs: {
      A: {
        name: 'Шелкопряды', desc: 'Больше гусениц, быстрее, собирают по всему краю и таскают помногу', perk: '6 сборщиц по 12 капель',
        levels: [
          { hp: 300, damage: 0, rate: 0, range: 340, workers: 6, speed: 80, carry: 12 },
          { hp: 360, damage: 0, rate: 0, range: 460, workers: 8, speed: 94, carry: 18 },
        ],
        costs: [p(120, 5), p(100, 9)],
      },
      B: {
        name: 'Медовые гусеницы', desc: 'Перерабатывают добычу: всё принесённое ценнее', perk: '+35% к добыче',
        levels: [
          { hp: 300, damage: 0, rate: 0, range: 260, workers: 4, speed: 68, bonus: 0.35, carry: 10 },
          { hp: 360, damage: 0, rate: 0, range: 300, workers: 5, speed: 74, bonus: 0.6, carry: 14 },
        ],
        costs: [p(120, 5), p(100, 9)],
      },
    },
  },
};

/**
 * «Слияние» (a Property from the books): three nests of the same family and the same merge
 * rank fuse into one — the target keeps its level and specialization, gains a merge star.
 * «Возвышение»: endless levels after mastery, exponentially priced; glow colour changes
 * every few levels.
 */
/** One-line role of every nest family — what it is for (shown on build cards). */
export const NEST_ROLE: Record<Family, string> = {
  hive: 'Стрелок: светляки жалят тварей на земле и в воздухе',
  beetle: 'Стена: держит строй, отбрасывает и оглушает',
  dragonfly: 'Подсветка: высвечивает тварей (+урон от всего), жалит, сбивает летунов',
  spider: 'Подземный страж: бьёт Червей под землёй, паутиной — тварей сверху',
  termite: 'Отряд: воины держат край Круга и сами бьются',
  caterpillar: 'Сборщики: таскают Янтарь и Кровь к Древу',
  honeycomb: 'Доход: сам приносит Янтарь (и Кровь)',
  mender: 'Лекарь: чинит гнёзда и Древо',
};

export const MERGE = { power: 1.1, hp: 1.0, range: 0.06 } as const;
export const ASCEND = {
  power: 0.12,
  cost: (n: number) => Math.round(220 * Math.pow(1.4, n)),
  /** levels per glow colour band */
  band: 5,
} as const;
/** Glow colours by band (merge stars and ascension tiers share it). */
export const GLOW_BANDS = ['#ffc847', '#fff6cf', '#8fd0ff', '#b48cff', '#ff5a6a', '#7af0a0'] as const;
export const glowBand = (n: number) => GLOW_BANDS[Math.min(GLOW_BANDS.length - 1, n)];

export const SELL_REFUND = 0.6;

/** Base levels before the specialization choice (the 3rd level is the choice). */
export const BASE_TIERS = 2;
/** Total level count: 2 base + 2 specialization. */
export const MAX_TIER = 4;
