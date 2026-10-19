import { SLOTS, WORLD } from '../data/balance';
import { INWORLD, type WorldId } from '../data/worlds';
import type { YurrView } from '../render/sprites';
import type { Game } from '../sim/game';
import { markSeen, seen, unmarkSeen } from '../state/seen';

/**
 * The guide (spec §7): Кыш, the field yurr from the books — a plump tricolour hamster-squirrel
 * with white ear tufts, no Star Blood in him. He scampers ahead of the Keeper to the next goal,
 * sits there whistling and digging a little; if the player does not do the needed thing for
 * `GUIDE.alertAfter` seconds he whistles loudly («!» blinks) and the hint line lights up. A step
 * once done is never shown again (`igg2-seen-v1`: `guide:<world>:<step>`); the pause screen
 * switches him off (`guide:off`). At night he hides by the Tree when creatures come near.
 * Nothing targets him: he lives only in the UI.
 *
 * The step logic (`GUIDE_STEPS`, `currentStep`) is pure and tested; `Guide` adds his motion.
 */
export interface GuideStep {
  id: string;
  /** narrator / Observer line about Кыш (HTML) */
  text: string;
  /** is the step relevant right now */
  need: (g: Game) => boolean;
  /** is it done */
  done: (g: Game) => boolean;
  /** world x where Кыш sits for it (null: by the Keeper) */
  target: (g: Game) => number | null;
}

/** Guide tuning (seconds, px, px/s). */
/** `beside`: he sits this far from the goal, on the Keeper's side (clear of the object's sprite) */
export const GUIDE = { alertAfter: 10, speed: 110, follow: 16, hideNear: 90, carrot: 9, beside: 12 } as const;

const nearestX = (g: Game, xs: number[]) => {
  const k = g.state.keeper.x;
  return xs.length ? xs.reduce((a, x) => (Math.abs(x - k) < Math.abs(a - k) ? x : a)) : null;
};
const amberDrops = (g: Game) => g.state.drops.filter((d) => d.kind === 'amber' && d.mode !== 3);
const wellOpen = (g: Game) => SLOTS.some((s) => s.well && g.slotUnlocked(s) && !g.structureAt(s.id));

/** The micro steps (spec §7): take → hive → night → drops → grow → spider → Seed → carry out. */
const MICRO: GuideStep[] = [
  {
    id: 'take', text: 'Кыш свистит у дупла — там Казна Древа. Держи <kbd>W</kbd>: возьми Янтарь в кошель.',
    need: (g) => g.state.structures.length === 0,
    done: (g) => g.state.keeper.purse > 0 || g.state.structures.length > 0,
    target: () => WORLD.treeX + INWORLD.treasury,
  },
  {
    id: 'hive', text: 'Кыш роет землю у места для гнезда. Встань там и держи <kbd>S</kbd> — влей Янтарь, вырастет Улей.',
    need: () => true,
    done: (g) => g.state.structures.length > 0,
    target: (g) => nearestX(g, SLOTS.filter((s) => !s.underground && !s.crown && g.slotUnlocked(s) && !g.structureAt(s.id)).map((s) => s.x)),
  },
  {
    id: 'night', text: 'Кыш насторожил уши: тьма близко. <kbd>Пробел</kbd> — призвать ночь, не дожидаясь.',
    need: (g) => g.state.phase === 'day' && g.state.structures.length > 0,
    done: (g) => g.state.night > 0 || g.state.phase === 'night',
    target: () => null,
  },
  {
    id: 'pickup', text: 'Кыш нашёл капли Янтаря. Пройди по ним — они сами лягут в кошель.',
    need: (g) => g.state.night > 0 && amberDrops(g).length > 0,
    done: (g) => g.state.night > 0 && g.state.stats.amberCollected > 0,
    target: (g) => nearestX(g, amberDrops(g).map((d) => d.x)),
  },
  {
    id: 'grow', text: 'Кыш свистит у алтаря. Держи <kbd>S</kbd>: Янтарь из кошеля и Казны — и Древо вырастет, Круг станет шире.',
    need: (g) => g.state.phase === 'day' && g.state.night >= 1 && g.growNeed() > 0 && g.state.keeper.purse + g.state.amber >= g.growNeed(),
    done: (g) => g.state.tree.stage >= 1,
    target: () => WORLD.treeX + INWORLD.altar,
  },
  {
    id: 'spider', text: 'Кыш сунул мордочку в корневой колодец: под землёй ползёт Червь. Влей Янтарь — в колодце поселится Паук.',
    need: (g) => wellOpen(g) && !g.state.seed,
    done: (g) => g.state.structures.some((s) => s.family === 'spider'),
    target: (g) => nearestX(g, SLOTS.filter((s) => s.well && g.slotUnlocked(s) && !g.structureAt(s.id)).map((s) => s.x)),
  },
  {
    id: 'seed', text: 'Древо уронило Семя — Кыш мурлычет рядом. Держи <kbd>S</kbd>: возьми Семя.',
    need: (g) => !!g.state.seed && !g.state.seed.carried,
    done: (g) => g.won || !!g.state.seed?.carried,
    target: (g) => g.state.seed?.x ?? null,
  },
  {
    id: 'carry', text: 'Неси Семя за край Круга — Кыш бежит впереди и показывает путь.',
    need: (g) => !!g.state.seed?.carried,
    done: (g) => g.won,
    target: (g) => WORLD.treeX + Math.sign(g.state.keeper.x - WORLD.treeX || 1) * (g.state.tree.radius + 6),
  },
];

