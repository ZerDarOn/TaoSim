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
import { ref, computed, onMounted, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { useMapStore } from '@/stores/map';
import {
  generateWorldGrid, moveOneStep, findPath, findLandmarkPos,
  getHexNeighbors, hexDistance, TERRAIN_INFO,
  applyExploredCache, collectExplored,
  COSMOS_CATALOG, CONTINENT_CATALOG, TELEPORT_GRAPH,
  getTeleportNodeAt, getContinent, getCosmos,
  TravelService, VenueService,
  npcSpatialIndex,
  type WorldHexGrid, type WorldHex, type HexTerrain, type HexMoveEvent,
} from '@taosim/engine';
import type { Character, MapLayer, NpcRecord } from '@taosim/contracts';
import type { AdventureEvent } from '@taosim/engine';
import { AdventureEngine, NPCGenerator } from '@taosim/engine';
import { formatRealm } from '@/utils/i18n-game';
import { useEventLogStore } from '@/stores/event-log';
import { useAppStore } from '@/stores/app';
import AdventureEventCard from './AdventureEventCard.vue';
import VenuePanel from './VenuePanel.vue';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const mapStore = useMapStore();
const eventLog = useEventLogStore();
const appStore = useAppStore();

// ---- 当前层级 ----
const activeLayer = computed(() => mapStore.activeLayer);

const layerBreadcrumb = computed(() => {
  const cosmos = getCosmos(mapStore.activeCosmosId);
  const continent = getContinent(mapStore.activeContinentId);
  return [
    { layer: 'Cosmos' as MapLayer, name: cosmos?.name ?? '星系' },
    { layer: 'Continent' as MapLayer, name: continent?.name ?? '大陆' },
    { layer: 'Region' as MapLayer, name: '区域' },
    ...(mapStore.activeVenueId ? [{ layer: 'Venue' as MapLayer, name: '场所' }] : []),
  ];
});

function switchLayer(layer: MapLayer) {
  // 不能跳过当前层级直接到更深层
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

// 初始化：如果 currentNodeId 有对应地标，定位到那里
onMounted(() => {
  syncPlayerPosToLandmark();
});

// 切换大陆时重建网格 + 同步位置
watch(() => mapStore.activeContinentId, (newId) => {
  worldGrid.value = getOrCreateGrid(newId);
  playerHexPos.value = { q: mapStore.hexPos.q, r: mapStore.hexPos.r };
  syncPlayerPosToLandmark();
});

function syncPlayerPosToLandmark() {
  const pos = findLandmarkPos(worldGrid.value, playerStore.currentNodeId);
  if (pos) {
    playerHexPos.value = pos;
    mapStore.setHexPos(pos);
    markExploredAround(pos.q, pos.r);
  }
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

// ---- 地图拖动平移 ----
const panOffset = ref({ x: 0, y: 0 });
const isDragging = ref(false);
let dragStart = { x: 0, y: 0, panX: 0, panY: 0 };

function onDragStart(e: PointerEvent) {
  // 不在格子上才允许拖动（避免和点击冲突）
  isDragging.value = true;
  dragStart = { x: e.clientX, y: e.clientY, panX: panOffset.value.x, panY: panOffset.value.y };
}

function onDragMove(e: PointerEvent) {
  if (!isDragging.value) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  panOffset.value = { x: dragStart.panX + dx, y: dragStart.panY + dy };
}

function onDragEnd() {
  isDragging.value = false;
}

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

// 上帝视角：每格聚合标记（人数 + 最高境界色）
const npcAggregates = computed(() => {
  const out: Array<{ q: number; r: number; count: number; color: string }> = [];
  for (const [key, list] of npcByHex.value) {
    const [q, r] = key.split(',').map(Number);
    let color = realmColor('QiRefinement_1');
    for (const n of list) color = realmColor(n.realm);
    out.push({ q: q!, r: r!, count: list.length, color });
  }
  return out;
});

// 沉浸视角：玩家所在格 + 邻格 NPC 精细标记（人形 + 姓名；稍远不可见——修仙神秘感）
const nearbyNpcs = computed(() => {
  const pos = playerHexPos.value;
  const around = [{ q: pos.q, r: pos.r }, ...getHexNeighbors(pos.q, pos.r)];
  const out: Array<{ q: number; r: number; npc: NpcRecord }> = [];
  for (const p of around) {
    const list = npcByHex.value.get(`${p.q},${p.r}`) ?? [];
    for (const n of list) out.push({ q: p.q, r: p.r, npc: n });
  }
  return out;
});

function realmColor(realm: string): string {
  if (realm.startsWith('NascentSoul')) return '#a78bfa'; // 元婴紫
  if (realm.startsWith('GoldenCore')) return '#fbbf24';   // 金丹金
  if (realm.startsWith('Foundation')) return '#60a5fa';   // 筑基蓝
  return '#22d3ee';                                       // 炼气青
}

function isAdjacent(q: number, r: number): boolean {
  return neighborPositions.value.some(n => n.q === q && n.r === r);
}

function isPlayerHere(q: number, r: number): boolean {
  return playerHexPos.value.q === q && playerHexPos.value.r === r;
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
  if (pendingNpc.value || pendingBattle.value || pendingAdventure.value) return;
  if (isPlayerHere(q, r)) return;
  if (isAdjacent(q, r)) stepMove(q, r);
  else startAutoTravel(q, r);
}

function stepMove(targetQ: number, targetR: number) {
  if (!playerStore.character) return;
  const result = moveOneStep(worldGrid.value, playerHexPos.value, targetQ, targetR, playerStore.character);
  if (!result || !result.success) {
    message.value = result?.reason ?? '无法移动';
    return;
  }

  playerHexPos.value = { q: targetQ, r: targetR };
  mapStore.setHexPos({ q: targetQ, r: targetR });
  // 持久化已探索
  mapStore.markExplored(mapStore.activeContinentId, [{ q: targetQ, r: targetR }, ...getHexNeighbors(targetQ, targetR)]);
  const timeResult = playerStore.advanceTime(result.daysPassed);
  if (timeResult.died) return; // 玩家寿元耗尽，AppRoot 会切换到 GameOverScreen
  processEvents(result.events);
  updateLandmarkPos();
}

function startAutoTravel(targetQ: number, targetR: number) {
  if (!playerStore.character) return;
  const path = findPath(worldGrid.value, playerHexPos.value, { q: targetQ, r: targetR });
  if (!path || path.length < 2) {
    message.value = '无法找到路径';
    return;
  }
  pendingPath.value = path.slice(1);
  continueAutoTravel();
}

function continueAutoTravel() {
  if (!pendingPath.value || pendingPath.value.length === 0 || !playerStore.character) {
    pendingPath.value = null;
    return;
  }
  if (pendingNpc.value || pendingBattle.value || pendingAdventure.value) return;

  const next = pendingPath.value[0]!;
  const result = moveOneStep(worldGrid.value, playerHexPos.value, next.q, next.r, playerStore.character);
  if (!result || !result.success) {
    pendingPath.value = null;
    message.value = result?.reason ?? '路径中断';
    return;
  }

  playerHexPos.value = { q: next.q, r: next.r };
  mapStore.setHexPos({ q: next.q, r: next.r });
  mapStore.markExplored(mapStore.activeContinentId, [{ q: next.q, r: next.r }, ...getHexNeighbors(next.q, next.r)]);
  const timeResult = playerStore.advanceTime(result.daysPassed);
  if (timeResult.died) {
    pendingPath.value = null; // 玩家死亡，中断自动寻路
    return;
  }
  processEvents(result.events);
  updateLandmarkPos();

  pendingPath.value = pendingPath.value.slice(1);

  const hasPending = pendingNpc.value || pendingBattle.value || pendingAdventure.value;
  if (!hasPending && pendingPath.value.length > 0) {
    setTimeout(() => continueAutoTravel(), 200);
  } else if (pendingPath.value.length === 0) {
    pendingPath.value = null;
    message.value = '已抵达目的地';
  }
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
        eventLog.addEvent('social', `偶遇修士 · ${evt.npc?.name ?? '未知'}`, evt.description);
        break;
      case 'battle':
        pendingBattle.value = evt;
        eventLog.addEvent('combat', '遭遇妖兽', evt.description);
        break;
      case 'material_found':
        if (playerStore.character && evt.materialId) {
          const inv = playerStore.character.inventory;
          const existing = inv.find(s => s.item.id === evt.materialId);
          if (existing) existing.count++;
          else inv.push({ item: { id: evt.materialId!, name: evt.materialId!, tier: 1, type: 'Material', quality: 'Common', attributes: {} }, count: 1 });
        }
        message.value = `获得材料: ${evt.materialId}`;
        eventLog.addEvent('discovery', '发现材料', `获得 ${evt.materialId}`);
        break;
      case 'discovery':
        if (playerStore.character) {
          const adventureEvt = AdventureEngine.rollEvent(playerStore.character);
          if (adventureEvt) pendingAdventure.value = adventureEvt;
        }
        eventLog.addEvent('discovery', '灵光一闪', evt.description);
        break;
      case 'landmark_reached':
        message.value = evt.description;
        eventLog.addEvent('travel', `抵达 · ${evt.title.replace('抵达', '').trim()}`, evt.description);
        break;
    }
  }
}

function updateLandmarkPos() {
  const hex = worldGrid.value.hexes.get(`${playerHexPos.value.q},${playerHexPos.value.r}`);
  if (hex?.landmarkId) {
    playerStore.setCurrentNode(hex.landmarkId);
  }
}

const currentHex = computed(() =>
  worldGrid.value.hexes.get(`${playerHexPos.value.q},${playerHexPos.value.r}`),
);

// ---- NPC / 战斗 / 奇遇处理 ----
function acceptNpc() {
  if (!pendingNpc.value) return;
  playerStore.setCurrentNPC(pendingNpc.value);
  uiStore.setTab('npc');
  pendingNpc.value = null;
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}
function declineNpc() {
  pendingNpc.value = null;
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}
function acceptBattle() {
  if (!pendingBattle.value || !playerStore.character) return;
  const tier = currentHex.value?.landmarkTier ?? 1;
  const enemy = NPCGenerator.generate(tier, Date.now());
  enemy.name = ['赤眼狼妖', '石魔傀儡', '腐毒蛇君', '幽影鬼面'][Math.floor(Math.random() * 4)] ?? '妖兽';
  uiStore.startBattle({ enemy, type: 'encounter', title: `遭遇 · ${enemy.name}`, description: pendingBattle.value.description });
  pendingBattle.value = null;
}
function declineBattle() {
  if (playerStore.character) {
    const cost = Math.round(playerStore.character.maxHp * 0.05);
    playerStore.character.hp = Math.max(1, playerStore.character.hp - cost);
    message.value = `逃跑成功，损失 ${cost} 气血`;
  }
  pendingBattle.value = null;
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}
function closeAdventure() {
  pendingAdventure.value = null;
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}

// ---- 城镇进入 ----
const currentVenues = computed(() => {
  const hex = currentHex.value;
  if (!hex?.landmarkId) return [];
  return VenueService.listVenues(hex.landmarkId);
});

const canEnterCity = computed(() => currentVenues.value.length > 0);

function enterCity() {
  mapStore.setActiveLayer('Venue');
}

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

function doTeleport(targetTpId: string) {
  if (!playerStore.character) return;
  const check = TravelService.canTeleport(
    playerStore.character,
    mapStore.state,
    playerStore.currentNodeId,
    targetTpId,
  );
  if (!check.ok) {
    teleportMessage.value = check.reason ?? '无法传送';
    return;
  }

  const result = TravelService.teleport(
    playerStore.character,
    mapStore.state,
    playerStore.currentNodeId,
    targetTpId,
  );
  if (!result.success) {
    teleportMessage.value = result.reason ?? '传送失败';
    return;
  }

  // 原子提交：更新角色 + 切大陆
  playerStore.setPlayer(result.updatedPlayer);
  playerStore.setCurrentNode(result.targetNodeId);
  // 清空 gridCache 中目标大陆的缓存（强制重建以应用该大陆的缓存）
  // switchContinent 会重置 hexPos
  mapStore.switchContinent(result.targetContinentId);
  const cost = TELEPORT_GRAPH.nodes[targetTpId]?.spiritStoneCost ?? 0;
  teleportMessage.value = `传送成功！消耗 ${cost} 灵石`;
  eventLog.addEvent('travel', `传送至 · ${getContinent(result.targetContinentId)?.name ?? '未知大陆'}`, `经传送阵跨大陆，消耗 ${cost} 灵石`, {
    isMajorEvent: true,
  });
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
              <span v-if="currentHex.landmarkType"> · {{ currentHex.landmarkType }}</span>
              <span v-if="pendingPath" class="text-amber-400"> · 行走中({{ pendingPath.length }}格)</span>
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

      <!-- 六边形网格（固定高度容器 + 内部拖动平移） -->
      <div
        class="bg-slate-900 rounded-lg overflow-hidden border border-slate-700 relative select-none"
        style="height: 480px; cursor: grab;"
        :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
        @pointerdown="onDragStart"
        @pointermove="onDragMove"
        @pointerup="onDragEnd"
        @pointerleave="onDragEnd"
      >
        <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`"
          :style="{
            background: 'radial-gradient(ellipse at center, #152030 0%, #0a0f1a 80%)',
            transform: `translate(${panOffset.x}px, ${panOffset.y}px)`,
            width: SVG_W + 'px',
            height: SVG_H + 'px',
            minWidth: '100%',
          }"
          class="block">
          <g v-for="hex in allHexes" :key="`${hex.q},${hex.r}`"
            @click="handleHexClick(hex.q, hex.r)"
            :transform="`translate(${hexToPixel(hex.q, hex.r).x}, ${hexToPixel(hex.q, hex.r).y})`"
            :style="{ cursor: isAdjacent(hex.q, hex.r) ? 'pointer' : hex.explored ? 'default' : 'pointer' }">
            <polygon :points="hexPolygonPoints(0, 0)"
              :fill="getTerrainColor(hex)"
              :stroke="isPlayerHere(hex.q, hex.r) ? '#fbbf24'
                : isAdjacent(hex.q, hex.r) ? '#22d3ee'
                : 'rgba(50,60,80,0.3)'"
              :stroke-width="isPlayerHere(hex.q, hex.r) ? 2.5
                : isAdjacent(hex.q, hex.r) ? 2
                : 0.5"
              :opacity="hex.explored ? 1 : 0.5"
            />
            <text v-if="hex.explored" y="3" text-anchor="middle"
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
            :transform="`translate(${hexToPixel(near.q, near.r).x}, ${hexToPixel(near.q, near.r).y})`"
            class="pointer-events-none select-none">
            <circle r="5" :fill="realmColor(near.npc.realm)" stroke="#0f172a" stroke-width="1" />
            <text y="13" text-anchor="middle" :fill="realmColor(near.npc.realm)" font-size="6"
              font-weight="bold">{{ near.npc.name }}</text>
          </g>
        </svg>
        <div v-if="pendingPath" class="absolute top-2 right-2 px-2 py-1 bg-amber-900/70 rounded text-xs text-amber-200">
          行走中... {{ pendingPath.length }} 格剩余
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
        点击邻接格移动一步 · 点击远处自动行走 · 探索揭开迷雾
      </div>
    </div>
  </div>
</template>
