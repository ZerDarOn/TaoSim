<script setup lang="ts">
defineProps<{
  characters: { id: string; name: string; hp: number; maxHp: number; isPlayer: boolean }[];
  currentTurn: string | null;
}>();
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
    <h3 class="text-sm font-semibold text-ink-soft mb-2">行动序列</h3>
    <div
      v-for="c in characters"
      :key="c.id"
      :class="[
        'flex items-center gap-3 p-2 rounded transition',
        currentTurn === c.id ? 'bg-gold-soft ring-1 ring-gold' : 'bg-surface-muted'
      ]"
    >
      <span :class="c.isPlayer ? 'text-jade font-bold' : 'text-danger'">{{ c.isPlayer ? '我' : '敌' }}</span>
      <span class="text-sm flex-1">{{ c.name }}</span>
      <div class="w-24 bg-line rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all"
          :class="c.isPlayer ? 'bg-jade' : 'bg-danger'"
          :style="{ width: (c.hp / c.maxHp * 100) + '%' }"
        />
      </div>
      <span class="text-xs text-muted w-16 text-right">{{ c.hp }}/{{ c.maxHp }}</span>
    </div>
  </div>
</template>
