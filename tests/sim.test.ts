import { describe, expect, it } from 'vitest';
import { ENEMIES, SLOTS, WORLD } from '../src/data/balance';
import { NESTS } from '../src/data/nests';
import { TREE_STAGES } from '../src/data/tree';
import { Game } from '../src/sim/game';
import { runBot } from './bot';

const run = (g: Game, seconds: number) => {
  for (let i = 0; i < seconds * 60; i++) g.step();
};

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

  it('level 3 nests branch into a specialization paid with Star Blood', () => {
    const g = new Game();
    g.state.amber = 1000;
    g.build('L0', 'hive');
    const st = g.state.structures[0];
    g.upgrade(st.id); g.upgrade(st.id);
    expect(st.tier).toBe(2);
    expect(g.specialize(st.id, 'B')).toBe(false); // no star blood yet
    g.state.star = 50;
    expect(g.specialize(st.id, 'B')).toBe(true);
    expect(g.nestStats(st).pierce).toBeGreaterThan(0);
  });

  it('properties fill rune slots; a development rune opens the 4th', () => {
    const g = new Game();
    g.state.star = 999;
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
    const f = g.spawnEnemy('forager', 480, 1);
    f.speedMul = 0;
    const hp0 = f.hp;
    for (let i = 0; i < 60; i++) g.step();
    expect(f.hp).toBeLessThan(hp0);
  });

  it('light regenerates faster near the trunk', () => {
    const g = new Game();
    expect(g.lightRegenFactor(480)).toBeGreaterThan(g.lightRegenFactor(480 + 300) * 3);
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
  it('same seed → same outcome', () => {
    expect(runBot('balanced', 3, 12)).toEqual(runBot('balanced', 3, 12));
  });
});

describe('balance corridor (heuristic bots)', () => {
  const seeds = [1, 2, 3, 4, 5];
  it('doing nothing loses the first night', () => {
    const r = runBot('idle', 1);
    expect(r.phase).toBe('lost');
    expect(r.night).toBe(0);
  });
  it('a balanced player usually wins', () => {
    const wins = seeds.map((s) => runBot('balanced', s)).filter((r) => r.phase === 'won').length;
    expect(wins).toBeGreaterThanOrEqual(3);
  });
  it('defense without growing the tree falls early', () => {
    expect(seeds.map((s) => runBot('turtle', s)).every((r) => r.phase === 'lost' && r.night <= 4)).toBe(true);
  });
  it('pure tree greed without defense loses', () => {
    expect(seeds.map((s) => runBot('greedy', s)).every((r) => r.phase === 'lost')).toBe(true);
  });
});
