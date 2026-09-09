// ============================================================
// 旧地图目录 → 权威空间目录适配器 — 动态空间世界 Phase 1
//
// 这里只把现有真实目录映射为统一空间树和连接图。未知 legacy id
// 不会被悄悄创建为正式地点；调用方可以根据 null/诊断决定是否阻止加载。
// ============================================================

import type {
  LocationRef,
  NpcRecord,
  PlayerMapState,
  SavePayload,
  SpatialAddress,
  SpatialNode,
  SpatialNodeKind,
  SpatialState,
  SpatialLink,
} from '@taosim/contracts';
import { CONTINENT_CATALOG, COSMOS_CATALOG, createInitialMapState, TELEPORT_GRAPH, VENUE_CATALOG } from './map-catalog.js';
import { PRESET_MAP } from './preset-map.js';
import { SETTLEMENT_REGISTRY } from './settlement-maps.js';
import { validateSpatialState } from '@taosim/contracts';

const PLANE_ID = 'PLANE_TAOSIM';
const SETTLEMENT_METERS_PER_TRAVEL_UNIT = 20_000;
export const SPATIAL_CATALOG_VERSION = 2;
const LEGACY_CONTINENT_ALIASES: Record<string, string> = {
  CONTINENT_CANGZHOU: 'CONT_EAST',
};

function canonicalContinentId(id: string): string {
  return LEGACY_CONTINENT_ALIASES[id] ?? id;
}

function regionId(continentId: string): string {
  return `REGION_${continentId}`;
}

function localAreaId(continentId: string): string {
  return `LOCAL_${continentId}_OVERWORLD`;
}

function nodeKind(type: string): SpatialNodeKind {
  switch (type) {
    case 'City': return 'Settlement';
    case 'Sect': return 'Sect';
    case 'Dungeon': return 'Ruin';
    case 'Market': return 'Site';
    case 'Wilderness': return 'Wilderness';
    default: return 'Site';
  }
}

function makeNode(
  id: string,
  name: string,
  kind: SpatialNodeKind,
  parentId?: string,
  options: Partial<Pick<SpatialNode, 'anchor' | 'coordinateScale' | 'containsChildren'>> = {},
): SpatialNode {
  return {
    id,
    name,
    kind,
    parentId,
    coordinateScale: options.coordinateScale ?? { unit: 'abstract', unitsPerWorldUnit: 1 },
    anchor: options.anchor,
    status: 'active',
    containsChildren: options.containsChildren ?? false,
  };
}

function baseNodes(): Record<string, SpatialNode> {
  const nodes: Record<string, SpatialNode> = {
    [PLANE_ID]: makeNode(PLANE_ID, '大千世界', 'Plane', undefined, { containsChildren: true }),
  };

  for (const cosmos of COSMOS_CATALOG) {
    nodes[cosmos.id] = makeNode(cosmos.id, cosmos.name, 'Cosmos', PLANE_ID, { containsChildren: true });
  }
  for (const continent of CONTINENT_CATALOG) {
    nodes[continent.id] = makeNode(continent.id, continent.name, 'Continent', continent.cosmosId, { containsChildren: true });
    nodes[regionId(continent.id)] = makeNode(regionId(continent.id), `${continent.name}区域`, 'Region', continent.id, { containsChildren: true });
    nodes[localAreaId(continent.id)] = makeNode(localAreaId(continent.id), `${continent.name}野外`, 'LocalArea', regionId(continent.id), {
      coordinateScale: { unit: 'hex', unitsPerWorldUnit: 1 }, containsChildren: true,
    });
  }

  for (const continent of PRESET_MAP.continents) {
    for (const node of Object.values(continent.nodes)) {
      nodes[node.id] = makeNode(node.id, node.name, nodeKind(node.type), localAreaId(continent.id), {
        anchor: node.coordinates,
        containsChildren: VENUE_CATALOG.some((venue) => venue.nodeId === node.id),
      });
    }
  }
  const venueParents = new Map<string, string>();
  for (const settlement of Object.values(SETTLEMENT_REGISTRY)) {
    for (const node of settlement.nodes) {
      if (node.venueId) venueParents.set(node.venueId, node.id);
      nodes[node.id] = makeNode(node.id, node.name, 'Site', settlement.nodeId, {
        anchor: node.position,
        // anchor 只服务局部图布局，物理距离来自 SettlementRoad.distanceMeters。
        coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 },
        containsChildren: !!node.venueId,
      });
    }
  }
  for (const venue of VENUE_CATALOG) {
    nodes[venue.id] = makeNode(venue.id, venue.name, 'Venue', venueParents.get(venue.id) ?? venue.nodeId);
  }
  return nodes;
}

