import { Game, type GameOptions } from '../src/sim/game';
import { PLANS, act, type BotResult } from './bot';

/**
 * The heuristic bot playing every Ascended of a co-op run: each one thinks with their own runes
 * (shared Amber and Star Blood — they compete for it like real players), makes their own picks.
 */
export function runCoopBot(planName: keyof typeof PLANS, players: number, seed = 1, maxMinutes = 30, opts: GameOptions = {}, maxNights = 10): BotResult {
  const plan = PLANS[planName];
  const g = new Game({ seed, players, ...opts });
  const s = g.state;
  const treeDmg: Record<string, number> = {};
  let think = 0;
  const maxSteps = maxMinutes * 60 * 60;
  for (let i = 0; i < maxSteps && !g.over && s.night < maxNights; i++) {
    for (let p = 0; p < s.keepers.length; p++) while (g.choiceFor(p) && g.asKeeper(p, () => g.choose(0)));
    if (g.choice) g.choose(0);
    think -= 1;
    if (think <= 0) {
      think = 10;
      for (let p = 0; p < s.keepers.length; p++) g.asKeeper(p, () => act(g, plan));
    }
    g.step();
    for (const ev of s.events) if (ev.type === 'treeHit') treeDmg[ev.by] = (treeDmg[ev.by] ?? 0) + ev.amount;
    s.events.length = 0;
  }
  return {
    phase: g.over ? 'lost' : 'alive', night: s.night, stage: s.tree.stage + 1,
    treeHpPct: Math.round((s.tree.hp / g.treeMaxHp()) * 100), stars: g.stars(),
    kills: s.stats.kills, amber: s.amber, star: s.star, time: Math.round(s.stats.time), treeDmg,
  };
}
