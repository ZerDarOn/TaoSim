<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';

const playerStore = usePlayerStore();
const uiStore = useUiStore();

const c = computed(() => playerStore.character);
const lifespanPct = computed(() => {
  if (!c.value) return 0;
  return Math.min(100, Math.round((c.value.lifespan.age / c.value.lifespan.maxLifespan) * 100));
});
const lifespanWarning = computed(() => lifespanPct.value >= 80);

const spiritRootText = computed(() => {
  if (!c.value) return '';
  const root = c.value.spiritRoot;
  const gradeMap = { Heaven: '天', Earth: '地', Profound: '玄', Yellow: '黄' };
  const grade = gradeMap[root.grade];
  const elements = root.elements.join('/');
  return `${grade}灵根 · ${elements}${root.isVariant ? '（变异）' : ''}`;
});
</script>

<template>
  <aside v-if="c" class="w-56 flex-shrink-0 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto">
    <div class="mb-3">
      <div class="text-lg font-semibold text-amber-200">{{ c.name }}</div>
      <div class="text-xs text-slate-400">{{ c.realm }}</div>
    </div>

    <div class="space-y-2 text-sm mb-3">
      <div>
        <div class="flex justify-between text-xs mb-0.5">
          <span>气血</span><span>{{ c.hp }}/{{ c.maxHp }}</span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded">
          <div class="h-full bg-red-500 rounded" :style="{ width: `${(c.hp / c.maxHp) * 100}%` }"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-0.5">
          <span>灵力</span><span>{{ c.spiritEnergy.current }}/{{ c.spiritEnergy.max }}</span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded">
          <div class="h-full bg-blue-500 rounded" :style="{ width: `${(c.spiritEnergy.current / c.spiritEnergy.max) * 100}%` }"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-0.5">
          <span>行动</span><span>{{ c.monthlyActionPoints.current }}/{{ c.monthlyActionPoints.max }}</span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded">
          <div class="h-full bg-green-500 rounded" :style="{ width: `${(c.monthlyActionPoints.current / c.monthlyActionPoints.max) * 100}%` }"></div>
        </div>
      </div>
    </div>

    <div class="text-sm mb-3">
      <div class="text-slate-400 text-xs">灵石</div>
      <div class="text-amber-300">{{ c.spiritStones }}</div>
    </div>

    <div class="text-sm mb-3" :class="{ 'text-red-400': lifespanWarning }">
      <div class="text-slate-400 text-xs">寿元 {{ lifespanWarning ? '⚠' : '' }}</div>
      <div>{{ Math.floor(c.lifespan.age) }}/{{ c.lifespan.maxLifespan }}</div>
    </div>

    <div class="text-xs text-slate-400 mb-3">
      <div class="mb-0.5">灵根</div>
      <div class="text-slate-300">{{ spiritRootText }}</div>
    </div>

    <button
      class="w-full px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded"
      @click="uiStore.openCharDetail()"
    >
      查看详情
    </button>
  </aside>
</template>
