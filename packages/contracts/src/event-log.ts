// ============================================================
// EventLog 大事件日志模型 — 架构规范 §30
// ============================================================

/** 事件分类 */
export type EventCategory =
  | 'combat'       // 战斗
  | 'cultivation'  // 修炼/突破
  | 'travel'       // 旅行/移动/传送
  | 'social'       // NPC 交互/宗门
  | 'economy'      // 交易/灵石
  | 'discovery'    // 奇遇/发现
  | 'world';       // 世界事件（NPC生死/灵脉变故）

export interface BigEventLog {
  id: string;
  year: number;
  month: number;
  isMajorEvent: boolean;
  category: EventCategory;
  title: string;
  description: string;
  involvedCharacterIds: string[];
}
