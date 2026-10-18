/**
 * IGG2 «seen» flags (spec §7): creature cards shown once per save, guide steps done, etc.
 * A flat set of string ids in localStorage; safe when storage is unavailable (kept in memory).
 */
const KEY = 'igg2-seen-v1';

let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    cache = new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function write() {
  try { localStorage.setItem(KEY, JSON.stringify([...load()])); } catch { /* private mode: keep in memory */ }
}

/** Has this flag been set (e.g. `card:worm`, `guide:micro:take`)? */
export function seen(id: string): boolean { return load().has(id); }

/** Set a flag; returns true if it was new (first time). */
export function markSeen(id: string): boolean {
  const s = load();
  if (s.has(id)) return false;
  s.add(id);
  write();
  return true;
}

/** Forget every flag (guide «reset» in the pause menu). */
export function resetSeen() {
  cache = new Set();
  write();
}
