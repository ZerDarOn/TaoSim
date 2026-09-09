<script setup lang="ts">
/**
 * MapPanel — 多层地图面板
 *
 * 四个层级视图：
 * - Cosmos  : SVG 星图（星系 + 传送路线）
 * - Continent: SVG 大陆图（大陆 + 传送路线）
 * - Region  : 六边形网格（探索 + 移动）
 * - Venue   : 委托给 VenuePanel
 *
 * 状态全部来自 mapStore（Pinia + localStorage），切 tab 不丢失。
 */
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { useMapStore } from '@/stores/map';
import {
  generateWorldGrid, findPath, findLandmarkPos,
  getHexNeighbors, hexDistance, TERRAIN_INFO,
  applyExploredCache, collectExplored,
  COSMOS_CATALOG, CONTINENT_CATALOG, TELEPORT_GRAPH,
  getTeleportNodeAt, getContinent, getCosmos,
  TravelService, VenueService,
  planSpatialTravel,
  advanceSpatialTravel,
  evaluateSpatialTravelPosition,
  pauseSpatialTravel,
  resumeSpatialTravel,
  reverseSpatialTravel,
  npcSpatialIndex,
  pickNearbyNpc, expandForScene,
  projectTime, MINUTES_PER_DAY,
  getSettlement,
  chooseRoadEncounter,
  type WorldHexGrid, type WorldHex, type HexTerrain, type HexMoveEvent,
} from '@taosim/engine';
import { resolveSpatialAncestors } from '@taosim/contracts';
import type { ActiveWorldEncounter, Character, DynamicSpatialFeature, MapLayer, NpcRecord, PlayerEncounterChoice } from '@taosim/contracts';
import type { AdventureEvent } from '@taosim/engine';
import type { SettlementNode } from '@taosim/engine';
import { formatRealm, formatNodeType, formatItemId } from '@/utils/i18n-game';
import { useAppStore } from '@/stores/app';
import { useWorld } from '@/composables/useWorld';
import { createGameSnapshot } from '@/utils/game-snapshot';
import { resolvePlayerHexProjection } from '@/utils/player-spatial-projection';
import {
  clampMapZoom,
  semanticMapScale,
  shouldProjectNpcRoute,
  zoomViewportAt,
} from '@/utils/map-observation-projection';
import AdventureEventCard from './AdventureEventCard.vue';
import VenuePanel from './VenuePanel.vue';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const mapStore = useMapStore();
const appStore = useAppStore();
const { travelAdvanceDays, advanceMinutes, stopRealtime } = useWorld();

// ---- 当前层级 ----
const activeLayer = computed(() => mapStore.activeLayer);

const layerBreadcrumb = computed(() => {
  const cosmos = getCosmos(mapStore.activeCosmosId);
  const continent = getContinent(mapStore.activeContinentId);
  return [
    { layer: 'Cosmos' as MapLayer, name: cosmos?.name ?? '星系' },
    { layer: 'Continent' as MapLayer, name: continent?.name ?? '大陆' },
    { layer: 'Region' as MapLayer, name: '区域' },
    ...(mapStore.focusedSpatialNodeId && activeLayer.value !== 'Region'
      ? [{ layer: 'Settlement' as MapLayer, name: getSettlement(mapStore.focusedSpatialNodeId)?.name ?? '局部地图' }]
      : []),
    ...(mapStore.activeVenueId ? [{ layer: 'Venue' as MapLayer, name: '场所' }] : []),
  ];
});

function switchLayer(layer: MapLayer) {
  if (layer === 'Region') {
    mapStore.leaveSpatialDetail();
    return;
  }
  mapStore.setActiveLayer(layer);
}

// ============================================================
// Region 层 — 六边形网格
// ============================================================

// 网格实例：按 continentId 缓存（切大陆时重建）
const gridCache = new Map<string, WorldHexGrid>();
const worldGrid = ref<WorldHexGrid>(getOrCreateGrid(mapStore.activeContinentId));

function getOrCreateGrid(continentId: string): WorldHexGrid {
  let g = gridCache.get(continentId);
  if (!g) {
    g = generateWorldGrid(continentId);
    // 应用已探索缓存
    const exploredKeys = mapStore.getExploredHexes(continentId);
    applyExploredCache(g, exploredKeys);
    gridCache.set(continentId, g);
  }
  return g;
}

// 玩家网格位置
const playerHexPos = ref({ q: mapStore.hexPos.q, r: mapStore.hexPos.r });

// 初始化：权威空间地址优先；地图缓存仅用于无法投影的旧状态/浏览状态。
onMounted(() => {
  syncPlayerMapProjection();
  restoreViewport();
});

// 切换大陆时重建网格；只有角色确实位于该大陆时才投影权威位置。
watch(() => mapStore.activeContinentId, (newId) => {
  worldGrid.value = getOrCreateGrid(newId);
  playerHexPos.value = { q: mapStore.hexPos.q, r: mapStore.hexPos.r };
  syncPlayerMapProjection();
  restoreViewport();
});

// 游戏内读档会替换 Character；组件未卸载时也必须立即刷新观察投影。
watch(() => {
  const address = playerStore.character?.spatialAddress;
  const coordinate = address?.coordinate;
  const coordinateKey = coordinate && 'q' in coordinate && 'r' in coordinate
    ? `${coordinate.q},${coordinate.r}`
    : coordinate && 'x' in coordinate && 'y' in coordinate
      ? `${coordinate.x},${coordinate.y}`
      : '';
  return `${address?.nodeId ?? ''}|${address?.occupancy ?? ''}|${coordinateKey}|${playerStore.character?.travel?.travelId ?? ''}`;
}, () => syncPlayerMapProjection());

function syncPlayerMapProjection() {
  const address = playerStore.character?.spatialAddress;
  const belongsToViewedContinent = !address || addressBelongsToActiveContinent(address.nodeId);
  const projection = resolvePlayerHexProjection(
    belongsToViewedContinent ? address : undefined,
    mapStore.hexPos,
    (nodeId) => findLandmarkPos(worldGrid.value, nodeId),
  );

  playerHexPos.value = projection.position;
  if (projection.position.q !== mapStore.hexPos.q || projection.position.r !== mapStore.hexPos.r) {
    mapStore.setHexPos(projection.position);
  }
  if (address) playerStore.setCurrentNode(address.nodeId);
  markExploredAround(projection.position.q, projection.position.r);
}

function markExploredAround(q: number, r: number) {
  const positions = [{ q, r }, ...getHexNeighbors(q, r)];
  // 直接标记到网格
  for (const p of positions) {
    const hex = worldGrid.value.hexes.get(`${p.q},${p.r}`);
    if (hex) hex.explored = true;
  }
  // 同步到 store
  mapStore.markExplored(mapStore.activeContinentId, positions);
}

// ---- 事件状态 ----
const message = ref<string | null>(null);
const moveLog = ref<HexMoveEvent[]>([]);
const pendingNpc = ref<Character | null>(null);
const pendingBattle = ref<HexMoveEvent | null>(null);
const pendingAdventure = ref<AdventureEvent | null>(null);
const pendingPath = ref<Array<{ q: number; r: number }> | null>(null);
const selectedHexPos = ref<{ q: number; r: number } | null>(null);
const selectedNpcId = ref<string | null>(null);
const hoveredNpcId = ref<string | null>(null);
const npcSearch = ref('');
const godInterventionMessage = ref<string | null>(null);
const isGodObserver = computed(() => playerStore.character?.entryProfile?.mode === 'god');
const observationPreferences = computed(() => mapStore.observationPreferences);
const currentPlayerTravel = computed(() => {
  const travel = playerStore.character?.travel;
  return travel && !['arrived', 'cancelled'].includes(travel.status) ? travel : null;
});
const activeRoadEncounter = computed<ActiveWorldEncounter | null>(() => {
  const playerId = playerStore.character?.id;
  if (!playerId) return null;
  return Object.values(appStore.currentWorldState?.activeEncounters ?? {})
    .find((encounter) => encounter.playerId === playerId
      && (encounter.status === 'awaiting_decision' || encounter.status === 'active')) ?? null;
});
const activeRoadEncounterNpc = computed(() => {
  const encounter = activeRoadEncounter.value;
  return encounter ? appStore.currentWorldState?.npcs[encounter.initiatorNpcId] ?? null : null;
});
const travelRemainingMinutes = computed(() => {
  const travel = currentPlayerTravel.value;
  const now = appStore.currentWorldState?.elapsedMinutes ?? 0;
  return travel ? Math.max(0, travel.estimatedArrivalAtMinutes - now) : 0;
});
const travelProgress = computed(() => {
  const travel = currentPlayerTravel.value;
  if (!travel || travel.totalDistance <= 0) return 100;
  return Math.max(0, Math.min(100, ((travel.totalDistance - travel.remainingDistance) / travel.totalDistance) * 100));
});
const travelRemainingSegmentCount = computed(() => {
  const travel = currentPlayerTravel.value;
  if (!travel) return 0;
  return Math.max(0, travel.route.length - (travel.currentSegmentIndex ?? 0));
});

function persistedLocalTravelPath(): Array<{ q: number; r: number }> {
  const travel = currentPlayerTravel.value;
  if (!travel) return [];
  return travel.route.flatMap((segment) => {
    const coordinate = segment.toCoordinate;
    return coordinate && 'q' in coordinate && 'r' in coordinate
      ? [{ q: coordinate.q, r: coordinate.r }]
      : [];
  });
}

const selectedHex = computed(() => {
  if (!selectedHexPos.value) return null;
  return worldGrid.value.hexes.get(`${selectedHexPos.value.q},${selectedHexPos.value.r}`) ?? null;
});

const selectedHexIsCurrent = computed(() =>
  !!selectedHexPos.value && isPlayerHere(selectedHexPos.value.q, selectedHexPos.value.r),
);

// ---- 地图拖动平移 ----
const savedViewport = mapStore.getViewport(mapStore.activeContinentId);
const panOffset = ref(savedViewport?.pan ?? { x: 0, y: 0 });
const mapZoom = ref(clampMapZoom(savedViewport?.zoom ?? 1));
const mapViewport = ref<HTMLElement | null>(null);
const semanticScale = computed(() => semanticMapScale(mapZoom.value));
const semanticScaleLabel = computed(() => ({
  macro: '宏观',
  region: '区域',
  place: '地点',
})[semanticScale.value]);
const isDragging = ref(false);
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };
let pointerDownActive = false;
let draggedSincePointerDown = false;
let suppressNextHexClick = false;
let viewportPersistTimer: number | null = null;
const DRAG_THRESHOLD_PX = 6;
const VIEWPORT_PERSIST_DELAY_MS = 160;

function onDragStart(e: PointerEvent) {
  // 左键只负责“选中”；超过阈值才开始平移，避免拖动地图误触移动。
  if (e.button !== 0) return;
  pointerDownActive = true;
  isDragging.value = false;
  draggedSincePointerDown = false;
  dragStart = { x: e.clientX, y: e.clientY, panX: panOffset.value.x, panY: panOffset.value.y };
}

function onDragMove(e: PointerEvent) {
  if (!pointerDownActive || (e.buttons !== 1 && !isDragging.value)) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (!isDragging.value && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
  if (!isDragging.value) {
    isDragging.value = true;
    draggedSincePointerDown = true;
    // 只有确认是拖拽后才捕获指针；pointerdown 立即捕获会吞掉格子的普通 click。
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }
  panOffset.value = { x: dragStart.panX + dx, y: dragStart.panY + dy };
}

function onDragEnd(e?: PointerEvent) {
  if (draggedSincePointerDown) {
    // pointerup 后浏览器仍会派发 click；只吞掉这一次，下一次左键照常选格。
    suppressNextHexClick = true;
    window.setTimeout(() => { suppressNextHexClick = false; }, 0);
  }
  pointerDownActive = false;
  isDragging.value = false;
  scheduleViewportPersist();
  if (e) {
    const target = e.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture?.(e.pointerId)) target.releasePointerCapture(e.pointerId);
  }
}

function restoreViewport() {
  const viewport = mapStore.getViewport(mapStore.activeContinentId);
  mapZoom.value = clampMapZoom(viewport?.zoom ?? 1);
  panOffset.value = viewport?.pan ? { ...viewport.pan } : { x: 0, y: 0 };
}

function persistViewport() {
  if (viewportPersistTimer !== null) {
    window.clearTimeout(viewportPersistTimer);
    viewportPersistTimer = null;
  }
  mapStore.setViewport(mapStore.activeContinentId, {
    zoom: mapZoom.value,
    pan: { ...panOffset.value },
  });
}

function scheduleViewportPersist() {
  if (viewportPersistTimer !== null) window.clearTimeout(viewportPersistTimer);
  viewportPersistTimer = window.setTimeout(persistViewport, VIEWPORT_PERSIST_DELAY_MS);
}

