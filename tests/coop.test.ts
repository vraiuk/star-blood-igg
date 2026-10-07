import { describe, expect, it } from 'vitest';
import { COOP, WORLD } from '../src/data/balance';
import { Game, MAX_KEEPERS } from '../src/sim/game';

/** A small scripted co-op session: every player moves and casts, player 0 builds. */
function script(g: Game, tick: number) {
  const n = g.state.keepers.length;
  if (tick === 1) g.exec(0, 'build', ['L0', 'hive']);
  if (tick === 2) g.exec(1 % n, 'build', ['R0', 'hive']);
  if (tick === 30) g.exec(0, 'callNight', []);
  for (let p = 0; p < n; p++) {
    if (tick % 240 === p * 20) g.exec(p, 'setMove', [((tick / 240) | 0) % 2 ? 1 : -1]);
    if (tick % 240 === p * 20 + 90) g.exec(p, 'setMove', [0]);
    if (tick % 50 === p * 7) g.exec(p, 'cast', ['spear', 0]);
  }
  for (let p = 0; p < n; p++) if (g.choiceFor(p) && tick % 7 === p) g.exec(p, 'choose', [0], g.choiceSig(p));
}

function run(players: number, local: number, ticks: number) {
  const g = new Game({ seed: 42, players });
  g.setLocal(local);
  for (let t = 0; t < ticks; t++) {
    script(g, t);
    if (!g.choice) g.step();
    g.drainEvents();
  }
  return g;
}

