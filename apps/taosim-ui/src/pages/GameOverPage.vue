<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';

const router = useRouter();
const playerStore = usePlayerStore();

const epitaph = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  return {
    name: c.name,
    realm: c.realm,
    age: Math.floor(c.lifespan.age),
    maxLifespan: c.lifespan.maxLifespan,
    soulState: c.soulState,
  };
});

function returnHome() {
  playerStore.reset();
  router.push('/');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-16 text-center space-y-8">
    <div class="space-y-4">
      <h1 class="text-4xl font-display text-danger font-bold">道消身殒</h1>
      <div v-if="epitaph" class="bg-surface rounded-lg border border-line p-6 max-w-md mx-auto space-y-3 text-left">
        <div class="text-center pb-3 border-b border-line">
          <div class="text-2xl font-display text-ink">{{ epitaph.name }}</div>
          <div class="text-sm text-muted mt-1">道号 · {{ epitaph.realm }}</div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span class="text-muted">享年：</span>
            <span class="font-semibold text-ink">{{ epitaph.age }} 岁</span>
          </div>
          <div>
            <span class="text-muted">寿数：</span>
            <span class="text-ink">{{ epitaph.maxLifespan }} 年</span>
          </div>
        </div>
        <div class="text-sm pt-3 border-t border-line">
          <span class="text-muted">结局：</span>
          <span v-if="epitaph.soulState === 'PrimordialSoul'" class="text-gold">元神出窍，神魂不灭</span>
          <span v-else-if="epitaph.soulState === 'RemnantSoul'" class="text-ink-soft">残魂消散，归于天地</span>
          <span v-else class="text-danger">{{ epitaph.soulState }}</span>
        </div>
      </div>
      <p v-else class="text-muted">无一生纪要可查</p>
    </div>

    <div class="space-y-3">
      <p class="text-sm text-ink-soft">大道五十，天衍四九。仙途漫漫，来世再续。</p>
      <button @click="returnHome"
        class="px-6 py-3 bg-jade text-white rounded-md font-semibold hover:bg-opacity-90 transition">
        返回首页，重新开始
      </button>
    </div>
  </div>
</template>
