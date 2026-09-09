// ============================================================
// 权威空间旅行服务 — 动态空间世界 Phase 2
//
// 旅行是连续状态，不是 UI 的一次性传送。路线、距离、速度快照、
// 开始/预计抵达时刻都写入 TravelState；时间推进器只负责让它前进。
// ============================================================

import type {
  MovementMode,
  SpatialAddress,
  SpatialHexCoordinate,
  SpatialLink,
  SpatialState,
  TravelRouteSegment,
  TravelState,
} from '@taosim/contracts';

export const MINUTES_PER_DAY = 1_440;

export interface TravelSpeedProfile {
  /** 空间连接距离单位/天。地图目录中的旧 distanceDays 直接使用该单位。 */
  baseDistancePerDay: number;
  movementMultiplier?: number;
  terrainMultiplier?: number;
  conditionMultiplier?: number;
  groupMultiplier?: number;
}

export interface PlanSpatialTravelRequest {
  travelId: string;
  entityId: string;
  origin: SpatialAddress;
  destination: SpatialAddress;
  movementMode: MovementMode;
  speed: TravelSpeedProfile;
  nowMinutes: number;
  /** 同一 LocalArea 内的格点移动可由调用方提供精确距离。 */
  distanceOverride?: number;
  /** 调用方已按真实局部地形解析的分段路径；不会注册为世界道路。 */
  routeOverride?: TravelRouteSegment[];
}

export type TravelPlanResult =
  | { ok: true; travel: TravelState }
  | { ok: false; reason: 'missing_origin' | 'missing_destination' | 'no_route' | 'invalid_distance' | 'invalid_speed' };

const ROUTE_CACHE = new WeakMap<object, Map<string, TravelRouteSegment[] | null>>();
const MAX_ROUTE_CACHE_ENTRIES_PER_STATE = 2_048;

export function effectiveTravelSpeed(profile: TravelSpeedProfile): number {
  const multipliers = [
    profile.movementMultiplier ?? 1,
    profile.terrainMultiplier ?? 1,
    profile.conditionMultiplier ?? 1,
    profile.groupMultiplier ?? 1,
  ];
  return profile.baseDistancePerDay * multipliers.reduce((total, value) => total * value, 1);
}

/**
 * 解析确定性最短路线。具体场所没有道路时沿包含树上溯到最近可连通节点，
 * 但最终 TravelState 仍保留具体 origin/destination 地址。
 */
export function findSpatialRoute(
  state: SpatialState,
  originNodeId: string,
  destinationNodeId: string,
  nowMinutes = 0,
): TravelRouteSegment[] | null {
  const cacheKey = `${state.revision}|${nowMinutes}|${originNodeId}|${destinationNodeId}`;
  let cache = ROUTE_CACHE.get(state);
  if (!cache) {
    cache = new Map();
    ROUTE_CACHE.set(state, cache);
  }
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey)!;
    return cached ? cached.map((segment) => ({ ...segment })) : null;
  }
  // 同一个 WorldState 可连续演算数百年；nowMinutes 属于缓存键，必须限制
  // 外部 WeakMap 中单个存活世界的历史路线数量，避免长期快进持续占用内存。
  if (cache.size >= MAX_ROUTE_CACHE_ENTRIES_PER_STATE) cache.clear();

  const start = nearestConnectedNode(state, originNodeId, nowMinutes);
  const goal = nearestConnectedNode(state, destinationNodeId, nowMinutes);
  if (!start || !goal) {
    cache.set(cacheKey, null);
    return null;
  }
  if (start === goal) {
    cache.set(cacheKey, []);
    return [];
  }

  const distance = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, { nodeId: string; link: SpatialLink }>();
  const visited = new Set<string>();

  while (true) {
    let current: string | undefined;
    let currentDistance = Number.POSITIVE_INFINITY;
    for (const [nodeId, value] of distance) {
      if (!visited.has(nodeId) && value < currentDistance) {
        current = nodeId;
        currentDistance = value;
      }
    }
    if (!current) break;
    if (current === goal) break;
    visited.add(current);

    for (const link of activeLinksFrom(state, current, nowMinutes)) {
      const next = link.fromNodeId === current ? link.toNodeId : link.fromNodeId;
      const candidate = currentDistance + link.distance;
      const previousDistance = distance.get(next);
      if (previousDistance === undefined || candidate < previousDistance
        || (candidate === previousDistance && link.id < (previous.get(next)?.link.id ?? '\uffff'))) {
        distance.set(next, candidate);
        previous.set(next, { nodeId: current, link });
      }
    }
  }

  if (!distance.has(goal)) {
    cache.set(cacheKey, null);
    return null;
  }
  const route: TravelRouteSegment[] = [];
  let cursor = goal;
  while (cursor !== start) {
    const step = previous.get(cursor);
    if (!step) {
      cache.set(cacheKey, null);
      return null;
    }
    route.unshift({
      linkId: step.link.id,
      fromNodeId: step.nodeId,
      toNodeId: cursor,
      distance: step.link.distance,
      kind: 'spatial_link',
    });
    cursor = step.nodeId;
  }
  cache.set(cacheKey, route.map((segment) => ({ ...segment })));
  return route;
}

