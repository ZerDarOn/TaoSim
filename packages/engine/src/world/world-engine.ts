import type { WorldState, BigEventLog } from '@taosim/contracts';

export interface MonthlyTickResult {
  updatedState: WorldState;
  events: BigEventLog[];
  npcPopulationChanged: boolean;
}

/**
 * 世界引擎 — 驱动月度 Tick。
 * 负责：NPC 月度更新、宗门外交骰子、灵石产出、大事件生成。
 */
export class WorldEngine {
  private state: WorldState;

  constructor(initialState: WorldState) {
    this.state = { ...initialState };
  }

  /** 推进一个月，返回更新后的状态与事件列表 */
  public step(): MonthlyTickResult {
    this.advanceCalendar();
    // TODO: NPC 月度 AI + 宗门行动 + 灵石产出
    const events: BigEventLog[] = [];
    return {
      updatedState: this.getState(),
      events,
      npcPopulationChanged: false,
    };
  }

  /** 快速推进 N 个月（闭关），返回摘要 */
  public fastForward(months: number): { events: BigEventLog[]; progress: number } {
    const events: BigEventLog[] = [];
    for (let i = 0; i < months; i++) {
      const result = this.step();
      events.push(...result.events);
    }
    return { events, progress: 1.0 };
  }

  public getState(): WorldState {
    return { ...this.state };
  }

  private advanceCalendar(): void {
    this.state.currentMonth++;
    if (this.state.currentMonth > 12) {
      this.state.currentMonth = 1;
      this.state.currentYear++;
    }
    if (this.state.catastropheCountdownMonths > 0) {
      this.state.catastropheCountdownMonths--;
    }
  }
}
