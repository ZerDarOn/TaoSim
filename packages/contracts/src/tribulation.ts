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
  tier: 0 | 1 | 2 | 3;

  requirements: {
    expThreshold: number;
    requiredItems?: string[];
  };

  simpleModeSuccessRate: number;

  battleTribulation?: {
    totalTurns: number;
    primitivesPerTurn: Record<number, TribulationPrimitive[]>;
  };
}
