import type { EnemyKind } from './balance';

/** L = left flank, R = right flank, B = both flanks (count is per flank) */
export type Side = 'L' | 'R' | 'B';

export interface SpawnGroup {
  /** seconds after night start */
  at: number;
  kind: EnemyKind;
  side: Side;
  count: number;
  /** seconds between members of the group */
  every: number;
}

export interface NightDef {
  title: string;
  /** enemy max-hp multiplier for this night */
  hpMul: number;
  /** shown on the night banner — what this night teaches */
  hint: string;
  groups: SpawnGroup[];
}

const g = (at: number, kind: EnemyKind, side: Side, count: number, every = 1.6): SpawnGroup => ({
  at, kind, side, count, every,
});

/** Campaign of 10 nights. Bosses at 5 (Имаго-Матерь) and 10 (Имаго-Палач). Pacing: design/v3-plan.md. */
export const NIGHTS: NightDef[] = [
  {
    title: 'Первая ночь', hpMul: 1,
    hint: 'Найтволки идут к Семени. Призови светляков и Светожука, собирай Янтарь.',
    groups: [g(2, 'hound', 'L', 5, 1.6), g(20, 'hound', 'R', 4, 1.8), g(34, 'hound', 'L', 4, 1.2)],
  },
  {
    title: 'Вторая ночь', hpMul: 1.2,
    hint: 'Первые Черви! Фуражиры боятся света, Копатель роет к корням — призови Паука-ткача.',
    groups: [
      g(2, 'hound', 'B', 4, 1.3), g(10, 'forager', 'L', 4, 1.2), g(16, 'worm', 'R', 1),
      g(26, 'hound', 'R', 5, 1), g(36, 'forager', 'R', 4, 1), g(40, 'hound', 'L', 5, 1),
    ],
  },
  {
    title: 'Третья ночь', hpMul: 1.45,
    hint: 'Ледозубы ломают гнёзда, Найтораксы плюются издалека. Стрекозы высвечивают их.',
    groups: [
      g(2, 'hound', 'B', 5, 1.1), g(8, 'spitter', 'R', 2, 3), g(14, 'stalker', 'L', 1), g(18, 'worm', 'L', 1),
      g(24, 'forager', 'B', 4, 1), g(30, 'stalker', 'R', 1), g(34, 'spitter', 'L', 2, 3), g(40, 'worm', 'R', 1),
      g(46, 'hound', 'B', 6, 0.9),
    ],
  },
  {
    title: 'Четвёртая ночь', hpMul: 1.8,
    hint: 'Тьма давит на Круг со всех сторон.',
    groups: [
      g(2, 'hound', 'B', 6, 1), g(8, 'stalker', 'L', 2, 4), g(10, 'spitter', 'R', 3, 2.5), g(14, 'worm', 'B', 1), g(24, 'stalker', 'B', 1),
      g(20, 'forager', 'B', 6, 0.8), g(26, 'stalker', 'R', 2, 4), g(30, 'spitter', 'L', 3, 2.5), g(36, 'worm', 'B', 1),
      g(42, 'hound', 'B', 8, 0.7), g(50, 'stalker', 'B', 1),
    ],
  },
  {
    title: 'Ночь Матери', hpMul: 2.2,
    hint: 'Имаго-Матерь — родильная гора Червей. Игг-свет жжёт её и её личинок.',
    groups: [
      g(2, 'hound', 'B', 6, 1), g(8, 'mother', 'R', 1), g(12, 'stalker', 'L', 2, 4), g(16, 'spitter', 'L', 3, 2.5),
      g(20, 'worm', 'B', 2, 5), g(28, 'forager', 'B', 8, 0.7), g(36, 'stalker', 'B', 1), g(42, 'spitter', 'B', 2, 3),
      g(50, 'hound', 'B', 8, 0.6),
    ],
  },
  {
    title: 'Шестая ночь', hpMul: 2.7,
    hint: 'Имаго-Стражи в броне идут под землёй. Слабые укусы их не берут — нужен Луч или яд.',
    groups: [
      g(2, 'hound', 'B', 8, 0.9), g(8, 'guard', 'L', 1), g(14, 'reaper', 'L', 1), g(30, 'reaper', 'R', 1), g(12, 'stalker', 'R', 2, 4), g(16, 'worm', 'B', 2, 4),
      g(22, 'spitter', 'B', 3, 2.5), g(28, 'guard', 'R', 1), g(34, 'forager', 'B', 8, 0.6), g(42, 'stalker', 'B', 2, 4),
      g(50, 'hound', 'B', 10, 0.5),
    ],
  },
  {
    title: 'Седьмая ночь', hpMul: 3.3,
    hint: 'Рой Фуражиров. Чем шире Круг — тем больше их сгорит в свету.',
    groups: [
      g(2, 'forager', 'B', 12, 0.5), g(10, 'stalker', 'B', 2, 4), g(20, 'reaper', 'B', 1), g(16, 'guard', 'B', 1), g(22, 'spitter', 'B', 4, 2),
      g(30, 'forager', 'B', 12, 0.45), g(38, 'worm', 'B', 3, 3), g(46, 'hound', 'B', 10, 0.5), g(54, 'stalker', 'B', 2, 3),
    ],
  },
  {
    title: 'Восьмая ночь', hpMul: 4.0,
    hint: 'Ледозубы стадом. Держи их Светожуками и Молотом.',
    groups: [
      g(2, 'hound', 'B', 10, 0.6), g(8, 'stalker', 'B', 4, 3), g(24, 'reaper', 'B', 2, 4), g(14, 'guard', 'B', 2, 6), g(20, 'spitter', 'B', 4, 2),
      g(28, 'worm', 'B', 3, 3), g(34, 'forager', 'B', 10, 0.5), g(42, 'stalker', 'B', 3, 3), g(52, 'hound', 'B', 12, 0.45),
    ],
  },
  {
    title: 'Девятая ночь', hpMul: 4.8,
    hint: 'Черви подкапывали и убивали Великие Древа. Держи корни.',
    groups: [
      g(2, 'worm', 'B', 4, 3), g(6, 'guard', 'B', 2, 6), g(16, 'reaper', 'B', 2, 3), g(36, 'stalker', 'B', 2, 3), g(10, 'hound', 'B', 10, 0.6), g(18, 'stalker', 'B', 3, 3),
      g(24, 'spitter', 'B', 5, 1.8), g(30, 'forager', 'B', 14, 0.4), g(40, 'guard', 'B', 2, 5), g(46, 'stalker', 'B', 3, 3),
      g(56, 'hound', 'B', 12, 0.4),
    ],
  },
  {
    title: 'Ночь Палача', hpMul: 5.8,
    hint: 'Имаго-Палач создан для уничтожения Восходящих. Его коготь пробивает ствол.',
    groups: [
      g(2, 'hound', 'B', 10, 0.6), g(8, 'executioner', 'L', 1), g(20, 'reaper', 'B', 2, 4), g(12, 'stalker', 'R', 3, 3), g(18, 'guard', 'B', 2, 5),
      g(24, 'mother', 'R', 1), g(30, 'spitter', 'B', 5, 1.8), g(38, 'forager', 'B', 14, 0.4), g(46, 'worm', 'B', 3, 3),
      g(54, 'stalker', 'B', 3, 3), g(62, 'hound', 'B', 14, 0.4),
    ],
  },
];

