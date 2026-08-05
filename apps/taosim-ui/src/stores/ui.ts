// apps/taosim-ui/src/stores/ui.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type GameTab = 'map' | 'cult' | 'craft' | 'market' | 'npc' | 'inv';

export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<GameTab>('map');
  const charDetailOpen = ref(false);

  function setTab(tab: GameTab) {
    activeTab.value = tab;
  }

  function openCharDetail() {
    charDetailOpen.value = true;
  }

  function closeCharDetail() {
    charDetailOpen.value = false;
  }

  return { activeTab, charDetailOpen, setTab, openCharDetail, closeCharDetail };
});
