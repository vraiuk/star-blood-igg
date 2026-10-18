import { WORLD } from '../data/balance';
import { CAMERA } from '../data/camera';

/** Smallest view (start of a run) and the aspect ratio of the screen. */
const MIN_W = 640;
const ASPECT = 9 / 16;
/** Ground line sits at this fraction of the view height. */
const GROUND_AT = 0.66;

/** What the follow camera needs from the world each frame (no DOM, no sim types: testable). */
export interface FollowInput {
  /** keeper position, world px */
  keeperX: number;
  /** world geometry */
  worldW: number;
  worldH: number;
  groundY: number;
  treeX: number;
  /** day phase (zoom-out by the Tree, no threat bias) */
  day: boolean;
  /** x of the nearest active threat at night (null/undefined = none) */
  threatX?: number | null;
}

/**
 * Unity-style SmoothDamp: a critically damped spring from `current` toward `target`
 * that never overshoots. Returns the new value and velocity.
 */
export function smoothDamp(current: number, target: number, velocity: number, smoothTime: number, dt: number, maxSpeed = Infinity): [number, number] {
  if (dt <= 0) return [current, velocity];
  const st = Math.max(0.0001, smoothTime);
  const omega = 2 / st;
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const originalTo = target;
  const maxChange = maxSpeed * st;
  const change = Math.max(-maxChange, Math.min(maxChange, current - target));
  const to = current - change;
  const temp = (velocity + omega * change) * dt;
  let vel = (velocity - omega * temp) * exp;
  let out = to + (change + temp) * exp;
  // never pass the target
  if (originalTo - current > 0 === out > originalTo) {
    out = originalTo;
    vel = 0;
  }
  return [out, vel];
}

