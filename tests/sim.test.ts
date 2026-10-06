import { describe, expect, it } from 'vitest';
import { ENEMIES, SLOTS, WORLD } from '../src/data/balance';
import { NESTS } from '../src/data/nests';
import { TREE_STAGES } from '../src/data/tree';
import { Game } from '../src/sim/game';
import { ENDLESS, generateNight } from '../src/data/nights';
import { runBot, runBotAsync } from './bot';

const run = (g: Game, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) g.step();
};

describe('rush (Натиск)', () => {
  it('calls the next night on top of stragglers, pays up front and postpones the dawn', () => {
    const g = new Game();
    while (g.choice) g.choose(0);
    g.callNight();
    expect(g.canRush()).toBe(false); // creatures still to come
    // keep the night's creatures alive and standing until all of them are out
    for (let i = 0; i < 60 * 120 && g.state.pending.length; i++) {
      g.step();
      for (const e of g.state.enemies) { e.speedMul = 0; e.hp = e.maxHp; }
    }
    expect(g.canRush()).toBe(true);
    const amber = g.state.amber, star = g.state.star, night = g.state.night;
    const r = g.rushReward();
    expect(g.callNight()).toBe(true);
    expect(g.state.night).toBe(night + 1);
    expect(g.state.phase).toBe('night');
    expect(g.state.amber).toBe(amber + r.amber);
    expect(g.state.star).toBe(star + r.star);
    expect(g.state.pending.length).toBeGreaterThan(0);
    expect(g.state.rushedDawns).toBe(1);
    // finish both nights: two roulettes wait at dawn
    for (let i = 0; i < 60 * 600 && g.state.phase === 'night'; i++) {
      for (const e of g.state.enemies) g.damageEnemy(e, 1e6);
      g.step();
    }
    expect(g.state.phase).toBe('day');
    expect(g.state.choices.filter((c) => c.kind === 'dawn').length).toBe(2);
    expect(g.state.rushedDawns).toBe(0);
  });
});

describe('facets for every rune', () => {
  it('the Light rune and Time Stop offer facets, resonances follow installed properties', () => {
    const g = new Game();
    while (g.choice) g.choose(0);
    g.state.star = 999;
    expect(g.promoteRune('light')).toBe(true);
    const c = g.choice;
    expect(c?.kind).toBe('facet');
    if (c?.kind === 'facet') expect(c.offers).toEqual(['lt-flow', 'lt-guard']);
    g.choose(0);
    const regen0 = g.state.keeper.facets.includes('lt-flow');
    expect(regen0).toBe(true);
    g.state.keeper.learned.timestop = true;
    expect(g.promoteRune('timestop')).toBe(true);
    g.buyProperty('ts-cheap');
    expect(g.facetOffers('timestop', 1)).toEqual(['ts-hush', 'ts-cold']);
  });
});

describe('time stop', () => {
  it('freezes creatures and the night, then recovers over nights, not seconds', () => {
    const g = new Game();
    while (g.choice) g.choose(0);
    g.state.keeper.learned.timestop = true;
    g.state.keeper.light = 999;
    expect(g.cast('timestop', 0)).toBe(false); // only at night
    g.callNight();
    const h = g.spawnEnemy('hound', 200, 1);
    const at = g.state.pending[0]?.at ?? 0;
    expect(g.cast('timestop', 0)).toBe(true);
    const x = h.x;
    run(g, 2);
    expect(h.x).toBe(x);
    if (g.state.pending.length) expect(g.state.pending[0].at).toBeGreaterThan(at);
    expect(g.state.keeper.timeStopNights).toBe(2);
    g.state.keeper.cooldowns.timestop = 0;
    g.state.keeper.timeStopT = 0;
    expect(g.cast('timestop', 0)).toBe(false); // still recovering
  });
});

