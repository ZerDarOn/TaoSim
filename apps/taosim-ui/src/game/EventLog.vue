<script setup lang="ts">
/**
 * EventLog — 事件日志侧边栏（双视角，世界涌现叙事设计 §6）
 *
 * 沉浸视角（默认）：玩家可感知的事件——分类过滤/搜索 + "与我相关"（§6.3 visibleToPlayer）
 * 编年史视角（上帝）：年度大事记（buildChronicle）+ NPC 生平时间线（npcTimeline）
 */

import { ref, computed } from 'vue';
import { useEventLogStore } from '@/stores/event-log';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { buildChronicle, visibleToPlayer, npcTimeline, rumorPool } from '@taosim/engine';
import type { EventCategory } from '@taosim/contracts';

const logStore = useEventLogStore();
const appStore = useAppStore();
const playerStore = usePlayerStore();

type Perspective = 'immersive' | 'rumor' | 'chronicle';
const perspective = ref<Perspective>('immersive');
const onlyMine = ref(false);
const selectedNpcId = ref<string | null>(null);

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

// ── 沉浸视角 ──
const player = computed(() => playerStore.character);
const immersiveEvents = computed(() => {
  if (!onlyMine.value || !player.value) return logStore.filteredEvents;
  return logStore.filteredEvents.filter(e => visibleToPlayer(e, player.value!));
});

// ── 编年史视角（上帝视角，§6.2）──
const chronicle = computed(() => buildChronicle(appStore.currentWorldState?.eventLog ?? []));

// ── 传闻视角（§4.8/§6 信息不对称）：玩家"听说"的 regional/world 事件，含传播延迟 ──
const rumorList = computed(() => {
  const ws = appStore.currentWorldState;
  if (!ws) return [];
  const now = { year: ws.currentYear, month: ws.currentMonth };
  return rumorPool(ws.eventLog, now).sort(
    (a, b) => b.heardAt.year - a.heardAt.year || b.heardAt.month - a.heardAt.month,
  );
});

