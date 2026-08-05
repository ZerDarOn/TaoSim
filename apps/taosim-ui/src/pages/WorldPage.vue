<script setup lang="ts">
import { useWorld } from '@/composables/useWorld';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';

const appStore = useAppStore();
const playerStore = usePlayerStore();
const { state, advanceMonth, fastForward } = useWorld();
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">大世界</h1>
      <div class="text-sm text-ink-soft">
        道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
      </div>
    </div>

    <!-- 角色信息 -->
    <div class="bg-surface rounded-lg border border-line p-4 grid grid-cols-3 gap-4 text-sm">
      <div>
        <span class="text-muted">境界：</span>
        <span class="font-semibold text-jade">{{ playerStore.character?.realm }}</span>
      </div>
      <div>
        <span class="text-muted">寿元：</span>
        <span>{{ Math.floor(playerStore.character?.lifespan?.age ?? 0) }}/{{ playerStore.character?.lifespan?.maxLifespan ?? '?' }} 年</span>
      </div>
      <div>
        <span class="text-muted">灵力：</span>
        <span>{{ playerStore.character?.spiritEnergy?.current ?? 0 }}/{{ playerStore.character?.spiritEnergy?.max ?? 0 }}</span>
      </div>
    </div>

    <!-- 时间控制 -->
    <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
      <h3 class="text-sm font-semibold text-ink-soft">时间推进</h3>
      <div class="flex gap-3">
        <button @click="advanceMonth" :disabled="state.advancing"
          class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold disabled:opacity-50">
          推进 1 个月
        </button>
        <button @click="fastForward(12)" :disabled="state.advancing"
          class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold disabled:opacity-50">
          闭关 1 年
        </button>
        <button @click="fastForward(120)" :disabled="state.advancing"
          class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold disabled:opacity-50">
          闭关 10 年
        </button>
      </div>
      <div v-if="state.advancing" class="text-sm text-muted animate-pulse">闭关中...</div>
    </div>

    <!-- 世界事件 -->
    <div class="bg-surface rounded-lg border border-line p-4">
      <h3 class="text-sm font-semibold text-ink-soft mb-3">世界事件</h3>
      <div v-if="state.recentEvents.length === 0" class="text-sm text-muted">
        时光静好，无事发生
      </div>
      <div v-else class="space-y-2 max-h-64 overflow-y-auto">
        <div
          v-for="event in state.recentEvents"
          :key="event.id"
          :class="['p-2 rounded text-sm', event.isMajorEvent ? 'bg-gold-soft' : 'bg-surface-muted']"
        >
          <span class="font-semibold">道历 {{ event.year }}/{{ event.month }}</span>
          — {{ event.title }}：{{ event.description }}
        </div>
      </div>
    </div>

    <!-- 导航 -->
    <div class="flex gap-3">
      <router-link to="/cultivation" class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold">
        闭关修炼
      </router-link>
      <router-link to="/battle" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        战棋测试
      </router-link>
      <router-link to="/tribulation" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        渡劫突破
      </router-link>
    </div>
  </div>
</template>