describe('tunnels and flyers', () => {
  const dig = () => {
    const g = new Game();
    const w = g.spawnEnemy('worm', WORLD.treeX + 300, -1);
    for (let i = 0; i < 60 * 60 && w.layer === 'under'; i++) g.step();
    return { g, w };
  };

  it('a digger opens a tunnel behind the defenses and breaks out on the surface', () => {
    const { g, w } = dig();
    expect(w.layer).toBe('ground');
    const tn = g.state.tunnels[0];
    expect(tn.open).toBe(true);
    expect(Math.abs(tn.entryX - WORLD.treeX)).toBeGreaterThan(Math.abs(tn.headX - WORLD.treeX));
  });

  it('ground creatures dive into an open tunnel and come out past its exit', () => {
    const { g } = dig();
    const tn = g.state.tunnels[0];
    const h = g.spawnEnemy('hound', tn.entryX - 2, -1);
    g.step();
    expect(h.layer).toBe('under');
    for (let i = 0; i < 600 && h.layer === 'under'; i++) g.step();
    expect(h.layer).toBe('ground');
    expect(h.x).toBeLessThanOrEqual(tn.headX + 1);
  });

  it('the Keeper standing on the exit seals the tunnel', () => {
    const { g } = dig();
    const tn = g.state.tunnels[0];
    g.state.keeper.x = tn.headX;
    run(g, 2);
    expect(g.state.tunnels.length).toBe(0);
  });

  it('a digger killed underground leaves no tunnel', () => {
    const g = new Game();
    const w = g.spawnEnemy('worm', WORLD.treeX + 300, -1);
    run(g, 1);
    g.damageEnemy(w, 99999);
    run(g, 0.1);
    expect(g.state.tunnels.length).toBe(0);
  });

  it('flyers soar over the beetles; hives shoot them down', () => {
    const g = new Game();
    g.build('R0', 'beetle');
    const m = g.spawnEnemy('moth', WORLD.treeX + 60, -1);
    expect(m.layer).toBe('air');
    run(g, 1.5);
    expect(m.x).toBeLessThan(WORLD.treeX + 40);
    const g2 = new Game();
    g2.build('R0', 'hive');
    const m2 = g2.spawnEnemy('moth', WORLD.treeX + 50, -1);
    m2.speedMul = 0;
    run(g2, 3);
    expect(m2.hp).toBeLessThan(m2.maxHp);
  });
});

describe('light rules', () => {
  it('tree radius defines the lit zone on the surface', () => {
    const g = new Game();
    const r = TREE_STAGES[0].radius;
    expect(g.isLit(WORLD.treeX + r - 1, false)).toBe(true);
    expect(g.isLit(WORLD.treeX + r + 1, false)).toBe(false);
  });

  it('worms in light take double damage (Igg-light)', () => {
    const g = new Game();
    const lit = g.spawnEnemy('worm', WORLD.treeX + 20, -1);
    const dark = g.spawnEnemy('worm', 30, 1);
    g.damageEnemy(lit, 10);
    g.damageEnemy(dark, 10);
    expect(lit.maxHp - lit.hp).toBe(20);
    expect(dark.maxHp - dark.hp).toBe(10);
  });

  it('archers ignore enemies in darkness', () => {
    const g = new Game();
    g.build('R0', 'hive');
    const e = g.spawnEnemy('hound', WORLD.treeX + TREE_STAGES[0].radius + 30, -1);
    e.speedMul = 0;
    run(g, 3);
    expect(e.hp).toBe(e.maxHp);
  });
});

