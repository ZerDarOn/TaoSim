<script setup lang="ts">
/**
 * CharacterDetailModal — 角色快速概览弹窗（精简版）
 * 点击左上角头像打开。仅展示基础信息 + 六维属性 + 灵根；
 * 完整信息（天赋/功法/装备/背包）见「角色」tab 各子页签。
 */
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { usePlayerStore } from '@/stores/player';
import {
  formatGender,
  formatRealm,
  formatSoulState,
  formatSpiritRootGrade,
  formatSpiritElement,
} from '@/utils/i18n-game';

const uiStore = useUiStore();
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
</script>

<template>
  <div
    v-if="uiStore.charDetailOpen && c"
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    @click.self="uiStore.closeCharDetail()"
  >
    <div class="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
      <!-- 顶栏 -->
      <div class="flex justify-between items-center px-5 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
        <h2 class="text-lg font-semibold text-amber-200">角色详情</h2>
        <button
          @click="uiStore.closeCharDetail()"
          class="text-slate-400 hover:text-slate-100 text-xl leading-none px-2"
          aria-label="关闭"
        >×</button>
      </div>

      <div class="p-5 space-y-5">
        <!-- 1. 基础信息 -->
        <section class="space-y-2">
          <div class="text-2xl font-bold text-amber-200">{{ c.name }}</div>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span class="text-slate-400">性别：</span>{{ formatGender(c.gender) }}</div>
            <div><span class="text-slate-400">境界：</span>{{ formatRealm(c.realm) }}</div>
            <div><span class="text-slate-400">寿元：</span>{{ Math.floor(c.lifespan.age) }} / {{ c.lifespan.maxLifespan }} 岁</div>
            <div><span class="text-slate-400">魂态：</span>{{ formatSoulState(c.soulState) }}</div>
            <div class="col-span-2"><span class="text-slate-400">灵根：</span>{{ spiritRootText }}</div>
          </div>
        </section>

        <!-- 2. 六维属性 -->
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
      </div>
    </div>
  </div>
</template>
