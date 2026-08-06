<script setup lang="ts">
/**
 * CharacterPanel — 「角色」tab 主容器
 * 5 个子页签：概览 | 修炼 | 功法 | 百艺 | 背包
 * 子页签状态存于 uiStore.charSubTab，支持外部跳转预设（如练功场 → 修炼）
 */
import { useUiStore, type CharacterSubTab } from '@/stores/ui';
import OverviewTab from './character/OverviewTab.vue';
import CultivationTab from './character/CultivationTab.vue';
import SkillsTab from './character/SkillsTab.vue';
import CraftingTab from './character/CraftingTab.vue';
import InventoryTab from './character/InventoryTab.vue';

const uiStore = useUiStore();

const SUB_TABS: Array<{ key: CharacterSubTab; label: string }> = [
  { key: 'overview', label: '概览' },
  { key: 'cultivation', label: '修炼' },
  { key: 'skills', label: '功法' },
  { key: 'crafting', label: '百艺' },
  { key: 'inventory', label: '背包' },
];
</script>

<template>
  <div class="space-y-4">
    <!-- 子页签导航 -->
    <div class="flex gap-1.5 flex-wrap">
      <button
        v-for="tab in SUB_TABS" :key="tab.key"
        @click="uiStore.setCharSubTab(tab.key)"
        :class="['px-4 py-2 rounded-lg text-sm font-semibold transition',
          uiStore.charSubTab === tab.key
            ? 'bg-amber-700 text-white'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700']"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- 子页签内容 -->
    <OverviewTab v-if="uiStore.charSubTab === 'overview'" />
    <CultivationTab v-else-if="uiStore.charSubTab === 'cultivation'" />
    <SkillsTab v-else-if="uiStore.charSubTab === 'skills'" />
    <CraftingTab v-else-if="uiStore.charSubTab === 'crafting'" />
    <InventoryTab v-else-if="uiStore.charSubTab === 'inventory'" />
  </div>
</template>
