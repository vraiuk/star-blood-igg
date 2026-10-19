import { describe, expect, it } from 'vitest';
import { SLOTS, WORLD } from '../src/data/balance';
import { INWORLD, WORLDS, WORLD_OBJ } from '../src/data/worlds';
import { Game } from '../src/sim/game';
import { defeatReason } from '../src/ui/defeat';
import { GUIDE_STEPS, currentStep } from '../src/ui/guide';

/** IGG2 phase 5: the micro world «Росток» — nights, geodes, thicket, herd, Seed, defeat from dawn (spec §5, §7). */

const steps = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60) && !g.over; i++) g.step(); };
const micro = (seed = 1) => new Game({ seed, world: 'micro' });
const at = (g: Game, x: number, dir: 1 | -1 = 1) => { g.state.keeper.x = x; g.state.keeper.dir = dir; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priv = (g: Game) => g as any;
const dropsTotal = (g: Game) => g.state.drops.filter((d) => d.kind === 'amber').reduce((a, d) => a + d.value, 0);
/** jump the Tree to a stage (with its Circle at once) */
const stage = (g: Game, n: number) => { g.state.tree.stage = n; g.state.tree.radius = g.treeRadius(); };
/** run the current night to its end: hostiles cleared, nothing pending */
const finishNight = (g: Game) => {
  if (g.state.phase === 'day') priv(g).startNight();
  g.state.pending = [];
  g.state.enemies = [];
  g.step();
};

describe('micro nights (spec §5)', () => {
  it('four scripted nights with one new thing each; night 4 repeats ×1.1 hp per repeat', () => {
    const g = micro();
    const list = WORLDS.micro.nights as Exclude<typeof WORLDS.micro.nights, 'campaign'>;
    expect(list).toHaveLength(4);
    expect(list[0].groups.every((x) => x.kind === 'hound' && x.side === 'L')).toBe(true);
    expect(list[1].groups.some((x) => x.side === 'B')).toBe(true);
    expect(list[2].groups.some((x) => x.kind === 'worm')).toBe(true);
    expect(list[3].groups.some((x) => x.kind === 'ape')).toBe(true);
    expect(g.campaignNights).toBe(4);
    expect(g.night(4).groups).toEqual(list[3].groups);
    expect(g.night(4).hpMul).toBeCloseTo(list[3].hpMul * 1.1);
    expect(g.night(5).hpMul).toBeCloseTo(list[3].hpMul * 1.21);
  });

  it('scripted counts are exact: night 1 sends six hounds, all from the left', () => {
    const g = micro();
    priv(g).startNight();
    expect(g.state.pending).toHaveLength(6);
    expect(g.state.pending.every((p: { side: string; kind: string }) => p.side === 'L' && p.kind === 'hound')).toBe(true);
  });

  it('the micro run reaches night 4 and keeps going while the Tree is small', () => {
    const g = micro();
    for (let n = 0; n < 5; n++) finishNight(g);
    expect(g.state.phase).toBe('day');
    expect(g.state.night).toBe(5);
    expect(g.state.seed).toBeNull();
    expect(g.over).toBe(false);
  });
});

describe('geodes and the thicket', () => {
  it('hold S 1.2 s at a geode cracks it: its Amber spills; it is gone after', () => {
    const g = micro();
    const geo = WORLDS.micro.objects.find((o) => o.kind === 'geode')!;
    at(g, geo.x);
    expect(g.focus()).toMatchObject({ kind: 'geode', hold: INWORLD.geodeHold });
    const before = dropsTotal(g);
    g.setPour(true);
    steps(g, INWORLD.geodeHold * 0.5);
    expect(g.state.wobj.cracked).toHaveLength(0);
    expect(g.focus()!.holdT).toBeGreaterThan(0);
    steps(g, INWORLD.geodeHold * 0.6);
    g.setPour(false);
    expect(g.state.wobj.cracked).toHaveLength(1);
    expect(g.state.keeper.purse + dropsTotal(g) - before).toBe((geo as { amber: number }).amber);
    expect(g.focus()?.kind).not.toBe('geode');
  });

  it('releasing S early starts the crack over', () => {
    const g = micro();
    const geo = WORLDS.micro.objects.find((o) => o.kind === 'geode')!;
    at(g, geo.x);
    g.setPour(true); steps(g, 0.8); g.setPour(false);
    g.setPour(true); steps(g, 0.8); g.setPour(false);
    expect(g.state.wobj.cracked).toHaveLength(0);
  });

  it('the geode in the thicket is hidden until the Circle burns the thicket', () => {
    const g = micro();
    const th = WORLDS.micro.objects.find((o) => o.kind === 'thicket')!;
    at(g, th.x);
    expect(g.focus()).toBeNull();
    stage(g, 1);
    g.step();
    expect(g.state.wobj.burnt).toEqual(['thicket:1']);
    expect(g.focus()).toMatchObject({ kind: 'geode', id: 'geode:2' });
  });

  it('the Hammer slam cracks a geode in its radius', () => {
    const g = micro();
    const geo = WORLDS.micro.objects.find((o) => o.kind === 'geode')!;
    at(g, geo.x + 100, -1);
    at(g, geo.x + 100 + (geo.x - g.hammerTarget()), -1); // land right on the geode
    g.state.keeper.learned.hammer = true;
    g.state.keeper.light = 100;
    expect(g.castAhead('hammer')).toBe(true);
    steps(g, 1);
    expect(g.state.wobj.cracked).toContain('geode:0');
  });
});

describe('the grazing herd (neutral)', () => {
  it('four grazers at the left edge at the start; legacy has none', () => {
    const g = micro();
    expect(g.state.herd).toHaveLength(4);
    const h = WORLDS.micro.objects.find((o) => o.kind === 'herd') as { x: number; range: number };
    for (const e of g.state.herd) { expect(e.neutral).toBe(true); expect(Math.abs(e.x - h.x)).toBeLessThanOrEqual(h.range); }
    expect(new Game({ seed: 1 }).state.herd).toHaveLength(0);
  });

  it('grazers do not hold up the end of the night, and regrow to four at dawn', () => {
    const g = micro();
    g.state.herd.splice(0, 2);
    priv(g).startNight();
    g.state.pending = [];
    g.step();
    expect(g.state.phase).toBe('day');
    expect(g.state.herd).toHaveLength(4);
  });

  it('runes never aim at them; the Spear hunts one for 3–5 Amber', () => {
    const g = micro();
    const e = g.state.herd[0];
    g.state.herd = [e];
    at(g, e.x - 70, 1);
    expect(g.starfallTarget()).toBe(g.state.keeper.x + INWORLD.castAhead);
    expect(g.hammerTarget()).not.toBeCloseTo(e.x, 0);
    e.hp = 1;
    e.wanderTo = e.x;
    const before = dropsTotal(g);
    g.state.keeper.light = 100;
    expect(g.castAhead('spear')).toBe(true);
    steps(g, 0.5);
    expect(g.state.herd).toHaveLength(0);
    const got = dropsTotal(g) + g.state.keeper.purse - before;
    expect(got).toBeGreaterThanOrEqual(3);
    expect(got).toBeLessThanOrEqual(5);
  });

  it('a grazer bolts from the Keeper', () => {
    const g = micro();
    const e = g.state.herd[0];
    g.state.herd = [e];
    e.x = 200; e.wanderTo = 200;
    at(g, 180);
    steps(g, 0.5);
    expect(e.x).toBeGreaterThan(205);
  });
});

describe('wells in micro', () => {
  it('only U0/U1, shown from the day before night 3', () => {
    const g = micro();
    stage(g, 2);
    const u = (id: string) => g.slotUnlocked(SLOTS.find((s) => s.id === id)!);
    expect(u('U0')).toBe(false);
    g.state.night = 2;
    expect(u('U0')).toBe(true);
    expect(u('U1')).toBe(true);
    expect(u('U2')).toBe(false);
  });
});

describe('the Seed (spec §5)', () => {
  const grownAfterNight4 = () => {
    const g = micro();
    stage(g, 2);
    for (let n = 0; n < 4; n++) finishNight(g);
    return g;
  };

  it('surviving night 4 at stage 2 drops the Seed at the trunk; the day waits for it', () => {
    const g = grownAfterNight4();
    expect(g.state.seed).toEqual({ x: WORLD.treeX + WORLD_OBJ.seedOffset, carried: false });
    const left = g.state.dayLeft;
    steps(g, 3);
    expect(g.state.dayLeft).toBe(left);
  });

  it('no Seed before night 4, whatever the stage', () => {
    const g = micro();
    stage(g, 2);
    for (let n = 0; n < 3; n++) finishNight(g);
    expect(g.state.seed).toBeNull();
  });

  it('a small Tree after night 4: no Seed; growing it to stage 2 by day drops it', () => {
    const g = micro();
    stage(g, 1);
    for (let n = 0; n < 4; n++) finishNight(g);
    expect(g.state.seed).toBeNull();
    g.state.tree.growth = g.growCost() - 1;
    g.pourGrowth(1);
    expect(g.state.tree.stage).toBe(2);
    expect(g.state.seed).not.toBeNull();
  });

  it('S takes it, carrying it past the Circle edge wins: phase won, the run is over', () => {
    const g = grownAfterNight4();
    at(g, g.state.seed!.x);
    expect(g.focus()?.kind).toBe('seed');
    g.setPour(true); g.step(); g.setPour(false);
    expect(g.state.seed!.carried).toBe(true);
    g.setMove(1);
    steps(g, 4);
    expect(g.state.phase).toBe('won');
    expect(g.won).toBe(true);
    expect(g.over).toBe(true);
    expect(Math.abs(g.state.keeper.x - WORLD.treeX)).toBeGreaterThanOrEqual(g.state.tree.radius);
    expect(g.drainEvents().some((e) => e.type === 'won')).toBe(true);
  });

  it('the Keeper falls while carrying: the Seed lies where he fell', () => {
    const g = grownAfterNight4();
    at(g, g.state.seed!.x);
    g.setPour(true); g.step(); g.setPour(false);
    at(g, WORLD.treeX + 90);
    priv(g).damageKeeper(9999);
    g.step();
    expect(g.state.seed).toEqual({ x: WORLD.treeX + 90, carried: false });
    expect(g.state.phase).toBe('day');
  });
});

describe('defeat «С рассвета»', () => {
  it('a dawn snapshot restores the morning exactly after the Tree has fallen', () => {
    const g = micro(7);
    finishNight(g);
    const snap = g.snapshot();
    const morning = JSON.parse(snap).state;
    priv(g).startNight();
    steps(g, 5);
    g.state.tree.hp = 0;
    g.step();
    expect(g.state.phase).toBe('lost');
    const g2 = micro(99);
    expect(g2.restore(snap)).toBe(true);
    expect(g2.state.phase).toBe('day');
    expect(g2.state.night).toBe(1);
    expect(JSON.parse(JSON.stringify(g2.state))).toEqual({ ...morning, events: [] });
  });

  it('one stated reason: the biggest share of the Tree damage with its answer', () => {
    const r = defeatReason({ worm: 62, hound: 38 });
    expect(r).toContain('62%');
    expect(r).toContain('Черви');
    expect(r).toContain('Паук');
    expect(defeatReason({ ape: 10, hound: 5 })).toContain('Гигантопитек');
    expect(defeatReason({})).toBeTruthy();
  });
});

describe('the guide Кыш (spec §7): micro steps in order', () => {
  it('take → hive → night → drops → grow → spider → seed → carry', () => {
    expect(GUIDE_STEPS.micro.map((s) => s.id)).toEqual(['take', 'hive', 'night', 'pickup', 'grow', 'spider', 'seed', 'carry']);
    const g = micro();
    const none = () => false;
    expect(currentStep(g, none)?.id).toBe('take');
    g.state.keeper.purse = 30; g.state.amber = 10;
    expect(currentStep(g, none)?.id).toBe('hive');
    at(g, WORLD.treeX - 42);
    g.setPour(true); steps(g, 3); g.setPour(false);
    expect(g.state.structures).toHaveLength(1);
    expect(currentStep(g, none)?.id).toBe('night');
    // a step done before is skipped
    expect(currentStep(g, (id) => id === 'night')?.id).not.toBe('night');
  });

  it('balance: the first build the guide asks for fits the starting purse and Treasury', () => {
    const g = micro();
    const hive = g.buildPrice('hive').amber;
    expect(hive).toBeLessThanOrEqual(g.purseCap());
    expect(hive).toBeLessThanOrEqual(g.state.amber);
  });
});
