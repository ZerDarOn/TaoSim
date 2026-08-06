<script setup lang="ts">
/**
 * ATBBar — 行动序列面板
 * 展示各角色 ATB 行动值进度、当前行动方高亮、就绪待行动状态
 */
interface AtbInfo {
  gauge: number;
  actionReady: boolean;
}

defineProps<{
  characters: { id: string; name: string; hp: number; maxHp: number; isPlayer: boolean }[];
  currentTurn: string | null;
  atb?: Record<string, AtbInfo>;
}>();
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
    <h3 class="text-sm font-semibold text-ink-soft mb-2">行动序列</h3>
    <div v-for="c in characters" :key="c.id"
      :class="['p-2 rounded transition',
        currentTurn === c.id ? 'bg-gold-soft ring-1 ring-gold' : 'bg-surface-muted']">
      <div class="flex items-center gap-3">
        <span :class="c.isPlayer ? 'text-jade font-bold' : 'text-danger'">{{ c.isPlayer ? '我' : '敌' }}</span>
        <span class="text-sm flex-1 truncate">{{ c.name }}</span>
        <!-- 状态标记 -->
        <span v-if="currentTurn === c.id" class="text-xs text-gold font-semibold">行动中</span>
        <span v-else-if="atb?.[c.id]?.actionReady" class="text-xs text-amber-300">待行动</span>
        <span class="text-xs text-muted w-16 text-right">{{ c.hp }}/{{ c.maxHp }}</span>
      </div>
      <!-- ATB 行动值进度条 -->
      <div class="mt-1.5 flex items-center gap-2">
        <div class="flex-1 bg-line rounded-full h-1.5 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-300"
            :class="c.isPlayer ? 'bg-jade' : 'bg-danger'"
            :style="{ width: (atb?.[c.id]?.gauge ?? 0) + '%' }"></div>
        </div>
        <span class="text-[10px] text-muted w-8 text-right">{{ Math.floor(atb?.[c.id]?.gauge ?? 0) }}</span>
      </div>
    </div>
  </div>
</template>
