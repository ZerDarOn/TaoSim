// ============================================================
// 权威空间契约 — 动态空间世界 Phase 1
//
// 领域空间由包含树、连接图和动态覆盖层组成。MapLayer 仍是 UI
// 兼容类型，不再承担领域空间层级职责。
// ============================================================

export type SpatialNodeKind =
  | 'Plane'
  | 'Cosmos'
  | 'Continent'
  | 'Region'
  | 'LocalArea'
  | 'Site'
  | 'Settlement'
  | 'Sect'
  | 'Wilderness'
  | 'Ruin'
  | 'ResourceSite'
  | 'Venue'
  | 'Interior'
  | 'Scene'
  | 'PocketRealm';

export type SpatialNodeStatus = 'active' | 'disabled' | 'archived';
export type SpatialCoordinateUnit = 'hex' | 'days' | 'meters' | 'abstract';

export interface SpatialCoordinateScale {
  unit: SpatialCoordinateUnit;
  /** 一个坐标单位对应的领域距离；禁止把格子隐式解释为一天。 */
  unitsPerWorldUnit: number;
}

export interface SpatialPoint {
  x: number;
  y: number;
}

export interface SpatialHexCoordinate {
  q: number;
  r: number;
}

export interface SpatialNode {
  id: string;
  name: string;
  kind: SpatialNodeKind;
  parentId?: string;
  coordinateScale: SpatialCoordinateScale;
  anchor?: SpatialPoint;
  bounds?: { min: SpatialPoint; max: SpatialPoint };
  status: SpatialNodeStatus;
  containsChildren: boolean;
  createdAtMinutes?: number;
  createdByFactId?: string;
  changedByFactId?: string;
  archivedAtMinutes?: number;
}

export type SpatialLinkKind =
  | 'road'
  | 'river'
  | 'mountain_pass'
  | 'gate'
  | 'portal'
  | 'rift'
  | 'teleport'
  | 'boundary';

export interface SpatialLink {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: SpatialLinkKind;
  distance: number;
  bidirectional: boolean;
  status: 'active' | 'blocked' | 'archived';
  requiredRealm?: string;
  enabledFromMinutes?: number;
  disabledAtMinutes?: number;
  createdByFactId?: string;
  changedByFactId?: string;
}

export type SpatialOccupancy = 'stationary' | 'traveling' | 'scene';

export interface SpatialAddress {
  /** 当前具体空间节点；祖先路径从 SpatialState 重建。 */
  nodeId: string;
  coordinate?: SpatialHexCoordinate | SpatialPoint;
  /** 高度/空间层，仅在领域规则需要时使用。 */
  layer?: string;
  occupancy: SpatialOccupancy;
}

export type TravelStatus = 'planned' | 'in_transit' | 'paused' | 'interrupted' | 'arrived' | 'cancelled';

export type MovementMode = 'walk' | 'ride' | 'fly' | 'escort' | 'teleport' | 'portal' | 'other';

export interface TravelRouteSegment {
  linkId: string;
  fromNodeId: string;
  toNodeId: string;
  distance: number;
  /** 局部地图路径不会污染世界连接图，但仍保存每一段真实坐标。 */
  kind?: 'spatial_link' | 'local_path';
  fromCoordinate?: SpatialHexCoordinate | SpatialPoint;
  toCoordinate?: SpatialHexCoordinate | SpatialPoint;
}

export interface TravelState {
  travelId: string;
  entityId: string;
  origin: SpatialAddress;
  destination: SpatialAddress;
  route: TravelRouteSegment[];
  totalDistance: number;
  remainingDistance: number;
  /** 已实际走过的距离；旧 v9 存档可由 totalDistance - remainingDistance 恢复。 */
  distanceTraveled?: number;
  /** 当前所在路线段及段内距离，是途中位置的权威表达。 */
  currentSegmentIndex?: number;
  distanceOnCurrentSegment?: number;
  /** 最近一次把绝对时间结算进旅行的时刻，暂停后不再累积。 */
  lastAdvancedAtMinutes?: number;
  /** 同一 travelId 重规划/续行时递增，使旧唤醒自然失效。 */
  planGeneration?: number;
  pausedAtMinutes?: number;
  movementMode: MovementMode;
  /** 路线解析时冻结的有效速度；速度变化会触发重规划。 */
  speed: number;
  startedAtMinutes: number;
  estimatedArrivalAtMinutes: number;
  nextCheckpointAtMinutes: number;
  routeRevision: number;
  status: TravelStatus;
  interruptionReasons: string[];
  encounteredFactIds: string[];
}

export type DynamicSpatialFeatureType =
  | 'secret_realm_entrance'
  | 'rift'
  | 'barrier'
  | 'disaster_zone'
  | 'spirit_tide'
  | 'war_front';

export type SpatialFeatureLifecycle =
  | 'latent'
  | 'omen'
  | 'active'
  | 'stable'
  | 'expanding'
  | 'contested'
  | 'weakening'
  | 'sealed'
  | 'collapsing'
  | 'closed'
  | 'ruined'
  | 'archived';

