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

/** Vertical slice: 5 nights. Pacing table: design/game-brief.md §4. */
export const NIGHTS: NightDef[] = [
  {
    title: 'Первая ночь',
    hpMul: 1,
    hint: 'Найтволки идут слева. Призови светляков и жука, собирай Янтарь.',
    groups: [g(2, 'hound', 'L', 4, 1.8), g(18, 'hound', 'R', 3, 2), g(30, 'hound', 'L', 4, 1.3)],
  },
  {
    title: 'Вторая ночь',
    hpMul: 1.15,
    hint: 'Гигантопитеки ломают гнёзда. Первый Червь несёт Звёздную Кровь!',
    groups: [
      g(2, 'hound', 'L', 6, 1.2), g(8, 'hound', 'R', 6, 1.2),
      g(18, 'stalker', 'L', 1), g(22, 'worm', 'R', 1), g(26, 'stalker', 'R', 1),
      g(34, 'hound', 'B', 4, 1),
    ],
  },
  {
    title: 'Третья ночь',
    hpMul: 1.4,
    hint: 'Черви ползут к корням. Пауки-ткачи и Корни Игг [2] — против них.',
    groups: [
      g(2, 'hound', 'L', 6, 1.1), g(6, 'spitter', 'R', 2, 3), g(10, 'worm', 'L', 1),
      g(14, 'hound', 'R', 6, 1), g(24, 'spitter', 'L', 2, 3),
      g(26, 'worm', 'R', 2, 6), g(34, 'stalker', 'B', 1), g(40, 'hound', 'B', 5, 0.9),
    ],
  },
  {
    title: 'Четвёртая ночь',
    hpMul: 1.6,
    hint: 'Тьма давит на Круг со всех сторон.',
    groups: [
      g(2, 'hound', 'B', 5, 1.1), g(8, 'stalker', 'L', 2, 4), g(10, 'spitter', 'R', 3, 2.5),
      g(14, 'worm', 'B', 1), g(20, 'stalker', 'R', 2, 4), g(22, 'spitter', 'L', 3, 2.5),
      g(30, 'hound', 'B', 6, 0.9), g(36, 'worm', 'B', 1), g(42, 'stalker', 'B', 1),
      g(48, 'hound', 'B', 6, 0.8),
    ],
  },
  {
    title: 'Ночь Матки Червей',
    hpMul: 1.75,
    hint: 'Матка Червей выползла из тьмы. Игг-свет жжёт её вдвойне.',
    groups: [
      g(2, 'hound', 'B', 5, 1.1), g(8, 'mother', 'R', 1), g(12, 'stalker', 'L', 2, 4),
      g(16, 'spitter', 'L', 3, 2.5), g(20, 'worm', 'B', 1), g(26, 'hound', 'B', 6, 0.9),
      g(32, 'stalker', 'B', 1), g(36, 'worm', 'L', 2, 5), g(42, 'spitter', 'B', 2, 3),
      g(48, 'hound', 'B', 8, 0.7), g(54, 'stalker', 'B', 1),
    ],
  },
];
