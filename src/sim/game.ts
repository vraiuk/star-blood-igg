import {
  ABILITIES, ABILITY_STAGE_SCALING, ARMOR_FLOOR, ATTR_MAX, BROOD, RINGS, attrCost, DAY, ECONOMY, ENEMIES, KEEPER, KEEPER_RANKS, RESTUN_FACTOR,
  ROOT_SLOT_REACH, SLOT_MARGIN, SLOTS, WORLD, WORM_LIGHT_MULT,
  type AbilityId, type AttrId, type EnemyKind, type SlotDef,
} from '../data/balance';
import { PATHS } from '../data/meta';
import { type ModPatch, type Mods, combine } from '../data/mods';
import { NESTS, SELL_REFUND, type Family, type NestStats, type Price, type SpecId } from '../data/nests';
import { ENDLESS, nightDef, type NightDef } from '../data/nights';
import {
  BASE_SLOTS, BOONS, MAX_SLOTS, PROPERTIES, boonById, maxRankForNight, propertyById,
  type KeeperRuneId, type PropertyDef,
} from '../data/runes';
import { TREE, TREE_BRANCHES, TREE_STAGES } from '../data/tree';
import { mulberry32 } from './rng';
import type { Drop, DropKind, Enemy, GameEvent, GameState, PendingSpawn, Structure } from './types';

/** Seconds after the last spawn before dawn burns remaining creatures. */
export const NIGHT_GRACE = 60;


/** Fixed simulation step in seconds. */
export const STEP = 1 / 60;

export interface GameOptions {
  seed?: number;
  /** override night definitions (tests); defaults to campaign + endless generator */
  nights?: NightDef[];
  /** mod patches from bought meta-tree nodes */
  meta?: ModPatch[];
  /** meta capstone «Дар Тинга»: start with a rune choice */
  startRune?: boolean;
  /** difficulty path index (0..2) */
  path?: number;
}

export type Target =
  | { kind: 'structure'; s: Structure; x: number }
  | { kind: 'keeper'; x: number }
  | { kind: 'tree'; x: number };

/**
 * Deterministic simulation of one level. No DOM: rendering, UI and audio read
 * `state` and drain `state.events` every frame. All commands validate and emit
 * `denied` events with a reason the UI can show.
 */
export class Game {
  readonly state: GameState;
  private customNights?: NightDef[];
  /** stars earned at the night-10 milestone (0 if not reached) */
  milestoneStars = 0;
  readonly path: number;
  mods: Mods;
  private rand: () => number;
  private metaMods: ModPatch[];
  /** beetles to revive at dawn (meta capstone) */
  private graveyard: Array<{ slotId: string; tier: number; spec: SpecId | null }> = [];

  constructor(opts: GameOptions = {}) {
    this.rand = mulberry32(opts.seed ?? 1337);
    this.customNights = opts.nights;
    this.path = opts.path ?? 0;
    this.metaMods = opts.meta ?? [];
    this.mods = combine(this.metaMods);
    const st0 = TREE_STAGES[0];
    this.state = {
      phase: 'day', night: 0, phaseTime: 0, dayLeft: DAY.firstLength,
      amber: ECONOMY.startAmber + this.mods.startAmber, star: this.mods.startStar, devRunes: 0,
      enemies: [], structures: [], projectiles: [], drops: [], workers: [], tempLights: [], burns: [],
      keeper: {
        x: WORLD.treeX - 28, dir: 1, hp: KEEPER.hp, alive: true, respawn: 0, light: KEEPER.startLight, move: 0,
        cooldowns: { spear: 0, hammer: 0, starfall: 0 }, charge: 0, rank: 0,
        props: { spear: [], hammer: [], starfall: [], light: [] },
        slots: { spear: BASE_SLOTS, hammer: BASE_SLOTS, starfall: BASE_SLOTS, light: BASE_SLOTS }, boons: [],
        attrs: { might: 0, spirit: 0, body: 0 },
        castAnim: 9, hitFlash: 0, walkT: 0, rhythm: 0, rhythmT: 0, freeCast: 0, lastLightCd: 0,
      },
      tree: {
        stage: 0, growth: 0, hp: st0.maxHp, radius: st0.radius, sparkCd: 0, hitFlash: 0,
        branches: [], shield: 0, shieldUsed: false, secondWindUsed: false, rings: 0,
      },
      pending: [], choices: [], events: [],
      stats: { kills: 0, amberCollected: 0, starCollected: 0, amberToTree: 0, time: 0 },
      nextId: 1, time: 0,
    };
    this.recalc();
    this.state.tree.hp = this.treeMaxHp();
    this.state.keeper.hp = this.keeperMaxHp();
    if (opts.startRune) this.offerDawn(true);
  }

  // ───────────────────────────── derived stats ─────────────────────────

  get stageDef() { return TREE_STAGES[this.state.tree.stage]; }
  treeMaxHp() { return Math.round(this.stageDef.maxHp * (1 + this.mods.treeHp) * (1 + RINGS.hp * this.state.tree.rings)); }
  /** Nest / spark power: stage power × growth rings. */
  treePower() { return this.stageDef.power * (1 + RINGS.power * this.state.tree.rings); }
  treeRadius() { return this.stageDef.radius * (1 + this.mods.lightRadius); }
  keeperMaxHp() { return Math.round((KEEPER_RANKS[this.state.keeper.rank].hp + this.mods.keeperHp) * (1 + 0.1 * this.state.keeper.attrs.body)); }
  maxLight() { return KEEPER_RANKS[this.state.keeper.rank].maxLight + this.mods.lightMax + 6 * this.state.keeper.attrs.spirit; }
  /** Share of incoming damage the Ascended shrugs off. */
  keeperGuard() { return Math.min(0.8, KEEPER_RANKS[this.state.keeper.rank].guard + 0.04 * this.state.keeper.attrs.body); }
  /** Radiance dps burning creatures that touch the Ascended. */
  keeperAura() {
    return KEEPER_RANKS[this.state.keeper.rank].aura * (1 + 0.15 * this.state.keeper.attrs.body) * (1 + 0.1 * this.state.tree.stage);
  }
  /** Installed properties of a keeper rune. */
  runeProps(rune: KeeperRuneId): PropertyDef[] {
    return this.state.keeper.props[rune].map((id) => propertyById(id)!).filter(Boolean);
  }
  freeSlots(rune: KeeperRuneId) { return this.state.keeper.slots[rune] - this.state.keeper.props[rune].length; }
  /** Can this property be installed (slot free, stack limit)? */
  canInstall(p: PropertyDef): boolean {
    const k = this.state.keeper;
    return this.freeSlots(p.rune) > 0 && k.props[p.rune].filter((x) => x === p.id).length < p.stack;
  }

  /** Rebuild aggregated mods from meta, tree branches and runes. */
  private recalc() {
    const s = this.state;
    const patches: ModPatch[] = [...this.metaMods];
    for (const id of s.tree.branches) {
      for (const pair of Object.values(TREE_BRANCHES)) for (const b of pair) if (b.id === id) patches.push(b.mods);
    }
    const k = s.keeper;
    for (const rune of Object.keys(k.props) as KeeperRuneId[]) for (const p of this.runeProps(rune)) patches.push(p.mods);
    for (const id of k.boons) { const b = boonById(id); if (b) patches.push(b.mods); }
    this.mods = combine(patches);
  }

  /** Effective stats of a nest including specialization, stage power and mods. */
  nestStats(st: Pick<Structure, 'family' | 'tier' | 'spec'>): NestStats {
    const fam = NESTS[st.family];
    const base = st.tier < 3 ? fam.levels[st.tier] : fam.specs[st.spec!].levels[st.tier - 3];
    const m = this.mods;
    const dmg = (1 + m.famDamage[st.family]) * this.treePower();
    const rng = 1 + m.famRange[st.family];
    return {
      ...base,
      hp: Math.round(base.hp * (1 + m.famHp[st.family])),
      damage: base.damage * dmg,
      burn: base.burn !== undefined ? base.burn * dmg : undefined,
      poison: base.poison !== undefined ? base.poison * dmg : undefined,
      thorns: base.thorns !== undefined ? base.thorns * dmg : undefined,
      range: base.range * rng,
      light: base.light !== undefined ? base.light * rng : undefined,
    };
  }

  private scalePrice(p: Price): Price {
    return { amber: Math.round(p.amber * Math.max(0.5, 1 + this.mods.nestCost)), star: p.star };
  }

  buildPrice(family: Family): Price { return this.scalePrice(NESTS[family].costs[0]); }

  /** Price of the next linear upgrade (tiers 1–2 and spec mastery), or null. */
  upgradePrice(st: Structure): Price | null {
    const fam = NESTS[st.family];
    if (st.tier < 2) return this.scalePrice(fam.costs[st.tier + 1]);
    if (st.tier === 3 && st.spec) return this.scalePrice(fam.specs[st.spec].costs[1]);
    return null;
  }

