/**
 * 事件日志 Store
 *
 * 统一管理所有游戏事件的收集、存储、过滤。
 * 替代各面板散落的 message ref——所有有意义的游戏事件都汇入这里。
 *
 * 设计：
 * - 事件按时间倒序存储（最新在上）
 * - 保留最近 200 条
 * - 支持按 category 过滤 + 关键词搜索
 * - 提供便捷的 addEvent 工厂方法
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { BigEventLog, EventCategory } from '@taosim/contracts';
import { useAppStore } from '@/stores/app';

const MAX_EVENTS = 200;

export const useEventLogStore = defineStore('eventLog', () => {
  const appStore = useAppStore();
  const events = ref<BigEventLog[]>([]);

  // 过滤状态
  const activeFilters = ref<Set<EventCategory>>(new Set());
  const searchKeyword = ref('');

  // 过滤后的事件
  const filteredEvents = computed(() => {
    let result = events.value;

    // 分类过滤
    if (activeFilters.value.size > 0) {
      result = result.filter(e => activeFilters.value.has(e.category));
    }

    // 关键词搜索
    const kw = searchKeyword.value.trim().toLowerCase();
    if (kw) {
      result = result.filter(
        e => e.title.toLowerCase().includes(kw) || e.description.toLowerCase().includes(kw),
      );
    }

    return result;
  });

  // ---- 写入 ----

  /**
   * 添加一条事件日志。
   * 如果没有传 year/month，自动从当前世界时间获取。
   */
  function addEvent(
    category: EventCategory,
    title: string,
    description: string = '',
    options: {
      isMajorEvent?: boolean;
      involvedCharacterIds?: string[];
      year?: number;
      month?: number;
    } = {},
  ) {
    const year = options.year ?? appStore.currentWorldState?.currentYear ?? 1;
    const month = options.month ?? appStore.currentWorldState?.currentMonth ?? 1;

    const evt: BigEventLog = {
      id: `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      year,
      month,
      isMajorEvent: options.isMajorEvent ?? false,
      category,
      title,
      description,
      involvedCharacterIds: options.involvedCharacterIds ?? [],
    };

    events.value.unshift(evt);
    if (events.value.length > MAX_EVENTS) {
      events.value = events.value.slice(0, MAX_EVENTS);
    }
  }

  /** 批量导入世界引擎产生的事件 */
  function importWorldEvents(worldEvents: BigEventLog[]) {
    for (const evt of worldEvents.reverse()) {
      events.value.unshift(evt);
    }
    if (events.value.length > MAX_EVENTS) {
      events.value = events.value.slice(0, MAX_EVENTS);
    }
  }

  // ---- 过滤操作 ----

  function toggleFilter(category: EventCategory) {
    const next = new Set(activeFilters.value);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    activeFilters.value = next;
  }

  function clearFilters() {
    activeFilters.value = new Set();
    searchKeyword.value = '';
  }

  function setSearch(keyword: string) {
    searchKeyword.value = keyword;
  }

  /** 清空全部 */
  function clear() {
    events.value = [];
  }

  return {
    events,
    activeFilters,
    searchKeyword,
    filteredEvents,
    addEvent,
    importWorldEvents,
    toggleFilter,
    clearFilters,
    setSearch,
    clear,
  };
});
