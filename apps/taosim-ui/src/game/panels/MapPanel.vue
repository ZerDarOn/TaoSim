<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import {
  generateWorldGrid, moveOneStep, autoTravel, findPath, findLandmarkPos,
  getHexNeighbors, hexDistance, TERRAIN_INFO, PRESET_MAP, NPCGenerator, AdventureEngine,
  type WorldHexGrid, type WorldHex, type HexTerrain, type HexMoveEvent,
} from '@taosim/engine';
import type { Character } from '@taosim/contracts';
import type { AdventureEvent } from '@taosim/engine';
import { formatRealm } from '@/utils/i18n-game';
import AdventureEventCard from './AdventureEventCard.vue';

const playerStore = usePlayerStore();
const uiStore = useUiStore();

// ---- 世界网格（全局唯一，存在 store 外部用 ref 持有） ----
const worldGrid = ref<WorldHexGrid>(generateWorldGrid(42));

// 玩家在六边形网格中的位置
const playerHexPos = ref<{ q: number; r: number }>({ q: 10, r: 10 });

// 初始化：根据 playerStore.currentNodeId 找到对应网格位置
onMounted(() => {
  const pos = findLandmarkPos(worldGrid.value, playerStore.currentNodeId);
  if (pos) {
    playerHexPos.value = pos;
    // 标记周围为已探索
    const hex = worldGrid.value.hexes.get(`${pos.q},${pos.r}`);
    if (hex) hex.explored = true;
    for (const n of getHexNeighbors(pos.q, pos.r)) {
      const nHex = worldGrid.value.hexes.get(`${n.q},${n.r}`);
      if (nHex) nHex.explored = true;
    }
  }
});

// ---- 事件状态 ----
const message = ref<string | null>(null);
const moveLog = ref<HexMoveEvent[]>([]);
const pendingNpc = ref<Character | null>(null);
const pendingBattle = ref<HexMoveEvent | null>(null);
const pendingAdventure = ref<AdventureEvent | null>(null);
const pendingPath = ref<Array<{ q: number; r: number }> | null>(null); // 自动行走的剩余路径

// ---- 地图渲染辅助 ----

const HEX_SIZE = 18;
const SVG_W = 760;
const SVG_H = 620;

