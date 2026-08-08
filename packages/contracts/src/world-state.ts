// ============================================================
// WorldState 全局状态模型 — 架构规范 §28
// ============================================================

import type { NpcRecord } from './npc-record.js';
import type { BigEventLog } from './event-log.js';

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
}