// ───────────────────────────── endless ─────────────────────────────

/**
 * Endless mode: after the 10 hand-made nights the Darkness keeps coming forever.
 * Difficulty follows smooth curves (no cliffs); rewards grow too, so new things stay
 * affordable, but the slot cap means the Circle eventually falls — the goal is a record.
 * `n` is the 0-based night index.
 */
export const ENDLESS = {
  /** hand-made nights before the procedural generator takes over */
  campaignNights: NIGHTS.length,
  /** enemy max-hp multiplier */
  hp: (n: number) => (1 + 0.2 * n + 0.025 * n * n) * Math.pow(1.06, Math.max(0, n - 9)),
  /** enemy damage multiplier */
  damage: (n: number) => (1 + 0.12 * n) * Math.pow(1.03, Math.max(0, n - 9)),
  /** group-size multiplier for the hand-made nights */
  count: (n: number) => Math.min(2.2, 1 + 0.08 * n),
  /** Amber/Star Blood bounty multiplier */
  bounty: (n: number) => 1 + 0.02 * n,
  /** boss hp multiplier (bosses are tuned absolute at their first appearance) */
  bossHp: (n: number) => (1 + 0.12 * Math.max(0, n - 4)) * Math.pow(1.04, Math.max(0, n - 9)),
  /** extra growth of underground worm groups per night */
  wormCount: 0.06,
  /** threat budget of a generated night */
  budget: (n: number) => 90 + 11 * n,
} as const;

