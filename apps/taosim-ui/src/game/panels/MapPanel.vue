<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { OverworldEngine, PRESET_MAP, getNeighbors, getEdge, NPCGenerator, AdventureEngine } from '@taosim/engine';
import type { OverworldNode, TravelEvent, Character } from '@taosim/contracts';
import type { AdventureEvent } from '@taosim/engine';
import { formatRealm } from '@/utils/i18n-game';
import AdventureEventCard from './AdventureEventCard.vue';

const playerStore = usePlayerStore();
const uiStore = useUiStore();

const message = ref<string | null>(null);
const recentEvents = ref<TravelEvent[]>([]);
const pendingNpcEvent = ref<TravelEvent | null>(null);
const pendingBattleEvent = ref<TravelEvent | null>(null);
const pendingAdventureEvent = ref<AdventureEvent | null>(null);
const selectedNodeId = ref<string | null>(null);

const continent = computed(() => PRESET_MAP.continents[0]!);

const currentNode = computed<OverworldNode | undefined>(() =>
  continent.value?.nodes[playerStore.currentNodeId],
);

const neighborIds = computed(() => getNeighbors(playerStore.currentNodeId));

// 所有节点列表
const allNodes = computed(() =>
  Object.values(continent.value?.nodes ?? {}).filter(Boolean) as OverworldNode[],
);

// 所有边（用于画连线）
const allEdges = computed(() => continent.value?.edges ?? []);

// 邻接节点 Node 对象
const neighborNodes = computed(() =>
  neighborIds.value
    .map(id => continent.value?.nodes[id])
    .filter(Boolean) as OverworldNode[],
);

// 节点类型样式
const nodeStyle: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  City:      { icon: '城', color: '#fbbf24', bg: '#78350f', label: '城镇' },
  Sect:      { icon: '宗', color: '#34d399', bg: '#065f46', label: '宗门' },
  Dungeon:   { icon: '境', color: '#f87171', bg: '#7f1d1d', label: '秘境' },
  Market:    { icon: '市', color: '#c084fc', bg: '#581c87', label: '坊市' },
  Wilderness:{ icon: '野', color: '#94a3b8', bg: '#1e293b', label: '荒野' },
};

function getNodeStyle(type: string) {
  return nodeStyle[type] ?? nodeStyle.Wilderness;
}

// SVG 视口：节点坐标范围大约 80-700 (x), 150-600 (y)
// 映射到 SVG viewBox 800 x 650
const SVG_W = 800;
const SVG_H = 650;

// ---- 旅行 ----

function handleTravel(targetNodeId: string) {
  if (!playerStore.character) return;
  const edge = getEdge(playerStore.currentNodeId, targetNodeId);
  const distance = edge?.distanceDays ?? '?';

  const result = OverworldEngine.travel(
    playerStore.character,
    playerStore.currentNodeId,
    targetNodeId,
    PRESET_MAP,
  );

  if (result.success) {
    playerStore.setCurrentNode(result.currentNodeId ?? targetNodeId);
    playerStore.advanceTime(result.daysPassed);
    recentEvents.value = result.events;
    selectedNodeId.value = null;
    message.value = `抵达 ${continent.value?.nodes[targetNodeId]?.name}（耗时 ${distance} 天）`;

    const npcEvent = result.events.find(e => e.type === 'npc_meet' && e.npc);
    if (npcEvent) pendingNpcEvent.value = npcEvent;

    const battleEvent = result.events.find(e => e.type === 'battle');
    if (battleEvent) pendingBattleEvent.value = battleEvent;

    if (!pendingNpcEvent.value && !pendingBattleEvent.value && playerStore.character) {
      const adventureEvent = AdventureEngine.rollEvent(playerStore.character, currentNode.value?.type);
      if (adventureEvent) pendingAdventureEvent.value = adventureEvent;
    }

    const arrivedNode = continent.value?.nodes[targetNodeId];
    if (arrivedNode?.type === 'Market' || arrivedNode?.type === 'City') {
      message.value += ' · 可访问坊市';
    }
  } else {
    message.value = result.reason ?? '旅行失败';
  }
}

function acceptNpcMeet() {
  if (!pendingNpcEvent.value?.npc) return;
  playerStore.setCurrentNPC(pendingNpcEvent.value.npc);
  uiStore.setTab('npc');
  pendingNpcEvent.value = null;
}
function declineNpcMeet() { pendingNpcEvent.value = null; }

function acceptBattle() {
  if (!pendingBattleEvent.value || !playerStore.character) return;
  const tier = currentNode.value?.tier ?? 1;
  const enemy = NPCGenerator.generate(tier, Date.now());
  enemy.name = ['赤眼狼妖', '石魔傀儡', '腐毒蛇君', '幽影鬼面'][Math.floor(Math.random() * 4)] ?? '妖兽';
  uiStore.startBattle({ enemy, type: 'encounter', title: `遭遇 · ${enemy.name}`, description: pendingBattleEvent.value.description });
  pendingBattleEvent.value = null;
}
function declineBattle() {
  if (playerStore.character) {
    const fleeCost = Math.round(playerStore.character.maxHp * 0.05);
    playerStore.character.hp = Math.max(1, playerStore.character.hp - fleeCost);
    message.value = `仓皇逃离，损失 ${fleeCost} 点气血`;
  }
  pendingBattleEvent.value = null;
}
function goToMarket() { uiStore.setTab('market'); }

