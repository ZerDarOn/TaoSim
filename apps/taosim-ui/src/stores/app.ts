import { defineStore } from 'pinia';
import type { WorldState, SavePayload, SaveHeader } from '@taosim/contracts';
import { WorldEngine } from '@taosim/engine';
import { IndexedDBStorageAdapter } from '@taosim/persistence';
import { usePlayerStore } from '@/stores/player';

interface AppState {
  isInitialized: boolean;
  currentWorldState: WorldState | null;
  saveHeaders: SaveHeader[];
}

let storage: IndexedDBStorageAdapter | null = null;

async function getStorage(): Promise<IndexedDBStorageAdapter> {
  if (!storage) {
    storage = new IndexedDBStorageAdapter();
    await storage.initialize();
  }
  return storage;
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

    async saveGame() {
      const playerStore = usePlayerStore();
      const player = playerStore.character;
      if (!player || !this.currentWorldState) return;

      const adapter = await getStorage();
      const payload: SavePayload = {
        header: {
          saveId: `save_${Date.now()}`,
          schemaVersion: 1,
          gameVersion: '0.2.0',
          timestamp: Date.now(),
          playTimeMonths: (this.currentWorldState.currentYear - 1) * 12 + this.currentWorldState.currentMonth - 1,
          playerSummary: {
            name: player.name,
            realm: player.realm,
            portraitId: 'default',
          },
        },
        worldState: this.currentWorldState,
        player,
        activeNPCs: {},
        factions: {},
        overworldMap: { continents: [] },
        graveyard: [],
        marketInventories: {},
        npcTradeOffers: {},
      };
      await adapter.save(payload);
      this.saveHeaders = await adapter.listHeaders();
    },

    async loadGame(saveId: string) {
      const adapter = await getStorage();
      const payload = await adapter.load(saveId);
      if (!payload) return;

      const playerStore = usePlayerStore();
      playerStore.setPlayer(payload.player);
      this.currentWorldState = payload.worldState;
      this.isInitialized = true;
    },

    async loadSaveHeaders() {
      const adapter = await getStorage();
      this.saveHeaders = await adapter.listHeaders();
    },

    async deleteSave(saveId: string) {
      const adapter = await getStorage();
      await adapter.deleteSave(saveId);
      this.saveHeaders = await adapter.listHeaders();
    },
  },
});
