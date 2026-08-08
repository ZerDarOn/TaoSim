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
  activeNPCs: Record<string, Character>;
  factions: Record<string, Faction>;
  overworldMap: OverworldMap;
  marketInventories: Record<string, MarketInventory>;
  npcTradeOffers: Record<string, NPCTradeOffer>;
  graveyard: GraveMarker[];
  /** 玩家地图进度（层级/位置/已探索六边形）。Phase-save-fix 新增。 */
  playerMapState?: PlayerMapState;
}

// ---- 存档版本迁移 ----
// 当前 schemaVersion = 3
// v1 → v2：WorldState 新增 npcs 字段（NPC 持久化档案），旧存档补空对象
// v2 → v3：WorldState 新增 eventLog 字段（全量事件流），旧存档补空数组
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
  ]);

  public static migrate(payload: any): SavePayload {
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
