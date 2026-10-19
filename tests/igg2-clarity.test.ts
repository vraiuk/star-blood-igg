import { describe, expect, it } from 'vitest';
import { ENEMIES, WORLD } from '../src/data/balance';
import { MEDIUM, WORLDS, isBossNight, type WorldObjectDef } from '../src/data/worlds';
import { Game } from '../src/sim/game';
import { aheadDistance, lightFront, nightLead, spawnX } from '../src/sim/medium';
import { CLARITY, dayMood, distToLight, litSpans, roughCount, speedsFor, stepSpeedIn, stripF, stripMap, threatArrows } from '../src/ui/clarity';
import { defeatReason } from '../src/ui/defeat';
import { GUIDE_STEPS, currentStep } from '../src/ui/guide';
import { HeldKeys } from '../src/ui/input';

/** IGG2 phase 7: the clarity layer (spec §7) — arrows, strip map, day digit, speed caps, input, guide. */

const steps = (g: Game, seconds: number) => { for (let i = 0; i < Math.round(seconds * 60) && !g.over; i++) g.step(); };
const medium = (seed = 1) => new Game({ seed, world: 'medium' });
const micro = (seed = 1) => new Game({ seed, world: 'micro' });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const priv = (g: Game) => g as any;
const T = WORLDS.medium.treeX;
const obj = <K extends WorldObjectDef['kind']>(kind: K, i = 0) => WORLDS.medium.objects.filter((o) => o.kind === kind)[i] as Extract<WorldObjectDef, { kind: K }>;
/** a camera view 720 px wide centred on x */
const viewAt = (x: number) => ({ x: x - 360, w: 720 });
const none = () => false;

describe('speed caps (spec §7)', () => {
  it('×2 at once in both worlds, ×5 only in the medium world', () => {
    expect(speedsFor(WORLDS.micro.maxSpeed)).toEqual([1, 1.25, 1.5, 2]);
    expect(speedsFor(WORLDS.medium.maxSpeed)).toEqual([1, 1.25, 1.5, 2, 5]);
    expect(speedsFor(WORLDS.micro.maxSpeed)).not.toContain(5);
  });

  it('− / + never wrap around, an unknown speed falls back to ×1', () => {
    const l = speedsFor(2);
    expect(stepSpeedIn(l, 2, 1)).toBe(2);
    expect(stepSpeedIn(l, 1, -1)).toBe(1);
    expect(stepSpeedIn(l, 1.5, 1)).toBe(2);
    expect(stepSpeedIn(l, 5, 1)).toBe(1);
  });
});

describe('offscreen threat arrows (spec §7)', () => {
  it('rough counts: exact up to 3, then 5+, 10+, 20+', () => {
    expect([1, 3, 4, 5, 9, 10, 19, 20, 50].map(roughCount)).toEqual(['1', '3', '4', '5+', '5+', '10+', '10+', '20+', '20+']);
  });

  it('counts creatures outside the view within reach of the Circle, per side', () => {
    const g = medium();
    priv(g).startNight();
    g.state.pending = [];
    const edge = T - g.state.tree.radius;
    for (let i = 0; i < 4; i++) g.spawnEnemy('hound', edge - 420 - i * 10, 1);
    g.spawnEnemy('hound', edge - CLARITY.reach - 40, 1); // too far from the light
    g.spawnEnemy('hound', T + 20, -1); // in the view
    const a = threatArrows(g, viewAt(T));
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ side: 'L', count: 4, label: '4', tier: 'pack', hit: false });
    expect(a[0].urgency).toBeGreaterThan(0);
    expect(a[0].urgency).toBeLessThan(0.5);
  });

  it('nearer means more urgent; a boss or an elite colours the arrow', () => {
    const g = medium();
    priv(g).startNight();
    g.state.pending = [];
    g.spawnEnemy('hound', T + 400, -1);
    const far = threatArrows(g, viewAt(T - 300))[0];
    g.state.enemies[0].x = T + g.state.tree.radius + 20;
    const near = threatArrows(g, viewAt(T - 400))[0];
    expect(near.urgency).toBeGreaterThan(far.urgency);
    g.state.enemies[0].affix = 'armored';
    expect(threatArrows(g, viewAt(T - 400))[0].tier).toBe('elite');
    g.spawnEnemy('mother', T + 300, -1);
    expect(threatArrows(g, viewAt(T - 400))[0].tier).toBe('boss');
  });

  it('neutral grazers never count; a burning Dead Tree extends the light', () => {
    const g = medium();
    priv(g).startNight();
    g.state.pending = [];
    // the herd lives at the world edges, far outside the view
    expect(g.state.herd.length).toBeGreaterThan(0);
    expect(threatArrows(g, viewAt(T))).toEqual([]);
    const husk = obj('deadTree', 0);
    g.spawnEnemy('hound', husk.x - husk.radius - 100, 1);
    expect(threatArrows(g, viewAt(T))).toEqual([]);
    g.state.mw.husks['deadTree:2'] = husk.hp;
    expect(litSpans(g)).toHaveLength(2);
    expect(distToLight(litSpans(g), husk.x)).toBe(0);
    expect(threatArrows(g, viewAt(T))[0]).toMatchObject({ side: 'L', count: 1 });
  });

  it('an offscreen hit on a nest or Dead Tree makes its side urgent; an on-screen one does not', () => {
    const g = medium();
    expect(threatArrows(g, viewAt(T), [{ x: T - 800, t: 1 }])[0]).toMatchObject({ side: 'L', hit: true, urgency: 1, label: '!' });
    expect(threatArrows(g, viewAt(T), [{ x: T + 100, t: 1 }])).toEqual([]);
    expect(threatArrows(g, viewAt(T), [{ x: T - 800, t: 0 }])).toEqual([]);
  });
});