export function planSpatialTravel(
  state: SpatialState,
  request: PlanSpatialTravelRequest,
): TravelPlanResult {
  if (!state.nodes[request.origin.nodeId]) return { ok: false, reason: 'missing_origin' };
  if (!state.nodes[request.destination.nodeId]) return { ok: false, reason: 'missing_destination' };
  const speed = effectiveTravelSpeed(request.speed);
  if (!Number.isFinite(speed) || speed <= 0) return { ok: false, reason: 'invalid_speed' };

  const route = request.routeOverride
    ? request.routeOverride.map((segment) => ({ ...segment }))
    : request.distanceOverride === undefined
      ? findSpatialRoute(state, request.origin.nodeId, request.destination.nodeId, request.nowMinutes)
      : [];
  if (!route) return { ok: false, reason: 'no_route' };
  if (route.some((segment) => !Number.isFinite(segment.distance) || segment.distance <= 0)) {
    return { ok: false, reason: 'invalid_distance' };
  }
  const totalDistance = request.distanceOverride ?? route.reduce((sum, segment) => sum + segment.distance, 0);
  if (!Number.isFinite(totalDistance) || totalDistance < 0) return { ok: false, reason: 'invalid_distance' };

  const durationMinutes = totalDistance === 0 ? 0 : Math.ceil((totalDistance / speed) * MINUTES_PER_DAY);
  const estimatedArrivalAtMinutes = request.nowMinutes + durationMinutes;
  const status = totalDistance === 0 ? 'arrived' : 'in_transit';
  return {
    ok: true,
    travel: {
      travelId: request.travelId,
      entityId: request.entityId,
      origin: { ...request.origin, occupancy: 'traveling' },
      destination: { ...request.destination, occupancy: 'stationary' },
      route,
      totalDistance,
      remainingDistance: totalDistance,
      distanceTraveled: 0,
      currentSegmentIndex: 0,
      distanceOnCurrentSegment: 0,
      lastAdvancedAtMinutes: request.nowMinutes,
      planGeneration: 1,
      movementMode: request.movementMode,
      speed,
      startedAtMinutes: request.nowMinutes,
      estimatedArrivalAtMinutes,
      nextCheckpointAtMinutes: firstCheckpointAt(route, speed, request.nowMinutes, estimatedArrivalAtMinutes),
      routeRevision: state.revision,
      status,
      interruptionReasons: [],
      encounteredFactIds: [],
    },
  };
}

