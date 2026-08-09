// ============================================================
// NPC 空间换算（NPC 地图呈现设计 §spec 3.2：venue→node→hex +
// 空间索引 + hexPos 月度维护）
// ============================================================

import type { NpcRecord } from '@taosim/contracts';
import { getVenue } from './map-catalog.js';
import {
  findLandmarkPos,
  getHexNeighbors,
  type WorldHexGrid,
} from './hex-overworld-engine.js';

/** venue id → hex 坐标（venue→node→坐标换算→grid 地标反查） */
export function npcHexPos(
  locationId: string | undefined,
  grid: WorldHexGrid,
): { q: number; r: number } | null {
  if (!locationId) return null;
  const venue = getVenue(locationId);
  if (!venue?.nodeId) return null;
  return findLandmarkPos(grid, venue.nodeId);
}

/** 同格空间索引（社交局部化/聚合标记的数据基础；仅 Active NPC） */
export function npcSpatialIndex(
  npcs: Record<string, NpcRecord>,
  grid: WorldHexGrid,
): Map<string, NpcRecord[]> {
  const index = new Map<string, NpcRecord[]>();
  for (const npc of Object.values(npcs)) {
    if (npc.soulState !== 'Active') continue;
    const pos = npc.hexPos ?? npcHexPos(npc.locationId, grid);
    if (!pos) continue;
    const key = `${pos.q},${pos.r}`;
    const list = index.get(key) ?? [];
    list.push(npc);
    index.set(key, list);
  }
  return index;
}

export interface NpcHexDeriveResult {
  hexPos: { q: number; r: number };
  moveState: 'resident' | 'wandering';
  /** true = 已归巢/到达目标（调用方应清空 moveTarget） */
  reached: boolean;
}

/**
 * 月度 hexPos 维护（§spec 3.2.2）：
 * - 有场所（locationId）：锚定场所对应格（resident；wandering 到达后归巢）
 * - 无场所且有 moveTarget：向目标移动 1 格（沿 hex 邻格，避开 void）
 * - 无场所无目标：原地驻留
 */
export function deriveNpcHexPos(
  current: { q: number; r: number } | undefined,
  locationId: string | undefined,
  moveTarget: { q: number; r: number } | undefined,
  grid: WorldHexGrid,
): NpcHexDeriveResult {
  // 有场所 → 锚定场所格（wandering 归巢 / resident 驻留）
  if (locationId) {
    const home = npcHexPos(locationId, grid);
    if (home) return { hexPos: home, moveState: 'resident', reached: true };
  }
  // 无场所（云游/游历中）：向目标移动
  if (!current) return { hexPos: { q: 10, r: 10 }, moveState: 'wandering', reached: false };
  if (moveTarget) {
    const neighbors = getHexNeighbors(current.q, current.r);
    // 选最接近目标的相邻格
    let best = neighbors[0]!;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const n of neighbors) {
      const hex = grid.hexes.get(`${n.q},${n.r}`);
      if (!hex || hex.terrain === 'void') continue;
      const d = Math.abs(n.q - moveTarget.q) + Math.abs(n.r - moveTarget.r);
      if (d < bestDist) {
        bestDist = d;
        best = n;
      }
    }
    if (bestDist === 0) return { hexPos: moveTarget, moveState: 'resident', reached: true };
    return { hexPos: best, moveState: 'wandering', reached: false };
  }
  // 无目标：原地驻留
  return { hexPos: current, moveState: 'wandering', reached: false };
}
