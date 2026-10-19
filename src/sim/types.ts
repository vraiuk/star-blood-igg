import type { AbilityId, EnemyKind } from '../data/balance';
import type { Family, SpecId } from '../data/nests';
import type { KeeperRuneId } from '../data/runes';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** a neutral creature (in-world grazing herds, `GameState.herd`): runes and nests never aim at it */
  neutral?: boolean;
  /** grazer: index of its herd in `world.objects`, the herd's centre, where it wanders to and for how long */
  herd?: number;
  home?: number;
  wanderTo?: number;
  wanderT?: number;
  x: number;
  /** feet y (surface enemies) or body center y (underground) */
  y: number;
  /** direction of travel: +1 → right, −1 → left */
  dir: 1 | -1;
  hp: number;
  maxHp: number;
  speedMul: number;
  attackCd: number;
  stun: number;
  /** time since the last stun ended (diminishing returns window) */
  sinceStun: number;
  rooted: number;
  /** slow factor applied this tick (0 = none) */
  slow: number;
  poison: number;
  poisonTime: number;
  /** +damage from nests while > 0 (beacon rune) */
  marked: number;
  /** Starfall ground burn */
  burn: number;
  /** «Высвечивание»: extra damage taken (from dragonfly light) */
  vuln: number;
  /** armour shattered (Сверхзвезда) while > 0 */
  armorBreak: number;
  /** caught in weaver silk (slowed) while > 0 */
  web: number;
  /** elite modifier */
  affix: import('../data/balance').Affix | null;
  /** jumper: cooldown and remaining airtime */
  jumpCd: number;
  jumping: number;
  attacking: boolean;
  lit: boolean;
  /** seconds since spawn — drives animation */
  age: number;
  hitFlash: number;
  /** mother: time until next brood */
  broodCd: number;
  /** horizontal velocity from knockback, decays */
  kick: number;
  /** where the creature is now: on the ground, under it (worms, tunnel crawlers) or in the air */
  layer: 'ground' | 'under' | 'air';
  /** id of the tunnel it digs (diggers) or crawls through (ground creatures); 0 = none */
  tunnel: number;
  /** already crawled through a tunnel this night (won't dive again) */
  usedTunnel: boolean;
  /** inside a big worm's «Туман Тьмы» this tick */
  fogged: boolean;
  /** Tyrant carapace left (0 = broken / none) and its full value */
  plates: number;
  maxPlates: number;
  dead: boolean;
}

/** Лаз: a tunnel dug by a worm under the defenses. */
export interface Tunnel {
  id: number;
  /** direction of travel (+1 = from the left edge toward the trunk) */
  dir: 1 | -1;
  /** surface mouth outside the defenses (NaN until the digger reaches the Circle) */
  entryX: number;
  /** how far the digger has got / where it broke out */
  headX: number;
  /** the digger broke out: creatures can use it */
  open: boolean;
  /** Keeper's sealing progress 0..1 */
  seal: number;
  /** creatures it can still let through */
  left: number;
}

export interface Structure {
  id: number;
  family: Family;
  slotId: string;
  x: number;
  /** anchor y (root knot for underground nests) */
  y: number;
  underground: boolean;
  /** lives in the Tree's crown: creatures can't reach it */
  crown: boolean;
  /** 0..2 base levels; 3..4 = specialization levels */
  tier: number;
  spec: SpecId | null;
  hp: number;
  maxHp: number;
  cd: number;
  /** amber + star spent, for refunds */
  spentAmber: number;
  spentStar: number;
  hitFlash: number;
  age: number;
  /** last attack direction for animation */
  aim: number;
  /** attack-speed buff timer (sower rune) */
  haste: number;
  /** dragonfly: time until it can shoot down another acid glob */
  intercept: number;
  /** dragonfly nest: the creature its little dragonflies are stinging (0 = none) */
  stingTo?: number;
  /** Igg-Beam hive: seconds the beam keeps burning, its target and tick timer */
  beamT?: number;
  beamTo?: number;
  beamTick?: number;
  /** point upgrades (Огранка гнезда): damage, reach, speed levels */
  asp?: { dmg: number; rng: number; spd: number };
  /** merge stars (Слияние) and endless ascension levels (Возвышение) */
  merge: number;
  ascend: number;
}

