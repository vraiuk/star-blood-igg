import { describe, expect, it } from 'vitest';
import { ABILITIES, ENEMIES, WORLD } from '../src/data/balance';
import { BASE_TIERS } from '../src/data/nests';
import { runeRankCost } from '../src/data/runes';
import { INWORLD } from '../src/data/worlds';
import { Game } from '../src/sim/game';
import type { GameEvent } from '../src/sim/types';

/** IGG2 phase 4: three runes without the mouse, the rank + Form Tablet at the stone, nest gates (spec §4). */

const steps = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60); i++) g.step(); };
const micro = () => new Game({ seed: 1, world: 'micro' });
const medium = () => new Game({ seed: 1, world: 'medium' });
const at = (g: Game, dx: number, dir: 1 | -1 = 1) => { g.state.keeper.x = WORLD.treeX + dx; g.state.keeper.dir = dir; };
/** end the current night at once (no creatures left) and run the dawn */
const endNight = (g: Game) => {
  if (g.state.phase === 'day') g.callNight();
  g.state.pending = [];
  g.state.enemies = [];
  g.step();
};
const of = <T extends GameEvent['type']>(ev: GameEvent[], type: T) => ev.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('runes in the world: keys and aim', () => {
  it('keys 1/2/3 map to spear / hammer / starfall of the world; other runes are not castable', () => {
    const m = medium();
    expect(['1', '2', '3', '4', '5', '6'].map((k) => m.runeForKey(k))).toEqual(['spear', 'hammer', 'starfall', null, null, null]);
    const g = micro();
    expect(['1', '2', '3'].map((k) => g.runeForKey(k))).toEqual(['spear', 'hammer', null]);
    // even forced into «learned», the legacy runes don't exist here
    m.state.keeper.learned.radiance = true;
    m.state.keeper.light = 999;
    expect(m.castAhead('radiance')).toBe(false);
    expect(m.castKey('1')).toBe(true);
    expect(of(m.drainEvents(), 'cast')[0]).toMatchObject({ ability: 'spear' });
  });

  it('the Hammer leaps a fixed distance forward along the facing when nothing is ahead', () => {
    const g = medium();
    at(g, 0, -1);
    g.state.keeper.light = 999;
    const x0 = g.state.keeper.x;
    expect(g.hammerTarget()).toBe(x0 - ABILITIES.hammer.leap * g.runeArea('hammer'));
    // a creature behind doesn't change the leap
    g.spawnEnemy('hound', x0 + 60, -1);
    expect(g.castKey('2')).toBe(true);
    steps(g, ABILITIES.hammer.leapTime + 0.05);
    expect(g.state.keeper.x).toBeCloseTo(x0 - ABILITIES.hammer.leap, 5);
    expect(of(g.drainEvents(), 'slam')).toHaveLength(1);
  });

  it('the Hammer lands just before the nearest creature within the leap', () => {
    const g = medium();
    at(g, 0, 1);
    g.state.keeper.light = 999;
    const x0 = g.state.keeper.x;
    const far = g.spawnEnemy('hound', x0 + 170, -1);
    const near = g.spawnEnemy('hound', x0 + 110, -1);
    g.spawnEnemy('hound', x0 + 400, -1); // beyond the leap
    const to = near.x - (ENEMIES.hound.radius + INWORLD.hammerStop);
    expect(g.hammerTarget()).toBe(to);
    expect(to).toBeLessThan(near.x);
    expect(g.castKey('2')).toBe(true);
    // freeze the creatures to check the landing point exactly
    for (const e of g.state.enemies) e.stun = 99;
    steps(g, ABILITIES.hammer.leapTime + 0.05);
    expect(g.state.keeper.x).toBeCloseTo(to, 5);
    expect(near.hp).toBeLessThan(near.maxHp);
    void far;
  });

  it('the Starfall falls on the densest hostile pack ahead (not behind, not neutral, not a lone one)', () => {
    const g = medium();
    g.state.keeper.learned.starfall = true;
    g.state.keeper.charge = ABILITIES.starfall.chargeMax;
    at(g, 0, 1);
    const x0 = g.state.keeper.x;
    const mk = (dx: number, neutral = false) => { const e = g.spawnEnemy('hound', x0 + dx, -1); e.lit = true; e.neutral = neutral; return e; };
    mk(30); // a lone one close by
    const pack = [200, 210, 225].map((dx) => mk(dx));
    for (const dx of [-150, -160, -170, -180]) mk(dx); // a bigger pack behind
    for (const dx of [100, 104, 108, 112, 116]) mk(dx, true); // neutral grazers
    const want = pack.reduce((a, e) => a + e.x, 0) / pack.length;
    expect(g.starfallTarget()).toBeCloseTo(want, 5);
    expect(g.castKey('3')).toBe(true);
    expect(of(g.drainEvents(), 'cast')[0].tx).toBeCloseTo(want, 5);
  });

  it('the Starfall with no pack ahead falls just ahead of the Keeper; dark creatures far out are ignored', () => {
    const g = medium();
    at(g, 0, -1);
    g.spawnEnemy('hound', WORLD.treeX - 250, 1).lit = false; // out of the light and not near it
    expect(g.starfallTarget()).toBe(g.state.keeper.x - INWORLD.castAhead);
  });
});

