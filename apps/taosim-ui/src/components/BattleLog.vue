<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';

const props = defineProps<{
  lines: string[];
}>();

const boxRef = ref<HTMLDivElement>();

// 新日志自动滚动到底（设计文档 §6.6）
watch(() => props.lines.length, async () => {
  await nextTick();
  if (boxRef.value) boxRef.value.scrollTop = boxRef.value.scrollHeight;
});
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-3 flex flex-col min-h-[120px] max-h-[220px]">
    <h3 class="text-xs font-semibold text-ink-soft mb-2">战斗事件</h3>
    <div ref="boxRef" class="flex-1 overflow-y-auto space-y-1 pr-1">
      <div
        v-for="(line, i) in lines.slice(-200)"
        :key="`${i}-${line}`"
        class="text-xs text-ink-soft leading-relaxed"
      >{{ line }}</div>
      <div v-if="lines.length === 0" class="text-xs text-muted">等待行动...</div>
    </div>
  </div>
</template>
