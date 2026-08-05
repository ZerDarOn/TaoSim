<script setup lang="ts">
import TopBar from './TopBar.vue';
import LeftSidebar from './LeftSidebar.vue';
import EventLog from './EventLog.vue';
import BottomNav from './BottomNav.vue';
import MainContent from './MainContent.vue';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';

const playerStore = usePlayerStore();
const gameFlow = useGameFlowStore();

// 守卫：若无角色（不应发生），退回主菜单
if (!playerStore.character) {
  gameFlow.enterTitle();
}
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-900 text-slate-100">
    <TopBar />
    <div class="flex-1 flex overflow-hidden">
      <LeftSidebar />
      <MainContent />
      <EventLog />
    </div>
    <BottomNav />
  </div>
</template>
