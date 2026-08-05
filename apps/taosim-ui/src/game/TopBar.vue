<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';

const appStore = useAppStore();
const playerStore = usePlayerStore();
const { advanceMonth, fastForward, state } = useWorld();

function modeLabel() {
  const m = playerStore.character?.gameMode;
  if (!m) return '';
  const parts: string[] = [];
  parts.push(m.breakthrough === 'Traditional' ? '传统突破' : '简单突破');
  parts.push(m.saveMode === 'Ironman' ? '铁人模式' : '自由模式');
  return parts.join(' · ');
}
</script>

<template>
  <header class="h-12 flex items-center justify-between px-4 bg-slate-800 border-b border-slate-700">
    <div class="text-amber-300 font-semibold">
      道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
    </div>
    <div class="flex gap-2">
      <button
        class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        :disabled="state.advancing"
        @click="advanceMonth"
      >
        推进 1 月
      </button>
      <button
        class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        :disabled="state.advancing"
        @click="fastForward(12)"
      >
        闭关 1 年
      </button>
      <button
        class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        :disabled="state.advancing"
        @click="fastForward(120)"
      >
        闭关 10 年
      </button>
    </div>
    <div class="text-xs text-slate-400">{{ modeLabel() }}</div>
  </header>
</template>