/** Guide steps per world (medium arrives in phase 7). */
export const GUIDE_STEPS: Record<WorldId, GuideStep[]> = { legacy: [], micro: MICRO, medium: [] };

/** The step to show now: the first not done (now or in an earlier run) whose need holds. */
export function currentStep(g: Game, doneBefore: (id: string) => boolean): GuideStep | null {
  for (const s of GUIDE_STEPS[g.world.id]) {
    if (doneBefore(s.id) || s.done(g)) continue;
    if (s.need(g)) return s;
  }
  return null;
}

const key = (g: Game, id: string) => `guide:${g.world.id}:${id}`;

/** Кыш himself: position and pose for the renderer, the hint line for the HUD. */
export class Guide {
  private x = 0;
  private dir: 1 | -1 = 1;
  private t = 0;
  private stepId: string | null = null;
  private idleT = 0;
  private carrotT = 0;
  private carrotX = 0;
  private placed = false;
  private mode: YurrView['mode'] = 'sit';
  /** the hint line for the current step ('' = none) */
  text = '';
  /** he whistles loudly (the player has not done the step for a while) */
  alert = false;

  /** Is the guide switched on (pause screen)? */
  get enabled() { return !seen('guide:off'); }
  /** Switch the guide on / off (remembered). */
  toggle() { if (this.enabled) markSeen('guide:off'); else unmarkSeen('guide:off'); }

  /** A new run: Кыш appears by the Keeper. */
  reset() { this.placed = false; this.stepId = null; this.idleT = 0; this.carrotT = 0; }

  /** Dawn after night 1: Кыш drags in a purple carrot (cosmetic). */
  carrot() { this.carrotT = GUIDE.carrot; this.carrotX = this.x; }

  update(g: Game, dt: number) {
    const s = g.state;
    const k = s.keeper;
    this.t += dt;
    if (!this.placed) { this.x = k.x - GUIDE.follow; this.placed = true; }
    // a step done now is remembered for good
    const prev = GUIDE_STEPS[g.world.id].find((st) => st.id === this.stepId);
    if (prev?.done(g)) markSeen(key(g, prev.id));
    const step = this.enabled && !g.over ? currentStep(g, (id) => seen(key(g, id))) : null;
    if ((step?.id ?? null) !== this.stepId) { this.stepId = step?.id ?? null; this.idleT = 0; }
    this.idleT += dt;
    this.alert = !!step && this.idleT >= GUIDE.alertAfter;
    this.text = step ? step.text : '';
    // where to go: hide by the Tree when creatures come near at night; the goal; or by the Keeper
    const danger = s.phase === 'night' && s.enemies.some((e) => !e.dead && e.layer !== 'under' && Math.abs(e.x - this.x) < GUIDE.hideNear);
    const target = step?.target(g) ?? null;
    let goal: number;
    if (danger) goal = WORLD.treeX - 8;
    else if (target !== null) goal = target + (k.x < target ? -GUIDE.beside : GUIDE.beside);
    else goal = k.x - k.dir * GUIDE.follow;
    const d = goal - this.x;
    const sp = GUIDE.speed * (danger ? 1.3 : 1);
    if (Math.abs(d) > 1.5) {
      this.dir = d > 0 ? 1 : -1;
      this.x += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
      this.mode = 'run';
    } else {
      this.mode = danger ? 'hide' : target !== null ? (Math.floor(this.idleT / 2) % 3 === 2 ? 'dig' : 'sit') : 'sit';
      if (target !== null) this.dir = k.x < this.x ? -1 : 1;
    }
    this.carrotT = Math.max(0, this.carrotT - dt);
  }

  /** What the renderer draws (null: hidden). */
  view(g: Game): YurrView | null {
    if (!this.enabled || !this.placed || !g.world.features.inWorld || GUIDE_STEPS[g.world.id].length === 0) return null;
    return {
      x: this.x, dir: this.dir, mode: this.mode, t: this.t,
      whistle: this.mode === 'sit' && !!this.stepId && this.stepId !== 'night', alert: this.alert,
      carrotX: this.carrotT > 0 ? this.carrotX : null,
    };
  }
}
