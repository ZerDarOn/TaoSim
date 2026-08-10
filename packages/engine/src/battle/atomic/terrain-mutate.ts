// ============================================================
// TerrainMutate 原子解释器（S6）
// 职责：把地形格的 terrain 字段改为指定类型（Fire/Meteor 等）
// 数据中只用 `terrain` 参数，且数值为 'Fire'/'Meteor'（非 TerrainType 联合成员）
// 处理策略：
//   - 把 'Fire' 映射为 'Lava'（已存在的 TerrainType）
//   - 把 'Meteor' 映射为 'Obstacle'（陨石坑阻挡通行）
//   - 同时把 isBlocked=true（Meteor）/isWater=false（Fire/Lava 清水）
// 范围：以主目标为中心、半径 1（默认；数据中 TerrainMutate 无 radius 参数）
// ============================================================

import type { AtomicNode, TerrainType } from '@taosim/contracts';
import { hexKey, hexRing } from '@taosim/contracts';
import type { AtomicContext, AtomicOutcome, AtomicResult } from './types.js';
import { emptyResult } from './types.js';

/** 数据 terrain 值 → TerrainType 联合 + 额外标志的归并 */
export const TERRAIN_MAP: Record<string, { terrain: TerrainType; isBlocked?: boolean; isWater?: boolean }> = {
  Fire: { terrain: 'Lava', isWater: false },
  Meteor: { terrain: 'Obstacle', isBlocked: true },
};

export function interpretTerrainMutate(
  node: AtomicNode,
  ctx: AtomicContext,
  targetIds: string[],
): AtomicOutcome {
  const rawTerrain = typeof node.params.terrain === 'string' ? node.params.terrain : null;
  if (!rawTerrain) {
    return { reason: 'terrain_mutate_missing_terrain', nodeId: node.id };
  }
  const mapping = TERRAIN_MAP[rawTerrain];
  if (!mapping) {
    return { reason: `unknown_terrain:${rawTerrain}`, nodeId: node.id };
  }

  const result: AtomicResult = emptyResult();

  // 以主目标为中心，半径 1 的格子改为指定地形
  const center = targetIds[0] ?? ctx.primaryTargetId;
  const centerPos = findPosition(ctx, center);
  if (!centerPos) {
    // 无位置 → 只记日志，不改地形
    result.logs.push(`主目标 ${center} 无位置，地形改造未生效`);
    return result;
  }

  const cells = hexRing(centerPos.q, centerPos.r, 1);
  for (const cell of cells) {
    const tile = ctx.map.tiles[hexKey(cell.q, cell.r)];
    if (!tile) continue;
    // 被占用格（有单位站）不改 terrain，避免把单位陷入 Obstacle
    if (tile.occupantId) continue;
    tile.terrain = mapping.terrain;
    if (mapping.isBlocked !== undefined) tile.isBlocked = mapping.isBlocked;
    if (mapping.isWater !== undefined) tile.isWater = mapping.isWater;
    result.mutatedTiles.push({ q: cell.q, r: cell.r });
  }
  result.logs.push(`${ctx.actor.name} 把 ${result.mutatedTiles.length} 格地形改造为 ${rawTerrain}`);
  return result;
}

function findPosition(ctx: AtomicContext, unitId: string): { q: number; r: number } | null {
  for (const t of Object.values(ctx.map.tiles)) {
    if (t.occupantId === unitId) return { q: t.q, r: t.r };
  }
  return null;
}
