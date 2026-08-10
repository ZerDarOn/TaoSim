// ============================================================
// StatusHook 原子解释器（S6）
// 职责：把 StatusHook 原子的 params 翻译成 StatusApplication
// 状态由引擎在 tick 结算时处理（Poison/Burn/Regen/Slow 等）
//
// 数据-契约归并（skill-registry 的 status 值 → StatusType）：
//   'Freeze' / 'Frozen' → 'Freeze'（冻结：无法行动 + Slow）
//   'Paralyze' → 'Stun'（麻痹等价眩晕）
//   'AttackUp' → 'AtkUp'（攻击增益）
//   'PhysiqueUp' / 'ArmorPassive' → 被动属性，不进 statuses 数组（由 Numeric 承载）
//   其他直接映射到 StatusType
// ============================================================

import type { AtomicNode, StatusType } from '@taosim/contracts';
import type { BattleStatus } from '@taosim/contracts';
import type { AtomicContext, AtomicOutcome, AtomicResult, StatusApplication } from './types.js';
import { emptyResult } from './types.js';

/** 数据 status 值 → StatusType 联合的归并映射 */
export const STATUS_NORMALIZE: Record<string, StatusType | null> = {
  // 直接映射
  Poison: 'Poison',
  Burn: 'Burn',
  Frost: 'Frost',
  Stun: 'Stun',
  Slow: 'Slow',
  ArmorBreak: 'ArmorBreak',
  BarrierBreak: 'BarrierBreak',
  AtkUp: 'AtkUp',
  DefUp: 'DefUp',
  SpeedUp: 'SpeedUp',
  Bind: 'Bind',
  Shield: 'Shield',
  Regen: 'Regen',
  SoulWeaken: 'SoulWeaken',
  ManaShield: 'ManaShield',
  PerceptionUp: 'PerceptionUp',
  SoulDrain: 'SoulDrain',
  Invincible: 'Invincible',
  BloodRage: 'BloodRage',
  // 归并
  Freeze: 'Freeze',
  Frozen: 'Freeze',      // 同义词归并
  Paralyze: 'Stun',      // 麻痹 ≈ 眩晕
  AttackUp: 'AtkUp',     // 同义词归并
  // 被动类：不进 statuses 数组（由 Numeric 原子的 defenseBoost/maxHpBoost 承载）
  PhysiqueUp: null,
  ArmorPassive: null,
};

/** 状态的默认 potency（当数据未提供时） */
function defaultPotency(type: StatusType): number {
  switch (type) {
    case 'Poison':
    case 'Burn':
      return 10; // 每回合扣 10
    case 'Regen':
      return 10; // 每回合回 10
    case 'Shield':
      return 30; // 护盾值（与 Numeric.shieldValue 协同）
    case 'SoulWeaken':
    case 'SoulDrain':
      return 5;
    default:
      return 0;
  }
}

/**
 * 解释 StatusHook 原子。对每个目标产出 StatusApplication。
 * @param targetIds Geometry 原子收集的目标列表
 */
export function interpretStatusHook(
  node: AtomicNode,
  ctx: AtomicContext,
  targetIds: string[],
): AtomicOutcome {
  const rawStatus = typeof node.params.status === 'string' ? node.params.status : null;
  if (!rawStatus) {
    return { reason: 'status_hook_missing_status', nodeId: node.id };
  }
  const status = STATUS_NORMALIZE[rawStatus];
  if (status === undefined) {
    return { reason: `unknown_status:${rawStatus}`, nodeId: node.id };
  }
  // 被动状态：不产出 StatusApplication（由 Numeric 原子承载）
  if (status === null) {
    return emptyResult();
  }

  const duration = typeof node.params.duration === 'number' ? node.params.duration : 1;
  const potency = typeof node.params.potency === 'number' ? node.params.potency : defaultPotency(status);

  const result: AtomicResult = emptyResult();
  const targets = targetIds.length > 0 ? targetIds : [ctx.actor.id];

  for (const tid of targets) {
    const target = ctx.characters[tid];
    if (!target || target.hp <= 0) continue;
    const battleStatus: BattleStatus = {
      id: `${node.id}_${tid}`,
      type: status,
      potency,
      remainingTurns: duration,
      sourceId: ctx.actor.id,
    };
    const app: StatusApplication = { targetId: tid, status: battleStatus };
    result.statusApps.push(app);
    result.appliedTo.push(tid);
    result.logs.push(
      `${target.name} 获得 ${status} 状态（持续 ${duration} 回合）`,
    );
  }
  return result;
}
