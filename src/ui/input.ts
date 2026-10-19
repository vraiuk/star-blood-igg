/**
 * Held keys of the keyboard (pure, no DOM — tested in tests/igg2-clarity.test.ts).
 *
 * Phase 7 fix: the Keeper once walked on by himself with no key pressed. A key stays «held» when
 * its keyup never matches its keydown. That happens when the layout or a modifier changes the
 * reported `key` between down and up (Alt+D on macOS reports «∂» on keyup), when macOS swallows
 * keyups while ⌘ is held, or when the window loses focus. So every press is also remembered by
 * its physical `code`, a release frees both, letting go of ⌘ frees everything, and the page
 * clears the set on blur / hidden tab / pause (see `main.ts`).
 */
export class HeldKeys {
  private keys = new Set<string>();
  private byCode = new Map<string, string>();

  /** A key went down (`key`: the normalised key name, `code`: the physical key). */
  down(key: string, code?: string) {
    this.keys.add(key);
    if (code) this.byCode.set(code, key);
  }

  /** A key went up: frees its name and whatever went down on the same physical key. */
  up(key: string, code?: string) {
    this.keys.delete(key);
    if (code) {
      const k = this.byCode.get(code);
      if (k !== undefined) this.keys.delete(k);
      this.byCode.delete(code);
    }
    // macOS delivers no keyup for keys released while ⌘ was down
    if (key === 'meta') this.clear();
  }

  /** Is this (normalised) key held? */
  has(key: string) { return this.keys.has(key); }

  /** Let go of everything (blur, hidden tab, pause, a new run). */
  clear() { this.keys.clear(); this.byCode.clear(); }

  /** Number of held keys. */
  get size() { return this.keys.size; }

  /** Walking direction from A/D, the arrows and their Cyrillic twins: −1, 0 or 1. */
  moveDir(): -1 | 0 | 1 {
    const l = this.has('a') || this.has('arrowleft') || this.has('ф');
    const r = this.has('d') || this.has('arrowright') || this.has('в');
    return l === r ? 0 : l ? -1 : 1;
  }
}
