<script setup lang="ts">
import { ref } from 'vue';

const isMeditating = ref(false);
const meditatedMonths = ref(0);

function startMeditation(months: number) {
  isMeditating.value = true;
  // 模拟闭关：实际由 WorldEngine.fastForward 在 Worker 中运行
  setTimeout(() => {
    isMeditating.value = false;
    meditatedMonths.value += months;
  }, 1500);
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8">
    <h1 class="text-2xl font-display text-ink mb-4">闭关修炼</h1>
    <div class="bg-surface rounded-lg border border-line p-6 space-y-4">
      <div class="text-sm text-ink-soft">
        已闭关修炼 <span class="font-bold text-jade">{{ meditatedMonths }}</span> 个月
      </div>
      <div v-if="isMeditating" class="text-center py-8">
        <div class="animate-pulse text-jade font-semibold">修炼中...</div>
      </div>
      <div v-else class="flex gap-4">
        <button @click="startMeditation(1)" class="px-4 py-2 bg-jade text-white rounded-md text-sm">
          闭关 1 个月
        </button>
        <button @click="startMeditation(12)" class="px-4 py-2 bg-jade text-white rounded-md text-sm">
          闭关 1 年
        </button>
        <button @click="startMeditation(120)" class="px-4 py-2 bg-jade text-white rounded-md text-sm">
          闭关 10 年
        </button>
      </div>
    </div>
  </div>
</template>
