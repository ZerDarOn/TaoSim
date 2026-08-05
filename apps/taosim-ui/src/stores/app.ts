import { defineStore } from 'pinia';
import type { WorldState, SaveHeader } from '@taosim/contracts';

interface AppState {
  isInitialized: boolean;
  currentWorldState: WorldState | null;
  saveHeaders: SaveHeader[];
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    isInitialized: false,
    currentWorldState: null,
    saveHeaders: [],
  }),

  getters: {
    gameYear: (state) => state.currentWorldState?.currentYear ?? 1,
    gameMonth: (state) => state.currentWorldState?.currentMonth ?? 1,
  },

  actions: {
    async initialize() {
      // TODO: 加载存档列表，初始化世界状态
      this.isInitialized = true;
    },
  },
});