  specPrice(st: Structure, spec: SpecId): Price { return this.scalePrice(NESTS[st.family].specs[spec].costs[0]); }

  canPay(p: Price) { return this.state.amber >= p.amber && this.state.star >= p.star; }

  abilityCost(id: AbilityId) {
    const own = id === 'spear' ? this.mods.spearCost : id === 'hammer' ? this.mods.hammerCost : 0;
    return Math.round(ABILITIES[id].cost * Math.max(0.3, 1 + this.mods.abilityCost + own));
  }

  abilityUnlocked(id: AbilityId) { return this.state.tree.stage + 1 >= ABILITIES[id].unlockStage; }

  /** Damage multiplier of an ability: tree stage, keeper rank, generic and rune-specific bonuses. */
  abilityMult(id: AbilityId = 'spear') {
    const own = id === 'spear' ? this.mods.spearDamage : id === 'hammer' ? this.mods.hammerDamage : this.mods.starfallDamage;
    return (1 + ABILITY_STAGE_SCALING * this.state.tree.stage + this.mods.abilityDamage + own)
      * KEEPER_RANKS[this.state.keeper.rank].power * (1 + 0.08 * this.state.keeper.attrs.might);
  }

  /** Keeper Light regen factor by distance from the trunk: ×1.8 at the trunk → ×0.3 at the Circle edge. */
  lightRegenFactor(x = this.state.keeper.x): number {
    const d = Math.abs(x - WORLD.treeX) / Math.max(1, this.state.tree.radius);
    const near = KEEPER.regenNear * (1 + this.mods.nearRegen * Math.max(0, 1 - d * 2));
    return Math.max(KEEPER.regenFar, near - (near - KEEPER.regenFar) * Math.min(1, d));
  }

  /** Is a point lit? Surface uses the tree radius, dragonflies and temporary lights. */
  isLit(x: number, underground: boolean): boolean {
    const s = this.state;
    if (underground) {
      if (Math.abs(x - WORLD.treeX) <= s.tree.radius * TREE.rootLightFactor) return true;
      for (const st of s.structures) {
        if (!st.underground) continue;
        const light = this.nestStats(st).light;
        if (light && Math.abs(x - st.x) <= light) return true;
      }
      return false;
    }
    if (Math.abs(x - WORLD.treeX) <= s.tree.radius) return true;
    for (const st of s.structures) {
      if (st.family !== 'dragonfly') continue;
      if (Math.abs(x - st.x) <= this.nestStats(st).light!) return true;
    }
    for (const t of s.tempLights) if (Math.abs(x - t.x) <= t.radius) return true;
    return false;
  }

  slotUnlocked(slot: SlotDef): boolean {
    const r = this.treeRadius();
    return slot.underground ? slot.offset <= r * ROOT_SLOT_REACH : slot.offset <= r - SLOT_MARGIN;
  }
  structureAt(slotId: string): Structure | undefined { return this.state.structures.find((s) => s.slotId === slotId); }

  /** Amber still needed for the next stage (0 at max stage). */
  growNeed(): number {
    const def = this.stageDef;
    return def.growCost === 0 ? 0 : def.growCost - this.state.tree.growth;
  }

  get over(): boolean { return this.state.phase === 'lost'; }

  /** Night definition by index (campaign, then endless generator). */
  night(n: number): NightDef {
    if (this.customNights) return this.customNights[Math.min(n, this.customNights.length - 1)];
    return nightDef(n);
  }

  /** Number of hand-made campaign nights (the milestone). */
  get campaignNights() { return this.customNights?.length ?? ENDLESS.campaignNights; }
  get choice() { return this.state.choices[0] ?? null; }

  /** Stars earned at the campaign milestone (night 10). */
  stars(): number { return this.milestoneStars; }

  private computeStars(): number {
    const s = this.state;
    let n = 1;
    if (s.tree.stage >= 4) n++;
    if (s.tree.stage >= 5 && s.tree.hp > this.treeMaxHp() * 0.5) n++;
    return n;
  }

  // ───────────────────────────── commands ────────────────────────────

  setMove(dir: -1 | 0 | 1) { this.state.keeper.move = dir; }

  build(slotId: string, family: Family): boolean {
    const s = this.state;
    if (this.over) return false;
    const slot = SLOTS.find((sl) => sl.id === slotId);
    if (!slot || !this.slotUnlocked(slot) || this.structureAt(slotId)) return this.deny('Руна недоступна');
    const def = NESTS[family];
    if (def.underground !== slot.underground) return this.deny('Не тот слой');
    const price = this.buildPrice(family);
    if (!this.canPay(price)) return this.deny('Не хватает Янтаря');
    this.pay(price);
    const st: Structure = {
      id: s.nextId++, family, slotId, x: slot.x, underground: slot.underground, tier: 0, spec: null,
      hp: 0, maxHp: 0, cd: 0.4, spentAmber: price.amber, spentStar: price.star, hitFlash: 0, age: 0,
      aim: slot.x < WORLD.treeX ? -1 : 1, haste: 0,
    };
    st.maxHp = st.hp = this.nestStats(st).hp;
    s.structures.push(st);
    this.emit({ type: 'built', family, x: slot.x, underground: slot.underground, tier: 0 });
    return true;
  }

  upgrade(structureId: number): boolean {
    const st = this.state.structures.find((x) => x.id === structureId);
    if (!st || this.over) return false;
    if (st.tier === 2) return this.deny('Выбери специализацию');
    const price = this.upgradePrice(st);
    if (!price) return this.deny('Максимальный уровень');
    if (!this.canPay(price)) return this.deny(price.star > this.state.star ? 'Нужна Звёздная Кровь — её роняют Черви' : 'Не хватает Янтаря');
    this.pay(price);
    this.setTier(st, st.tier + 1, st.spec, price);
    return true;
  }

  specialize(structureId: number, spec: SpecId): boolean {
    const st = this.state.structures.find((x) => x.id === structureId);
    if (!st || this.over || st.tier !== 2) return false;
    const price = this.specPrice(st, spec);
    if (!this.canPay(price)) return this.deny(price.star > this.state.star ? 'Нужна Звёздная Кровь — её роняют Черви' : 'Не хватает Янтаря');
    this.pay(price);
    this.setTier(st, 3, spec, price);
    return true;
  }

  private setTier(st: Structure, tier: number, spec: SpecId | null, price: Price) {
    st.tier = tier;
    st.spec = spec;
    st.spentAmber += price.amber;
    st.spentStar += price.star;
    const hp = this.nestStats(st).hp;
    st.hp += hp - st.maxHp;
    st.maxHp = hp;
    this.emit({ type: 'built', family: st.family, x: st.x, underground: st.underground, tier });
  }

  sellValue(st: Structure): Price {
    return { amber: Math.floor(st.spentAmber * SELL_REFUND), star: Math.floor(st.spentStar * SELL_REFUND) };
  }

  sell(structureId: number): boolean {
    const s = this.state;
    const i = s.structures.findIndex((x) => x.id === structureId);
    if (i < 0 || this.over) return false;
    const st = s.structures[i];
    const v = this.sellValue(st);
    s.amber += v.amber;
    s.star += v.star;
    s.structures.splice(i, 1);
    this.emit({ type: 'sold', x: st.x });
    return true;
  }

  /** Invest Amber into the tree. Returns the amount actually invested. */
  feed(amount: number): number {
    const s = this.state;
    if (this.over) return 0;
    const need = this.growNeed();
    const give = Math.max(0, Math.min(Math.floor(amount), need, s.amber));
    if (give <= 0) {
      this.deny(need === 0 ? 'Древо уже Золотое' : 'Не хватает Янтаря');
      return 0;
    }
    s.amber -= give;
    s.tree.growth += give;
    s.stats.amberToTree += give;
    if (s.tree.growth >= this.stageDef.growCost) this.grow();
    return give;
  }

