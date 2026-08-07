<script setup lang="ts">
import type { Character, Skill } from '@taosim/contracts';

const props = defineProps<{
  skills: Skill[];
  selectedId: string | null;
  phase: string;
  actor?: Character | null;   // 用于计算 AP/灵力不足与冷却态
  compact?: boolean;          // 命令栏子菜单紧凑模式
}>();

const emit = defineEmits<{
  select: [skill: Skill];
  cancel: [];
}>();

/** 技能射程：当前引擎统一 1 格（Phase B 精细化） */
const SKILL_RANGE = 1;

function isOnCooldown(skill: Skill): boolean {
  if (!props.actor) return false;
  return (props.actor.skillCooldowns[skill.id] ?? 0) > 0;
}

function cooldownLeft(skill: Skill): number {
  return props.actor ? props.actor.skillCooldowns[skill.id] ?? 0 : 0;
}

function isUnaffordable(skill: Skill): boolean {
  if (!props.actor) return false;
  return props.actor.ap < skill.cost.ap || props.actor.spiritEnergy.current < skill.cost.spiritEnergy;
}

function disabled(skill: Skill): boolean {
  return props.phase === 'executing' || isOnCooldown(skill) || isUnaffordable(skill);
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-semibold text-ink-soft">技能</h3>
      <button
        v-if="selectedId"
        @click="emit('cancel')"
        class="text-xs text-muted hover:text-ink-soft"
      >取消</button>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="skill in skills"
        :key="skill.id"
        @click="emit('select', skill)"
        :disabled="disabled(skill)"
        :title="`${skill.name}｜AP ${skill.cost.ap}｜灵力 ${skill.cost.spiritEnergy}｜射程 ${SKILL_RANGE} 格｜冷却 ${skill.cooldownTurns} 回合｜${skill.type}`"
        :class="[
          'relative px-3 py-2 rounded text-xs font-semibold transition border text-left',
          selectedId === skill.id
            ? 'bg-jade text-white border-jade'
            : disabled(skill)
              ? 'bg-surface-muted text-muted border-line cursor-not-allowed opacity-60'
              : 'bg-surface-muted text-ink-soft border-line hover:border-jade'
        ]"
      >
        <div class="flex items-center justify-between">
          <span class="truncate">{{ skill.name }}</span>
          <span class="text-[10px] opacity-60 ml-1">AP{{ skill.cost.ap }}</span>
        </div>
        <!-- 冷却角标 -->
        <span
          v-if="isOnCooldown(skill)"
          class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-900 text-amber-300 text-[9px] flex items-center justify-center ring-1 ring-amber-400"
        >{{ cooldownLeft(skill) }}</span>
        <!-- 资源不足小图标 -->
        <span v-else-if="isUnaffordable(skill)" class="absolute -top-1 -right-1 text-[10px]">×</span>
      </button>
    </div>
    <div v-if="skills.length === 0" class="text-xs text-muted">暂无可用的技能</div>
  </div>
</template>
