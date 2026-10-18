/**
 * Follow-camera tuning for worlds with `features.inWorld` (spec §2, IGG2 rework).
 * The legacy world keeps its old tree-centred camera and never reads these numbers.
 * Distances given as a share are fractions of the current view width.
 */
export const CAMERA = {
  /** view width at rest, world px (height follows at 16:9) */
  baseWidth: 720,
  /** screen aspect: height = width × aspect */
  aspect: 9 / 16,
  /** the ground line sits at this fraction of the view height */
  groundAt: 0.66,

  /** dead-zone window: half-width as a share of the view width (±7.5%) */
  windowHalf: 0.075,
  /** SmoothDamp time toward the target, s */
  smoothTime: 0.35,
  /** SmoothDamp speed cap, world px/s (far above the keeper's speed) */
  maxSpeed: 4000,
  /** keeper jumps farther than this in one frame (respawn) → the camera snaps */
  teleport: 240,

  /** lookahead: max share of the view width, reached at `lookaheadRefSpeed` */
  lookaheadMax: 0.2,
  /** smoothed keeper speed giving the full lookahead, px/s (≈ keeper speed) */
  lookaheadRefSpeed: 90,
  /** time constant of the keeper-velocity low-pass filter, s */
  velocityTau: 0.45,
  /** SmoothDamp time of the lookahead offset itself, s */
  lookaheadSmooth: 0.6,

  /** below this speed (px/s) the keeper counts as standing */
  idleSpeed: 5,
  /** tree attractor: keeper idle within this distance of the trunk (px) */
  treeAttractRadius: 120,
  /** tree attractor: share of the keeper→tree gap the view centre moves */
  treeAttractStrength: 0.5,
  /** focus attractor (the object being poured into): share of the keeper→focus gap */
  focusAttractStrength: 0.5,
  /** night threat bias: share of the keeper→threat gap … */
  threatStrength: 0.5,
  /** … capped at this share of the view width */
  threatMax: 1 / 3,
  /** threats farther than this many view widths from the keeper are ignored */
  threatRange: 1.5,
  /** SmoothDamp time of the summed attractor offset, s */
  attractSmooth: 0.6,

  /** zoom-out when the keeper stands by the Tree by day, and at night start */
  zoomOut: 0.12,
  /** keeper within this distance of the trunk (px) for the day zoom-out */
  zoomTreeRadius: 60,
  /** zoom-out held for this long after a nightStart, s */
  zoomNightHold: 2,
  /** easing rate of the zoom factor (per second, exponential) */
  zoomRate: 2.5,

  /** free look (Shift + A/D): max offset in view widths */
  freeLookMax: 1.5,
  /** free look pan speed, view widths per second */
  freeLookSpeed: 1.2,
  /** SmoothDamp time of the return when Shift is released, s */
  freeLookReturn: 0.4,

  /** trauma lost per second (trauma is 0..1) */
  traumaDecay: 1.4,
  /** shake amplitude at trauma 1, world px (amplitude ∝ trauma²) */
  maxShake: 10,
  /** shake noise frequency, Hz-ish */
  shakeFreq: 18,
  /** legacy shake strength N (px) → trauma: trauma += N × this */
  shakeToTrauma: 1 / 18,
} as const;

/** Parallax: how much each backdrop layer follows the camera (0 = fixed to the ground, 1 = fixed to the screen). */
export const PARALLAX = { sky: 0.8, far: 0.5, mid: 0.25 } as const;
