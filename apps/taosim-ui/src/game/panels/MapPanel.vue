<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { OverworldEngine, PRESET_MAP, getNeighbors, getEdge } from '@taosim/engine';
import type { OverworldNode, TravelEvent } from '@taosim/contracts';
import { formatRealm } from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const uiStore = useUiStore();

const message = ref<string | null>(null);
const recentEvents = ref<TravelEvent[]>([]);
const pendingNpcEvent = ref<TravelEvent | null>(null);  // 待处理的 NPC 偶遇

const continent = computed(() => PRESET_MAP.continents[0]!);

const currentNode = computed<OverworldNode | undefined>(() =>
  continent.value?.nodes[playerStore.currentNodeId],
);

const neighborIds = computed(() => getNeighbors(playerStore.currentNodeId));

const neighborNodes = computed(() =>
  neighborIds.value
    .map(id => continent.value?.nodes[id])
    .filter(Boolean) as OverworldNode[],
);

// 节点类型 → 中文 + 图标 emoji
const nodeTypeLabel: Record<string, string> = {
  City: '城镇', Sect: '宗门', Dungeon: '秘境', Market: '坊市', Wilderness: '荒野',
};
const nodeTypeIcon: Record<string, string> = {
  City: '🏯', Sect: '⛰️', Dungeon: '🕳️', Market: '🏪', Wilderness: '🌿',
};

const realmInfo = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  return {
    realm: formatRealm(c.realm),
    cultivation: `${c.cultivation.currentExp} / ${c.cultivation.maxExp}`,
  };
});

// 当前节点是否可访问坊市
const canAccessMarket = computed(() =>
  currentNode.value?.type === 'Market' || currentNode.value?.type === 'City',
);

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
    message.value = `抵达 ${continent.value?.nodes[targetNodeId]?.name}（耗时 ${distance} 天）`;

    // 检查是否有 NPC 偶遇事件
    const npcEvent = result.events.find(e => e.type === 'npc_meet' && e.npc);
    if (npcEvent) {
      pendingNpcEvent.value = npcEvent;
    }

    // 如果到的是 Market 节点，提示可访问坊市
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

function declineNpcMeet() {
  pendingNpcEvent.value = null;
}

function goToMarket() {
  uiStore.setTab('market');
}
</script>

<template>
  <div class="space-y-4">
    <!-- 当前节点卡片 -->
    <div v-if="currentNode" class="p-4 bg-slate-800 rounded-lg border border-slate-700">
      <div class="flex items-center gap-3 mb-2">
        <span class="text-2xl">{{ nodeTypeIcon[currentNode.type] }}</span>
        <div>
          <h3 class="text-amber-300 text-lg font-semibold">{{ currentNode.name }}</h3>
          <p class="text-xs text-slate-400">
            <span class="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">{{ nodeTypeLabel[currentNode.type] }}</span>
            <span class="ml-2">{{ currentNode.tier }} 阶位</span>
          </p>
        </div>
      </div>
      <p class="text-xs text-slate-500">
        <span v-if="currentNode.tier <= 2">灵脉充沛，适宜驻足</span>
        <span v-else-if="currentNode.tier <= 3">灵气浓郁，需谨慎行事</span>
        <span v-else>危险区域，机缘与凶险并存</span>
      </p>
    </div>

    <!-- NPC 偶遇提示卡片 -->
    <div v-if="pendingNpcEvent" class="p-4 bg-amber-900/30 rounded-lg border border-amber-600/50">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-amber-300 text-base font-semibold">偶遇修士</h3>
        <span class="text-xs text-slate-400">{{ pendingNpcEvent.title }}</span>
      </div>
      <p class="text-sm text-slate-200 mb-1">
        <span class="font-semibold text-amber-200">{{ pendingNpcEvent.npc?.name }}</span>
        <span class="ml-2 text-xs text-slate-400">{{ formatRealm(pendingNpcEvent.npc!.realm) }}</span>
      </p>
      <p class="text-xs text-slate-400 mb-3">{{ pendingNpcEvent.description }}</p>
      <div class="flex gap-2">
        <button @click="acceptNpcMeet"
          class="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-sm rounded-md font-medium transition">
          上前搭话
        </button>
        <button @click="declineNpcMeet"
          class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-md font-medium transition">
          无视离开
        </button>
      </div>
    </div>

    <!-- 旅行事件列表 -->
    <div v-if="recentEvents.length" class="space-y-2">
      <h3 class="text-sm font-semibold text-slate-300">途中事件</h3>
      <div v-for="(evt, i) in recentEvents" :key="i"
        class="p-3 bg-slate-800 rounded-lg border border-slate-700 text-sm">
        <div class="flex items-center gap-2">
          <span class="font-semibold text-amber-300">{{ evt.title }}</span>
          <span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">{{ evt.type }}</span>
        </div>
        <p class="text-slate-300 mt-1">{{ evt.description }}</p>
      </div>
    </div>

    <!-- 消息提示 -->
    <div v-if="message" class="p-3 rounded-lg text-sm bg-slate-700/50 border border-slate-600 text-amber-200">
      {{ message }}
    </div>

    <!-- 坊市快捷入口 -->
    <div v-if="canAccessMarket">
      <button @click="goToMarket"
        class="w-full px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-sm font-semibold transition">
        🏪 进入坊市
      </button>
    </div>

    <!-- 可前往节点列表 -->
    <div>
      <h3 class="text-sm font-semibold text-slate-300 mb-2">可前往</h3>
      <div class="grid grid-cols-2 gap-2">
        <button v-for="node in neighborNodes" :key="node.id"
          @click="handleTravel(node.id)"
          class="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 hover:border-amber-500/50 text-left transition">
          <div class="flex items-center gap-1.5">
            <span class="text-base">{{ nodeTypeIcon[node.type] }}</span>
            <span class="font-semibold text-slate-100 text-sm">{{ node.name }}</span>
          </div>
          <div class="text-xs text-slate-400 mt-0.5">
            {{ nodeTypeLabel[node.type] }} · {{ node.tier }}阶 ·
            {{ getEdge(playerStore.currentNodeId, node.id)?.distanceDays ?? '?' }} 天
          </div>
        </button>
      </div>
      <div v-if="neighborNodes.length === 0" class="text-sm text-slate-500 p-2">无相邻节点</div>
    </div>
  </div>
</template>
