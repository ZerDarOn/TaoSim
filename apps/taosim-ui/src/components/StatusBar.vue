<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';

const playerStore = usePlayerStore();

const status = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  const lifespanPct = (c.lifespan.age / c.lifespan.maxLifespan) * 100;
  return {
    realm: c.realm,
    hp: c.hp,
    maxHp: c.maxHp,
    spiritEnergy: c.spiritEnergy.current,
    spiritEnergyMax: c.spiritEnergy.max,
    ap: c.monthlyActionPoints.current,
    apMax: c.monthlyActionPoints.max,
    spiritStones: c.spiritStones ?? 0,
    age: Math.floor(c.lifespan.age),
    maxLifespan: c.lifespan.maxLifespan,
    lifespanPct,
    lifespanWarning: lifespanPct >= 80,
  };
});
</script>

<template>
  <div v-if="status" class="bg-surface border-b border-line px-6 py-2">
    <div class="max-w-content mx-auto flex items-center gap-4 text-xs">
      <!-- 境界 -->
      <span class="font-semibold text-jade">{{ status.realm }}</span>

      <span class="text-line">|</span>

      <!-- HP -->
      <span class="flex items-center gap-1">
        <span class="text-muted">气血</span>
        <span class="text-danger font-semibold">{{ status.hp }}</span>
        <span class="text-muted">/{{ status.maxHp }}</span>
      </span>

      <!-- 灵力 -->
      <span class="flex items-center gap-1">
        <span class="text-muted">灵力</span>
        <span class="text-jade font-semibold">{{ status.spiritEnergy }}</span>
        <span class="text-muted">/{{ status.spiritEnergyMax }}</span>
      </span>

      <!-- AP -->
      <span class="flex items-center gap-1">
        <span class="text-muted">行动</span>
        <span class="text-gold font-semibold">{{ status.ap }}</span>
        <span class="text-muted">/{{ status.apMax }}</span>
      </span>

      <!-- 灵石 -->
      <span class="flex items-center gap-1">
        <span class="text-muted">灵石</span>
        <span class="text-ink font-semibold">{{ status.spiritStones }}</span>
      </span>

      <span class="text-line">|</span>

      <!-- 寿命 -->
      <span class="flex items-center gap-1" :class="status.lifespanWarning ? 'text-danger' : 'text-ink-soft'">
        <span class="text-muted">寿</span>
        <span class="font-semibold">{{ status.age }}</span>
        <span class="text-muted">/{{ status.maxLifespan }}年</span>
        <span v-if="status.lifespanWarning" class="text-danger animate-pulse">⚠</span>
      </span>
    </div>
  </div>
</template>
