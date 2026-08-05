import { defineStore } from 'pinia';
import type { WorldState, SaveHeader } from '@taosim/contracts';
import { WorldEngine } from '@taosim/engine';

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
    async initialize(_playerId: string) {
      const initialState: WorldState = {
        currentYear: 1,
        currentMonth: 1,
        catastropheCountdownMonths: 600,
        activeContinentIds: ['CONTINENT_CANGZHOU'],
        globalFlags: {},
      };
      const engine = new WorldEngine(initialState);
      this.currentWorldState = engine.getState();
      this.isInitialized = true;
    },
  },
});
