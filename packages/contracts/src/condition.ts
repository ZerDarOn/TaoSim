// ============================================================
// NPC 长期状态 — S1 统一底座
//
// 伤势、毒素、经脉损伤、恢复截止时间等。
// 不要求 NPC 持久化逐点战斗 HP，但需要跨遭遇保持连续性。
// ============================================================

/** 伤势等级（影响展开时的 hp 上限） */
export type InjuryLevel = 'minor' | 'moderate' | 'severe' | 'critical';

/** 单条伤势 */
export interface Injury {
  /** 伤势等级 */
  level: InjuryLevel;
  /** 伤势来源（战斗/奇遇/刑罚等） */
  source: string;
  /** 获得时间 */
  acquiredAt: { year: number; month: number };
  /** 预计恢复时间（undefined = 永久伤势） */
  recoversAt?: { year: number; month: number };
}

/** 毒素状态 */
export interface PoisonState {
  /** 毒素类型 id */
  poisonId: string;
  /** 毒素名称 */
  name: string;
  /** 剩余强度 (0..100，0 = 已清除) */
  intensity: number;
  /** 每月衰减速度 */
  decayPerMonth: number;
  /** 染毒时间 */
  acquiredAt: { year: number; month: number };
}

/** NPC 长期状态：跨遭遇保持的轻量状态 */
export interface PersistentCondition {
  /** 伤势列表 */
  injuries: Injury[];
  /** 毒素列表 */
  poisons: PoisonState[];
  /** 经脉损伤（0..100，影响修炼速度和灵力上限） */
  meridianDamage: number;
  /** 恢复中的截止时间（闭关/疗伤期间不参与普通行动） */
  recoveringUntil?: { year: number; month: number };
}