export type ProjectileKind = 'arrow' | 'acid' | 'spear' | 'spark' | 'beam' | 'meteor' | 'wave';

export interface Projectile {
  id: number;
  kind: ProjectileKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  /** enemy id (arrow/spark) or structure id / -1 tree (acid) */
  targetId: number;
  tx: number;
  ty: number;
  pierce: number;
  hit: number[];
  life: number;
  age: number;
  /** spear: has it already ricocheted */
  bounced?: boolean;
  /** ricochets done so far */
  bounces?: number;
  /** damage multiplier vs flyers */
  airMult?: number;
  /** knockback on hit (fan apotheosis, wave) */
  knock?: number;
  /** stun on hit (wave apotheosis) */
  stun?: number;
  /** meteor: impact radius / stun / armour break / burn override */
  radius?: number;
  breakArmor?: number;
  burnTime?: number;
  /** hits underground creatures too (wave), with this damage factor on them */
  deep?: boolean;
  deepMult?: number;
  /** Сверхзвезда: huge, hits underground, leaves a crater and bursts into shards */
  giant?: boolean;
  /** a shard of a burst star (small, flies out of the crater) */
  shard?: boolean;
}

export type DropKind = 'amber' | 'star';

export interface Drop {
  id: number;
  kind: DropKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  value: number;
  life: number;
  grounded: boolean;
  pulled: boolean;
  /** claimed by a caterpillar worker (id) */
  claimed: number;
  /** being drawn in by the tree's roots */
  rooted: boolean;
  /** 0 falling, 1 hovering, 2 flying home to the Tree, 3 drifting away to the sky (lost) */
  mode: 0 | 1 | 2 | 3;
  /** seconds spent hovering */
  hover: number;
  age: number;
  /** in-world: seconds before the Keeper's magnet may take it again (knocked out of the purse) */
  lock?: number;
}

export interface TempLight {
  x: number;
  radius: number;
  life: number;
  maxLife: number;
  /** eclipse field / dome: slows enemies */
  slow?: number;
  /** dome of radiance: burns enemies, hastes and heals nests inside */
  dps?: number;
  haste?: number;
  heal?: number;
}

export interface GroundBurn { x: number; halfWidth: number; dps: number; life: number; /** Сверхзвезда's crater */ crater?: boolean; maxLife?: number; }

export interface Keeper {
  x: number;
  /** in-world worlds: Amber carried by the Keeper (cap: `Game.purseCap()`); 0 in legacy */
  purse: number;
  dir: 1 | -1;
  hp: number;
  alive: boolean;
  respawn: number;
  light: number;
  move: -1 | 0 | 1;
  cooldowns: Record<AbilityId, number>;
  /** full length of the current cooldown (for the UI sweep) */
  cdMax: Record<AbilityId, number>;
  /** Starfall charge 0..100 */
  charge: number;
  /** channelled Piercing Beam: seconds left, direction, damage per second */
  channel: number;
  channelDir: 1 | -1;
  channelDps: number;
  /** Сияние Игг remaining; Зов Роя remaining and where it was called */
  radianceT: number;
  swarmT: number;
  swarmX: number;
  /** Ascension rank 0..4 */
  rank: number;
  /** installed Observer properties per keeper rune */
  props: Record<KeeperRuneId, string[]>;
  /** slot capacity per keeper rune (3, or 4 with a Lesser Rune of Development) */
  slots: Record<KeeperRuneId, number>;
  /** creature runes and lasting gifts from the dawn roulette */
  boons: string[];
  /** rank of each keeper rune (0 Дерево … 4 Небо) */
  runeRank: Record<KeeperRuneId, number>;
  /** chosen Form of each ability rune */
  forms: Record<'spear' | 'hammer' | 'starfall', 'A' | 'B' | null>;
  /** Остановка Времени: seconds of frozen time left, its full length, nights until the rune is ready */
  timeStopT: number;
  timeStopMax: number;
  timeStopNights: number;
  /** Прыжок Молота: seconds left in the air, the flight, and the slam's power */
  leapT: number;
  leapDur: number;
  leapFrom: number;
  leapTo: number;
  leapMult: number;
  /** «Жертва Света» was made tonight: reviving costs much more until dawn */
  sacrificed?: boolean;
  /** Эхо Света: casts counted toward the free one; Стужа: seconds of post-freeze chill */
  echo: number;
  coldT: number;
  /** Созвучие stacks, time left on the window, and the last rune cast */
  chord: number;
  chordT: number;
  lastCast: string | null;
  /** Перегрев: consecutive spear throws and the window to the next one */
  heat: number;
  heatT: number;
  /** level of each installed Property, parallel to `props` (1..5) */
  propLv: Partial<Record<import('../data/runes').KeeperRuneId, number[]>>;
  /** chosen rune facets (Грани) and their levels (Огранка on Star ranks) */
  facets: string[];
  facetLv: Record<string, number>;
  /** runes the Keeper has learned (bought or gifted by the Observer) */
  learned: Record<import('../data/balance').AbilityId, boolean>;
  /** Ascended attributes 0..10 */
  attrs: Record<import('../data/balance').AttrId, number>;
  castAnim: number;
  hitFlash: number;
  walkT: number;
  /** spear rhythm counter */
  rhythm: number;
  rhythmT: number;
  /** last-light rune state */
  freeCast: number;
  lastLightCd: number;
}

