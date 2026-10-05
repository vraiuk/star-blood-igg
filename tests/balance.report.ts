import { PLANS, runBot } from './bot';

for (const plan of Object.keys(PLANS)) {
  const rows = [1, 2, 3, 4, 5].map((seed) => runBot(plan, seed));
  console.log(plan.padEnd(14), rows.map((r) => `${r.phase[0]}N${r.night}S${r.stage}hp${r.treeHpPct}★${r.stars}t${r.time}`).join('  '));
  console.log(' '.repeat(14), JSON.stringify(rows[0].treeDmg, (_k, v) => (typeof v === 'number' ? Math.round(v) : v)));
}