function baseLinks(): Record<string, SpatialLink> {
  const links: Record<string, SpatialLink> = {};
  const nodes = baseNodes();
  for (const continent of PRESET_MAP.continents) {
    for (const edge of continent.edges) {
      const id = `LINK_${edge.fromNodeId}_${edge.toNodeId}`;
      links[id] = {
        id,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        kind: 'road',
        distance: edge.distanceDays,
        bidirectional: true,
        status: 'active',
      };
    }
  }
  for (const settlement of Object.values(SETTLEMENT_REGISTRY)) {
    const gate = settlement.nodes.find((node) => node.id === settlement.entryNodeId);
    if (gate) {
      const id = `LINK_${settlement.nodeId}_${gate.id}`;
      links[id] = {
        id,
        fromNodeId: settlement.nodeId,
        toNodeId: gate.id,
        kind: 'gate',
        distance: 0.01,
        bidirectional: true,
        status: 'active',
      };
    }
    for (const road of settlement.roads) {
      const id = `LINK_${settlement.nodeId}_${road.from}_${road.to}`;
      links[id] = {
        id,
        fromNodeId: road.from,
        toNodeId: road.to,
        kind: 'road',
        distance: Math.max(0.001, road.distanceMeters / SETTLEMENT_METERS_PER_TRAVEL_UNIT),
        bidirectional: true,
        status: 'active',
      };
    }
  }
  // 传送也是空间连接，只是距离包含准备/启动成本；能否使用仍由 TravelService
  // 的境界、权限与目标大陆规则校验，不能由 UI 直接瞬移。
  for (const node of Object.values(TELEPORT_GRAPH.nodes)) {
    for (const connectionId of node.connections) {
      const target = TELEPORT_GRAPH.nodes[connectionId];
      if (!target) continue;
      const linkId = `TELEPORT_${node.id}_${connectionId}`;
      if (!links[linkId] && nodes[node.nodeId] && nodes[target.nodeId]) {
        links[linkId] = {
          id: linkId,
          fromNodeId: node.nodeId,
          toNodeId: target.nodeId,
          kind: 'teleport',
          distance: 1,
          bidirectional: false,
          status: 'active',
        };
      }
    }
  }
  return links;
}

/** 从当前静态真实目录建立基础空间；动态差量另存于 state.deltas。 */
export function createLegacySpatialState(): SpatialState {
  return {
    schemaVersion: 1,
    catalogVersion: SPATIAL_CATALOG_VERSION,
    baseMapId: 'legacy-preset-map',
    baseMapSeed: 42,
    revision: 0,
    nodes: baseNodes(),
    links: baseLinks(),
    features: {},
    deltas: [],
  };
}

/**
 * 将新增的稳定静态目录并入旧 v9 空间存档。只补目录节点/道路和已知旧父级，
 * 不覆盖动态状态、差量、封路或玩家/NPC 位置。
 */
export function reconcileSpatialCatalog(state: SpatialState): SpatialState {
  const catalog = createLegacySpatialState();
  for (const [id, node] of Object.entries(catalog.nodes)) {
    const existing = state.nodes[id];
    if (!existing) {
      state.nodes[id] = node;
      continue;
    }
    if (existing.kind === 'Venue'
      && existing.parentId !== node.parentId
      && existing.parentId === VENUE_CATALOG.find((venue) => venue.id === id)?.nodeId) {
      existing.parentId = node.parentId;
    }
  }
  for (const [id, link] of Object.entries(catalog.links)) {
    if (!state.links[id]) state.links[id] = link;
  }
  state.catalogVersion = SPATIAL_CATALOG_VERSION;
  return state;
}

