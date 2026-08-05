<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';

const router = useRouter();
const appStore = useAppStore();

const navItems = [
  { path: '/', label: '首页' },
  { path: '/create-character', label: '创角' },
  { path: '/world', label: '大世界' },
  { path: '/cultivation', label: '修炼' },
  { path: '/battle', label: '战棋测试' },
];
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- 导航栏 -->
    <header class="bg-surface border-b border-line px-6 py-3 flex items-center justify-between shadow-surface">
      <router-link to="/" class="text-xl font-display text-jade font-bold tracking-wide">
        大千修仙界
      </router-link>
      <nav class="flex gap-4 text-sm text-ink-soft">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="hover:text-jade transition-colors"
          active-class="text-jade font-semibold"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <div class="text-xs text-muted">
        道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
      </div>
    </header>

    <!-- 主内容区 -->
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
