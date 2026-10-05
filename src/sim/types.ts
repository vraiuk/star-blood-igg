import type { AbilityId, EnemyKind } from '../data/balance';
import type { Family, SpecId } from '../data/nests';

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
  underground: boolean;
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
}

export type ProjectileKind = 'arrow' | 'acid' | 'spear' | 'spark' | 'beam' | 'meteor';

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
  age: number;
}

export interface TempLight {
  x: number;
  radius: number;
  life: number;
  maxLife: number;
  /** eclipse field: slows enemies */
  slow?: number;
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
  /** Ascension rank 0..3 */
  rank: number;
  runes: string[];
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
}

export type Phase = 'day' | 'night' | 'won' | 'lost';

/** A pending choice that pauses the day timer until resolved. */
export type Choice =
  | { kind: 'dawn'; offers: string[] }
  | { kind: 'branch'; stage: number };

export type GameEvent =
  | { type: 'hit'; x: number; y: number; amount: number; crit: boolean }
  | { type: 'enemyDied'; kind: EnemyKind; x: number; y: number }
  | { type: 'shoot'; kind: ProjectileKind; x: number; y: number }
  | { type: 'beam'; x: number; y: number; tx: number; ty: number }
  | { type: 'chain'; points: Array<[number, number]> }
  | { type: 'ram'; x: number; dir: number }
  | { type: 'acidSplash'; x: number; y: number }
  | { type: 'structureHit'; id: number; x: number }
  | { type: 'structureLost'; family: Family; x: number; underground: boolean }
  | { type: 'built'; family: Family; x: number; underground: boolean; tier: number }
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
  | { type: 'cast'; ability: AbilityId; x: number; tx: number }
  | { type: 'meteor'; x: number }
  | { type: 'spikeStrike'; x: number; tx: number; web: boolean }
  | { type: 'nightStart'; night: number }
  | { type: 'dawn'; night: number; gift: number }
  | { type: 'brood'; x: number }
  | { type: 'won' }
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
  enemies: Enemy[];
  structures: Structure[];
  projectiles: Projectile[];
  drops: Drop[];
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