  /** Growth ring after the Great Igg-Tree (endless Amber sink). */
  ringCost() { return RINGS.cost(this.state.tree.rings); }
  addRing(): boolean {
    const s = this.state;
    if (this.growNeed() > 0) return this.deny('Сначала вырасти Великое Игг-Древо');
    const c = this.ringCost();
    if (s.amber < c) return this.deny('Не хватает Янтаря');
    s.amber -= c;
    s.tree.rings++;
    s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + this.treeMaxHp() * 0.2);
    this.refreshNestHp();
    this.emit({ type: 'treeGrew', stage: s.tree.stage });
    return true;
  }

  /** Raise an Ascended attribute with Star Blood or a Lesser Rune of Development. */
  raiseAttr(id: AttrId, useDevRune = false): boolean {
    const s = this.state;
    const lv = s.keeper.attrs[id];
    if (lv >= ATTR_MAX) return this.deny('Атрибут развит до предела 10/10');
    if (useDevRune) {
      if (s.devRunes <= 0) return this.deny('Нет Малой Руны Развития');
      s.devRunes--;
    } else {
      if (s.star < attrCost(lv)) return this.deny('Нужна Звёздная Кровь');
      s.star -= attrCost(lv);
    }
    s.keeper.attrs[id]++;
    if (id === 'body') s.keeper.hp = Math.min(this.keeperMaxHp(), s.keeper.hp + this.keeperMaxHp() * 0.1);
    this.emit({ type: 'rankUp', rank: s.keeper.rank });
    return true;
  }

  /** Keeper Ascension: spend Star Blood for the next rank. */
  ascend(): boolean {
    const k = this.state.keeper;
    const next = KEEPER_RANKS[k.rank + 1];
    if (!next) return this.deny('Высший ранг');
    if (this.state.star < next.cost) return this.deny('Нужна Звёздная Кровь — её роняют Черви');
    this.state.star -= next.cost;
    k.rank++;
    k.hp = this.keeperMaxHp();
    this.emit({ type: 'rankUp', rank: k.rank });
    return true;
  }

  /** Resolve the current dawn offer or tree branch choice. */
  choose(index: number): boolean {
    const s = this.state;
    const c = this.choice;
    if (!c) return false;
    if (c.kind === 'branch') {
      const b = TREE_BRANCHES[c.stage]?.[index];
      if (!b) return false;
      s.tree.branches.push(b.id);
    } else {
      const id = c.offers[index];
      if (!id) return false;
      const prop = propertyById(id);
      if (prop) {
        if (this.canInstall(prop)) s.keeper.props[prop.rune].push(prop.id);
        else s.star += prop.price; // no room: the Observer refunds its value
      } else {
        const b = boonById(id);
        if (!b) return false;
        if (b.kind === 'gift' && (b.amber || b.star || b.devRune)) {
          s.amber += b.amber ?? 0;
          s.star += b.star ?? 0;
          s.devRunes += b.devRune ?? 0;
        } else {
          s.keeper.boons.push(b.id);
        }
      }
      this.emit({ type: 'rune', id });
    }
    s.choices.shift();
    this.recalc();
    this.refreshNestHp();
    return true;
  }

  /** The Observer's treasury: buy a Property for Star Blood and install it into a rune slot. */
  buyProperty(id: string): boolean {
    const p = propertyById(id);
    if (!p || this.over) return false;
    if (!this.canInstall(p)) return this.deny(this.freeSlots(p.rune) <= 0 ? 'Нет свободных слотов в руне' : 'Больше этого Свойства не вставить');
    if (this.state.star < p.price) return this.deny('Нужна Звёздная Кровь — её роняют Черви');
    this.state.star -= p.price;
    this.state.keeper.props[p.rune].push(p.id);
    this.recalc();
    this.emit({ type: 'rune', id: p.id });
    return true;
  }

  /** Apply a Lesser Rune of Development: opens the 4th slot of a keeper rune. */
  developRune(rune: KeeperRuneId): boolean {
    const k = this.state.keeper;
    if (this.state.devRunes <= 0) return this.deny('Нет Малой Руны Развития');
    if (k.slots[rune] >= MAX_SLOTS) return this.deny('Руна уже развита');
    this.state.devRunes--;
    k.slots[rune]++;
    this.emit({ type: 'rankUp', rank: k.rank });
    return true;
  }

  /** Ends the day early; pays a bonus per remaining second. */
  callNight(): boolean {
    const s = this.state;
    if (s.phase !== 'day') return false;
    if (s.choices.length) return this.deny('Сначала сделай выбор');
    s.amber += Math.floor(s.dayLeft) * ECONOMY.earlyCallPerSecond;
    this.startNight();
    return true;
  }

  cast(id: AbilityId, tx: number, _ty = 0): boolean {
    const s = this.state;
    const k = s.keeper;
    if (this.over || !k.alive) return false;
    if (!this.abilityUnlocked(id)) return this.deny(`Откроется на стадии Древа ${ABILITIES[id].unlockStage}`);
    if (k.cooldowns[id] > 0) return false;
    const def = ABILITIES[id];
    if (id === 'starfall') {
      if (k.charge < ABILITIES.starfall.chargeMax) return this.deny('Звездопад ещё не заряжен');
    } else {
      const cost = this.abilityCost(id);
      if (k.freeCast <= 0) {
        if (k.light < cost) return this.deny('Мало Света');
        k.light -= cost;
      }
    }
    k.cooldowns[id] = def.cooldown * (id === 'hammer' && this.mods.hammerCost < 0 ? 0.75 : 1);
    k.castAnim = 0;
    const mult = this.abilityMult();
    if (id === 'spear') this.castSpear(tx, this.abilityMult('spear'));
    else if (id === 'hammer') this.castHammer(this.abilityMult('hammer'));
    else this.castStarfall(tx, this.abilityMult('starfall'));
    void mult;
    this.emit({ type: 'cast', ability: id, x: k.x, tx });
    return true;
  }

  private castSpear(tx: number, mult: number) {
    const s = this.state;
    const k = s.keeper;
    const def = ABILITIES.spear;
    const dir = tx >= k.x ? 1 : -1;
    k.dir = dir;
    s.projectiles.push({
      id: s.nextId++, kind: 'spear', x: k.x + dir * 6, y: WORLD.groundY - 11, vx: dir * def.speed, vy: 0,
      damage: def.damage * mult, targetId: 0, tx: 0, ty: 0, pierce: def.pierce + this.mods.spearPierce, hit: [],
      life: def.range / def.speed, age: 0,
    });
  }

  private castHammer(mult: number) {
    const s = this.state;
    const k = s.keeper;
    const def = ABILITIES.hammer;
    let hits = 0;
    for (const e of s.enemies) {
      const radius = def.radius * (1 + this.mods.hammerRadius);
      const under = ENEMIES[e.kind].underground;
      if (e.dead || (under && !this.mods.hammerQuake)) continue;
      const d = e.x - k.x;
      if (Math.abs(d) > radius) continue;
      hits++;
      if (under) { this.damageEnemy(e, def.damage * mult); this.stunEnemy(e, def.stun); continue; }
      this.damageEnemy(e, def.damage * mult);
      this.stunEnemy(e, def.stun);
      if (e.kind !== 'mother') e.kick = Math.sign(d || -e.dir) * def.knockback * 3;
    }
    if (this.mods.hammerRefund) k.light = Math.min(this.maxLight(), k.light + Math.min(30, hits * 5));
    s.tempLights.push({ x: k.x, radius: def.lightRadius, life: def.lightTime, maxLife: def.lightTime });
    if (this.mods.hammerEclipse) s.tempLights.push({ x: k.x, radius: def.radius, life: 5, maxLife: 5, slow: 0.35 });
  }

  /** Stun with boss resistance and diminishing returns. */
  stunEnemy(e: Enemy, secs: number) {
    const def = ENEMIES[e.kind];
    let t = secs * def.ccMult;
    if (e.sinceStun < ABILITIES.hammer.restunWindow) t *= RESTUN_FACTOR;
    e.stun = Math.max(e.stun, t);
    e.sinceStun = 0;
  }

  private castStarfall(tx: number, mult: number) {
    const s = this.state;
    const def = ABILITIES.starfall;
    s.keeper.charge = 0;
    const n = def.meteors + this.mods.starfallMeteors;
    for (let i = 0; i < n; i++) {
      const x = tx + (i - (n - 1) / 2) * ((def.spread * 2) / (n - 1)) + (this.rand() - 0.5) * 10;
      const delay = i * 0.12;
      const fall = 0.7 + delay;
      s.projectiles.push({
        id: s.nextId++, kind: 'meteor', x: x - 70, y: WORLD.groundY - (WORLD.groundY + 30), vx: 70 / fall,
        vy: (WORLD.groundY + 30) / fall, damage: def.damage * mult, targetId: 0, tx: x, ty: WORLD.groundY,
        pierce: 0, hit: [], life: fall, age: 0,
      });
    }
  }

  // ───────────────────────────── tick ────────────────────────────────

  /** Advance the simulation by exactly one fixed step. */
  step(): void {
    const s = this.state;
    if (this.over) return;
    const dt = STEP;
    s.time += dt;
    s.stats.time += dt;
    s.phaseTime += dt;

    this.updateTreeRadius(dt);
    if (s.phase === 'day') this.updateDay(dt);
    else this.updateSpawns();

    this.updateKeeper(dt);
    this.updateEnemies(dt);
    this.updateStructures(dt);
    this.updateTree(dt);
    this.updateProjectiles(dt);
    this.updateDrops(dt);
    this.updateWorkers(dt);
    this.updateTempLights(dt);
    this.cleanup();

    if (s.tree.hp <= 0) {
      if (this.mods.secondWind && !s.tree.secondWindUsed) {
        s.tree.secondWindUsed = true;
        s.tree.hp = this.treeMaxHp() * 0.3;
        this.emit({ type: 'secondWind' });
      } else {
        s.tree.hp = 0;
        s.phase = 'lost';
        this.emit({ type: 'lost' });
        return;
      }
    }
    if (s.phase === 'night' && s.pending.length === 0 && s.enemies.length > 0 && s.phaseTime > this.nightDeadline) {
      // dawn burns the stragglers away (no rewards)
      for (const e of s.enemies) { e.dead = true; this.emit({ type: 'enemyDied', kind: e.kind, x: e.x, y: e.y }); }
      s.enemies = [];
      this.emit({ type: 'denied', reason: 'Рассвет выжег тварей во тьме' });
    }
    if (s.phase === 'night' && s.pending.length === 0 && s.enemies.length === 0) this.endNight();
  }

  // ───────────────────────────── phases ──────────────────────────────

  private updateDay(dt: number) {
    const s = this.state;
    if (s.choices.length === 0) s.dayLeft -= dt;
    const tear = s.tree.stage + 1 >= TREE.tearStage ? 2 : 1;
    s.tree.hp = Math.min(this.treeMaxHp(), s.tree.hp + (TREE.dayRegen * tear + this.mods.treeRegen) * dt);
    if (s.dayLeft <= 0) this.startNight();
  }

  private startNight() {
    const s = this.state;
    s.phase = 'night';
    s.phaseTime = 0;
    s.dayLeft = 0;
    s.tree.shieldUsed = false;
    const def = this.night(s.night);
    const handMade = s.night < this.campaignNights;
    const pending: PendingSpawn[] = [];
    for (const g of def.groups) {
      const sides: Array<'L' | 'R'> = g.side === 'B' ? ['L', 'R'] : [g.side];
      for (const side of sides) {
        const boss = ENEMIES[g.kind].boss;
        // worms dig in ever larger numbers
        const wormGrow = ENEMIES[g.kind].underground ? 1 + ENDLESS.wormCount * s.night : 1;
        const grow = (handMade ? ENDLESS.count(s.night) : 1) * wormGrow;
        const count = boss ? g.count : Math.round(g.count * grow);
        const every = boss ? g.every : g.every / Math.sqrt(grow);
        for (let i = 0; i < count; i++) {
          const stagger = g.side === 'B' && side === 'R' ? every * 0.5 : 0;
          pending.push({ at: g.at + i * every + stagger, kind: g.kind, side });
        }
      }
    }
    pending.sort((a, b) => a.at - b.at);
    s.pending = pending;
    this.nightDeadline = (pending[pending.length - 1]?.at ?? 0) + NIGHT_GRACE;
    this.emit({ type: 'nightStart', night: s.night });
  }

  private endNight() {
    const s = this.state;
    const finished = s.night;
    s.night++;
    if (s.night === this.campaignNights) {
      this.milestoneStars = this.computeStars();
      this.emit({ type: 'milestone', stars: this.milestoneStars });
    }
    const gift = Math.round((ECONOMY.dawnBase + ECONOMY.dawnPerNight * (finished + 1)) * (1 + this.mods.dawnGift));
    s.amber += gift;
    s.phase = 'day';
    s.phaseTime = 0;
    s.dayLeft = DAY.length;
    for (const g of this.graveyard) {
      if (this.structureAt(g.slotId)) continue;
      const slot = SLOTS.find((x) => x.id === g.slotId)!;
      const st: Structure = {
        id: s.nextId++, family: 'beetle', slotId: g.slotId, x: slot.x, underground: false, tier: g.tier, spec: g.spec,
        hp: 0, maxHp: 0, cd: 0, spentAmber: 0, spentStar: 0, hitFlash: 0, age: 0, aim: slot.x < WORLD.treeX ? -1 : 1, haste: 0,
      };
      st.hp = st.maxHp = this.nestStats(st).hp;
      s.structures.push(st);
      this.emit({ type: 'built', family: 'beetle', x: slot.x, underground: false, tier: g.tier });
    }
    this.graveyard = [];
    this.emit({ type: 'dawn', night: finished, gift });
    this.offerDawn(false);
  }

  /** The Observer's roulette: 1 of 3 — free Properties, creature runes or gifts. */
  private offerDawn(start: boolean) {
    const s = this.state;
    const maxRank = start ? 1 : maxRankForNight(s.night - 1);
    type Cand = { id: string; rank: number; gift: boolean };
    const cands: Cand[] = [
      ...PROPERTIES.filter((p) => p.rank <= maxRank && this.canInstall(p) && this.abilityUnlocked(p.rune === 'light' ? 'spear' : p.rune))
        .map((p) => ({ id: p.id, rank: p.rank, gift: false })),
      ...BOONS.filter((b) => b.rank <= maxRank && !(b.kind === 'creature' && s.keeper.boons.includes(b.id)))
        .map((b) => ({ id: b.id, rank: b.rank, gift: b.kind === 'gift' })),
    ];
    const offers: string[] = [];
    const weight = (c: Cand) => [6, 4.5, 3, 2, 1.2][c.rank] * (c.gift ? 0.7 : 1);
    for (let n = 0; n < 3 && cands.length; n++) {
      const pool = cands.filter((c) => !(c.gift && offers.some((o) => boonById(o)?.kind === 'gift')));
      if (!pool.length) break;
      const total = pool.reduce((a, c) => a + weight(c), 0);
      let pick = this.rand() * total;
      let chosen = pool[0];
      for (const c of pool) { pick -= weight(c); if (pick <= 0) { chosen = c; break; } }
      offers.push(chosen.id);
      cands.splice(cands.indexOf(chosen), 1);
    }
    if (offers.length) s.choices.push({ kind: 'dawn', offers });
  }

  private updateSpawns() {
    const s = this.state;
    while (s.pending.length && s.pending[0].at <= s.phaseTime) {
      const p = s.pending.shift()!;
      const x = p.side === 'L' ? -WORLD.spawnMargin : WORLD.width + WORLD.spawnMargin;
      this.spawnEnemy(p.kind, x, p.side === 'L' ? 1 : -1);
    }
  }

  spawnEnemy(kind: EnemyKind, x: number, dir: 1 | -1): Enemy {
    const s = this.state;
    const def = ENEMIES[kind];
    const nightMul = this.night(s.night).hpMul;
    const pathMul = PATHS[this.path].hp;
    // bosses are tuned at their absolute value on first appearance, then grow slowly
    const hp = Math.round(def.hp * (def.boss ? ENDLESS.bossHp(s.night) : nightMul) * pathMul);
    const e: Enemy = {
      id: s.nextId++, kind, x, y: def.underground ? WORLD.wormLaneY : WORLD.groundY, dir,
      hp, maxHp: hp, speedMul: 0.92 + this.rand() * 0.16, attackCd: 0.3 + this.rand() * 0.4,
      stun: 0, sinceStun: 99, rooted: 0, slow: 0, poison: 0, poisonTime: 0, marked: 0, burn: 0, vuln: 0,
      attacking: false, lit: false, age: this.rand() * 3, hitFlash: 0,
      broodCd: (BROOD[kind]?.every ?? 5) * 0.6, kick: 0, dead: false,
    };
    s.enemies.push(e);
    return e;
  }

  // ───────────────────────────── keeper ──────────────────────────────

  private updateKeeper(dt: number) {
    const s = this.state;
    const k = s.keeper;
    k.castAnim += dt;
    k.hitFlash = Math.max(0, k.hitFlash - dt);
    k.rhythmT = Math.max(0, k.rhythmT - dt);
    if (k.rhythmT <= 0) k.rhythm = 0;
    k.freeCast = Math.max(0, k.freeCast - dt);
    k.lastLightCd = Math.max(0, k.lastLightCd - dt);
    for (const id of Object.keys(k.cooldowns) as AbilityId[]) k.cooldowns[id] = Math.max(0, k.cooldowns[id] - dt);
    const maxL = this.maxLight();
    k.light = Math.min(maxL, k.light + this.stageDef.lightRegen * (1 + this.mods.lightRegen + 0.08 * k.attrs.spirit) * this.lightRegenFactor() * dt);
    if (this.mods.lastLight && k.light < 20 && k.lastLightCd <= 0 && s.phase === 'night') {
      k.freeCast = 3;
      k.lastLightCd = 45;
    }

    if (!k.alive) {
      k.respawn -= dt;
      if (k.respawn <= 0) {
        k.alive = true;
        k.hp = this.keeperMaxHp();
        k.x = WORLD.treeX;
        this.emit({ type: 'keeperBack' });
      }
      return;
    }
    if (k.move !== 0) {
      k.dir = k.move;
      k.x = Math.max(8, Math.min(WORLD.width - 8, k.x + k.move * KEEPER.speed * (1 + this.mods.keeperSpeed) * dt));
      k.walkT += dt;
    } else {
      k.walkT = 0;
    }
    if (this.isLit(k.x, false)) k.hp = Math.min(this.keeperMaxHp(), k.hp + KEEPER.regenLit * (1 + k.rank) * dt);
    // radiance: the Ascended burns creatures pressing against him
    const aura = this.keeperAura();
    for (const e of s.enemies) {
      if (e.dead || ENEMIES[e.kind].underground || Math.abs(e.x - k.x) > ENEMIES[e.kind].radius + 14) continue;
      this.damageQuiet(e, aura * dt);
    }
  }

  private damageKeeper(amount: number) {
    const k = this.state.keeper;
    if (!k.alive) return;
    k.hp -= amount * (1 - this.keeperGuard());
    k.hitFlash = 0.15;
    this.emit({ type: 'keeperHit' });
    if (k.hp <= 0) {
      k.hp = 0;
      k.alive = false;
      k.respawn = KEEPER.respawn;
      k.move = 0;
      this.emit({ type: 'keeperDown' });
    }
  }

  // ───────────────────────────── enemies ─────────────────────────────

  /** Apply damage with the Igg-light worm multiplier and beacon mark. Returns damage dealt. */
  damageEnemy(e: Enemy, amount: number, lightMult = true, fromNest = false): number {
    if (e.dead) return 0;
    const def = ENEMIES[e.kind];
    const worm = lightMult && def.worm && this.isLit(e.x, def.underground);
    const mark = fromNest && e.marked > 0 ? 1.25 : 1;
    const raw = amount * (worm ? WORM_LIGHT_MULT : 1) * mark * (1 + e.vuln);
    const dmg = Math.max(raw * ARMOR_FLOOR, raw - def.armor);
    e.hp -= dmg;
    e.hitFlash = 0.12;
    this.emit({ type: 'hit', x: e.x, y: def.underground ? e.y : e.y - def.height * 0.6, amount: dmg, crit: worm });
    if (e.hp <= 0) this.killEnemy(e);
    return dmg;
  }

  private killEnemy(e: Enemy) {
    const s = this.state;
    e.dead = true;
    s.stats.kills++;
    const def = ENEMIES[e.kind];
    const k = s.keeper;
    if (this.abilityUnlocked('starfall')) {
      k.charge = Math.min(ABILITIES.starfall.chargeMax, k.charge + def.charge * (1 + this.mods.chargeGain));
    }
    this.emit({ type: 'enemyDied', kind: e.kind, x: e.x, y: e.y });
    const bounty = ENDLESS.bounty(s.night);
    const amber = Math.round(def.amber * bounty * (1 + this.mods.amberGain) * PATHS[this.path].amber);
    let star = 0;
    if (def.star >= 1) star = Math.round(def.star * Math.sqrt(bounty)) + this.mods.wormStar;
    else if (def.star > 0 && this.rand() < def.star) star = 1;
    star = Math.round(star * (1 + this.mods.starGain));
    if (def.devRune > 0 && this.rand() < def.devRune) {
      s.devRunes++;
      this.emit({ type: 'devRune', x: e.x });
    }
    this.dropLoot('amber', amber, e);
    this.dropLoot('star', star, e);
  }

  private dropLoot(kind: DropKind, total: number, e: Enemy) {
    if (total <= 0) return;
    const s = this.state;
    const def = ENEMIES[e.kind];
    const per = kind === 'amber' ? 3 : 2;
    const pieces = Math.max(1, Math.min(8, Math.ceil(total / per)));
    let left = total;
    for (let i = 0; i < pieces; i++) {
      const v = i === pieces - 1 ? left : Math.floor(total / pieces);
      left -= v;
      if (v <= 0) continue;
      const d: Drop = {
        id: s.nextId++, kind, x: Math.max(8, Math.min(WORLD.width - 8, e.x)),
        y: def.underground ? WORLD.groundY - 2 : e.y - def.height * 0.5,
        vx: (this.rand() - 0.5) * 70, vy: -60 - this.rand() * 60, value: v,
        life: 0, grounded: false, pulled: false, age: 0, claimed: 0, rooted: false,
      };
      d.life = (this.isLit(d.x, false) ? ECONOMY.dropLifeLit : ECONOMY.dropLifeDark) * (kind === 'star' ? 1.6 : 1);
      s.drops.push(d);
    }
  }

  private updateEnemies(dt: number) {
    const s = this.state;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const def = ENEMIES[e.kind];
      e.age += dt;
      e.sinceStun += dt;
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      e.marked = Math.max(0, e.marked - dt);
      e.lit = this.isLit(e.x, def.underground);
      e.attacking = false;
      e.slow = this.slowAt(e);
      e.vuln = this.vulnAt(e);
      e.attackCd -= dt;
      if (def.worm && e.lit) {
        // Igg-light burns worms: «личинка сгорает за одну-две секунды»
        e.hp -= this.stageDef.wormBurn * (1 + this.mods.wormBurn) * (def.boss ? 0.5 : 1) * dt;
        if (e.hp <= 0) { this.killEnemy(e); continue; }
      }
      if (e.poisonTime > 0) {
        e.poisonTime -= dt;
        this.damageQuiet(e, e.poison * dt);
        if (e.dead) continue;
      }
      for (const b of s.burns) {
        if (!def.underground && Math.abs(e.x - b.x) <= b.halfWidth) this.damageQuiet(e, b.dps * dt);
      }
      if (e.dead) continue;

      if (e.kick !== 0) {
        e.x += e.kick * dt;
        e.kick *= Math.pow(0.02, dt);
        if (Math.abs(e.kick) < 2) e.kick = 0;
      }
      if (e.stun > 0) { e.stun -= dt; e.sinceStun = 0; continue; }

      const brood = BROOD[e.kind];
      if (brood) {
        e.broodCd -= dt;
        if (e.broodCd <= 0) {
          e.broodCd = brood.every;
          for (let i = 0; i < brood.count; i++) {
            const l = this.spawnEnemy(brood.kind, e.x + (this.rand() - 0.5) * 30, e.dir);
            l.kick = e.dir * (20 + this.rand() * 60);
          }
          this.emit({ type: 'brood', x: e.x });
        }
      }

      if (def.underground) { this.updateWorm(e, dt); continue; }

      const target = this.pickTarget(e);
      if (target) {
        e.attacking = true;
        if (e.attackCd <= 0) {
          e.attackCd = def.attackRate;
          const dmg = def.damage * this.enemyDamageMul();
          if (def.range > 0) this.spitAcid(e, target);
          else if (target.kind === 'structure') this.damageStructure(target.s, dmg * def.structureMult, e);
          else if (target.kind === 'keeper') this.damageKeeper(dmg);
          else this.damageTree(dmg, e.kind, e);
        }
        continue;
      }
      if (e.rooted > 0) { e.rooted -= dt; continue; }
      e.x += e.dir * def.speed * e.speedMul * (1 - e.slow) * dt;
    }
  }

  private updateWorm(e: Enemy, dt: number) {
    const def = ENEMIES[e.kind];
    // worms gnaw through spider nests in their way
    const nest = this.state.structures.find((st) => st.underground && (st.x - e.x) * e.dir >= -def.radius
      && Math.abs(st.x - e.x) <= def.radius + 6);
    if (nest) {
      e.attacking = true;
      if (e.attackCd <= 0) {
        e.attackCd = def.attackRate;
        this.damageStructure(nest, def.damage * def.structureMult * this.enemyDamageMul(), e);
      }
      return;
    }
    if (Math.abs(e.x - WORLD.treeX) <= 22) {
      e.attacking = true;
      if (e.attackCd <= 0) {
        e.attackCd = def.attackRate;
        this.damageTree(def.damage * this.enemyDamageMul(), e.kind, e);
      }
      return;
    }
    if (e.rooted > 0) { e.rooted -= dt; return; }
    const dist = Math.abs(e.x - WORLD.treeX);
    const targetY = dist < 90 ? WORLD.wormLaneY - (1 - dist / 90) * 30 : WORLD.wormLaneY;
    e.y += (targetY - e.y) * Math.min(1, dt * 2);
    e.x += e.dir * def.speed * e.speedMul * (1 - e.slow) * dt;
  }

  private slowAt(e: Enemy): number {
    const def = ENEMIES[e.kind];
    let slow = 0;
    for (const st of this.state.structures) {
      if (st.underground !== def.underground) continue;
      const ns = this.nestStats(st);
      if (!ns.slow) continue;
      const reach = st.family === 'spider' ? ns.range : ns.light!;
      if (Math.abs(e.x - st.x) <= reach) slow = Math.max(slow, ns.slow);
    }
    for (const t of this.state.tempLights) {
      if (t.slow && !def.underground && Math.abs(e.x - t.x) <= t.radius) slow = Math.max(slow, t.slow);
    }
    return Math.min(0.7, slow * (e.kind === 'mother' ? 0.5 : 1));
  }

  /** Enemy damage grows with the night (fatter and meaner). */
  enemyDamageMul() { return ENDLESS.damage(this.state.night); }

  /** «Высвечивание»: the strongest dragonfly light covering this enemy. */
  private vulnAt(e: Enemy): number {
    if (ENEMIES[e.kind].underground) return 0;
    let v = 0;
    for (const st of this.state.structures) {
      if (st.family !== 'dragonfly') continue;
      const ns = this.nestStats(st);
      if (Math.abs(e.x - st.x) <= ns.light!) v = Math.max(v, (ns.vuln ?? 0) + this.mods.vuln);
    }
    return v;
  }

  private pickTarget(e: Enemy): Target | null {
    const s = this.state;
    const def = ENEMIES[e.kind];
    const ahead = (x: number) => (x - e.x) * e.dir >= -def.radius;
    const contact = def.radius + 5;

    if (def.range > 0) {
      let best: Structure | null = null;
      let bd = Infinity;
      for (const st of s.structures) {
        if (st.underground || !ahead(st.x)) continue;
        const d = Math.abs(st.x - e.x);
        if (d < bd) { bd = d; best = st; }
      }
      const treeD = Math.abs(WORLD.treeX - e.x) - WORLD.treeReach;
      if (best && bd <= def.range && bd <= treeD) return { kind: 'structure', s: best, x: best.x };
      if (treeD <= def.range) return { kind: 'tree', x: WORLD.treeX };
      return null;
    }

    for (const st of s.structures) {
      if (st.underground) continue;
      if (!NESTS[st.family].blocks && !def.smashesStructures) continue;
      if (!ahead(st.x)) continue;
      if (Math.abs(st.x - e.x) <= contact + 4) return { kind: 'structure', s: st, x: st.x };
    }
    const k = s.keeper;
    if (k.alive && e.kind !== 'mother' && Math.abs(k.x - e.x) <= contact) return { kind: 'keeper', x: k.x };
    if (Math.abs(WORLD.treeX - e.x) <= WORLD.treeReach + def.radius) return { kind: 'tree', x: WORLD.treeX };
    return null;
  }

  private spitAcid(e: Enemy, target: Target) {
    const s = this.state;
    const sx = e.x + e.dir * 6;
    const sy = WORLD.groundY - 14;
    const tx = target.x;
    const ty = WORLD.groundY - (target.kind === 'tree' ? 40 : 14);
    const flight = 0.9;
    s.projectiles.push({
      id: s.nextId++, kind: 'acid', x: sx, y: sy, vx: (tx - sx) / flight,
      vy: (ty - sy) / flight - 0.5 * 260 * flight, damage: ENEMIES[e.kind].damage * this.enemyDamageMul(),
      targetId: target.kind === 'tree' ? -1 : target.kind === 'structure' ? target.s.id : -2,
      tx, ty, pierce: 0, hit: [], life: flight, age: 0,
    });
    this.emit({ type: 'shoot', kind: 'acid', x: sx, y: sy });
  }

  // ───────────────────────────── nests ───────────────────────────────

  private damageStructure(st: Structure, amount: number, attacker?: Enemy) {
    const s = this.state;
    st.hp -= amount;
    st.hitFlash = 0.12;
    this.emit({ type: 'structureHit', id: st.id, x: st.x });
    const ns = this.nestStats(st);
    if (attacker && ns.thorns) this.damageEnemy(attacker, ns.thorns);
    if (st.hp <= 0) {
      s.structures = s.structures.filter((x) => x !== st);
      if (st.family === 'beetle' && this.mods.beetleRevive) this.graveyard.push({ slotId: st.slotId, tier: st.tier, spec: st.spec });
      this.emit({ type: 'structureLost', family: st.family, x: st.x, underground: st.underground });
    }
  }

  private refreshNestHp() {
    for (const st of this.state.structures) {
      const hp = this.nestStats(st).hp;
      if (hp !== st.maxHp) { st.hp += hp - st.maxHp; st.maxHp = hp; }
    }
  }

  /** Can a nest target this surface enemy? (lit, or near the light with the hive capstone) */
  private visibleTo(st: Structure, e: Enemy): boolean {
    if (e.lit) return true;
    if (st.family === 'hive' && this.mods.hiveSeesDark) {
      return this.isLit(e.x + Math.sign(WORLD.treeX - e.x) * 30, false);
    }
    return false;
  }

  private hasteMult(st: Structure): number {
    let m = st.haste > 0 ? 1.3 : 1;
    if (this.mods.dragonflyHaste) {
      for (const d of this.state.structures) {
        if (d.family === 'dragonfly' && d !== st && Math.abs(d.x - st.x) <= this.nestStats(d).light!) { m *= 1.2; break; }
      }
    }
    return m;
  }

  private updateStructures(dt: number) {
    for (const st of this.state.structures) {
      st.age += dt;
      st.hitFlash = Math.max(0, st.hitFlash - dt);
      st.haste = Math.max(0, st.haste - dt);
      st.cd -= dt * this.hasteMult(st);
      const ns = this.nestStats(st);
      switch (st.family) {
        case 'hive': this.tickHive(st, ns); break;
        case 'beetle': this.tickBeetle(st, ns, dt); break;
        case 'dragonfly': this.tickDragonfly(st, ns, dt); break;
        case 'spider': this.tickSpider(st, ns); break;
        case 'caterpillar': break;
      }
    }
  }

  private surfaceTargets(st: Structure, range: number): Enemy[] {
    return this.state.enemies
      .filter((e) => !e.dead && !ENEMIES[e.kind].underground && this.visibleTo(st, e) && Math.abs(e.x - st.x) <= range)
      .sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
  }

  private tickHive(st: Structure, ns: NestStats) {
    if (st.cd > 0) return;
    const targets = this.surfaceTargets(st, ns.range);
    if (!targets.length) return;
    st.cd = ns.rate;
    if (ns.pierce) {
      // Igg-Beam: hits the target and the creatures behind it
      const t = targets[0];
      const out = Math.sign(t.x - WORLD.treeX) || 1;
      const line = this.state.enemies
        .filter((e) => !e.dead && !ENEMIES[e.kind].underground && (e.x - t.x) * out >= 0 && Math.abs(e.x - t.x) <= 70)
        .sort((a, b) => Math.abs(a.x - t.x) - Math.abs(b.x - t.x))
        .slice(0, ns.pierce);
      for (const e of line) this.damageEnemy(e, ns.damage, true, true);
      st.aim = Math.sign(t.x - st.x) || st.aim;
      const far = line[line.length - 1] ?? t;
      this.emit({ type: 'beam', x: st.x, y: WORLD.groundY - 40, tx: far.x + out * 10, ty: far.y - 8 });
      return;
    }
    const volley = ns.volley ?? 1;
    for (let i = 0; i < volley; i++) {
      const t = targets[i % targets.length];
      st.aim = Math.sign(t.x - st.x) || st.aim;
      this.fireHoming('arrow', st.x + (i - (volley - 1) / 2) * 3, WORLD.groundY - 34 - i * 2, t, ns.damage, 300);
    }
    this.emit({ type: 'shoot', kind: 'arrow', x: st.x, y: WORLD.groundY - 34 });
  }

  private tickBeetle(st: Structure, ns: NestStats, dt: number) {
    if (ns.regen && this.isLit(st.x, false)) st.hp = Math.min(st.maxHp, st.hp + ns.regen * dt);
    if (ns.heal) {
      // Светожук-Целитель: healing light dome over neighbouring nests
      for (const o of this.state.structures) {
        if (o === st || Math.abs(o.x - st.x) > ns.range || o.hp >= o.maxHp) continue;
        o.hp = Math.min(o.maxHp, o.hp + ns.heal * dt);
      }
      st.cd -= 0;
    }
    if (!ns.knock || st.cd > 0) return;
    const out = st.x < WORLD.treeX ? -1 : 1;
    const hit = this.state.enemies.filter((e) => !e.dead && !ENEMIES[e.kind].underground
      && (e.x - st.x) * out >= -4 && Math.abs(e.x - st.x) <= ns.range);
    if (!hit.length) return;
    st.cd = ns.rate;
    for (const e of hit) {
      this.damageEnemy(e, ns.damage, true, true);
      this.stunEnemy(e, ns.stun ?? 1);
      if (e.kind !== 'mother') e.kick = out * ns.knock! * ENEMIES[e.kind].ccMult;
    }
    this.emit({ type: 'ram', x: st.x, dir: out });
  }

  private tickDragonfly(st: Structure, ns: NestStats, dt: number) {
    const s = this.state;
    const r = ns.light!;
    for (const e of s.enemies) {
      if (e.dead || ENEMIES[e.kind].underground || Math.abs(e.x - st.x) > r) continue;
      this.damageQuiet(e, ns.burn! * dt);
    }
    if (!ns.chain || st.cd > 0) return;
    let cur: Enemy | undefined = s.enemies
      .filter((e) => !e.dead && !ENEMIES[e.kind].underground && Math.abs(e.x - st.x) <= r)
      .sort((a, b) => Math.abs(a.x - st.x) - Math.abs(b.x - st.x))[0];
    if (!cur) return;
    st.cd = ns.rate;
    const pts: Array<[number, number]> = [[st.x, WORLD.groundY - 34]];
    const hit = new Set<number>();
    for (let i = 0; i < ns.chain && cur; i++) {
      hit.add(cur.id);
      pts.push([cur.x, cur.y - ENEMIES[cur.kind].height * 0.6]);
      this.damageEnemy(cur, ns.damage * (1 - i * 0.1), true, true);
      const from: Enemy = cur;
      cur = s.enemies
        .filter((e) => !e.dead && !hit.has(e.id) && !ENEMIES[e.kind].underground && e.lit && Math.abs(e.x - from.x) <= 70)
        .sort((a, b) => Math.abs(a.x - from.x) - Math.abs(b.x - from.x))[0];
    }
    this.emit({ type: 'chain', points: pts });
  }

  private tickSpider(st: Structure, ns: NestStats) {
    if (st.cd > 0) return;
    const s = this.state;
    const prey = s.enemies.filter((e) => !e.dead && Math.abs(e.x - st.x) <= ns.range
      && (ENEMIES[e.kind].underground || (this.mods.spiderSurface && ENEMIES[e.kind].worm)));
    if (!prey.length) return;
    prey.sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
    st.cd = ns.rate;
    const t = prey[0];
    this.damageEnemy(t, ns.damage, true, true);
    if (ns.stun) t.rooted = Math.max(t.rooted, ns.stun * ENEMIES[t.kind].ccMult);
    if (ns.poison) {
      for (const e of prey) { e.poison = ns.poison; e.poisonTime = ns.poisonTime ?? 4; }
    }
    this.emit({ type: 'spikeStrike', x: st.x, tx: t.x, web: !!ns.stun });
  }

  /** Damage-over-time without spamming hit events. */
  private damageQuiet(e: Enemy, amount: number) {
    if (e.dead) return;
    const def = ENEMIES[e.kind];
    const mult = def.worm && this.isLit(e.x, def.underground) ? WORM_LIGHT_MULT : 1;
    e.hp -= amount * mult;
    if (e.hp <= 0) this.killEnemy(e);
  }

  private fireHoming(kind: 'arrow' | 'spark', x: number, y: number, t: Enemy, damage: number, speed: number) {
    const s = this.state;
    const ty = t.y - ENEMIES[t.kind].height * 0.5;
    const d = Math.hypot(t.x - x, ty - y) || 1;
    s.projectiles.push({
      id: s.nextId++, kind, x, y, vx: ((t.x - x) / d) * speed, vy: ((ty - y) / d) * speed - (kind === 'arrow' ? 40 : 0),
      damage, targetId: t.id, tx: t.x, ty, pierce: 0, hit: [], life: 3, age: 0,
    });
  }

  // ───────────────────────────── tree ────────────────────────────────

  private damageTree(amount: number, by: EnemyKind, attacker?: Enemy) {
    const t = this.state.tree;
    let dmg = amount;
    if (t.shield > 0) {
      const absorbed = Math.min(t.shield, dmg);
      t.shield -= absorbed;
      dmg -= absorbed;
    }
    t.hp -= dmg;
    t.hitFlash = 0.15;
    if (attacker && this.mods.treeReflect > 0 && ENEMIES[attacker.kind].range === 0) {
      this.damageEnemy(attacker, amount * this.mods.treeReflect);
    }
    if (t.stage + 1 >= TREE.shieldStage && !t.shieldUsed && t.hp < this.treeMaxHp() * TREE.shieldThreshold) {
      t.shieldUsed = true;
      t.shield = TREE.shieldAmount;
      this.emit({ type: 'shield' });
    }
    this.emit({ type: 'treeHit', amount: dmg, by });
  }

  private grow() {
    const s = this.state;
    const t = s.tree;
    const prevR = s.tree.radius;
    t.growth -= this.stageDef.growCost;
    t.stage++;
    const prevMax = Math.round(TREE_STAGES[t.stage - 1].maxHp * (1 + this.mods.treeHp));
    t.hp = Math.min(this.treeMaxHp(), t.hp + (this.treeMaxHp() - prevMax) + this.treeMaxHp() * TREE.growHeal);
    for (const e of s.enemies) {
      if (e.dead || ENEMIES[e.kind].underground) continue;
      const d = Math.abs(e.x - WORLD.treeX);
      if (d > prevR && d <= this.treeRadius()) this.damageEnemy(e, TREE.growBurn);
    }
    this.refreshNestHp();
    if (TREE_BRANCHES[t.stage]) s.choices.push({ kind: 'branch', stage: t.stage });
    this.emit({ type: 'treeGrew', stage: t.stage });
  }

  private updateTreeRadius(dt: number) {
    const t = this.state.tree;
    const target = this.treeRadius();
    if (t.radius < target) t.radius = Math.min(target, t.radius + 70 * dt);
    else t.radius = target;
  }

  private updateTree(dt: number) {
    const s = this.state;
    const t = s.tree;
    t.hitFlash = Math.max(0, t.hitFlash - dt);
    if (s.phase === 'night' && this.mods.treeRegen > 0) t.hp = Math.min(this.treeMaxHp(), t.hp + this.mods.treeRegen * dt);
    const stageNo = t.stage + 1;
    if (stageNo >= TREE.sparkStage) {
      t.sparkCd -= dt;
      if (t.sparkCd <= 0) {
        const cands = s.enemies
          .filter((e) => !e.dead && !ENEMIES[e.kind].underground && e.lit && Math.abs(e.x - WORLD.treeX) <= TREE.sparkRange)
          .sort((a, b) => Math.abs(a.x - WORLD.treeX) - Math.abs(b.x - WORLD.treeX));
        if (cands.length) {
          t.sparkCd = TREE.sparkRate;
          const n = 1 + this.mods.sparkCount;
          for (let i = 0; i < n; i++) {
            const e = cands[i % cands.length];
            this.fireHoming('spark', WORLD.treeX + (e.x < WORLD.treeX ? -10 : 10), WORLD.groundY - 70, e,
              TREE.sparkDamage * this.treePower() * (1 + this.mods.sparkDamage), 220);
          }
          this.emit({ type: 'shoot', kind: 'spark', x: WORLD.treeX, y: WORLD.groundY - 70 });
        }
      }
    }
    if (stageNo >= TREE.polariaStage) this.tickPolaria(dt);
    if (stageNo >= TREE.rootBurnStage) {
      for (const e of s.enemies) {
        if (e.dead || !ENEMIES[e.kind].underground) continue;
        if (Math.abs(e.x - WORLD.treeX) <= TREE.rootBurnRange) this.damageQuiet(e, TREE.rootBurnDps * (1 + this.mods.rootBurn) * dt);
      }
    }
  }

  private polariaCd: number[] = [];
  private nightDeadline = Infinity;

  /** Polaria drone positions (golden jellyfish drifting around the crown). */
  polariaPositions(): Array<[number, number]> {
    const n = TREE.polariaCount + this.mods.polaria;
    const t = this.state.time;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.35;
      out.push([WORLD.treeX + Math.cos(a) * (70 + (i % 2) * 40), WORLD.groundY - 120 + Math.sin(a * 1.3) * 26]);
    }
    return out;
  }

  private tickPolaria(dt: number) {
    const s = this.state;
    const pos = this.polariaPositions();
    for (let i = 0; i < pos.length; i++) {
      this.polariaCd[i] = (this.polariaCd[i] ?? this.rand()) - dt;
      if (this.polariaCd[i] > 0) continue;
      const [px, py] = pos[i];
      const t = s.enemies
        .filter((e) => !e.dead && !ENEMIES[e.kind].underground && e.lit && Math.abs(e.x - px) <= TREE.polariaRange)
        .sort((a, b) => Math.abs(a.x - px) - Math.abs(b.x - px))[0];
      if (!t) continue;
      this.polariaCd[i] = TREE.polariaRate;
      this.damageEnemy(t, TREE.polariaDamage * this.treePower(), true, true);
      this.emit({ type: 'polaria', x: px, y: py, tx: t.x, ty: t.y - ENEMIES[t.kind].height * 0.5 });
    }
  }

  // ───────────────────────────── projectiles ─────────────────────────

  private updateProjectiles(dt: number) {
    const s = this.state;
    const k = s.keeper;
    const spawned: typeof s.projectiles = [];
    for (const p of s.projectiles) {
      p.age += dt;
      p.life -= dt;
      if (p.kind === 'acid') {
        p.vy += 260 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          if (p.targetId === -1) this.damageTree(p.damage, 'spitter');
          else {
            const st = s.structures.find((x) => x.id === p.targetId);
            if (st) this.damageStructure(st, p.damage);
          }
          this.emit({ type: 'acidSplash', x: p.tx, y: p.ty });
        }
        continue;
      }
      if (p.kind === 'meteor') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.life <= 0) {
          const def = ABILITIES.starfall;
          for (const e of s.enemies) {
            if (e.dead || ENEMIES[e.kind].underground || Math.abs(e.x - p.tx) > def.impactRadius + ENEMIES[e.kind].radius) continue;
            this.damageEnemy(e, p.damage);
            this.stunEnemy(e, def.stun);
          }
          s.burns.push({ x: p.tx, halfWidth: 24, dps: def.burnDps * this.abilityMult('starfall') * (1 + this.mods.starfallBurn), life: def.burnTime });
          this.emit({ type: 'meteor', x: p.tx });
        }
        continue;
      }
      if (p.kind === 'spear') {
        p.x += p.vx * dt;
        const def = ABILITIES.spear;
        for (const e of s.enemies) {
          if (e.dead || p.pierce <= 0 || p.hit.includes(e.id)) continue;
          const ed = ENEMIES[e.kind];
          if (ed.underground) continue;
          if (Math.abs(e.x - p.x) <= ed.radius + 3 && p.y >= e.y - ed.height - 4) {
            const n = p.hit.length;
            p.hit.push(e.id);
            p.pierce--;
            let dmg = p.damage * Math.max(0.25, 1 - def.falloff * n);
            if (this.mods.spearRhythm) {
              k.rhythm++;
              k.rhythmT = 2;
              if (k.rhythm % 3 === 0) dmg *= 2;
            }
            if (this.mods.spearBeacon) e.marked = 4;
            this.damageEnemy(e, dmg);
          }
        }
        if (p.pierce <= 0 && this.mods.spearRicochet && !p.bounced) {
          const next = s.enemies
            .filter((e) => !e.dead && !p.hit.includes(e.id) && !ENEMIES[e.kind].underground && Math.abs(e.x - p.x) < 130)
            .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];
          if (next) {
            const dir = Math.sign(next.x - p.x) || 1;
            spawned.push({
              ...p, id: s.nextId++, vx: dir * def.speed, damage: p.damage * 0.6, pierce: 1, hit: [...p.hit],
              life: 0.5, age: 0, bounced: true,
            });
          }
        }
        if (p.pierce <= 0 || p.x < -20 || p.x > WORLD.width + 20) p.life = 0;
        continue;
      }
      // homing arrow / spark
      const t = s.enemies.find((e) => e.id === p.targetId && !e.dead);
      if (t) {
        p.tx = t.x;
        p.ty = t.y - ENEMIES[t.kind].height * 0.5;
      }
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const d = Math.hypot(dx, dy);
      const speed = Math.hypot(p.vx, p.vy);
      if (d <= speed * dt + 2) {
        if (t) this.damageEnemy(t, p.damage, true, true);
        p.life = 0;
        continue;
      }
      const kk = Math.min(1, dt * 12);
      p.vx += ((dx / d) * speed - p.vx) * kk;
      p.vy += ((dy / d) * speed - p.vy) * kk;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    s.projectiles.push(...spawned);
  }

  // ───────────────────────────── drops ───────────────────────────────

  private updateDrops(dt: number) {
    const s = this.state;
    const k = s.keeper;
    const magnet = KEEPER.magnetRadius * (1 + this.mods.magnet);
    for (const d of s.drops) {
      d.age += dt;
      const dist = Math.abs(d.x - k.x) + Math.abs(d.y - (WORLD.groundY - 8)) * 0.5;
      if (k.alive && dist <= magnet) d.pulled = true;
      // the tree's roots draw in loot that falls close to the trunk
      if (!d.pulled && !d.rooted && d.grounded && s.tree.stage >= 1 && Math.abs(d.x - WORLD.treeX) <= s.tree.radius * 0.3) d.rooted = true;
      if (d.rooted && !d.pulled) {
        const dx = WORLD.treeX - d.x;
        d.x += Math.sign(dx) * Math.min(Math.abs(dx), (50 + d.age * 10) * dt);
        if (Math.abs(dx) < 4) {
          if (d.kind === 'amber') { s.amber += d.value; s.stats.amberCollected += d.value; } else { s.star += d.value; s.stats.starCollected += d.value; }
          d.life = 0;
          this.emit({ type: 'pickup', kind: d.kind, x: d.x, y: d.y, value: d.value });
        }
        continue;
      }
      if (d.pulled && k.alive) {
        const dx = k.x - d.x;
        const dy = WORLD.groundY - 10 - d.y;
        const len = Math.hypot(dx, dy) || 1;
        const sp = KEEPER.magnetSpeed + d.age * 40;
        d.x += (dx / len) * sp * dt;
        d.y += (dy / len) * sp * dt;
        if (len <= KEEPER.pickupRadius) {
          if (d.kind === 'amber') { s.amber += d.value; s.stats.amberCollected += d.value; }
          else { s.star += d.value; s.stats.starCollected += d.value; }
          d.life = 0;
          this.emit({ type: 'pickup', kind: d.kind, x: d.x, y: d.y, value: d.value });
        }
        continue;
      }
      if (!d.grounded) {
        d.vy += 300 * dt;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        d.x = Math.max(6, Math.min(WORLD.width - 6, d.x));
        if (d.y >= WORLD.groundY - 3) {
          d.y = WORLD.groundY - 3;
          d.grounded = true;
          d.vx = 0;
          d.vy = 0;
        }
      }
      d.life -= dt;
    }
  }

  /** Caterpillar collectors: crawl to drops within their nest's reach and carry them to the tree. */
  private updateWorkers(dt: number) {
    const s = this.state;
    // keep worker count in sync with nests
    const nests = s.structures.filter((x) => x.family === 'caterpillar');
    s.workers = s.workers.filter((w) => {
      if (nests.some((n) => n.id === w.nestId)) return true;
      if (w.carry) this.dropAt(w.x, w.carry.kind, w.carry.value);
      return false;
    });
    for (const n of nests) {
      const want = this.nestStats(n).workers ?? 0;
      const have = s.workers.filter((w) => w.nestId === n.id).length;
      for (let i = have; i < want; i++) s.workers.push({ id: s.nextId++, nestId: n.id, x: n.x, dir: 1, carry: null, target: 0, walk: this.rand() * 3 });
    }
    for (const w of s.workers) {
      const nest = nests.find((n) => n.id === w.nestId)!;
      const ns = this.nestStats(nest);
      const speed = ns.speed ?? 40;
      let goal = nest.x;
      if (w.carry) {
        goal = WORLD.treeX;
        if (Math.abs(w.x - goal) < 6) {
          const v = Math.round(w.carry.value * (1 + (ns.bonus ?? 0)));
          if (w.carry.kind === 'amber') { s.amber += v; s.stats.amberCollected += v; } else { s.star += v; s.stats.starCollected += v; }
          this.emit({ type: 'pickup', kind: w.carry.kind, x: w.x, y: WORLD.groundY - 4, value: v });
          w.carry = null;
        }
      } else {
        let d = s.drops.find((x) => x.id === w.target && x.life > 0 && !x.pulled);
        if (!d) {
          w.target = 0;
          d = s.drops
            .filter((x) => x.grounded && !x.pulled && !x.rooted && x.claimed === 0 && Math.abs(x.x - nest.x) <= ns.range)
            .sort((a, b) => Math.abs(a.x - w.x) - Math.abs(b.x - w.x))[0];
          if (d) { d.claimed = w.id; w.target = d.id; }
        }
        if (d) {
          goal = d.x;
          if (Math.abs(w.x - d.x) < 4) {
            w.carry = { kind: d.kind, value: d.value };
            d.life = 0;
            w.target = 0;
          }
        }
      }
      const dx = goal - w.x;
      if (Math.abs(dx) > 1) {
        w.dir = dx > 0 ? 1 : -1;
        w.x += w.dir * Math.min(Math.abs(dx), speed * dt);
        w.walk += dt;
      }
    }
  }

  private dropAt(x: number, kind: DropKind, value: number) {
    const s = this.state;
    s.drops.push({
      id: s.nextId++, kind, x, y: WORLD.groundY - 3, vx: 0, vy: 0, value, life: 20, grounded: true, pulled: false,
      age: 0, claimed: 0, rooted: false,
    });
  }

  private updateTempLights(dt: number) {
    for (const t of this.state.tempLights) t.life -= dt;
    for (const b of this.state.burns) b.life -= dt;
  }

  private cleanup() {
    const s = this.state;
    s.enemies = s.enemies.filter((e) => !e.dead && e.x > -60 && e.x < WORLD.width + 60);
    s.projectiles = s.projectiles.filter((p) => p.life > 0);
    s.drops = s.drops.filter((d) => d.life > 0);
    s.tempLights = s.tempLights.filter((t) => t.life > 0);
    s.burns = s.burns.filter((b) => b.life > 0);
  }

  // ───────────────────────────── util ────────────────────────────────

  private pay(p: Price) {
    this.state.amber -= p.amber;
    this.state.star -= p.star;
  }

  private emit(e: GameEvent) { this.state.events.push(e); }

  private deny(reason: string): false {
    this.emit({ type: 'denied', reason });
    return false;
  }

  /** Remove and return all events emitted since the last drain. */
  drainEvents(): GameEvent[] {
    const ev = this.state.events;
    this.state.events = [];
    return ev;
  }
}
