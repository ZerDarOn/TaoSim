<script setup lang="ts">
import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';
import { usePlayerStore } from '@/stores/player';
import {
  formatGender,
  formatRealm,
  formatSoulState,
  formatSpiritRootGrade,
  formatSpiritElement,
  formatTraitQuality,
  traitQualityColor,
  formatSkillQuality,
  formatSkillType,
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

const relations = computed(() => {
  const rels = c.value?.relations;
  if (!rels) return [];
  return Object.values(rels);
});
</script>

<template>
  <div
    v-if="uiStore.charDetailOpen && c"
    class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
    @click.self="uiStore.closeCharDetail()"
  >
    <div class="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
      <!-- 顶栏 -->
      <div class="flex justify-between items-center px-6 py-4 border-b border-slate-700 sticky top-0 bg-slate-900 z-10">
        <h2 class="text-lg font-semibold text-amber-200">角色详情</h2>
        <button
          @click="uiStore.closeCharDetail()"
          class="text-slate-400 hover:text-slate-100 text-xl leading-none px-2"
          aria-label="关闭"
        >×</button>
      </div>

      <div class="p-6 space-y-6">
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

        <!-- 3. 天赋词条 -->
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

        <!-- 4. 技能列表 -->
        <section v-if="c.skills.length">
          <h3 class="text-sm font-semibold text-slate-300 mb-2">功法技能</h3>
          <div class="space-y-2">
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

        <!-- 5. 装备概览 -->
        <section>
          <h3 class="text-sm font-semibold text-slate-300 mb-2">装备概览</h3>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>
              <span class="text-slate-400">武器：</span>
              <span class="text-slate-100">{{ c.equipmentSlots.weapon?.name ?? '无' }}</span>
            </div>
            <div>
              <span class="text-slate-400">防具：</span>
              <span class="text-slate-100">{{ c.equipmentSlots.armor?.name ?? '无' }}</span>
            </div>
            <div class="col-span-2">
              <span class="text-slate-400">法宝：</span>
              <span v-if="c.equipmentSlots.treasures.length"
                class="text-slate-100">{{ c.equipmentSlots.treasures.map(t => t.name).join('、') }}</span>
              <span v-else class="text-slate-500">无</span>
            </div>
          </div>
        </section>

        <!-- 6. 人际关系 -->
        <section v-if="relations.length">
          <h3 class="text-sm font-semibold text-slate-300 mb-2">人际关系</h3>
          <div class="space-y-1 text-sm">
            <div v-for="rel in relations" :key="rel.targetId"
              class="flex justify-between bg-slate-800 rounded px-3 py-1.5">
              <span class="text-slate-300">{{ rel.targetId }}</span>
              <span :class="rel.favorability >= 0 ? 'text-green-400' : 'text-red-400'">
                好感 {{ rel.favorability }}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