/** 根据统一绝对时间推进旅行，不直接修改空间目录。 */
export function advanceSpatialTravel(travel: TravelState, atMinutes: number): TravelState {
  if (travel.status !== 'in_transit') return { ...travel };
  const previousDistance = normalizedDistanceTraveled(travel);
  const lastAdvancedAtMinutes = normalizedLastAdvancedAt(travel, previousDistance);
  const elapsedMinutes = Math.max(0, atMinutes - lastAdvancedAtMinutes);
  const traveledDistance = Math.min(
    travel.totalDistance,
    previousDistance + (elapsedMinutes / MINUTES_PER_DAY) * travel.speed,
  );
  const arrived = atMinutes >= travel.estimatedArrivalAtMinutes || traveledDistance >= travel.totalDistance;
  const cursor = locateTravelCursor(travel.route, traveledDistance);
  const remainingDistance = Math.max(0, travel.totalDistance - traveledDistance);
  // 连续行进期间 ETA 是计划锚点，不能每个小步用浮点剩余距离重新 ceil，
  // 否则 96×15 分钟会比一次推进一天多漂移一分钟，破坏分段等价。
  const estimatedArrivalAtMinutes = travel.estimatedArrivalAtMinutes;
  return {
    ...travel,
    remainingDistance,
    distanceTraveled: traveledDistance,
    currentSegmentIndex: cursor.segmentIndex,
    distanceOnCurrentSegment: cursor.distanceOnSegment,
    lastAdvancedAtMinutes: atMinutes,
    estimatedArrivalAtMinutes,
    nextCheckpointAtMinutes: arrived
      ? atMinutes
      : nextCheckpointAt(travel.route, cursor, travel.speed, atMinutes, estimatedArrivalAtMinutes),
    status: arrived ? 'arrived' : 'in_transit',
  };
}

export function isTravelRouteValid(state: SpatialState, travel: TravelState, nowMinutes: number): boolean {
  const firstRemainingSegment = Math.max(0, travel.currentSegmentIndex ?? 0);
  return travel.route.slice(firstRemainingSegment).every((segment) => {
    if (segment.kind === 'local_path') {
      return !!state.nodes[segment.fromNodeId] && !!state.nodes[segment.toNodeId];
    }
    const link = state.links[segment.linkId];
    return !!link
      && link.status === 'active'
      && activeAt(link, nowMinutes)
      && ((link.fromNodeId === segment.fromNodeId && link.toNodeId === segment.toNodeId)
        || (link.bidirectional && link.fromNodeId === segment.toNodeId && link.toNodeId === segment.fromNodeId));
  });
}

export interface TravelPosition {
  address: SpatialAddress;
  segmentIndex: number;
  segmentProgress: number;
  fromNodeId: string;
  toNodeId: string;
}

/** 统一供规则、感知和 UI 使用的途中位置求值。 */
export function evaluateSpatialTravelPosition(travel: TravelState): TravelPosition {
  const distanceTraveled = normalizedDistanceTraveled(travel);
  const cursor = locateTravelCursor(travel.route, distanceTraveled);
  const segment = travel.route[cursor.segmentIndex];
  if (!segment) {
    const progress = travel.totalDistance > 0 ? distanceTraveled / travel.totalDistance : 1;
    return {
      address: {
        ...(progress >= 1 ? travel.destination : travel.origin),
        coordinate: interpolateCoordinate(travel.origin.coordinate, travel.destination.coordinate, progress),
        occupancy: progress >= 1 ? 'stationary' : 'traveling',
      },
      segmentIndex: cursor.segmentIndex,
      segmentProgress: progress,
      fromNodeId: travel.origin.nodeId,
      toNodeId: travel.destination.nodeId,
    };
  }
  const segmentProgress = Math.max(0, Math.min(1, cursor.distanceOnSegment / segment.distance));
  const coordinate = interpolateCoordinate(segment.fromCoordinate, segment.toCoordinate, segmentProgress);
  return {
    address: {
      nodeId: segmentProgress >= 1 ? segment.toNodeId : segment.fromNodeId,
      coordinate,
      occupancy: 'traveling',
    },
    segmentIndex: cursor.segmentIndex,
    segmentProgress,
    fromNodeId: segment.fromNodeId,
    toNodeId: segment.toNodeId,
  };
}

