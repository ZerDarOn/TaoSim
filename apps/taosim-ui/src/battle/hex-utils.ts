import type { HexBattleMap } from '@taosim/contracts';
import { hexKey, hexNeighbors, hexDistance } from '@taosim/contracts';
import type { ReachableTile, AttackTargetTile } from './types';

/** 查找某角色所在格（遍历 tiles，角色占用格唯一） */
export function findOccupant(map: HexBattleMap, characterId: string): { q: number; r: number } | null {
  for (const tile of Object.values(map.tiles)) {
    if (tile.occupantId === characterId) return { q: tile.q, r: tile.r };
  }
  return null;
}

/**
 * BFS 计算移动可达范围（路径连通约束）。
 * 障碍判定规则（blocked/占用/未揭示/水格(非飞行) 不可走）与 useCombat.movePlayer 一致，
 * 但语义更强：本函数要求路径连通，movePlayer 仅校验目标格 hexDistance（可越过障碍）。
 * 不含起点（点击自身=取消移动）。
 */
export function computeMoveRange(
  map: HexBattleMap,
  from: { q: number; r: number },
  movePoints: number,
  canFly: boolean,
): ReachableTile[] {
  const visited = new Map<string, number>();
  visited.set(hexKey(from.q, from.r), 0);
  const queue: { q: number; r: number; cost: number }[] = [{ q: from.q, r: from.r, cost: 0 }];
  const result: ReachableTile[] = [];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.cost > 0) result.push({ q: cur.q, r: cur.r, cost: cur.cost });
    for (const n of hexNeighbors(cur.q, cur.r)) {
      const key = hexKey(n.q, n.r);
      const tile = map.tiles[key];
      if (!tile) continue;
      const cost = cur.cost + 1;
      if (cost > movePoints) continue;
      if (visited.has(key) && visited.get(key)! <= cost) continue;
      if (tile.isBlocked) continue;
      if (tile.occupantId) continue;
      if (!tile.isRevealed) continue;
      if (tile.isWater && !canFly) continue;
      visited.set(key, cost);
      queue.push({ q: n.q, r: n.r, cost });
    }
  }
  return result;
}

/** 射程内可攻击目标格（不含自身，除非 includeSelf） */
export function computeAttackTargets(
  map: HexBattleMap,
  actorId: string,
  range: number,
  includeSelf = false,
): AttackTargetTile[] {
  const actorPos = findOccupant(map, actorId);
  if (!actorPos) return [];
  const result: AttackTargetTile[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (!tile.occupantId) continue;
    if (tile.occupantId === actorId && !includeSelf) continue;
    if (hexDistance(actorPos.q, actorPos.r, tile.q, tile.r) <= range) {
      result.push({ q: tile.q, r: tile.r, characterId: tile.occupantId });
    }
  }
  return result;
}
