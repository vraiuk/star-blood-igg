import { WORLD } from '../data/balance';

/** Smallest view (start of a run) and the aspect ratio of the screen. */
const MIN_W = 640;
const ASPECT = 9 / 16;
/** Ground line sits at this fraction of the view height. */
const GROUND_AT = 0.66;
/** world px under the ground a phone keeps in view: the deepest root node and the worm lane */
const TIGHT_BELOW = 100;

/**
 * Side-view camera. It frames the Igg-Tree's Circle of light: as the tree grows
 * the view widens from 640×360 to 1120×630 inside a 1440×720 world, so even the Great
 * Igg-Tree's Circle leaves room (and time) before creatures reach the nests.
 */
export class Camera {
  x = 0;
  y = 0;
  w = MIN_W;
  h = MIN_W * ASPECT;
  /** Screen height / width: the phone build fills the whole (wider than 16:9) screen. */
  aspect = ASPECT;

  /** Target width for a given light radius. */
  /** Widest view: beyond this pixels get too small; creatures then walk in from off-screen. */
  static readonly MAX_W = 1240;
  /** A phone frames the Circle tighter (bigger pixels); the edges still leave time to react. */
  static tight = false;
  static widthFor(radius: number) {
    const [min, margin] = Camera.tight ? [540, 300] : [MIN_W, 380];
    return Math.max(min, Math.min(Camera.MAX_W, WORLD.width, radius * 2 + margin));
  }

  /** smoothed height of the Tree's crown above the ground (phone framing) */
  private top = 0;

  /**
   * @param top height of the Tree above the ground; the phone camera keeps the crown in view
   */
  update(radius: number, dt: number, snap = false, top = 0) {
    const tw = Camera.widthFor(radius);
    this.top = snap ? top : this.top + (top - this.top) * Math.min(1, dt * 1.6);
    if (Camera.tight) { this.frameTight(tw, dt, snap); return; }
    this.w = snap ? tw : this.w + (tw - this.w) * Math.min(1, dt * 1.6);
    this.h = this.w * this.aspect;
    this.x = Math.max(0, Math.min(WORLD.width - this.w, WORLD.treeX - this.w / 2));
    this.y = Math.max(0, Math.min(WORLD.height - this.h, WORLD.groundY - this.h * GROUND_AT));
  }

  /**
   * Phone framing: a short wide screen with a big HUD on top and bottom. The view is made
   * tall enough for the whole crown above the ground and the root nodes below it (both clear
   * of the HUD bands), widening past the Circle when the Great Tree needs it.
   */
  private frameTight(tw: number, dt: number, snap: boolean) {
    const HUD_TOP = 0.15, HUD_BOT = 0.17;
    const above = this.top + 14;
    const below = TIGHT_BELOW;
    const free = 1 - HUD_TOP - HUD_BOT;
    const need = Math.min(WORLD.width, Math.max(tw, (above + below) / free / this.aspect));
    this.w = snap ? need : this.w + (need - this.w) * Math.min(1, dt * 1.6);
    this.h = this.w * this.aspect;
    const slack = this.h * free - above - below;
    // spare height goes mostly to the sky; without any, the roots win (the crown tips may hide)
    const y = slack >= 0
      ? WORLD.groundY - this.h * HUD_TOP - above - slack * 0.75
      : WORLD.groundY + below - this.h * (1 - HUD_BOT);
    this.x = Math.max(0, Math.min(WORLD.width - this.w, WORLD.treeX - this.w / 2));
    // the world ends 160 px under the ground: the view may run past it behind the bottom HUD
    // (that strip is drawn as void), so the root nodes still sit above the rune bar
    this.y = Math.max(0, Math.min(WORLD.height - this.h * (1 - HUD_BOT), y));
  }

  /** Screen (CSS px within the stage) → world. */
  toWorld(sx: number, sy: number, screenW: number, screenH: number): [number, number] {
    return [this.x + (sx / screenW) * this.w, this.y + (sy / screenH) * this.h];
  }

  /** World → screen (CSS px within the stage). */
  toScreen(wx: number, wy: number, screenW: number, screenH: number): [number, number] {
    return [((wx - this.x) / this.w) * screenW, ((wy - this.y) / this.h) * screenH];
  }
}
