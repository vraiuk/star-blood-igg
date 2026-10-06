import type { AbilityId, EnemyKind } from '../data/balance';
import type { Family, SpecId } from '../data/nests';
import type { KeeperRuneId } from '../data/runes';

export interface Enemy {
  id: number;
  kind: EnemyKind;
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
  dead: boolean;
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
  /** knockback on hit (fan apotheosis, wave) */
  knock?: number;
  /** stun on hit (wave apotheosis) */
  stun?: number;
  /** meteor: impact radius / stun / armour break / burn override */
  radius?: number;
  breakArmor?: number;
  burnTime?: number;
  /** hits underground creatures too (wave) */
  deep?: boolean;
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

export interface GroundBurn { x: number; halfWidth: number; dps: number; life: number; }

export interface Keeper {
  x: number;
  dir: 1 | -1;
  hp: number;
  alive: boolean;
  respawn: number;
  light: number;
  move: -1 | 0 | 1;
  cooldowns: Record<AbilityId, number>;
  /** Starfall charge 0..100 */
  charge: number;
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

export type Phase = 'day' | 'night' | 'won' | 'lost';

/** A pending choice that pauses the day timer until resolved. */
export type Choice =
  | { kind: 'dawn'; offers: string[] }
  | { kind: 'branch'; stage: number }
  | { kind: 'feat'; night: number };

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
  | { type: 'blast'; x: number; y: number }
  | { type: 'intercept'; x: number; y: number; fx: number; fy: number }
  | { type: 'jump'; x: number }
  | { type: 'mend'; x: number; y: number; tx: number; ty: number }
  | { type: 'heal'; x: number; y: number; amount: number }
  | { type: 'polaria'; x: number; y: number; tx: number; ty: number }
  | { type: 'cast'; ability: AbilityId; x: number; tx: number }
  | { type: 'meteor'; x: number }
  | { type: 'spikeStrike'; x: number; y: number; tx: number; ty: number; web: boolean }
  | { type: 'nightStart'; night: number }
  | { type: 'dawn'; night: number; gift: number }
  | { type: 'brood'; x: number }
  | { type: 'won' }
  | { type: 'milestone'; stars: number }
  | { type: 'lost' }
  | { type: 'denied'; reason: string };

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
  enemies: Enemy[];
  structures: Structure[];
  projectiles: Projectile[];
  drops: Drop[];
  workers: Worker[];
  soldiers: Soldier[];
  tempLights: TempLight[];
  burns: GroundBurn[];
  keeper: Keeper;
  tree: Tree;
  pending: PendingSpawn[];
  /** queue of choices; the first one is shown */
  choices: Choice[];
  events: GameEvent[];
  stats: Stats;
  nextId: number;
  time: number;
}
