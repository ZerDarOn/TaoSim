// ============================================================
// 空间维度 — 传闻半径扩散（世界涌现叙事设计 §4.8 / §6.3）
//
// 场所（VenueDef）归一到所属节点（nodeId），同场所或同节点视为"邻近"。
// isNearby 是 传闻按半径扩散 / 沉浸视角邻近可见 的判定基础。
// ============================================================

import { getVenue } from '../overworld/map-catalog.js';

/** 场所 id → 所属节点 id（空间归一化；无场所/未知场所返回 undefined） */
export function nodeOf(locationId?: string): string | undefined {
  if (!locationId) return undefined;
  return getVenue(locationId)?.nodeId;
}

/**
 * 邻近判定（§6.3 空间维度）：同一场所或同一节点视为"邻近"；
 * 不同节点/不同大陆不相邻 —— 重大事件以半径扩散成传闻（§4.8）的空间基础。
 */
export function isNearby(locA?: string, locB?: string): boolean {
  if (!locA || !locB) return false;
  if (locA === locB) return true;
  const nodeA = nodeOf(locA);
  const nodeB = nodeOf(locB);
  if (!nodeA || !nodeB) return false;
  return nodeA === nodeB;
}
