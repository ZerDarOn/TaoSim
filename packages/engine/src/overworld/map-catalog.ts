/**
 * MapCatalog — 多层地图元数据目录
 *
 * 定义所有星系/大陆/传送阵/城镇场所的静态数据。
 * 引擎层和 UI 层都从这里读取世界结构。
 */

import type {
  CosmosMeta,
  ContinentMeta,
  TeleportGraph,
  TeleportNode,
  VenueDef,
  PlayerMapState,
} from '@taosim/contracts';

// ============================================================
// L3 星界
// ============================================================

export const COSMOS_CATALOG: CosmosMeta[] = [
  {
    id: 'COSMOS_TAIYANG',
    name: '太阳星系',
    description: '凡人所居之星系，灵气稀薄，修士众多。',
    position: { x: 200, y: 200 },
    color: '#fbbf24',
    requiredRealm: 'HuaShen',
    continentIds: ['CONT_EAST', 'CONT_WEST', 'CONT_SOUTH'],
  },
  {
    id: 'COSMOS_ZIWEI',
    name: '紫薇星系',
    description: '传说中仙人居所，灵气浓郁，非大能不可至。',
    position: { x: 600, y: 400 },
    color: '#a855f7',
    requiredRealm: 'HuaShen',
    continentIds: ['CONT_ZIWEI_NORTH'],
  },
];

// ============================================================
// L2 大陆
// ============================================================

export const CONTINENT_CATALOG: ContinentMeta[] = [
  {
    id: 'CONT_EAST',
    name: '东荒',
    description: '修士启程之地，灵脉温和，宗门林立。',
    position: { x: 150, y: 250 },
    color: '#84cc16',
    requiredRealm: 'LianQi',
    cosmosId: 'COSMOS_TAIYANG',
    gridSeed: 42,
  },
  {
    id: 'CONT_WEST',
    name: '西漠',
    description: '黄沙万里，佛修圣地，妖兽横行。',
    position: { x: 500, y: 200 },
    color: '#d97706',
    requiredRealm: 'YuanYing',
    cosmosId: 'COSMOS_TAIYANG',
    gridSeed: 137,
  },
  {
    id: 'CONT_SOUTH',
    name: '南疆',
    description: '万蛊毒地，蛮荒凶险，奇珍遍野。',
    position: { x: 350, y: 500 },
    color: '#dc2626',
    requiredRealm: 'YuanYing',
    cosmosId: 'COSMOS_TAIYANG',
    gridSeed: 256,
  },
  {
    id: 'CONT_ZIWEI_NORTH',
    name: '紫薇北极',
    description: '紫薇星系唯一已知大陆，仙气缭绕，凡人至此即化枯骨。',
    position: { x: 600, y: 300 },
    color: '#c084fc',
    requiredRealm: 'HuaShen',
    cosmosId: 'COSMOS_ZIWEI',
    gridSeed: 999,
  },
];

// ============================================================
// 传送阵图
// ============================================================

const TELEPORT_NODES_RAW: TeleportNode[] = [
  // 东荒 — 天机城传送阵（元婴门槛）
  {
    id: 'TP_EAST_TIANJI',
    name: '天机城传送阵',
    continentId: 'CONT_EAST',
    nodeId: 'NODE_CITY_TIANJI',
    // 传送图双向对称（紫薇 ⇄ 东荒）：未开放大陆由 canTeleport 兜底拦截，不产生"能出不能进"孤点
    connections: ['TP_WEST_FOZONG', 'TP_SOUTH_WUGU', 'TP_ZIWEI_XIANFU'],
    spiritStoneCost: 500,
    requiredRealm: 'YuanYing',
  },
  // 西漠 — 佛宗传送阵
  {
    id: 'TP_WEST_FOZONG',
    name: '大雷音寺传送阵',
    continentId: 'CONT_WEST',
    nodeId: 'NODE_CITY_TIANJI', // 占位：西漠节点未开放，暂用东荒节点
    connections: ['TP_EAST_TIANJI'],
    spiritStoneCost: 500,
    requiredRealm: 'YuanYing',
  },
  // 南疆 — 五毒教传送阵
  {
    id: 'TP_SOUTH_WUGU',
    name: '五毒教传送阵',
    continentId: 'CONT_SOUTH',
    nodeId: 'NODE_CITY_TIANJI', // 占位：南疆节点未开放
    connections: ['TP_EAST_TIANJI'],
    spiritStoneCost: 800,
    requiredRealm: 'YuanYing',
  },
  // 紫薇北极 — 仙府传送阵（化神门槛）
  {
    id: 'TP_ZIWEI_XIANFU',
    name: '紫薇仙府传送阵',
    continentId: 'CONT_ZIWEI_NORTH',
    nodeId: 'NODE_CITY_TIANJI', // 占位
    connections: ['TP_EAST_TIANJI'],
    spiritStoneCost: 5000,
    requiredRealm: 'HuaShen',
  },
];