export interface DynamicSpatialFeature {
  id: string;
  type: DynamicSpatialFeatureType;
  lifecycle: SpatialFeatureLifecycle;
  scope: {
    nodeIds: string[];
    center?: SpatialHexCoordinate | SpatialPoint;
    radius?: number;
  };
  createdAtMinutes: number;
  startsAtMinutes: number;
  nextTransitionAtMinutes?: number;
  endsAtMinutes?: number;
  visibility: 'public' | 'regional' | 'faction' | 'local' | 'secret';
  effects: Record<string, string | number | boolean>;
  causeFactId?: string;
  endFactId?: string;
  seed?: number;
}

export type SpatialDeltaOperation =
  | { type: 'add_node'; node: SpatialNode }
  | { type: 'patch_node'; nodeId: string; patch: Partial<SpatialNode> }
  | { type: 'add_link'; link: SpatialLink }
  | { type: 'patch_link'; linkId: string; patch: Partial<SpatialLink> }
  | { type: 'add_feature'; feature: DynamicSpatialFeature }
  | { type: 'patch_feature'; featureId: string; patch: Partial<DynamicSpatialFeature> }
  | { type: 'archive_node'; nodeId: string; archivedAtMinutes: number }
  | { type: 'archive_link'; linkId: string };

export interface SpatialDelta {
  deltaId: string;
  baseRevision: number;
  effectiveAtMinutes: number;
  reasonFactId: string;
  operations: SpatialDeltaOperation[];
  affectedEntityIds: string[];
}

export interface SpatialState {
  schemaVersion: 1;
  /** 静态空间目录版本；动态差量与归档状态不随目录升级被覆盖。 */
  catalogVersion?: number;
  baseMapId: string;
  baseMapSeed: number;
  revision: number;
  nodes: Record<string, SpatialNode>;
  links: Record<string, SpatialLink>;
  features: Record<string, DynamicSpatialFeature>;
  deltas: SpatialDelta[];
}

export interface SpatialInvariantViolation {
  code:
    | 'node_key_mismatch'
    | 'missing_parent'
    | 'containment_cycle'
    | 'invalid_coordinate_scale'
    | 'missing_link_endpoint'
    | 'invalid_link_distance'
    | 'missing_feature_scope'
    | 'invalid_feature_window';
  id?: string;
  message: string;
}

/** 返回从具体节点向上的包含路径，遇到循环时停止而不进入死循环。 */
export function resolveSpatialAncestors(state: SpatialState, nodeId: string): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  let current: string | undefined = nodeId;
  while (current && !visited.has(current)) {
    visited.add(current);
    result.push(current);
    current = state.nodes[current]?.parentId;
  }
  return result;
}

/** 运行时写入前的空间一致性检查；不修改输入状态。 */
export function validateSpatialState(state: SpatialState): SpatialInvariantViolation[] {
  const violations: SpatialInvariantViolation[] = [];
  for (const [key, node] of Object.entries(state.nodes)) {
    if (key !== node.id) {
      violations.push({ code: 'node_key_mismatch', id: key, message: `空间节点 key 与 id 不一致: ${key}` });
    }
    if (node.parentId && !state.nodes[node.parentId]) {
      violations.push({ code: 'missing_parent', id: node.id, message: `空间节点父级不存在: ${node.id} → ${node.parentId}` });
    }
    if (!Number.isFinite(node.coordinateScale.unitsPerWorldUnit)
      || node.coordinateScale.unitsPerWorldUnit <= 0) {
      violations.push({ code: 'invalid_coordinate_scale', id: node.id, message: `空间节点尺度无效: ${node.id}` });
    }
    if (hasContainmentCycle(state, node.id)) {
      violations.push({ code: 'containment_cycle', id: node.id, message: `空间包含关系成环: ${node.id}` });
    }
  }
  for (const [key, link] of Object.entries(state.links)) {
    if (!state.nodes[link.fromNodeId] || !state.nodes[link.toNodeId]) {
      violations.push({ code: 'missing_link_endpoint', id: key, message: `空间连接端点不存在: ${key}` });
    }
    if (!Number.isFinite(link.distance) || link.distance <= 0) {
      violations.push({ code: 'invalid_link_distance', id: key, message: `空间连接距离无效: ${key}` });
    }
  }
  for (const [key, feature] of Object.entries(state.features)) {
    if (key !== feature.id || feature.scope.nodeIds.some((id) => !state.nodes[id])) {
      violations.push({ code: 'missing_feature_scope', id: key, message: `动态空间特征范围不存在: ${key}` });
    }
    if (feature.nextTransitionAtMinutes !== undefined
      && feature.nextTransitionAtMinutes < feature.startsAtMinutes) {
      violations.push({ code: 'invalid_feature_window', id: key, message: `动态空间特征时间窗无效: ${key}` });
    }
  }
  return violations;
}

function hasContainmentCycle(state: SpatialState, nodeId: string): boolean {
  const visited = new Set<string>();
  let current: string | undefined = nodeId;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = state.nodes[current]?.parentId;
  }
  return false;
}
