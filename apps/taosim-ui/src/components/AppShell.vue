<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import StatusBar from './StatusBar.vue';

const appStore = useAppStore();
const playerStore = usePlayerStore();

const navGroups = [
  {
    label: '修仙',
    items: [
      { path: '/world', label: '大世界' },
      { path: '/cultivation', label: '修炼' },
      { path: '/battle', label: '战棋' },
    ],
  },
  {
    label: '百艺',
    items: [
      { path: '/crafting', label: '炼丹炼器' },
      { path: '/upgrade', label: '装备升品' },
    ],
  },
  {
    label: '社交',
    items: [
      { path: '/market', label: '坊市' },
      { path: '/npc-interaction', label: '偶遇' },
      { path: '/npc-trade', label: '交易' },
    ],
  },
  {
    label: '行囊',
    items: [
      { path: '/inventory', label: '背包' },
      { path: '/overworld', label: '大地图' },
      { path: '/faction', label: '宗门' },
    ],
  },
];
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- 顶部导航 -->
    <header class="bg-surface border-b border-line shadow-surface">
      <div class="px-6 py-3 flex items-center justify-between">
        <router-link to="/" class="text-xl font-display text-jade font-bold tracking-wide">
          大千修仙界
        </router-link>

        <!-- 完整导航 -->
        <nav v-if="playerStore.isCreated" class="flex gap-6 text-sm text-ink-soft">
          <div v-for="group in navGroups" :key="group.label" class="flex items-center gap-2">
            <span class="text-[10px] text-muted uppercase tracking-wider">{{ group.label }}</span>
            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="hover:text-jade transition-colors"
              active-class="text-jade font-semibold"
            >{{ item.label }}</router-link>
          </div>
        </nav>

        <!-- 未创角时只显示首页/创角 -->
        <nav v-else class="flex gap-4 text-sm text-ink-soft">
          <router-link to="/" class="hover:text-jade transition-colors" active-class="text-jade font-semibold">首页</router-link>
          <router-link to="/create-character" class="hover:text-jade transition-colors" active-class="text-jade font-semibold">创角</router-link>
        </nav>

        <div class="text-xs text-muted">
          道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
        </div>
      </div>

      <!-- HUD 状态条（仅角色已创建时） -->
      <StatusBar v-if="playerStore.isCreated" />
    </header>

    <!-- 主内容区 -->
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