/** Threat cost of one creature (for the generator's budget). */
const THREAT: Partial<Record<EnemyKind, number>> = {
  hound: 1, forager: 1, spitter: 2.5, stalker: 5, worm: 3.5, guard: 7, reaper: 9,
};
/** Night index from which a kind appears in generated nights, and its weight. */
const POOL: Array<{ kind: EnemyKind; from: number; w: number; size: [number, number] }> = [
  { kind: 'hound', from: 0, w: 5, size: [4, 9] },
  { kind: 'forager', from: 0, w: 4, size: [5, 12] },
  { kind: 'spitter', from: 0, w: 2.5, size: [2, 4] },
  { kind: 'stalker', from: 0, w: 3.2, size: [2, 4] },
  { kind: 'worm', from: 0, w: 2, size: [1, 3] },
  { kind: 'guard', from: 0, w: 1.8, size: [1, 3] },
  { kind: 'reaper', from: 0, w: 2.2, size: [1, 3] },
];

const LORE_HINTS = [
  'Черви угрожают самому существованию Единства. Уничтожайте их везде, где найдёте!',
  '«Даны тебе плечи — неси!»',
  'Тьма за Кругом шевелится. Древо берёт тебя под свои ветви.',
  'Имаго роют к корням: «Черви подкопали и убили все три Великих Древа».',
  'Найтволки воют у границы Теней.',
  'Свет Древа обжигает тёмных тварей. Держи Круг.',
  'Тот-Кто-Наблюдает следит за твоим Подвигом.',
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Procedural night (deterministic per index). */
export function generateNight(n: number): NightDef {
  const r = rng(9001 + n * 7919);
  const groups: SpawnGroup[] = [];
  let budget = ENDLESS.budget(n);
  const bossNight = (n + 1) % 5 === 0;
  if (bossNight) {
    const extra = Math.floor((n + 1) / 20);
    const kinds: EnemyKind[] = (n + 1) % 10 === 0 ? ['executioner', 'mother'] : ['mother'];
    for (const k of kinds) groups.push(g(8, k, r() > 0.5 ? 'L' : 'R', 1 + extra, 12));
    budget *= 0.7;
  }
  let t = 2;
  const pool = POOL.filter((p) => n >= p.from);
  // bigger packs as nights go on (fewer, meatier groups keep nights ~1–2 minutes)
  const sizeMul = 1 + n * 0.04;
  while (budget > 0) {
    // worm-kinds get more common as nights go on
    const wOf = (q: (typeof pool)[number]) => q.w * (q.kind === 'worm' || q.kind === 'guard' ? 1 + n * 0.05 : 1);
    const tot = pool.reduce((a, q) => a + wOf(q), 0);
    let pick = r() * tot;
    let p = pool[0];
    for (const q of pool) { pick -= wOf(q); if (pick <= 0) { p = q; break; } }
    const size = Math.max(1, Math.round((p.size[0] + r() * (p.size[1] - p.size[0])) * sizeMul));
    const side: Side = r() < 0.4 ? 'B' : r() < 0.5 ? 'L' : 'R';
    const flanks = side === 'B' ? 2 : 1;
    groups.push(g(t, p.kind, side, size, Math.max(0.35, 1.4 - n * 0.02)));
    budget -= (THREAT[p.kind] ?? 2) * size * flanks;
    t += 2.5 + r() * 3;
  }
  return {
    title: bossNight ? `Ночь ${n + 1}: ${(n + 1) % 10 === 0 ? 'Палач и Матерь' : 'Охота Матерей'}` : `Ночь ${n + 1}`,
    hpMul: ENDLESS.hp(n),
    hint: bossNight
      ? ((n + 1) % 10 === 0 ? 'Имаго-Палач и Матерь идут вместе.' : 'Имаго-Матерь ведёт рой.')
      : LORE_HINTS[n % LORE_HINTS.length],
    groups,
  };
}

/** Night definition for any index: hand-made campaign first, then generated. */
export function nightDef(n: number): NightDef {
  if (n < NIGHTS.length) return { ...NIGHTS[n], hpMul: ENDLESS.hp(n) };
  return generateNight(n);
}
