<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { Character, Skill } from '@taosim/contracts';
import SkillPanel from './SkillPanel.vue';
import type { BattleUIPhase } from '@/battle/types';

const props = defineProps<{
  phase: BattleUIPhase;
  currentTurn: string | null;
  playerId: string;
  actor?: Character | null;      // 当前行动者（用于技能面板冷却/资源态）
  waitingName?: string;          // 等待中的 NPC 名
  skills?: Skill[];
  canFlee?: boolean;         // caught 后本回合禁用逃跑
}>();

const emit = defineEmits<{
  attack: [];
  defend: [];
  move: [];
  endTurn: [];
  skill: [skill: Skill];
  cancel: [];
  flee: [];
}>();

const skillOpen = ref(false);
const itemOpen = ref(false);

const isPlayerTurn = computed(() => props.currentTurn === props.playerId);
const isIdle = computed(() => props.phase === 'command');
const isTargeting = computed(() =>
  props.phase === 'targeting-attack' || props.phase === 'targeting-skill'
  || props.phase === 'targeting-item' || props.phase === 'moving');

function toggleSkill() { if (isIdle.value) { skillOpen.value = !skillOpen.value; itemOpen.value = false; } }
function toggleItem() { if (isIdle.value) { itemOpen.value = !itemOpen.value; skillOpen.value = false; } }

watch(() => props.phase, (p) => {
  if (p !== 'command') { skillOpen.value = false; itemOpen.value = false; }
});
</script>

<template>
  <div class="border-t border-line bg-surface px-4 py-2">
    <!-- 等待文案 -->
    <div v-if="!isPlayerTurn" class="text-center text-xs text-muted py-1.5">
      等待 {{ waitingName ?? '对方' }} 行动…
    </div>

    <!-- 取消行（targeting/moving） -->
    <div v-else-if="isTargeting" class="flex justify-center py-1.5">
      <button
        @click="emit('cancel')"
        class="px-6 py-1.5 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-semibold transition"
      >取消（Esc / 右键）</button>
    </div>

    <!-- 六动作命令栏 -->
    <div v-else class="flex items-stretch gap-2">
      <button class="cmd-btn" @click="emit('attack')" :disabled="!isIdle">攻击</button>

      <!-- 技能▾ -->
      <div class="relative">
        <button class="cmd-btn" @click="toggleSkill" :disabled="!isIdle">
          技能<span class="ml-0.5 text-[10px]">▾</span>
        </button>
        <div
          v-if="skillOpen && isIdle"
          class="absolute bottom-full left-0 mb-2 w-64 bg-surface rounded-lg border border-line shadow-xl p-3 z-20"
        >
          <SkillPanel
            :skills="skills ?? []"
            :selected-id="null"
            :phase="phase"
            :actor="actor"
            @select="(s) => { skillOpen = false; emit('skill', s); }"
          />
        </div>
      </div>

      <button class="cmd-btn" @click="emit('defend')" :disabled="!isIdle">防御</button>

      <button class="cmd-btn" @click="emit('flee')" :disabled="!isIdle || canFlee === false">逃跑</button>

      <!-- 道具▾（Phase C 实现使用逻辑，本次仅占位） -->
      <div class="relative">
        <button class="cmd-btn" @click="toggleItem" :disabled="!isIdle">
          道具<span class="ml-0.5 text-[10px]">▾</span>
        </button>
        <div
          v-if="itemOpen && isIdle"
          class="absolute bottom-full left-0 mb-2 w-56 bg-surface rounded-lg border border-line shadow-xl p-3 z-20"
        >
          <p class="text-xs text-muted">暂无可用道具（Phase C）</p>
        </div>
      </div>

      <button class="cmd-btn" @click="emit('move')" :disabled="!isIdle">移动</button>

      <button
        class="cmd-btn cmd-btn-primary"
        @click="emit('endTurn')"
        :disabled="!isIdle"
      >结束回合</button>
    </div>
  </div>
</template>

<style scoped>
.cmd-btn {
  flex: 1;
  padding: 8px 4px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
  transition: all 0.15s;
}
.cmd-btn:hover:not(:disabled) { color: #fbbf24; border-color: #fbbf24; }
.cmd-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.cmd-btn-primary { background: #b45309; color: #fff; border-color: #d97706; }
.cmd-btn-primary:hover:not(:disabled) { background: #d97706; color: #fff; border-color: #f59e0b; }
</style>
