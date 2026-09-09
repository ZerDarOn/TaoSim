// ============================================================
// WorldOutcome 原子事务 — S3 跨实体原子提交单元
//
// 跨玩家/NPC/资产/时间/事实的原子事务提交。
// 幂等 + 乐观锁版本校验 + 资产守恒。
// ============================================================

import type { SoulState, RealmFullPath } from './character.js';
import type { SocialEntry } from './social.js';
import type { Injury, PoisonState } from './condition.js';
import type { AssetInstance } from './asset.js';
import type { Fact } from './fact.js';
import type { TimeElapsed } from './world-time.js';
import type { LocationRef } from './location.js';
import type { BrainBelief, BrainMemory } from './npc-brain.js';
import type { SpatialAddress } from './spatial.js';
import type { SpatialDelta, TravelState } from './spatial.js';
import type { WorldEncounterChange } from './world-encounter.js';

/** 实体差量：对单个实体的状态变更 */
export interface EntityDelta {
  /** 目标实体 ID（playerId 或 npcId） */
  entityId: string;

  /** HP 差量（负=受伤；NPC 无持久 hp，伤势以 injuryDelta 表达） */
  hpDelta?: number;
  /** 灵力差量 */
  spiritEnergyDelta?: number;
  /** 行动力差量（玩家月度） */
  apDelta?: number;
  /** 灵石差量（可为负） */
  spiritStonesDelta?: number;
  /** 修为差量 */
  cultivationExpDelta?: number;

  /** 境界变更 */
  realmChanged?: RealmFullPath;

  /** 灵魂状态变更 */
  soulStateChanged?: SoulState;
  /** 被击杀 */
  killed?: boolean;
  /** 击杀者 ID */
  killedBy?: string;

  /** 位置变更 */
  locationChanged?: LocationRef;
  /** Phase 1 新空间地址变更；迁移期 locationChanged 仍可被旧调用方读取。 */
  spatialAddressChanged?: SpatialAddress;
  /** 旅行状态变更；null 表示被规则（如秘境关闭）中断并清除。 */
  travelChanged?: TravelState | null;

  /** 新增伤势 */
  injuriesAdded?: Injury[];
  /** 新增毒素 */
  poisonsAdded?: PoisonState[];
  /** 经脉损伤增量 */
  meridianDamageDelta?: number;

  /** 技能冷却快照（玩家战斗后） */
  skillCooldownsAfter?: Record<string, number>;

  /** 关系变化（追加，不覆盖） */
  socialChanges?: SocialEntry[];
  /** 已发生事实形成的长期记忆；只追加有界记录。 */
  memoriesAdded?: BrainMemory[];
  /** 由同一事实形成或修正的个人信念；按 beliefId 幂等覆盖并保持有界。 */
  beliefsUpserted?: BrainBelief[];

  /** 消耗的资产 ID 列表（从所有者移除） */
  consumedAssetIds?: string[];
  /** 获得的资产实例（添加到所有者） */
  gainedAssets?: AssetInstance[];
}

/** 世界结果：跨实体的原子事务 */
export interface WorldOutcome {
  /** 幂等键（全局唯一） */
  outcomeId: string;
  /** 基准版本号（乐观锁，与 WorldState.worldRevision 比对） */
  baseRevision: number;
  /** 来源标记（战斗/交易/突破/奇遇/社交...） */
  source: string;
  /** 耗时（推进世界时间） */
  timeElapsed?: TimeElapsed;
  /** 地点引用 */
  location?: LocationRef;
  /** 参与者差量 */
  entityDeltas: EntityDelta[];
  /** Phase 3：与实体差量同一原子提交的空间差量。 */
  spatialDelta?: SpatialDelta;
  /** 与事实和实体差量同一提交的相遇状态变更。 */
  encounterChanges?: WorldEncounterChange[];
  /** 产生的事实记录 */
  facts?: Fact[];
  /** 附带的世界标志变更 */
  worldFlagChanges?: Record<string, boolean | number | string>;
}

/** 提交结果 */
export type CommitResult =
  | { status: 'success'; newRevision: number }
  | { status: 'version_conflict'; expected: number; actual: number }
  | { status: 'validation_failed'; reason: string }
  | { status: 'already_applied'; outcomeId: string };
