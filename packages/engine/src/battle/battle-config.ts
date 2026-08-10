/** Battle System v2 集中配置 — 所有魔法数字收敛于此 */
export const BATTLE_CONFIG = {
  /** 战斗 AP 上限（跨 activation 的资源） */
  MAX_AP: 3,
  /** UI 调度层 ATB 推进间隔（ms） */
  ATB_TICK_MS: 400,
  /** 闪避基础率 */
  BASE_DODGE_RATE: 0.05,
  /** 敏捷差折算系数 */
  AGILITY_DODGE_SCALE: 0.15,
  /** 闪避上限 */
  MAX_DODGE_RATE: 0.3,
  /** 暴击倍率 */
  CRIT_MULTIPLIER: 1.5,
  /** 防御指令减伤倍率 */
  GUARD_DAMAGE_MULTIPLIER: 0.5,
  /** 引擎保留的结构化事件快照上限 */
  MAX_EVENT_HISTORY: 200,
  /** 每格 ATB 增长基准（配合身法） */
  ATB_BASE_GAIN: 10,
  /** ATB 增长身法系数 */
  ATB_AGILITY_GAIN: 2,
  /** 每 activation 移动池 = MOVE_BASE + ⌊身法/5⌋ */
  MOVE_BASE: 2,
  MOVE_AGILITY_DIVISOR: 5,
  /** AI 每单位最多评估技能数 */
  MAX_AI_SKILL_EVALUATION: 8,
  /** 护盾状态：每点 potency 抵消多少伤害 */
  SHIELD_DAMAGE_RATIO: 1,
  /** 毒/灼烧：每回合 potency × POISON_DAMAGE_RATIO 扣血 */
  POISON_DAMAGE_RATIO: 1,
  /** 治疗（Regen）：每回合 potency × REGEN_HEAL_RATIO 回血 */
  REGEN_HEAL_RATIO: 1,
} as const;
