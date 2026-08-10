// ============================================================
// NPC 查询 — S5a：按位置/区域查询世界 NPC
//
// 世界 NPC 以 NpcRecord 形式存于 WorldState.npcs（key=npcId），
// locationId 是 venueId（或 undefined）。本模块提供"按位置选 NPC"的
// 纯函数，供 UI 在遭遇战/切磋时优先选取真实世界 NPC（F-4 缺陷修复）。
// ============================================================

import type { NpcRecord } from '@taosim/contracts';

/**
 * 按 venueId 查找活动 NPC（soulState='Active'）。
 * NPC 的 locationId 是 venueId，玩家的 activeVenueId 也是 venueId——可直接匹配。
 */
export function npcsByVenue(
  npcs: Record<string, NpcRecord>,
  venueId: string,
  limit = 5,
): NpcRecord[] {
  return Object.values(npcs)
    .filter(n => n.soulState === 'Active' && n.locationId === venueId)
    .slice(0, limit);
}

/**
 * 随机选一个活动 NPC（遭遇场景，从世界档案选取真实 NPC）。
 *
 * - 提供 venueId 时优先在同场所 NPC 中选取；
 * - 无同场所 NPC 或未提供 venueId 时，从全部活动 NPC 中选取；
 * - 全部活动 NPC 为空时返回 null（调用方降级到 NPCGenerator 妖兽路径）。
 */
export function pickNearbyNpc(
  npcs: Record<string, NpcRecord>,
  venueId?: string,
  rng: () => number = Math.random,
): NpcRecord | null {
  let candidates: NpcRecord[];
  if (venueId) {
    const same = npcsByVenue(npcs, venueId, 20);
    candidates = same.length > 0 ? same : Object.values(npcs).filter(n => n.soulState === 'Active').slice(0, 20);
  } else {
    candidates = Object.values(npcs).filter(n => n.soulState === 'Active').slice(0, 20);
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(rng() * candidates.length)] ?? null;
}
