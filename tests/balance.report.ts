import { PLANS, runBot } from './bot';

const MAX = Number((globalThis as { process?: { argv: string[] } }).process?.argv[2] ?? 40);
for (const plan of Object.keys(PLANS)) {
  const rows = [1, 2, 3, 4, 5].map((seed) => runBot(plan, seed, 120, undefined, {}, MAX));
  const nights = rows.map((r) => r.night);
  console.log(plan.padEnd(14), 'nights', nights.join(' '), ' stage', rows.map((r) => r.stage).join(''), ' ★', rows.map((r) => r.stars).join(''), ' min', rows.map((r) => Math.round(r.time / 60)).join(' '));
}
