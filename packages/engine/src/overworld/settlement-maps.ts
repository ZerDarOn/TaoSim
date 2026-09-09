// ============================================================
// Settlement Maps — P3 聚落内部地图
//
// 在 Region 和 Venue 之间引入 Settlement 层级：
// - 聚落节点（城门/主街/商铺/酒楼等）有 2D 位置
// - 道路连接节点并记录物理距离
// - 旅行耗时由距离、速度和移动方式计算
// - 玩家与 NPC 共享同一位置引用
// ============================================================

import type { NpcRecord } from '@taosim/contracts';
import { VENUE_CATALOG } from './map-catalog.js';

// —— 契约类型 ——

/** 聚落节点（城内子区域/场所入口） */
export interface SettlementNode {
  id: string;
  name: string;
  /** 节点类型 */
  type: 'gate' | 'street' | 'shop' | 'tavern' | 'residential' | 'teleport' | 'quest' | 'training' | 'hall' | 'alley';
  /** 2D 位置（聚落坐标系，像素/相对单位） */
  position: { x: number; y: number };
  /** 关联的场所 ID（如果该节点对应一个 VenueDef） */
  venueId?: string;
  /** 节点描述 */
  description?: string;
}

/** 聚落内道路 */
export interface SettlementRoad {
  from: string;
  to: string;
  /** 权威物理距离（米）；不得由 UI 坐标反推。 */
  distanceMeters: number;
}

/** 聚落地图 */
export interface SettlementMap {
  /** 稳定定义版本；用于目录增量升级，不随存档时间变化。 */
  definitionVersion: number;
  /** 关联的大地图节点 ID（如 NODE_CITY_TIANJI） */
  nodeId: string;
  /** 聚落名称 */
  name: string;
  /** 从上级空间进入时落脚的稳定节点。 */
  entryNodeId: string;
  /** 纯显示布局；不表示物理米制坐标。 */
  layout: { x: number; y: number; width: number; height: number };
  /** 聚落内节点 */
  nodes: SettlementNode[];
  /** 聚落内道路 */
  roads: SettlementRoad[];
}

// —— 天机城聚落图 ——

export const TIANJI_SETTLEMENT: SettlementMap = {
  definitionVersion: 1,
  nodeId: 'NODE_CITY_TIANJI',
  name: '天机城',
  entryNodeId: 'TIANJI_GATE_SOUTH',
  layout: { x: 80, y: 120, width: 640, height: 500 },
  nodes: [
    // 城门
    {
      id: 'TIANJI_GATE_SOUTH',
      name: '南门',
      type: 'gate',
      position: { x: 400, y: 550 },
      description: '天机城南门，修士往来如织',
    },
    // 主街（中心枢纽）
    {
      id: 'TIANJI_MAIN_STREET',
      name: '天机主街',
      type: 'street',
      position: { x: 400, y: 350 },
      description: '横贯天机城的主街，两侧店铺林立',
    },
    // 百宝阁
    {
      id: 'TIANJI_BAIBAO_GE',
      name: '百宝阁',
      type: 'shop',
      position: { x: 250, y: 280 },
      venueId: 'VENUE_TIANJI_SHOP',
      description: '丹药法器灵材应有尽有',
    },
    // 醉仙楼
    {
      id: 'TIANJI_ZUIXIAN_LOU',
      name: '醉仙楼',
      type: 'tavern',
      position: { x: 550, y: 280 },
      venueId: 'VENUE_TIANJI_TAVERN',
      description: '天机城最有名的酒楼，消息灵通',
    },
    // 传送院
    {
      id: 'TIANJI_TELEPORT',
      name: '天机传送院',
      type: 'teleport',
      position: { x: 600, y: 400 },
      venueId: 'VENUE_TIANJI_TELEPORT',
      description: '跨大陆传送阵',
    },
    // 天机榜
    {
      id: 'TIANJI_QUEST_BOARD',
      name: '天机榜',
      type: 'quest',
      position: { x: 400, y: 200 },
      venueId: 'VENUE_TIANJI_QUEST',
      description: '悬赏任务发布处',
    },
    // 民居区
    {
      id: 'TIANJI_RESIDENTIAL',
      name: '民居区',
      type: 'residential',
      position: { x: 200, y: 450 },
      venueId: 'VENUE_TIANJI_RESIDENTIAL',
      description: '凡人和低阶修士聚居之地',
    },
    // 暗巷
    {
      id: 'TIANJI_DARK_ALLEY',
      name: '暗巷',
      type: 'alley',
      position: { x: 150, y: 350 },
      description: '天机城的阴暗角落，不知通向何方',
    },
  ],
  roads: [
    // 南门 ↔ 主街
    { from: 'TIANJI_GATE_SOUTH', to: 'TIANJI_MAIN_STREET', distanceMeters: 200 },
    // 主街 ↔ 百宝阁
    { from: 'TIANJI_MAIN_STREET', to: 'TIANJI_BAIBAO_GE', distanceMeters: 160 },
    // 主街 ↔ 醉仙楼
    { from: 'TIANJI_MAIN_STREET', to: 'TIANJI_ZUIXIAN_LOU', distanceMeters: 160 },
    // 主街 ↔ 天机榜
    { from: 'TIANJI_MAIN_STREET', to: 'TIANJI_QUEST_BOARD', distanceMeters: 150 },
    // 主街 ↔ 传送院
    { from: 'TIANJI_MAIN_STREET', to: 'TIANJI_TELEPORT', distanceMeters: 250 },
    // 南门 ↔ 民居区
    { from: 'TIANJI_GATE_SOUTH', to: 'TIANJI_RESIDENTIAL', distanceMeters: 250 },
    // 百宝阁 ↔ 暗巷
    { from: 'TIANJI_BAIBAO_GE', to: 'TIANJI_DARK_ALLEY', distanceMeters: 100 },
    // 民居区 ↔ 暗巷（隐蔽小路）
    { from: 'TIANJI_RESIDENTIAL', to: 'TIANJI_DARK_ALLEY', distanceMeters: 120 },
  ],
};

