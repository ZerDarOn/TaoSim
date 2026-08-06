<script setup lang="ts">
import { useUiStore } from '@/stores/ui';
import MapPanel from './panels/MapPanel.vue';
import CharacterPanel from './panels/CharacterPanel.vue';
import MarketPanel from './panels/MarketPanel.vue';
import NpcPanel from './panels/NpcPanel.vue';

const uiStore = useUiStore();
</script>

<template>
  <main class="flex-1 overflow-y-auto p-4">
    <MapPanel v-if="uiStore.activeTab === 'map'" />
    <CharacterPanel v-else-if="uiStore.activeTab === 'character'" />
    <MarketPanel v-else-if="uiStore.activeTab === 'market'" />
    <NpcPanel v-else-if="uiStore.activeTab === 'npc'" />
  </main>
</template>
