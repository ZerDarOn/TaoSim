// apps/taosim-ui/src/stores/ui.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Character } from '@taosim/contracts';

export type GameTab = 'map' | 'character' | 'market' | 'npc';

// 角色 tab 内部子页签（CharacterPanel.vue 消费）
export type CharacterSubTab = 'overview' | 'cultivation' | 'skills' | 'crafting' | 'inventory';

export interface BattleConfig {
  enemy: Character;
  type: 'duel' | 'encounter';
  title: string;
  description: string;
  /** S5：敌人来源 NPC 的稳定 ID（如提供，战后回写到 worldState.npcs） */
  enemyNpcId?: string;
  /** S5：战斗场景 ID（幂等键基础） */
  sceneId?: string;
}

export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<GameTab>('map');
  const charDetailOpen = ref(false);
  const battleConfig = ref<BattleConfig | null>(null);
  // 角色 tab 当前子页签（外部跳转时可预设，如练功场 → 'cultivation'）
  const charSubTab = ref<CharacterSubTab>('overview');

  function setTab(tab: GameTab) {
    activeTab.value = tab;
  }

  function setCharSubTab(sub: CharacterSubTab) {
    charSubTab.value = sub;
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

  return { activeTab, charDetailOpen, battleConfig, charSubTab, setTab, setCharSubTab, openCharDetail, closeCharDetail, startBattle, endBattle };
});