/** Smooth 1-D noise in about [-1, 1] (a sum of incommensurate sines). */
export function shakeNoise(t: number, seed: number) {
  return (Math.sin(t + seed) + 0.6 * Math.sin(t * 2.31 + seed * 1.7 + 1.3) + 0.3 * Math.sin(t * 4.17 + seed * 2.9 + 2.1)) / 1.9;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Side-view camera.
 *
 * - **legacy** (`update`): frames the Igg-Tree's Circle of light — as the tree grows the view
 *   widens from 640×360 to 1240 wide, always centred on the Tree.
 * - **follow** (`follow`, worlds with `features.inWorld`, spec §2): follows the keeper with a
 *   dead-zone window, a SmoothDamp catch-up, velocity lookahead, attractors (Tree, focus object,
 *   night threat), soft world bounds, a +12% zoom-out hint, Shift free look and trauma shake.
 *   The view rect `x/y/w/h` is snapped to whole world pixels.
 */
export class Camera {
  x = 0;
  y = 0;
  w = MIN_W;
  h = MIN_W * ASPECT;

  /** follow mode: shake offset this frame, world px (0 in legacy) */
  shakeX = 0;
  shakeY = 0;

  /** follow state (floats; `x/y/w/h` are the snapped view) */
  private cx = 0;
  private cv = 0;
  private goal = 0;
  private fw: number = CAMERA.baseWidth;
  private lastKeeperX = NaN;
  private vel = 0;
  private look = 0;
  private lookV = 0;
  private attract = 0;
  private attractV = 0;
  private free = 0;
  private freeV = 0;
  private freeActive = false;
  private freePan: -1 | 0 | 1 = 0;
  private zoom = 0;
  private nightHold = 0;
  private trauma = 0;
  private t = 0;
  private focusX: number | null = null;
  private snapNext = true;
  private target = 0;

  /** Target width for a given light radius. */
  /** Widest view: beyond this pixels get too small; creatures then walk in from off-screen. */
  static readonly MAX_W = 1240;
  static widthFor(radius: number) {
    return Math.max(MIN_W, Math.min(Camera.MAX_W, WORLD.width, radius * 2 + 380));
  }

  /** Legacy camera: centred on the Tree, width eased by the light radius. */
  update(radius: number, dt: number, snap = false) {
    const tw = Camera.widthFor(radius);
    this.w = snap ? tw : this.w + (tw - this.w) * Math.min(1, dt * 1.6);
    this.h = this.w * ASPECT;
    this.x = Math.max(0, Math.min(WORLD.width - this.w, WORLD.treeX - this.w / 2));
    this.y = Math.max(0, Math.min(WORLD.height - this.h, WORLD.groundY - this.h * GROUND_AT));
    this.shakeX = this.shakeY = 0;
  }

  // ── follow-mode API (later phases use these) ──────────────────────

  /** The next `follow` snaps onto the keeper (new run, restore, respawn far away). */
  snap() { this.snapNext = true; }

  /** Pull the view toward an object (the interactable being poured into); null clears it. */
  setFocus(x: number | null) { this.focusX = x; }

  /** Free look: while `active`, `pan` (−1/0/1) moves the view; released → smooth return. */
  setFreeLook(active: boolean, pan: -1 | 0 | 1 = 0) {
    this.freeActive = active;
    this.freePan = active ? pan : 0;
  }

  /** Add shake trauma (0..1, clamped). The shake amplitude grows with trauma². */
  addTrauma(t: number) { this.trauma = clamp(this.trauma + t, 0, 1); }

  /** The night began: hold the zoom-out for a moment so the player sees both sides. */
  nightStarted() { this.nightHold = CAMERA.zoomNightHold; }

  /** Current trauma, 0..1. */
  get traumaLevel() { return this.trauma; }
  /** Unsnapped view centre, world px. */
  get centerX() { return this.cx; }
  /** Current lookahead offset, world px. */
  get lookahead() { return this.look; }
  /** Current free-look offset, world px. */
  get freeOffset() { return this.free; }
  /** Smoothed keeper velocity, px/s. */
  get keeperVelocity() { return this.vel; }
  /** Where the view centre is heading this frame (bounds applied), world px. */
  get targetX() { return this.target; }
  /** Unsnapped view width, world px. */
  get viewWidth() { return this.fw; }

  /** Follow camera step (worlds with `features.inWorld`). */
  follow(inp: FollowInput, dt: number) {
    const C = CAMERA;
    const W = inp.worldW;
    const zoomWanted = (inp.day && Math.abs(this.vel) < C.idleSpeed && Math.abs(inp.keeperX - inp.treeX) < C.zoomTreeRadius) || this.nightHold > 0;
    if (this.snapNext || !Number.isFinite(this.lastKeeperX) || Math.abs(inp.keeperX - this.lastKeeperX) > C.teleport) {
      this.snapNext = false;
      this.vel = 0;
      this.look = this.lookV = this.attract = this.attractV = this.free = this.freeV = this.cv = 0;
      this.goal = inp.keeperX;
      this.zoom = zoomWanted ? 1 : 0;
      this.fw = Math.min(W, C.baseWidth * (1 + C.zoomOut * this.zoom));
      this.cx = clamp(inp.keeperX, this.fw / 2, W - this.fw / 2);
      this.lastKeeperX = inp.keeperX;
      this.target = this.cx;
    } else if (dt > 0) {
      // keeper velocity, low-passed: a quick turn barely moves it
      const raw = (inp.keeperX - this.lastKeeperX) / dt;
      this.lastKeeperX = inp.keeperX;
      this.vel += (raw - this.vel) * (1 - Math.exp(-dt / C.velocityTau));
      // zoom hint
      this.nightHold = Math.max(0, this.nightHold - dt);
      this.zoom += ((zoomWanted ? 1 : 0) - this.zoom) * (1 - Math.exp(-dt * C.zoomRate));
      this.fw = Math.min(W, C.baseWidth * (1 + C.zoomOut * this.zoom));
      const fw = this.fw;
      // dead-zone window around the goal
      const hw = C.windowHalf * fw;
      if (inp.keeperX > this.goal + hw) this.goal = inp.keeperX - hw;
      else if (inp.keeperX < this.goal - hw) this.goal = inp.keeperX + hw;
      // lookahead from the smoothed velocity
      const lookTarget = C.lookaheadMax * fw * clamp(this.vel / C.lookaheadRefSpeed, -1, 1);
      [this.look, this.lookV] = smoothDamp(this.look, lookTarget, this.lookV, C.lookaheadSmooth, dt);
      // attractors
      let at = 0;
      const idle = Math.abs(this.vel) < C.idleSpeed;
      if (this.focusX !== null) at += (this.focusX - this.goal) * C.focusAttractStrength;
      else if (idle && Math.abs(inp.keeperX - inp.treeX) < C.treeAttractRadius) at += (inp.treeX - this.goal) * C.treeAttractStrength;
      if (!inp.day && inp.threatX != null && Math.abs(inp.threatX - inp.keeperX) < C.threatRange * fw) {
        at += clamp((inp.threatX - inp.keeperX) * C.threatStrength, -C.threatMax * fw, C.threatMax * fw);
      }
      [this.attract, this.attractV] = smoothDamp(this.attract, at, this.attractV, C.attractSmooth, dt);
      // free look, never past what the world bounds can show
      const base = this.goal + this.look + this.attract;
      const lo = fw / 2, hi = W - fw / 2;
      if (this.freeActive) {
        this.free += this.freePan * C.freeLookSpeed * fw * dt;
        this.freeV = 0;
      } else {
        [this.free, this.freeV] = smoothDamp(this.free, 0, this.freeV, C.freeLookReturn, dt);
      }
      this.free = clamp(this.free, -C.freeLookMax * fw, C.freeLookMax * fw);
      if (lo <= hi) this.free = clamp(this.free, Math.min(0, lo - base), Math.max(0, hi - base));
      // soft bounds: clamp the target, SmoothDamp toward it
      const target = lo <= hi ? clamp(base + this.free, lo, hi) : W / 2;
      this.target = target;
      [this.cx, this.cv] = smoothDamp(this.cx, target, this.cv, C.smoothTime, dt, C.maxSpeed);
      // trauma shake
      this.trauma = Math.max(0, this.trauma - C.traumaDecay * dt);
      this.t += dt;
    }
    const fw = this.fw;
    this.cx = fw >= W ? W / 2 : clamp(this.cx, fw / 2, W - fw / 2);
    // pixel snap: the view rect is whole world pixels
    this.w = Math.min(W, Math.round(fw));
    this.h = Math.min(inp.worldH, Math.round(this.w * C.aspect));
    this.x = clamp(Math.round(this.cx - this.w / 2), 0, W - this.w);
    this.y = clamp(Math.round(inp.groundY - this.h * C.groundAt), 0, inp.worldH - this.h);
    const amp = C.maxShake * this.trauma * this.trauma;
    this.shakeX = amp * shakeNoise(this.t * C.shakeFreq, 0);
    this.shakeY = amp * shakeNoise(this.t * C.shakeFreq, 7.3);
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
