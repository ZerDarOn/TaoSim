<script setup lang="ts">
import { computed, watch } from 'vue';
import { useUiStore, type GameTab } from '@/stores/ui';
import { usePlayerStore } from '@/stores/player';
import { PRESET_MAP } from '@taosim/engine';

const uiStore = useUiStore();
const playerStore = usePlayerStore();

const visibleTabs = computed<Array<{ key: GameTab; label: string }>>(() => {
  const tabs: Array<{ key: GameTab; label: string }> = [
    { key: 'map',       label: '大地图' },
    { key: 'character', label: '角色' },
  ];

  const currentNode = PRESET_MAP.continents[0]?.nodes[playerStore.currentNodeId];
  const canAccessMarket = currentNode?.type === 'Market' || currentNode?.type === 'City';
  if (canAccessMarket) {
    tabs.push({ key: 'market', label: '坊市' });
  }

  if (playerStore.currentNPC) {
    tabs.push({ key: 'npc', label: '人际' });
  }

  return tabs;
});

const visibleKeys = computed(() => new Set(visibleTabs.value.map(t => t.key)));

// 当前 tab 不可见时自动切回 map
watch(visibleKeys, (keys) => {
  if (!keys.has(uiStore.activeTab)) {
    uiStore.setTab('map');
  }
});
</script>

<template>
  <nav class="h-12 flex items-center bg-slate-800 border-t border-slate-700">
    <button
      v-for="tab in visibleTabs"
      :key="tab.key"
      class="flex-1 h-full text-sm transition min-w-0"
      :class="uiStore.activeTab === tab.key
        ? 'bg-amber-700 text-amber-100 font-semibold'
        : 'text-slate-300 hover:bg-slate-700'"
      @click="uiStore.setTab(tab.key)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>
