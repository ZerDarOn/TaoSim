<script setup lang="ts">
import type { Skill } from '@taosim/contracts';

defineProps<{
  skills: Skill[];
  selectedId: string | null;
  phase: string;
}>();

const emit = defineEmits<{
  select: [skill: Skill];
  cancel: [];
}>();
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-semibold text-ink-soft">技能</h3>
      <button
        v-if="selectedId"
        @click="emit('cancel')"
        class="text-xs text-muted hover:text-ink-soft"
      >
        取消
      </button>
    </div>
    <div class="flex gap-2 flex-wrap">
      <button
        v-for="skill in skills"
        :key="skill.id"
        @click="emit('select', skill)"
        :class="[
          'px-3 py-1.5 rounded text-xs font-semibold transition border',
          selectedId === skill.id
            ? 'bg-jade text-white border-jade'
            : 'bg-surface-muted text-ink-soft border-line hover:border-jade'
        ]"
        :disabled="phase === 'executing'"
      >
        {{ skill.name }}
        <span class="text-[10px] ml-1 opacity-60">AP{{ skill.cost.ap }}</span>
      </button>
    </div>
    <div v-if="skills.length === 0" class="text-xs text-muted">暂无可用的技能</div>
  </div>
</template>
