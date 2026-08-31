// ============================================================
// Utility AI — P6 效用评分战斗 AI
//
// 候选行为按效用评分排序，最高分行为被执行。
// 取代 S6 的固定优先级链。
// ============================================================

import type { AiDecision } from './battle-ai.js';

const GUARD_BASE_UTILITY = 4;
const GUARD_THREAT_WEIGHT = 8;
const MOVE_TO_ENGAGE_UTILITY = 16;
const MOVE_WHEN_ADJACENT_UTILITY = 1;

/** 行动候选项（评估前） */
export interface ActionCandidate {
  action: AiDecision;
  /** 预估伤害 */
  estimatedDamage: number;
  /** 预估自身风险（可能受到的反击伤害） */
  estimatedRisk: number;
  /** 效用分（待计算） */
  utility: number;
}

/** 评分上下文 */
export interface ScoreContext {
  /** 自身 HP 百分比 (0-1) */
  hpPercent: number;
  /** 敌方 HP 百分比 (0-1) */
  enemyHpPercent: number;
  /** 距离最近敌人的六角距离 */
  distanceToEnemy?: number;
}

/**
 * 对候选行为评分。
 *
 * 评分公式：
 * - 攻击行为：damage × (1 + kill_bonus) - risk × risk_weight
 * - 逃跑行为：flee_bonus × danger_factor
 * - 防御行为：guard_bonus × threat_factor
 * - 移动行为：proximity_bonus
 *
 * 纯函数。
 */
export function scoreAction(candidate: ActionCandidate, ctx: ScoreContext): ActionCandidate {
  let utility = 0;

  switch (candidate.action.type) {
    case 'basicAttack':
    case 'useSkill': {
      // 伤害效用
      utility += candidate.estimatedDamage * 1.0;

      // 击杀奖励：敌人 HP 低时额外加分
      const killPotential = candidate.estimatedDamage / Math.max(1, ctx.enemyHpPercent * 100);
      if (killPotential > 0.8) {
        utility *= 1.5; // 可能击杀
      }

      // 风险扣减
      utility -= candidate.estimatedRisk * 0.5;
      break;
    }

    case 'flee': {
      // HP 越低，逃跑效用越高
      const dangerFactor = 1 - ctx.hpPercent; // 0 (安全) → 1 (危险)
      utility = 20 * dangerFactor * dangerFactor; // 二次曲线，低 HP 时急升

      // 如果 HP 很高，逃跑几乎无用
      if (ctx.hpPercent > 0.5) {
        utility *= 0.1;
      }
      break;
    }

    case 'surrender': {
      const dangerFactor = 1 - ctx.hpPercent;
      utility = ctx.hpPercent < 0.2 ? 24 * dangerFactor : 0;
      break;
    }

    case 'guard': {
      // 有受伤风险时防御更有价值
      const threatLevel = candidate.estimatedRisk / 50;
      utility = GUARD_BASE_UTILITY + threatLevel * GUARD_THREAT_WEIGHT;

      // HP 低时更倾向防御而非硬抗
      if (ctx.hpPercent < 0.4) {
        utility *= 1.3;
      }
      break;
    }

    case 'move': {
      // 靠近敌人以获得攻击机会
      if (ctx.distanceToEnemy && ctx.distanceToEnemy > 1) {
        utility = MOVE_TO_ENGAGE_UTILITY;
      } else {
        utility = MOVE_WHEN_ADJACENT_UTILITY;
      }
      break;
    }
  }

  return { ...candidate, utility: Math.round(utility * 10) / 10 };
}

/**
 * 从多个候选中选择最高效用行为。
 */
export function selectBestAction(candidates: ActionCandidate[], ctx: ScoreContext): AiDecision {
  if (candidates.length === 0) {
    return { type: 'guard' }; // 兜底
  }

  const scored = candidates.map(c => scoreAction(c, ctx));
  scored.sort((a, b) => b.utility - a.utility);

  return scored[0]!.action;
}