export interface Tree {
  /** 0-based stage index */
  stage: number;
  /** Amber invested toward the next stage */
  growth: number;
  hp: number;
  /** current (animated) light radius — gameplay uses this */
  radius: number;
  sparkCd: number;
  hitFlash: number;
  /** chosen branch ids */
  branches: string[];
  /** stage-5 shield */
  shield: number;
  shieldUsed: boolean;
  secondWindUsed: boolean;
  /** endless growth rings after the Great Igg-Tree */
  rings: number;
}

/** A Golden Termite warrior from a termite mound. */
export interface Soldier {
  id: number;
  nestId: number;
  x: number;
  dir: 1 | -1;
  hp: number;
  maxHp: number;
  cd: number;
  /** seconds until respawn while dead (hp <= 0) */
  respawn: number;
  walk: number;
  hitFlash: number;
}

/** A caterpillar collector crawling along the ground. */
export interface Worker {
  id: number;
  nestId: number;
  x: number;
  dir: 1 | -1;
  /** gathered bundle */
  carry: { amber: number; star: number; n: number };
  target: number;
  walk: number;
  /** carrying the bundle back to the tree */
  home: boolean;
  /** seconds left of the silk descent from the crown, and its start height */
  descend: number;
  fromY: number;
}

/** `won`: the world's goal is reached (micro: the Seed carried out of the Circle) — the run is over. */
export type Phase = 'day' | 'night' | 'lost' | 'won';

/** IGG2 micro: the Seed the grown Tree drops (spec §5) — lying at `x` or carried by the Keeper. */
export interface SeedState { x: number; carried: boolean }

/** A pending choice that pauses the day timer until resolved. */
export type Choice =
  | { kind: 'dawn'; offers: string[]; start?: boolean }
  | { kind: 'branch'; stage: number }
  | { kind: 'facet'; rune: KeeperRuneId; rank: number; offers: string[] }
  | { kind: 'form'; rune: KeeperRuneId; rank: number; offers: string[] }
  | { kind: 'facetUp'; rune: KeeperRuneId; rank: number; offers: string[] };