/** 事件流中出现过的 NPC（去重 + 名字映射），供生平浏览 */
const npcCandidates = computed(() => {
  const log = appStore.currentWorldState?.eventLog ?? [];
  const npcs = appStore.currentWorldState?.npcs ?? {};
  const seen = new Map<string, string>();
  for (const e of log) {
    for (const id of e.involvedCharacterIds) {
      if (!seen.has(id)) seen.set(id, npcs[id]?.name ?? id);
    }
  }
  return [...seen.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
});

const selectedNpcTimeline = computed(() => {
  if (!selectedNpcId.value) return [];
  return npcTimeline(selectedNpcId.value, appStore.currentWorldState?.eventLog ?? []);
});
</script>

<template>
  <aside class="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 flex flex-col">
    <!-- 标题 + 视角切换 -->
    <div class="px-3 py-2 border-b border-slate-700">
      <div class="flex items-center justify-between mb-1.5">
        <div class="text-sm text-slate-200 font-semibold">事件日志</div>
        <div class="flex rounded overflow-hidden border border-slate-600 text-[10px]">
          <button
            class="px-2 py-0.5 transition"
            :class="perspective === 'immersive' ? 'bg-amber-600 text-white' : 'bg-slate-700/40 text-slate-400 hover:bg-slate-700'"
            @click="perspective = 'immersive'"
          >沉浸</button>
          <button
            class="px-2 py-0.5 transition"
            :class="perspective === 'rumor' ? 'bg-amber-600 text-white' : 'bg-slate-700/40 text-slate-400 hover:bg-slate-700'"
            @click="perspective = 'rumor'"
          >传闻</button>
          <button
            class="px-2 py-0.5 transition"
            :class="perspective === 'chronicle' ? 'bg-amber-600 text-white' : 'bg-slate-700/40 text-slate-400 hover:bg-slate-700'"
            @click="perspective = 'chronicle'"
          >编年史</button>
        </div>
      </div>
    </div>

    <!-- ═══ 沉浸视角 ═══ -->
    <template v-if="perspective === 'immersive'">
      <!-- 与我相关 -->
      <div class="px-2 py-1.5 border-b border-slate-700">
        <button
          class="w-full text-left px-2 py-1 rounded text-[10px] font-medium transition border"
          :class="onlyMine
            ? 'border-transparent bg-slate-900 text-amber-400'
            : 'border-slate-600 bg-slate-700/40 text-slate-400 hover:bg-slate-700'"
          @click="onlyMine = !onlyMine"
        >
          {{ onlyMine ? '★ 仅看我所能知晓的事件' : '☆ 全部事件（含传闻与全知信息）' }}
        </button>
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
        <div v-if="immersiveEvents.length === 0" class="text-xs text-slate-500 italic text-center py-4">
          <template v-if="logStore.events.length === 0">天地初开，万籁俱寂……</template>
          <template v-else>无匹配事件</template>
        </div>

        <div
          v-for="evt in immersiveEvents" :key="evt.id"
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
        共 {{ logStore.events.length }} 条{{ immersiveEvents.length !== logStore.events.length ? `（显示 ${immersiveEvents.length}）` : '' }}
      </div>
    </template>

    <!-- ═══ 传闻视角 ═══ -->
    <template v-else-if="perspective === 'rumor'">
      <!-- 说明 -->
      <div class="px-2 py-1.5 border-b border-slate-700">
        <div class="text-[10px] text-slate-400 leading-snug">
          江湖传闻 · 近 24 个月可"听说"的 regional/world 大事（local 不扩散）
        </div>
      </div>

      <!-- 传闻列表（滚动区域） -->
      <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
        <div v-if="rumorList.length === 0" class="text-xs text-slate-500 italic text-center py-4">
          江湖太平，暂无传闻……
        </div>
        <div
          v-for="r in rumorList" :key="r.event.id"
          class="p-2 rounded bg-slate-700/30 border-l-2"
          :style="{ borderLeftColor: CATEGORY_META[r.event.category].color }"
        >
          <div class="flex items-center gap-1">
            <span class="text-[9px] text-slate-500 flex-shrink-0">听说于 {{ r.heardAt.year }}年{{ r.heardAt.month }}月</span>
            <span v-if="r.event.isMajorEvent" class="text-[9px] text-amber-400">★</span>
          </div>
          <div class="text-xs text-slate-200 font-medium leading-tight">{{ r.event.title }}</div>
          <div v-if="r.event.description" class="text-[10px] text-slate-400 mt-0.5 leading-snug">
            {{ r.event.year }}年{{ r.event.month }}月 · {{ r.event.description }}
          </div>
        </div>
      </div>
    </template>

    <!-- ═══ 编年史视角 ═══ -->
    <template v-else>
      <!-- NPC 生平浏览 -->
      <div class="px-2 py-2 border-b border-slate-700 space-y-1">
        <div class="text-[10px] text-slate-400 font-medium">NPC 生平</div>
        <select
          v-model="selectedNpcId"
          class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-amber-600"
        >
          <option :value="null">选择 NPC…</option>
          <option v-for="npc in npcCandidates" :key="npc.id" :value="npc.id">{{ npc.name }}</option>
        </select>
        <div v-if="selectedNpcTimeline.length" class="space-y-1 max-h-36 overflow-y-auto mt-1">
          <div
            v-for="evt in selectedNpcTimeline" :key="evt.id"
            class="text-[11px] text-slate-400 leading-snug border-l-2 pl-1.5"
            :style="{ borderLeftColor: CATEGORY_META[evt.category].color }"
          >
            <span class="text-slate-500">{{ evt.year }}年{{ evt.month }}月</span> {{ evt.title }}
          </div>
        </div>
      </div>

      <!-- 年度大事记 -->
      <div class="flex-1 overflow-y-auto p-2 space-y-3">
        <div v-if="chronicle.length === 0" class="text-xs text-slate-500 italic text-center py-4">
          岁月未长，尚无编年……
        </div>
        <div v-for="cy in chronicle" :key="cy.year">
          <div class="text-xs font-semibold text-amber-400 border-b border-slate-700 pb-1 mb-1">
            第 {{ cy.year }} 年 · {{ cy.highlights.length }} 件大事
          </div>
          <div v-if="cy.highlights.length === 0" class="text-[11px] text-slate-500 pl-1">
            风云未起，平淡一年
          </div>
          <div
            v-for="evt in cy.highlights" :key="evt.id"
            class="p-1.5 rounded bg-slate-700/30 border-l-2 mb-1"
            :style="{ borderLeftColor: CATEGORY_META[evt.category].color }"
          >
            <div class="text-[11px] text-slate-200 font-medium">{{ evt.month }}月 · {{ evt.title }}</div>
            <div v-if="evt.description" class="text-[10px] text-slate-400 mt-0.5">{{ evt.description }}</div>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>