function localAreaForContinent(state: SpatialState, continentId: string): string | null {
  const id = localAreaId(canonicalContinentId(continentId));
  return state.nodes[id] ? id : null;
}

function coordinateFromHex(hexPos: { q: number; r: number }): { q: number; r: number } {
  return { q: hexPos.q, r: hexPos.r };
}

/** 旧 LocationRef 到空间地址的只读解析；无法确认时返回 null。 */
export function legacyLocationRefToSpatialAddress(
  location: LocationRef,
  state: SpatialState,
): SpatialAddress | null {
  const candidateIds = [location.venueId, location.nodeId].filter((id): id is string => !!id);
  const nodeId = candidateIds.find((id) => !!state.nodes[id]);
  if (candidateIds.length > 0 && !nodeId) return null;
  if (nodeId) {
    return {
      nodeId,
      coordinate: location.hexPos ? coordinateFromHex(location.hexPos) : undefined,
      occupancy: 'stationary',
    };
  }
  const localArea = localAreaForContinent(state, location.continentId);
  if (!localArea) return null;
  return {
    nodeId: localArea,
    coordinate: location.hexPos ? coordinateFromHex(location.hexPos) : undefined,
    occupancy: 'stationary',
  };
}

/** 旧玩家地图状态到统一地址的适配，不产生旅行或移动事实。 */
export function legacyPlayerMapStateToSpatialAddress(
  mapState: PlayerMapState,
  state: SpatialState,
): SpatialAddress | null {
  const continentId = canonicalContinentId(mapState.activeContinentId);
  if (mapState.activeVenueId && state.nodes[mapState.activeVenueId]) {
    return { nodeId: mapState.activeVenueId, occupancy: 'stationary' };
  }
  const localArea = localAreaForContinent(state, continentId);
  if (!localArea) return null;
  return { nodeId: localArea, coordinate: coordinateFromHex(mapState.hexPos), occupancy: 'stationary' };
}

/** 旧 NPC locationId 优先解析真实场所/节点，无处可落时才回退到已有 hex 的 LocalArea。 */
export function legacyNpcRecordToSpatialAddress(
  npc: NpcRecord,
  state: SpatialState,
): SpatialAddress | null {
  if (npc.locationId && state.nodes[npc.locationId]) {
    return {
      nodeId: npc.locationId,
      coordinate: npc.hexPos ? coordinateFromHex(npc.hexPos) : undefined,
      occupancy: 'stationary',
    };
  }
  if (npc.hexPos) {
    const localArea = localAreaForContinent(state, 'CONT_EAST');
    if (localArea) return { nodeId: localArea, coordinate: coordinateFromHex(npc.hexPos), occupancy: 'stationary' };
  }
  return null;
}

function assertSpatialState(state: SpatialState): void {
  const violations = validateSpatialState(state);
  if (violations.length > 0) {
    throw new Error(`空间存档无法安全加载: ${violations.map((v) => v.message).join('; ')}`);
  }
}

/**
 * schema v9 的加载边界适配器。contracts 负责版本链，engine 负责真实地图目录解析。
 * 旧 locationId/hexPos 原样保留，新增地址只作为正式路径的单一候选来源。
 */
export function migrateLegacySpatialSavePayload(payload: SavePayload): SavePayload {
  const worldState = payload.worldState;
  const state = reconcileSpatialCatalog(worldState.spatialState ?? createLegacySpatialState());
  assertSpatialState(state);
  worldState.spatialState = state;

  const mapState = payload.playerMapState ?? createInitialMapState();
  const playerAddress = payload.player.spatialAddress ?? legacyPlayerMapStateToSpatialAddress(mapState, state);
  if (!playerAddress) throw new Error('玩家旧位置无法解析到权威空间树');
  payload.player.spatialAddress = playerAddress;

  for (const npc of Object.values(worldState.npcs)) {
    if (npc.spatialAddress) continue;
    const address = legacyNpcRecordToSpatialAddress(npc, state);
    if (address) npc.spatialAddress = address;
  }
  for (const npc of Object.values(worldState.archivedNpcs ?? {})) {
    if (npc.spatialAddress) continue;
    const address = legacyNpcRecordToSpatialAddress(npc, state);
    if (address) npc.spatialAddress = address;
  }
  return payload;
}