function hexToPixel(q: number, r: number): { x: number; y: number } {
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = HEX_SIZE * (3 / 2) * r;
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

// 所有格子（转为数组方便 v-for）
const allHexes = computed(() => Array.from(worldGrid.value.hexes.values()));

// 邻接可移动格
const neighborPositions = computed(() => getHexNeighbors(playerHexPos.value.q, playerHexPos.value.r));

function isAdjacent(q: number, r: number): boolean {
  return neighborPositions.value.some(n => n.q === q && n.r === r);
}

function isPlayerHere(q: number, r: number): boolean {
  return playerHexPos.value.q === q && playerHexPos.value.r === r;
}

function getTerrainColor(hex: WorldHex): string {
  if (!hex.explored) return '#0d1117'; // 未探索：深黑
  return TERRAIN_INFO[hex.terrain].color;
}

function getTerrainIcon(hex: WorldHex): string {
  if (!hex.explored) return '';
  return TERRAIN_INFO[hex.terrain].icon;
}

// ---- 交互 ----

function handleHexClick(q: number, r: number) {
  // 有待处理事件时不允许移动
  if (pendingNpc.value || pendingBattle.value || pendingAdventure.value) return;

  if (isPlayerHere(q, r)) return;

  if (isAdjacent(q, r)) {
    // 相邻：移动一步
    stepMove(q, r);
  } else {
    // 远处：自动寻路
    startAutoTravel(q, r);
  }
}

function stepMove(targetQ: number, targetR: number) {
  if (!playerStore.character) return;
  const result = moveOneStep(worldGrid.value, playerHexPos.value, targetQ, targetR, playerStore.character);
  if (!result || !result.success) {
    message.value = result?.reason ?? '无法移动';
    return;
  }

  playerHexPos.value = { q: targetQ, r: targetR };
  playerStore.advanceTime(result.daysPassed);
  processEvents(result.events);

  // 更新 playerStore.currentNodeId（如果到了地标）
  updateLandmarkPos();
}

function startAutoTravel(targetQ: number, targetR: number) {
  if (!playerStore.character) return;
  const path = findPath(worldGrid.value, playerHexPos.value, { q: targetQ, r: targetR });
  if (!path || path.length < 2) {
    message.value = '无法找到路径';
    return;
  }
  pendingPath.value = path.slice(1); // 去掉起点
  continueAutoTravel();
}

function continueAutoTravel() {
  if (!pendingPath.value || pendingPath.value.length === 0 || !playerStore.character) {
    pendingPath.value = null;
    return;
  }

  // 有待处理事件时暂停
  if (pendingNpc.value || pendingBattle.value || pendingAdventure.value) return;

  const next = pendingPath.value[0]!;
  const result = moveOneStep(worldGrid.value, playerHexPos.value, next.q, next.r, playerStore.character);
  if (!result || !result.success) {
    pendingPath.value = null;
    message.value = result?.reason ?? '路径中断';
    return;
  }

  playerHexPos.value = { q: next.q, r: next.r };
  playerStore.advanceTime(result.daysPassed);
  processEvents(result.events);
  updateLandmarkPos();

  // 移除已走的格子
  pendingPath.value = pendingPath.value.slice(1);

  // 如果有事件触发，暂停（等待玩家处理完继续）
  const hasPending = pendingNpc.value || pendingBattle.value || pendingAdventure.value;
  if (!hasPending && pendingPath.value.length > 0) {
    // 无事件，继续走（用 setTimeout 让 UI 有时间渲染）
    setTimeout(() => continueAutoTravel(), 200);
  } else if (pendingPath.value.length === 0) {
    pendingPath.value = null;
    message.value = '已抵达目的地';
  }
}

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
        if (playerStore.character && evt.materialId) {
          const inv = playerStore.character.inventory;
          const existing = inv.find(s => s.item.id === evt.materialId);
          if (existing) existing.count++;
          else inv.push({ item: { id: evt.materialId!, name: evt.materialId!, tier: 1, type: 'Material', quality: 'Common', attributes: {} }, count: 1 });
        }
        message.value = `获得材料: ${evt.materialId}`;
        break;
      case 'discovery':
        // 触发奇遇事件
        if (playerStore.character) {
          const adventureEvt = AdventureEngine.rollEvent(playerStore.character);
          if (adventureEvt) pendingAdventure.value = adventureEvt;
        }
        break;
      case 'landmark_reached':
        message.value = evt.description;
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

// 当前格子
const currentHex = computed(() =>
  worldGrid.value.hexes.get(`${playerHexPos.value.q},${playerHexPos.value.r}`),
);

// ---- NPC 偶遇处理 ----
function acceptNpc() {
  if (!pendingNpc.value) return;
  playerStore.setCurrentNPC(pendingNpc.value);
  uiStore.setTab('npc');
  pendingNpc.value = null;
  // 继续自动行走（如果有的话）
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}
function declineNpc() {
  pendingNpc.value = null;
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}

// ---- 遭遇战处理 ----
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

// 奇遇关闭后继续走
function closeAdventure() {
  pendingAdventure.value = null;
  if (pendingPath.value) setTimeout(() => continueAutoTravel(), 100);
}

// 进入坊市
const canAccessMarket = computed(() => {
  const hex = currentHex.value;
  return hex?.landmarkType === 'Market' || hex?.landmarkType === 'City';
});

function goToMarket() { uiStore.setTab('market'); }

// 图例地形列表
const legendTerrains: HexTerrain[] = ['plain', 'forest', 'mountain', 'water', 'spirit_vein', 'wilderness', 'town'];
</script>

<template>
  <div class="space-y-3">
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
      <button v-if="canAccessMarket" @click="goToMarket"
        class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-md font-medium transition">
        进入坊市
      </button>
    </div>

    <!-- 消息 -->
    <div v-if="message" class="p-2.5 rounded-lg text-xs bg-slate-700/50 border border-slate-600 text-amber-200">
      {{ message }}
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

    <!-- ===== 六边形世界地图 (SVG) ===== -->
    <div class="bg-slate-900 rounded-lg overflow-hidden border border-slate-700 relative">
      <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="w-full"
        style="background: radial-gradient(ellipse at center, #152030 0%, #0a0f1a 80%);">

        <!-- 六边形格子 -->
        <g v-for="hex in allHexes" :key="`${hex.q},${hex.r}`"
          @click="handleHexClick(hex.q, hex.r)"
          :transform="`translate(${hexToPixel(hex.q, hex.r).x}, ${hexToPixel(hex.q, hex.r).y})`"
          :style="{ cursor: isAdjacent(hex.q, hex.r) ? 'pointer' : hex.explored ? 'default' : 'pointer' }">

          <!-- 格子六边形 -->
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

          <!-- 地形图标 -->
          <text v-if="hex.explored" y="3" text-anchor="middle"
            :fill="hex.landmarkId ? '#fef3c7' : 'rgba(255,255,255,0.4)'"
            font-size="9" font-weight="bold"
            class="pointer-events-none select-none">{{ getTerrainIcon(hex) }}</text>

          <!-- 地标名称 -->
          <text v-if="hex.explored && hex.landmarkName" y="14" text-anchor="middle"
            fill="#fde68a" font-size="6"
            class="pointer-events-none select-none">{{ hex.landmarkName }}</text>

          <!-- 玩家棋子 -->
          <g v-if="isPlayerHere(hex.q, hex.r) && playerStore.character"
            class="pointer-events-none select-none">
            <circle r="7" fill="#fbbf24" stroke="#fef3c7" stroke-width="1.5" />
            <text y="2.5" text-anchor="middle" fill="#0f172a" font-size="7" font-weight="bold">我</text>
          </g>

          <!-- 可移动指示 -->
          <circle v-if="isAdjacent(hex.q, hex.r) && !isPlayerHere(hex.q, hex.r)"
            r="3" fill="rgba(34,211,238,0.5)" class="pointer-events-none animate-pulse" />
        </g>
      </svg>

      <!-- 行走中遮罩提示 -->
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

    <!-- 操作提示 -->
    <div class="text-xs text-slate-500 text-center">
      点击邻接格移动一步 · 点击远处自动行走 · 探索揭开迷雾
    </div>
  </div>
</template>