function setZoomAt(targetZoom: number, anchor?: { x: number; y: number }) {
  const viewport = mapViewport.value;
  const resolvedAnchor = anchor ?? {
    x: (viewport?.clientWidth ?? SVG_W) / 2,
    y: (viewport?.clientHeight ?? 480) / 2,
  };
  const next = zoomViewportAt(
    { zoom: mapZoom.value, pan: panOffset.value },
    targetZoom,
    resolvedAnchor,
  );
  mapZoom.value = next.zoom;
  panOffset.value = next.pan;
  scheduleViewportPersist();
  const focusedLandmark = selectedHex.value?.landmarkId ?? currentHex.value?.landmarkId;
  if (next.zoom >= 1.8 && focusedLandmark && getSettlement(focusedLandmark)) {
    selectedSettlementNodeId.value = null;
    mapStore.enterSpatialDetail(focusedLandmark);
  }
}

function zoomBy(factor: number) {
  setZoomAt(mapZoom.value * factor);
}

function onMapWheel(event: WheelEvent) {
  const bounds = mapViewport.value?.getBoundingClientRect();
  if (!bounds) return;
  const anchor = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  setZoomAt(mapZoom.value * (event.deltaY < 0 ? 1.14 : 1 / 1.14), anchor);
}

function fitMapView() {
  const viewport = mapViewport.value;
  if (!viewport) return;
  const zoom = clampMapZoom(Math.min(viewport.clientWidth / SVG_W, viewport.clientHeight / SVG_H));
  mapZoom.value = zoom;
  panOffset.value = {
    x: (viewport.clientWidth - SVG_W * zoom) / 2,
    y: (viewport.clientHeight - SVG_H * zoom) / 2,
  };
  scheduleViewportPersist();
}

function centerMapOnPlayer() {
  const viewport = mapViewport.value;
  if (!viewport) return;
  const position = hexToPixel(playerHexPos.value.q, playerHexPos.value.r);
  panOffset.value = {
    x: viewport.clientWidth / 2 - position.x * mapZoom.value,
    y: viewport.clientHeight / 2 - position.y * mapZoom.value,
  };
  scheduleViewportPersist();
}

onBeforeUnmount(() => {
  if (viewportPersistTimer !== null) persistViewport();
});

// ---- 地图渲染辅助 ----
const HEX_SIZE = 18;
const SVG_W = 760;
const SVG_H = 620;

function hexToPixel(q: number, r: number): { x: number; y: number } {
  // odd-row offset 布局：奇数行右移半格，避免 axial 渲染呈平行四边形
  const cellWidth = HEX_SIZE * Math.sqrt(3);
  const x = cellWidth * q + (r % 2 !== 0 ? cellWidth / 2 : 0);
  const y = HEX_SIZE * 1.5 * r;
  return { x: x + 30, y: y + 30 };
}

