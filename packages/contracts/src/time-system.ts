// ============================================================
// 时间系统模型 — 季节 / 时间流速 / 节气事件
// ============================================================

/** 四季 */
export type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

/** 时间流速模式（双模式设计，为未来秘境/洞穴预留） */
export type TimeFlowMode =
  | 'World'    // 世界同步：推进时世界引擎也运转（NPC成长/事件发生）
  | 'Isolated'; // 隔离模式：仅推进玩家个人（闭关/秘境洞穴等）

/** 节气事件触发条件 */
export interface CalendarEventTrigger {
  /** 触发月份（1-12），0 表示任意月 */
  month: number;
  /** 触发概率 0-1 */
  probability: number;
  /** 最低境界要求（可选） */
  minRealm?: string;
}

/** 节气事件定义 */
export interface CalendarEventDef {
  id: string;
  name: string;
  description: string;
  trigger: CalendarEventTrigger;
  /** 事件效果类型 */
  effectType: 'spirit_surge' | 'demon_tide' | 'heavenly_tribulation' | 'festival' | 'opportunity';
  /** 效果参数 */
  effect: {
    /** 灵气浓度倍率（叠加到当月季节倍率上） */
    spiritDensityMult?: number;
    /** 妖兽出现率倍率 */
    demonSpawnMult?: number;
    /** 突破成功率修正 */
    breakthroughBonus?: number;
  };
}

export const SEASON_NAMES: Record<Season, string> = {
  Spring: '春',
  Summer: '夏',
  Autumn: '秋',
  Winter: '冬',
};

export const SEASON_COLORS: Record<Season, string> = {
  Spring: '#84cc16',
  Summer: '#ef4444',
  Autumn: '#f59e0b',
  Winter: '#3b82f6',
};

export const SEASON_ICONS: Record<Season, string> = {
  Spring: '春',
  Summer: '夏',
  Autumn: '秋',
  Winter: '冬',
};
