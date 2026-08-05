// ============================================================
// WorldState 全局状态模型 — 架构规范 §28
// ============================================================

export interface WorldState {
  currentYear: number;
  currentMonth: number;
  catastropheCountdownMonths: number;  // 天道量劫倒计时
  activeContinentIds: string[];
  globalFlags: Record<string, boolean | number | string>;
}
