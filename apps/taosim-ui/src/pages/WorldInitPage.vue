<script setup lang="ts">
import { ref } from 'vue';
import { useGameFlowStore, type WorldInitConfig } from '@/stores/game-flow';

const gameFlow = useGameFlowStore();

const config = ref<WorldInitConfig>({ ...gameFlow.worldConfig });

const scaleOptions = [
  { id: 'small' as const, name: '小世界', npcRange: '约150位修士', desc: '聚焦精英，适合快速体验' },
  { id: 'medium' as const, name: '中世界', npcRange: '约300位修士', desc: '平衡密度与性能，推荐' },
  { id: 'large' as const, name: '大世界', npcRange: '约500位修士', desc: '热闹江湖，月度推进略慢' },
];

const evolvePresets = [0, 10, 30, 50, 100];
const evolveLabels: Record<number, string> = {
  0: '不预推（从元年开始）',
  10: '10年（关系刚萌芽）',
  30: '30年（恩怨初现）',
  50: '50年（有历史沉淀）',
  100: '100年（深厚恩怨纠葛）',
};

const difficultyOptions = [
  { id: 'easy' as const, name: '容易', desc: '修炼加速，天劫削弱' },
  { id: 'normal' as const, name: '普通', desc: '标准修仙体验' },
  { id: 'hard' as const, name: '困难', desc: '修炼减速，天劫凶猛' },
];

function confirm() {
  gameFlow.setWorldConfig(config.value);
  gameFlow.enterCharacter();
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8">
    <h1 class="text-2xl font-display text-jade mb-2">世界初始化</h1>
    <p class="text-sm text-ink-soft mb-8">在降临之前，先塑造你想要的大千世界</p>

    <!-- 世界规模 -->
    <div class="mb-8">
      <h3 class="text-lg font-semibold mb-3">世界规模</h3>
      <div class="grid grid-cols-3 gap-4">
        <button
          v-for="opt in scaleOptions"
          :key="opt.id"
          @click="config.npcScale = opt.id"
          :class="[
            'p-4 rounded-lg border-2 text-left transition',
            config.npcScale === opt.id ? 'border-jade bg-jade-soft' : 'border-line hover:border-jade-soft'
          ]"
        >
          <div class="font-semibold">{{ opt.name }}</div>
          <div class="text-xs text-gold mt-1">{{ opt.npcRange }}</div>
          <div class="text-sm mt-2 text-ink-soft">{{ opt.desc }}</div>
        </button>
      </div>
    </div>

    <!-- 预演化年数 -->
    <div class="mb-8">
      <h3 class="text-lg font-semibold mb-3">世界预演化</h3>
      <p class="text-sm text-ink-soft mb-3">
        世界开局前自动演化多少年？预演化让世界有历史——NPC之间已有恩怨情仇、宗门已有兴衰。
      </p>
      <div class="flex gap-2 flex-wrap">
        <button
          v-for="years in evolvePresets"
          :key="years"
          @click="config.preEvolveYears = years"
          :class="[
            'px-4 py-2 rounded-md text-sm border transition',
            config.preEvolveYears === years ? 'border-gold bg-gold-soft text-gold' : 'border-line text-ink-soft hover:border-gold'
          ]"
        >{{ evolveLabels[years] }}</button>
      </div>
    </div>

    <!-- 难度 -->
    <div class="mb-8">
      <h3 class="text-lg font-semibold mb-3">修仙难易</h3>
      <div class="grid grid-cols-3 gap-4">
        <button
          v-for="opt in difficultyOptions"
          :key="opt.id"
          @click="config.difficulty = opt.id"
          :class="[
            'p-4 rounded-lg border-2 text-left transition',
            config.difficulty === opt.id ? 'border-jade bg-jade-soft' : 'border-line hover:border-jade-soft'
          ]"
        >
          <div class="font-semibold">{{ opt.name }}</div>
          <div class="text-sm mt-2 text-ink-soft">{{ opt.desc }}</div>
        </button>
      </div>
    </div>

    <!-- 底部按钮 -->
    <div class="flex gap-3 pt-4">
      <button @click="gameFlow.enterTitle()" class="px-6 py-2 border border-line rounded-md">返回</button>
      <button @click="confirm" class="px-6 py-2 bg-jade text-white rounded-md font-semibold">下一步：塑造角色</button>
    </div>
  </div>
</template>
