import { NESTS } from '../data/nests';
import { PATHS } from '../data/meta';
import { TREE_STAGES, branchById } from '../data/tree';
import type { Game } from '../sim/game';

const KEY = 'igg-tree-runlogs-v1';
const KEEP = 100;

/** One finished (or abandoned) run, kept locally for balance statistics. */
export interface RunLog {
  id: string;
  date: string;
  build: string;
  path: string;
  result: 'lost' | 'quit';
  /** nights survived */
  nights: number;
  minutes: number;
  tree: { stage: string; rings: number; branches: string[] };
  keeper: {
    rank: number;
    attrs: Record<string, number>;
    learned: string[];
    runeRank: Record<string, number>;
    forms: Record<string, string | null>;
    facets: string[];
    props: Record<string, string[]>;
  };
  nests: Array<{ family: string; tier: number; spec: string | null; merge: number; ascend: number; slot: string }>;
  /** damage dealt by source */
  dmg: Record<string, number>;
  casts: Record<string, number>;
  killsBy: Record<string, number>;
  treeDmgBy: Record<string, number>;
  keeperDeaths: number;
  rushes: number;
  wrath: number;
  perNight: Game['state']['stats']['nights'];
}

/** Snapshot the run into a log record. */
export function buildRunLog(g: Game, result: RunLog['result']): RunLog {
  const s = g.state;
  const k = s.keeper;
  const st = s.stats;
  const round = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([a, v]) => [a, Math.round(v)]));
  return {
    id: `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    date: new Date().toISOString(),
    build: (import.meta as { env?: { MODE?: string } }).env?.MODE ?? 'web',
    path: PATHS[g.path]?.name ?? String(g.path),
    result,
    nights: s.night,
    minutes: Math.round((st.time / 60) * 10) / 10,
    tree: { stage: TREE_STAGES[s.tree.stage].short, rings: s.tree.rings, branches: s.tree.branches.map((b) => branchById(b)?.name ?? b) },
    keeper: {
      rank: k.rank,
      attrs: { ...k.attrs },
      learned: Object.entries(k.learned).filter(([, v]) => v).map(([id]) => id),
      runeRank: { ...k.runeRank },
      forms: { ...k.forms },
      facets: [...k.facets],
      props: Object.fromEntries(Object.entries(k.props).filter(([, v]) => v.length)),
    },
    nests: s.structures.map((n) => ({ family: NESTS[n.family].name, tier: n.tier + 1, spec: n.spec ? NESTS[n.family].specs[n.spec].name : null, merge: n.merge, ascend: n.ascend, slot: n.slotId })),
    dmg: round(st.dmg),
    casts: { ...st.casts },
    killsBy: { ...st.killsBy },
    treeDmgBy: round(st.treeDmgBy),
    keeperDeaths: st.keeperDeaths,
    rushes: st.rushes,
    wrath: +s.wrath.toFixed(2),
    perNight: st.nights,
  };
}

export function loadRunLogs(): RunLog[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RunLog[]) : [];
  } catch {
    return [];
  }
}

export function saveRunLog(log: RunLog) {
  const all = loadRunLogs();
  all.push(log);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-KEEP))); } catch { /* storage full or private mode */ }
}

export function clearRunLogs() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

/** Offer all logs as a JSON file download. */
export function downloadRunLogs() {
  const blob = new Blob([JSON.stringify(loadRunLogs(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `igg-runs-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
