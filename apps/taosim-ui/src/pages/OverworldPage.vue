<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { formatNodeType } from '@/utils/i18n-game';
import { OverworldEngine, PRESET_MAP, getNeighbors, getEdge } from '@taosim/engine';
import type { OverworldNode } from '@taosim/contracts';

const playerStore = usePlayerStore();
const router = useRouter();
const currentNodeId = ref('NODE_SECT_QINGYUN');
const message = ref<string | null>(null);
const travelEvents = ref<{ type: string; title: string; description: string }[]>([]);

const continent = computed(() => PRESET_MAP.continents[0]!);

const currentNode = computed<OverworldNode | undefined>(() =>
  continent.value?.nodes[currentNodeId.value],
);

const neighborIds = computed(() => getNeighbors(currentNodeId.value));

const neighborNodes = computed(() =>
  neighborIds.value.map(id => continent.value?.nodes[id]).filter(Boolean) as OverworldNode[],
);

function handleTravel(targetNodeId: string) {
  if (!playerStore.character) return;
  const edge = getEdge(currentNodeId.value, targetNodeId);
  const distance = edge?.distanceDays ?? '?';

  const result = OverworldEngine.travel(
    playerStore.character,
    currentNodeId.value,
    targetNodeId,
    PRESET_MAP,
  );

  if (result.success) {
    currentNodeId.value = result.currentNodeId ?? currentNodeId.value;
    travelEvents.value = result.events;
    message.value = `抵达 ${continent.value?.nodes[targetNodeId]?.name}（耗时 ${distance} 天）`;
  } else {
    message.value = result.reason ?? '旅行失败';
  }
}

function goToNode(nodeId: string) {
  currentNodeId.value = nodeId;
  message.value = null;
  travelEvents.value = [];
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">大世界 — {{ continent?.name }}</h1>

    <div class="bg-surface rounded-lg border border-line p-4 text-sm">
      <span class="text-muted">当前位置：</span>
      <span class="font-semibold text-jade">{{ currentNode?.name ?? '未知' }}</span>
      <span class="text-xs text-muted ml-2">（{{ currentNode ? formatNodeType(currentNode.type) : '' }} · {{ currentNode?.tier }}阶）</span>
    </div>

    <button v-if="currentNode?.type === 'Market'"
      @click="router.push('/market')"
      class="px-4 py-2 bg-amber-500 text-white rounded-md text-sm font-semibold hover:bg-amber-600 w-fit">
      进入坊市
    </button>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <div v-if="travelEvents.length > 0" class="space-y-2">
      <h3 class="text-sm font-semibold text-ink-soft">途中事件</h3>
      <div v-for="(evt, i) in travelEvents" :key="i"
        class="bg-surface rounded-lg border border-line p-3 text-sm">
        <span class="font-semibold">{{ evt.title }}</span>
        <span class="text-ink-soft ml-2">{{ evt.description }}</span>
      </div>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-ink-soft mb-2">可前往</h3>
      <div class="grid grid-cols-2 gap-3">
        <button v-for="node in neighborNodes" :key="node.id"
          @click="handleTravel(node.id)"
          class="bg-surface rounded-lg border border-line p-3 text-left hover:border-jade transition text-sm">
          <div class="font-semibold">{{ node.name }}</div>
          <div class="text-xs text-muted">
            {{ formatNodeType(node.type) }} · {{ node.tier }}阶 ·
            {{ getEdge(currentNodeId, node.id)?.distanceDays ?? '?' }} 天
          </div>
        </button>
      </div>
      <div v-if="neighborNodes.length === 0" class="text-sm text-muted p-2">无相邻节点</div>
    </div>

    <div>
      <h3 class="text-sm font-semibold text-ink-soft mb-2">大陆节点一览</h3>
      <div class="grid grid-cols-4 gap-2 text-xs">
        <button v-for="(node, id) in continent?.nodes" :key="id"
          @click="goToNode(id as string)"
          :class="[
            'p-2 rounded border text-left',
            id === currentNodeId ? 'border-jade bg-jade-soft' : 'border-line bg-surface',
          ]">
          <div class="font-semibold">{{ node.name }}</div>
          <div class="text-muted">{{ formatNodeType(node.type) }} · {{ node.tier }}阶</div>
        </button>
      </div>
    </div>
  </div>
</template>
