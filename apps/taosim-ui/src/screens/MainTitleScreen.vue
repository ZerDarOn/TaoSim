<script setup lang="ts">
import SaveLoadPanel from '@/components/SaveLoadPanel.vue';
import { useGameFlowStore } from '@/stores/game-flow';
import { useAppStore } from '@/stores/app';
import { ref, onMounted } from 'vue';

const gameFlow = useGameFlowStore();
const appStore = useAppStore();

const hasSaves = ref(false);

onMounted(async () => {
  await appStore.loadSaveHeaders();
  hasSaves.value = appStore.saveHeaders.length > 0;
});

function startNewGame() {
  // 进入世界初始化配置
  gameFlow.enterWorldInit();
}

function continueGame() {
  // 滚动到存档区域
  const el = document.getElementById('save-section');
  el?.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-gradient-to-b from-ink to-black">
    <!-- 标题区 -->
    <div class="text-center space-y-4 mb-12">
      <h1 class="text-6xl font-display text-jade font-bold tracking-wide">大千修仙界</h1>
      <p class="text-base text-ink-soft max-w-lg mx-auto">
        高自由度沙盒文字 RPG · 六边形战棋 · 鬼谷式大世界演化
      </p>
    </div>

    <!-- 按钮区 -->
    <div class="flex flex-col gap-3 w-72 mb-8">
      <button
        v-if="hasSaves"
        @click="continueGame"
        class="px-6 py-3 bg-jade text-white rounded-md font-semibold shadow-surface hover:bg-opacity-90 transition text-lg"
      >
        继续游戏
      </button>
      <button
        @click="startNewGame"
        class="px-6 py-3 bg-gold text-white rounded-md font-semibold shadow-surface hover:bg-opacity-90 transition text-lg"
      >
        开始新游戏
      </button>
      <button
        disabled
        class="px-6 py-3 border border-line text-ink-soft rounded-md font-semibold opacity-30 cursor-not-allowed transition text-lg"
      >
        设置
      </button>
    </div>

    <!-- 存档管理 -->
    <div id="save-section" class="max-w-md w-full">
      <SaveLoadPanel />
    </div>

    <!-- 底部版本号 -->
    <div class="absolute bottom-4 text-xs text-muted">
      v0.3.0 · 天道初开
    </div>
  </div>
</template>
