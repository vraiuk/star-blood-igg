import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/data/balance';
import { CAMERA } from '../src/data/camera';
import { WORLDS } from '../src/data/worlds';
import { Camera, type FollowInput, smoothDamp } from '../src/render/camera';

/** IGG2 phase 2: follow camera (docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md §2). */

const DT = 1 / 60;
const M = WORLDS.medium;
const input = (keeperX: number, o: Partial<FollowInput> = {}): FollowInput => ({
  keeperX, worldW: M.width, worldH: WORLD.height, groundY: WORLD.groundY, treeX: M.treeX, day: true, ...o,
});
/** A camera snapped onto a keeper standing at `x` (day, far from the Tree unless asked). */
const at = (x: number) => { const c = new Camera(); c.follow(input(x), DT); return c; };
/** Walk the keeper with velocity `v` for `seconds`, returning the new x. */
const walk = (c: Camera, x: number, v: number, seconds: number, o: Partial<FollowInput> = {}, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) { x += v * DT; c.follow(input(x, o), DT); each?.(); }
  return x;
};

describe('smoothDamp', () => {
  it('converges without passing the target, even with a head start toward it', () => {
    let x = 0, v = 400;
    for (let i = 0; i < 300; i++) {
      [x, v] = smoothDamp(x, 100, v, CAMERA.smoothTime, DT);
      expect(x).toBeLessThanOrEqual(100);
    }
    expect(x).toBeCloseTo(100, 3);
  });
});