describe('economy', () => {
  it('build spends blood and respects slot unlocks', () => {
    const g = new Game();
    const start = g.state.amber;
    expect(g.build('L0', 'hive')).toBe(true);
    expect(g.state.amber).toBe(start - NESTS.hive.costs[0].amber);
    const locked = SLOTS.find((s) => !s.underground && s.offset > 100)!;
    expect(g.build(locked.id, 'beetle')).toBe(false);
  });

  it('feeding the tree grows it and unlocks slots', () => {
    const g = new Game();
    g.state.amber = 1000;
    g.feed(TREE_STAGES[0].growCost);
    expect(g.state.tree.stage).toBe(1);
    expect(g.choice?.kind).toBe('branch');
    const st2 = SLOTS.find((s) => !s.underground && s.offset > TREE_STAGES[0].radius && s.offset < TREE_STAGES[1].radius - 14)!;
    expect(g.build(st2.id, 'beetle')).toBe(true);
  });

  it('loot inside the Circle flies to the tree by itself', () => {
    const g = new Game();
    g.state.keeper.alive = false;
    g.state.keeper.respawn = 999;
    const e = g.spawnEnemy('hound', WORLD.treeX + 40, 1);
    const before = g.state.amber;
    g.damageEnemy(e, 9999);
    for (let i = 0; i < 60 * 6; i++) g.step();
    expect(g.state.amber).toBeGreaterThan(before);
  });

  it('caterpillars gather several drops per trip', () => {
    const g = new Game();
    g.state.amber = 999;
    g.feed(TREE_STAGES[0].growCost);
    g.choose(0);
    expect(g.build('C0', 'caterpillar')).toBe(true);
    g.state.keeper.alive = false; g.state.keeper.respawn = 999;
    for (let i = 0; i < 5; i++) { const e = g.spawnEnemy('hound', WORLD.treeX - 180 + i * 6, 1); g.damageEnemy(e, 9999); }
    let maxCarry = 0;
    for (let i = 0; i < 60 * 12; i++) { g.step(); for (const w of g.state.workers) maxCarry = Math.max(maxCarry, w.carry.n); }
    expect(maxCarry).toBeGreaterThan(1);
  });

  it('three same nests merge into one stronger nest, freeing two slots', () => {
    const g = new Game();
    g.state.amber = 9999;
    g.feed(TREE_STAGES[0].growCost); g.choose(0);
    for (const id of ['L0', 'R0', 'L1']) g.build(id, 'hive');
    const st = g.structureAt('L0')!;
    const dmg0 = g.nestStats(st).damage;
    expect(g.mergeNests(st.id)).toBe(true);
    expect(g.state.structures.filter((x) => x.family === 'hive').length).toBe(1);
    expect(st.merge).toBe(1);
    expect(g.nestStats(st).damage).toBeGreaterThan(dmg0 * 2);
  });

  it('mastered nests ascend endlessly with exponential prices', () => {
    const g = new Game();
    g.state.amber = 1e9; g.state.star = 999;
    g.build('L0', 'hive');
    const st = g.structureAt('L0')!;
    g.upgrade(st.id); g.specialize(st.id, 'A'); g.upgrade(st.id);
    const c0 = g.ascendCost(st);
    for (let i = 0; i < 12; i++) expect(g.ascendNest(st.id)).toBe(true);
    expect(g.ascendCost(st)).toBeGreaterThan(c0 * 50);
  });

  it('the piercing beam is channelled: the Ascended stands and damage ticks over time', () => {
    const g = new Game();
    const k = g.state.keeper;
    k.runeRank.spear = 2; k.forms.spear = 'B'; k.light = 999; k.dir = 1;
    const e = g.spawnEnemy('stalker', k.x + 100, -1);
    e.speedMul = 0;
    g.cast('spear', k.x + 100);
    g.setMove(1);
    const x0 = k.x;
    g.step();
    const hp1 = e.hp;
    for (let i = 0; i < 60; i++) g.step();
    expect(k.x).toBe(x0);
    expect(e.hp).toBeLessThan(hp1);
  });

  it('shadows drop Amber, worms also drop Star Blood', () => {
    const g = new Game();
    const e = g.spawnEnemy('stalker', 100, 1);
    g.damageEnemy(e, 99999);
    const w = g.spawnEnemy('worm', 100, 1);
    g.damageEnemy(w, 99999);
    g.step();
    const sum = (k: string) => g.state.drops.filter((d) => d.kind === k).reduce((a, d) => a + d.value, 0);
    expect(sum('amber')).toBe(ENEMIES.stalker.amber + ENEMIES.worm.amber);
    expect(sum('star')).toBe(ENEMIES.worm.star);
  });

  it('nests branch into a specialization at level 3, paid with Star Blood', () => {
    const g = new Game();
    g.state.amber = 1000;
    g.build('L0', 'hive');
    const st = g.state.structures[0];
    g.upgrade(st.id);
    expect(st.tier).toBe(1);
    expect(g.upgrade(st.id)).toBe(false);
    expect(g.specialize(st.id, 'B')).toBe(false); // no star blood yet
    g.state.star = 50;
    expect(g.specialize(st.id, 'B')).toBe(true);
    expect(g.nestStats(st).pierce).toBeGreaterThan(0);
  });

  it('properties fill rune slots; a development rune opens the 4th', () => {
    const g = new Game();
    g.state.star = 999;
    expect(g.buyProperty('sp-power')).toBe(false); // Бронза property won't fit a Дерево rune
    expect(g.promoteRune('spear')).toBe(true);
    for (let i = 0; i < 3; i++) expect(g.buyProperty('sp-power')).toBe(true);
    expect(g.buyProperty('sp-cheap')).toBe(false); // 3 slots full
    g.state.devRunes = 1;
    expect(g.developRune('spear')).toBe(true);
    expect(g.buyProperty('sp-cheap')).toBe(true);
    expect(g.abilityMult('spear')).toBeGreaterThan(2);
  });

  it('armor reduces weak hits but never below 25%', () => {
    const g = new Game();
    const st = g.spawnEnemy('guard', 30, 1);
    const dealt = g.damageEnemy(st, 8, false);
    expect(dealt).toBeCloseTo(2);
  });

  it('Igg-light burns worm-type enemies standing in it', () => {
    const g = new Game();
    const f = g.spawnEnemy('forager', WORLD.treeX, 1);
    f.speedMul = 0;
    const hp0 = f.hp;
    for (let i = 0; i < 60; i++) g.step();
    expect(f.hp).toBeLessThan(hp0);
  });

  it('light regenerates faster near the trunk', () => {
    const g = new Game();
    expect(g.lightRegenFactor(WORLD.treeX)).toBeGreaterThan(g.lightRegenFactor(WORLD.treeX + 300) * 3);
  });

  it('dawn offers a choice of 3 and the chosen rune changes mods', () => {
    const g = new Game({ startRune: true });
    const c = g.choice;
    expect(c?.kind).toBe('dawn');
    if (c?.kind === 'dawn') expect(c.offers.length).toBe(3);
    g.choose(0);
    expect(g.choice).toBeNull();
  });

  it('stuns have diminishing returns and bosses resist', () => {
    const g = new Game();
    const h = g.spawnEnemy('hound', 300, 1);
    g.stunEnemy(h, 2);
    expect(h.stun).toBe(2);
    h.stun = 0;
    g.stunEnemy(h, 2);
    expect(h.stun).toBe(1);
    const m = g.spawnEnemy('mother', 300, 1);
    g.stunEnemy(m, 2);
    expect(m.stun).toBeCloseTo(0.5);
  });
});

