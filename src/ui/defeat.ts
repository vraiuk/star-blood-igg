/**
 * The one stated defeat reason (spec §7): the biggest share of the Tree's damage by creature
 * group, with the answer to it — «62% урона — Черви снизу → Паук в корневом колодце».
 * Pure: reads `stats.treeDmgBy` (damage to the Tree by creature kind).
 */
interface Cause { label: string; answer: string; kinds: string[] }

/** Creature groups and their answers (the first group that holds a kind wins). */
const CAUSES: Cause[] = [
  { label: 'Черви снизу', answer: 'Паук в корневом колодце', kinds: ['worm', 'guard', 'tunneler', 'tunnelerUp'] },
  { label: 'Гигантопитек у ствола', answer: 'Молот [2] оглушает его, ульи жалят издалека', kinds: ['ape'] },
  // medium (spec §6): the Mother and her brood get their own answer
  { label: 'Имаго-Матерь и её личинки', answer: 'Звездопад [3] и Молот [2] по Матери, ульи у края Круга — по личинкам', kinds: ['mother', 'larva'] },
  { label: 'тяжёлые твари', answer: 'Светожук держит строй, Молот [2] оглушает', kinds: ['stalker', 'reaper', 'tyrant', 'executioner', 'devourer'] },
  { label: 'летуны сверху', answer: 'ульи бьют по воздуху, Копьё [1] — тоже', kinds: ['moth', 'bomber'] },
  { label: 'Фуражиры роем', answer: 'шире Круг — в свете Древа они горят; ульи у его края', kinds: ['forager'] },
  { label: 'плевуны издалека', answer: 'Копьё [1] достаёт их и во тьме', kinds: ['spitter'] },
];
const PACK: Cause = { label: 'стаи у ствола', answer: 'больше ульев у края Круга и Светожук перед ними', kinds: [] };

/** One line: what felled the Tree and what answers it. */
export function defeatReason(treeDmgBy: Record<string, number>): string {
  const total = Object.values(treeDmgBy).reduce((a, v) => a + Math.max(0, v), 0);
  if (total <= 0) return 'Древо не получило ран — забег окончен по твоей воле.';
  const by = new Map<Cause, number>();
  for (const [kind, v] of Object.entries(treeDmgBy)) {
    const c = CAUSES.find((x) => x.kinds.includes(kind)) ?? PACK;
    by.set(c, (by.get(c) ?? 0) + Math.max(0, v));
  }
  const [cause, dmg] = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  const pct = Math.round((dmg / total) * 100);
  return `${pct}% урона — ${cause.label} → ${cause.answer}`;
}
