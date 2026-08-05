<script setup lang="ts">
import { useWorld } from '@/composables/useWorld';

const { state, fastForward } = useWorld();
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8">
    <h1 class="text-2xl font-display text-ink mb-4">闭关修炼</h1>
    <div class="bg-surface rounded-lg border border-line p-6 space-y-4">
      <div class="text-sm text-ink-soft">
        选择闭关时长，推进时间流。世界将在闭关期间自动演进。
      </div>
      <div v-if="state.advancing" class="text-center py-8">
        <div class="animate-pulse text-jade font-semibold">修炼中...</div>
      </div>
      <div v-else class="flex gap-4">
        <button @click="fastForward(1)" class="px-4 py-2 bg-jade text-white rounded-md text-sm">
          闭关 1 个月
        </button>
        <button @click="fastForward(12)" class="px-4 py-2 bg-jade text-white rounded-md text-sm">
          闭关 1 年
        </button>
        <button @click="fastForward(120)" class="px-4 py-2 bg-jade text-white rounded-md text-sm">
          闭关 10 年
        </button>
      </div>
    </div>
  </div>
</template>
