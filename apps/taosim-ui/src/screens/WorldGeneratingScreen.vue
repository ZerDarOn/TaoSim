<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useGameFlowStore } from '@/stores/game-flow';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';

const gameFlow = useGameFlowStore();
const appStore = useAppStore();
const playerStore = usePlayerStore();

const progress = ref(0);
const stage = ref('');

onMounted(async () => {
  const playerId = playerStore.character?.id ?? 'unknown';

  await appStore.initialize(playerId, {
    npcScale: gameFlow.worldConfig.npcScale,
    preEvolveYears: gameFlow.worldConfig.preEvolveYears,
    difficulty: gameFlow.worldConfig.difficulty,
  }, (pct, text) => {
    progress.value = pct;
    stage.value = text;
    gameFlow.setGeneratingProgress(pct, text);
  });

  gameFlow.enterPlaying();
});
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-ink to-black">
    <!-- 世界诞生标题 -->
    <div class="text-center mb-12">
      <h1 class="text-3xl font-display text-jade mb-2">大千世界，正在诞生…</h1>
      <p class="text-sm text-ink-soft">天地初开，万物化生</p>
    </div>

    <!-- 进度条 -->
    <div class="w-96 max-w-full">
      <div class="w-full h-3 bg-surface-muted rounded-full overflow-hidden">
        <div
          class="h-full bg-gradient-to-r from-jade to-gold transition-all duration-300 rounded-full"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
      <div class="flex items-center justify-between mt-2">
        <span class="text-xs text-muted">{{ stage }}</span>
        <span class="text-xs text-gold font-mono">{{ progress }}%</span>
      </div>
    </div>

    <!-- 世界诞生叙事 -->
    <div class="mt-12 text-center max-w-md">
      <p class="text-sm text-ink-soft leading-relaxed">
        {{ stage }}
      </p>
    </div>
  </div>
</template>
