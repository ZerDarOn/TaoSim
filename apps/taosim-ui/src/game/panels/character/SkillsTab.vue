<script setup lang="ts">
/**
 * SkillsTab — 角色「功法」子页签
 * 展示角色已习得功法 + 当前装备概览（只读；穿戴在「背包」子页签操作）
 */
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { formatSkillQuality, formatSkillType } from '@/utils/i18n-game';

const playerStore = usePlayerStore();

const c = computed(() => playerStore.character);

const equipmentDisplay = computed(() => {
  const cc = c.value;
  if (!cc) return null;
  return {
    weapon: cc.equipmentSlots.weapon?.name ?? '无',
    armor: cc.equipmentSlots.armor?.name ?? '无',
    treasures: cc.equipmentSlots.treasures.map(t => t.name),
  };
});
</script>

<template>
  <div v-if="c" class="space-y-4">
    <!-- 功法技能 -->
    <section>
      <h3 class="text-sm font-semibold text-slate-300 mb-2">
        功法技能<span v-if="c.skills.length" class="text-xs text-slate-500 ml-1">（{{ c.skills.length }}）</span>
      </h3>
      <div v-if="c.skills.length === 0" class="p-4 bg-slate-800 rounded text-center text-sm text-slate-500">
        尚未习得任何功法。可通过探索奇遇或拜师论道获得。
      </div>
      <div v-else class="space-y-2">
        <div v-for="s in c.skills" :key="s.id"
          class="bg-slate-800 rounded p-3 flex items-baseline justify-between">
          <span class="text-sm font-medium text-slate-100">{{ s.name }}</span>
          <div class="text-xs text-slate-400">
            <span class="text-amber-300">{{ formatSkillQuality(s.quality) }}</span>
            <span class="mx-1">·</span>
            <span>{{ formatSkillType(s.type) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 装备概览（只读） -->
    <section>
      <h3 class="text-sm font-semibold text-slate-300 mb-2">装备概览</h3>
      <div class="p-4 bg-slate-800 rounded space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-slate-400">武器</span>
          <span class="text-slate-100">{{ equipmentDisplay?.weapon }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">防具</span>
          <span class="text-slate-100">{{ equipmentDisplay?.armor }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">法宝</span>
          <span v-if="equipmentDisplay?.treasures.length" class="text-slate-100">{{ equipmentDisplay.treasures.join('、') }}</span>
          <span v-else class="text-slate-500">无</span>
        </div>
      </div>
      <div class="text-xs text-slate-500 mt-1">装备的穿戴与卸下请在「背包」页操作。</div>
    </section>
  </div>
</template>
