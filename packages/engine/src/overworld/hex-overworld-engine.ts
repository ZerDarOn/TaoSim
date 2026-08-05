/**
 * HexOverworldEngine — 六边形世界网格
 *
 * 世界是一个六边形网格（axial coordinates q,r），玩家在格子上一步一步移动。
 * 12 个 PRESET_MAP 节点作为地标嵌在网格中。
 * 移动消耗时间，可触发随机事件。
 */

import { PRESET_MAP } from '../overworld/preset-map.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import type { Character } from '@taosim/contracts';

// ---- 六边形网格类型 ----

export type HexTerrain = 'plain' | 'forest' | 'mountain' | 'water' | 'spirit_vein' | 'town' | 'wilderness' | 'void';

export interface WorldHex {
  q: number;
  r: number;
  terrain: HexTerrain;
  explored: boolean;
  landmarkId?: string;      // 对应 PRESET_MAP 的节点 id
  landmarkName?: string;
  landmarkType?: string;    // City/Sect/Dungeon/Market/Wilderness
  landmarkTier?: number;
}

export interface WorldHexGrid {
  hexes: Map<string, WorldHex>;  // key: "q,r"
  width: number;
  height: number;
}

export interface HexMoveResult {
  success: boolean;
  reason?: string;
  hex: WorldHex;
  daysPassed: number;
  events: HexMoveEvent[];
  // 如果是自动寻路，记录路径
  path?: Array<{ q: number; r: number }>;
}

export interface HexMoveEvent {
  type: 'encounter' | 'battle' | 'npc_meet' | 'material_found' | 'landmark_reached' | 'discovery';
  title: string;
  description: string;
  npc?: Character;
  materialId?: string;
}

// ---- 地形样式 ----

export const TERRAIN_INFO: Record<HexTerrain, { name: string; color: string; icon: string; moveCost: number }> = {
  plain:        { name: '平原',   color: '#3a5a3a', icon: '·',  moveCost: 1 },
  forest:       { name: '密林',   color: '#2a4a2a', icon: '木', moveCost: 1 },
  mountain:     { name: '山地',   color: '#4a3a2a', icon: '山', moveCost: 2 },
  water:        { name: '水域',   color: '#1a3a5a', icon: '水', moveCost: 3 },
  spirit_vein:  { name: '灵脉',   color: '#5a3a5a', icon: '灵', moveCost: 1 },
  town:         { name: '城镇',   color: '#5a4a2a', icon: '城', moveCost: 0 },
  wilderness:   { name: '荒野',   color: '#3a3a3a', icon: '荒', moveCost: 1 },
  void:         { name: '虚空',   color: '#0a0a1a', icon: '×',  moveCost: 99 },
};

// 六边形邻居方向（axial coordinates）
const HEX_DIRECTIONS = [
  { q: 1, r: 0 },   { q: 1, r: -1 },  { q: 0, r: -1 },
  { q: -1, r: 0 },  { q: -1, r: 1 },  { q: 0, r: 1 },
];

// ---- 世界网格生成 ----

// PRESET_MAP 节点坐标 → 网格坐标映射
// 节点 coordinates (x,y) 范围约 80-700, 150-600
// 映射到 20×20 网格
const GRID_SIZE = 20;

function nodeToGrid(x: number, y: number): { q: number; r: number } {
  // x: 80-700 → q: 2-18; y: 150-600 → r: 2-16
  const q = Math.round(2 + (x - 80) / (700 - 80) * (GRID_SIZE - 4));
  const r = Math.round(2 + (y - 150) / (600 - 150) * (GRID_SIZE - 6));
  return { q: Math.max(0, Math.min(GRID_SIZE - 1, q)), r: Math.max(0, Math.min(GRID_SIZE - 1, r)) };
}

