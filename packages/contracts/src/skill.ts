// ============================================================
// Skill 数据模型 — 架构规范 §22
// ============================================================

// ---- 技能品质 ----
export type SkillQuality = 'Huang' | 'Xuan' | 'Di' | 'Tian';

// ---- 战斗原子 ----
export interface AtomicNode {
  id: string;
  category: 'Geometry' | 'TerrainMutate' | 'TimeATB' | 'Numeric' | 'StatusHook';
  params: Record<string, number | string | boolean>;
  costBudget: number;
}

// ---- 反噬效果 ----
export interface BackfireEffect {
  type: 'SelfDamage' | 'SelfStun' | 'TerrainCorrupt' | 'HeartDemonInc';
  intensity: number;
  durationTurns?: number;
}

// ---- 技能消耗 ----
export interface SkillCost {
  ap: number;
  spiritEnergy: number;
  lifespanDays?: number;
}

// ---- 技能主模型 ----
export interface Skill {
  id: string;
  name: string;
  quality: SkillQuality;
  type: 'Active' | 'Passive';
  primitives: AtomicNode[];
  cost: SkillCost;
  backfire?: BackfireEffect;
  cooldownTurns: number;
}
