import { ENEMIES, SLOTS, WORLD } from '../src/data/balance';
import type { Family } from '../src/data/nests';
import { Game, type GameOptions } from '../src/sim/game';

export interface BotPlan {
  /** grow the tree when affordable */
  grow: boolean;
  defend: boolean;
  abilities: boolean;
  collect: boolean;
  dragonflies: boolean;
  /** buy specializations / ranks with Star Blood */
  specialize: boolean;
  /** think-cycles between ability casts (1 = perfect, 4 = casual human) */
  castEvery?: number;
}

export const PLANS: Record<string, BotPlan> = {
  idle: { grow: false, defend: false, abilities: false, collect: false, dragonflies: false, specialize: false },
  balanced: { grow: true, defend: true, abilities: true, collect: true, dragonflies: true, specialize: true },
  casual: { grow: true, defend: true, abilities: true, collect: true, dragonflies: true, specialize: true, castEvery: 4 },
  turtle: { grow: false, defend: true, abilities: true, collect: true, dragonflies: true, specialize: true },
  greedy: { grow: true, defend: false, abilities: true, collect: true, dragonflies: false, specialize: false },
  passiveKeeper: { grow: true, defend: true, abilities: false, collect: false, dragonflies: true, specialize: false },
};

/** Desired layout per side, by slot index (0 = closest to the tree). */
const LAYOUT: Family[] = ['hive', 'beetle', 'dragonfly', 'caterpillar', 'hive', 'beetle', 'dragonfly', 'hive', 'hive', 'beetle'];

export interface BotResult {
  phase: string;
  night: number;
  stage: number;
  treeHpPct: number;
  stars: number;
  kills: number;
  amber: number;
  star: number;
  time: number;
  treeDmg: Record<string, number>;
}

/** Plays one full level with a scripted heuristic player. */
export function runBot(planName: keyof typeof PLANS, seed = 1, maxMinutes = 30, log?: (line: string) => void, opts: GameOptions = {}, maxNights = 10): BotResult {
  const plan = PLANS[planName];
  const g = new Game({ seed, ...opts });
  const s = g.state;
  let think = 0;
  const treeDmg: Record<string, number> = {};
  const maxSteps = maxMinutes * 60 * 60;
  for (let i = 0; i < maxSteps && !g.over && s.night < maxNights; i++) {
    if (g.choice) g.choose(0);
    think -= 1;
    if (think <= 0) {
      think = 10;
      act(g, plan);
    }
    g.step();
    for (const ev of s.events) {
      if (ev.type === 'treeHit') treeDmg[ev.by] = (treeDmg[ev.by] ?? 0) + ev.amount;
      if (log && ['nightStart', 'dawn', 'keeperDown', 'structureLost', 'treeGrew', 'lost', 'rankUp'].includes(ev.type)) {
        log(`t${Math.round(s.time)} ${ev.type} amber=${s.amber} star=${s.star} stage=${s.tree.stage + 1} treeHp=${Math.round(s.tree.hp)} nests=${s.structures.map((x) => x.slotId + ':' + x.family[0] + x.tier + (x.spec ?? '')).join(',')}`);
      }
    }
    s.events.length = 0;
  }
  return {
    phase: g.over ? 'lost' : 'alive', night: s.night, stage: s.tree.stage + 1,
    treeHpPct: Math.round((s.tree.hp / g.treeMaxHp()) * 100), stars: g.stars(),
    kills: s.stats.kills, amber: s.amber, star: s.star, time: Math.round(s.stats.time), treeDmg,
  };
}

let castTick = 0;

