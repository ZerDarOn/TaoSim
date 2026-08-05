<script setup lang="ts">
import { useWorld } from '@/composables/useWorld';
const { state } = useWorld();
</script>

<template>
  <aside class="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 p-3 overflow-y-auto">
    <div class="text-xs text-slate-400 mb-2 font-semibold">事件日志</div>
    <div v-if="state.recentEvents.length === 0" class="text-xs text-slate-500 italic">
      天地初开，万籁俱寂……
    </div>
    <div class="space-y-2">
      <div
        v-for="evt in state.recentEvents"
        :key="evt.id"
        class="text-xs p-2 bg-slate-700/50 rounded"
      >
        <div class="text-slate-300 font-medium">
          <span class="text-amber-400">{{ evt.year }}年{{ evt.month }}月</span>
          {{ evt.title }}
        </div>
        <div v-if="evt.description" class="text-slate-400 mt-0.5">{{ evt.description }}</div>
      </div>
    </div>
  </aside>
</template>
