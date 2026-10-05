import type { Family } from './nests';

/**
 * Aggregated modifiers. Every progression source (tree branches, runes, dawn gifts,
 * meta-tree nodes) contributes a Partial<Mods>; the sim folds them with `combine`.
 * Multipliers combine additively from 1 (two +20% → +40%), adds sum, flags OR.
 */
export interface Mods {
  // economy
  amberGain: number;
  starGain: number;
  startAmber: number;
  startStar: number;
  dawnGift: number;
  // tree
  treeHp: number;
  treeRegen: number;
  treeReflect: number;
  lightRadius: number;
  sparkDamage: number;
  sparkCount: number;
  rootBurn: number;
  /** extra Igg-light burn on worms (multiplier, additive) */
  wormBurn: number;
  /** extra polaria drones */
  polaria: number;
  secondWind: boolean;
  // nests
  famDamage: Record<Family, number>;
  famHp: Record<Family, number>;
  famRange: Record<Family, number>;
  nestCost: number;
  hiveSeesDark: boolean;
  beetleRevive: boolean;
  dragonflyHaste: boolean;
  spiderSurface: boolean;
  // keeper
  keeperHp: number;
  keeperSpeed: number;
  lightMax: number;
  lightRegen: number;
  magnet: number;
  abilityDamage: number;
  abilityCost: number;
  spearDamage: number;
  spearCost: number;
  spearPierce: number;
  spearRicochet: boolean;
  spearBeacon: boolean;
  spearRhythm: boolean;
  hammerDamage: number;
  hammerCost: number;
  hammerRadius: number;
  hammerQuake: boolean;
  hammerRefund: boolean;
  hammerEclipse: boolean;
  starfallDamage: number;
  starfallMeteors: number;
  starfallBurn: number;
  /** extra regen multiplier near the trunk (Руна Света «Корень Света») */
  nearRegen: number;
  lastLight: boolean;
  /** dragonfly «Высвечивание» bonus vulnerability (additive) */
  vuln: number;
  chargeGain: number;
  wormStar: number;
}

const famZero = (): Record<Family, number> => ({ hive: 0, beetle: 0, dragonfly: 0, spider: 0 });

export function baseMods(): Mods {
  return {
    amberGain: 0, starGain: 0, startAmber: 0, startStar: 0, dawnGift: 0,
    treeHp: 0, treeRegen: 0, treeReflect: 0, lightRadius: 0, sparkDamage: 0, sparkCount: 0, rootBurn: 0, wormBurn: 0, polaria: 0, secondWind: false,
    famDamage: famZero(), famHp: famZero(), famRange: famZero(), nestCost: 0,
    hiveSeesDark: false, beetleRevive: false, dragonflyHaste: false, spiderSurface: false,
    keeperHp: 0, keeperSpeed: 0, lightMax: 0, lightRegen: 0, magnet: 0, abilityDamage: 0, abilityCost: 0,
    spearDamage: 0, spearCost: 0, spearPierce: 0, spearRicochet: false, spearBeacon: false, spearRhythm: false,
    hammerDamage: 0, hammerCost: 0, hammerRadius: 0, hammerQuake: false, hammerRefund: false, hammerEclipse: false,
    starfallDamage: 0, starfallMeteors: 0, starfallBurn: 0, nearRegen: 0,
    lastLight: false, chargeGain: 0, wormStar: 0, vuln: 0,
  };
}

export type ModPatch = Partial<Omit<Mods, 'famDamage' | 'famHp' | 'famRange'>> & {
  famDamage?: Partial<Record<Family, number>>;
  famHp?: Partial<Record<Family, number>>;
  famRange?: Partial<Record<Family, number>>;
};

/** Fold patches into a fresh Mods object. */
export function combine(patches: ModPatch[]): Mods {
  const m = baseMods() as unknown as Record<string, unknown>;
  for (const p of patches) {
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined) continue;
      if (typeof v === 'boolean') m[k] = (m[k] as boolean) || v;
      else if (typeof v === 'number') m[k] = (m[k] as number) + v;
      else {
        const rec = m[k] as Record<string, number>;
        for (const [f, n] of Object.entries(v as Record<string, number>)) rec[f] += n;
      }
    }
  }
  return m as unknown as Mods;
}
