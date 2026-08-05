<script setup lang="ts">
import { computed } from 'vue';
import { useGameFlowStore } from '@/stores/game-flow';
import MainTitleScreen from '@/screens/MainTitleScreen.vue';
import CreateCharacterPage from '@/pages/CreateCharacterPage.vue';
import GameScreen from '@/game/GameScreen.vue';
import GameOverScreen from '@/screens/GameOverScreen.vue';

const gameFlow = useGameFlowStore();

const current = computed(() => {
  switch (gameFlow.phase) {
    case 'title':    return MainTitleScreen;
    case 'creating': return CreateCharacterPage;
    case 'playing':  return GameScreen;
    case 'gameover': return GameOverScreen;
  }
});
</script>

<template>
  <component :is="current" />
</template>
