<script setup lang="ts">
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-12">
    <div class="text-center space-y-6">
      <h1 class="text-4xl font-display text-jade font-bold">大千修仙界</h1>
      <p class="text-lg text-ink-soft max-w-lg mx-auto">
        高自由度沙盒文字 RPG · 六边形战棋 · 鬼谷式大世界演化
      </p>
      <div class="flex justify-center gap-4 pt-4">
        <router-link
          to="/create-character"
          class="px-6 py-3 bg-jade text-white rounded-md font-semibold shadow-surface hover:bg-opacity-90 transition"
        >
          开始新游戏
        </router-link>
        <button
          class="px-6 py-3 border border-line rounded-md text-ink-soft hover:bg-surface-muted transition"
          disabled
        >
          继续游戏（暂无存档）
        </button>
      </div>
    </div>
  </div>
</template>