function act(g: Game, plan: BotPlan) {
  const s = g.state;
  const k = s.keeper;

  if (plan.defend) buildDefense(g, plan, true);
  const need = g.growNeed();
  if (plan.grow && !plan.defend) g.feed(need);
  else if (plan.grow && need > 0 && s.phase === 'day' && s.amber >= need) g.feed(need);
  if (plan.defend && (!plan.grow || need === 0 || s.amber > need * 0.5 + 30)) buildDefense(g, plan, false);
  if (plan.specialize) {
    for (const st of s.structures) {
      if (st.tier === 2) g.specialize(st.id, st.family === 'hive' ? (st.slotId.endsWith('0') ? 'A' : 'B') : 'A');
      else if (st.tier === 3) g.upgrade(st.id);
    }
    if (s.star >= 25) g.ascend();
    // Observer's treasury: power properties first
    for (const id of ['sp-power', 'hm-power', 'sp-power', 'lt-spring', 'sf-power']) if (s.star >= 14) g.buyProperty(id);
    if (s.devRunes > 0 && !g.developRune('spear')) g.raiseAttr('body', true);
    if (s.star >= 40) g.raiseAttr(s.keeper.attrs.might <= s.keeper.attrs.body ? 'might' : 'body');
    if (g.growNeed() === 0 && s.amber > g.ringCost() + 150) g.addRing();
  }
  if (s.phase === 'day' && s.night > 0 && s.dayLeft < 18) g.callNight();
  if (!k.alive && !g.revive('amber')) g.revive('sacrifice');
  // rune ranks and forms
  if (plan.specialize) {
    for (const rid of ['spear', 'hammer', 'starfall'] as const) {
      if (g.abilityUnlocked(rid) && s.star >= 60) g.promoteRune(rid);
      if (k.runeRank[rid] >= 2 && !k.forms[rid]) g.chooseForm(rid, rid === 'hammer' ? 'B' : 'A');
    }
  }

  let goal: number = WORLD.treeX;
  const threats = s.enemies.filter((e) => !ENEMIES[e.kind].underground);
  if (threats.length) {
    const nearest = threats.reduce((a, b) => (Math.abs(a.x - WORLD.treeX) < Math.abs(b.x - WORLD.treeX) ? a : b));
    goal = WORLD.treeX + Math.sign(nearest.x - WORLD.treeX) * 40;
  }
  if (plan.collect && s.drops.length) {
    const safeR = s.tree.radius + 40;
    const d = s.drops
      .filter((d) => Math.abs(d.x - WORLD.treeX) < safeR)
      .sort((a, b) => Math.abs(a.x - k.x) - Math.abs(b.x - k.x))[0];
    if (d) goal = d.x;
  }
  if (k.hp < 35) goal = WORLD.treeX;
  g.setMove(Math.abs(goal - k.x) < 4 ? 0 : goal > k.x ? 1 : -1);

  if (!plan.abilities) return;
  castTick++;
  if (castTick % (plan.castEvery ?? 1) !== 0) return;
  const worm = s.enemies.find((e) => ENEMIES[e.kind].underground && Math.abs(e.x - WORLD.treeX) < 160);
  if (worm && Math.abs(worm.x - k.x) < 100) g.cast('hammer', k.x);
  const close = threats.filter((e) => Math.abs(e.x - k.x) < 160);
  if (close.length) {
    const t = close.sort((a, b) => Math.abs(a.x - k.x) - Math.abs(b.x - k.x))[0];
    if (close.filter((e) => Math.abs(e.x - k.x) < 60).length >= 3) g.cast('hammer', k.x);
    g.face(t.x >= k.x ? 1 : -1);
    g.cast('spear', t.x);
    const big = close.find((e) => e.kind === 'stalker' || e.kind === 'mother');
    if (big) {
      g.cast('starfall', big.x);
    }
  }
}

function buildDefense(g: Game, plan: BotPlan, coreOnly: boolean) {
  const s = g.state;
  const surface = SLOTS.filter((sl) => !sl.underground && g.slotUnlocked(sl))
    .sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
  for (const sl of surface) {
    if (g.structureAt(sl.id)) continue;
    const idx = Number(sl.id.slice(1));
    if (coreOnly && idx > 1) continue;
    let fam = LAYOUT[idx];
    if (fam === 'dragonfly' && !plan.dragonflies) fam = 'hive';
    if (s.amber >= g.buildPrice(fam).amber) g.build(sl.id, fam);
  }
  if (s.night >= 1) {
    for (const sl of SLOTS.filter((x) => x.underground && g.slotUnlocked(x))) {
      if (coreOnly && (sl.unlockStage ?? 1) > 1) continue;
      if (!g.structureAt(sl.id)) g.build(sl.id, 'spider');
    }
  }
  if (coreOnly) return;
  for (const st of s.structures) {
    const next = g.upgradePrice(st);
    if (next && st.tier < 2 && s.amber >= next.amber + 40) g.upgrade(st.id);
  }
}
