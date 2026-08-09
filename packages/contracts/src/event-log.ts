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

/** 事件影响等级（世界观尺度） */
export type EventSeverity = 'minor' | 'normal' | 'major' | 'epoch';

/** 事件传播半径（→ 沉浸视角可见性 §6.3） */
export type EventVisibility = 'local' | 'regional' | 'world';

/** 事件来源（AI 只做 narrative 增强，不改事实） */
export type EventSource = 'engine' | 'player' | 'ai';

export interface BigEventLog {
  id: string;
  year: number;
  month: number;
  isMajorEvent: boolean;   // 兼容保留（severity >= major 时置 true）
  category: EventCategory;
  title: string;
  description: string;
  involvedCharacterIds: string[];
  // ── 阶段 2 新增（世界涌现叙事设计 §3.1）──
  /** 影响等级 */
  severity: EventSeverity;
  /** 传播半径 */
  visibility: EventVisibility;
  /** 事件来源 */
  source: EventSource;
  /** 真实地点引用（无则省略） */
  locationId?: string;
  /** 因果链：关联事件 id（串故事线 §2.4） */
  relatedEventIds?: string[];
  /** 来源模板键（编年史聚合/去重/监控用，如 'breakthrough.major'） */
  templateKey?: string;
  /** AI 文学化描述（增强层，不改事实） */
  narrative?: string;
}
