// ============================================================
// Tribulation 渡劫系统数据模型 — 架构规范 §27
// ============================================================

export type TribulationPrimitiveType =
  | 'ThunderStrike'
  | 'HeartDemonTest'
  | 'SpatialRift'
  | 'PillMitigation'
  | 'HeavenlyTracking';

export interface TribulationPrimitive {
  type: TribulationPrimitiveType;
  params: {
    intensity?: number;
    coverageRadius?: number;
    checkAttribute?: 'comprehension' | 'perception' | 'luck';
    backfirePenalty?: string;
  };
}

export interface RealmBreakthroughConfig {
  fromRealm: string;
  toRealm: string;
  tier: 0 | 1 | 2 | 3 | 4;

  requirements: {
    expThreshold: number;
    requiredItems?: string[];
  };

  simpleModeSuccessRate: number;

  postBreakthrough?: {
    maxLifespan: number;
    hpMultiplier: number;
    spiritEnergyMultiplier: number;
    canFly?: boolean;
  };

  battleTribulation?: {
    totalTurns: number;
    primitivesPerTurn: Record<number, TribulationPrimitive[]>;
  };
}

export const BREAKTHROUGH_CONFIGS: RealmBreakthroughConfig[] = [
  {
    fromRealm: 'QiRefinement_9', toRealm: 'Foundation_1', tier: 1,
    requirements: { expThreshold: 1000, requiredItems: ['RECIPE_FOUNDATION_PILL'] },
    simpleModeSuccessRate: 0.85,
    postBreakthrough: { maxLifespan: 200, hpMultiplier: 2, spiritEnergyMultiplier: 1.5, canFly: true },
  },
  {
    fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
    requirements: { expThreshold: 5000, requiredItems: ['RECIPE_GOLDEN_CORE_PILL'] },
    simpleModeSuccessRate: 0.70,
    postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
  },
  {
    fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
    requirements: { expThreshold: 20000, requiredItems: ['RECIPE_NASCENT_SOUL_PILL'] },
    simpleModeSuccessRate: 0.55,
    postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
  },
  {
    fromRealm: 'NascentSoul_3', toRealm: 'SoulFormation_1', tier: 4,
    requirements: { expThreshold: 80000, requiredItems: ['RECIPE_SOUL_FORMATION_PILL'] },
    simpleModeSuccessRate: 0.40,
    postBreakthrough: { maxLifespan: 1500, hpMultiplier: 2.5, spiritEnergyMultiplier: 2.5 },
  },
];