describe('rune learning by the world script', () => {
  it('micro: spear known; the Hammer is the Observer\'s fixed gift at the dawn after night 1', () => {
    const g = micro();
    expect(g.state.keeper.learned).toMatchObject({ spear: true, hammer: false, starfall: false });
    expect(g.learnAbility('hammer')).toBe(false); // never bought
    g.state.keeper.light = 999;
    expect(g.castKey('2')).toBe(false);
    g.drainEvents();
    endNight(g);
    const ev = g.drainEvents();
    expect(of(ev, 'runeLearned')).toEqual([{ type: 'runeLearned', ability: 'hammer', by: 'gift', line: expect.stringContaining('Прыжок Молота [2]') }]);
    expect(g.state.keeper.learned.hammer).toBe(true);
    expect(g.state.choices).toEqual([]);
    expect(g.castKey('2')).toBe(true);
    // the gift comes once
    endNight(g);
    expect(of(g.drainEvents(), 'runeLearned')).toEqual([]);
  });

  it('medium: spear and hammer known; the Starfall is learned free when the Tree reaches stage index 3', () => {
    const g = medium();
    expect(g.state.keeper.learned).toMatchObject({ spear: true, hammer: true, starfall: false });
    expect(g.runeLockHint('starfall')).toBe('стадия 4');
    g.state.tree.stage = 1;
    g.pourGrowth(g.growCost());
    expect(g.state.tree.stage).toBe(2);
    expect(g.state.keeper.learned.starfall).toBe(false);
    g.drainEvents();
    g.pourGrowth(g.growCost());
    expect(g.state.tree.stage).toBe(3);
    expect(g.state.keeper.learned.starfall).toBe(true);
    expect(of(g.drainEvents(), 'runeLearned')).toMatchObject([{ ability: 'starfall', by: 'stage' }]);
    expect(g.runeLockHint('starfall')).toBeNull();
  });
});

describe('the Tablet at the stone (medium)', () => {
  it('opens only at the stone, from stage 1; micro has none; legacy as before', () => {
    const g = medium();
    at(g, INWORLD.stone);
    expect(g.canOpenTablet()).toBe(false);
    expect(g.tabletReason()).toContain('Ростком');
    g.state.tree.stage = 1;
    expect(g.canOpenTablet()).toBe(true);
    expect(g.focus()).toMatchObject({ kind: 'stone', canAct: true });
    at(g, -42);
    expect(g.canOpenTablet()).toBe(false);
    expect(g.tabletReason()).toBe('Скрижаль — у камня рядом с Древом');
    const m = micro();
    at(m, INWORLD.stone);
    expect(m.canOpenTablet()).toBe(false);
    expect(new Game({ seed: 1 }).canOpenTablet()).toBe(true);
  });

  it('promoteRune: rank 0→3 for Star Blood, no facet choices, the Form at rank 2, capped at 3', () => {
    const g = medium();
    g.state.tree.stage = 1;
    g.state.star = 500;
    at(g, -42);
    expect(g.promoteRune('spear')).toBe(false); // not at the stone
    expect(g.state.star).toBe(500);
    at(g, INWORLD.stone);
    expect(g.promoteRune('spear')).toBe(true);
    expect(g.state.keeper.runeRank.spear).toBe(1);
    expect(g.state.choices).toEqual([]); // no facet at Бронза
    expect(g.promoteRune('spear')).toBe(true);
    expect(g.state.choices).toEqual([{ kind: 'form', rune: 'spear', rank: 2, offers: ['A', 'B'] }]);
    expect(g.choose(0)).toBe(true);
    expect(g.state.keeper.forms.spear).toBe('A');
    expect(g.promoteRune('spear')).toBe(true);
    expect(g.state.keeper.runeRank.spear).toBe(3);
    expect(g.state.choices).toEqual([]); // no facet at Золото
    expect(g.promoteRune('spear')).toBe(false);
    expect(g.promoteBlock('spear')).toBe('Высший ранг');
    expect(g.state.star).toBe(500 - runeRankCost(1) - runeRankCost(2) - runeRankCost(3));
    expect(g.state.keeper.facets).toEqual([]);
    // runes not in the world / not yet learned
    expect(g.promoteRune('radiance')).toBe(false);
    expect(g.promoteRune('starfall')).toBe(false);
    expect(g.promoteBlock('starfall')).toContain('стадия 4');
  });

  it('promoteRune needs the Star Blood price', () => {
    const g = medium();
    g.state.tree.stage = 1;
    at(g, INWORLD.stone);
    g.state.star = runeRankCost(1) - 1;
    expect(g.promoteRune('hammer')).toBe(false);
    expect(g.promoteBlock('hammer')).toBe(`Нужна Звёздная Кровь: ${runeRankCost(1)}`);
  });

  it('legacy-only Keeper systems do nothing in the world', () => {
    const g = medium();
    g.state.star = 999;
    g.state.devRunes = 3;
    g.state.keeper.runeRank.spear = 1; // a rank-1 Property would fit in legacy
    expect(g.ascend()).toBe(false);
    expect(g.raiseAttr('might')).toBe(false);
    expect(g.buyProperty('sp-power')).toBe(false);
    expect(g.buyRuneSlot('spear')).toBe(false);
    expect(g.developRune('spear')).toBe(false);
    expect(g.addRing()).toBe(false);
    expect(g.state.keeper.rank).toBe(0);
    expect(g.state.star).toBe(999);
  });
});