function selectNode(id: string) {
  selectedNodeId.value = selectedNodeId.value === id ? null : id;
}

const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null;
  return continent.value?.nodes[selectedNodeId.value] ?? null;
});

const isSelectedReachable = computed(() => {
  if (!selectedNodeId.value) return false;
  return neighborIds.value.includes(selectedNodeId.value);
});
</script>

<template>
  <div class="space-y-3">
    <!-- 当前位置信息条 -->
    <div v-if="currentNode" class="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
          :style="{ backgroundColor: getNodeStyle(currentNode.type)!.bg, color: getNodeStyle(currentNode.type)!.color }">
          {{ getNodeStyle(currentNode.type)!.icon }}
        </div>
        <div>
          <div class="text-sm font-semibold text-amber-200">{{ currentNode.name }}</div>
          <div class="text-xs text-slate-400">
            {{ getNodeStyle(currentNode.type)!.label }}
            <span v-if="currentNode.tier >= 4" class="text-red-400"> · 危险</span>
          </div>
        </div>
      </div>
      <button v-if="currentNode.type === 'Market' || currentNode.type === 'City'"
        @click="goToMarket"
        class="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-md font-medium transition">
        进入坊市
      </button>
    </div>

    <!-- 消息提示 -->
    <div v-if="message" class="p-2.5 rounded-lg text-xs bg-slate-700/50 border border-slate-600 text-amber-200">
      {{ message }}
    </div>

    <!-- NPC 偶遇提示 -->
    <div v-if="pendingNpcEvent" class="p-3 bg-amber-900/30 rounded-lg border border-amber-600/50">
      <div class="flex items-center justify-between mb-1">
        <span class="text-amber-300 text-sm font-semibold">偶遇修士</span>
      </div>
      <p class="text-sm text-slate-200">
        <span class="font-semibold text-amber-200">{{ pendingNpcEvent.npc?.name }}</span>
        <span class="ml-2 text-xs text-slate-400">{{ formatRealm(pendingNpcEvent.npc!.realm) }}</span>
      </p>
      <div class="flex gap-2 mt-2">
        <button @click="acceptNpcMeet" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs rounded">上前搭话</button>
        <button @click="declineNpcMeet" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded">无视离开</button>
      </div>
    </div>

    <!-- 遭遇战提示 -->
    <div v-if="pendingBattleEvent" class="p-3 bg-red-900/30 rounded-lg border border-red-600/50">
      <span class="text-red-300 text-sm font-semibold">遭遇危险</span>
      <p class="text-sm text-slate-300 mt-1">{{ pendingBattleEvent.description }}</p>
      <div class="flex gap-2 mt-2">
        <button @click="acceptBattle" class="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs rounded">迎战</button>
        <button @click="declineBattle" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded">逃跑</button>
      </div>
    </div>

    <!-- 奇遇事件 -->
    <AdventureEventCard v-if="pendingAdventureEvent" :event="pendingAdventureEvent" @close="pendingAdventureEvent = null" />

    <!-- ===== 可视化地图 (SVG) ===== -->
    <div class="bg-slate-800 rounded-lg overflow-hidden border border-slate-700">
      <svg :viewBox="`0 0 ${SVG_W} ${SVG_H}`" class="w-full" style="background: radial-gradient(ellipse at center, #1a2a3a 0%, #0f172a 70%);">
        <!-- 装饰：灵气粒子背景 -->
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="rgba(251,191,36,0.3)" />
            <stop offset="100%" stop-color="rgba(251,191,36,0)" />
          </radialGradient>
          <filter id="currentGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- 连线（边） -->
        <g v-for="(edge, i) in allEdges" :key="`edge-${i}`">
          <line
            v-if="continent.nodes[edge.fromNodeId] && continent.nodes[edge.toNodeId]"
            :x1="continent.nodes[edge.fromNodeId]!.coordinates.x"
            :y1="continent.nodes[edge.fromNodeId]!.coordinates.y"
            :x2="continent.nodes[edge.toNodeId]!.coordinates.x"
            :y2="continent.nodes[edge.toNodeId]!.coordinates.y"
            :stroke="neighborIds.includes(edge.fromNodeId) && neighborIds.includes(edge.toNodeId)
              ? 'rgba(251,191,36,0.4)' : 'rgba(100,116,139,0.2)'"
            :stroke-width="neighborIds.includes(edge.fromNodeId) && neighborIds.includes(edge.toNodeId) ? 2 : 1"
            :stroke-dasharray="neighborIds.includes(edge.fromNodeId) && neighborIds.includes(edge.toNodeId) ? 'none' : '4 4'"
          />
          <!-- 距离标注 -->
          <text
            v-if="continent.nodes[edge.fromNodeId] && continent.nodes[edge.toNodeId]"
            :x="(continent.nodes[edge.fromNodeId]!.coordinates.x + continent.nodes[edge.toNodeId]!.coordinates.x) / 2"
            :y="(continent.nodes[edge.fromNodeId]!.coordinates.y + continent.nodes[edge.toNodeId]!.coordinates.y) / 2"
            fill="rgba(148,163,184,0.5)" font-size="9" text-anchor="middle"
            class="pointer-events-none select-none"
          >{{ edge.distanceDays }}天</text>
        </g>

        <!-- 节点 -->
        <g v-for="node in allNodes" :key="node.id"
          @click="selectNode(node.id)"
          style="cursor: pointer;"
          :transform="`translate(${node.coordinates.x}, ${node.coordinates.y})`"
        >
          <!-- 当前位置：发光环 -->
          <circle v-if="node.id === playerStore.currentNodeId" r="28" fill="url(#nodeGlow)" />
          <circle v-if="node.id === playerStore.currentNodeId" r="18" fill="none"
            stroke="#fbbf24" stroke-width="2" filter="url(#currentGlow)"
            class="animate-pulse" />

          <!-- 邻接可达节点：虚线圈 -->
          <circle v-if="neighborIds.includes(node.id) && node.id !== playerStore.currentNodeId"
            r="20" fill="none" stroke="#fbbf24" stroke-width="1.5" stroke-dasharray="3 3"
            class="opacity-60" />

          <!-- 选中节点：高亮圈 -->
          <circle v-if="selectedNodeId === node.id" r="22" fill="none"
            :stroke="getNodeStyle(node.type)!.color" stroke-width="2" />

          <!-- 节点主体 -->
          <circle :r="14"
            :fill="node.id === playerStore.currentNodeId ? '#fbbf24' : getNodeStyle(node.type)!.bg"
            :stroke="getNodeStyle(node.type)!.color" stroke-width="1.5"
          />
          <text y="5" text-anchor="middle"
            :fill="node.id === playerStore.currentNodeId ? '#0f172a' : getNodeStyle(node.type)!.color"
            font-size="12" font-weight="bold"
            class="pointer-events-none select-none">{{ getNodeStyle(node.type)!.icon }}</text>

          <!-- 节点名称 -->
          <text y="32" text-anchor="middle"
            :fill="node.id === playerStore.currentNodeId ? '#fbbf24' : '#cbd5e1'"
            font-size="10" font-weight="500"
            class="pointer-events-none select-none">{{ node.name }}</text>

          <!-- 玩家角色标记（仅在当前位置画"我"） -->
          <g v-if="node.id === playerStore.currentNodeId && playerStore.character"
            class="pointer-events-none select-none">
            <!-- 角色头像圆 -->
            <circle cy="-28" r="8" fill="#fbbf24" stroke="#fef3c7" stroke-width="1.5" />
            <text y="-24" text-anchor="middle" fill="#0f172a" font-size="9" font-weight="bold">我</text>
            <!-- 道号 -->
            <text y="-42" text-anchor="middle" fill="#fde68a" font-size="8" font-weight="600">
              {{ playerStore.character.name }}
            </text>
          </g>

          <!-- tier 标示（秘境/危险区域） -->
          <text v-if="node.tier >= 3" y="-18" text-anchor="middle"
            :fill="node.tier >= 4 ? '#f87171' : '#fbbf24'" font-size="8"
            class="pointer-events-none select-none">{{ '★'.repeat(Math.min(node.tier - 2, 3)) }}</text>
        </g>
      </svg>
    </div>

    <!-- 选中节点详情 + 旅行按钮 -->
    <div v-if="selectedNode" class="p-3 bg-slate-800 rounded-lg border border-slate-600 space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-semibold" :style="{ color: getNodeStyle(selectedNode.type)!.color }">{{ selectedNode.name }}</span>
          <span class="text-xs text-slate-400 ml-2">{{ getNodeStyle(selectedNode.type)!.label }} · {{ selectedNode.tier }}阶</span>
        </div>
        <span v-if="selectedNode.id === playerStore.currentNodeId" class="text-xs text-amber-400">当前位置</span>
      </div>

      <!-- 旅行按钮（仅邻接节点可旅行） -->
      <button v-if="isSelectedReachable" @click="handleTravel(selectedNode.id)"
        class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-md text-sm font-semibold transition">
        前往（{{ getEdge(playerStore.currentNodeId, selectedNode.id)?.distanceDays ?? '?' }} 天）
      </button>
      <div v-else-if="selectedNode.id !== playerStore.currentNodeId" class="text-xs text-slate-500 text-center py-1">
        无法直接到达，需途经其他节点
      </div>
    </div>

    <!-- 图例 -->
    <div class="flex flex-wrap gap-3 text-xs text-slate-400 px-1">
      <div v-for="(style, key) in nodeStyle" :key="key" class="flex items-center gap-1">
        <span class="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
          :style="{ backgroundColor: style.bg, color: style.color }">{{ style.icon }}</span>
        {{ style.label }}
      </div>
      <div class="flex items-center gap-1">
        <span class="w-4 h-4 rounded-full border-2 border-dashed border-amber-400"></span>
        可前往
      </div>
    </div>
  </div>
</template>
