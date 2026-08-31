// ============================================================
// Save 存档与持久化数据模型 — 架构规范 §29
// ============================================================

import type { Character } from './character.js';
import type { RealmType } from './character.js';
import type { Faction } from './faction.js';
import type { OverworldMap } from './overworld.js';
import type { WorldState } from './world-state.js';
import type { MarketInventory, NPCTradeOffer } from './market.js';
import type { PlayerMapState } from './multi-layer-map.js';
import { createInitialBrainState } from './npc-brain.js';

/** 新存档必须写入的唯一版本号；避免 UI 与迁移链再次分叉。 */
export const CURRENT_SAVE_SCHEMA_VERSION = 7;

export interface SaveHeader {
  saveId: string;
  schemaVersion: number;
  gameVersion: string;
  timestamp: number;
  playTimeMonths: number;
  playerSummary: {
    name: string;
    realm: string;
    portraitId: string;
  };
}

export interface GraveMarker {
  characterId: string;
  name: string;
  deathAge: number;
  deathYear: number;
  causeOfDeath: string;
  realmAtDeath: RealmType;
  relationHooks: { targetId: string; relationType: string }[];
}

export interface SavePayload {
  header: SaveHeader;
  worldState: WorldState;
  player: Character;
  /**
   * v4 已废弃：NPC 展开态可从 worldState.npcs 确定性重建，不再持久化。
   * 旧存档可能含此字段（值为 {}），迁移时忽略。
   */
  activeNPCs?: Record<string, Character>;
  /**
   * v4 已废弃：与 worldState.factions 冗余。
   * 旧存档可能含此字段，迁移时忽略。
   */
  factions?: Record<string, Faction>;
  /**
   * v4 已废弃：大世界拓扑由 PRESET_MAP 静态常量提供，玩家位置由 playerMapState 持有。
   * 旧存档可能含此字段（值为 { continents: [] }），迁移时忽略。
   */
  overworldMap?: OverworldMap;
  /**
   * v4 已废弃：市场库存由 MarketEngine 按月刷新，不跨存档持久化。
   * 旧存档可能含此字段（值为 {}），迁移时忽略。
   */
  marketInventories?: Record<string, MarketInventory>;
  npcTradeOffers?: Record<string, NPCTradeOffer>;
  graveyard: GraveMarker[];
  /** 玩家地图进度（层级/位置/已探索六边形）。Phase-save-fix 新增。 */
  playerMapState?: PlayerMapState;
  /** C2：玩家关注的 NPC ID 列表（持久化，跨存档跟随） */
  watchedNpcIds?: string[];
}

// ---- 存档版本迁移 ----
// 当前 schemaVersion = 7
// v1 → v2：WorldState 新增 npcs 字段（NPC 持久化档案），旧存档补空对象
// v2 → v3：WorldState 新增 eventLog 字段（全量事件流），旧存档补空数组
// v3 → v4：废弃 activeNPCs/overworldMap/factions/marketInventories 四个伪权威占位字段；
//          新存档不再写入，旧存档保留但忽略其内容
// v4 → v5：P1 引入 elapsedMinutes（权威绝对时间）；旧存档从 currentYear/currentMonth 计算
// v5 → v6：C2 引入 watchedNpcIds（关注列表）；旧存档补空数组
// v6 → v7：NB1 引入版本化 NPC Brain；从 NpcRecord + 旧 MindState 确定性初始化
export class SaveMigrationRunner {
  private static migrations: Map<number, (oldData: any) => any> = new Map([
    [
      1,
      (data) => {
        data.worldState.npcs = data.worldState.npcs ?? {};
        return data;
      },
    ],
    [
      2,
      (data) => {
        data.worldState.eventLog = data.worldState.eventLog ?? [];
        return data;
      },
    ],
    [
      3,
      (data) => {
        // v3→v4：废弃字段保留在 payload 上（可选字段），但新存档不再写入。
        // 不做破坏性 delete，旧存档的多余字段被自然忽略。
        // 真实数据都在 worldState（npcs/factions/eventLog）和 player 中。
        return data;
      },
    ],
    [
      4,
      (data) => {
        // v4→v5（P1）：从旧 currentYear/currentMonth 计算 elapsedMinutes
        // 30 天/月 × 1440 分/天 = 43200 分/月
        const MINUTES_PER_MONTH = 43200;
        const year = data.worldState.currentYear ?? 1;
        const month = data.worldState.currentMonth ?? 1;
        const totalMonths = (year - 1) * 12 + (month - 1);
        data.worldState.elapsedMinutes = totalMonths * MINUTES_PER_MONTH;
        return data;
      },
    ],
    [
      5,
      (data) => {
        // v5→v6（C2）：旧存档无 watchedNpcIds，补空数组
        data.watchedNpcIds = data.watchedNpcIds ?? [];
        return data;
      },
    ],
    [
      6,
      (data) => {
        const worldState = data.worldState ?? {};
        const now = {
          year: typeof worldState.currentYear === 'number' ? worldState.currentYear : 1,
          month: typeof worldState.currentMonth === 'number' ? worldState.currentMonth : 1,
        };
        const npcs = worldState.npcs && typeof worldState.npcs === 'object'
          ? worldState.npcs
          : {};
        worldState.npcs = npcs;
        data.worldState = worldState;

        const hydrateRecords = (records: Record<string, unknown>): void => {
          for (const [npcId, value] of Object.entries(records)) {
            if (!value || typeof value !== 'object') continue;
            const npc = value as any;
            if (npc.brain) continue;
            npc.brain = createInitialBrainState({
              npcId,
              personalityId: typeof npc.personalityId === 'string' ? npc.personalityId : 'unknown',
              aspiration: npc.aspiration,
              birthYear: typeof npc.birthYear === 'number' ? npc.birthYear : now.year,
              birthMonth: typeof npc.birthMonth === 'number' ? npc.birthMonth : now.month,
              legacyMind: npc.mind,
              relations: npc.relations,
              biography: npc.biography,
              condition: worldState.conditions?.[npcId],
            }, now);
          }
        };
        hydrateRecords(npcs);
        if (worldState.archivedNpcs && typeof worldState.archivedNpcs === 'object') {
          hydrateRecords(worldState.archivedNpcs);
        }
        return data;
      },
    ],
  ]);

  public static migrate(payload: any): SavePayload {
    // 防御性校验：损坏的 header 拒绝并明确报错（而非隐式 TypeError）
    if (!payload || typeof payload !== 'object') {
      throw new Error('SaveMigrationRunner.migrate: payload 不是对象');
    }
    if (!payload.header || typeof payload.header !== 'object') {
      throw new Error('SaveMigrationRunner.migrate: payload.header 缺失或非对象');
    }
    if (typeof payload.header.schemaVersion !== 'number') {
      throw new Error(`SaveMigrationRunner.migrate: header.schemaVersion 不是数字（实际: ${typeof payload.header.schemaVersion}）`);
    }

    let currentVersion = payload.header.schemaVersion;
    while (this.migrations.has(currentVersion)) {
      payload = this.migrations.get(currentVersion)!(payload);
      currentVersion++;
      payload.header.schemaVersion = currentVersion;
    }
    return payload as SavePayload;
  }

  public static registerMigration(fromVersion: number, fn: (oldData: any) => any): void {
    this.migrations.set(fromVersion, fn);
  }
}
