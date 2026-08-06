<script setup lang="ts">
/**
 * EventLog — 事件日志侧边栏
 *
 * 功能：
 * - 分类过滤（战斗/修炼/旅行/社交/经济/奇遇/世界）
 * - 关键词搜索
 * - 时间轴 UI（每类事件有独立图标+颜色）
 * - 重大事件高亮
 */

import { useEventLogStore } from '@/stores/event-log';
import type { EventCategory } from '@taosim/contracts';

const logStore = useEventLogStore();

// 分类元数据
const CATEGORY_META: Record<EventCategory, { label: string; icon: string; color: string; bg: string }> = {
  combat:      { label: '战斗', icon: '⚔', color: '#f87171', bg: 'rgba(239,68,68,0.15)' },
  cultivation: { label: '修炼', icon: '丹', color: '#fbbf24', bg: 'rgba(245,158,11,0.15)' },
  travel:      { label: '旅行', icon: '行', color: '#34d399', bg: 'rgba(16,185,129,0.15)' },
  social:      { label: '社交', icon: '人', color: '#a78bfa', bg: 'rgba(139,92,246,0.15)' },
  economy:     { label: '交易', icon: '石', color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
  discovery:   { label: '奇遇', icon: '缘', color: '#f472b6', bg: 'rgba(236,72,153,0.15)' },
  world:       { label: '世界', icon: '界', color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' },
};

const allCategories: EventCategory[] = ['combat', 'cultivation', 'travel', 'social', 'economy', 'discovery', 'world'];

function isFilterActive(cat: EventCategory): boolean {
  return logStore.activeFilters.has(cat);
}
</script>

<template>
  <aside class="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col">
    <!-- 标题 -->
    <div class="px-3 py-2 border-b border-slate-700">
      <div class="text-sm text-slate-200 font-semibold">事件日志</div>
    </div>

    <!-- 分类过滤 -->
    <div class="px-2 py-2 border-b border-slate-700 flex flex-wrap gap-1">
      <button
        v-for="cat in allCategories" :key="cat"
        @click="logStore.toggleFilter(cat)"
        :class="[
          'px-1.5 py-0.5 rounded text-[10px] font-medium transition border',
          isFilterActive(cat)
            ? 'border-transparent'
            : 'border-slate-600 bg-slate-700/40 text-slate-400 hover:bg-slate-700',
        ]"
        :style="isFilterActive(cat) ? {
          backgroundColor: CATEGORY_META[cat].bg,
          color: CATEGORY_META[cat].color,
        } : {}"
      >
        {{ CATEGORY_META[cat].icon }} {{ CATEGORY_META[cat].label }}
      </button>
    </div>

    <!-- 搜索框 -->
    <div class="px-2 py-1.5 border-b border-slate-700">
      <input
        :value="logStore.searchKeyword"
        @input="logStore.setSearch(($event.target as HTMLInputElement).value)"
        placeholder="搜索事件…"
        class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-600"
      >
    </div>

    <!-- 过滤清除按钮 -->
    <div v-if="logStore.activeFilters.size > 0 || logStore.searchKeyword" class="px-2 py-1 border-b border-slate-700">
      <button @click="logStore.clearFilters()" class="text-[10px] text-slate-500 hover:text-amber-400 transition">
        ✕ 清除筛选
      </button>
    </div>

    <!-- 事件列表（滚动区域） -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
      <div v-if="logStore.filteredEvents.length === 0" class="text-xs text-slate-500 italic text-center py-4">
        <template v-if="logStore.events.length === 0">天地初开，万籁俱寂……</template>
        <template v-else>无匹配事件</template>
      </div>

      <div
        v-for="evt in logStore.filteredEvents" :key="evt.id"
        :class="[
          'p-2 rounded border-l-2 transition',
          evt.isMajorEvent ? 'bg-slate-700/60' : 'bg-slate-700/30',
        ]"
        :style="{ borderLeftColor: CATEGORY_META[evt.category].color }"
      >
        <!-- 头部：时间 + 图标 + 标题 -->
        <div class="flex items-start gap-1.5">
          <span
            class="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold flex-shrink-0 mt-0.5"
            :style="{
              backgroundColor: CATEGORY_META[evt.category].bg,
              color: CATEGORY_META[evt.category].color,
            }"
          >{{ CATEGORY_META[evt.category].icon }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1">
              <span class="text-[9px] text-slate-500 flex-shrink-0">{{ evt.year }}年{{ evt.month }}月</span>
              <span v-if="evt.isMajorEvent" class="text-[9px] text-amber-400">★</span>
            </div>
            <div class="text-xs text-slate-200 font-medium leading-tight">{{ evt.title }}</div>
          </div>
        </div>
        <!-- 描述 -->
        <div v-if="evt.description" class="text-[11px] text-slate-400 mt-1 ml-5 leading-snug">
          {{ evt.description }}
        </div>
      </div>
    </div>

    <!-- 底部统计 -->
    <div class="px-2 py-1 border-t border-slate-700 text-[10px] text-slate-500">
      共 {{ logStore.events.length }} 条{{ logStore.filteredEvents.length !== logStore.events.length ? `（显示 ${logStore.filteredEvents.length}）` : '' }}
    </div>
  </aside>
</template>
