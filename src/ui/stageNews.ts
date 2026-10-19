import { ABILITIES } from '../data/balance';
import { TREE_STAGES } from '../data/tree';
import type { WorldDef } from '../data/worlds';

/**
 * In-world: what a new Tree stage opens in this world — the banner's items (Circle, rune,
 * specializations, Star Blood, Rift sealing, Ascension…) and the Observer's one line about what
 * it gives (spec §6: every opening = a banner + one line). Pure, so it is tested.
 */
export function stageNews(w: WorldDef, stage: number): { items: string[]; line: string | null } {
  const out = [`Круг ${TREE_STAGES[stage].radius}`, 'новые места для гнёзд'];
  for (const u of w.runeUnlocks ?? []) if (u.when.kind === 'stage' && u.when.stage === stage) out.push(`руна ${ABILITIES[u.rune].name} [${ABILITIES[u.rune].key}]`);
  if (w.specStage === stage) out.push('развилки гнёзд');
  if (w.ascendStage === stage) out.push('Возвышение гнёзд');
  if (w.features.tablet && (w.tabletStage ?? 0) === stage && stage > 0) out.push('Звёздная Кровь и камень Скрижали');
  const rift = w.objects.find((o) => o.kind === 'rift');
  if (rift && rift.kind === 'rift' && rift.minStage === stage) out.push('запечатывание Разломов');
  if (stage === w.maxStage) out.push('предел этого мира');
  return { items: out, line: w.stageLines?.[stage] ?? null };
}
