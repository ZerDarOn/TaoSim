// ============================================================
// Numeric 原子解释器（S6）
// 职责：把 Numeric 原子的 params 翻译成 NumericApplication
//  - multiplier：伤害系数（委托 calculateDamage 结算）
//  - heal：治疗量（基于施法者攻击力的倍率）
//  - defenseBoost / maxHpBoost / shieldValue / damageAbsorb：增益数值
//
// 注意：Numeric 原子的伤害结算必须用 calculateDamage（含五行/暴击/闪避/壁垒），
//      而不是直接写 hpDelta。解释器把"要打谁、用什么 spec"打包成 application，
//      由引擎统一调用 calculateDamage。
// ============================================================

import type { AtomicNode, SkillElement } from '@taosim/contracts';
import { calculateDamage } from '../damage-calculator.js';
import type { AtomicContext, AtomicOutcome, AtomicResult, NumericApplication } from './types.js';
import { emptyResult } from './types.js';

/**
 * 解释 Numeric 原子。同一技能可能有多个 Numeric 原子（罕见，但合法）。
 * 解释器遍历所有目标，对每个目标独立结算。
 *
 * @param node 当前 Numeric 原子
 * @param ctx 施法上下文
 * @param targetIds Geometry 原子收集的目标列表（按顺序应用）
 */
export function interpretNumeric(
  node: AtomicNode,
  ctx: AtomicContext,
  targetIds: string[],
): AtomicOutcome {
  const params = node.params;
  const result: AtomicResult = emptyResult();
  const multiplier = typeof params.multiplier === 'number' ? params.multiplier : null;
  const heal = typeof params.heal === 'number' ? params.heal : null;
  const defenseBoost = typeof params.defenseBoost === 'number' ? params.defenseBoost : null;
  const maxHpBoost = typeof params.maxHpBoost === 'number' ? params.maxHpBoost : null;
  const shieldValue = typeof params.shieldValue === 'number' ? params.shieldValue : null;
  const damageAbsorb = typeof params.damageAbsorb === 'number' ? params.damageAbsorb : null;

  // 任一属性类增益且目标为自身：直接应用到施法者
  const boostTargetIds = targetIds.length > 0 ? targetIds : [ctx.actor.id];

  // 伤害（multiplier）
  if (multiplier !== null) {
    for (const tid of targetIds) {
      const defender = ctx.characters[tid];
      if (!defender || defender.hp <= 0) continue;
      // 使用 calculateDamage 完整结算（五行/暴击/闪避/壁垒）
      const dmgResult = calculateDamage(
        ctx.actor,
        defender,
        { multiplier, element: ctx.element, tier: ctx.tier },
        ctx.rng,
      );
      const hpDelta = dmgResult.missed ? 0 : dmgResult.finalDamage;
      const app: NumericApplication = {
        targetId: tid,
        hpDelta,
      };
      result.numericApps.push(app);
      result.appliedTo.push(tid);
      result.logs.push(
        `${ctx.actor.name} 对 ${defender.name} 造成 ${hpDelta} 点伤害${dmgResult.crit ? '（暴击）' : ''}${dmgResult.missed ? '（闪避）' : ''}${dmgResult.blockedByBarrier ? '（被壁垒挡下）' : ''}`,
      );
    }
  }

  // 治疗（heal）：基于施法者攻击力的倍率
  if (heal !== null) {
    for (const tid of boostTargetIds) {
      const target = ctx.characters[tid];
      if (!target || target.hp <= 0) continue; // 不治疗死者
      const healAmount = Math.round((target.maxHp) * heal * 0.5);
      result.numericApps.push({ targetId: tid, hpDelta: -healAmount });
      result.appliedTo.push(tid);
      result.logs.push(`${ctx.actor.name} 为 ${target.name} 恢复 ${healAmount} 点生命`);
    }
  }

  // 防御增益（defenseBoost）：通过 Shield 状态承载（statusApp 由 StatusHook 解释器统一处理）
  // Numeric 解释器只负责数值；属性增益的"载体状态"由同技能的 StatusHook 原子声明
  // 这里仅记录到 logs，供调试用；真正生效需要技能同时带 StatusHook
  if (defenseBoost !== null) {
    result.logs.push(`防御 +${defenseBoost}（需要 StatusHook 载体生效）`);
  }
  if (maxHpBoost !== null) {
    // 直接提升 maxHp（持久到战斗结束）
    for (const tid of boostTargetIds) {
      const target = ctx.characters[tid];
      if (!target) continue;
      target.maxHp += maxHpBoost;
      target.hp = Math.min(target.maxHp, target.hp + maxHpBoost);
      result.appliedTo.push(tid);
      result.logs.push(`${target.name} 气血上限 +${maxHpBoost}`);
    }
  }
  if (shieldValue !== null) {
    // 护盾：作为 NumericApplication 的 shieldGain，由引擎在应用时挂到目标 unit 上
    for (const tid of boostTargetIds) {
      result.numericApps.push({ targetId: tid, shieldGain: shieldValue });
      result.appliedTo.push(tid);
      result.logs.push(`${ctx.characters[tid]?.name ?? tid} 获得 ${shieldValue} 点护盾`);
    }
  }
  if (damageAbsorb !== null) {
    // 伤害吸收：语义同 shieldValue（skill-registry 中两者从不共存），统一用 shieldGain
    for (const tid of boostTargetIds) {
      result.numericApps.push({ targetId: tid, shieldGain: damageAbsorb });
      result.appliedTo.push(tid);
      result.logs.push(`${ctx.characters[tid]?.name ?? tid} 获得 ${damageAbsorb} 点伤害吸收`);
    }
  }

  return result;
}