export function pauseSpatialTravel(travel: TravelState, atMinutes: number): TravelState {
  const advanced = advanceSpatialTravel(travel, atMinutes);
  if (advanced.status !== 'in_transit') return advanced;
  return {
    ...advanced,
    status: 'paused',
    pausedAtMinutes: atMinutes,
    nextCheckpointAtMinutes: atMinutes,
    planGeneration: (advanced.planGeneration ?? 1) + 1,
  };
}

export function resumeSpatialTravel(travel: TravelState, atMinutes: number): TravelState {
  // “暂停”是玩家主动冻结，可以原路继续；“受阻”说明剩余路线已经失效，
  // 必须显式重规划或折返，不能借恢复操作穿过已封闭的连接。
  if (travel.status !== 'paused') return { ...travel };
  const distanceTraveled = normalizedDistanceTraveled(travel);
  const cursor = locateTravelCursor(travel.route, distanceTraveled);
  const remainingDistance = Math.max(0, travel.totalDistance - distanceTraveled);
  const estimatedArrivalAtMinutes = atMinutes + minutesForDistance(remainingDistance, travel.speed);
  return {
    ...travel,
    status: remainingDistance <= 0 ? 'arrived' : 'in_transit',
    pausedAtMinutes: undefined,
    lastAdvancedAtMinutes: atMinutes,
    estimatedArrivalAtMinutes,
    nextCheckpointAtMinutes: remainingDistance <= 0
      ? atMinutes
      : nextCheckpointAt(travel.route, cursor, travel.speed, atMinutes, estimatedArrivalAtMinutes),
    planGeneration: (travel.planGeneration ?? 1) + 1,
  };
}

/** 从已经走到的真实位置折返；不会返还已经消耗的世界时间。 */
export function reverseSpatialTravel(travel: TravelState, atMinutes: number): TravelState {
  const advanced = travel.status === 'in_transit' ? advanceSpatialTravel(travel, atMinutes) : travel;
  const distanceTraveled = normalizedDistanceTraveled(advanced);
  if (distanceTraveled <= 0 || advanced.status === 'arrived' || advanced.status === 'cancelled') {
    return { ...advanced };
  }
  const position = evaluateSpatialTravelPosition(advanced);
  const cursor = locateTravelCursor(advanced.route, distanceTraveled);
  const reversed: TravelRouteSegment[] = [];
  const current = advanced.route[cursor.segmentIndex];
  if (current && cursor.distanceOnSegment > 0) {
    reversed.push({
      ...current,
      fromNodeId: position.address.nodeId,
      toNodeId: current.fromNodeId,
      distance: cursor.distanceOnSegment,
      fromCoordinate: position.address.coordinate,
      toCoordinate: current.fromCoordinate,
    });
  }
  for (let index = cursor.segmentIndex - 1; index >= 0; index--) {
    const segment = advanced.route[index]!;
    reversed.push({
      ...segment,
      fromNodeId: segment.toNodeId,
      toNodeId: segment.fromNodeId,
      fromCoordinate: segment.toCoordinate,
      toCoordinate: segment.fromCoordinate,
    });
  }
  const totalDistance = reversed.reduce((sum, segment) => sum + segment.distance, 0);
  const estimatedArrivalAtMinutes = atMinutes + minutesForDistance(totalDistance, advanced.speed);
  return {
    ...advanced,
    travelId: `${advanced.travelId}:return:${atMinutes}`,
    origin: { ...position.address, occupancy: 'traveling' },
    destination: { ...advanced.origin, occupancy: 'stationary' },
    route: reversed,
    totalDistance,
    remainingDistance: totalDistance,
    distanceTraveled: 0,
    currentSegmentIndex: 0,
    distanceOnCurrentSegment: 0,
    lastAdvancedAtMinutes: atMinutes,
    estimatedArrivalAtMinutes,
    nextCheckpointAtMinutes: firstCheckpointAt(reversed, advanced.speed, atMinutes, estimatedArrivalAtMinutes),
    status: totalDistance <= 0 ? 'arrived' : 'in_transit',
    pausedAtMinutes: undefined,
    planGeneration: (advanced.planGeneration ?? 1) + 1,
  };
}

