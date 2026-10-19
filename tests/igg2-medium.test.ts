import { describe, expect, it } from 'vitest';
import { ABILITIES, ENEMIES, SLOTS, WORLD } from '../src/data/balance';
import { NIGHTS } from '../src/data/nights';
import { TREE } from '../src/data/tree';
import { MEDIUM, MEDIUM_NIGHTS, WORLDS, isBossNight, type WorldObjectDef } from '../src/data/worlds';
import { CREATURE_CARDS, OBJECT_CARDS } from '../src/data/cards';
import { Game } from '../src/sim/game';
import { objectsOf } from '../src/sim/objects';
import { spawnX } from '../src/sim/medium';
import { GUIDE_STEPS } from '../src/ui/guide';
import { stageNews } from '../src/ui/stageNews';

/** IGG2 phase 6: the medium world «Поляна» — Rifts, Dead Trees, Sleepers, stelae, nights, victory (spec §6). */

const steps = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60) && !g.over; i++) g.step(); };
const medium = (seed = 1) => new Game({ seed, world: 'medium' });
const at = (g: Game, x: number, dir: 1 | -1 = 1) => { g.state.keeper.x = x; g.state.keeper.dir = dir; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priv = (g: Game) => g as any;
/** jump the Tree to a stage (with its Circle at once) */
const stage = (g: Game, n: number) => { g.state.tree.stage = n; g.state.tree.radius = g.treeRadius(); };
/** run the current night to its end: hostiles cleared, nothing pending, a truce's quiet over */
const finishNight = (g: Game) => {
  if (g.state.phase === 'day') priv(g).startNight();
  g.state.pending = [];
  g.state.enemies = [];
  g.state.phaseTime = 999;
  g.step();
};
const obj = <K extends WorldObjectDef['kind']>(kind: K, i = 0) => WORLDS.medium.objects.filter((o) => o.kind === kind)[i] as Extract<WorldObjectDef, { kind: K }>;
/** hold S at x until the pour is done (or `secs` pass) */
const pourAt = (g: Game, x: number, secs = 6) => {
  at(g, x);
  g.setPour(true);
  for (let i = 0; i < secs * 60 && g.state.interact.pour; i++) g.step();
  g.setPour(false);
};
const T = WORLDS.medium.treeX;

describe('the medium world layout (spec §6)', () => {
  it('3200 wide, Tree at 1600, stages 0→5, Treasury 60', () => {
    const g = medium();
    expect(WORLD.width).toBe(3200);
    expect(WORLD.treeX).toBe(1600);
    expect(g.world.maxStage).toBe(5);
    expect(g.state.amber).toBe(60);
    expect(g.state.tree.stage).toBe(0);
  });

  it('Rifts at x 140 and 3060, Dead Trees at treeX ∓ 700, Sleepers at treeX ∓ 1000, two stelae', () => {
    expect([obj('rift', 0), obj('rift', 1)].map((o) => [o.x, o.side, o.amber, o.star, o.minStage])).toEqual([[140, 'L', 120, 3, 3], [3060, 'R', 120, 3, 3]]);
    expect([obj('deadTree', 0), obj('deadTree', 1)].map((o) => [o.x - T, o.cost, o.radius, o.hp, o.slots])).toEqual([[-700, 60, 110, 400, 2], [700, 60, 110, 400, 2]]);
    expect([obj('sleeper', 0), obj('sleeper', 1)].map((o) => [o.x - T, o.family, o.cost])).toEqual([[-1000, 'caterpillar', 30], [1000, 'dragonfly', 30]]);
    const st = [obj('stela', 0), obj('stela', 1)];
    expect(st.map((o) => [Math.sign(o.x - T), o.star, o.blessing, o.power])).toEqual([[-1, 4, 'nestHp', 0.2], [1, 4, 'lightRegen', 0.3]]);
    // stelae sit clear of the outermost slots (L9/R9 at ∓420) so the focus never fights over them
    for (const o of st) for (const sl of SLOTS) expect(Math.abs(sl.x - o.x)).toBeGreaterThan(2 * 14);
  });

  it('six geodes and two grazing herds through world.objects', () => {
    const g = medium();
    expect(objectsOf(g, 'geode')).toHaveLength(6);
    const herds = objectsOf(g, 'herd');
    expect(herds).toHaveLength(2);
    expect(g.state.herd).toHaveLength(herds.reduce((a, h) => a + h.o.count, 0));
    expect(new Set(g.state.herd.map((e) => e.herd)).size).toBe(2);
  });

  it('every interactable object is focusable at its x and none shadows another', () => {
    const g = medium();
    for (const kind of ['rift', 'deadTree', 'sleeper', 'stela', 'geode'] as const) {
      for (const { o } of objectsOf(g, kind)) { at(g, o.x); expect(g.focus()?.kind).toBe(kind); }
    }
  });
});

describe('Void Rifts: spawning (spec §6)', () => {
  it('creatures come out at max(rift, treeX ∓ 900)', () => {
    const g = medium();
    expect(spawnX(g, 'L')).toBe(Math.max(140, T - 900));
    expect(spawnX(g, 'R')).toBe(Math.min(3060, T + 900));
    priv(g).startNight();
    steps(g, 5);
    const xs = g.state.enemies.map((e) => e.x);
    expect(xs.length).toBeGreaterThan(0);
    for (const e of g.state.enemies) expect(Math.abs(e.x - T)).toBeLessThanOrEqual(900);
  });

  it('legacy and micro keep spawning beyond their world edges', () => {
    const m = new Game({ seed: 1, world: 'micro' });
    expect(spawnX(m, 'L')).toBe(-WORLD.spawnMargin);
    expect(spawnX(m, 'R')).toBe(WORLD.width + WORLD.spawnMargin);
  });
});

describe('Void Rifts: sealing (spec §6)', () => {
  const ready = (g: Game) => { stage(g, 3); g.state.star = 10; g.state.keeper.purse = 0; g.state.amber = 0; };

  it('sealing needs the Tree at stage 3, by day, 3 Star Blood and 120 Amber poured', () => {
    const g = medium();
    const r = obj('rift', 0);
    at(g, r.x);
    stage(g, 2);
    expect(g.focus()).toMatchObject({ kind: 'rift', canAct: false, price: 120, star: 3 });
    expect(g.focus()!.reason).toContain('Древо');
    stage(g, 3);
    g.state.star = 2;
    expect(g.focus()!.canAct).toBe(false);
    expect(g.focus()!.reason).toContain('Звёздная Кровь');
    g.state.star = 3;
    expect(g.focus()!.canAct).toBe(true);
    // by night: no
    priv(g).startNight();
    expect(g.focus()!.canAct).toBe(false);
  });

  it('pouring 120 + paying 3 Star Blood seals it; the Eclipse cuts the day short', () => {
    const g = medium();
    ready(g);
    g.state.keeper.purse = 120;
    g.state.dayLeft = 30;
    const r = obj('rift', 0);
    pourAt(g, r.x);
    expect(g.state.mw.sealed).toEqual(['L']);
    expect(g.state.star).toBe(7);
    expect(g.state.keeper.purse).toBe(0);
    expect(g.state.mw.wave).toBe('L');
    expect(g.state.mw.eclipse).toBeGreaterThan(0);
    expect(g.state.dayLeft).toBeLessThanOrEqual(MEDIUM.eclipseDay);
    expect(g.drainEvents().some((e) => e.type === 'riftSealed')).toBe(true);
  });

  it('the next night is the retaliation wave: its groups ×1.4 (first seal)', () => {
    const base = medium(2);
    for (let n = 0; n < 3; n++) finishNight(base);
    priv(base).startNight();
    const normal = base.state.pending.length;

    const g = medium(2);
    for (let n = 0; n < 3; n++) finishNight(g);
    ready(g);
    g.state.keeper.purse = 120;
    pourAt(g, obj('rift', 0).x);
    priv(g).startNight();
    expect(g.state.mw.waveNight).toBe(3);
    const def = g.night(3);
    const expected = def.groups.reduce((a, x) => a + (x.side === 'B' ? 2 : 1) * (ENEMIES[x.kind].boss ? x.count : Math.max(1, Math.round(x.count * MEDIUM.waveBase))), 0);
    expect(g.state.pending.length).toBe(expected);
    expect(g.state.pending.length).toBeGreaterThan(normal);
  });

  it('after the wave is survived the sealed side is silent for good', () => {
    const g = medium();
    for (let n = 0; n < 3; n++) finishNight(g);
    ready(g);
    g.state.keeper.purse = 120;
    pourAt(g, obj('rift', 0).x);
    priv(g).startNight();
    expect(g.state.pending.some((p: { side: string }) => p.side === 'L')).toBe(true); // the wave itself comes
    finishNight(g);
    expect(g.state.mw.silent).toEqual(['L']);
    expect(g.state.mw.wave).toBeNull();
    for (let n = 0; n < 6; n++) {
      priv(g).startNight();
      expect(g.state.pending.every((p: { side: string }) => p.side === 'R')).toBe(true);
      finishNight(g);
    }
  });

  it('the second Rift can\'t be sealed before the first one\'s wave is survived; it costs 240', () => {
    const g = medium();
    ready(g);
    g.state.keeper.purse = 120;
    pourAt(g, obj('rift', 0).x);
    const r2 = obj('rift', 1);
    at(g, r2.x);
    expect(g.focus()).toMatchObject({ canAct: false, price: 240 });
    expect(g.focus()!.reason).toContain('ответную волну');
    g.state.keeper.purse = 240;
    pourAt(g, r2.x, 2);
    expect(g.state.mw.sealed).toEqual(['L']);
    expect(g.state.keeper.purse).toBe(240); // nothing poured
    finishNight(g); // the wave night
    at(g, r2.x);
    expect(g.focus()!.canAct).toBe(true);
  });

  it('the second wave is ×1.7; surviving it silences both sides → won', () => {
    const g = medium();
    ready(g);
    g.state.keeper.purse = 120;
    pourAt(g, obj('rift', 0).x);
    finishNight(g);
    g.state.keeper.purse = 240;
    pourAt(g, obj('rift', 1).x);
    expect(g.state.mw.sealed).toEqual(['L', 'R']);
    priv(g).startNight();
    const n = g.state.night;
    const def = g.night(n);
    // only the right side still sends, ×(1.4 + 0.3·1)
    const mul = MEDIUM.waveBase + MEDIUM.waveStep;
    const groups = def.quiet ? g.night(n - 1).groups : def.groups;
    const expected = groups.filter((x) => x.side !== 'L').reduce((a, x) => a + (ENEMIES[x.kind].boss ? x.count : Math.max(1, Math.round(x.count * mul))), 0);
    expect(g.state.pending.length).toBe(expected);
    expect(g.state.pending.every((p: { side: string }) => p.side === 'R')).toBe(true);
    g.drainEvents();
    finishNight(g);
    expect(g.state.mw.silent).toEqual(['L', 'R']);
    expect(g.state.phase).toBe('won');
    expect(g.won).toBe(true);
    expect(g.drainEvents().some((e) => e.type === 'won')).toBe(true);
    expect(g.stars()).toBeGreaterThanOrEqual(1);
  });

  it('a wave that falls on a truce breaks it: the night before comes again, fatter', () => {
    const g = medium();
    for (let n = 0; n < 6; n++) finishNight(g); // next: night 7, the truce
    expect(g.night(6).truce).toBe(true);
    ready(g);
    g.state.keeper.purse = 120;
    pourAt(g, obj('rift', 0).x);
    priv(g).startNight();
    expect(g.state.pending.length).toBeGreaterThan(0);
    expect(g.state.pending.some((p: { kind: string }) => p.kind === 'mother')).toBe(true);
  });
});

describe('Dead Trees (spec §6)', () => {
  it('pouring 60 lights one: small Circle r110 (isLit), its 2 slots open, husk HP 400', () => {
    const g = medium();
    const d = obj('deadTree', 0);
    const slots = SLOTS.filter((s) => s.husk === 'deadTree:2');
    expect(slots).toHaveLength(2);
    expect(slots.every((s) => !g.slotUnlocked(s))).toBe(true);
    expect(g.isLit(d.x, false)).toBe(false);
    g.state.keeper.purse = 60;
    pourAt(g, d.x);
    expect(g.state.mw.husks['deadTree:2']).toBe(400);
    expect(g.state.keeper.purse).toBe(0);
    expect(g.isLit(d.x + 110, false)).toBe(true);
    expect(g.isLit(d.x - 110, false)).toBe(true);
    expect(g.isLit(d.x + 112, false)).toBe(false);
    expect(g.isLit(d.x + 110 * TREE.rootLightFactor - 1, true)).toBe(true); // worms under it burn
    expect(slots.every((s) => g.slotUnlocked(s))).toBe(true);
    // a nest on its slot
    g.state.keeper.purse = 60;
    pourAt(g, slots[0].x);
    expect(g.structureAt(slots[0].id)?.family).toBe('hive');
  });

  it('creatures gnaw a burning husk; at 0 it goes out: dark again, slots closed', () => {
    const g = medium();
    const d = obj('deadTree', 0);
    g.state.mw.husks['deadTree:2'] = 400;
    priv(g).startNight();
    g.state.pending = [];
    const e = g.spawnEnemy('stalker', d.x - 30, 1);
    e.hp = e.maxHp = 1e6;
    steps(g, 8);
    expect(g.state.mw.husks['deadTree:2'] ?? 0).toBeLessThan(400);
    expect(e.x).toBeLessThan(d.x); // it stopped at the husk
    g.state.mw.husks['deadTree:2'] = 1;
    steps(g, 3);
    expect(g.state.mw.husks['deadTree:2']).toBeUndefined();
    expect(g.isLit(d.x, false)).toBe(false);
    expect(SLOTS.filter((s) => s.husk === 'deadTree:2').every((s) => !g.slotUnlocked(s))).toBe(true);
    at(g, d.x);
    expect(g.focus()).toMatchObject({ kind: 'deadTree', canAct: true, price: 60 }); // can be lit again
  });
});

describe('Sleeping Creatures (spec §6)', () => {
  it('caterpillars and dragonflies are closed until their Sleeper is woken for 30', () => {
    const g = medium();
    expect(g.familyOpen('caterpillar')).toBe(false);
    expect(g.familyOpen('dragonfly')).toBe(false);
    const s0 = obj('sleeper', 0);
    at(g, s0.x);
    expect(g.focus()).toMatchObject({ kind: 'sleeper', price: 30, canAct: true });
    g.state.keeper.purse = 30;
    pourAt(g, s0.x);
    expect(g.state.unlockedFamilies).toEqual(['caterpillar']);
    expect(g.familyOpen('caterpillar')).toBe(true);
    expect(g.familyOpen('dragonfly')).toBe(false);
    at(g, s0.x);
    expect(g.focus()?.kind).not.toBe('sleeper'); // it woke and left
    g.state.keeper.purse = 30;
    pourAt(g, obj('sleeper', 1).x);
    expect(g.familyOpen('dragonfly')).toBe(true);
    // the woken families show up on an empty slot
    at(g, T - 42);
    expect(g.focus()!.options.map((o) => o.id)).toEqual(expect.arrayContaining(['caterpillar', 'dragonfly']));
  });
});

describe('Observer stelae (spec §6)', () => {
  it('the plate tells what it gives before paying; 4 Star Blood buys the blessing', () => {
    const g = medium();
    const st = obj('stela', 0);
    at(g, st.x);
    expect(g.focus()!.role).toContain('+20% прочности');
    expect(g.focus()).toMatchObject({ star: 4, canAct: false });
    g.state.star = 4;
    expect(g.focus()!.canAct).toBe(true);
    // a hive before and after
    stage(g, 0);
    g.state.amber = 999;
    g.build('L0', 'hive');
    const nest = g.structureAt('L0')!;
    const hp0 = nest.maxHp;
    pourAt(g, st.x, 1);
    expect(g.state.star).toBe(0);
    expect(g.state.mw.blessed).toEqual(['stela:6']);
    expect(nest.maxHp).toBe(Math.round(hp0 * 1.2));
    at(g, st.x);
    expect(g.focus()!.canAct).toBe(false); // once
  });

  it('the Stela of Light: Light regen +30%', () => {
    const g = medium();
    const before = g.lightRegenFactor(T);
    g.state.star = 4;
    pourAt(g, obj('stela', 1).x, 1);
    expect(g.lightRegenFactor(T)).toBeCloseTo(before * 1.3);
  });
});

describe('Star Blood is the key (spec §6)', () => {
  it('picked up straight into state.star — never into the purse, even when the purse is full', () => {
    const g = medium();
    g.state.keeper.purse = g.purseCap();
    g.dropAt(g.state.keeper.x, 'star', 3);
    steps(g, 2);
    expect(g.state.star).toBe(3);
    expect(g.state.keeper.purse).toBe(g.purseCap());
  });

  it('Worms drop it', () => {
    expect(ENEMIES.worm.star).toBeGreaterThan(0);
    expect(MEDIUM_NIGHTS[2].groups.some((x) => x.kind === 'worm')).toBe(true);
  });
});

describe('stage openings (spec §6)', () => {
  it('stages open: 1 Star Blood + the stone, 2 forks, 3 Starfall + sealing, 4 Ascension — each with a banner and a line', () => {
    const w = WORLDS.medium;
    expect(stageNews(w, 1).items.join(' ')).toContain('Звёздная Кровь');
    expect(stageNews(w, 2).items).toContain('развилки гнёзд');
    expect(stageNews(w, 3).items).toEqual(expect.arrayContaining(['запечатывание Разломов', `руна ${ABILITIES.starfall.name} [3]`]));
    expect(stageNews(w, 4).items).toContain('Возвышение гнёзд');
    for (const n of [1, 2, 3, 4, 5]) expect(stageNews(w, n).line).toBeTruthy();
    // micro has no Rift line
    expect(stageNews(WORLDS.micro, 1).items.join(' ')).not.toContain('Разлом');
  });

  it('a growth emits the banner event', () => {
    const g = medium();
    g.state.amber = 999;
    g.pourGrowth(g.growCost());
    expect(g.drainEvents().some((e) => e.type === 'treeGrew' && e.stage === 1)).toBe(true);
  });
});

describe('medium nights (spec §6)', () => {
  const kinds = (n: number) => MEDIUM_NIGHTS[n].groups.map((x) => x.kind);

  it('1 hounds, 2 foragers, 3 worm, 4 stalkers, 5 spitters, 6 the Mother, 7 a truce', () => {
    expect(new Set(kinds(0))).toEqual(new Set(['hound']));
    expect(kinds(1)).toContain('forager');
    expect(kinds(1)).not.toContain('worm');
    expect(kinds(2)).toContain('worm');
    expect(kinds(2)).not.toContain('stalker');
    expect(kinds(3)).toContain('stalker');
    expect(kinds(3)).not.toContain('spitter');
    expect(kinds(4)).toContain('spitter');
    expect(kinds(5)).toContain('mother');
    expect(isBossNight(MEDIUM_NIGHTS[5])).toBe(true);
    expect(MEDIUM_NIGHTS[6]).toMatchObject({ truce: true, groups: [] });
    expect(MEDIUM_NIGHTS[6].quiet).toBe(MEDIUM.truceT);
  });

  it('nights 8–12 are the legacy nights 6–10; no Землерой before night 9', () => {
    for (let i = 0; i < 5; i++) {
      const own = MEDIUM_NIGHTS[7 + i].groups;
      const old = NIGHTS[5 + i].groups.filter((x) => x.kind !== 'tunneler' || 7 + i >= 8);
      expect(own).toEqual(old);
    }
    expect(MEDIUM_NIGHTS[7].groups.some((x) => x.kind === 'tunneler')).toBe(false);
    expect(NIGHTS[5].groups.some((x) => x.kind === 'tunneler')).toBe(true);
  });

  it('diggers drive no tunnels before night 9 (index 8), they do from it', () => {
    const g = medium();
    g.state.night = 7;
    g.spawnEnemy('worm', 700, 1);
    expect(g.state.tunnels).toHaveLength(0);
    g.state.night = 8;
    g.spawnEnemy('worm', 700, 1);
    expect(g.state.tunnels).toHaveLength(1);
  });

  it('a truce night is silent and lasts its quiet seconds', () => {
    const g = medium();
    for (let n = 0; n < 6; n++) finishNight(g);
    priv(g).startNight();
    expect(g.state.pending).toHaveLength(0);
    steps(g, MEDIUM.truceT - 1);
    expect(g.state.phase).toBe('night');
    steps(g, 2);
    expect(g.state.phase).toBe('day');
    expect(g.state.night).toBe(7);
  });

  it('then the ENDLESS generator — with a truce after every boss night', () => {
    const g = medium();
    expect(g.campaignNights).toBe(12);
    expect(isBossNight(g.night(11))).toBe(true); // Ночь Палача
    expect(g.night(12).truce).toBe(true);
    let bosses = 0;
    for (let n = 12; n < 60; n++) {
      const d = g.night(n);
      expect(d.title.startsWith(`Ночь ${n + 1}`)).toBe(true);
      if (isBossNight(g.night(n - 1))) expect(d.truce).toBe(true);
      else expect(d.truce).toBeFalsy();
      if (isBossNight(d)) bosses++;
    }
    expect(bosses).toBeGreaterThan(5);
    // deterministic
    expect(medium(9).night(40)).toEqual(g.night(40));
  });

  it('«winter»: every 8th night the dawn income is halved', () => {
    const g = medium();
    expect([7, 15, 23].every((n) => g.isWinter(n))).toBe(true);
    expect([0, 6, 8, 14].some((n) => g.isWinter(n))).toBe(false);
    const inc = WORLDS.medium.dawnIncome!;
    for (let n = 0; n < 8; n++) {
      g.drainEvents();
      finishNight(g);
      const dawn = g.drainEvents().find((e) => e.type === 'dawn') as { gift: number; winter?: boolean };
      const full = inc.base + inc.perStage * g.state.tree.stage;
      expect(dawn.gift).toBe(n === 7 ? Math.round(full * 0.5) : full);
      expect(!!dawn.winter).toBe(n === 7);
    }
  });

  it('no legacy «ten nights» milestone in the in-world worlds', () => {
    const g = medium();
    for (let n = 0; n < 12; n++) finishNight(g);
    expect(g.drainEvents().some((e) => e.type === 'milestone')).toBe(false);
  });
});

describe('cards, guide, naming', () => {
  it('every creature of the medium nights has a first-encounter card; each new object kind has one', () => {
    const all = new Set(MEDIUM_NIGHTS.flatMap((d) => d.groups.map((x) => x.kind)));
    for (const k of all) expect(CREATURE_CARDS[k], k).toBeDefined();
    for (const k of ['rift', 'deadTree', 'sleeper', 'stela'] as const) expect(OBJECT_CARDS[k]).toBeDefined();
  });

  // phase 7 completed the medium guide (spec §7): the four phase-6 steps keep their order
  it('Кыш has medium steps: Sleeper, Dead Tree, the stone, …, the Rift', () => {
    expect(GUIDE_STEPS.medium.map((s) => s.id).filter((id) => ['wake', 'husk', 'stone', 'rift'].includes(id))).toEqual(['wake', 'husk', 'stone', 'rift']);
    const g = medium();
    expect(GUIDE_STEPS.medium[0].target(g)).toBe(obj('sleeper', 0).x);
  });

  it('the Hammer is «Игг-Молот» everywhere in-world (banner and the Observer\'s line)', () => {
    const line = WORLDS.micro.runeUnlocks!.find((u) => u.rune === 'hammer')!.line!;
    expect(line).toContain(`${ABILITIES.hammer.name} [2]`);
    expect(JSON.stringify(WORLDS.micro.nights)).not.toContain('Прыжок Молота');
  });
});

describe('snapshots and determinism', () => {
  it('the medium state survives a snapshot', () => {
    const g = medium();
    g.state.mw.husks['deadTree:2'] = 321;
    g.state.mw.sealed = ['L'];
    g.state.mw.silent = ['L'];
    const r = new Game({ seed: 1 });
    expect(r.restore(g.snapshot())).toBe(true);
    expect(r.state.mw).toMatchObject({ husks: { 'deadTree:2': 321 }, sealed: ['L'], silent: ['L'] });
    expect(r.isLit(900, false)).toBe(true);
  });

  it('two medium runs with the same seed and inputs are identical', () => {
    const run = () => {
      const g = medium(4);
      g.state.keeper.purse = 60;
      pourAt(g, obj('deadTree', 1).x);
      g.callNight();
      steps(g, 40);
      return JSON.stringify(g.state.enemies.map((e) => [e.kind, Math.round(e.x * 100)]));
    };
    expect(run()).toBe(run());
  });
});