export type GameEvent =
  | { type: 'hit'; x: number; y: number; amount: number; crit: boolean }
  | { type: 'enemyDied'; kind: EnemyKind; x: number; y: number }
  | { type: 'shoot'; kind: ProjectileKind; x: number; y: number }
  | { type: 'beam'; x: number; y: number; tx: number; ty: number }
  | { type: 'chain'; points: Array<[number, number]> }
  | { type: 'ram'; x: number; dir: number }
  | { type: 'acidSplash'; x: number; y: number }
  | { type: 'structureHit'; id: number; x: number }
  | { type: 'structureLost'; family: Family; x: number; y: number; underground: boolean }
  | { type: 'built'; family: Family; x: number; y: number; underground: boolean; tier: number }
  | { type: 'sold'; x: number }
  | { type: 'pickup'; kind: DropKind; x: number; y: number; value: number }
  | { type: 'treeHit'; amount: number; by: EnemyKind }
  | { type: 'treeGrew'; stage: number }
  | { type: 'shield' }
  | { type: 'secondWind' }
  | { type: 'keeperHit' }
  | { type: 'keeperDown' }
  | { type: 'keeperBack' }
  | { type: 'rankUp'; rank: number }
  | { type: 'rune'; id: string }
  | { type: 'devRune'; x: number }
  | { type: 'lostLoot'; x: number; y: number }
  | { type: 'emerge'; x: number }
  | { type: 'tunnelOpen'; x: number }
  | { type: 'slam'; x: number }
  | { type: 'plateBreak'; x: number; y: number }
  | { type: 'treeDanger' }
  | { type: 'sacrifice'; x: number }
  | { type: 'devour'; x: number }
  | { type: 'cleave'; x: number; r: number }
  | { type: 'tunnelSealed'; x: number; by: 'keeper' | 'hammer' | 'worn' }
  | { type: 'blast'; x: number; y: number }
  | { type: 'intercept'; x: number; y: number; fx: number; fy: number }
  | { type: 'jump'; x: number }
  | { type: 'wrath'; value: number; up: boolean }
  | { type: 'merge'; x: number; y: number; from: Array<[number, number]> }
  | { type: 'mend'; x: number; y: number; tx: number; ty: number }
  | { type: 'heal'; x: number; y: number; amount: number }
  | { type: 'polaria'; x: number; y: number; tx: number; ty: number }
  | { type: 'cast'; ability: AbilityId; x: number; tx: number }
  | { type: 'meteor'; x: number; giant?: boolean; shard?: boolean }
  | { type: 'spikeStrike'; x: number; y: number; tx: number; ty: number; web: boolean }
  | { type: 'nightStart'; night: number }
  | { type: 'rush'; night: number; amber: number; star: number }
  /** `winter`: «Зима» halved the in-world dawn income (medium, spec §6) */
  | { type: 'dawn'; night: number; gift: number; winter?: boolean }
  | { type: 'brood'; x: number }
  | { type: 'milestone'; stars: number }
  | { type: 'lost' }
  /** in-world: Amber flowed from the purse (or the Treasury) into an object; `progress` 0..1 of its price */
  | { type: 'pour'; x: number; target: string; amount: number; progress: number }
  /** in-world: Amber taken from the Treasury into the purse */
  | { type: 'take'; x: number; amount: number }
  /** in-world: a pledge was fulfilled and its action ran */
  | { type: 'pledgeDone'; x: number; target: string }
  /** in-world: Amber knocked out of the purse by a hit / spilled on death */
  | { type: 'knock'; x: number; amount: number; death: boolean }
  /** in-world: a rune became known — the Observer's fixed gift or a Tree stage (spec §4) */
  | { type: 'runeLearned'; ability: AbilityId; by: 'gift' | 'stage'; line?: string }
  /** in-world: a geode cracked open (S held, or the Hammer) and spilled its Amber */
  | { type: 'geodeCracked'; x: number; amber: number }
  /** in-world: the Circle reached a thicket and burnt it away */
  | { type: 'thicketBurnt'; x: number }
  /** micro: the grown Tree dropped the Seed at its trunk / the Keeper took it / dropped it */
  | { type: 'seedDropped'; x: number }
  | { type: 'seedTaken'; x: number }
  | { type: 'seedLost'; x: number }
  /** medium (spec §6): a Sleeping Creature woke — its family can be built */
  | { type: 'sleeperWoken'; x: number; family: Family }
  /** medium: a stela's run blessing was bought */
  | { type: 'stelaBlessed'; x: number; blessing: 'nestHp' | 'lightRegen' }
  /** medium: a Dead Tree was lit / a creature gnaws it / it went out */
  | { type: 'huskLit'; x: number }
  | { type: 'huskHit'; x: number; id: string }
  | { type: 'huskOut'; x: number }
  /** medium: a Void Rift was sealed (the Eclipse falls; the next night is its retaliation wave) */
  | { type: 'riftSealed'; x: number; side: 'L' | 'R'; sealed: number }
  /** medium: the retaliation wave was survived — that side is silent for good */
  | { type: 'riftSilent'; side: 'L' | 'R' }
  /** the world's goal is reached (phase `won`) */
  | { type: 'won' }
  | { type: 'denied'; reason: string };

