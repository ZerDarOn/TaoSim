<script setup lang="ts">
import { computed } from 'vue';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';
import { getSeason, getSeasonPhase, getSeasonDescription, getExpectedCalendarEvent, getSpiritDensityMultiplier } from '@taosim/engine';
import { SEASON_NAMES, SEASON_COLORS } from '@taosim/contracts';

const appStore = useAppStore();
const playerStore = usePlayerStore();
const { advanceMonth, fastForward, state, setRealtimeSpeed } = useWorld();

const realtimeOptions = [
  { speed: 1, label: '1x', title: '1 世界日/秒' },
  { speed: 4, label: '4x', title: '4 世界日/秒' },
  { speed: 16, label: '16x', title: '16 世界日/秒' },
] as const;

/** 点击当前速度 = 暂停；点击其他速度 = 切速 */
function toggleRealtime(speed: 0 | 1 | 4 | 16) {
  setRealtimeSpeed(state.realtimeSpeed === speed ? 0 : speed);
}

const currentSeason = computed(() => getSeason(appStore.gameMonth));
const seasonPhase = computed(() => getSeasonPhase(appStore.gameMonth));
const seasonDesc = computed(() => getSeasonDescription(currentSeason.value, seasonPhase.value));

// 当前灵气浓度
const spiritDensity = computed(() => {
  const expectedEvt = getExpectedCalendarEvent(appStore.gameMonth);
  return getSpiritDensityMultiplier(appStore.gameMonth, expectedEvt);
});
const densityPercent = computed(() => Math.round(spiritDensity.value * 100));

// 当月节气事件预告
const calendarEventPreview = computed(() => getExpectedCalendarEvent(appStore.gameMonth));

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
  <header class="h-14 flex items-center justify-between px-4 bg-slate-800 border-b border-slate-700">
    <!-- 左：时间 + 季节 -->
    <div class="flex items-center gap-3">
      <div class="text-amber-300 font-semibold text-sm">
        道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月 第 {{ state.worldDay }} 日
      </div>
      <!-- 季节标签 -->
      <div class="flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
        :style="{ backgroundColor: SEASON_COLORS[currentSeason] + '22', color: SEASON_COLORS[currentSeason] }">
        <span>{{ SEASON_NAMES[currentSeason] }}</span>
        <span class="opacity-60">{{ seasonPhase === 'early' ? '初' : seasonPhase === 'mid' ? '仲' : '暮' }}</span>
      </div>
      <!-- 灵气浓度 -->
      <div class="text-xs" :class="densityPercent > 100 ? 'text-cyan-400' : densityPercent < 100 ? 'text-orange-400' : 'text-slate-400'">
        灵气 {{ densityPercent }}%
      </div>
      <!-- 节气事件预告 -->
      <div v-if="calendarEventPreview" class="text-xs text-pink-400 truncate max-w-[120px]" :title="calendarEventPreview.description">
        ✦ {{ calendarEventPreview.name }}
      </div>
    </div>

    <!-- 中：实时演算 + 时间推进按钮 -->
    <div class="flex gap-1.5 items-center">
      <!-- 实时演算（世界盒子式）：世界持续演化，无需手动推进 -->
      <span class="text-xs text-slate-400 mr-0.5">实时</span>
      <button
        class="px-2 py-1 rounded text-xs transition disabled:opacity-50"
        :class="state.realtimeSpeed === 0 ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'"
        :disabled="state.advancing"
        title="暂停实时演算"
        @click="setRealtimeSpeed(0)"
      >
        ⏸
      </button>
      <button
        v-for="opt in realtimeOptions"
        :key="opt.speed"
        class="px-2 py-1 rounded text-xs transition disabled:opacity-50"
        :class="state.realtimeSpeed === opt.speed ? 'bg-emerald-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'"
        :disabled="state.advancing"
        :title="opt.title"
        @click="toggleRealtime(opt.speed)"
      >
        {{ opt.label }}
      </button>
      <div class="w-px h-5 bg-slate-600 mx-1"></div>
      <button
        class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs transition disabled:opacity-50"
        :disabled="state.advancing"
        @click="advanceMonth"
      >
        推进 1 月
      </button>
      <button
        class="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs transition disabled:opacity-50"
        :disabled="state.advancing"
        @click="fastForward(3)"
      >
        3 月
      </button>
      <button
        class="px-2.5 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs transition disabled:opacity-50"
        :disabled="state.advancing"
        @click="fastForward(12)"
      >
        闭关 1 年
      </button>
    </div>

    <!-- 右：模式 -->
    <div class="text-xs text-slate-400">{{ modeLabel() }}</div>
  </header>
</template>
