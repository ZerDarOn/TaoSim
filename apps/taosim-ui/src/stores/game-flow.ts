// apps/taosim-ui/src/stores/game-flow.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type GamePhase = 'title' | 'creating' | 'playing' | 'gameover';

export const useGameFlowStore = defineStore('game-flow', () => {
  const phase = ref<GamePhase>('title');
  const deathMessage = ref<string | null>(null);

  function enterTitle() {
    phase.value = 'title';
    deathMessage.value = null;
  }

  function enterCreating() {
    phase.value = 'creating';
  }

  function enterPlaying() {
    phase.value = 'playing';
  }

  function enterGameOver(message?: string) {
    phase.value = 'gameover';
    if (message) deathMessage.value = message;
  }

  return { phase, deathMessage, enterTitle, enterCreating, enterPlaying, enterGameOver };
});
