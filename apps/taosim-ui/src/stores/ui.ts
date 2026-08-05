// apps/taosim-ui/src/stores/ui.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Character } from '@taosim/contracts';

export type GameTab = 'map' | 'cult' | 'craft' | 'market' | 'npc' | 'inv';

export interface BattleConfig {
  enemy: Character;
  type: 'duel' | 'encounter';
  title: string;
  description: string;
}

export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<GameTab>('map');
  const charDetailOpen = ref(false);
  const battleConfig = ref<BattleConfig | null>(null);

  function setTab(tab: GameTab) {
    activeTab.value = tab;
  }

  function openCharDetail() {
    charDetailOpen.value = true;
  }

  function closeCharDetail() {
    charDetailOpen.value = false;
  }

  function startBattle(config: BattleConfig) {
    battleConfig.value = config;
  }

  function endBattle() {
    battleConfig.value = null;
  }

  return { activeTab, charDetailOpen, battleConfig, setTab, openCharDetail, closeCharDetail, startBattle, endBattle };
});