function hexPolygonPoints(cx: number, cy: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + HEX_SIZE * Math.cos(angle)},${cy + HEX_SIZE * Math.sin(angle)}`);
  }
  return pts.join(' ');
}

const allHexes = computed(() => Array.from(worldGrid.value.hexes.values()));
const neighborPositions = computed(() => getHexNeighbors(playerHexPos.value.q, playerHexPos.value.r));

// ============================================================
// NPC 呈现（设计 §spec 3.4：上帝视角聚合 + 沉浸视角附近精细）
// ============================================================

// 世界档案 NPC（Active）按格索引（venue→hex 由引擎维护）
const npcByHex = computed(() => {
  const npcs = appStore.currentWorldState?.npcs ?? {};
  return npcSpatialIndex(npcs, worldGrid.value);
});

const observableNpcIds = computed(() => {
  const pos = playerHexPos.value;
  const positions = [{ q: pos.q, r: pos.r }, ...getHexNeighbors(pos.q, pos.r)];
  return new Set(positions.flatMap((item) => npcByHex.value.get(`${item.q},${item.r}`) ?? []).map((npc) => npc.id));
});

const spatialState = computed(() => appStore.currentWorldState?.spatialState);

function activeSpatialContinentId(): string {
  const state = spatialState.value;
  if (!state) return mapStore.activeContinentId;
  if (state.nodes[mapStore.activeContinentId]) return mapStore.activeContinentId;
  return mapStore.activeContinentId === 'CONTINENT_CANGZHOU' ? 'CONT_EAST' : mapStore.activeContinentId;
}

function addressBelongsToActiveContinent(nodeId: string | undefined): boolean {
  const state = spatialState.value;
  if (!state || !nodeId) return false;
  return resolveSpatialAncestors(state, nodeId).includes(activeSpatialContinentId());
}

function addressBelongsToCurrentLocalArea(nodeId: string | undefined): boolean {
  const state = spatialState.value;
  const playerAddress = playerStore.character?.spatialAddress;
  if (!state || !nodeId || !playerAddress) return false;
  const playerAncestors = resolveSpatialAncestors(state, playerAddress.nodeId);
  const localAreaId = playerAncestors.find((id) => state.nodes[id]?.kind === 'LocalArea');
  return !!localAreaId && resolveSpatialAncestors(state, nodeId).includes(localAreaId);
}

function npcIsInActiveMap(npc: NpcRecord): boolean {
  if (addressBelongsToActiveContinent(npc.spatialAddress?.nodeId)) return true;
  if (npc.travel) {
    return addressBelongsToActiveContinent(npc.travel.origin.nodeId)
      || addressBelongsToActiveContinent(npc.travel.destination.nodeId);
  }
  // 旧档案的兼容投影仍可被当前六边形地图定位；它不是新的位置来源。
  const pos = npc.hexPos;
  return !!pos && npcByHex.value.get(`${pos.q},${pos.r}`)?.some((item) => item.id === npc.id) === true;
}

const mapNpcList = computed(() => {
  const keyword = npcSearch.value.trim().toLocaleLowerCase();
  const npcs = Object.values(appStore.currentWorldState?.npcs ?? {})
    .filter((npc) => npc.soulState === 'Active' && npcIsInActiveMap(npc))
    .filter((npc) => isGodObserver.value || observableNpcIds.value.has(npc.id))
    .filter((npc) => !keyword || npc.name.toLocaleLowerCase().includes(keyword))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  return npcs;
});

const selectedNpc = computed(() => {
  const id = selectedNpcId.value;
  return id ? appStore.currentWorldState?.npcs[id] ?? null : null;
});

function spatialNodeName(nodeId: string | undefined): string {
  if (!nodeId) return '位置未知';
  return spatialState.value?.nodes[nodeId]?.name ?? nodeId;
}

function formatWorldMinute(minutes: number): string {
  const time = projectTime(minutes);
  return `${time.year}年${time.month}月${time.day}日`;
}

const selectedNpcLocation = computed(() => {
  const npc = selectedNpc.value;
  if (!npc) return '未选中人物';
  if (npc.travel?.status === 'in_transit') {
    return `途中：${spatialNodeName(npc.travel.origin.nodeId)} → ${spatialNodeName(npc.travel.destination.nodeId)}`;
  }
  return spatialNodeName(npc.spatialAddress?.nodeId) || npc.locationId || '位置未知';
});

const selectedNpcRecentFacts = computed(() => {
  const npc = selectedNpc.value;
  const world = appStore.currentWorldState;
  if (!npc || !world) return [];
  return (world.facts ?? [])
    .filter((fact) => fact.participants.some((participant) => participant.entityId === npc.id))
    .slice(-4)
    .reverse();
});

const selectedNpcRecentEvents = computed(() => {
  const npc = selectedNpc.value;
  const world = appStore.currentWorldState;
  if (!npc || !world) return [];
  return world.eventLog
    .filter((event) => event.involvedCharacterIds.includes(npc.id))
    .slice(-3)
    .reverse();
});

function inspectNpc(npc: NpcRecord) {
  selectedNpcId.value = npc.id;
  const world = appStore.currentWorldState;
  const displayNpc = expandForScene(npc, {
    sceneType: 'display',
    currentTime: world
      ? { year: world.currentYear, month: world.currentMonth }
      : undefined,
  });
  playerStore.setCurrentNPC(displayNpc);
}

function openNpcInteraction() {
  if (!selectedNpc.value) return;
  uiStore.setTab('npc');
}

function grantSelectedNpcAid() {
  if (!selectedNpc.value) return;
  const result = appStore.grantGodAid(selectedNpc.value.id, 10);
  godInterventionMessage.value = result.ok
    ? `已向${selectedNpc.value.name}赐下 10 灵石，来源已写入世界事实`
    : result.reason ?? '干预失败';
}

const featureTypeLabel: Record<DynamicSpatialFeature['type'], string> = {
  secret_realm_entrance: '秘境入口',
  rift: '空间裂缝',
  barrier: '动态结界',
  disaster_zone: '灾害范围',
  spirit_tide: '灵潮',
  war_front: '战线',
};

function featureIsVisibleInMap(feature: DynamicSpatialFeature): boolean {
  const state = spatialState.value;
  if (!state || !feature.scope.nodeIds.some((id) => addressBelongsToActiveContinent(id))) return false;
  if (feature.visibility === 'secret' || feature.visibility === 'local') {
    const playerNode = playerStore.character?.spatialAddress?.nodeId;
    return feature.scope.nodeIds.some((id) => id === playerNode || addressBelongsToCurrentLocalArea(id));
  }
  return true;
}

function featureHex(feature: DynamicSpatialFeature): { q: number; r: number } | null {
  const center = feature.scope.center;
  if (center && 'q' in center && 'r' in center) return { q: center.q, r: center.r };
  for (const nodeId of feature.scope.nodeIds) {
    const position = findLandmarkPos(worldGrid.value, nodeId);
    if (position) return position;
  }
  return null;
}

const visibleFeatureOverlays = computed(() => {
  if (!observationPreferences.value.dangers) return [];
  const features = Object.values(spatialState.value?.features ?? {});
  return features
    .filter((feature) => feature.lifecycle !== 'archived' && featureIsVisibleInMap(feature))
    .map((feature) => ({ feature, position: featureHex(feature) }))
    .filter((item): item is { feature: DynamicSpatialFeature; position: { q: number; r: number } } => !!item.position);
});

function mapHexIsKnown(position: { q: number; r: number }): boolean {
  return isGodObserver.value || worldGrid.value.hexes.get(`${position.q},${position.r}`)?.explored === true;
}

const roadOverlays = computed(() => {
  if (!observationPreferences.value.roads) return [];
  const state = spatialState.value;
  if (!state) return [];
  return Object.values(state.links)
    .filter((link) => link.status === 'active' && ['road', 'mountain_pass'].includes(link.kind))
    .map((link) => ({
      link,
      from: findLandmarkPos(worldGrid.value, link.fromNodeId),
      to: findLandmarkPos(worldGrid.value, link.toNodeId),
    }))
    .filter((item): item is typeof item & { from: { q: number; r: number }; to: { q: number; r: number } } =>
      !!item.from && !!item.to
      && addressBelongsToActiveContinent(item.link.fromNodeId)
      && addressBelongsToActiveContinent(item.link.toNodeId)
      && mapHexIsKnown(item.from)
      && mapHexIsKnown(item.to));
});

const spiritQiOverlays = computed(() => {
  if (!observationPreferences.value.spiritQi) return [];
  const overlays: Array<{ id: string; name: string; position: { q: number; r: number }; value: number }> = [];
  const seen = new Set<string>();
  for (const [nodeId, value] of Object.entries(appStore.currentWorldState?.nodeSpiritQi ?? {})) {
    const position = findLandmarkPos(worldGrid.value, nodeId);
    if (!position || !addressBelongsToActiveContinent(nodeId) || !mapHexIsKnown(position)) continue;
    const key = `${position.q},${position.r}`;
    seen.add(key);
    overlays.push({ id: `node-qi-${nodeId}`, name: spatialNodeName(nodeId), position, value });
  }
  for (const hex of worldGrid.value.hexes.values()) {
    const key = `${hex.q},${hex.r}`;
    if (hex.terrain !== 'spirit_vein' || seen.has(key) || !mapHexIsKnown(hex)) continue;
    overlays.push({ id: `terrain-qi-${key}`, name: '灵脉地形', position: { q: hex.q, r: hex.r }, value: 65 });
  }
  return overlays;
});

const factionOverlays = computed(() => {
  if (!observationPreferences.value.factions) return [];
  const result: Array<{ id: string; factionId: string; name: string; color: string; position: { q: number; r: number } }> = [];
  for (const faction of Object.values(appStore.currentWorldState?.factions ?? {})) {
    if (faction.status === 'destroyed') continue;
    for (const nodeId of faction.territories) {
      const position = findLandmarkPos(worldGrid.value, nodeId);
      if (!position || !addressBelongsToActiveContinent(nodeId) || !mapHexIsKnown(position)) continue;
      result.push({
        id: `${faction.id}:${nodeId}`,
        factionId: faction.id,
        name: faction.name,
        color: factionColor(faction.id),
        position,
      });
    }
  }
  return result;
});

function factionColor(factionId: string): string {
  const colors = ['#f59e0b', '#22c55e', '#ef4444', '#a855f7', '#38bdf8', '#e879f9'];
  let hash = 0;
  for (const char of factionId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length]!;
}

function addressHex(address: { nodeId: string; coordinate?: { q: number; r: number } | { x: number; y: number } }): { q: number; r: number } | null {
  const coordinate = address.coordinate;
  if (coordinate && 'q' in coordinate && 'r' in coordinate) return coordinate;
  return findLandmarkPos(worldGrid.value, address.nodeId);
}

const npcTravelOverlays = computed(() => {
  const routeMode = observationPreferences.value.npcRoutes;
  if (routeMode === 'off') return [];
  const world = appStore.currentWorldState;
  if (!world) return [];
  return Object.values(world.npcs)
    .filter((npc) => npc.soulState === 'Active' && npc.travel?.status === 'in_transit')
    .filter((npc) => shouldProjectNpcRoute({
      mode: routeMode,
      isGodObserver: isGodObserver.value,
      isCurrentlyObservable: observableNpcIds.value.has(npc.id),
      isSelected: selectedNpcId.value === npc.id,
      isWatched: appStore.watchedNpcIds.includes(npc.id),
    }))
    .map((npc) => {
      const travel = npc.travel!;
      const projectedTravel = advanceSpatialTravel(travel, world.elapsedMinutes ?? 0);
      const evaluation = evaluateSpatialTravelPosition(projectedTravel);
      const origin = addressHex(travel.origin);
      const destination = addressHex(travel.destination);
      const points = origin ? [origin] : [];
      for (const segment of travel.route) {
        const coordinate = segment.toCoordinate;
        if (coordinate && 'q' in coordinate && 'r' in coordinate) {
          points.push({ q: coordinate.q, r: coordinate.r });
          continue;
        }
        const position = findLandmarkPos(worldGrid.value, segment.toNodeId);
        if (position) points.push(position);
      }
      if (destination && (points.length === 0
        || points.at(-1)?.q !== destination.q
        || points.at(-1)?.r !== destination.r)) points.push(destination);
      const evaluatedCoordinate = evaluation.address.coordinate;
      let current = evaluatedCoordinate && 'q' in evaluatedCoordinate && 'r' in evaluatedCoordinate
        ? { q: evaluatedCoordinate.q, r: evaluatedCoordinate.r }
        : findLandmarkPos(worldGrid.value, evaluation.fromNodeId);
      if ((!evaluatedCoordinate || !('q' in evaluatedCoordinate))
        && current && evaluation.segmentProgress > 0) {
        const next = findLandmarkPos(worldGrid.value, evaluation.toNodeId);
        if (next) {
          current = {
            q: current.q + (next.q - current.q) * evaluation.segmentProgress,
            r: current.r + (next.r - current.r) * evaluation.segmentProgress,
          };
        }
      }
      return {
        npc,
        origin,
        destination,
        points,
        current,
        eta: formatWorldMinute(travel.estimatedArrivalAtMinutes),
      };
    })
    .filter((item) => item.origin && item.destination
      && (addressBelongsToActiveContinent(item.npc.travel?.origin.nodeId)
        || addressBelongsToActiveContinent(item.npc.travel?.destination.nodeId)));
});

function routePolylinePoints(points: Array<{ q: number; r: number }>): string {
  return points.map((point) => {
    const pixel = hexToPixel(point.q, point.r);
    return `${pixel.x},${pixel.y}`;
  }).join(' ');
}

const nearbyTimeline = computed(() => {
  const world = appStore.currentWorldState;
  if (!world) return [];
  const currentNode = playerStore.character?.spatialAddress?.nodeId ?? playerStore.currentNodeId;
  return world.eventLog
    .filter((event) => event.locationId === currentNode || event.locationId === mapStore.activeVenueId)
    .slice(-6)
    .reverse();
});

const timelineMode = ref<'nearby' | 'facts'>('nearby');

// 上帝视角：每格聚合标记（人数 + 最高境界色）
const npcAggregates = computed(() => {
  const out: Array<{ q: number; r: number; count: number; color: string }> = [];
  if (!observationPreferences.value.people
    || (observationPreferences.value.npcNames !== 'aggregate' && semanticScale.value !== 'macro')) return out;
  for (const [key, list] of npcByHex.value) {
    const visible = isGodObserver.value ? list : list.filter((npc) => observableNpcIds.value.has(npc.id));
    if (visible.length === 0) continue;
    const [q, r] = key.split(',').map(Number);
    let color = realmColor('QiRefinement_1');
    for (const n of visible) color = realmColor(n.realm);
    out.push({ q: q!, r: r!, count: visible.length, color });
  }
  return out;
});

// 沉浸视角：玩家所在格 + 邻格 NPC 精细标记（人形 + 姓名；稍远不可见——修仙神秘感）
const nearbyNpcs = computed(() => {
  if (!observationPreferences.value.people
    || observationPreferences.value.npcNames === 'aggregate'
    || semanticScale.value === 'macro') return [];
  const mode = observationPreferences.value.npcNames;
  const out: Array<{ q: number; r: number; offsetX: number; offsetY: number; npc: NpcRecord }> = [];
  for (const [key, list] of npcByHex.value) {
    const [q, r] = key.split(',').map(Number);
    const visible = list.filter((npc) => isGodObserver.value || observableNpcIds.value.has(npc.id));
    const projected = mode === 'selected'
      ? visible.filter((npc) => npc.id === selectedNpcId.value)
      : visible.slice(0, 8);
    projected.forEach((npc, index) => {
      const knownNow = isGodObserver.value || observableNpcIds.value.has(npc.id);
      if (!knownNow) return;
      const angle = projected.length <= 1 ? 0 : (Math.PI * 2 * index) / projected.length;
      const radius = projected.length <= 1 ? 0 : 10;
      out.push({
        q: q!,
        r: r!,
        offsetX: Math.cos(angle) * radius,
        offsetY: Math.sin(angle) * radius,
        npc,
      });
    });
  }
  return out;
});

const npcOverflowAggregates = computed(() => {
  if (!observationPreferences.value.people
    || observationPreferences.value.npcNames !== 'all_known'
    || semanticScale.value === 'macro') return [];
  const out: Array<{ q: number; r: number; hidden: number }> = [];
  for (const [key, list] of npcByHex.value) {
    const visibleCount = list.filter((npc) =>
      isGodObserver.value || observableNpcIds.value.has(npc.id)).length;
    if (visibleCount <= 8) continue;
    const [q, r] = key.split(',').map(Number);
    out.push({ q: q!, r: r!, hidden: visibleCount - 8 });
  }
  return out;
});

function shouldShowNpcLabel(npcId: string): boolean {
  return npcId === selectedNpcId.value
    || npcId === hoveredNpcId.value
    || appStore.watchedNpcIds.includes(npcId);
}

function realmColor(realm: string): string {
  if (realm.startsWith('NascentSoul')) return '#a78bfa'; // 元婴紫
  if (realm.startsWith('GoldenCore')) return '#fbbf24';   // 金丹金
  if (realm.startsWith('Foundation')) return '#60a5fa';   // 筑基蓝
  return '#22d3ee';                                       // 炼气青
}

/** 点击地图上的具名 NPC 只打开观察面板，不触发移动。 */
function inspectNearbyNpc(npc: NpcRecord) {
  inspectNpc(npc);
}

function isAdjacent(q: number, r: number): boolean {
  return neighborPositions.value.some(n => n.q === q && n.r === r);
}

function isPlayerHere(q: number, r: number): boolean {
  return playerHexPos.value.q === q && playerHexPos.value.r === r;
}

/**
 * 启动权威连续旅行，但不代替玩家推进时间。
 * 暂停、实时、快进和读档都只推进同一个 TravelState；抵达由统一时钟结算。
 */
function beginPlayerHexTravel(
  targetQ: number,
  targetR: number,
  path: Array<{ q: number; r: number }>,
): boolean {
  const player = playerStore.character;
  const world = appStore.currentWorldState;
  const spatial = world?.spatialState;
  if (!player || !world || !spatial) {
    message.value = '世界空间尚未准备好，无法移动';
    return false;
  }
  if (player.travel && ['in_transit', 'paused', 'interrupted'].includes(player.travel.status)) {
    message.value = '已有行程，请先继续、暂停或折返';
    return false;
  }

  const localAreaId = Object.values(spatial.nodes).find((node) =>
    node.kind === 'LocalArea' && (node.id === `LOCAL_${mapStore.activeContinentId}_OVERWORLD`
      || node.parentId === mapStore.activeContinentId
      || node.id.includes(mapStore.activeContinentId.replace('CONTINENT_', ''))),
  )?.id;
  if (!localAreaId) {
    message.value = '当前大陆没有可用的真实区域节点';
    return false;
  }
  const targetHex = worldGrid.value.hexes.get(`${targetQ},${targetR}`);
  const targetNodeId = targetHex?.landmarkId && spatial.nodes[targetHex.landmarkId]
    ? targetHex.landmarkId
    : localAreaId;
  const origin = player.spatialAddress ?? {
    nodeId: localAreaId,
    coordinate: { ...playerHexPos.value },
    occupancy: 'stationary' as const,
  };
  const destination = {
    nodeId: targetNodeId,
    coordinate: { q: targetQ, r: targetR },
    occupancy: 'stationary' as const,
  };
  if (player.entryProfile?.mode === 'god') {
    player.spatialAddress = destination;
    playerHexPos.value = { q: targetQ, r: targetR };
    mapStore.setHexPos({ q: targetQ, r: targetR });
    markExploredAround(targetQ, targetR);
    message.value = '观察焦点已移动；世界时间未推进，未生成肉身旅行事实';
    return true;
  }

  const totalDays = path.slice(1).reduce((sum, step) => {
    const hex = worldGrid.value.hexes.get(`${step.q},${step.r}`);
    return sum + (hex ? TERRAIN_INFO[hex.terrain].moveCost : 0);
  }, 0);
  if (!Number.isFinite(totalDays) || totalDays <= 0) {
    message.value = '路线没有有效的时间成本';
    return false;
  }
  const routeOverride = path.slice(1).map((step, index) => {
    const from = path[index]!;
    const hex = worldGrid.value.hexes.get(`${step.q},${step.r}`);
    return {
      linkId: `LOCAL_PATH_${mapStore.activeContinentId}_${from.q},${from.r}_${step.q},${step.r}`,
      fromNodeId: index === 0 ? origin.nodeId : localAreaId,
      toNodeId: index === path.length - 2 ? targetNodeId : localAreaId,
      distance: hex ? TERRAIN_INFO[hex.terrain].moveCost : 1,
      kind: 'local_path' as const,
      fromCoordinate: { ...from },
      toCoordinate: { ...step },
    };
  });
  const plan = planSpatialTravel(spatial, {
    travelId: `player:${player.id}:${world.elapsedMinutes ?? 0}:${targetQ},${targetR}`,
    entityId: player.id,
    origin,
    destination,
    movementMode: player.canFly ? 'fly' : 'walk',
    speed: { baseDistancePerDay: 1 },
    nowMinutes: world.elapsedMinutes ?? 0,
    routeOverride,
  });
  if (!plan.ok) {
    message.value = `无法建立旅行计划：${plan.reason}`;
    return false;
  }
  stopRealtime();
  playerStore.setPlayer({
    ...createGameSnapshot(player),
    spatialAddress: plan.travel.origin,
    travel: plan.travel,
  });
  pendingPath.value = path.slice(1);
  message.value = `行程已开始，预计 ${formatWorldMinute(plan.travel.estimatedArrivalAtMinutes)} 抵达；可暂停、存档或继续推进`;
  return true;
}

async function advanceCurrentTravel(minutes: number) {
  const travel = currentPlayerTravel.value;
  if (!travel || minutes <= 0) return;
  if (travel.status !== 'in_transit') {
    message.value = travel.status === 'paused' ? '行程已暂停，请先继续前进' : '路线受阻，请折返或等待道路恢复';
    return;
  }
  stopRealtime();
  // pendingPath 只是当前页面的预览缓存；读档后以持久化路线恢复探索回写。
  const plannedPath = pendingPath.value ? [...pendingPath.value] : persistedLocalTravelPath();
  const result = await advanceMinutes(Math.min(minutes, travelRemainingMinutes.value));
  if (result.died) return;
  if (result.interruption?.kind === 'encounter') {
    message.value = '行程在真实接触时刻中断，请先处理途中相遇';
    return;
  }

  if (!currentPlayerTravel.value) {
    for (const step of plannedPath) {
      mapStore.markExplored(mapStore.activeContinentId, [step, ...getHexNeighbors(step.q, step.r)]);
    }
    pendingPath.value = null;
    syncPlayerMapProjection();
    updateLandmarkPos();
    selectedHexPos.value = { ...playerHexPos.value };
    message.value = '已抵达目的地；行程事实已结算一次';
  } else {
    message.value = `仍在途中，预计 ${formatWorldMinute(currentPlayerTravel.value.estimatedArrivalAtMinutes)} 抵达`;
  }
}

function advanceTravelOneHour() {
  void advanceCurrentTravel(60);
}

function advanceTravelToArrival() {
  void advanceCurrentTravel(travelRemainingMinutes.value);
}

function pauseCurrentTravel() {
  const player = playerStore.character;
  const travel = currentPlayerTravel.value;
  const now = appStore.currentWorldState?.elapsedMinutes ?? 0;
  if (!player || !travel || travel.status !== 'in_transit') return;
  const paused = pauseSpatialTravel(travel, now);
  playerStore.setPlayer({
    ...createGameSnapshot(player),
    spatialAddress: evaluateSpatialTravelPosition(paused).address,
    travel: paused,
  });
  stopRealtime();
  message.value = '行程已暂停；时间继续流逝也不会暗中前进';
}

function resumeCurrentTravel() {
  const player = playerStore.character;
  const travel = currentPlayerTravel.value;
  const now = appStore.currentWorldState?.elapsedMinutes ?? 0;
  if (!player || !travel || travel.status !== 'paused') return;
  const resumed = resumeSpatialTravel(travel, now);
  playerStore.setPlayer({
    ...createGameSnapshot(player),
    spatialAddress: evaluateSpatialTravelPosition(resumed).address,
    travel: resumed,
  });
  message.value = '已从当前位置继续行程';
}

function returnAlongCurrentRoute() {
  const player = playerStore.character;
  const travel = currentPlayerTravel.value;
  const now = appStore.currentWorldState?.elapsedMinutes ?? 0;
  if (!player || !travel) return;
  const returning = reverseSpatialTravel(travel, now);
  playerStore.setPlayer({
    ...createGameSnapshot(player),
    spatialAddress: evaluateSpatialTravelPosition(returning).address,
    travel: returning.status === 'arrived' ? undefined : returning,
  });
  message.value = returning.status === 'arrived' ? '仍在起点，无需折返' : '已从当前途中位置折返，不返还已经消耗的时间';
}

function getTerrainColor(hex: WorldHex): string {
  if (!hex.explored) return '#0d1117';
  return TERRAIN_INFO[hex.terrain].color;
}

function getTerrainIcon(hex: WorldHex): string {
  if (!hex.explored) return '';
  return TERRAIN_INFO[hex.terrain].icon;
}

// ---- 交互 ----

function handleHexClick(q: number, r: number) {
  if (suppressNextHexClick) {
    suppressNextHexClick = false;
    return;
  }
  if (pendingNpc.value || pendingBattle.value || pendingAdventure.value) return;
  // 左键是选择，不直接消耗时间；移动通过右键或显式“前往”按钮触发。
  selectedHexPos.value = { q, r };
}

function requestHexMove(q: number, r: number) {
  if (pendingNpc.value || pendingBattle.value || pendingAdventure.value || currentPlayerTravel.value) return;
  if (isPlayerHere(q, r)) {
    message.value = '你已经在这里了';
    return;
  }
  if (isAdjacent(q, r)) stepMove(q, r);
  else startAutoTravel(q, r);
}

function handleHexContextMenu(e: MouseEvent, q: number, r: number) {
  e.preventDefault();
  selectedHexPos.value = { q, r };
  requestHexMove(q, r);
}

function moveToSelectedHex() {
  const target = selectedHexPos.value;
  if (!target) return;
  requestHexMove(target.q, target.r);
}

function stepMove(targetQ: number, targetR: number) {
  if (!playerStore.character) return;
  const target = worldGrid.value.hexes.get(`${targetQ},${targetR}`);
  if (!target || target.terrain === 'void') {
    message.value = target ? '虚空无法通过' : '无法移动';
    return;
  }
  beginPlayerHexTravel(targetQ, targetR, [
    { ...playerHexPos.value },
    { q: targetQ, r: targetR },
  ]);
}

function startAutoTravel(targetQ: number, targetR: number) {
  if (!playerStore.character) return;
  const path = findPath(worldGrid.value, playerHexPos.value, { q: targetQ, r: targetR });
  if (!path || path.length < 2) {
    message.value = '无法找到路径';
    return;
  }
  beginPlayerHexTravel(targetQ, targetR, path);
}

// 切换层级时取消寻路
watch(activeLayer, (newLayer) => {
  if (newLayer !== 'Region') pendingPath.value = null;
});

function processEvents(events: HexMoveEvent[]) {
  for (const evt of events) {
    moveLog.value.unshift(evt);
    if (moveLog.value.length > 20) moveLog.value.pop();

    switch (evt.type) {
      case 'npc_meet':
        if (evt.npc) pendingNpc.value = evt.npc;
        break;
      case 'battle':
        pendingBattle.value = evt;
        break;
      case 'material_found':
        message.value = `获得材料：${formatItemId(evt.materialId ?? '未知材料')}`;
        break;
      case 'discovery':
        message.value = evt.description;
        break;
      case 'landmark_reached':
        message.value = evt.description;
        break;
    }
  }
}

function updateLandmarkPos() {
  const nodeId = playerStore.character?.spatialAddress?.nodeId;
  if (nodeId) playerStore.setCurrentNode(nodeId);
}

const currentHex = computed(() =>
  worldGrid.value.hexes.get(`${playerHexPos.value.q},${playerHexPos.value.r}`),
);

const playerTravelOverlay = computed(() => {
  const travel = currentPlayerTravel.value;
  if (!travel) return null;
  const origin = addressHex(travel.origin);
  const destination = addressHex(travel.destination);
  if (!origin || !destination) return null;
  const points = [origin];
  for (const segment of travel.route) {
    const coordinate = segment.toCoordinate;
    if (coordinate && 'q' in coordinate && 'r' in coordinate) {
      points.push({ q: coordinate.q, r: coordinate.r });
      continue;
    }
    const position = findLandmarkPos(worldGrid.value, segment.toNodeId);
    if (position) points.push(position);
  }
  if (points.length === 1 || points.at(-1)?.q !== destination.q || points.at(-1)?.r !== destination.r) {
    points.push(destination);
  }
  const position = evaluateSpatialTravelPosition(travel).address.coordinate;
  const current = position && 'q' in position && 'r' in position
    ? { q: position.q, r: position.r }
    : origin;
  return { origin, destination, points, current };
});
const playerTravelPolylinePoints = computed(() => playerTravelOverlay.value?.points
  .map((point) => {
    const pixel = hexToPixel(point.q, point.r);
    return `${pixel.x},${pixel.y}`;
  })
  .join(' ') ?? '');

const focusedSettlement = computed(() =>
  mapStore.focusedSpatialNodeId ? getSettlement(mapStore.focusedSpatialNodeId) ?? null : null);
const focusedSettlementViewBox = computed(() => {
  const layout = focusedSettlement.value?.layout;
  return layout ? `${layout.x} ${layout.y} ${layout.width} ${layout.height}` : '0 0 800 600';
});
const selectedSettlementNodeId = ref<string | null>(null);
const selectedSettlementNode = computed(() =>
  focusedSettlement.value?.nodes.find((node) => node.id === selectedSettlementNodeId.value) ?? null);

function settlementPositionForSpatialNode(nodeId: string): { x: number; y: number } | null {
  const settlement = focusedSettlement.value;
  if (!settlement) return null;
  const direct = settlement.nodes.find((node) => node.id === nodeId || node.venueId === nodeId);
  if (direct) return direct.position;
  if (nodeId === settlement.nodeId) {
    return settlement.nodes.find((node) => node.id === settlement.entryNodeId)?.position ?? settlement.nodes[0]?.position ?? null;
  }
  return null;
}

const settlementPlayerMarker = computed(() => {
  const player = playerStore.character;
  const settlement = focusedSettlement.value;
  if (!player || !settlement || !playerCanEnterFocusedSettlement.value) return null;
  const travel = currentPlayerTravel.value;
  if (travel) {
    const evaluated = evaluateSpatialTravelPosition(travel);
    const from = settlementPositionForSpatialNode(evaluated.fromNodeId);
    const to = settlementPositionForSpatialNode(evaluated.toNodeId);
    if (from && to) {
      return {
        x: from.x + (to.x - from.x) * evaluated.segmentProgress,
        y: from.y + (to.y - from.y) * evaluated.segmentProgress,
        traveling: travel.status === 'in_transit',
      };
    }
  }
  const position = settlementPositionForSpatialNode(player.spatialAddress?.nodeId ?? settlement.nodeId);
  return position ? { ...position, traveling: false } : null;
});
const playerCanEnterFocusedSettlement = computed(() => {
  const world = appStore.currentWorldState;
  const playerNodeId = playerStore.character?.spatialAddress?.nodeId;
  const settlement = focusedSettlement.value;
  if (!world?.spatialState || !playerNodeId || !settlement) return false;
  return resolveSpatialAncestors(world.spatialState, playerNodeId).includes(settlement.nodeId);
});

function openSettlementDetail(nodeId: string) {
  if (!getSettlement(nodeId)) {
    message.value = '此地点尚无可用的真实局部地图';
    return;
  }
  selectedSettlementNodeId.value = null;
  mapStore.enterSpatialDetail(nodeId);
}

function closeSettlementDetail() {
  mapStore.leaveSpatialDetail();
  mapZoom.value = Math.min(mapZoom.value, 1.65);
  scheduleViewportPersist();
}

function settlementNodeIsPlayerLocation(node: SettlementNode): boolean {
  const playerNodeId = playerStore.character?.spatialAddress?.nodeId;
  const spatial = appStore.currentWorldState?.spatialState;
  if (!playerNodeId || !spatial) return false;
  const ancestors = resolveSpatialAncestors(spatial, playerNodeId);
  return ancestors.includes(node.id) || (!!node.venueId && ancestors.includes(node.venueId));
}

function beginSettlementNodeTravel(node: SettlementNode) {
  const player = playerStore.character;
  const world = appStore.currentWorldState;
  const spatial = world?.spatialState;
  const settlement = focusedSettlement.value;
  if (!player || !world || !spatial || !settlement || !playerCanEnterFocusedSettlement.value) {
    message.value = '你只能观察此地；需要先在区域地图抵达这里';
    return;
  }
  if (currentPlayerTravel.value) {
    message.value = '已有行程，请先处理当前行程';
    return;
  }
  const destinationNodeId = node.venueId ?? node.id;
  if (player.spatialAddress?.nodeId === destinationNodeId) {
    if (node.venueId) mapStore.enterVenue(node.venueId);
    return;
  }
  const planned = planSpatialTravel(spatial, {
    travelId: `player:${player.id}:${world.elapsedMinutes ?? 0}:${destinationNodeId}`,
    entityId: player.id,
    origin: player.spatialAddress ?? { nodeId: settlement.nodeId, occupancy: 'stationary' },
    destination: { nodeId: destinationNodeId, coordinate: { ...node.position }, occupancy: 'stationary' },
    movementMode: player.canFly ? 'fly' : 'walk',
    speed: { baseDistancePerDay: 1 },
    nowMinutes: world.elapsedMinutes ?? 0,
  });
  if (!planned.ok) {
    message.value = `无法建立城内路线：${planned.reason}`;
    return;
  }
  playerStore.setPlayer({
    ...createGameSnapshot(player),
    spatialAddress: planned.travel.origin,
    travel: planned.travel,
  });
  stopRealtime();
  message.value = `已沿城内道路前往${node.name}`;
}

const settlementNpcsByNodeId = computed(() => {
  const settlement = focusedSettlement.value;
  if (!settlement) return new Map<string, NpcRecord[]>();
  const venueToNode = new Map(
    settlement.nodes
      .filter((node) => !!node.venueId)
      .map((node) => [node.venueId!, node.id]),
  );
  const grouped = new Map<string, NpcRecord[]>();
  for (const npc of Object.values(appStore.currentWorldState?.npcs ?? {})) {
    // 旅行中的 NPC 在道路上，不继续虚报为仍待在出发建筑内。
    if (npc.soulState !== 'Active' || npc.travel?.status === 'in_transit') continue;
    const spatialNodeId = npc.spatialAddress?.nodeId ?? npc.locationId;
    if (!spatialNodeId) continue;
    const nodeId = venueToNode.get(spatialNodeId)
      ?? (settlement.nodes.some((node) => node.id === spatialNodeId) ? spatialNodeId : undefined);
    if (!nodeId) continue;
    const list = grouped.get(nodeId) ?? [];
    list.push(npc);
    grouped.set(nodeId, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return grouped;
});

function settlementNodeNpcCount(settlementNodeId: string): number {
  return settlementNpcsByNodeId.value.get(settlementNodeId)?.length ?? 0;
}

const selectedSettlementNpcs = computed(() =>
  selectedSettlementNodeId.value
    ? settlementNpcsByNodeId.value.get(selectedSettlementNodeId.value) ?? []
    : []);

function settlementNodeIcon(type: SettlementNode['type']): string {
  return ({
    gate: '门',
    street: '街',
    shop: '宝',
    tavern: '酒',
    residential: '居',
    teleport: '阵',
    quest: '榜',
    training: '练',
    hall: '殿',
    alley: '巷',
  } as const)[type];
}

// ---- NPC / 战斗 / 奇遇处理 ----
function acceptNpc() {
  if (!pendingNpc.value) return;
  playerStore.setCurrentNPC(pendingNpc.value);
  uiStore.setTab('npc');
  pendingNpc.value = null;
}
function declineNpc() {
  pendingNpc.value = null;
}
function acceptBattle() {
  if (!pendingBattle.value || !playerStore.character) return;
  const tier = currentHex.value?.landmarkTier ?? 1;

  // S5：优先从世界 NPC 中选取真实 NPC 作为遭遇对象
  const worldNpcs = appStore.currentWorldState?.npcs ?? {};
  const nearbyNpc = pickNearbyNpc(worldNpcs, mapStore.activeVenueId ?? undefined);

  if (nearbyNpc) {
    // 真实世界 NPC 遭遇——用 expandForScene 展开为临时 Character
    const enemy = expandForScene(nearbyNpc, {
      sceneType: 'battle',
      currentTime: {
        year: appStore.currentWorldState!.currentYear,
        month: appStore.currentWorldState!.currentMonth,
      },
    });
    uiStore.startBattle({
      enemy,
      type: 'encounter',
      title: `遭遇 · ${enemy.name}`,
      description: `途中遇到了修士 ${nearbyNpc.name}。`,
      enemyNpcId: nearbyNpc.id,
      sceneId: `encounter_${Date.now()}`,
    });
  } else {
    // C4：无世界 NPC 可遭遇时不生成临时实体。
    message.value = '四周灵气波动，但未见可交手的修士';
  }

  pendingBattle.value = null;
}
function declineBattle() {
  if (playerStore.character) {
    const cost = Math.round(playerStore.character.maxHp * 0.05);
    playerStore.character.hp = Math.max(1, playerStore.character.hp - cost);
    message.value = `逃跑成功，损失 ${cost} 气血`;
  }
  pendingBattle.value = null;
}
function closeAdventure() {
  pendingAdventure.value = null;
}

function launchRoadEncounterBattle(encounter: ActiveWorldEncounter, npc: NpcRecord) {
  const world = appStore.currentWorldState;
  if (!world) return;
  const enemy = expandForScene(npc, {
    sceneType: 'battle',
    currentTime: { year: world.currentYear, month: world.currentMonth },
  });
  uiStore.startBattle({
    enemy,
    type: 'encounter',
    title: `${encounter.intent === 'ambush' ? '截杀' : '途中交锋'} · ${npc.name}`,
    description: encounter.intent === 'ambush'
      ? `${npc.name}依照自己的寻仇计划在道路上截住了你。`
      : `${npc.name}在途中向你发起挑战。`,
    enemyNpcId: npc.id,
    sceneId: `battle_${encounter.encounterId}`,
    worldEncounterId: encounter.encounterId,
  });
}

function chooseActiveRoadEncounter(choice: PlayerEncounterChoice) {
  const world = appStore.currentWorldState;
  const player = playerStore.character;
  const encounter = activeRoadEncounter.value;
  if (!world || !player || !encounter) return;
  stopRealtime();
  const result = chooseRoadEncounter(world, createGameSnapshot(player), encounter.encounterId, choice);
  if (!result.ok) {
    message.value = `相遇无法结算：${result.reason}`;
    return;
  }
  playerStore.setPlayer(result.updatedPlayer);
  if (result.launchBattle) {
    launchRoadEncounterBattle(world.activeEncounters![encounter.encounterId]!, result.npc);
  } else if (choice === 'talk') {
    inspectNpc(result.npc);
    uiStore.setTab('npc');
  } else {
    message.value = `你避开了${result.npc.name}，可以继续推进原定行程`;
  }
}

function resumeActiveRoadEncounterBattle() {
  const encounter = activeRoadEncounter.value;
  const npc = activeRoadEncounterNpc.value;
  if (encounter?.status === 'active' && npc) launchRoadEncounterBattle(encounter, npc);
}

// ---- 城镇进入 ----
const currentVenues = computed(() => {
  const hex = currentHex.value;
  if (!hex?.landmarkId) return [];
  return VenueService.listVenues(hex.landmarkId);
});

const canEnterCity = computed(() => currentVenues.value.length > 0);

function enterCity() {
  const nodeId = currentHex.value?.landmarkId;
  if (nodeId) openSettlementDetail(nodeId);
}

// ---- Settlement 层（P3） ----
const settlementName = computed(() => {
  return activeLayer.value === 'Settlement' ? focusedSettlement.value?.name ?? null : null;
});

// 传送阵访问
const teleportNodeHere = computed(() => {
  const hex = currentHex.value;
  if (!hex?.landmarkId) return null;
  return getTeleportNodeAt(mapStore.activeContinentId, hex.landmarkId);
});

const availableTeleports = computed(() => {
  const tp = teleportNodeHere.value;
  if (!tp) return [];
  return tp.connections
    .map(id => TELEPORT_GRAPH.nodes[id])
    .filter((n): n is NonNullable<typeof n> => n !== undefined);
});

const teleportMessage = ref<string | null>(null);

async function doTeleport(targetTpId: string) {
  const player = playerStore.character;
  const world = appStore.currentWorldState;
  const spatial = world?.spatialState;
  if (!player || !world || !spatial) {
    teleportMessage.value = '世界空间尚未准备好，无法传送';
    return;
  }
  if (player.travel?.status === 'in_transit') {
    teleportMessage.value = '当前仍在途中，不能重复发起传送';
    return;
  }
  const check = TravelService.canTeleport(
    player,
    mapStore.state,
    playerStore.currentNodeId,
    targetTpId,
  );
  if (!check.ok) {
    teleportMessage.value = check.reason ?? '无法传送';
    return;
  }

  const result = TravelService.teleport(
    player,
    mapStore.state,
    playerStore.currentNodeId,
    targetTpId,
  );
  if (!result.success) {
    teleportMessage.value = result.reason ?? '传送失败';
    return;
  }

  const nowMinutes = world.elapsedMinutes ?? 0;
  const planned = planSpatialTravel(spatial, {
    travelId: `teleport:${player.id}:${nowMinutes}:${targetTpId}`,
    entityId: player.id,
    origin: player.spatialAddress ?? { nodeId: playerStore.currentNodeId, occupancy: 'stationary' },
    destination: { nodeId: result.targetNodeId, occupancy: 'stationary' },
    movementMode: 'teleport',
    speed: { baseDistancePerDay: 1 },
    nowMinutes,
    distanceOverride: 1,
  });
  if (!planned.ok) {
    teleportMessage.value = `无法建立传送行程：${planned.reason}`;
    return;
  }

  // 费用已由 TravelService 原子扣除；位置仍进入统一 TravelState，
  // 传送准备/启动成本由统一世界时钟结算。
  playerStore.setPlayer({
    ...result.updatedPlayer,
    spatialAddress: planned.travel.origin,
    travel: planned.travel,
  });
  const travelDays = Math.max(1 / MINUTES_PER_DAY, (planned.travel.estimatedArrivalAtMinutes - nowMinutes) / MINUTES_PER_DAY);
  const timeResult = await travelAdvanceDays(travelDays);
  if (timeResult.died) return;

  // 抵达后的权威位置已由 TimeAdvanceService 写回，再更新地图观察投影。
  playerStore.setCurrentNode(result.targetNodeId);
  // 清空 gridCache 中目标大陆的缓存（强制重建以应用该大陆的缓存）
  // switchContinent 会重置 hexPos
  mapStore.switchContinent(result.targetContinentId);
  const cost = TELEPORT_GRAPH.nodes[targetTpId]?.spiritStoneCost ?? 0;
  teleportMessage.value = `传送完成！消耗 ${cost} 灵石`;
}

// Continent 层传送连线（预先过滤无效连接，避免 v-if/v-for 同元素冲突）
const teleportLines = computed(() => {
  const lines: { id: string; x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const tp of Object.values(TELEPORT_GRAPH.nodes)) {
    const from = getContinent(tp.continentId);
    if (!from) continue;
    for (const connId of tp.connections) {
      const target = TELEPORT_GRAPH.nodes[connId];
      const to = target ? getContinent(target.continentId) : undefined;
      if (!to) continue;
      lines.push({
        id: `${tp.id}-${connId}`,
        x1: from.position.x,
        y1: from.position.y,
        x2: to.position.x,
        y2: to.position.y,
      });
    }
  }
  return lines;
});

// 图例
const legendTerrains: HexTerrain[] = ['plain', 'forest', 'mountain', 'water', 'spirit_vein', 'wilderness', 'town'];
</script>

<template>
  <div class="space-y-3">
    <!-- ===== 层级面包屑 ===== -->
    <div class="flex items-center gap-1 px-2 py-1.5 bg-slate-800/70 rounded-lg text-xs">
      <template v-for="(crumb, idx) in layerBreadcrumb" :key="crumb.layer">
        <button
          v-if="idx < layerBreadcrumb.length - 1 || crumb.layer !== 'Venue'"
          @click="switchLayer(crumb.layer)"
          :class="[
            'px-2 py-1 rounded transition font-medium',
            activeLayer === crumb.layer
              ? 'bg-amber-600 text-white'
              : 'text-slate-400 hover:text-amber-200 hover:bg-slate-700',
          ]"
        >
          {{ crumb.name }}
        </button>
        <span v-else class="px-2 py-1 text-amber-300 font-medium">{{ crumb.name }}</span>
        <span v-if="idx < layerBreadcrumb.length - 1" class="text-slate-600">›</span>
      </template>
    </div>

    <!-- ===== Venue 层 ===== -->
    <VenuePanel v-if="activeLayer === 'Venue'" />

    <!-- ===== Settlement 层（P3：聚落内部地图） ===== -->
    <div v-else-if="activeLayer === 'Settlement'" class="space-y-3">
      <div class="flex items-center justify-between gap-3 p-3 bg-green-900/20 rounded-lg border border-green-700/40">
        <div>
          <div class="text-sm text-green-200 font-semibold">🏘️ {{ settlementName ?? '聚落' }} · 局部地图</div>
          <div class="text-xs text-slate-400 mt-1">观察下钻不推进时间；人物移动仍须沿真实道路。</div>
        </div>
        <button @click="closeSettlementDetail" class="px-3 py-1.5 rounded text-xs bg-slate-700 hover:bg-slate-600">返回区域</button>
      </div>

      <div v-if="currentPlayerTravel" class="p-3 rounded-lg bg-amber-950/30 border border-amber-700/60 flex items-center justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-amber-200">
            {{ currentPlayerTravel.status === 'paused' ? '城内行程已暂停' : currentPlayerTravel.status === 'interrupted' ? '城内路线受阻' : '城内移动中' }}
          </div>
          <div class="text-xs text-slate-400 mt-1">
            {{ Math.round(travelProgress) }}% · {{ currentPlayerTravel.status === 'interrupted' ? '原预计' : '预计' }} {{ formatWorldMinute(currentPlayerTravel.estimatedArrivalAtMinutes) }}
          </div>
        </div>
        <div class="flex gap-2">
          <button v-if="currentPlayerTravel.status === 'in_transit'" @click="advanceTravelOneHour" class="px-3 py-1.5 rounded text-xs bg-slate-700">推进 1 小时</button>
          <button v-if="currentPlayerTravel.status === 'in_transit'" @click="pauseCurrentTravel" class="px-3 py-1.5 rounded text-xs bg-slate-700">暂停</button>
          <button v-else-if="currentPlayerTravel.status === 'paused'" @click="resumeCurrentTravel" class="px-3 py-1.5 rounded text-xs bg-cyan-800">继续</button>
          <button @click="returnAlongCurrentRoute" class="px-3 py-1.5 rounded text-xs bg-rose-900/80">折返</button>
        </div>
      </div>

      <div v-if="focusedSettlement" data-testid="settlement-detail" class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-3">
        <div role="application" :aria-label="`${focusedSettlement.name}局部地图`" class="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
          <svg :viewBox="focusedSettlementViewBox" class="w-full min-h-[440px]" style="background: radial-gradient(ellipse at center, #17261f 0%, #080d0b 85%);">
            <line
              v-for="road in focusedSettlement.roads"
              :key="`detail-road-${road.from}-${road.to}`"
              :x1="focusedSettlement.nodes.find(node => node.id === road.from)?.position.x"
              :y1="focusedSettlement.nodes.find(node => node.id === road.from)?.position.y"
              :x2="focusedSettlement.nodes.find(node => node.id === road.to)?.position.x"
              :y2="focusedSettlement.nodes.find(node => node.id === road.to)?.position.y"
              stroke="#64748b" stroke-width="8" stroke-linecap="round" opacity="0.55"
            />
            <g v-if="settlementPlayerMarker" :transform="`translate(${settlementPlayerMarker.x}, ${settlementPlayerMarker.y})`" pointer-events="none">
              <circle r="13" fill="#082f49" stroke="#67e8f9" stroke-width="4" />
              <circle r="4" fill="#fef3c7" />
              <text y="-19" text-anchor="middle" fill="#a5f3fc" font-size="11" font-weight="bold">
                {{ settlementPlayerMarker.traveling ? '途中' : '你' }}
              </text>
            </g>
            <g
              v-for="node in focusedSettlement.nodes"
              :key="node.id"
              :transform="`translate(${node.position.x}, ${node.position.y})`"
              class="cursor-pointer select-none"
              @click="selectedSettlementNodeId = node.id"
            >
              <circle
                :r="selectedSettlementNodeId === node.id ? 27 : 22"
                :fill="selectedSettlementNodeId === node.id ? '#92400e' : '#1e293b'"
                :stroke="settlementNodeIsPlayerLocation(node) ? '#22d3ee' : '#fbbf24'"
                :stroke-width="settlementNodeIsPlayerLocation(node) ? 5 : 2"
              />
              <text y="4" text-anchor="middle" fill="#fef3c7" font-size="13" font-weight="bold">{{ settlementNodeIcon(node.type) }}</text>
              <text y="39" text-anchor="middle" fill="#fef3c7" font-size="12" font-weight="bold">{{ node.name }}</text>
              <g v-if="settlementNodeNpcCount(node.id) > 0" transform="translate(20,-20)">
                <circle r="12" fill="#0891b2" stroke="#67e8f9" stroke-width="1.5" />
                <text y="4" text-anchor="middle" fill="white" font-size="9" font-weight="bold">{{ settlementNodeNpcCount(node.id) }}</text>
              </g>
            </g>
          </svg>
        </div>
        <aside class="bg-slate-800/80 border border-slate-700 rounded-lg p-3">
          <template v-if="selectedSettlementNode">
            <div class="text-sm font-semibold text-amber-200">{{ selectedSettlementNode.name }}</div>
            <div class="text-xs text-slate-400 mt-2">{{ selectedSettlementNode.description }}</div>
            <div class="text-xs text-cyan-300 mt-3">在场 {{ settlementNodeNpcCount(selectedSettlementNode.id) }} 人</div>
            <div v-if="selectedSettlementNpcs.length > 0" class="mt-3 border-t border-slate-700 pt-2 space-y-1">
              <div class="text-[10px] text-slate-500">当前人物</div>
              <div v-for="npc in selectedSettlementNpcs.slice(0, 8)" :key="npc.id" class="flex justify-between gap-2 text-xs">
                <span class="truncate text-slate-200">{{ npc.name }}</span>
                <span class="shrink-0 text-slate-500">{{ formatRealm(npc.realm) }}</span>
              </div>
              <div v-if="selectedSettlementNpcs.length > 8" class="text-[10px] text-slate-500">
                另有 {{ selectedSettlementNpcs.length - 8 }} 人
              </div>
            </div>
            <button
              :disabled="!playerCanEnterFocusedSettlement || !!currentPlayerTravel"
              @click="beginSettlementNodeTravel(selectedSettlementNode)"
              class="mt-3 w-full px-3 py-2 rounded text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40"
            >
              {{ settlementNodeIsPlayerLocation(selectedSettlementNode) && selectedSettlementNode.venueId ? '进入建筑' : '沿道路前往' }}
            </button>
            <div v-if="!playerCanEnterFocusedSettlement" class="text-[10px] text-slate-500 mt-2">当前仅在观察此地；需先从区域地图抵达。</div>
          </template>
          <div v-else class="text-xs text-slate-500">选择道路节点、建筑或城区，查看在场人物并规划真实路线。</div>
        </aside>
      </div>
    </div>

    <!-- ===== Cosmos 层（星图） ===== -->
    <div v-else-if="activeLayer === 'Cosmos'" class="space-y-3">
      <div class="p-3 bg-purple-900/20 rounded-lg border border-purple-700/40">
        <div class="text-sm text-purple-200 font-semibold">星界 — 御空跨星系</div>
        <div class="text-xs text-slate-400 mt-1">
          需化神境界方能御空跨越星系。当前：
          <span class="text-amber-300">{{ getCosmos(mapStore.activeCosmosId)?.name }}</span>
        </div>
      </div>
      <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
        <svg :viewBox="`0 0 800 600`" class="w-full" style="background: radial-gradient(ellipse at center, #1a0a2e 0%, #050510 80%);">
          <!-- 星系连线 -->
          <g v-for="cosmos in COSMOS_CATALOG" :key="'line-' + cosmos.id">
            <line v-for="otherId in cosmos.continentIds"
              :key="otherId"
              v-if="COSMOS_CATALOG.find(c => c.id !== cosmos.id)"
              :x1="cosmos.position.x" :y1="cosmos.position.y"
              :x2="COSMOS_CATALOG.find(c => c.id !== cosmos.id)?.position.x ?? 0"
              :y2="COSMOS_CATALOG.find(c => c.id !== cosmos.id)?.position.y ?? 0"
              stroke="rgba(168,85,247,0.2)" stroke-width="1" stroke-dasharray="4,4"
            />
          </g>
          <!-- 星系节点 -->
          <g v-for="cosmos in COSMOS_CATALOG" :key="cosmos.id"
            :transform="`translate(${cosmos.position.x}, ${cosmos.position.y})`"
            class="cursor-pointer"
            @click="mapStore.activeCosmosId === cosmos.id && switchLayer('Continent')">
            <circle r="20" :fill="cosmos.color" opacity="0.15" />
            <circle r="10" :fill="cosmos.color" opacity="0.4" />
            <circle r="5" :fill="cosmos.color"
              :stroke="mapStore.activeCosmosId === cosmos.id ? '#fbbf24' : 'none'"
              stroke-width="2" />
            <text y="35" text-anchor="middle" :fill="cosmos.color" font-size="11" font-weight="bold">{{ cosmos.name }}</text>
            <text y="48" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="7">{{ cosmos.continentIds.length }} 大陆</text>
          </g>
        </svg>
      </div>
      <div class="text-xs text-slate-500 text-center">点击当前所在星系可进入大陆视图</div>
    </div>

    <!-- ===== Continent 层（大陆图） ===== -->
    <div v-else-if="activeLayer === 'Continent'" class="space-y-3">
      <div class="p-3 bg-emerald-900/20 rounded-lg border border-emerald-700/40">
        <div class="text-sm text-emerald-200 font-semibold">大陆 — 跨大陆传送</div>
        <div class="text-xs text-slate-400 mt-1">
          元婴以上可跨大陆传送。当前：
          <span class="text-amber-300">{{ getContinent(mapStore.activeContinentId)?.name }}</span>
        </div>
      </div>
      <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-700">
        <svg viewBox="0 0 800 600" class="w-full" style="background: radial-gradient(ellipse at center, #0f1a0f 0%, #050a05 80%);">
          <!-- 传送连线 -->
          <g v-for="line in teleportLines" :key="'tp-line-' + line.id">
            <line
              :x1="line.x1" :y1="line.y1"
              :x2="line.x2" :y2="line.y2"
              stroke="rgba(34,211,238,0.15)" stroke-width="1" stroke-dasharray="3,3"
            />
          </g>
          <!-- 大陆节点 -->
          <g v-for="continent in CONTINENT_CATALOG" :key="continent.id"
            :transform="`translate(${continent.position.x}, ${continent.position.y})`"
            :class="['cursor-pointer', continent.cosmosId === mapStore.activeCosmosId ? '' : 'opacity-30']"
            @click="continent.cosmosId === mapStore.activeCosmosId && (mapStore.activeContinentId === continent.id ? switchLayer('Region') : null)">
            <circle r="18" :fill="continent.color" opacity="0.15" />
            <circle r="9" :fill="continent.color" opacity="0.5" />
            <circle r="5" :fill="continent.color"
              :stroke="mapStore.activeContinentId === continent.id ? '#fbbf24' : 'none'"
              stroke-width="2" />
            <text y="30" text-anchor="middle" :fill="continent.color" font-size="11" font-weight="bold">{{ continent.name }}</text>
            <text y="42" text-anchor="middle" fill="rgba(255,255,255,0.4)" font-size="7">{{ continent.requiredRealm }}+</text>
          </g>
        </svg>
      </div>
      <div class="text-xs text-slate-500 text-center">点击当前所在大陆可回到区域视图</div>
    </div>

    <!-- ===== Region 层（六边形网格，原有逻辑） ===== -->
    <div v-else-if="activeLayer === 'Region'">
      <!-- 当前位置信息 -->
      <div v-if="currentHex" class="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded flex items-center justify-center font-bold text-xs"
            :style="{ backgroundColor: TERRAIN_INFO[currentHex.terrain].color, color: '#fff' }">
            {{ TERRAIN_INFO[currentHex.terrain].icon }}
          </div>
          <div>
            <div class="text-sm font-semibold text-amber-200">
              {{ currentHex.landmarkName ?? TERRAIN_INFO[currentHex.terrain].name }}
            </div>
            <div class="text-xs text-slate-400">
              坐标 ({{ playerHexPos.q }}, {{ playerHexPos.r }})
              <span v-if="currentHex.landmarkType"> · {{ formatNodeType(currentHex.landmarkType) }}</span>
              <span v-if="currentPlayerTravel" class="text-amber-400"> · 途中({{ travelRemainingSegmentCount }}段)</span>
            </div>
          </div>
        </div>
        <div class="flex gap-2">
          <button v-if="canEnterCity" @click="enterCity"
            class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-md font-medium transition">
            进入{{ currentHex.landmarkName ?? '城镇' }}
          </button>
        </div>
      </div>

      <!-- 消息 -->
      <div v-if="message" class="p-2.5 rounded-lg text-xs bg-slate-700/50 border border-slate-600 text-amber-200">
        {{ message }}
      </div>

      <div v-if="currentPlayerTravel" class="p-3 rounded-lg bg-amber-950/30 border border-amber-700/60 space-y-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-sm font-semibold text-amber-200">
              {{ currentPlayerTravel.status === 'paused' ? '行程已暂停' : currentPlayerTravel.status === 'interrupted' ? '行程受阻' : '旅行途中' }}
            </div>
            <div class="text-xs text-slate-400 mt-1">
              前往 {{ spatialNodeName(currentPlayerTravel.destination.nodeId) }} · {{ currentPlayerTravel.status === 'interrupted' ? '原预计' : '预计' }} {{ formatWorldMinute(currentPlayerTravel.estimatedArrivalAtMinutes) }}
            </div>
          </div>
          <div class="flex gap-2">
            <button v-if="currentPlayerTravel.status === 'in_transit'" @click="advanceTravelOneHour" class="px-3 py-1.5 rounded text-xs bg-slate-700 hover:bg-slate-600">推进 1 小时</button>
            <button v-if="currentPlayerTravel.status === 'in_transit'" @click="pauseCurrentTravel" class="px-3 py-1.5 rounded text-xs bg-slate-700 hover:bg-slate-600">暂停</button>
            <button v-else-if="currentPlayerTravel.status === 'paused'" @click="resumeCurrentTravel" class="px-3 py-1.5 rounded text-xs bg-cyan-800 hover:bg-cyan-700">继续</button>
            <button v-if="(currentPlayerTravel.distanceTraveled ?? 0) > 0" @click="returnAlongCurrentRoute" class="px-3 py-1.5 rounded text-xs bg-rose-900/80 hover:bg-rose-800">折返</button>
            <button v-if="currentPlayerTravel.status === 'in_transit'" @click="advanceTravelToArrival" class="px-3 py-1.5 rounded text-xs bg-amber-700 hover:bg-amber-600 text-white">快进至抵达</button>
          </div>
        </div>
        <div class="h-1.5 bg-slate-700 rounded overflow-hidden">
          <div class="h-full bg-amber-500" :style="{ width: `${travelProgress}%` }"></div>
        </div>
        <div class="text-[10px] text-slate-500">当前为可保存的 TravelState；暂停和读档不会重复抵达。</div>
      </div>

      <!-- 选中格操作：左键只选中，避免误触移动；右键可直接前往 -->
      <div v-if="selectedHex" class="p-3 rounded-lg bg-cyan-900/20 border border-cyan-700/50 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="text-sm text-cyan-200 font-semibold">
            已选：{{ selectedHex.explored ? (selectedHex.landmarkName ?? TERRAIN_INFO[selectedHex.terrain].name) : '未探索区域' }}
          </div>
          <div class="text-xs text-slate-400 mt-1">
            坐标 ({{ selectedHex.q }}, {{ selectedHex.r }})
            <span v-if="selectedHex.explored"> · {{ TERRAIN_INFO[selectedHex.terrain].name }}</span>
          </div>
        </div>
        <div class="flex shrink-0 gap-2">
          <button
            :disabled="selectedHexIsCurrent || !!currentPlayerTravel"
            @click="moveToSelectedHex"
            class="px-3 py-1.5 rounded text-xs font-medium bg-cyan-700 hover:bg-cyan-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {{ currentPlayerTravel ? '旅行途中' : selectedHexIsCurrent ? '当前位置' : '前往此处' }}
          </button>
          <button
            v-if="selectedHex.landmarkId && getSettlement(selectedHex.landmarkId)"
            @click="openSettlementDetail(selectedHex.landmarkId!)"
            class="px-3 py-1.5 rounded text-xs font-medium bg-emerald-800 hover:bg-emerald-700 text-white"
          >
            查看内部
          </button>
          <button
            @click="selectedHexPos = null"
            class="px-3 py-1.5 rounded text-xs text-slate-300 bg-slate-700 hover:bg-slate-600"
          >
            取消
          </button>
        </div>
      </div>

      <!-- 传送阵面板 -->
      <div v-if="teleportNodeHere" class="p-3 bg-purple-900/30 rounded-lg border border-purple-600/50">
        <div class="flex items-center justify-between mb-2">
          <span class="text-purple-300 text-sm font-semibold">传送阵 · {{ teleportNodeHere.name }}</span>
          <span class="text-xs text-slate-400">{{ teleportNodeHere.requiredRealm }}+ · {{ teleportNodeHere.spiritStoneCost }} 灵石</span>
        </div>
        <div v-if="teleportMessage" class="text-xs text-amber-300 mb-2">{{ teleportMessage }}</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="target in availableTeleports" :key="target.id"
            @click="doTeleport(target.id)"
            class="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded transition">
            → {{ target.name }} ({{ target.spiritStoneCost }}灵石)
          </button>
        </div>
      </div>

      <!-- NPC 偶遇 -->
      <div v-if="activeRoadEncounter && activeRoadEncounterNpc" data-testid="road-encounter-card"
        class="p-4 bg-slate-900/95 rounded-lg border border-orange-500/70 shadow-lg shadow-orange-950/30">
        <div class="flex items-center justify-between gap-3">
          <span class="text-orange-300 text-sm font-semibold">
            {{ activeRoadEncounter.intent === 'ambush' ? '途中截杀' : activeRoadEncounter.intent === 'challenge' ? '途中挑战' : '途中相逢' }}
          </span>
          <span class="text-[10px] text-slate-500">世界时间已停在接触时刻</span>
        </div>
        <p class="text-sm text-slate-200 mt-2">
          <span class="font-semibold text-amber-200">{{ activeRoadEncounterNpc.name }}</span>
          <span class="ml-2 text-xs text-slate-400">{{ formatRealm(activeRoadEncounterNpc.realm) }}</span>
        </p>
        <p class="text-xs text-slate-400 mt-1">
          {{ activeRoadEncounter.intent === 'ambush'
            ? '对方有明确敌意，行程已暂停。'
            : activeRoadEncounter.intent === 'challenge'
              ? '对方拦住去路，想与你一战。'
              : '对方在同行途中主动上前搭话。' }}
        </p>
        <div v-if="activeRoadEncounter.status === 'awaiting_decision'" class="flex flex-wrap gap-2 mt-3">
          <button v-if="activeRoadEncounter.availableChoices.includes('talk')" @click="chooseActiveRoadEncounter('talk')"
            class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded">交谈</button>
          <button v-if="activeRoadEncounter.availableChoices.includes('avoid')" @click="chooseActiveRoadEncounter('avoid')"
            class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs rounded">避让</button>
          <button v-if="activeRoadEncounter.availableChoices.includes('fight')" @click="chooseActiveRoadEncounter('fight')"
            class="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs rounded">迎战</button>
        </div>
        <button v-else @click="resumeActiveRoadEncounterBattle"
          class="mt-3 px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs rounded">继续未完成的战斗</button>
      </div>

      <!-- 旧的局部随机偶遇仅作兼容；正式道路接触使用上方持久化相遇。 -->
      <div v-if="pendingNpc" class="p-3 bg-amber-900/30 rounded-lg border border-amber-600/50">
        <span class="text-amber-300 text-sm font-semibold">偶遇修士</span>
        <p class="text-sm text-slate-200 mt-1">
          <span class="font-semibold text-amber-200">{{ pendingNpc.name }}</span>
          <span class="ml-2 text-xs text-slate-400">{{ formatRealm(pendingNpc.realm) }}</span>
        </p>
        <div class="flex gap-2 mt-2">
          <button @click="acceptNpc" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded">上前搭话</button>
          <button @click="declineNpc" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded">无视离开</button>
        </div>
      </div>

      <!-- 遭遇战 -->
      <div v-if="pendingBattle" class="p-3 bg-red-900/30 rounded-lg border border-red-600/50">
        <span class="text-red-300 text-sm font-semibold">遭遇危险</span>
        <p class="text-sm text-slate-300 mt-1">{{ pendingBattle.description }}</p>
        <div class="flex gap-2 mt-2">
          <button @click="acceptBattle" class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded">迎战</button>
          <button @click="declineBattle" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded">逃跑</button>
        </div>
      </div>

      <!-- 奇遇 -->
      <AdventureEventCard v-if="pendingAdventure" :event="pendingAdventure" @close="closeAdventure" />

      <!-- 观察设置只改变投影，不暂停或改写世界中的 NPC。 -->
      <div class="p-2.5 bg-slate-800/70 border border-slate-700 rounded-lg space-y-2">
        <div class="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span class="text-slate-500 mr-1">NPC 路线</span>
          <button
            v-for="option in [
              { value: 'off', label: '关闭' },
              { value: 'focused', label: '选中与关注' },
              { value: 'all_known', label: '全部可知' },
            ] as const"
            :key="option.value"
            @click="mapStore.setNpcRouteDisplayMode(option.value)"
            :class="[
              'px-2 py-1 rounded border transition',
              observationPreferences.npcRoutes === option.value
                ? 'border-amber-500 bg-amber-950/40 text-amber-200'
                : 'border-slate-700 bg-slate-900/40 text-slate-400',
            ]"
          >{{ option.label }}</button>
          <span class="text-slate-600 ml-2">人名</span>
          <button
            v-for="option in [
              { value: 'aggregate', label: '聚合' },
              { value: 'selected', label: '仅选中' },
              { value: 'all_known', label: '可知全部' },
            ] as const"
            :key="option.value"
            @click="mapStore.setNpcNameDisplayMode(option.value)"
            :class="[
              'px-2 py-1 rounded border transition',
              observationPreferences.npcNames === option.value
                ? 'border-cyan-500 bg-cyan-950/40 text-cyan-200'
                : 'border-slate-700 bg-slate-900/40 text-slate-400',
            ]"
          >{{ option.label }}</button>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 text-[10px]">
          <span class="text-slate-500 mr-1">观察层</span>
          <button
            v-for="layer in [
              { key: 'people', label: '人物活动' },
              { key: 'roads', label: '道路通行' },
              { key: 'spiritQi', label: '灵气/资源' },
              { key: 'factions', label: '势力范围' },
              { key: 'dangers', label: '危险/异变' },
            ] as const"
            :key="layer.key"
            @click="mapStore.setObservationLayer(layer.key, !observationPreferences[layer.key])"
            :aria-pressed="observationPreferences[layer.key]"
            :class="[
              'px-2 py-1 rounded border transition',
              observationPreferences[layer.key]
                ? 'border-emerald-600 bg-emerald-950/35 text-emerald-200'
                : 'border-slate-700 bg-slate-900/40 text-slate-500',
            ]"
          >{{ layer.label }}</button>
          <span class="ml-auto text-slate-500">
            {{ isGodObserver ? '上帝：全知投影' : '角色：仅显示当前已知' }}
          </span>
        </div>
      </div>

      <!-- 六边形网格（固定高度容器 + 内部拖动平移） -->
      <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-3">
      <div class="min-w-0">
      <div
        ref="mapViewport"
        role="application"
        aria-label="区域观察地图"
        tabindex="0"
        class="bg-slate-900 rounded-lg overflow-hidden border border-slate-700 relative select-none"
        style="height: 480px; cursor: grab;"
        :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointercancel="onDragEnd"
        @pointerleave="onDragEnd"
        @wheel.prevent="onMapWheel"
      >
        <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
          :style="{
            background: 'radial-gradient(ellipse at center, #152030 0%, #0a0f1a 80%)',
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${mapZoom})`,
            transformOrigin: '0 0',
            width: SVG_W + 'px',
            height: SVG_H + 'px',
            minWidth: '100%',
          }"
          class="block">
          <g v-for="hex in allHexes" :key="`${hex.q},${hex.r}`"
            role="button"
            :aria-label="`地图格 ${hex.q},${hex.r}${hex.landmarkName ? ` ${hex.landmarkName}` : ''}`"
            @click="handleHexClick(hex.q, hex.r)"
            @contextmenu="handleHexContextMenu($event, hex.q, hex.r)"
            :transform="`translate(${hexToPixel(hex.q, hex.r).x}, ${hexToPixel(hex.q, hex.r).y})`"
            :style="{ cursor: isAdjacent(hex.q, hex.r) ? 'pointer' : hex.explored ? 'default' : 'pointer' }">
            <polygon :points="hexPolygonPoints(0, 0)"
              :fill="getTerrainColor(hex)"
              :stroke="isPlayerHere(hex.q, hex.r) ? '#fbbf24'
                : selectedHexPos?.q === hex.q && selectedHexPos?.r === hex.r ? '#f97316'
                : isAdjacent(hex.q, hex.r) ? '#22d3ee'
                : 'rgba(50,60,80,0.3)'"
              :stroke-width="isPlayerHere(hex.q, hex.r) ? 2.5
                : selectedHexPos?.q === hex.q && selectedHexPos?.r === hex.r ? 2.5
                : isAdjacent(hex.q, hex.r) ? 2
                : 0.5"
              :opacity="hex.explored ? 1 : 0.5"
            />
            <text v-if="hex.explored && semanticScale !== 'macro'" y="3" text-anchor="middle"
              :fill="hex.landmarkId ? '#fef3c7' : 'rgba(255,255,255,0.4)'"
              font-size="9" font-weight="bold"
              class="pointer-events-none select-none">{{ getTerrainIcon(hex) }}</text>
            <text v-if="hex.explored && hex.landmarkName" y="14" text-anchor="middle"
              fill="#fde68a" font-size="6"
              class="pointer-events-none select-none">{{ hex.landmarkName }}</text>
            <g v-if="isPlayerHere(hex.q, hex.r) && playerStore.character"
              class="pointer-events-none select-none">
              <circle r="7" fill="#fbbf24" stroke="#fef3c7" stroke-width="1.5" />
              <text y="2.5" text-anchor="middle" fill="#0f172a" font-size="7" font-weight="bold">我</text>
            </g>
            <circle v-if="isAdjacent(hex.q, hex.r) && !isPlayerHere(hex.q, hex.r)"
              r="3" fill="rgba(34,211,238,0.5)" class="pointer-events-none animate-pulse" />
          </g>

          <!-- 真实空间连接图；角色只看到已探索端点之间的道路。 -->
          <g v-for="road in roadOverlays" :key="`road-${road.link.id}`" class="pointer-events-none">
            <line
              :x1="hexToPixel(road.from.q, road.from.r).x"
              :y1="hexToPixel(road.from.q, road.from.r).y"
              :x2="hexToPixel(road.to.q, road.to.r).x"
              :y2="hexToPixel(road.to.q, road.to.r).y"
              stroke="#94a3b8" stroke-width="2.2" opacity="0.48"
            />
          </g>

          <!-- 已有 nodeSpiritQi 与确定性灵脉地形。 -->
          <g v-for="qi in spiritQiOverlays" :key="qi.id" class="pointer-events-none">
            <circle
              :cx="hexToPixel(qi.position.q, qi.position.r).x"
              :cy="hexToPixel(qi.position.q, qi.position.r).y"
              :r="7 + qi.value / 18"
              fill="rgba(34,211,238,0.12)" stroke="#22d3ee" stroke-width="1"
            />
            <text
              v-if="semanticScale !== 'macro'"
              :x="hexToPixel(qi.position.q, qi.position.r).x"
              :y="hexToPixel(qi.position.q, qi.position.r).y + 18"
              text-anchor="middle" fill="#67e8f9" font-size="6"
            >{{ qi.name }} · {{ qi.value }}</text>
          </g>

          <!-- 势力领地只来自 WorldState.factions.territories。 -->
          <g v-for="territory in factionOverlays" :key="territory.id" class="pointer-events-none">
            <circle
              :cx="hexToPixel(territory.position.q, territory.position.r).x"
              :cy="hexToPixel(territory.position.q, territory.position.r).y"
              r="16" fill="none" :stroke="territory.color" stroke-width="2.5" opacity="0.75"
            />
            <text
              v-if="semanticScale !== 'macro'"
              :x="hexToPixel(territory.position.q, territory.position.r).x"
              :y="hexToPixel(territory.position.q, territory.position.r).y - 19"
              text-anchor="middle" :fill="territory.color" font-size="6" font-weight="bold"
            >{{ territory.name }}</text>
          </g>

          <!-- 玩家导航永远独立于 NPC 路线开关。 -->
          <g v-if="playerTravelOverlay" data-testid="player-travel-route" class="pointer-events-none">
            <polyline
              :points="playerTravelPolylinePoints"
              fill="none"
              stroke="#22d3ee" stroke-width="3" stroke-dasharray="7,4" opacity="0.95"
            />
            <circle
              :cx="hexToPixel(playerTravelOverlay.current.q, playerTravelOverlay.current.r).x"
              :cy="hexToPixel(playerTravelOverlay.current.q, playerTravelOverlay.current.r).y"
              r="5" fill="#f8fafc" stroke="#22d3ee" stroke-width="2"
            />
          </g>

          <!-- 权威连续旅行路线：线段只是 TravelState 的观察投影，不改变位置。 -->
          <g v-for="travel in npcTravelOverlays" :key="`travel-${travel.npc.id}`"
            data-testid="npc-travel-route"
            class="pointer-events-none select-none">
            <polyline
              :points="routePolylinePoints(travel.points)"
              fill="none"
              stroke="#f59e0b" stroke-width="2" stroke-dasharray="5,4" opacity="0.7"
            />
            <circle
              v-if="travel.current"
              :cx="hexToPixel(travel.current.q, travel.current.r).x"
              :cy="hexToPixel(travel.current.q, travel.current.r).y"
              r="3.5" fill="#fef3c7" stroke="#f59e0b" stroke-width="1.5"
            />
            <text v-if="semanticScale !== 'macro'"
              :x="hexToPixel(travel.destination?.q ?? 0, travel.destination?.r ?? 0).x"
              :y="hexToPixel(travel.destination?.q ?? 0, travel.destination?.r ?? 0).y - 10"
              text-anchor="middle" fill="#fcd34d" font-size="6"
            >{{ travel.npc.name }} · {{ travel.eta }}</text>
          </g>

          <!-- 动态空间特征：只绘制当前观察者有权看到的真实差量。 -->
          <g v-for="overlay in visibleFeatureOverlays" :key="`feature-${overlay.feature.id}`"
            class="cursor-pointer select-none"
            @click.stop="selectedHexPos = overlay.position">
            <circle
              :cx="hexToPixel(overlay.position.q, overlay.position.r).x"
              :cy="hexToPixel(overlay.position.q, overlay.position.r).y"
              :r="overlay.feature.scope.radius ? Math.max(8, overlay.feature.scope.radius * 4) : 9"
              fill="rgba(168,85,247,0.16)" stroke="#c084fc" stroke-width="1.5" stroke-dasharray="3,2"
            />
            <text
              :x="hexToPixel(overlay.position.q, overlay.position.r).x"
              :y="hexToPixel(overlay.position.q, overlay.position.r).y - 12"
              text-anchor="middle" fill="#e9d5ff" font-size="7" font-weight="bold"
            >{{ featureTypeLabel[overlay.feature.type] }} · {{ overlay.feature.lifecycle }}</text>
          </g>

          <!-- NPC 聚合标记（上帝视角：人数 + 最高境界色） -->
          <g v-for="agg in npcAggregates" :key="`npcagg-${agg.q}-${agg.r}`"
            :transform="`translate(${hexToPixel(agg.q, agg.r).x}, ${hexToPixel(agg.q, agg.r).y})`"
            class="pointer-events-none select-none">
            <circle :r="4 + Math.min(agg.count, 8)" :fill="agg.color" fill-opacity="0.55"
              :stroke="agg.color" stroke-width="1" />
            <text y="3" text-anchor="middle" fill="#fff" font-size="6" font-weight="bold"
              v-if="agg.count > 1">{{ agg.count }}</text>
          </g>

          <!-- NPC 精细标记（沉浸视角：玩家附近，人形 + 姓名） -->
          <g v-for="near in nearbyNpcs" :key="`npcnear-${near.q}-${near.r}-${near.npc.id}`"
            :transform="`translate(${hexToPixel(near.q, near.r).x + near.offsetX}, ${hexToPixel(near.q, near.r).y + near.offsetY})`"
            class="pointer-events-auto cursor-pointer select-none"
            @mouseenter="hoveredNpcId = near.npc.id"
            @mouseleave="hoveredNpcId = null"
            @click.stop="inspectNearbyNpc(near.npc)"
            @contextmenu.stop.prevent="inspectNearbyNpc(near.npc)">
            <circle r="5" :fill="realmColor(near.npc.realm)" stroke="#0f172a" stroke-width="1" />
            <text v-if="shouldShowNpcLabel(near.npc.id)" y="16" text-anchor="middle" :fill="realmColor(near.npc.realm)" font-size="7"
              font-weight="bold">{{ near.npc.name }}</text>
          </g>
          <g v-for="overflow in npcOverflowAggregates" :key="`npc-overflow-${overflow.q}-${overflow.r}`"
            :transform="`translate(${hexToPixel(overflow.q, overflow.r).x}, ${hexToPixel(overflow.q, overflow.r).y})`"
            class="pointer-events-none select-none">
            <circle r="8" fill="#0f172a" stroke="#67e8f9" stroke-width="1.5" />
            <text y="3" text-anchor="middle" fill="#cffafe" font-size="6" font-weight="bold">+{{ overflow.hidden }}</text>
          </g>
        </svg>
        <div class="absolute top-2 left-2 flex items-center gap-1" @pointerdown.stop @click.stop>
          <button aria-label="放大地图" @click="zoomBy(1.2)" class="w-7 h-7 rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:border-amber-500">＋</button>
          <button aria-label="缩小地图" @click="zoomBy(1 / 1.2)" class="w-7 h-7 rounded bg-slate-800/90 border border-slate-600 text-slate-100 hover:border-amber-500">－</button>
          <button @click="fitMapView" class="h-7 px-2 rounded bg-slate-800/90 border border-slate-600 text-[10px] text-slate-200 hover:border-amber-500">适配视野</button>
          <button @click="centerMapOnPlayer" class="h-7 px-2 rounded bg-slate-800/90 border border-slate-600 text-[10px] text-slate-200 hover:border-cyan-500">
            {{ isGodObserver ? '回到焦点' : '回到人物' }}
          </button>
        </div>
        <div class="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded bg-slate-950/80 border border-slate-700 text-[10px] text-slate-300 pointer-events-none">
          {{ semanticScaleLabel }} · {{ Math.round(mapZoom * 100) }}%
          <span v-if="semanticScale === 'place'" class="text-slate-500"> · 选中有内部结构的地点可继续下钻</span>
        </div>
        <div v-if="currentPlayerTravel" class="absolute top-2 right-2 px-2 py-1 bg-amber-900/70 rounded text-xs text-amber-200">
          旅行途中 · {{ Math.round(travelProgress) }}%
        </div>
      </div>
      </div>

      <!-- 地图内人物观察器：选中不切走地图，明确按钮才进入互动页。 -->
      <aside class="bg-slate-800/80 border border-slate-700 rounded-lg p-3 min-h-[260px] flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
          <div class="text-sm font-semibold text-amber-200">人物观察器</div>
          <span class="text-[10px] text-slate-500">{{ mapNpcList.length }} 位在册</span>
        </div>
        <input
          v-model="npcSearch"
          placeholder="搜索当前大陆具名 NPC…"
          class="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-600"
        >
        <div class="max-h-36 overflow-y-auto space-y-1">
          <button
            v-for="npc in mapNpcList"
            :key="npc.id"
            @click="inspectNpc(npc)"
            class="w-full text-left px-2 py-1.5 rounded border transition"
            :class="selectedNpcId === npc.id ? 'border-amber-600 bg-amber-900/30' : 'border-transparent bg-slate-700/40 hover:border-slate-600'"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="text-xs text-slate-200 truncate">{{ npc.name }}</span>
              <span class="text-[10px]" :style="{ color: realmColor(npc.realm) }">{{ formatRealm(npc.realm) }}</span>
            </div>
            <div class="text-[10px] text-slate-500 truncate">
              {{ npc.travel?.status === 'in_transit' ? `途中 · ETA ${formatWorldMinute(npc.travel.estimatedArrivalAtMinutes)}` : spatialNodeName(npc.spatialAddress?.nodeId) }}
            </div>
          </button>
          <div v-if="mapNpcList.length === 0" class="text-[10px] text-slate-500 py-2 text-center">当前观察范围没有匹配人物</div>
        </div>

        <div v-if="selectedNpc" class="border-t border-slate-700 pt-2 space-y-2">
          <div class="flex items-start justify-between gap-2">
            <div>
              <div class="text-sm text-amber-100 font-semibold">{{ selectedNpc.name }}</div>
              <div class="text-[10px] text-slate-400">{{ formatRealm(selectedNpc.realm) }} · {{ selectedNpcLocation }}</div>
            </div>
            <button
              @click="appStore.toggleFollowNpc(selectedNpc.id)"
              class="text-[10px] px-1.5 py-0.5 rounded border"
              :class="appStore.isWatchingNpc(selectedNpc.id) ? 'border-amber-700 text-amber-300 bg-amber-900/30' : 'border-slate-600 text-slate-400'"
            >{{ appStore.isWatchingNpc(selectedNpc.id) ? '★ 已关注' : '☆ 关注' }}</button>
          </div>
          <div v-if="selectedNpc.travel?.status === 'in_transit'" class="text-[10px] text-amber-300">
            行程至 {{ spatialNodeName(selectedNpc.travel.destination.nodeId) }} · {{ formatWorldMinute(selectedNpc.travel.estimatedArrivalAtMinutes) }} 抵达
          </div>
          <div v-if="isGodObserver" class="text-[10px] text-slate-400">
            当前意图：{{ selectedNpc.brain?.currentGoal?.kind ?? selectedNpc.mind?.nextAction?.type ?? '暂无公开意图' }}
          </div>
          <div v-else class="text-[10px] text-slate-500">角色视角不显示人物内部计划，只能依据行动与已知事实判断。</div>
          <button v-if="isGodObserver" @click="grantSelectedNpcAid" class="w-full px-2 py-1 bg-amber-800 hover:bg-amber-700 rounded text-[10px] text-amber-100">
            天道赐予 10 灵石（每月一次）
          </button>
          <div v-if="godInterventionMessage" class="text-[10px]" :class="godInterventionMessage.startsWith('已向') ? 'text-emerald-300' : 'text-rose-300'">
            {{ godInterventionMessage }}
          </div>
          <button @click="openNpcInteraction" class="w-full px-2 py-1 bg-indigo-800 hover:bg-indigo-700 rounded text-[10px] text-indigo-100">
            进入互动（离开地图）
          </button>
        </div>
      </aside>
      </div>

      <!-- 地图时间线：附近动态与选中人物事实并列，均为已提交世界记录。 -->
      <div class="bg-slate-800/70 border border-slate-700 rounded-lg p-2">
        <div class="flex items-center gap-1 mb-2">
          <button @click="timelineMode = 'nearby'" :class="['px-2 py-1 rounded text-[10px]', timelineMode === 'nearby' ? 'bg-cyan-800 text-cyan-100' : 'text-slate-400 bg-slate-700/40']">附近动态</button>
          <button @click="timelineMode = 'facts'" :class="['px-2 py-1 rounded text-[10px]', timelineMode === 'facts' ? 'bg-amber-800 text-amber-100' : 'text-slate-400 bg-slate-700/40']">人物事实</button>
          <span v-if="selectedNpc" class="ml-auto text-[10px] text-slate-500">{{ selectedNpc.name }}</span>
        </div>
        <div v-if="timelineMode === 'nearby'" class="grid sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
          <div v-for="event in nearbyTimeline" :key="event.id" class="text-[10px] text-slate-400 bg-slate-900/50 rounded p-1.5">
            <span class="text-slate-500">{{ event.year }}年{{ event.month }}月</span> · {{ event.title }}
          </div>
          <div v-if="nearbyTimeline.length === 0" class="text-[10px] text-slate-500">附近尚无已记录动态</div>
        </div>
        <div v-else class="grid sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
          <div v-for="fact in selectedNpcRecentFacts" :key="fact.factId" class="text-[10px] text-slate-400 bg-slate-900/50 rounded p-1.5">
            <span class="text-slate-500">{{ fact.at.year }}年{{ fact.at.month }}月</span> · {{ fact.title }}
          </div>
          <div v-for="event in selectedNpcRecentEvents" :key="`event-${event.id}`" class="text-[10px] text-slate-500 bg-slate-900/50 rounded p-1.5">
            {{ event.title }}
          </div>
          <div v-if="selectedNpcRecentFacts.length === 0 && selectedNpcRecentEvents.length === 0" class="text-[10px] text-slate-500">尚无可解释事实</div>
        </div>
      </div>

      <!-- 图例 -->
      <div class="flex flex-wrap gap-2 text-xs text-slate-400 px-1">
        <div v-for="t in legendTerrains" :key="t" class="flex items-center gap-1">
          <span class="w-4 h-4 rounded flex items-center justify-center text-[7px] font-bold"
            :style="{ backgroundColor: TERRAIN_INFO[t].color, color: '#fff' }">{{ TERRAIN_INFO[t].icon }}</span>
          {{ TERRAIN_INFO[t].name }}
        </div>
        <div class="flex items-center gap-1">
          <span class="w-2.5 h-2.5 rounded-full bg-cyan-400 opacity-50"></span>
          可移动
        </div>
      </div>
      <div class="text-xs text-slate-500 text-center">
        左键选择格子 · 右键或“前往此处”移动 · 拖动平移 · 滚轮缩放 · 观察不会推进世界
      </div>
    </div>
  </div>
</template>
