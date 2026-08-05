<script setup lang="ts">
import { useUiStore, type GameTab } from '@/stores/ui';

const uiStore = useUiStore();

const tabs: Array<{ key: GameTab; label: string }> = [
  { key: 'map',    label: '大地图' },
  { key: 'cult',   label: '修炼' },
  { key: 'craft',  label: '百艺' },
  { key: 'market', label: '坊市' },
  { key: 'npc',    label: '人际' },
  { key: 'inv',    label: '背包' },
];
</script>

<template>
  <nav class="h-12 flex items-center bg-slate-800 border-t border-slate-700">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="flex-1 h-full text-sm transition"
      :class="uiStore.activeTab === tab.key
        ? 'bg-amber-700 text-amber-100 font-semibold'
        : 'text-slate-300 hover:bg-slate-700'"
      @click="uiStore.setTab(tab.key)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>
