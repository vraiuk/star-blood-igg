import { WORLD } from '../data/balance';

/** Smallest view (start of a run) and the aspect ratio of the screen. */
const MIN_W = 640;
const ASPECT = 9 / 16;
/** Ground line sits at this fraction of the view height. */
const GROUND_AT = 0.66;

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

  /** Target width for a given light radius. */
  /** Widest view: beyond this pixels get too small; creatures then walk in from off-screen. */
  static readonly MAX_W = 1240;
  static widthFor(radius: number) {
    return Math.max(MIN_W, Math.min(Camera.MAX_W, WORLD.width, radius * 2 + 380));
  }

  update(radius: number, dt: number, snap = false) {
    const tw = Camera.widthFor(radius);
    this.w = snap ? tw : this.w + (tw - this.w) * Math.min(1, dt * 1.6);
    this.h = this.w * ASPECT;
    this.x = Math.max(0, Math.min(WORLD.width - this.w, WORLD.treeX - this.w / 2));
    this.y = Math.max(0, Math.min(WORLD.height - this.h, WORLD.groundY - this.h * GROUND_AT));
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
