// ============================================================
// 统一位置引用 — S1 统一底座
//
// 玩家与 NPC 使用可比较的地域/地区/场所/场景引用。
// "附近 NPC" 不得在两套坐标间猜测。
// ============================================================

/** 位置引用：层级化的世界位置 */
export interface LocationRef {
  /** 大洲 ID */
  continentId: string;
  /** 区域节点 ID（大地图节点） */
  nodeId?: string;
  /** 场所 ID（venue，如洞府/坊市/宗门驻地） */
  venueId?: string;
  /** 六边形网格坐标（区域层级） */
  hexPos?: { q: number; r: number };
}

/** 判断两个位置是否在同一地点（用于遭遇判定） */
export function isSameLocation(a: LocationRef, b: LocationRef): boolean {
  if (a.venueId && b.venueId) return a.venueId === b.venueId;
  if (a.nodeId && b.nodeId) return a.nodeId === b.nodeId;
  if (a.hexPos && b.hexPos) return a.hexPos.q === b.hexPos.q && a.hexPos.r === b.hexPos.r;
  return a.continentId === b.continentId;
}

/** 判断两个位置是否相邻（用于"附近 NPC"判定） */
export function isNearby(a: LocationRef, b: LocationRef, radius = 1): boolean {
  if (a.venueId && b.venueId) return a.venueId === b.venueId;
  if (a.nodeId && b.nodeId) return a.nodeId === b.nodeId;
  if (a.hexPos && b.hexPos) {
    const dq = a.hexPos.q - b.hexPos.q;
    const dr = a.hexPos.r - b.hexPos.r;
    const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
    return dist <= radius;
  }
  return a.continentId === b.continentId;
}