describe('the strip map (spec §7)', () => {
  it('projects the world onto 0..1: the Tree in the middle, the Circle around it, the camera window', () => {
    const g = medium();
    const m = stripMap(g, viewAt(T));
    expect(stripF(T)).toBe(0.5);
    expect(stripF(-50)).toBe(0);
    expect(stripF(WORLD.width + 50)).toBe(1);
    expect(m.marks.find((x) => x.kind === 'tree')!.f).toBe(0.5);
    expect(m.circle[0]).toBeCloseTo((T - g.state.tree.radius) / WORLD.width);
    expect(m.circle[1]).toBeCloseTo((T + g.state.tree.radius) / WORLD.width);
    expect(m.view![1] - m.view![0]).toBeCloseTo(720 / WORLD.width);
    expect(m.marks.find((x) => x.kind === 'keeper')!.f).toBeCloseTo(g.state.keeper.x / WORLD.width);
  });

  it('medium: Rifts, Dead Trees, Sleepers, stelae and seen geodes; states change the marks', () => {
    const g = medium();
    const kinds = (m = stripMap(g)) => m.marks.map((x) => x.kind);
    const count = (k: string) => kinds().filter((x) => x === k).length;
    expect(count('rift')).toBe(2);
    expect(count('husk')).toBe(2);
    expect(count('sleeper')).toBe(2);
    expect(count('stela')).toBe(2);
    expect(count('geode')).toBe(6);
    g.state.mw.sealed.push('L');
    g.state.mw.husks['deadTree:2'] = 400;
    g.state.mw.woken.push('sleeper:4');
    g.state.mw.blessed.push('stela:6');
    g.state.wobj.cracked.push('geode:8');
    expect([count('rift'), count('riftSealed'), count('husk'), count('huskLit'), count('sleeper'), count('stela'), count('geode')]).toEqual([1, 1, 1, 1, 1, 1, 5]);
    expect(stripMap(g).lights).toHaveLength(1);
    g.state.mw.silent.push('L');
    expect(count('riftSilent')).toBe(1);
  });

  it('creatures show only at night (bosses marked apart); the herd never shows', () => {
    const g = medium();
    g.spawnEnemy('hound', T + 500, -1);
    expect(stripMap(g).marks.some((x) => x.kind === 'enemy')).toBe(false);
    priv(g).startNight();
    g.state.pending = [];
    g.spawnEnemy('mother', T - 600, 1);
    const k = stripMap(g).marks.map((x) => x.kind);
    expect(k.filter((x) => x === 'enemy')).toHaveLength(1);
    expect(k).toContain('boss');
    expect(k.filter((x) => x === 'enemy' || x === 'boss')).toHaveLength(2);
  });

  it('micro gets it too: Tree, Keeper, seen geodes, no Rifts', () => {
    const g = micro();
    const k = stripMap(g).marks.map((x) => x.kind);
    expect(k).toContain('tree');
    expect(k).toContain('keeper');
    expect(k).toContain('geode');
    expect(k).not.toContain('rift');
    expect(stripMap(g).marks.find((x) => x.kind === 'tree')!.f).toBe(0.5);
  });
});

