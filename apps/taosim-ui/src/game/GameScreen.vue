<script setup lang="ts">
import TopBar from './TopBar.vue';
import LeftSidebar from './LeftSidebar.vue';
import EventLog from './EventLog.vue';
import BottomNav from './BottomNav.vue';
import MainContent from './MainContent.vue';
import CharacterDetailModal from './CharacterDetailModal.vue';
import BattleOverlay from './BattleOverlay.vue';
import SaveLoadPanel from '@/components/SaveLoadPanel.vue';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';
import { useUiStore } from '@/stores/ui';
import { onUnmounted, ref } from 'vue';
import { useWorld } from '@/composables/useWorld';

const playerStore = usePlayerStore();
const gameFlow = useGameFlowStore();
const uiStore = useUiStore();
const { stopRealtime } = useWorld();
const savePanelOpen = ref(false);

function openSavePanel() {
  stopRealtime();
  savePanelOpen.value = true;
}

// 离开游戏界面时停止实时演算，避免定时器泄漏
onUnmounted(() => stopRealtime());

// 守卫：若无角色（不应发生），退回主菜单
if (!playerStore.character) {
  gameFlow.enterTitle();
}
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-900 text-slate-100">
    <TopBar @open-save="openSavePanel" />
    <div class="flex-1 flex overflow-hidden">
      <LeftSidebar />
      <MainContent />
      <EventLog />
    </div>
    <BottomNav />
    <CharacterDetailModal />
    <!-- 战斗覆盖层：uiStore.battleConfig 存在时全屏显示 -->
    <BattleOverlay v-if="uiStore.battleConfig" />
    <div
      v-if="savePanelOpen"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      @click.self="savePanelOpen = false"
    >
      <div class="w-full max-w-2xl max-h-[80vh] overflow-y-auto relative">
        <button
          class="absolute right-3 top-3 z-10 px-2 py-1 rounded bg-slate-700 text-xs text-slate-200"
          @click="savePanelOpen = false"
        >关闭</button>
        <SaveLoadPanel />
      </div>
    </div>
  </div>
</template>