describe('dawn and growth without choices', () => {
  it('no dawn roulette and no branch choice in the world; legacy keeps both', () => {
    for (const g of [micro(), medium()]) {
      endNight(g);
      expect(g.state.choices).toEqual([]);
      g.pourGrowth(g.growCost());
      expect(g.state.tree.stage).toBe(1);
      expect(g.state.choices).toEqual([]);
    }
    const legacy = new Game({ seed: 1 });
    endNight(legacy);
    expect(legacy.choice?.kind).toBe('dawn');
    legacy.state.choices = [];
    legacy.state.amber = 9999;
    legacy.feed(legacy.growNeed());
    expect(legacy.choice?.kind).toBe('branch');
  });
});

describe('nests in the world', () => {
  const forkNest = (g: Game) => {
    g.state.amber = 2000;
    g.state.star = 50;
    expect(g.build('L0', 'hive')).toBe(true);
    const st = g.structureAt('L0')!;
    while (st.tier < BASE_TIERS - 1) expect(g.upgrade(st.id)).toBe(true);
    at(g, -42);
    return st;
  };

  it('medium: the fork is shown locked before stage 2, open from it', () => {
    const g = medium();
    const st = forkNest(g);
    expect(g.focus()).toMatchObject({ kind: 'nest', options: [], canAct: false, reason: 'Развилка откроется, когда Древо станет Юным Игг' });
    expect(g.specialize(st.id, 'A')).toBe(false);
    g.state.tree.stage = 2;
    expect(g.focus()!.options.map((o) => o.id)).toEqual(['A', 'B']);
    expect(g.specialize(st.id, 'A')).toBe(true);
  });

  it('micro: no specializations at all — the nest stops at the base tiers', () => {
    const g = micro();
    const st = forkNest(g);
    g.state.tree.stage = 2;
    expect(g.focus()).toMatchObject({ options: [], canAct: false, reason: 'Гнездо на пределе' });
    expect(g.specialize(st.id, 'A')).toBe(false);
    expect(st.tier).toBe(BASE_TIERS - 1);
  });

  it('closed families are not offered at slots and cannot be built; a woken sleeper opens its family', () => {
    const g = medium();
    g.state.amber = 2000;
    at(g, -42);
    expect(g.focus()!.options.map((o) => o.id)).toEqual(['hive', 'beetle']);
    expect(g.build('L0', 'dragonfly')).toBe(false);
    expect(g.build('L0', 'caterpillar')).toBe(false);
    expect(g.build('L0', 'termite')).toBe(false);
    g.state.unlockedFamilies.push('dragonfly');
    expect(g.focus()!.options.map((o) => o.id)).toEqual(['hive', 'beetle', 'dragonfly']);
    expect(g.build('L0', 'dragonfly')).toBe(true);
    const m = micro();
    at(m, -42);
    expect(m.focus()!.options.map((o) => o.id)).toEqual(['hive', 'beetle']);
    m.state.tree.stage = 1;
    expect(m.focus()!.options.map((o) => o.id)).toEqual(['hive', 'beetle', 'caterpillar']);
  });

  it('merge, aspects, ★-builds and early Ascension are off', () => {
    const g = medium();
    g.state.amber = 99999;
    g.state.star = 999;
    expect(g.buildStars('L0', 'hive', 1)).toBe(false);
    for (const id of ['L0', 'R0']) expect(g.build(id, 'hive')).toBe(true);
    const st = g.structureAt('L0')!;
    expect(g.mergeNests(st.id)).toBe(false);
    expect(g.upgradeAspect(st.id, 'dmg')).toBe(false);
    expect(g.state.structures).toHaveLength(2);
    st.tier = BASE_TIERS + 1; st.spec = 'A';
    g.state.tree.stage = 3;
    expect(g.ascendNest(st.id)).toBe(false);
    g.state.tree.stage = 4;
    expect(g.ascendNest(st.id)).toBe(true);
  });
});