describe('the day digit (spec §7)', () => {
  it('safe by day, warm when the night is near, violet at an ordinary night', () => {
    const g = medium();
    expect(dayMood(g)).toBe('safe');
    g.state.dayLeft = CLARITY.soon - 1;
    expect(dayMood(g)).toBe('soon');
    priv(g).startNight();
    expect(dayMood(g)).toBe('night');
  });

  it('red for the Mother and the retaliation wave, blue for the truce, pale for «winter»', () => {
    const g = medium();
    g.state.night = 5;
    expect(dayMood(g)).toBe('boss');
    g.state.night = 6;
    expect(dayMood(g)).toBe('truce');
    g.state.night = 7;
    expect(g.isWinter(7)).toBe(true);
    expect(dayMood(g)).toBe(isBossNight(g.night(7)) ? 'boss' : 'winter');
    g.state.night = 2;
    g.state.mw.wave = 'L';
    g.state.mw.waveNight = null;
    expect(dayMood(g)).toBe('wave');
    g.state.mw.wave = null;
    g.state.mw.eclipse = 5;
    expect(dayMood(g)).toBe('wave');
  });

  it('micro: the Gigantopithecus night reads red', () => {
    const g = micro();
    g.state.night = 3;
    expect(dayMood(g)).toBe('boss');
    g.state.night = 0;
    expect(dayMood(g)).toBe('safe');
  });
});

describe('Натиск and the truce (phase 6 open issue)', () => {
  it('micro has no Натиск at all (spec §5)', () => {
    const g = micro();
    priv(g).startNight();
    expect(g.canRush()).toBe(false);
    const n = g.state.night;
    expect(g.callNight()).toBe(false);
    expect(g.state.night).toBe(n);
  });

  it('medium: Натиск on an ordinary night, never on a truce or into one', () => {
    const g = medium();
    priv(g).startNight();
    expect(g.canRush()).toBe(true);
    g.state.night = 5; // the Mother — the next night is the truce
    priv(g).startNight();
    expect(g.canRush()).toBe(false);
    g.state.night = 6; // the truce itself
    priv(g).startNight();
    expect(g.night(6).truce).toBe(true);
    expect(g.canRush()).toBe(false);
    expect(g.callNight()).toBe(false);
    expect(g.state.night).toBe(6);
  });

  it('a retaliation wave breaks the next truce, so Натиск into it is allowed', () => {
    const g = medium();
    g.state.night = 5;
    g.state.mw.wave = 'L';
    g.state.mw.waveNight = 7;
    priv(g).startNight();
    expect(g.canRush()).toBe(true);
  });

  it('legacy keeps its Натиск', () => {
    const g = new Game({ seed: 3 });
    while (g.choice) g.choose(0);
    priv(g).startNight();
    expect(g.canRush()).toBe(true);
  });
});

describe('the night lead-in (spec §6: the night falls as the first groups come near)', () => {
  it('the first group reaches the light about `arriveIn` s after nightfall, not ~20 s', () => {
    const g = medium();
    const front = lightFront(g, 'L');
    expect(front).toBe(T - g.state.tree.radius);
    const firstAt = g.night(0).groups[0].at * 1.25;
    const lead = nightLead(g, 'L', 'hound', firstAt);
    const travel = Math.abs(spawnX(g, 'L') - front) / ENEMIES.hound.speed;
    expect(travel).toBeGreaterThan(15);
    expect(lead).toBeCloseTo(firstAt + travel - WORLDS.medium.arriveIn!, 5);
    priv(g).startNight();
    // follow the first creature of the left side until it meets the light
    let t = 0, first: number | null = null;
    while (t < 40) {
      g.step();
      t += 1 / 60;
      const e = g.state.enemies.find((x) => x.dir === 1 && x.kind === 'hound');
      if (e && first === null) first = e.id;
      const f = g.state.enemies.find((x) => x.id === first);
      if (f && f.x >= front - 2) break;
    }
    expect(first).not.toBeNull();
    expect(t).toBeLessThan(WORLDS.medium.arriveIn! + 3);
    expect(t).toBeGreaterThan(WORLDS.medium.arriveIn! - 3);
  });

  it('every creature still starts at its Rift reach or on the way from it, never in the light', () => {
    const g = medium(4);
    priv(g).startNight();
    const xs: number[] = [];
    for (let i = 0; i < 60 * 40; i++) {
      const before = new Set(g.state.enemies.map((e) => e.id));
      g.step();
      for (const e of g.state.enemies) if (!before.has(e.id) && e.kind !== 'larva') xs.push(e.x);
    }
    expect(xs.length).toBeGreaterThan(0);
    for (const x of xs) {
      expect(Math.abs(x - T)).toBeLessThanOrEqual(900);
      expect(Math.abs(x - T)).toBeGreaterThanOrEqual(g.state.tree.radius + MEDIUM.leadGap - 1);
    }
    // later groups still come straight out of the Rift reach
    expect(Math.max(...xs)).toBeGreaterThan(spawnX(g, 'R') - 2);
  });

  it('a burning Dead Tree is the front: nobody appears past it', () => {
    const g = medium();
    const husk = obj('deadTree', 0);
    g.state.mw.husks['deadTree:2'] = husk.hp;
    expect(lightFront(g, 'L')).toBe(husk.x - husk.radius);
    const far = aheadDistance(g, 'L', 'hound', 999);
    expect(spawnX(g, 'L') + far).toBeLessThanOrEqual(husk.x - husk.radius - MEDIUM.leadGap);
  });

  it('micro and legacy have no lead-in', () => {
    expect(WORLDS.micro.arriveIn).toBeUndefined();
    expect(WORLDS.legacy.arriveIn).toBeUndefined();
    expect(nightLead(micro(), 'L', 'hound', 2)).toBe(0);
  });
});

