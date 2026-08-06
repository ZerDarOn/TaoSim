<script setup lang="ts">
/**
 * OverviewTab — 角色「概览」子页签
 * 内容源自原 CharacterDetailModal：基础信息 + 六维属性 + 天赋词条 + 游戏模式
 */
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import {
  formatGender,
  formatRealm,
  formatSoulState,
  formatSpiritRootGrade,
  formatSpiritElement,
  formatTraitQuality,
  traitQualityColor,
} from '@/utils/i18n-game';

const playerStore = usePlayerStore();

const c = computed(() => playerStore.character);

const attrItems = computed(() => {
  const a = c.value?.attributes;
  if (!a) return [];
  return [
    { label: '根骨', value: a.physique },
    { label: '悟性', value: a.comprehension },
    { label: '神识', value: a.perception },
    { label: '身法', value: a.agility },
    { label: '气运', value: a.luck },
    { label: '仙姿', value: a.charm },
  ];
});

const ATTR_MAX = 20;

const spiritRootText = computed(() => {
  const r = c.value?.spiritRoot;
  if (!r) return '';
  const grade = formatSpiritRootGrade(r.grade);
  const elements = r.elements.map(formatSpiritElement).join('/');
  return `${grade}灵根 · ${elements}${r.isVariant ? '（变异）' : ''}`;
});

// 游戏模式（突破 / 存档）
const gameModeText = computed(() => {
  const m = c.value?.gameMode;
  if (!m) return '—';
  const breakthrough = m.breakthrough === 'Simple' ? '简单突破' : '传统突破';
  const save = m.saveMode === 'Ironman' ? '铁人模式' : '自由模式';
  return `${breakthrough} · ${save}`;
});
</script>

<template>
  <div v-if="c" class="space-y-6">
    <!-- 基础信息 -->
    <section class="space-y-2">
      <div class="text-2xl font-bold text-amber-200">{{ c.name }}</div>
      <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div><span class="text-slate-400">性别：</span>{{ formatGender(c.gender) }}</div>
        <div><span class="text-slate-400">境界：</span>{{ formatRealm(c.realm) }}</div>
        <div><span class="text-slate-400">寿元：</span>{{ Math.floor(c.lifespan.age) }} / {{ c.lifespan.maxLifespan }} 岁</div>
        <div><span class="text-slate-400">魂态：</span>{{ formatSoulState(c.soulState) }}</div>
        <div class="col-span-2"><span class="text-slate-400">灵根：</span>{{ spiritRootText }}</div>
        <div class="col-span-2"><span class="text-slate-400">游戏模式：</span>{{ gameModeText }}</div>
      </div>
    </section>

    <!-- 六维属性 -->
    <section>
      <h3 class="text-sm font-semibold text-slate-300 mb-2">基础属性</h3>
      <div class="space-y-1.5">
        <div v-for="attr in attrItems" :key="attr.label">
          <div class="flex justify-between text-xs mb-0.5">
            <span class="text-slate-300">{{ attr.label }}</span>
            <span class="text-slate-400">{{ attr.value }}</span>
          </div>
          <div class="h-1.5 bg-slate-700 rounded">
            <div class="h-full bg-amber-500 rounded"
              :style="{ width: `${Math.min(100, (attr.value / ATTR_MAX) * 100)}%` }"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 天赋词条 -->
    <section v-if="c.traits.length">
      <h3 class="text-sm font-semibold text-slate-300 mb-2">天赋词条</h3>
      <div class="space-y-2">
        <div v-for="t in c.traits" :key="t.id"
          class="bg-slate-800 rounded p-3">
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-medium text-slate-100">{{ t.name }}</span>
            <span class="text-xs" :class="traitQualityColor(t.quality)">{{ formatTraitQuality(t.quality) }}</span>
          </div>
          <div class="text-xs text-slate-400 mt-1">{{ t.description }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
