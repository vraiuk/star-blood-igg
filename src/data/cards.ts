import type { EnemyKind } from './balance';

/**
 * First-encounter creature cards (spec §7): shown once per save, at the side, for 7 s, without
 * stopping the game — name, what it does, how to answer it.
 */
export interface CreatureCard { does: string; answer: string }

export const CREATURE_CARDS: Partial<Record<EnemyKind, CreatureCard>> = {
  hound: { does: 'Бежит стаей прямо к Древу и грызёт всё на пути.', answer: 'Ульи у края Круга, Копьё [1] навстречу стае.' },
  worm: { does: 'Ползёт под землёй к корням и грызёт Древо снизу; роет Лазы.', answer: 'Паук в корневом колодце. Свет Древа жжёт Червей.' },
  ape: { does: 'Огромная тень-обезьяна: ломает гнёзда кулаками.', answer: 'Молот [2] оглушает и отбрасывает; ульи жалят издалека.' },
  grazer: { does: 'Безобиден: пасётся у края мира и убегает от Хранителя.', answer: 'Загони к краю и сбей Копьём [1] — 3–5 капель Янтаря. К рассвету стадо вырастает снова.' },
  forager: { does: 'Мелкий Имаго, идёт роем; в свете Древа горит.', answer: 'Шире Круг — больше сгорит. Ульи добивают.' },
  spitter: { does: 'Плюётся кислотой издалека по гнёздам и Древу.', answer: 'Копьё [1] бьёт и во тьме; стрекозы сбивают плевки.' },
  stalker: { does: 'Тяжёлый, ломает гнёзда.', answer: 'Светожук держит строй, Молот [2] оглушает.' },
  moth: { does: 'Летит поверх строя к кроне.', answer: 'Ульи и стрекозы бьют по воздуху, Копьё — тоже.' },
  jumper: { does: 'Перепрыгивает Светожуков.', answer: 'Ульи за строем, Копьё навстречу.' },
  mother: { does: 'Имаго-Матерь рожает личинок.', answer: 'Свет жжёт её; бей Молотом и Звездопадом.' },
};