// 简易确定性随机（基于种子）
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function generateWorldGrid(seed: number = 42): WorldHexGrid {
  const hexes = new Map<string, WorldHex>();
  const rng = seededRandom(seed);

  // 先填充基础地形
  for (let q = 0; q < GRID_SIZE; q++) {
    for (let r = 0; r < GRID_SIZE; r++) {
      const roll = rng();
      let terrain: HexTerrain;
      if (roll < 0.35) terrain = 'plain';
      else if (roll < 0.60) terrain = 'forest';
      else if (roll < 0.72) terrain = 'mountain';
      else if (roll < 0.80) terrain = 'water';
      else if (roll < 0.88) terrain = 'wilderness';
      else if (roll < 0.95) terrain = 'spirit_vein';
      else terrain = 'void';

      hexes.set(`${q},${r}`, { q, r, terrain, explored: false });
    }
  }

  // 嵌入 PRESET_MAP 节点作为地标
  const continent = PRESET_MAP.continents[0]!;
  for (const node of Object.values(continent.nodes)) {
    if (!node) continue;
    const { q, r } = nodeToGrid(node.coordinates.x, node.coordinates.y);
    const key = `${q},${r}`;
    const hex = hexes.get(key);
    if (hex) {
      hex.terrain = node.type === 'City' || node.type === 'Market' ? 'town'
        : node.type === 'Sect' ? 'spirit_vein'
        : node.type === 'Dungeon' ? 'mountain'
        : 'wilderness';
      hex.landmarkId = node.id;
      hex.landmarkName = node.name;
      hex.landmarkType = node.type;
      hex.landmarkTier = node.tier;
    }
  }

  return { hexes, width: GRID_SIZE, height: GRID_SIZE };
}

// ---- 六边形数学 ----

export function hexDistance(a: { q: number; r: number }, b: { q: number; r: number }): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function getHexNeighbors(q: number, r: number): Array<{ q: number; r: number }> {
  return HEX_DIRECTIONS.map(d => ({ q: q + d.q, r: r + d.r }));
}

// A* 寻路（六边形）
export function findPath(
  grid: WorldHexGrid,
  from: { q: number; r: number },
  to: { q: number; r: number },
): Array<{ q: number; r: number }> | null {
  const startKey = `${from.q},${from.r}`;
  const endKey = `${to.q},${to.r}`;
  if (!grid.hexes.has(startKey) || !grid.hexes.has(endKey)) return null;

  const openSet = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, hexDistance(from, to)]]);

  while (openSet.size > 0) {
    // 找 fScore 最小的
    let current = '';
    let minF = Infinity;
    for (const key of openSet) {
      const f = fScore.get(key) ?? Infinity;
      if (f < minF) { minF = f; current = key; }
    }

    if (current === endKey) {
      // 重建路径
      const path: Array<{ q: number; r: number }> = [];
      let curr: string | undefined = current;
      while (curr) {
        const [q, r] = curr.split(',').map(Number);
        path.unshift({ q: q!, r: r! });
        curr = cameFrom.get(curr);
      }
      return path;
    }

    openSet.delete(current);
    const [cq, cr] = current.split(',').map(Number);
    const neighbors = getHexNeighbors(cq!, cr!);

    for (const n of neighbors) {
      const nKey = `${n.q},${n.r}`;
      const nHex = grid.hexes.get(nKey);
      if (!nHex || nHex.terrain === 'void') continue;

      const moveCost = TERRAIN_INFO[nHex.terrain].moveCost;
      const tentativeG = (gScore.get(current) ?? Infinity) + moveCost;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, current);
        gScore.set(nKey, tentativeG);
        fScore.set(nKey, tentativeG + hexDistance(n, to));
        openSet.add(nKey);
      }
    }
  }

  return null; // 无路径
}

// ---- 移动逻辑 ----

const MATERIALS = ['MAT_SPIRIT_GRASS', 'MAT_IRON_ORE', 'MAT_YIN_DEW', 'MAT_BLOOD_FLOWER', 'MAT_JADE'];

/**
 * 移动一格。
 * 返回移动结果 + 触发的事件。
 */
