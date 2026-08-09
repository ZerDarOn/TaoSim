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
}
