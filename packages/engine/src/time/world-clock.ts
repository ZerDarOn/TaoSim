// ============================================================
// WorldClockService — P1 唯一权威时间推进入口
//
// 绝对时间以分钟为单位（elapsedMinutes），年/月/日全部从此投影。
// 旧 currentYear/currentMonth 作为只读兼容投影，不再是写入权威。
// ============================================================

import type { WorldState, BigEventLog } from '@taosim/contracts';
import type { WorldEngine } from '../world/world-engine.js';

/** 每日分钟数（1 日 = 24 时辰 × 60 分 = 1440 分，简化为 1440） */
export const MINUTES_PER_DAY = 1440;

/** 每月天数（30 日/月，与 WorldEngine.advanceCalendar 一致） */
export const DAYS_PER_MONTH = 30;

/** 每月分钟数 */
export const MINUTES_PER_MONTH = MINUTES_PER_DAY * DAYS_PER_MONTH;

/** 每年月数 */
export const MONTHS_PER_YEAR = 12;

/** 每年天数 */
export const DAYS_PER_YEAR = MONTHS_PER_YEAR * DAYS_PER_MONTH;

/** 每年分钟数 */
export const MINUTES_PER_YEAR = MINUTES_PER_MONTH * MONTHS_PER_YEAR;

/** 从 elapsedMinutes 投影出年/月/日 */
export function projectTime(elapsedMinutes: number): {
  year: number;
  month: number;  // 1-12
  day: number;    // 1-30
  hour: number;   // 0-23（时辰细分，当前不使用时辰系统，留扩展口）
} {
  // 世界从 1年1月1日0时开始
  const totalMinutes = Math.max(0, Math.floor(elapsedMinutes));
  const totalDays = Math.floor(totalMinutes / MINUTES_PER_DAY);
  const hour = Math.floor((totalMinutes % MINUTES_PER_DAY) / 60);

  const year = Math.floor(totalDays / DAYS_PER_YEAR) + 1;
  const dayOfYear = totalDays % DAYS_PER_YEAR; // 0-based
  const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1; // 1-12
  const day = (dayOfYear % DAYS_PER_MONTH) + 1; // 1-30

  return { year, month, day, hour };
}

/** 从旧的年/月计算等效的 elapsedMinutes（迁移用） */
export function elapsedFromYearMonth(year: number, month: number, day = 1): number {
  const totalMonths = (year - 1) * MONTHS_PER_YEAR + (month - 1);
  const totalDays = totalMonths * DAYS_PER_MONTH + (day - 1);
  return totalDays * MINUTES_PER_DAY;
}

/**
 * 唯一世界时间推进器。
 *
 * 所有时间推进——玩家行动、移动、战斗、修炼、实时流逝和快进——
 * 必须通过此服务提交。WorldEngine 在跨月边界时执行月度调度。
 */
export class WorldClockService {
  constructor(private engine: WorldEngine) {}

  /** 当前世界状态 */
  getState(): WorldState {
    return this.engine.getState();
  }

  /**
   * 推进一个月的世界状态并返回事件。
   * elapsedMinutes 由 engine.step() → advanceCalendar() 自动维护。
   */
  stepMonth(): { events: BigEventLog[]; npcPopulationChanged: boolean } {
    return this.engine.step();
  }

  /**
   * 推进指定的分钟数。
   *
   * 按月分块推进，跨月边界时调用 engine.step()。
   * elapsedMinutes 累加——多次调用子月余数正确累积。
   */
  advanceMinutes(minutes: number): void {
    if (minutes <= 0) return;

    // 直接读引擎内部 state（不用 getState() 的拷贝）
    const internalState = (this.engine as any).state as WorldState;

    // 初始化 elapsedMinutes（旧存档可能没有）
    if (internalState.elapsedMinutes === undefined) {
      internalState.elapsedMinutes = elapsedFromYearMonth(internalState.currentYear, internalState.currentMonth);
    }

    // 累加分钟数
    const oldElapsed = internalState.elapsedMinutes;
    const newElapsed = oldElapsed + minutes;

    // 计算穿过的月边界数
    const oldMonths = Math.floor(oldElapsed / MINUTES_PER_MONTH);
    const newMonths = Math.floor(newElapsed / MINUTES_PER_MONTH);
    const monthsToStep = newMonths - oldMonths;

    // 逐月推进
    for (let i = 0; i < monthsToStep; i++) {
      this.engine.step();
    }

    // 写回权威时间
    this.engine.setElapsedMinutes(newElapsed);
  }

  /** 推进天数 */
  advanceDays(days: number): void {
    this.advanceMinutes(days * MINUTES_PER_DAY);
  }

  /** 推进月数 */
  advanceMonths(months: number): void {
    this.advanceMinutes(months * MINUTES_PER_MONTH);
  }
}
