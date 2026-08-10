// ============================================================
// 战斗内置 Skill 常量（S6）
// 普攻、守卫等内置技能的 Skill 定义，供 BattleEngine 使用
// ============================================================

import type { Skill } from '@taosim/contracts';

/**
 * 普攻内置 Skill：射程 1、系数 1.0、消耗 1 AP。
 * 与 useCombat.ts 的 BASIC_ATTACK_SKILL 语义一致，
 * 但这里作为引擎侧权威定义（避免循环依赖 UI 常量）。
 */
export const BASIC_ATTACK_SKILL: Skill = {
  id: 'basic_attack',
  name: '普攻',
  quality: 'Huang',
  type: 'Active',
  primitives: [],
  cost: { ap: 1, spiritEnergy: 0 },
  cooldownTurns: 0,
};