describe('determinism', () => {
  it('same seed → same outcome', async () => {
    expect(await runBotAsync('balanced', 3, 6)).toEqual(runBot('balanced', 3, 6));
  });
});

describe('balance corridor (heuristic bots)', () => {
  const seeds = [1, 2, 3];
  it('doing nothing loses the first night', async () => {
    const r = await runBotAsync('idle', 1);
    expect(r.phase).toBe('lost');
    expect(r.night).toBe(0);
    expect(r.night).toBe(0);
  });
  it('a balanced player usually wins', async () => {
    const rs = [];
    for (const sd of seeds) rs.push(await runBotAsync('balanced', sd));
    const wins = rs.filter((r) => r.night >= 10).length;
    expect(wins).toBeGreaterThanOrEqual(2);
  });
  it('defense without growing the tree falls early', async () => {
    const rs = [];
    for (const sd of seeds) rs.push(await runBotAsync('turtle', sd));
    expect(rs.every((r) => r.phase === 'lost' && r.night <= 4)).toBe(true);
  });
  it('endless difficulty keeps outgrowing rewards (curves, generator rhythm)', () => {
    // hp grows much faster than bounty, so a finite set of slots eventually falls
    expect(ENDLESS.hp(30) / ENDLESS.bounty(30)).toBeGreaterThan(40);
    expect(ENDLESS.hp(20)).toBeGreaterThan(ENDLESS.hp(10) * 3);
    // rhythm: a breather after each boss and a spike before it
    const t = (n: number) => generateNight(n).title;
    expect(t(10)).toContain('Тихая');
    expect(t(14)).toMatch(/Охота|Палач/);
  });
  it('pure tree greed without defense loses', async () => {
    const rs = [];
    for (const sd of seeds) rs.push(await runBotAsync('greedy', sd));
    expect(rs.every((r) => r.phase === 'lost')).toBe(true);
  });
});
