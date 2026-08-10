// ============================================================
// 原子解释器统一入口（S6）
// 职责：
//   1. 遍历技能的所有 AtomicNode
//   2. 按 category 分发到对应解释器
//   3. 收集/合并所有 application（status/numeric/atb）
//   4. 任一原子失败 → 整体失败（不产生部分写入）
// ============================================================

import type { Skill, AtomicNode, SkillElement } from '@taosim/contracts';
import type { BattleUnit, BattleStatus } from '@taosim/contracts';
import type { Character, HexBattleMap } from '@taosim/contracts';
import { interpretGeometry, maxRange } from './geometry.js';
import { interpretNumeric } from './numeric.js';
import { interpretStatusHook } from './status-hook.js';
import { interpretTimeAtb } from './time-atb.js';
import { interpretTerrainMutate } from './terrain-mutate.js';
import type {
  AtomicContext,
  AtomicFailure,
  AtomicOutcome,
  AtomicResult,
  AtbApplication,
  NumericApplication,
  StatusApplication,
} from './types.js';
import { emptyResult, isAtomicFailure } from './types.js';

/** 解释技能的所有原子，产出统一的 application 集合 */
export function interpretSkill(
  skill: Skill,
  ctx: AtomicContext,
): AtomicOutcome {
  // 第一阶段：Geometry 先收集目标（其他原子的目标依赖于此）
  const geometryNodes = skill.primitives.filter((p) => p.category === 'Geometry');
  const targetIds = collectTargets(geometryNodes, ctx);
  if (targetIds.length === 0 && !hasSelfOrMoveShape(skill)) {
    // 无目标且不是自身/移动类 → 失败
    return { reason: 'no_targets_resolved' };
  }

  const merged: AtomicResult = emptyResult();
  merged.appliedTo = [...new Set(targetIds)];

  // 第二阶段：逐个解释非 Geometry 原子
  for (const node of skill.primitives) {
    let outcome: AtomicOutcome;
    switch (node.category) {
      case 'Geometry':
        // 已经在第一阶段处理过，跳过（避免重复）
        outcome = emptyResult();
        break;
      case 'Numeric':
        outcome = interpretNumeric(node, ctx, targetIds);
        break;
      case 'StatusHook':
        outcome = interpretStatusHook(node, ctx, targetIds);
        break;
      case 'TimeATB':
        // 是否为自身增益：通过 Skill.target === 'Self' 判定
        outcome = interpretTimeAtb(node, ctx, targetIds, skill.target === 'Self');
        break;
      case 'TerrainMutate':
        outcome = interpretTerrainMutate(node, ctx, targetIds);
        break;
      default:
        return { reason: `unknown_category:${node.category}`, nodeId: node.id };
    }
    if (isAtomicFailure(outcome)) {
      return outcome;
    }
    mergeResults(merged, outcome);
  }

  return merged;
}

/** 从一组 Geometry 原子收集所有目标（合并去重） */
function collectTargets(geometryNodes: AtomicNode[], ctx: AtomicContext): string[] {
  const ids = new Set<string>();
  for (const node of geometryNodes) {
    const outcome = interpretGeometry(node, ctx);
    if (isAtomicFailure(outcome)) continue; // 忽略单原子失败，收集其他
    for (const id of outcome.appliedTo) ids.add(id);
  }
  return [...ids];
}

/** 是否为自身/移动类技能（无目标合法） */
function hasSelfOrMoveShape(skill: Skill): boolean {
  if (skill.target === 'Self') return true;
  return skill.primitives.some(
    (p) => p.category === 'Geometry' && p.params.type === 'Move',
  );
}

/** 合并两个 AtomicResult（就地修改 target） */
function mergeResults(target: AtomicResult, source: AtomicResult): void {
  for (const id of source.appliedTo) {
    if (!target.appliedTo.includes(id)) target.appliedTo.push(id);
  }
  for (const cell of source.mutatedTiles) target.mutatedTiles.push(cell);
  for (const app of source.statusApps) target.statusApps.push(app);
  for (const app of source.numericApps) target.numericApps.push(app);
  for (const app of source.atbApps) target.atbApps.push(app);
  for (const log of source.logs) target.logs.push(log);
}

// 导出五类解释器与工具，供测试和引擎直接使用
export { interpretGeometry, maxRange } from './geometry.js';
export { interpretNumeric } from './numeric.js';
export { interpretStatusHook, STATUS_NORMALIZE } from './status-hook.js';
export { interpretTimeAtb } from './time-atb.js';
export { interpretTerrainMutate, TERRAIN_MAP } from './terrain-mutate.js';
export type {
  AtomicContext,
  AtomicFailure,
  AtomicOutcome,
  AtomicResult,
  AtbApplication,
  NumericApplication,
  StatusApplication,
} from './types.js';
export { emptyResult, isAtomicFailure } from './types.js';

// 导出便捷的 context 构造器（引擎用）
export function makeAtomicContext(params: {
  actor: Character;
  actorUnit: BattleUnit;
  primaryTargetId: string;
  map: HexBattleMap;
  units: Record<string, BattleUnit>;
  characters: Record<string, Character>;
  rng: () => number;
  turnNumber: number;
  element: SkillElement;
  tier: number;
}): AtomicContext {
  return params;
}
