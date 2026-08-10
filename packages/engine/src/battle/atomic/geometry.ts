// ============================================================
// Geometry 原子解释器（S6）
// 职责：解析技能形状（Single/Line/AOE/Cone/Self/Move），收集实际被影响的目标 ID
// 不直接结算伤害，只产出 appliedTo 列表交给 Numeric/StatusHook 使用
// ============================================================

import type { AtomicNode } from '@taosim/contracts';
import { hexDistance, hexKey, hexRing } from '@taosim/contracts';
import type { AtomicContext, AtomicOutcome, AtomicResult } from './types.js';
import { emptyResult } from './types.js';

/**
 * 解析 Geometry 原子的 shape。
 * - Single：只影响主目标（射程已由引擎校验）
 * - Self：只影响施法者
 * - AOE：以主目标为中心、半径 radius 的所有存活单位
 * - Line/Cone：当前数据中无实例（skill-registry 只用 Single/AOE/Move），
//   降级为只影响主目标，避免臆造多目标算法
 * - Move：移动类（疾风步），不产出目标；引擎在 dispatchMove 单独处理
 */
export function interpretGeometry(node: AtomicNode, ctx: AtomicContext): AtomicOutcome {
  const shape = typeof node.params.type === 'string' ? node.params.type : 'Single';
  const radius = typeof node.params.radius === 'number' ? node.params.radius : 0;

  const result: AtomicResult = emptyResult();

  switch (shape) {
    case 'Self':
      result.appliedTo = [ctx.actor.id];
      result.logs.push(`${ctx.actor.name} 以自身为对象`);
      return result;

    case 'Single':
      result.appliedTo = [ctx.primaryTargetId];
      return result;

    case 'AOE': {
      // 以主目标为中心，收集半径内存活且非友方的单位
      const targetPos = findPosition(ctx, ctx.primaryTargetId);
      if (!targetPos) {
        // 主目标无位置 → 只影响主目标（降级为单体）
        result.appliedTo = [ctx.primaryTargetId];
        result.logs.push(`主目标 ${ctx.primaryTargetId} 无位置，AOE 降级为单体`);
        return result;
      }
      const cells = hexRing(targetPos.q, targetPos.r, Math.max(0, radius));
      const affected = new Set<string>([ctx.primaryTargetId]);
      for (const cell of cells) {
        const tile = ctx.map.tiles[hexKey(cell.q, cell.r)];
        if (!tile || !tile.occupantId) continue;
        const id = tile.occupantId;
        const c = ctx.characters[id];
        if (!c || c.hp <= 0) continue;
        // 同队过滤：AOE 友伤默认关闭（Skill.target 已显式声明阵营）
        const unit = ctx.units[id];
        const actorUnit = ctx.units[ctx.actor.id];
        if (unit && actorUnit && unit.team === actorUnit.team) continue;
        affected.add(id);
      }
      result.appliedTo = [...affected];
      result.logs.push(`AOE 命中 ${affected.size} 个单位`);
      return result;
    }

    case 'Line':
    case 'Cone':
      // skill-registry 无实例；降级为主目标，避免臆造
      result.appliedTo = [ctx.primaryTargetId];
      result.logs.push(`${shape} 未实现，降级为单体`);
      return result;

    case 'Move':
      // 移动类技能不产出目标；由 dispatchUseSkill 单独处理（S6-P3）
      result.logs.push('Move 类技能（由引擎移动逻辑处理）');
      return result;

    default:
      return { reason: `unknown_geometry_shape`, nodeId: node.id };
  }
}

/** 在地图上查找指定单位的格子坐标 */
function findPosition(ctx: AtomicContext, unitId: string): { q: number; r: number } | null {
  for (const t of Object.values(ctx.map.tiles)) {
    if (t.occupantId === unitId) return { q: t.q, r: t.r };
  }
  return null;
}

/** Geometry 原子的射程（S6-P3 引擎侧用于射程校验） */
export function geometryRange(node: AtomicNode): number {
  const r = node.params.range;
  return typeof r === 'number' ? r : 1;
}

/** 该原子是否声明为 Move 形状（引擎移动分支判断） */
export function isMoveShape(node: AtomicNode): boolean {
  return typeof node.params.type === 'string' && node.params.type === 'Move';
}

/** 从一组 Geometry 原子中收集所有 Move 类的 range（用于移动总距离） */
export function collectMoveRange(nodes: AtomicNode[]): number {
  let total = 0;
  for (const n of nodes) {
    if (n.category === 'Geometry' && isMoveShape(n)) {
      total += geometryRange(n);
    }
  }
  return total;
}

/** 从一组 Geometry 原子中取最大射程（用于攻击/法术命中校验） */
export function maxRange(nodes: AtomicNode[]): number {
  let r = 1;
  for (const n of nodes) {
    if (n.category === 'Geometry' && !isMoveShape(n)) {
      r = Math.max(r, geometryRange(n));
    }
  }
  return r;
}

/** 计算两坐标是否在 range 内（供引擎校验） */
export function inRange(ctx: AtomicContext, fromId: string, toId: string, range: number): boolean {
  const from = findPositionById(ctx, fromId);
  const to = findPositionById(ctx, toId);
  if (!from || !to) return false;
  return hexDistance(from.q, from.r, to.q, to.r) <= range;
}

function findPositionById(ctx: AtomicContext, unitId: string): { q: number; r: number } | null {
  for (const t of Object.values(ctx.map.tiles)) {
    if (t.occupantId === unitId) return { q: t.q, r: t.r };
  }
  return null;
}