/** In-world input and verb timers (spec §3). Held flags are set by `Game.setPour/setTake/setSell`. */
export interface InteractState {
  pour: boolean;
  take: boolean;
  sell: boolean;
  /** seconds the current verb has been held on the current focus (rate ramp) */
  holdT: number;
  /** fractional Amber accumulated by the rate */
  acc: number;
  /** seconds X has been held on the current nest */
  sellT: number;
  /** focus id the timers belong to */
  focusId: string | null;
  /** chosen option index per object id (Q/E) */
  opt: Record<string, number>;
  /** world x of each pledged object (to return the pledge when the object vanishes) */
  pledgeX: Record<string, number>;
  /** a refusal was already told for this press */
  told: boolean;
}


export interface PendingSpawn {
  at: number;
  kind: EnemyKind;
  side: 'L' | 'R';
}

export interface Stats {
  kills: number;
  amberCollected: number;
  starCollected: number;
  amberToTree: number;
  time: number;
  /** damage dealt by source (ability, nest family, tree, keeper…) — for run logs */
  dmg: Record<string, number>;
  /** casts per ability */
  casts: Record<string, number>;
  /** kills per creature kind */
  killsBy: Record<string, number>;
  /** damage taken by the Tree per creature kind */
  treeDmgBy: Record<string, number>;
  keeperDeaths: number;
  rushes: number;
  /** per-night snapshots */
  nights: Array<{ night: number; time: number; treeDmg: number; kills: number; amber: number; star: number; wrath: number; rushed: boolean }>;
}

export interface GameState {
  phase: Phase;
  /** index of the current night (during night) or the next night (during day) */
  night: number;
  phaseTime: number;
  dayLeft: number;
  amber: number;
  star: number;
  /** unspent Lesser Runes of Development */
  devRunes: number;
  /** «Натиск»: nights called early whose dawn rewards wait for the next real dawn */
  rushedDawns: number;
  /** «Гнев Тьмы»: adaptive strength of the endless night (1 = baseline) */
  wrath: number;
  enemies: Enemy[];
  structures: Structure[];
  projectiles: Projectile[];
  drops: Drop[];
  workers: Worker[];
  soldiers: Soldier[];
  tempLights: TempLight[];
  burns: GroundBurn[];
  tunnels: Tunnel[];
  keeper: Keeper;
  tree: Tree;
  pending: PendingSpawn[];
  /** queue of choices; the first one is shown */
  choices: Choice[];
  events: GameEvent[];
  stats: Stats;
  nextId: number;
  time: number;
  /** in-world: Amber poured toward an object's price, by object id (partial payment) */
  pledges: Record<string, number>;
  /** in-world: families opened by waking their Sleeping Creature (phase 6) */
  unlockedFamilies: Family[];
  interact: InteractState;
  /** in-world: neutral grazers of the herds (kept apart from `enemies`: they never hold up a night) */
  herd: Enemy[];
  /** in-world object state by object id (`geode:2`, `thicket:1` — index into `world.objects`) */
  wobj: { cracked: string[]; burnt: string[] };
  /** micro: the Seed, once the grown Tree has dropped it (null before) */
  seed: SeedState | null;
  /** medium: Sleepers, stelae, Dead Trees and Rifts (spec §6) */
  mw: MediumState;
}

/** «Поляна» object state (spec §6). Ids are world object ids (`deadTree:2`, `rift:0`). */
export interface MediumState {
  /** woken Sleeping Creatures */
  woken: string[];
  /** stelae whose blessing was bought */
  blessed: string[];
  /** burning Dead Trees: id → husk HP (absent = dead / gone out) */
  husks: Record<string, number>;
  /** Rifts sealed, by side, in order */
  sealed: Array<'L' | 'R'>;
  /** sides whose retaliation wave was survived: no creature comes from them any more */
  silent: Array<'L' | 'R'>;
  /** a sealed side whose retaliation wave is still to come / under way */
  wave: 'L' | 'R' | null;
  /** the 0-based night index of that wave (set when it starts) */
  waveNight: number | null;
  /** seconds of the Eclipse sky left (visual; the day was cut short) */
  eclipse: number;
}

/** A fresh medium state (also for old saves). */
export const emptyMedium = (): MediumState => ({ woken: [], blessed: [], husks: {}, sealed: [], silent: [], wave: null, waveNight: null, eclipse: 0 });
