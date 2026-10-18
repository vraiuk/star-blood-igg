import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/data/balance';
import { BASE_TIERS, SELL_REFUND } from '../src/data/nests';
import { INWORLD } from '../src/data/worlds';
import { Game } from '../src/sim/game';

/** IGG2 phase 3: the in-world core — purse, Treasury, pour verb, focus objects (spec §3). */

const steps = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };
const micro = (seed = 1) => new Game({ seed, world: 'micro' });
const at = (g: Game, dx: number, dir: 1 | -1 = 1) => { g.state.keeper.x = WORLD.treeX + dx; g.state.keeper.dir = dir; };
/** hold S until one action is done (or `seconds` pass), topping the purse up whenever it runs low */
const pourTopped = (g: Game, seconds: number) => {
  g.setPour(true);
  for (let i = 0; i < Math.round(seconds * 60) && g.state.interact.pour; i++) {
    if (g.state.keeper.purse < 2) g.state.keeper.purse = g.purseCap();
    g.step();
  }
  g.setPour(false);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priv = (g: Game) => g as any;
const dropsTotal = (g: Game) => g.state.drops.filter((d) => d.kind === 'amber').reduce((a, d) => a + d.value, 0);

describe('focus', () => {
  it('trunk objects and slots are found by the nearest within reach', () => {
    const g = micro();
    at(g, INWORLD.treasury); expect(g.focus()?.kind).toBe('treasury');
    at(g, 0); expect(g.focus()?.kind).toBe('altar');
    at(g, -42); expect(g.focus()).toMatchObject({ kind: 'slot', id: 'slot:L0' });
    at(g, 42); expect(g.focus()).toMatchObject({ kind: 'slot', id: 'slot:R0' });
    at(g, 22); expect(g.focus()).toBeNull(); // micro has no Tablet stone
    at(g, 200); expect(g.focus()).toBeNull();
    const m = new Game({ seed: 1, world: 'medium' });
    at(m, INWORLD.stone); expect(m.focus()).toMatchObject({ kind: 'stone', canAct: false });
  });

  it('trunk objects are never shadowed by L0/R0 (reach keeps them apart)', () => {
    const g = micro();
    const objs: Array<[string, number]> = [['slot', -42], ['treasury', INWORLD.treasury], ['altar', INWORLD.altar]];
    for (let dx = -50; dx <= 0; dx++) {
      at(g, dx);
      const d = objs.map(([k, x]) => [k, Math.abs(dx - x)] as const).filter(([, v]) => v <= INWORLD.reach).sort((a, b) => a[1] - b[1]);
      if (d.length === 0) { expect(g.focus()).toBeNull(); continue; }
      if (d.length > 1 && d[0][1] === d[1][1]) continue; // ties: next test
      expect(g.focus()!.kind).toBe(d[0][0]);
    }
    at(g, -12); expect(g.focus()!.kind).toBe('treasury');
    at(g, -10); expect(g.focus()!.kind).toBe('altar');
  });

  it('a tie goes to the object the Keeper faces', () => {
    const g = micro();
    at(g, -32, -1); expect(g.focus()!.kind).toBe('slot');
    at(g, -32, 1); expect(g.focus()!.kind).toBe('treasury');
    at(g, -11, -1); expect(g.focus()!.kind).toBe('treasury'); // 11 to the hollow, 11 to the altar
    at(g, -11, 1); expect(g.focus()!.kind).toBe('altar');
  });

  it('surface options are the open families (no spider), hive by default; wells offer the spider', () => {
    const g = micro();
    at(g, -42);
    const f = g.focus()!;
    expect(f.options.map((o) => o.id)).toEqual(['hive', 'beetle']);
    expect(f.options[f.optionIndex].id).toBe('hive');
    expect(f.price).toBe(g.buildPrice('hive').amber);
    g.state.tree.stage = 1; // caterpillar opens at stage 1; wells at Circle 112
    g.state.tree.radius = g.treeRadius();
    expect(g.focus()!.options.map((o) => o.id)).toEqual(['hive', 'beetle', 'caterpillar']);
    at(g, -60);
    expect(g.focus()).toMatchObject({ kind: 'well', id: 'slot:U0' });
    expect(g.focus()!.options.map((o) => o.id)).toEqual(['spider']);
  });
});

describe('purse and Treasury', () => {
  it('W at the hollow fills the purse up to its cap; S hands it back', () => {
    const g = micro();
    at(g, INWORLD.treasury);
    expect(g.purseCap()).toBe(30);
    g.setTake(true);
    steps(g, 3);
    g.setTake(false);
    expect(g.purse).toBe(30);
    expect(g.state.amber).toBe(10);
    g.setPour(true);
    steps(g, 0.5);
    g.setPour(false);
    expect(g.purse).toBeLessThan(30);
    expect(g.purse + g.state.amber).toBe(40);
  });

  it('the pour rate starts at 8/s and ramps to 60/s over 2 s', () => {
    const g = micro();
    at(g, INWORLD.treasury);
    g.state.keeper.purse = 30;
    g.state.amber = 0;
    g.setPour(true);
    steps(g, 1);
    const first = g.state.amber;
    expect(first).toBeGreaterThanOrEqual(20); // 1 + ∫(8 + 26t) over 1 s = 22
    expect(first).toBeLessThanOrEqual(23);
    expect(g.drainEvents().some((e) => e.type === 'pour')).toBe(true);
  });

  it('the magnet stops at a full purse: the drop stays; partial room takes part of it', () => {
    const g = micro();
    at(g, -150);
    g.state.keeper.purse = 30;
    g.dropAt(g.state.keeper.x + 5, 'amber', 3);
    steps(g, 1);
    expect(g.state.drops.length).toBe(1);
    expect(g.purse).toBe(30);
    g.state.keeper.purse = 29;
    steps(g, 1);
    expect(g.purse).toBe(30);
    expect(g.state.drops.length).toBe(1);
    expect(g.state.drops[0].value).toBe(2);
    g.state.keeper.purse = 0;
    steps(g, 1);
    expect(g.purse).toBe(2);
    expect(g.state.drops.length).toBe(0);
    expect(g.state.amber).toBe(40); // nothing goes to the Treasury by itself
  });

  it('no auto-flight: a drop in the light stays put until someone takes it', () => {
    const g = micro();
    at(g, -300);
    g.dropAt(WORLD.treeX + 40, 'amber', 5);
    steps(g, 10);
    expect(g.state.drops.length).toBe(1);
    expect(g.state.drops[0].x).toBe(WORLD.treeX + 40);
    expect(g.state.drops[0].mode).not.toBe(2);
    expect(g.state.amber).toBe(40);
    // legacy: the same drop flies to the Tree
    const l = new Game({ seed: 1 });
    l.state.keeper.x = WORLD.treeX - 300;
    const a0 = l.state.amber;
    l.dropAt(WORLD.treeX + 40, 'amber', 5);
    steps(l, 10);
    expect(l.state.amber).toBe(a0 + 5);
  });
});

describe('pour: pledges and prepaid actions', () => {
  it('a partial pledge stays across releases and option changes', () => {
    const g = micro();
    at(g, -42);
    g.state.keeper.purse = 20;
    g.setPour(true);
    steps(g, 0.5);
    g.setPour(false);
    const p = g.state.pledges['slot:L0'];
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(20);
    expect(g.purse).toBe(20 - p);
    steps(g, 2);
    expect(g.state.pledges['slot:L0']).toBe(p);
    g.cycleOption(1);
    expect(g.focus()!.options[g.focus()!.optionIndex].id).toBe('beetle');
    expect(g.focus()!.pledged).toBe(p);
    g.cycleOption(-1);
    expect(g.focus()!.options[g.focus()!.optionIndex].id).toBe('hive');
    g.cycleOption(-1); // wraps
    expect(g.focus()!.options[g.focus()!.optionIndex].id).toBe('beetle');
  });

  it('a steady pour never says the purse is empty between drops (regression)', () => {
    const g = micro();
    at(g, -42);
    g.state.keeper.purse = 30;
    g.setPour(true);
    steps(g, 1);
    g.setPour(false);
    at(g, INWORLD.treasury);
    g.state.keeper.purse = 0;
    g.setTake(true);
    steps(g, 0.5);
    g.setTake(false);
    expect(g.drainEvents().filter((e) => e.type === 'denied')).toEqual([]);
  });

  it('a fulfilled pledge builds the nest without touching the Treasury', () => {
    const g = micro();
    at(g, -42);
    const price = g.buildPrice('hive').amber;
    expect(price).toBeGreaterThan(g.purseCap()); // 40 > 30: two trips
    g.state.keeper.purse = 30;
    g.setPour(true);
    steps(g, 3);
    g.setPour(false);
    expect(g.state.pledges['slot:L0']).toBe(30);
    expect(g.structureAt('L0')).toBeUndefined();
    g.state.keeper.purse = 15;
    g.setPour(true);
    steps(g, 2);
    g.setPour(false);
    const st = g.structureAt('L0')!;
    expect(st.family).toBe('hive');
    expect(st.spentAmber).toBe(price);
    expect(g.purse).toBe(5);
    expect(g.state.amber).toBe(40);
    expect(g.state.pledges['slot:L0']).toBeUndefined();
    expect(g.focus()).toMatchObject({ kind: 'nest', id: `nest:${st.id}` });
  });

  it('upgrade, then the A/B fork chosen with Q/E', () => {
    // the fork exists in the medium world from stage 2 (micro has no specializations — phase 4)
    const g = new Game({ seed: 1, world: 'medium' });
    g.state.tree.stage = 2;
    g.state.amber = 500;
    g.state.star = 50;
    expect(g.build('L0', 'hive')).toBe(true);
    const st = g.structureAt('L0')!;
    at(g, -42);
    const amber0 = g.state.amber;
    pourTopped(g, 4);
    expect(st.tier).toBe(1);
    expect(st.tier).toBe(BASE_TIERS - 1);
    const f = g.focus()!;
    expect(f.options.map((o) => o.id)).toEqual(['A', 'B']);
    g.cycleOption(1);
    pourTopped(g, 6);
    expect(st.tier).toBe(BASE_TIERS);
    expect(st.spec).toBe('B');
    expect(g.state.amber).toBe(amber0);
    expect(g.state.star).toBe(50 - g.specPrice(st, 'B').star);
  });

  it('the fork waits for Star Blood (no pouring without it)', () => {
    const g = new Game({ seed: 1, world: 'medium' });
    g.state.tree.stage = 2;
    g.state.amber = 500;
    g.build('L0', 'hive');
    g.upgrade(g.structureAt('L0')!.id);
    g.state.star = 0;
    at(g, -42);
    expect(g.focus()!.canAct).toBe(false);
    g.state.keeper.purse = 30;
    g.setPour(true); steps(g, 1); g.setPour(false);
    expect(g.purse).toBe(30);
  });

  it('the altar takes the purse first, then the Treasury, and grows the Tree', () => {
    const g = micro();
    at(g, 0);
    g.state.keeper.purse = 10;
    g.state.amber = 100;
    const need = g.growCost();
    expect(g.focus()).toMatchObject({ kind: 'altar', price: need, pledged: 0 });
    g.setPour(true);
    steps(g, 0.5);
    expect(g.purse).toBeLessThan(10);
    expect(g.state.amber).toBe(100);
    steps(g, 4);
    g.setPour(false);
    expect(g.state.tree.stage).toBe(1);
    expect(g.purse).toBe(0);
    expect(g.state.amber).toBe(100 - (need - 10));
    expect(g.state.tree.growth).toBe(0);
  });

  it('the altar at the world limit says so and takes nothing', () => {
    const g = micro();
    g.state.tree.stage = 2;
    at(g, 0);
    const f = g.focus()!;
    expect(f.canAct).toBe(false);
    expect(f.role).toContain('предела');
    g.state.keeper.purse = 20;
    g.setPour(true); steps(g, 1); g.setPour(false);
    expect(g.purse).toBe(20);
  });

  it('hold X 1.5 s sells a nest: 60% and its pledge fall out as drops', () => {
    const g = micro();
    g.build('L0', 'hive');
    const st = g.structureAt('L0')!;
    at(g, -42);
    g.state.keeper.purse = 6;
    g.setPour(true); steps(g, 0.3); g.setPour(false);
    const pledge = g.state.pledges[`nest:${st.id}`];
    expect(pledge).toBeGreaterThan(0);
    const purse0 = g.purse;
    g.setSell(true);
    steps(g, 1.4);
    expect(g.structureAt('L0')).toBeDefined();
    g.state.keeper.x = WORLD.treeX - 42; // stay
    steps(g, 0.15);
    g.setSell(false);
    expect(g.structureAt('L0')).toBeUndefined();
    at(g, -400);
    steps(g, 1 / 60);
    // the refund and the pledge fall out at the nest (what the magnet already took is in the purse)
    expect(dropsTotal(g) + g.purse - purse0).toBe(Math.floor(st.spentAmber * SELL_REFUND) + pledge);
    expect(dropsTotal(g)).toBeGreaterThan(0);
    expect(g.state.pledges[`nest:${st.id}`]).toBeUndefined();
    expect(g.state.amber).toBe(0);
  });
});

describe('workers, dawn, keeper', () => {
  it('caterpillars crawl out of a surface cocoon and carry loot to the Treasury', () => {
    const g = micro();
    g.state.tree.stage = 1;
    g.state.amber = 200;
    expect(g.build('R0', 'caterpillar')).toBe(true);
    const nest = g.structureAt('R0')!;
    expect(nest.crown).toBe(false);
    at(g, -400);
    steps(g, 1 / 60);
    expect(g.state.workers.length).toBeGreaterThan(0);
    expect(g.state.workers.every((w) => Math.abs(w.x - nest.x) < 2 && w.descend === 0)).toBe(true);
    const a0 = g.state.amber;
    g.dropAt(WORLD.treeX + 100, 'amber', 6);
    steps(g, 20);
    expect(g.state.amber).toBe(a0 + 6);
    expect(g.purse).toBe(0);
  });

  it('dawn income goes to the Treasury', () => {
    const g = micro();
    g.state.tree.stage = 1;
    g.callNight();
    g.state.pending = [];
    g.state.enemies = [];
    const a0 = g.state.amber;
    steps(g, 1 / 60);
    const dawn = g.drainEvents().find((e) => e.type === 'dawn');
    expect(dawn).toMatchObject({ gift: 25 + 15 });
    expect(g.state.amber).toBe(a0 + 40);
  });

  it('a hit knocks 2 Amber out of the purse as drops that can be picked up again', () => {
    const g = micro();
    at(g, -150);
    g.state.keeper.purse = 10;
    priv(g).damageKeeper(1);
    expect(g.purse).toBe(8);
    expect(dropsTotal(g)).toBe(2);
    expect(g.drainEvents().some((e) => e.type === 'knock')).toBe(true);
    steps(g, 0.5);
    expect(g.purse).toBe(8); // locked for a moment
    steps(g, 2);
    expect(g.purse).toBe(10);
  });

  it('death spills the whole purse; the Keeper rises at the Tree after 8 s, no revive', () => {
    const g = micro();
    g.callNight();
    at(g, -150);
    g.state.keeper.purse = 12;
    priv(g).damageKeeper(1e9);
    expect(g.state.keeper.alive).toBe(false);
    expect(g.purse).toBe(0);
    expect(dropsTotal(g)).toBe(12);
    expect(g.revive('amber')).toBe(false);
    steps(g, INWORLD.respawn - 0.2);
    expect(g.state.keeper.alive).toBe(false);
    steps(g, 0.4);
    expect(g.state.keeper.alive).toBe(true);
    expect(g.state.keeper.x).toBe(WORLD.treeX);
    expect(g.state.star).toBe(0);
  });

  it('legacy-only systems are off in the world', () => {
    const g = micro();
    g.state.star = 10;
    expect(g.exchange('sellStar', 1)).toBe(false);
    g.callNight();
    expect(g.sacrificeKeeper()).toBe(false);
    expect(g.castAhead('spear')).toBe(true);
    expect(g.drainEvents().find((e) => e.type === 'cast')).toMatchObject({ tx: g.state.keeper.x + g.state.keeper.dir * INWORLD.castAhead });
  });
});

describe('save and determinism', () => {
  it('snapshot / restore keeps the purse, pledges and chosen options', () => {
    const g = micro();
    at(g, -42);
    g.state.keeper.purse = 20;
    g.cycleOption(1);
    g.setPour(true); steps(g, 0.5); g.setPour(false);
    const json = g.snapshot();
    const r = new Game({ seed: 2 });
    expect(r.restore(json)).toBe(true);
    expect(r.purse).toBe(g.purse);
    expect(r.state.pledges).toEqual(g.state.pledges);
    expect(r.focus()!.options[r.focus()!.optionIndex].id).toBe('beetle');
  });

  it('a scripted in-world run is deterministic', () => {
    const script = () => {
      const g = micro(7);
      const log: string[] = [];
      const hold = (fn: () => void, off: () => void, s: number) => { fn(); steps(g, s); off(); };
      g.setMove(-1); steps(g, 0.0); g.setMove(0);
      at(g, INWORLD.treasury);
      hold(() => g.setTake(true), () => g.setTake(false), 2);
      g.setMove(-1); while (g.state.keeper.x > WORLD.treeX - 42) g.step(); g.setMove(0);
      hold(() => g.setPour(true), () => g.setPour(false), 2);
      g.callNight();
      for (let i = 0; i < 90 * 60; i++) {
        if (i % 600 === 0) g.setMove(i % 1200 === 0 ? 1 : -1);
        if (i % 400 === 0) g.castAhead('spear');
        g.step();
        for (const e of g.drainEvents()) log.push(e.type);
      }
      return { snap: g.snapshot(), log: log.join(',') };
    };
    const a = script(), b = script();
    expect(a.snap).toBe(b.snap);
    expect(a.log).toBe(b.log);
  });
});
