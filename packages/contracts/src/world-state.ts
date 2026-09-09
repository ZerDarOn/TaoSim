// ============================================================
// WorldState 全局状态模型 — 架构规范 §28
// ============================================================

import type { NpcRecord } from './npc-record.js';
import type { BigEventLog } from './event-log.js';
import type { Faction } from './faction.js';

/** 世界局势阶段（世界轨道 §2.2：和平→乱世→大争→量劫） */
export type WorldEra = 'peace' | 'turbulent' | 'warring' | 'cataclysm';

/** 遗府（§4.7：坐化/陨落后留下的新奇遇源，引用真实实体） */
export interface HeritageSite {
  npcId: string;
  npcName: string;
  venueId?: string;
  venueName: string;
  year: number;
  month: number;
}

export interface WorldState {
  currentYear: number;
  currentMonth: number;
  catastropheCountdownMonths: number;  // 天道量劫倒计时
  activeContinentIds: string[];
  globalFlags: Record<string, boolean | number | string>;
  /** NPC 持久化档案（跨推进/跨会话）— 世界涌现叙事设计 §3.3 */
  npcs: Record<string, NpcRecord>;
  /** 全量事件流（编年史/传闻的数据基础）— 世界涌现叙事设计 §5 */
  eventLog: BigEventLog[];
  /** 宗门档案（月度维护数据源；可选以兼容旧存档） */
  factions?: Record<string, Faction>;
  /** 世界局势阶段（§2.2 世界轨道；可选以兼容旧存档，默认 peace） */
  worldEra?: WorldEra;
  /** 乱世指数 0-100（世界事件/伤亡累积，驱动局势跃迁；可选） */
  worldTurmoil?: number;
  /** 遗府名录（§4.7 新奇遇源；可选） */
  heritageSites?: Record<string, HeritageSite>;
  /**
   * 区域灵气浓度（nodeId → 0-100；生态与地形因果：灵气浓郁之地修炼更快，
   * 随季节潮汐/世界事件/灵脉变迁波动；可选以兼容旧存档，默认按节点 tier 折算）
   */
  nodeSpiritQi?: Record<string, number>;
  /**
   * 氛围层人口（NPC 地图呈现设计 §spec 3.1；key: "q,r"；可选以兼容旧存档）
   */
  populationGrid?: import('./population.js').PopulationGrid;

  // ── S1：共享领域契约字段（全部可选以兼容旧存档）──
  /** S1：实体社交状态（key = entityId） */
  socialStates?: Record<string, import('./social.js').SocialState>;
  /** S1：NPC 长期状态（key = npcId） */
  conditions?: Record<string, import('./condition.js').PersistentCondition>;
  /** S1：重要资产实例（key = assetId） */
  assets?: Record<string, import('./asset.js').AssetInstance>;
  /** S1：历史档案 NPC（死亡/Oblivion 迁入，key = npcId） */
  archivedNpcs?: Record<string, import('./npc-record.js').NpcRecord>;
  /** S1：结构化事实账本 */
  facts?: import('./fact.js').Fact[];
  /** S1：世界修订号（乐观锁，WorldOutcome 版本校验用） */
  worldRevision?: number;
  /** S3：已应用 outcome 的幂等记录 */
  appliedOutcomeIds?: string[];
  /** NB3：计划资源预留账本；Brain 只保存 reservationId 引用。 */
  resourceReservations?: Record<string, import('./npc-planning.js').WorldResourceReservation>;
  /** NB3.2：唯一资产挂牌账本；资产本体只保存所有权，不承载市场生命周期。 */
  assetListings?: Record<string, import('./npc-planning.js').WorldAssetListing>;
  /**
   * P1：权威绝对时间（自世界开始以来的总分钟数）。
   * 年/月/日全部从此字段投影；旧 currentYear/currentMonth 在迁移期作为只读兼容投影。
   * 可选以兼容旧存档（v4 及以下），迁移时从 currentYear/currentMonth 计算。
   */
  elapsedMinutes?: number;
  /** 动态空间世界 Phase 1：基础地图叠加当前差量后的权威空间快照。 */
  spatialState?: import('./spatial.js').SpatialState;
  /** 动态空间世界 Phase 2：事件驱动的下一次唤醒队列。 */
  scheduledWakes?: import('./simulation-scheduler.js').ScheduledWake[];
  /** 进行中的世界相遇；玩家选择前必须随存档保留。 */
  activeEncounters?: Record<string, import('./world-encounter.js').ActiveWorldEncounter>;
}
