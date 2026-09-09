import { defineStore } from 'pinia';
import type { ChildhoodChoiceId, PlayerEntryMode, WorldState, SavePayload, SaveHeader, GraveMarker } from '@taosim/contracts';
import { CURRENT_SAVE_SCHEMA_VERSION, parseRealm } from '@taosim/contracts';
import {
  WorldEngine,
  generateLegendaryNpcs,
  createLegacySpatialState,
  findLandmarkPos,
  generateWorldGrid,
  migrateLegacySpatialSavePayload,
  beginPlayerEntry,
  completePlayerChildhood,
  createSeededRng,
  ensurePlayerEntryProfile,
  applyGodResourceIntervention,
} from '@taosim/engine';
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
    /**
     * 世界初始化（新流程：支持世界配置 + NPC 批量生成 + 预演化）
     *
     * @param playerId 玩家角色 ID
     * @param config 世界初始化配置
     * @param onProgress 进度回调（pct: 0-100, stage: 当前阶段描述）
     */
    async initialize(
      _playerId: string,
      config?: {
        npcScale?: 'small' | 'medium' | 'large';
        preEvolveYears?: number;
        difficulty?: 'easy' | 'normal' | 'hard';
        entryMode?: Exclude<PlayerEntryMode, 'legacy'>;
        worldSeed?: number;
        childhoodChoice?: ChildhoodChoiceId;
        startAge?: number;
        background?: 'orphan' | 'small-clan' | 'ancient-clan';
      },
      onProgress?: (pct: number, stage: string) => void,
    ) {
      const npcScaleMap = { small: 150, medium: 300, large: 500 };
      const targetNpcCount = npcScaleMap[config?.npcScale ?? 'medium'] ?? 300;
      const preEvolveYears = config?.preEvolveYears ?? 50;
      const worldSeed = Math.max(1, Math.floor(config?.worldSeed ?? 20260906));
      const worldRng = createSeededRng(worldSeed);
      const playerStore = usePlayerStore();

      // ── 阶段 1：天地初开，地图诞生 ──
      onProgress?.(5, '天地初开，大陆成形…');
      await this._yieldFrame();

      const initialState: WorldState = {
        currentYear: 1,
        currentMonth: 1,
        catastropheCountdownMonths: 600,
        activeContinentIds: ['CONTINENT_CANGZHOU'],
        globalFlags: { worldSeed },
        npcs: Object.fromEntries(generateLegendaryNpcs().map((n) => [n.id, n])),
        eventLog: [],
        spatialState: createLegacySpatialState(),
      };
      let engine = new WorldEngine(initialState, { npcBrainV2Mode: 'single-write', rng: worldRng });

      // ── 阶段 2：万物化生，NPC 涌现 ──
      onProgress?.(15, '万物化生，修士涌现…');
      await this._yieldFrame();

      // 批量生成初始 NPC（通过多次 step 让人口补充逻辑自然填充）
      // 每月补充10人，需要 targetNpcCount/10 个月 ≈ 15-50个月
      const monthsToPopulate = Math.ceil(targetNpcCount / 10) + 10;
      for (let i = 0; i < monthsToPopulate; i++) {
        engine.step();
      }

      onProgress?.(35, `大千世界生机盎然，已有 ${Object.keys(engine.getState().npcs).length} 位修士行走江湖…`);
      await this._yieldFrame();

      // ── 阶段 3：岁月流转，世界演化 ──
      if (preEvolveYears > 0) {
        const totalMonths = preEvolveYears * 12;
        const batchPerFrame = 6; // 每帧推进6个月，平衡性能与视觉
        const totalBatches = Math.ceil(totalMonths / batchPerFrame);
        for (let b = 0; b < totalBatches; b++) {
          for (let j = 0; j < batchPerFrame && b * batchPerFrame + j < totalMonths; j++) {
            engine.step();
          }
          const pct = 35 + Math.floor(((b + 1) / totalBatches) * 50);
          const year = engine.getState().currentYear;
          onProgress?.(pct, `岁月流转…大千世界第 ${year} 年，恩怨纠葛正在上演…`);
          // 每3帧 yield 一次，避免完全阻塞
          if (b % 3 === 0) await this._yieldFrame();
        }
      }

      // ── 阶段 3.5：把玩家接入已经存在的世界 ──
      // 降生模式先提交真实出生与家人关系，再让同一个世界继续演化六年；
      // 穿越/上帝则在当前绝对时刻接入，不伪造此前经历。
      const pendingPlayer = playerStore.character;
      if (pendingPlayer) {
        // Pinia Character 是 Vue Proxy；跨入纯引擎边界前必须转为普通快照。
        const begun = beginPlayerEntry(toPlain(pendingPlayer), engine.getState(), {
          mode: config?.entryMode ?? 'birth',
          background: config?.background ?? 'orphan',
          childhoodChoice: config?.childhoodChoice,
          startAge: config?.startAge,
          worldSeed,
        });
        playerStore.setPlayer(begun.player);
        engine = new WorldEngine(begun.worldState, { npcBrainV2Mode: 'single-write', rng: worldRng });

        if (begun.childhoodMonths > 0) {
          for (let month = 0; month < begun.childhoodMonths; month++) {
            engine.step();
            if (month % 6 === 5) {
              const age = Math.floor((month + 1) / 12);
              onProgress?.(86 + Math.floor(((month + 1) / begun.childhoodMonths) * 4), `童年流转…${age} 岁，家人与世界仍在行动…`);
              await this._yieldFrame();
            }
          }
          const completed = completePlayerChildhood(begun.player, engine.getState());
          playerStore.setPlayer(completed.player);
          engine = new WorldEngine(completed.worldState, { npcBrainV2Mode: 'single-write', rng: worldRng });
        }
      }

      // ── 阶段 4：秘境现世，世界成型 ──
      onProgress?.(90, '秘境现世，天下格局初定…');
      await this._yieldFrame();

      this.currentWorldState = engine.getState();
      this.isInitialized = true;

      // 新世界不能继承上一次会话的地图浏览缓存。角色若尚无权威地址，
      // 则从创建流程选定的起始节点生成一次；之后 UI 只能投影，不能反向回填。
      const mapStore = useMapStore();
      mapStore.reset();
      const player = playerStore.character;
      const spatialState = this.currentWorldState.spatialState;
      if (player && spatialState) {
        if (!player.spatialAddress) {
          const requestedNodeId = playerStore.currentNodeId;
          const nodeId = spatialState.nodes[requestedNodeId]
            ? requestedNodeId
            : 'LOCAL_CONT_EAST_OVERWORLD';
          const startPosition = findLandmarkPos(generateWorldGrid(mapStore.activeContinentId), nodeId)
            ?? { ...mapStore.hexPos };
          player.spatialAddress = {
            nodeId,
            coordinate: startPosition,
            occupancy: 'stationary',
          };
          mapStore.setHexPos(startPosition);
        } else if (player.spatialAddress.coordinate
          && 'q' in player.spatialAddress.coordinate
          && 'r' in player.spatialAddress.coordinate) {
          mapStore.setHexPos(player.spatialAddress.coordinate);
        }
        playerStore.setCurrentNode(player.spatialAddress.nodeId);
      }

      onProgress?.(100, '大千世界，等你探索！');
      await this._yieldFrame();
    },

    /** 让出一帧，允许 UI 更新进度条 */
    async _yieldFrame() {
      return new Promise<void>((resolve) => setTimeout(resolve, 0));
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
          schemaVersion: CURRENT_SAVE_SCHEMA_VERSION,
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
      const payload = MigrationService.loadWithMigration(raw, migrateLegacySpatialSavePayload);

      const playerStore = usePlayerStore();
      const mapStore = useMapStore();
      playerStore.setPlayer(ensurePlayerEntryProfile(payload.player, payload.worldState));
      this.currentWorldState = payload.worldState;
      this.isInitialized = true;

      // 恢复玩家地图进度；老存档无此字段时保留当前默认状态
      if (payload.playerMapState) {
        mapStore.hydrateFromSave(payload.playerMapState);
      }
      // 旧 currentNodeId 仅是兼容投影，读档后必须从已迁移的权威地址重建。
      if (payload.player.spatialAddress) {
        playerStore.setCurrentNode(payload.player.spatialAddress.nodeId);
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

    /** 上帝模式的有界资源干预；结果和来源事实由引擎一次性返回。 */
    grantGodAid(npcId: string, amount = 10) {
      const playerStore = usePlayerStore();
      const player = playerStore.character;
      if (!player || !this.currentWorldState) {
        return { ok: false as const, reason: '世界或观察者尚未就绪' };
      }
      const result = applyGodResourceIntervention(
        toPlain(player),
        toPlain(this.currentWorldState),
        npcId,
        amount,
      );
      if (result.ok) {
        playerStore.setPlayer(result.player);
        this.currentWorldState = result.worldState;
      }
      return result;
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