// —— 青云宗聚落图 ——

/**
 * 青云宗拥有独立于天机城的空间拓扑。这里表达的是首个可玩的宗门外院，
 * 不是把同一张城市底图换名复用；后续室内地图可挂在对应 Venue 下。
 */
export const QINGYUN_SETTLEMENT: SettlementMap = {
  definitionVersion: 1,
  nodeId: 'NODE_SECT_QINGYUN',
  name: '青云宗',
  entryNodeId: 'QINGYUN_MOUNTAIN_GATE',
  layout: { x: 100, y: 100, width: 620, height: 520 },
  nodes: [
    {
      id: 'QINGYUN_MOUNTAIN_GATE',
      name: '青云山门',
      type: 'gate',
      position: { x: 400, y: 570 },
      description: '云阶尽头的青石山门，入宗者须在此验明身份',
    },
    {
      id: 'QINGYUN_CLOUD_STEPS',
      name: '登云阶',
      type: 'street',
      position: { x: 400, y: 450 },
      description: '沿山势而上的石阶，晨昏常有弟子往来',
    },
    {
      id: 'QINGYUN_OUTER_COURT',
      name: '外院',
      type: 'residential',
      position: { x: 240, y: 350 },
      description: '外门弟子居住、领受杂务之处',
    },
    {
      id: 'QINGYUN_HALL',
      name: '青云殿',
      type: 'hall',
      position: { x: 400, y: 210 },
      venueId: 'VENUE_QINGYUN_HALL',
      description: '宗门议事与接引宾客之地',
    },
    {
      id: 'QINGYUN_TRAINING',
      name: '演武坪',
      type: 'training',
      position: { x: 580, y: 340 },
      venueId: 'VENUE_QINGYUN_TRAINING',
      description: '弟子切磋、长老授业的开阔石坪',
    },
    {
      id: 'QINGYUN_BACK_CLIFF',
      name: '后山断崖',
      type: 'alley',
      position: { x: 610, y: 170 },
      description: '罡风常年不息，偶有弟子来此悟剑',
    },
  ],
  roads: [
    { from: 'QINGYUN_MOUNTAIN_GATE', to: 'QINGYUN_CLOUD_STEPS', distanceMeters: 500 },
    { from: 'QINGYUN_CLOUD_STEPS', to: 'QINGYUN_OUTER_COURT', distanceMeters: 300 },
    { from: 'QINGYUN_CLOUD_STEPS', to: 'QINGYUN_TRAINING', distanceMeters: 360 },
    { from: 'QINGYUN_OUTER_COURT', to: 'QINGYUN_HALL', distanceMeters: 420 },
    { from: 'QINGYUN_TRAINING', to: 'QINGYUN_HALL', distanceMeters: 330 },
    { from: 'QINGYUN_TRAINING', to: 'QINGYUN_BACK_CLIFF', distanceMeters: 280 },
  ],
};