export function moveOneStep(
  grid: WorldHexGrid,
  playerPos: { q: number; r: number },
  targetQ: number,
  targetR: number,
  player: Character,
): HexMoveResult | null {
  const targetKey = `${targetQ},${targetR}`;
  const targetHex = grid.hexes.get(targetKey);
  if (!targetHex) return null;

  // 检查是否相邻
  const neighbors = getHexNeighbors(playerPos.q, playerPos.r);
  const isAdjacent = neighbors.some(n => n.q === targetQ && n.r === targetR);
  if (!isAdjacent) return null;

  // 检查地形可通行
  if (targetHex.terrain === 'void') {
    return { success: false, reason: '虚空无法通过', hex: targetHex, daysPassed: 0, events: [] };
  }

  const moveCost = TERRAIN_INFO[targetHex.terrain].moveCost;
  const events: HexMoveEvent[] = [];

  // 标记为已探索
  targetHex.explored = true;
  // 同时探索邻居（视野范围 1）
  for (const n of getHexNeighbors(targetQ, targetR)) {
    const nHex = grid.hexes.get(`${n.q},${n.r}`);
    if (nHex) nHex.explored = true;
  }

  // 到达地标
  if (targetHex.landmarkId) {
    events.push({
      type: 'landmark_reached',
      title: `抵达${targetHex.landmarkName ?? '地标'}`,
      description: `你来到了${targetHex.landmarkName}。`,
    });
  }

  // 随机事件（非城镇格子）
  if (targetHex.terrain !== 'town') {
    const roll = Math.random();

    if (roll < 0.12) {
      // NPC 偶遇
      const tier = targetHex.landmarkTier ?? 1;
      const npc = NPCGenerator.generate(tier, Date.now());
      events.push({
        type: 'npc_meet',
        title: '偶遇修士',
        description: `在途中遇到了${npc.name}。`,
        npc,
      });
    } else if (roll < 0.22) {
      // 妖兽
      events.push({
        type: 'battle',
        title: '遭遇妖兽',
        description: `一只妖兽挡住了去路！`,
      });
    } else if (roll < 0.35) {
      // 材料
      const mat = MATERIALS[Math.floor(Math.random() * MATERIALS.length)]!;
      events.push({
        type: 'material_found',
        title: '发现材料',
        description: `在地上发现了一些材料。`,
        materialId: mat,
      });
    } else if (roll < 0.42) {
      // 奇遇
      events.push({
        type: 'discovery',
        title: '灵光一闪',
        description: `行路中忽有所悟，似乎触碰到了什么玄妙之处。`,
      });
    }
  }

  return {
    success: true,
    hex: targetHex,
    daysPassed: moveCost,
    events,
  };
}

/**
 * 自动寻路：从当前位置走到目标格，逐格移动并累积事件。
 * 返回完整路径和所有事件。调用方负责逐格应用或一次性应用。
 */
export function autoTravel(
  grid: WorldHexGrid,
  playerPos: { q: number; r: number },
  targetQ: number,
  targetR: number,
  player: Character,
): HexMoveResult | null {
  const path = findPath(grid, playerPos, { q: targetQ, r: targetR });
  if (!path || path.length < 2) return null;

  let totalDays = 0;
  const allEvents: HexMoveEvent[] = [];
  let currentPos = playerPos;

  for (let i = 1; i < path.length; i++) {
    const step = path[i]!;
    const result = moveOneStep(grid, currentPos, step.q, step.r, player);
    if (!result || !result.success) break;
    totalDays += result.daysPassed;
    allEvents.push(...result.events);
    currentPos = step;
  }

  const finalHex = grid.hexes.get(`${targetQ},${targetR}`)!;
  return {
    success: true,
    hex: finalHex,
    daysPassed: totalDays,
    events: allEvents,
    path,
  };
}

/**
 * 根据地标 id 查找网格坐标。
 */
export function findLandmarkPos(grid: WorldHexGrid, landmarkId: string): { q: number; r: number } | null {
  for (const hex of grid.hexes.values()) {
    if (hex.landmarkId === landmarkId) return { q: hex.q, r: hex.r };
  }
  return null;
}
