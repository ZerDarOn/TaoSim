import { defineStore } from 'pinia';
import type { WorldState, SavePayload, SaveHeader, GraveMarker } from '@taosim/contracts';
import { parseRealm } from '@taosim/contracts';
import { WorldEngine, generateLegendaryNpcs } from '@taosim/engine';
import { IndexedDBStorageAdapter, MigrationService } from '@taosim/persistence';
import { usePlayerStore } from '@/stores/player';
import { useMapStore } from '@/stores/map';

interface AppState {
  isInitialized: boolean;
  currentWorldState: WorldState | null;
  saveHeaders: SaveHeader[];
  /** C2：玩家关注的 NPC ID 列表 */
  watchedNpcIds: string[];
}

/**
 * 将 Vue 响应式 Proxy 转为普通可结构化克隆的纯对象。
 * IndexedDB 的 structured clone 无法克隆 Proxy，保存前必须深拷贝。
 */
function toPlain<T>(value: T): T {
  return value == null ? value : (JSON.parse(JSON.stringify(value)) as T);
}

let storage: IndexedDBStorageAdapter | null = null;
let storageInitPromise: Promise<IndexedDBStorageAdapter> | null = null;

/**
 * 获取已初始化的存储适配器单例。
 * 使用 in-flight Promise 缓存，避免并发调用时重复创建 DB 连接。
 */
function getStorage(): Promise<IndexedDBStorageAdapter> {
  if (storage) return Promise.resolve(storage);
  if (storageInitPromise) return storageInitPromise;
  storageInitPromise = (async () => {
    const adapter = new IndexedDBStorageAdapter();
    await adapter.initialize();
    storage = adapter;
    return adapter;
  })();
  return storageInitPromise;
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    isInitialized: false,
    currentWorldState: null,
    saveHeaders: [],
    watchedNpcIds: [],
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
        npcs: Object.fromEntries(generateLegendaryNpcs().map((n) => [n.id, n])),
        eventLog: [],
      };
      const engine = new WorldEngine(initialState);
      this.currentWorldState = engine.getState();
      this.isInitialized = true;
    },

    async saveGame() {
      const playerStore = usePlayerStore();
      const mapStore = useMapStore();
      const player = playerStore.character;
      if (!player || !this.currentWorldState) return;

      const adapter = await getStorage();
      const payload: SavePayload = {
        header: {
          saveId: `save_${Date.now()}`,
          schemaVersion: 6,
          gameVersion: '0.2.0',
          timestamp: Date.now(),
          playTimeMonths: (this.currentWorldState.currentYear - 1) * 12 + this.currentWorldState.currentMonth - 1,
          playerSummary: {
            name: player.name,
            realm: player.realm,
            portraitId: 'default',
          },
        },
        worldState: toPlain(this.currentWorldState),
        player: toPlain(player),
        // v4：废弃字段不再写入（activeNPCs/overworldMap/factions/marketInventories/npcTradeOffers）
        // 墓碑投影从 worldState.archivedNpcs 生成（GraveMarker 是非权威查询投影）
        graveyard: Object.values(this.currentWorldState.archivedNpcs ?? {}).map<GraveMarker>((r) => ({
          characterId: r.id,
          name: r.name,
          deathAge: Math.floor(r.lifespan.age),
          deathYear: r.deathYear ?? 0,
          causeOfDeath: r.causeOfDeath ?? 'unknown',
          realmAtDeath: parseRealm(r.realm).realmType ?? 'LianQi',
          relationHooks: Object.entries(r.relations).map(([targetId, entry]) => ({
            targetId,
            relationType: entry.type,
          })),
        })),
        // 玩家地图进度：层级/位置/已探索六边形
        playerMapState: toPlain(mapStore.state),
        watchedNpcIds: [...this.watchedNpcIds],
      };
      await adapter.save(payload);
      this.saveHeaders = await adapter.listHeaders();
    },

    async loadGame(saveId: string) {
      const adapter = await getStorage();
      const raw = await adapter.load(saveId);
      if (!raw) return;

      // 执行版本迁移（向后兼容老存档）
      const payload = MigrationService.loadWithMigration(raw);

      const playerStore = usePlayerStore();
      const mapStore = useMapStore();
      playerStore.setPlayer(payload.player);
      this.currentWorldState = payload.worldState;
      this.isInitialized = true;

      // 恢复玩家地图进度；老存档无此字段时保留当前默认状态
      if (payload.playerMapState) {
        mapStore.hydrateFromSave(payload.playerMapState);
      }
      // C2：恢复关注列表
      this.watchedNpcIds = payload.watchedNpcIds ?? [];
    },

    clearWorldState() {
      this.currentWorldState = null;
      this.isInitialized = false;
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

    // ── C2：关注列表操作 ──

    /** 关注指定 NPC（已关注则无操作） */
    followNpc(npcId: string) {
      if (!this.watchedNpcIds.includes(npcId)) {
        this.watchedNpcIds.push(npcId);
      }
    },

    /** 取消关注指定 NPC */
    unfollowNpc(npcId: string) {
      this.watchedNpcIds = this.watchedNpcIds.filter(id => id !== npcId);
    },

    /** 切换关注状态 */
    toggleFollowNpc(npcId: string) {
      if (this.watchedNpcIds.includes(npcId)) {
        this.unfollowNpc(npcId);
      } else {
        this.followNpc(npcId);
      }
    },

    /** 是否已关注 */
    isWatchingNpc(npcId: string): boolean {
      return this.watchedNpcIds.includes(npcId);
    },
  },
});
