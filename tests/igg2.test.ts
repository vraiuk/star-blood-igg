import { describe, expect, it } from 'vitest';
import { SLOTS, WELL_OFFSETS, WORLD, applyWorld, crownPos } from '../src/data/balance';
import { WORLDS } from '../src/data/worlds';
import { Game } from '../src/sim/game';

/** IGG2 phase 1: worlds as data (docs/superpowers/specs/2026-10-18-igg2-two-crowns-rework-design.md §1, §3). */

const slot = (id: string) => SLOTS.find((s) => s.id === id);
const run = (g: Game, seconds: number) => { for (let i = 0; i < seconds * 60; i++) g.step(); };

describe('applyWorld', () => {
  it('legacy keeps the original slot layout (values captured before the rework)', () => {
    applyWorld(WORLDS.legacy);
    expect(WORLD.width).toBe(1440);
    expect(WORLD.treeX).toBe(720);
    expect(SLOTS.length).toBe(20 + 10 + 11);
    expect(slot('L0')).toEqual({ id: 'L0', x: 678, y: 560, underground: false, offset: 42 });
    expect(slot('R9')).toEqual({ id: 'R9', x: 1140, y: 560, underground: false, offset: 420 });
    expect(slot('C0')).toMatchObject({ x: 684, y: 470, crown: true, unlockStage: 2 });
    expect(slot('C9')).toMatchObject({ x: 704, unlockStage: 6 });
    expect(slot('U0')).toEqual({ id: 'U0', x: 720, y: 613, underground: true, offset: 0, unlockStage: 1 });
    expect(slot('U7')).toMatchObject({ x: 833, y: 623, offset: 113, unlockStage: 4 });
    expect(slot('U10')).toMatchObject({ x: 577, y: 594, offset: 143, unlockStage: 6 });
  });

  it.each(['micro', 'medium'] as const)('%s: surface slots around its tree, no crown, 8 wells', (id) => {
    const def = WORLDS[id];
    applyWorld(def);
    expect(WORLD.width).toBe(def.width);
    expect(WORLD.treeX).toBe(def.treeX);
    expect(SLOTS.some((s) => s.crown)).toBe(false);
    expect(slot('L0')!.x).toBe(def.treeX - 42);
    expect(slot('R9')!.x).toBe(def.treeX + 420);
    const wells = SLOTS.filter((s) => s.underground);
    expect(wells.map((s) => s.id)).toEqual(['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7']);
    expect(wells.every((s) => s.well && s.y > WORLD.groundY)).toBe(true);
    const offsets = wells.map((s) => s.x - def.treeX).sort((a, b) => a - b);
    expect(offsets).toEqual([...WELL_OFFSETS].reverse().map((o) => -o).concat([...WELL_OFFSETS]));
    expect(wells.every((s) => s.offset === Math.abs(s.x - def.treeX))).toBe(true);
    applyWorld(WORLDS.legacy);
  });

  it('crown anchors follow the world (cache cleared)', () => {
    applyWorld(WORLDS.legacy);
    const a = crownPos(2, 0);
    applyWorld(WORLDS.medium);
    const b = crownPos(2, 0);
    expect(b.x - a.x).toBe(WORLDS.medium.treeX - WORLDS.legacy.treeX);
    applyWorld(WORLDS.legacy);
  });

  it('world flags: legacy has everything on; IGG2 worlds are in-world', () => {
    expect(Object.values(WORLDS.legacy.features).filter((v) => v === false)).toEqual([false]); // only inWorld
    expect(WORLDS.legacy.features.inWorld).toBe(false);
    expect(WORLDS.micro.features).toMatchObject({ inWorld: true, autoLoot: false, crown: false, rush: false, meta: false, tablet: false });
    expect(WORLDS.medium.features).toMatchObject({ inWorld: true, rush: true, tablet: true, crown: false, meta: false });
    expect(WORLDS.micro.maxStage).toBe(2);
    expect(WORLDS.medium.maxStage).toBe(5);
  });
});

describe('Game and worlds', () => {
  it('a legacy Game after a medium Game gets the legacy world back', () => {
    const m = new Game({ seed: 3, world: 'medium' });
    expect(m.world.id).toBe('medium');
    expect(WORLD.width).toBe(3200);
    expect(m.state.keeper.x).toBe(1600 - 28);
    const g = new Game({ seed: 3 });
    expect(g.world.id).toBe('legacy');
    expect(WORLD.width).toBe(1440);
    expect(WORLD.treeX).toBe(720);
    expect(slot('C0')).toBeDefined();
    expect(g.state.keeper.x).toBe(720 - 28);
  });

  it('wells unlock by Circle radius, not by stage', () => {
    const g = new Game({ seed: 1, world: 'micro' });
    const r = g.treeRadius();
    for (const s of SLOTS.filter((x) => x.well)) expect(g.slotUnlocked(s)).toBe(s.offset <= r - 14);
    expect(g.slotUnlocked(slot('U0')!)).toBe(false); // seed Circle 72: 60 > 72 − 14
    g.state.tree.stage = 1; // Circle 112
    expect(['U0', 'U1', 'U2', 'U3'].every((id) => g.slotUnlocked(slot(id)!))).toBe(true);
    expect(g.slotUnlocked(slot('U4')!)).toBe(false); // 138 > 112 − 14
  });

  it('micro stops growing at its max stage', () => {
    const g = new Game({ seed: 1, world: 'micro' });
    g.state.tree.stage = 2;
    expect(g.growNeed()).toBe(0);
  });

  it('a medium Game runs 60 s of night and spawns creatures at its own edges', () => {
    const g = new Game({ seed: 5, world: 'medium' });
    while (g.choice) g.choose(0);
    g.callNight();
    const xs: number[] = [];
    for (let i = 0; i < 60 * 60; i++) {
      g.step();
      for (const e of g.state.enemies) xs.push(e.x);
      g.drainEvents();
    }
    expect(xs.length).toBeGreaterThan(0);
    // creatures appear at the edges of the 3200-wide world and walk in towards x = 1600
    expect(Math.max(...xs)).toBeGreaterThan(3000);
    expect(Math.min(...xs)).toBeLessThan(200);
  });

  it('snapshot / restore keeps the world', () => {
    const m = new Game({ seed: 9, world: 'medium' });
    run(m, 2);
    const json = m.snapshot();
    new Game({ seed: 1 }); // something else re-applied legacy in between
    expect(WORLD.width).toBe(1440);
    const r = new Game({ seed: 1 });
    expect(r.restore(json)).toBe(true);
    expect(r.world.id).toBe('medium');
    expect(WORLD.width).toBe(3200);
    expect(WORLD.treeX).toBe(1600);
    expect(SLOTS.some((s) => s.crown)).toBe(false);
    // an old (pre-IGG2) snapshot without a world id restores as legacy
    const old = JSON.parse(new Game({ seed: 2 }).snapshot()) as Record<string, unknown>;
    delete old.world;
    const o = new Game({ seed: 2, world: 'micro' });
    expect(o.restore(JSON.stringify(old))).toBe(true);
    expect(o.world.id).toBe('legacy');
    expect(WORLD.width).toBe(1440);
  });

  it('IGG2 worlds start with their Treasury', () => {
    expect(new Game({ seed: 1, world: 'micro' }).state.amber).toBe(40);
    expect(new Game({ seed: 1, world: 'medium' }).state.amber).toBe(60);
    expect(new Game({ seed: 1 }).state.amber).toBe(90);
  });
});