describe('input reset (phase 6 open issue: the Keeper walked by himself)', () => {
  it('a key whose keyup reports another name is still released by its physical code', () => {
    const h = new HeldKeys();
    h.down('d', 'KeyD');
    expect(h.moveDir()).toBe(1);
    h.up('∂', 'KeyD'); // Alt+D on macOS
    expect(h.moveDir()).toBe(0);
    h.down('ф', 'KeyA');
    expect(h.moveDir()).toBe(-1);
    h.up('a', 'KeyA'); // the layout switched while held
    expect(h.size).toBe(0);
  });

  it('letting go of ⌘ frees everything; clear() empties the set', () => {
    const h = new HeldKeys();
    h.down('meta', 'MetaLeft');
    h.down('a', 'KeyA');
    h.up('meta', 'MetaLeft');
    expect(h.moveDir()).toBe(0);
    h.down('d', 'KeyD');
    h.down('shift', 'ShiftLeft');
    h.clear();
    expect(h.size).toBe(0);
    expect(h.has('shift')).toBe(false);
  });

  it('a run restored from a snapshot taken mid-walk does not walk on its own', () => {
    const g = micro();
    g.setMove(1);
    g.setPour(true);
    const json = g.snapshot();
    const r = micro(2);
    expect(r.restore(json)).toBe(true);
    expect(r.state.keeper.move).toBe(0);
    expect(r.state.interact.pour).toBe(false);
    const x = r.state.keeper.x;
    steps(r, 1);
    expect(r.state.keeper.x).toBe(x);
  });
});

describe('Кыш in «Поляна» (spec §7)', () => {
  it('the full medium list in order', () => {
    expect(GUIDE_STEPS.medium.map((s) => s.id)).toEqual(['wake', 'husk', 'stone', 'stela', 'grow3', 'rift', 'wave', 'rift2']);
    // the narrator speaks; Кыш himself only says «Юрр!»
    for (const s of GUIDE_STEPS.medium) expect(s.text).toMatch(/Кыш/);
  });

  it('walks the steps as the run goes', () => {
    const g = medium();
    const s = g.state;
    expect(currentStep(g, none)).toBeNull(); // the first morning: no nagging
    s.night = 1;
    expect(currentStep(g, none)?.id).toBe('wake');
    expect(currentStep(g, none)!.target(g)).toBe(obj('sleeper', 0).x);
    s.mw.woken.push('sleeper:4');
    s.night = 2;
    expect(currentStep(g, none)?.id).toBe('husk');
    s.mw.husks['deadTree:2'] = 400;
    s.tree.stage = 1;
    s.star = 50;
    expect(currentStep(g, none)?.id).toBe('stone');
    s.keeper.runeRank.spear = 1;
    expect(currentStep(g, none)?.id).toBe('stela');
    expect(currentStep(g, none)!.target(g)).toBe(obj('stela', 0).x);
    s.mw.blessed.push('stela:6');
    s.night = 3;
    s.amber = 99999;
    expect(currentStep(g, none)?.id).toBe('grow3');
    s.tree.stage = 3;
    expect(currentStep(g, none)?.id).toBe('rift');
    s.mw.sealed.push('L');
    s.mw.wave = 'L';
    expect(currentStep(g, none)?.id).toBe('wave');
    s.mw.wave = null;
    s.mw.silent.push('L');
    expect(currentStep(g, none)?.id).toBe('rift2');
    expect(currentStep(g, none)!.target(g)).toBe(obj('rift', 1).x);
    s.mw.sealed.push('R');
    expect(currentStep(g, none)).toBeNull();
  });
});

describe('the defeat screen reason in «Поляна» (spec §7)', () => {
  it('always one readable line, medium creatures included', () => {
    expect(defeatReason({ mother: 300, larva: 200, hound: 100 })).toMatch(/^83% урона — Имаго-Матерь/);
    expect(defeatReason({ forager: 70, hound: 30 })).toContain('Фуражиры');
    expect(defeatReason({ jumper: 10 })).toMatch(/^100% урона — /);
    const g = medium();
    priv(g).startNight();
    g.state.tree.hp = 1;
    g.spawnEnemy('hound', T - 5, 1);
    steps(g, 20);
    expect(g.over).toBe(true);
    const r = defeatReason(g.state.stats.treeDmgBy);
    expect(r).toMatch(/\d+% урона — .+ → .+/);
  });
});
