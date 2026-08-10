// ============================================================
// 唯一持久化时间与推进入口 — S1 统一底座
//
// 旧年月字段（WorldState.currentYear/Month）只做兼容投影。
// ============================================================

/** 世界时间：以分钟为单位的绝对时间戳 */
export interface WorldTime {
  /** 自世界开始以来的总分钟数 */
  elapsedMinutes: number;
  /** 当前年份（从 elapsedMinutes 投影，1-based） */
  readonly currentYear: number;
  /** 当前月份（1-12，从 elapsedMinutes 投影） */
  readonly currentMonth: number;
}

/** 时间增量：WorldOutcome 提交的权威耗时 */
export interface TimeElapsed {
  /** 本次行为消耗的分钟数 */
  minutes: number;
}