// —— 聚落注册表 ——

export const SETTLEMENT_REGISTRY: Record<string, SettlementMap> = {
  NODE_CITY_TIANJI: TIANJI_SETTLEMENT,
  NODE_SECT_QINGYUN: QINGYUN_SETTLEMENT,
};

/** 按 nodeId 获取聚落图 */
export function getSettlement(nodeId: string): SettlementMap | undefined {
  return SETTLEMENT_REGISTRY[nodeId];
}

/** 获取聚落内两个节点之间的加权最短路径距离（Dijkstra）。 */
export function settlementDistance(
  map: SettlementMap,
  fromNodeId: string,
  toNodeId: string,
): number | null {
  if (fromNodeId === toNodeId) return 0;

  const knownNodeIds = new Set(map.nodes.map((node) => node.id));
  if (!knownNodeIds.has(fromNodeId) || !knownNodeIds.has(toNodeId)) return null;

  const settled = new Set<string>();
  const distances = new Map<string, number>([[fromNodeId, 0]]);

  while (settled.size < knownNodeIds.size) {
    let currentId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const [nodeId, distance] of distances) {
      if (!settled.has(nodeId) && distance < currentDistance) {
        currentId = nodeId;
        currentDistance = distance;
      }
    }
    if (!currentId) return null;
    if (currentId === toNodeId) return currentDistance;
    settled.add(currentId);

    for (const road of map.roads) {
      const next = road.from === currentId
        ? road.to
        : road.to === currentId
          ? road.from
          : null;
      if (!next || settled.has(next)) continue;
      const candidateDistance = currentDistance + road.distanceMeters;
      if (candidateDistance < (distances.get(next) ?? Number.POSITIVE_INFINITY)) {
        distances.set(next, candidateDistance);
      }
    }
  }
  return null;
}

// —— 在场 NPC 查询 ——

/**
 * 按 venueId 查找指定场所内活动 NPC。
 * NPC.locationId 是 venueId。
 */
export function getNpcsInVenue(
  npcs: Record<string, NpcRecord>,
  venueId: string,
): NpcRecord[] {
  return Object.values(npcs).filter(
    n => n.soulState === 'Active' && n.locationId === venueId,
  );
}

/**
 * 查找聚落内所有活动 NPC。
 * 通过聚落节点的 venueId 关联到场所，再匹配 NPC.locationId。
 */
export function getNpcsInSettlement(
  npcs: Record<string, NpcRecord>,
  nodeId: string,
): NpcRecord[] {
  const settlement = getSettlement(nodeId);
  if (!settlement) return [];

  // 获取聚落内所有 venueId
  const venueIds = new Set(
    settlement.nodes
      .filter(n => n.venueId)
      .map(n => n.venueId!),
  );

  // 同时也包含旧 Venue 列表中属于该 nodeId 的场所
  const catalogVenues = VENUE_CATALOG.filter(v => v.nodeId === nodeId);
  for (const v of catalogVenues) {
    venueIds.add(v.id);
  }

  return Object.values(npcs).filter(
    n => n.soulState === 'Active' && n.locationId && venueIds.has(n.locationId),
  );
}

/**
 * 获取聚落节点上当前在场的 NPC（按 venueId 关联）。
 * 用于小地图显示"这个场所有谁"。
 */
export function getNpcsAtSettlementNode(
  npcs: Record<string, NpcRecord>,
  nodeId: string,
  settlementNodeId: string,
): NpcRecord[] {
  const settlement = getSettlement(nodeId);
  if (!settlement) return [];

  const node = settlement.nodes.find(n => n.id === settlementNodeId);
  if (!node || !node.venueId) return [];

  return getNpcsInVenue(npcs, node.venueId);
}
