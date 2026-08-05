// ============================================================
// Hex 战棋地图数据模型 — 架构规范 §24
// ============================================================

export type TerrainType = 'Plain' | 'Forest' | 'DeepWater' | 'Swamp' | 'Lava' | 'Obstacle' | 'Void';

export interface HexTile {
  q: number;
  r: number;
  terrain: TerrainType;
  elevation: number;         // 0 = 平地/水域, 1 = 丘陵, 2 = 高山
  isBlocked: boolean;
  isWater: boolean;
  isRevealed: boolean;       // 神识迷雾
  occupantId?: string;
}

export interface HexBattleMap {
  width: number;
  height: number;
  tiles: Record<string, HexTile>; // key: `${q},${r}`
}

// ---- Hex 工具函数 ----
/** 轴向坐标 → 字符串键 */
export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** 立方体坐标 → 轴向坐标 */
export function cubeToAxial(cx: number, cy: number, cz: number): { q: number; r: number } {
  return { q: cx, r: cz };
}

/** 两个 Hex 格之间的曼哈顿距离（立方坐标） */
export function hexDistance(q1: number, r1: number, q2: number, r2: number): number {
  const s1 = -q1 - r1;
  const s2 = -q2 - r2;
  return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(s1 - s2)) / 2;
}

/** 获取指定 Hex 格周围 6 个邻居的坐标（轴向） */
export function hexNeighbors(q: number, r: number): { q: number; r: number }[] {
  const directions: { q: number; r: number }[] = [
    { q: 0, r: -1 }, { q: 1, r: -1 }, { q: 1, r: 0 },
    { q: 0, r: 1 }, { q: -1, r: 1 }, { q: -1, r: 0 },
  ];
  return directions.map(d => ({ q: q + d.q, r: r + d.r }));
}

/** 获取半径为 R 的环形区域内的所有 Hex 格坐标 */
export function hexRing(centerQ: number, centerR: number, radius: number): { q: number; r: number }[] {
  const results: { q: number; r: number }[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      results.push({ q: centerQ + dq, r: centerR + dr });
    }
  }
  return results;
}