export const TELEPORT_GRAPH: TeleportGraph = {
  nodes: Object.fromEntries(TELEPORT_NODES_RAW.map(n => [n.id, n] as const)),
};

// ============================================================
// L0 场所（城镇内部）
// ============================================================

export const VENUE_CATALOG: VenueDef[] = [
  // 天机城场所
  {
    id: 'VENUE_TIANJI_TAVERN',
    name: '醉仙楼',
    type: 'tavern',
    description: '天机城最热闹的酒楼，可打听消息、结交修士。',
    nodeId: 'NODE_CITY_TIANJI',
  },
  {
    id: 'VENUE_TIANJI_SHOP',
    name: '百宝阁',
    type: 'shop',
    description: '天机城最大的商铺，丹药法器灵材俱全。',
    nodeId: 'NODE_CITY_TIANJI',
  },
  {
    id: 'VENUE_TIANJI_TELEPORT',
    name: '天机传送院',
    type: 'teleport_office',
    description: '管理跨大陆传送阵的机构，需元婴以上方能使用。',
    nodeId: 'NODE_CITY_TIANJI',
    requiredRealm: 'YuanYing',
  },
  {
    id: 'VENUE_TIANJI_RESIDENTIAL',
    name: '天机城民居',
    type: 'residential',
    description: '凡人与低阶修士聚居之地，偶有奇遇。',
    nodeId: 'NODE_CITY_TIANJI',
  },
  {
    id: 'VENUE_TIANJI_QUEST',
    name: '天机榜',
    type: 'quest_board',
    description: '悬赏任务告示板，完成可得贡献与灵石。',
    nodeId: 'NODE_CITY_TIANJI',
  },
  // 坊市场所
  {
    id: 'VENUE_MARKET_SHOP',
    name: '坊市商铺',
    type: 'shop',
    description: '坊市中心的商铺，商品随坊市层级变化。',
    nodeId: 'NODE_MARKET',
  },
  // 青云宗场所
  {
    id: 'VENUE_QINGYUN_HALL',
    name: '青云殿',
    type: 'sect_hall',
    description: '青云宗主殿，可领取宗门任务、晋升、兑换贡献。',
    nodeId: 'NODE_SECT_QINGYUN',
  },
  {
    id: 'VENUE_QINGYUN_TRAINING',
    name: '练功场',
    type: 'training_ground',
    description: '青云宗练功场，闭关修行的圣地。',
    nodeId: 'NODE_SECT_QINGYUN',
  },
  // 天剑宗场所（势力扩张与战争：第二宗门驻地）
  {
    id: 'VENUE_TIANJIAN_HALL',
    name: '天剑阁',
    type: 'sect_hall',
    description: '天剑宗主殿，剑意冲霄，杀伐之气弥漫。',
    nodeId: 'NODE_SECT_TIANJIAN',
  },
  {
    id: 'VENUE_TIANJIAN_TRAINING',
    name: '剑冢',
    type: 'training_ground',
    description: '天剑宗历代剑修埋剑之所，剑气纵横，凶险亦机缘。',
    nodeId: 'NODE_SECT_TIANJIAN',
  },
];

// ============================================================
// 查询辅助
// ============================================================

export function getCosmos(id: string): CosmosMeta | undefined {
  return COSMOS_CATALOG.find(c => c.id === id);
}

export function getContinent(id: string): ContinentMeta | undefined {
  return CONTINENT_CATALOG.find(c => c.id === id);
}

export function getContinentIdsByCosmos(cosmosId: string): string[] {
  return CONTINENT_CATALOG.filter(c => c.cosmosId === cosmosId).map(c => c.id);
}

export function getTeleportNode(id: string): TeleportNode | undefined {
  return TELEPORT_GRAPH.nodes[id];
}

/** 找出玩家当前可用的传送阵（站在该传送阵所在格子上） */
export function getTeleportNodeAt(continentId: string, nodeId: string): TeleportNode | undefined {
  return Object.values(TELEPORT_GRAPH.nodes).find(
    n => n.continentId === continentId && n.nodeId === nodeId,
  );
}

export function getVenuesByNode(nodeId: string): VenueDef[] {
  return VENUE_CATALOG.filter(v => v.nodeId === nodeId);
}

export function getVenue(id: string): VenueDef | undefined {
  return VENUE_CATALOG.find(v => v.id === id);
}

// ============================================================
// 初始玩家地图状态
// ============================================================

export function createInitialMapState(): PlayerMapState {
  return {
    activeLayer: 'Region',
    activeCosmosId: 'COSMOS_TAIYANG',
    activeContinentId: 'CONT_EAST',
    activeVenueId: null,
    focusedSpatialNodeId: null,
    exploredHexes: {},
    hexPos: { q: 10, r: 10 },
    observationPreferences: {
      npcRoutes: 'focused',
      npcNames: 'aggregate',
      people: true,
      roads: true,
      spiritQi: false,
      factions: false,
      dangers: true,
    },
    viewports: {},
  };
}
