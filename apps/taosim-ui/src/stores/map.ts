/**
 * 地图状态 Store
 *
 * 管理多层级地图状态：
 * - 当前层级（Cosmos / Continent / Region / Venue）
 * - 当前所在大陆/星系/场所
 * - 已探索六边形坐标的按大陆分片缓存
 * - 玩家在六边形网格上的位置
 *
 * 缓存策略：session 级（Pinia + localStorage 兜底）。
 * 切换 tab / 组件卸载不丢失已探索状态。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { MapLayer, PlayerMapState } from '@taosim/contracts';
import { createInitialMapState, getContinent } from '@taosim/engine';

const STORAGE_KEY = 'taosim_map_state_v1';

function loadFromStorage(): PlayerMapState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlayerMapState;
  } catch {
    return null;
  }
}

function saveToStorage(state: PlayerMapState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage 满或不可用，静默降级
  }
}

export const useMapStore = defineStore('map', () => {
  // 初始化：优先 localStorage，否则默认
  const persisted = loadFromStorage();
  const state = ref<PlayerMapState>(persisted ?? createInitialMapState());

  // ---- 持久化 ----
  function persist() {
    saveToStorage(state.value);
  }

  // ---- 读 ----
  const activeLayer = computed(() => state.value.activeLayer);
  const activeCosmosId = computed(() => state.value.activeCosmosId);
  const activeContinentId = computed(() => state.value.activeContinentId);
  const activeVenueId = computed(() => state.value.activeVenueId);
  const hexPos = computed(() => state.value.hexPos);

  const exploredHexesForActiveContinent = computed(() => {
    const arr = state.value.exploredHexes[state.value.activeContinentId] ?? [];
    return new Set(arr.map(h => `${h.q},${h.r}`));
  });

  function getExploredHexes(continentId: string): Set<string> {
    const arr = state.value.exploredHexes[continentId] ?? [];
    return new Set(arr.map(h => `${h.q},${h.r}`));
  }

  // ---- 写 ----

  /** 切换当前查看的层级（不影响玩家实际位置） */
  function setActiveLayer(layer: MapLayer) {
    state.value.activeLayer = layer;
    persist();
  }

  /** 记录已探索的格子（合并去重） */
  function markExplored(continentId: string, positions: Array<{ q: number; r: number }>) {
    if (positions.length === 0) return;
    const existing = state.value.exploredHexes[continentId] ?? [];
    const set = new Set(existing.map(h => `${h.q},${h.r}`));
    let changed = false;
    for (const p of positions) {
      const key = `${p.q},${p.r}`;
      if (!set.has(key)) {
        set.add(key);
        existing.push(p);
        changed = true;
      }
    }
    if (changed) {
      state.value.exploredHexes[continentId] = existing;
      persist();
    }
  }

  /** 批量同步一个网格的已探索状态（用于离开网格前持久化） */
  function syncExploredFromGrid(continentId: string, exploredList: Array<{ q: number; r: number }>) {
    state.value.exploredHexes[continentId] = exploredList;
    persist();
  }

  /** 更新玩家在当前大陆网格上的位置 */
  function setHexPos(pos: { q: number; r: number }) {
    state.value.hexPos = pos;
    persist();
  }

  /** 切换到指定大陆（传送/御空），重置 hexPos 到该大陆的默认起点 */
  function switchContinent(continentId: string, newPos?: { q: number; r: number }) {
    state.value.activeContinentId = continentId;
    const meta = getContinent(continentId);
    state.value.activeCosmosId = meta?.cosmosId ?? state.value.activeCosmosId;
    state.value.hexPos = newPos ?? { q: 10, r: 10 };
    state.value.activeLayer = 'Region';
    state.value.activeVenueId = null;
    persist();
  }

  /** 进入场所 */
  function enterVenue(venueId: string) {
    state.value.activeVenueId = venueId;
    state.value.activeLayer = 'Venue';
    persist();
  }

  /** 离开场所，回到区域层级 */
  function leaveVenue() {
    state.value.activeVenueId = null;
    state.value.activeLayer = 'Region';
    persist();
  }

  /** 离开具体场所但保持城镇内部视图（显示场所列表） */
  function backToVenueList() {
    state.value.activeVenueId = null;
    state.value.activeLayer = 'Venue';
    persist();
  }

  /** 重置（新游戏） */
  function reset() {
    state.value = createInitialMapState();
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }

  /**
   * 从存档恢复地图状态（读档时调用）。
   * 覆盖当前 state 并同步写入 localStorage，使后续组件挂载读到正确数据。
   */
  function hydrateFromSave(saved: PlayerMapState) {
    state.value = saved;
    persist();
  }

  return {
    // state
    state,
    // computed
    activeLayer,
    activeCosmosId,
    activeContinentId,
    activeVenueId,
    hexPos,
    exploredHexesForActiveContinent,
    // read
    getExploredHexes,
    // write
    setActiveLayer,
    markExplored,
    syncExploredFromGrid,
    setHexPos,
    switchContinent,
    enterVenue,
    leaveVenue,
    backToVenueList,
    reset,
    hydrateFromSave,
  };
});
