// ============================================================
// 多层地图数据模型 — 星界 / 大陆 / 区域 / 场所
// ============================================================

import type { RealmType } from './character.js';

/**
 * 地图层级。
 * - Cosmos  : 星界（化神+ 可御空跨星系）
 * - Continent: 大陆（元婴+ 可跨大陆）
 * - Region  : 区域网格（六边形探索，当前 20×20）
 * - Venue   : 场所（城镇内部的固定场景）
 */
export type MapLayer = 'Cosmos' | 'Continent' | 'Region' | 'Settlement' | 'Venue';

/** 境界 → 数值，用于门槛比较 */
export const REALM_ORDER: Record<RealmType, number> = {
  Mortal: -1,
  LianQi: 0,
  ZhuJi: 1,
  JinDan: 2,
  YuanYing: 3,
  HuaShen: 4,
};

// ---- L3 星界 ----

export interface CosmosMeta {
  id: string;
  name: string;
  description: string;
  /** 星系在 Cosmos SVG 上的坐标 */
  position: { x: number; y: number };
  color: string;
  /** 进入该星系所需境界 */
  requiredRealm: RealmType;
  /** 该星系包含的大陆 id */
  continentIds: string[];
}

// ---- L2 大陆 ----

export interface ContinentMeta {
  id: string;
  name: string;
  description: string;
  /** 大陆在 Continent SVG 上的坐标 */
  position: { x: number; y: number };
  color: string;
  /** 进入该大陆所需境界（初始大陆为 LianQi） */
  requiredRealm: RealmType;
  /** 所属星系 id */
  cosmosId: string;
  /** 该大陆的六边形网格 seed（确定性生成） */
  gridSeed: number;
}

// ---- 传送阵 ----

/**
 * 传送阵节点。位于大陆/星系的"枢纽地标"上。
 * 玩家必须在该节点所在格才能使用传送。
 */
export interface TeleportNode {
  id: string;
  name: string;
  /** 传送阵所在的大陆 id */
  continentId: string;
  /** 传送阵所在的地标 node id（PRESET_MAP 节点） */
  nodeId: string;
  /** 可到达的目标传送阵 id 列表 */
  connections: string[];
  /** 单次传送灵石消耗 */
  spiritStoneCost: number;
  /** 使用所需境界 */
  requiredRealm: RealmType;
}

export interface TeleportGraph {
  nodes: Record<string, TeleportNode>;
}

// ---- L0 场所（城镇内部） ----

export type VenueType = 'tavern' | 'shop' | 'teleport_office' | 'residential' | 'quest_board' | 'sect_hall' | 'training_ground';

export interface VenueDef {
  id: string;
  name: string;
  type: VenueType;
  description: string;
  /** 进入该场所所需的城镇 node id */
  nodeId: string;
  /** 可选：境界限制 */
  requiredRealm?: RealmType;
}

// ---- 玩家地图状态（用于存档/缓存） ----

export interface PlayerMapState {
  /** 当前所在层级 */
  activeLayer: MapLayer;
  /** 当前所在星系 id */
  activeCosmosId: string;
  /** 当前所在大陆 id */
  activeContinentId: string;
  /** 当前所在场所 id（L0），null 表示不在任何场所 */
  activeVenueId: string | null;
  /** 按大陆 id 分片的已探索六边形坐标 */
  exploredHexes: Record<string, Array<{ q: number; r: number }>>;
  /** 玩家在当前大陆网格上的位置 */
  hexPos: { q: number; r: number };
}
