// ============================================================
// TimeATB 原子解释器（S6）
// 职责：ATB 操纵——减速敌方、加速己方、消耗额外行动值
// 数据中 TimeATB 原子只用 `atbCost` 一个参数（skill-registry 实际值 30-100）
// 语义解释：
//   - 攻击技能的 TimeATB：对主目标施加 gauge 惩罚（atbCost 取负）
//   - 辅助技能的 TimeATB：对施法者施加 gauge 加速（atbCost 取正）
//   - Move 类技能（疾风步）的 TimeATB：由 dispatchMove 处理，本解释器跳过
// ============================================================

import type { AtomicNode } from '@taosim/contracts';
import type { AtomicContext, AtomicOutcome, AtomicResult } from './types.js';
import { emptyResult } from './types.js';

/**
 * 解释 TimeATB 原子。
 * @param targetIds Geometry 原子收集的目标列表
 * @param isSelfBuff 是否为自身增益（辅助技能）——攻击技能时为 false，惩罚目标
 */
export function interpretTimeAtb(
  node: AtomicNode,
  ctx: AtomicContext,
  targetIds: string[],
  isSelfBuff: boolean,
): AtomicOutcome {
  const atbCost = typeof node.params.atbCost === 'number' ? node.params.atbCost : null;
  if (atbCost === null) {
    return { reason: 'time_atb_missing_cost', nodeId: node.id };
  }

  const result: AtomicResult = emptyResult();

  // 自身增益（辅助类技能）：施法者 +atbCost gauge
  if (isSelfBuff) {
    result.atbApps.push({ targetId: ctx.actor.id, gaugeDelta: atbCost });
    result.appliedTo.push(ctx.actor.id);
    result.logs.push(`${ctx.actor.name} 行动值 +${atbCost}`);
    return result;
  }

  // 敌方惩罚：每个主目标 -atbCost gauge（钳制 ≥ 0）
  for (const tid of targetIds) {
    const target = ctx.characters[tid];
    if (!target || target.hp <= 0) continue;
    result.atbApps.push({ targetId: tid, gaugeDelta: -atbCost });
    result.appliedTo.push(tid);
    result.logs.push(`${target.name} 行动值 -${atbCost}`);
  }
  return result;
}