function normalizedDistanceTraveled(travel: TravelState): number {
  return Math.max(0, Math.min(
    travel.totalDistance,
    travel.distanceTraveled ?? travel.totalDistance - travel.remainingDistance,
  ));
}

function normalizedLastAdvancedAt(travel: TravelState, distanceTraveled: number): number {
  if (travel.lastAdvancedAtMinutes !== undefined) return travel.lastAdvancedAtMinutes;
  return travel.startedAtMinutes + minutesForDistance(distanceTraveled, travel.speed);
}

function minutesForDistance(distance: number, speed: number): number {
  return distance <= 0 ? 0 : Math.ceil((distance / speed) * MINUTES_PER_DAY);
}

function locateTravelCursor(
  route: TravelRouteSegment[],
  distanceTraveled: number,
): { segmentIndex: number; distanceOnSegment: number } {
  let remaining = Math.max(0, distanceTraveled);
  for (let index = 0; index < route.length; index++) {
    const segment = route[index]!;
    if (remaining < segment.distance) return { segmentIndex: index, distanceOnSegment: remaining };
    remaining -= segment.distance;
  }
  return { segmentIndex: route.length, distanceOnSegment: 0 };
}

function firstCheckpointAt(
  route: TravelRouteSegment[],
  speed: number,
  nowMinutes: number,
  fallback: number,
): number {
  return route[0] ? nowMinutes + minutesForDistance(route[0].distance, speed) : fallback;
}

function nextCheckpointAt(
  route: TravelRouteSegment[],
  cursor: { segmentIndex: number; distanceOnSegment: number },
  speed: number,
  nowMinutes: number,
  fallback: number,
): number {
  const segment = route[cursor.segmentIndex];
  if (!segment) return fallback;
  return nowMinutes + minutesForDistance(segment.distance - cursor.distanceOnSegment, speed);
}

function interpolateCoordinate(
  from: SpatialAddress['coordinate'],
  to: SpatialAddress['coordinate'],
  progress: number,
): SpatialAddress['coordinate'] {
  if (!from || !to) return from ?? to;
  if ('q' in from && 'q' in to) {
    return { q: from.q + (to.q - from.q) * progress, r: from.r + (to.r - from.r) * progress };
  }
  if ('x' in from && 'x' in to) {
    return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
  }
  return from;
}

function nearestConnectedNode(state: SpatialState, nodeId: string, nowMinutes: number): string | null {
  let current: string | undefined = nodeId;
  const visited = new Set<string>();
  while (current && !visited.has(current)) {
    visited.add(current);
    if (activeLinksFrom(state, current, nowMinutes).length > 0) return current;
    current = state.nodes[current]?.parentId;
  }
  return current && state.nodes[current] ? current : null;
}

function activeLinksFrom(state: SpatialState, nodeId: string, nowMinutes: number): SpatialLink[] {
  return Object.values(state.links)
    .filter((link) => link.status === 'active' && activeAt(link, nowMinutes)
      && (link.fromNodeId === nodeId || (link.bidirectional && link.toNodeId === nodeId)))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function activeAt(link: SpatialLink, nowMinutes: number): boolean {
  return (link.enabledFromMinutes === undefined || nowMinutes >= link.enabledFromMinutes)
    && (link.disabledAtMinutes === undefined || nowMinutes < link.disabledAtMinutes);
}

/** 轴坐标 q/r 的六边形距离；用于同一 LocalArea 内的真实格点移动。 */
export function hexCoordinateDistance(from: SpatialHexCoordinate, to: SpatialHexCoordinate): number {
  const fromS = -from.q - from.r;
  const toS = -to.q - to.r;
  return Math.max(Math.abs(from.q - to.q), Math.abs(from.r - to.r), Math.abs(fromS - toS));
}
