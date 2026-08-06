// ============================================================
// Skill 数据模型 — 架构规范 §22
// ============================================================

// ---- 技能品质 ----
export type SkillQuality = 'Huang' | 'Xuan' | 'Di' | 'Tian';

export type SkillElement =
  | 'Metal' | 'Wood' | 'Water' | 'Fire' | 'Earth'
  | 'Thunder' | 'Ice' | 'Wind' | 'Dark' | 'Physical';

export type TargetFilter = 'Enemy' | 'Ally' | 'Self' | 'Any';

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
  /** 功法五行属性（Phase B 五行交互使用；默认 Physical） */
  element?: SkillElement;
  /** 功法阶位（Huang=1/Xuan=2/Di=3/Tian=4，用于等级压制） */
  tier?: number;
  /** 显式目标阵营（不允许按技能名称或 Numeric 字段猜测） */
  target?: TargetFilter;
}
