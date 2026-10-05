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
      g(2, 'hound', 'B', 6, 1), g(8, 'stalker', 'L', 2, 4), g(10, 'spitter', 'R', 3, 2.5), g(14, 'worm', 'B', 1),
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
      g(2, 'hound', 'B', 8, 0.9), g(8, 'guard', 'L', 1), g(12, 'stalker', 'R', 2, 4), g(16, 'worm', 'B', 2, 4),
      g(22, 'spitter', 'B', 3, 2.5), g(28, 'guard', 'R', 1), g(34, 'forager', 'B', 8, 0.6), g(42, 'stalker', 'B', 2, 4),
      g(50, 'hound', 'B', 10, 0.5),
    ],
  },
  {
    title: 'Седьмая ночь', hpMul: 3.3,
    hint: 'Рой Фуражиров. Чем шире Круг — тем больше их сгорит в свету.',
    groups: [
      g(2, 'forager', 'B', 12, 0.5), g(10, 'stalker', 'B', 2, 4), g(16, 'guard', 'B', 1), g(22, 'spitter', 'B', 4, 2),
      g(30, 'forager', 'B', 12, 0.45), g(38, 'worm', 'B', 3, 3), g(46, 'hound', 'B', 10, 0.5), g(54, 'stalker', 'B', 2, 3),
    ],
  },
  {
    title: 'Восьмая ночь', hpMul: 4.0,
    hint: 'Ледозубы стадом. Держи их Светожуками и Молотом.',
    groups: [
      g(2, 'hound', 'B', 10, 0.6), g(8, 'stalker', 'B', 4, 3), g(14, 'guard', 'B', 2, 6), g(20, 'spitter', 'B', 4, 2),
      g(28, 'worm', 'B', 3, 3), g(34, 'forager', 'B', 10, 0.5), g(42, 'stalker', 'B', 3, 3), g(52, 'hound', 'B', 12, 0.45),
    ],
  },
  {
    title: 'Девятая ночь', hpMul: 4.8,
    hint: 'Черви подкапывали и убивали Великие Древа. Держи корни.',
    groups: [
      g(2, 'worm', 'B', 4, 3), g(6, 'guard', 'B', 2, 6), g(10, 'hound', 'B', 10, 0.6), g(18, 'stalker', 'B', 3, 3),
      g(24, 'spitter', 'B', 5, 1.8), g(30, 'forager', 'B', 14, 0.4), g(40, 'guard', 'B', 2, 5), g(46, 'stalker', 'B', 3, 3),
      g(56, 'hound', 'B', 12, 0.4),
    ],
  },
  {
    title: 'Ночь Палача', hpMul: 5.8,
    hint: 'Имаго-Палач создан для уничтожения Восходящих. Его коготь пробивает ствол.',
    groups: [
      g(2, 'hound', 'B', 10, 0.6), g(8, 'executioner', 'L', 1), g(12, 'stalker', 'R', 3, 3), g(18, 'guard', 'B', 2, 5),
      g(24, 'mother', 'R', 1), g(30, 'spitter', 'B', 5, 1.8), g(38, 'forager', 'B', 14, 0.4), g(46, 'worm', 'B', 3, 3),
      g(54, 'stalker', 'B', 3, 3), g(62, 'hound', 'B', 14, 0.4),
    ],
  },
];