describe('follow camera', () => {
  it('stays still while the keeper potters about inside the window', () => {
    const c = at(1000);
    const x0 = c.x;
    const hw = CAMERA.windowHalf * CAMERA.baseWidth;
    // a slow creep to the window edge: only the (small) lookahead of that speed moves the view
    let x = walk(c, 1000, 4, (hw - 4) / 4);
    expect(Math.abs(c.x - x0)).toBeLessThanOrEqual(CAMERA.lookaheadMax * CAMERA.baseWidth * (4 / CAMERA.lookaheadRefSpeed) + 1);
    // a short step back inside the window: the view may lean, then settles where it was
    x = walk(c, x, -60, 0.5);
    walk(c, x, 0, 5);
    expect(Math.abs(c.x - x0)).toBeLessThanOrEqual(1);
  });

  it('follows past the window without overshooting the target', () => {
    const c = at(1000);
    let maxTarget = -Infinity, maxCx = -Infinity;
    const track = () => { maxTarget = Math.max(maxTarget, c.targetX); maxCx = Math.max(maxCx, c.centerX); };
    const x = walk(c, 1000, 90, 3, {}, track);
    walk(c, x, 0, 6, {}, track);
    expect(maxCx).toBeLessThanOrEqual(maxTarget + 0.01);
    // settled: the keeper is inside the window, the camera rests on its target
    expect(Math.abs(c.centerX - c.targetX)).toBeLessThan(0.5);
    expect(Math.abs(x - c.centerX)).toBeLessThanOrEqual(CAMERA.windowHalf * c.viewWidth + 0.5);
  });

  it('builds lookahead with sustained motion, not with a 0.2 s flip', () => {
    const c = at(1000);
    let x = walk(c, 1000, 90, 3);
    const full = c.lookahead;
    expect(full).toBeGreaterThan(CAMERA.lookaheadMax * CAMERA.baseWidth * 0.8);
    // a quick turn: 0.2 s the other way, then on again
    x = walk(c, x, -90, 0.2);
    expect(c.lookahead).toBeGreaterThan(full * 0.6);
    // from rest, a 0.2 s tap barely leans the view
    const d = at(1000);
    walk(d, 1000, 90, 0.2);
    expect(Math.abs(d.lookahead)).toBeLessThan(CAMERA.lookaheadMax * CAMERA.baseWidth * 0.25);
    void x;
  });

  it('never shows beyond the world edges (medium world)', () => {
    const c = at(1600);
    walk(c, 1600, -90, 20, {}, () => { expect(c.x).toBeGreaterThanOrEqual(0); });
    expect(c.x).toBe(0);
    const d = at(1600);
    walk(d, 1600, 90, 20, {}, () => { expect(d.x + d.w).toBeLessThanOrEqual(M.width); });
    expect(d.x + d.w).toBe(M.width);
  });

  it('snaps the view rect to whole pixels with the ground at 66%', () => {
    const c = at(1234.567);
    walk(c, 1234.567, 37.3, 1.3);
    expect(Number.isInteger(c.x) && Number.isInteger(c.y) && Number.isInteger(c.w) && Number.isInteger(c.h)).toBe(true);
    expect(Math.abs(WORLD.groundY - c.y - c.h * CAMERA.groundAt)).toBeLessThanOrEqual(1);
  });

  it('frames the Tree when the keeper idles near it, zooms out a little by day', () => {
    const c = at(M.treeX + 100);
    walk(c, M.treeX + 100, 0, 4);
    expect(c.centerX).toBeLessThan(M.treeX + 100 - 10);
    const z = at(M.treeX + 20);
    walk(z, M.treeX + 20, 0, 4);
    expect(z.viewWidth).toBeGreaterThan(CAMERA.baseWidth * (1 + CAMERA.zoomOut * 0.9));
    // the night start holds the zoom-out away from the Tree too, then lets it go
    const n = at(1000);
    n.nightStarted();
    walk(n, 1000, 0, 1.5, { day: false });
    expect(n.viewWidth).toBeGreaterThan(CAMERA.baseWidth * 1.08);
    walk(n, 1000, 0, 4, { day: false });
    expect(n.viewWidth).toBeLessThan(CAMERA.baseWidth * 1.01);
  });

  it('leans toward a night threat, at most a third of the view', () => {
    const c = at(1000);
    walk(c, 1000, 0, 4, { day: false, threatX: 1000 + 900 });
    const lean = c.centerX - 1000;
    expect(lean).toBeGreaterThan(50);
    expect(lean).toBeLessThanOrEqual(c.viewWidth / 3 + 1);
  });

  it('pulls toward a focus object until it is cleared', () => {
    const c = at(1000);
    c.setFocus(1200);
    walk(c, 1000, 0, 3);
    expect(c.centerX).toBeGreaterThan(1050);
    c.setFocus(null);
    walk(c, 1000, 0, 4);
    expect(Math.abs(c.centerX - 1000)).toBeLessThan(5);
  });

  it('trauma clamps to 1 and decays to 0', () => {
    const c = at(1000);
    c.addTrauma(3);
    expect(c.traumaLevel).toBe(1);
    walk(c, 1000, 0, 0.1);
    expect(Math.abs(c.shakeX) + Math.abs(c.shakeY)).toBeGreaterThan(0);
    walk(c, 1000, 0, 2);
    expect(c.traumaLevel).toBe(0);
    expect(c.shakeX).toBe(0);
    expect(c.shakeY).toBe(0);
  });

  it('free look is limited to 1.5 views and returns when released', () => {
    const c = at(1600);
    c.setFreeLook(true, 1);
    walk(c, 1600, 0, 0.5);
    expect(c.freeOffset).toBeGreaterThan(0);
    walk(c, 1600, 0, 5);
    expect(c.freeOffset).toBeLessThanOrEqual(CAMERA.freeLookMax * c.viewWidth + 1e-6);
    expect(c.centerX - 1600).toBeLessThanOrEqual(CAMERA.freeLookMax * c.viewWidth + c.viewWidth * 0.5);
    c.setFreeLook(false);
    walk(c, 1600, 0, 4);
    expect(Math.abs(c.freeOffset)).toBeLessThan(1);
  });

  it('snaps when the keeper teleports (respawn at the Tree)', () => {
    const c = at(400);
    c.follow(input(M.treeX + 200), DT);
    expect(Math.abs(c.centerX - (M.treeX + 200))).toBeLessThan(1);
  });
});
