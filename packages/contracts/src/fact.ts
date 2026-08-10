// ============================================================
// 结构化事实 — S1 统一底座
//
// 世界中真实发生的事件记录。
// 日志不得声明未实际发生的事实。
// ============================================================

/** 事实类型 */
export type FactType =
  | 'breakthrough'     // 突破
  | 'tribulation'      // 渡劫
  | 'death'            // 死亡
  | 'birth'            // 出生
  | 'battle'           // 战斗
  | 'transaction'      // 交易
  | 'discovery'        // 发现
  | 'social'           // 社交事件
  | 'faction'          // 宗门事件
  | 'custom';          // 自定义

/** 事实可见性 */
export type FactVisibility = 'public' | 'faction' | 'local' | 'secret';

/** 参与实体引用 */
export interface FactParticipant {
  entityId: string;
  role: string;
}

/** 结构化事实 */
export interface Fact {
  /** 事实 ID（全局唯一，幂等键） */
  factId: string;
  /** 来源 outcome ID（幂等追溯） */
  outcomeId?: string;
  /** 事实类型 */
  type: FactType;
  /** 发生时间 */
  at: { year: number; month: number };
  /** 地点引用 */
  locationId?: string;
  /** 参与实体 */
  participants: FactParticipant[];
  /** 事实标题（一句话概览） */
  title: string;
  /** 事实详情 */
  description: string;
  /** 因果引用（此事实的因） */
  causedBy?: string[];
  /** 可见性 */
  visibility: FactVisibility;
  /** 附加数据 */
  metadata?: Record<string, string | number | boolean>;
}
