import { META_INFINITE, META_NODES, infiniteCost, type MetaNode } from '../data/meta';
import type { ModPatch } from '../data/mods';

const KEY = 'igg-tree-save-v1';

/** Persistent meta-progression (localStorage). */
export interface MetaSave {
  /** Observer's Coins available to spend */
  coins: number;
  /** total ever earned (for display) */
  earned: number;
  /** bought meta-node ids */
  nodes: string[];
  /** best stars per difficulty path */
  bestStars: number[];
  /** highest unlocked path index */
  pathUnlocked: number;
  /** selected path */
  path: number;
  runs: number;
  /** best nights survived per difficulty path */
  bestNight: number[];
  /** levels of the endless «Кольца памяти» */
  rings: Record<string, number>;
}

export function emptySave(): MetaSave {
  return { coins: 0, earned: 0, nodes: [], bestStars: [0, 0, 0], pathUnlocked: 0, path: 0, runs: 0, bestNight: [0, 0, 0], rings: {} };
}

export function loadSave(): MetaSave {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave();
    return { ...emptySave(), ...(JSON.parse(raw) as Partial<MetaSave>) };
  } catch {
    return emptySave();
  }
}

export function writeSave(s: MetaSave) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ }
}

export function nodeById(id: string): MetaNode | undefined { return META_NODES.find((n) => n.id === id); }

export function canBuy(s: MetaSave, n: MetaNode): boolean {
  if (s.nodes.includes(n.id)) return false;
  if (n.requires && !s.nodes.includes(n.requires)) return false;
  return s.coins >= n.cost;
}

export function buyNode(s: MetaSave, id: string): boolean {
  const n = nodeById(id);
  if (!n || !canBuy(s, n)) return false;
  s.coins -= n.cost;
  s.nodes.push(id);
  writeSave(s);
  return true;
}

/** The whole Igg-Tree is awakened: the endless rings open. */
export function treeComplete(s: MetaSave) { return META_NODES.every((n) => s.nodes.includes(n.id)); }

export function buyRing(s: MetaSave, id: string): boolean {
  const n = META_INFINITE.find((x) => x.id === id);
  if (!n || !treeComplete(s)) return false;
  const lvl = s.rings[id] ?? 0;
  const cost = infiniteCost(n, lvl);
  if (s.coins < cost) return false;
  s.coins -= cost;
  s.rings[id] = lvl + 1;
  writeSave(s);
  return true;
}

/** Free full respec (Kingdom Rush style). */
export function respec(s: MetaSave) {
  for (const id of s.nodes) s.coins += nodeById(id)?.cost ?? 0;
  s.nodes = [];
  for (const n of META_INFINITE) {
    for (let l = 0; l < (s.rings[n.id] ?? 0); l++) s.coins += infiniteCost(n, l);
  }
  s.rings = {};
  writeSave(s);
}

export function metaPatches(s: MetaSave): ModPatch[] {
  const out = s.nodes.map((id) => nodeById(id)?.mods).filter((m): m is ModPatch => !!m);
  for (const n of META_INFINITE) { const l = s.rings[n.id] ?? 0; if (l > 0) out.push(n.mods(l)); }
  return out;
}

export function hasStartRune(s: MetaSave) { return s.nodes.includes('r5'); }
