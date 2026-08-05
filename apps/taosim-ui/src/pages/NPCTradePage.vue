<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';

const router = useRouter();
const playerStore = usePlayerStore();
const npc = computed(() => playerStore.currentNPC);

function handleBack() {
  router.push('/npc-interaction');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">交易 — {{ npc?.name ?? '修士' }}</h1>
    <div v-if="npc" class="text-sm text-muted">对方修为: {{ npc.realm }} | 你的灵石: {{ playerStore.character?.spiritStones ?? 0 }}</div>
    <button @click="handleBack"
      class="px-4 py-2 border border-line rounded-md text-sm">返回</button>
  </div>
</template>