describe('co-op: several Ascended around one Tree', () => {
  it('spawns up to MAX_KEEPERS bodies, each with their own runes; boons are the Circle\'s', () => {
    const g = new Game({ players: 9 });
    const [a, b] = g.state.keepers;
    expect(g.state.keepers.length).toBe(MAX_KEEPERS);
    expect(a.x).not.toBe(b.x);
    expect(a.props).not.toBe(b.props);
    expect(a.runeRank).not.toBe(b.runeRank);
    expect(a.cooldowns).not.toBe(b.cooldowns);
    expect(a.boons).toBe(b.boons);
  });

  it('a Property bought by one Ascended powers only them', () => {
    const g = new Game({ players: 2 });
    g.state.star = 1000;
    // Усиление needs a Bronze spear: the rank is the buyer's own too
    g.exec(1, 'promoteRune', ['spear']);
    expect(g.state.keepers[1].runeRank.spear).toBe(1);
    expect(g.state.keepers[0].runeRank.spear).toBe(0);
    const before = g.asKeeper(1, () => g.abilityMult('spear'));
    const other = g.asKeeper(0, () => g.abilityMult('spear'));
    g.exec(1, 'buyProperty', ['sp-power']);
    expect(g.state.keepers[1].props.spear).toContain('sp-power');
    expect(g.state.keepers[0].props.spear).not.toContain('sp-power');
    expect(g.asKeeper(1, () => g.abilityMult('spear'))).toBeGreaterThan(before);
    expect(g.asKeeper(0, () => g.abilityMult('spear'))).toBe(other);
  });

  it('ranks and attributes rise for the one who pays', () => {
    const g = new Game({ players: 2 });
    g.state.star = 1000;
    g.exec(1, 'ascend', []);
    g.exec(1, 'raiseAttr', ['might']);
    expect(g.state.keepers[1].rank).toBe(1);
    expect(g.state.keepers[0].rank).toBe(0);
    expect(g.state.keepers[1].attrs.might).toBe(1);
    expect(g.state.keepers[0].attrs.might).toBe(0);
  });

  it('every Ascended gets their own dawn roulette and only they can pick from it', () => {
    const g = new Game({ players: 3, startRune: true });
    expect(g.state.choices.map((c) => c.k)).toEqual([0, 1, 2]);
    g.exec(0, 'choose', [0], g.choiceSig(2));
    expect(g.choiceFor(2)).not.toBeNull();
    g.exec(2, 'choose', [0], g.choiceSig(2));
    expect(g.choiceFor(2)).toBeNull();
    expect(g.choiceFor(0)).not.toBeNull();
    // the world holds still until everybody has picked
    expect(g.choice).not.toBeNull();
  });

  it('a command moves only the Ascended who sent it', () => {
    const g = new Game({ players: 2 });
    const x0 = g.state.keepers[0].x, x1 = g.state.keepers[1].x;
    g.exec(1, 'setMove', [1]);
    for (let i = 0; i < 30; i++) g.step();
    expect(g.state.keepers[0].x).toBe(x0);
    expect(g.state.keepers[1].x).toBeGreaterThan(x1);
  });

  it('casts spend the caster\'s Light, resources stay shared', () => {
    const g = new Game({ players: 2 });
    const [a, b] = g.state.keepers;
    const la = a.light, lb = b.light;
    g.exec(1, 'cast', ['spear', 0]);
    expect(b.light).toBeLessThan(lb);
    expect(a.light).toBe(la);
    const amber = g.state.amber;
    g.exec(1, 'build', ['L0', 'hive']);
    expect(g.state.amber).toBeLessThan(amber);
  });

  it('creatures bite the Ascended they reach, not the first one', () => {
    const g = new Game({ players: 2 });
    const [a, b] = g.state.keepers;
    b.x = 40;
    const e = g.spawnEnemy('hound', 30, 1);
    e.attackCd = 0;
    for (let i = 0; i < 120; i++) g.step();
    expect(b.hp).toBeLessThan(g.keeperMaxHp());
    expect(a.hp).toBe(g.keeperMaxHp());
  });

  it('every Ascended can pick up loot and seal tunnels', () => {
    const g = new Game({ players: 2 });
    g.state.keepers[1].x = 30;
    g.state.drops.push({ id: 999, kind: 'amber', x: 32, y: WORLD.groundY - 3, vx: 0, vy: 0, value: 50, life: 20, grounded: true, pulled: false, age: 0, claimed: 0, rooted: false, mode: 1, hover: 0 });
    const amber = g.state.amber;
    for (let i = 0; i < 60; i++) g.step();
    expect(g.state.amber).toBe(amber + 50);
  });

  it('a stale choice pick is ignored', () => {
    const g = new Game({ players: 2, startRune: true });
    expect(g.choiceFor(0)).not.toBeNull();
    g.exec(0, 'choose', [0], 'not-this-one');
    expect(g.choiceFor(0)).not.toBeNull();
    g.exec(0, 'choose', [0], g.choiceSig(0));
    expect(g.choiceFor(0)).toBeNull();
  });

  it('peers with different local players stay in lockstep', () => {
    const a = run(3, 0, 60 * 120);
    const b = run(3, 2, 60 * 120);
    expect(a.state.night).toBeGreaterThan(0);
    expect(b.digest()).toBe(a.digest());
    expect(b.state.keepers.map((k) => k.x)).toEqual(a.state.keepers.map((k) => k.x));
    // the UI context follows the local player
    expect(a.state.keeper).toBe(a.state.keepers[0]);
    expect(b.state.keeper).toBe(b.state.keepers[2]);
  });

  it('creatures grow tougher with every extra Ascended', () => {
    const solo = new Game({ seed: 3 }).spawnEnemy('hound', 0, 1).maxHp;
    const duo = new Game({ seed: 3, players: 2 }).spawnEnemy('hound', 0, 1).maxHp;
    const four = new Game({ seed: 3, players: 4 }).spawnEnemy('hound', 0, 1).maxHp;
    expect(duo).toBe(Math.round(solo * (1 + COOP.enemyHp)));
    expect(four).toBe(Math.round(solo * (1 + 3 * COOP.enemyHp)));
  });

  it('ignores commands that are not on the list', () => {
    const g = new Game({ players: 2 });
    const amber = g.state.amber;
    g.exec(0, 'grantReward', [1000]);
    g.exec(0, 'constructor', []);
    expect(g.state.amber).toBe(amber);
  });
});
