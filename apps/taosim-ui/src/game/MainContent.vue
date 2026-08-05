<script setup lang="ts">
import { useUiStore } from '@/stores/ui';
import MapPanel from './panels/MapPanel.vue';
import CultivationPanel from './panels/CultivationPanel.vue';
import CraftingPanel from './panels/CraftingPanel.vue';
import MarketPanel from './panels/MarketPanel.vue';
import NpcPanel from './panels/NpcPanel.vue';
import InventoryPanel from './panels/InventoryPanel.vue';

const uiStore = useUiStore();
</script>

<template>
  <main class="flex-1 overflow-y-auto p-4">
    <MapPanel v-if="uiStore.activeTab === 'map'" />
    <CultivationPanel v-else-if="uiStore.activeTab === 'cult'" />
    <CraftingPanel v-else-if="uiStore.activeTab === 'craft'" />
    <MarketPanel v-else-if="uiStore.activeTab === 'market'" />
    <NpcPanel v-else-if="uiStore.activeTab === 'npc'" />
    <InventoryPanel v-else-if="uiStore.activeTab === 'inv'" />
  </main>
</template>
