/**
 * TimeAdvanceService — 统一时间推进服务
 *
 * 双模式设计：
 * - World 模式：推进时世界引擎同步运转（NPC成长/事件/灵脉），适合"推进1月"
 * - Isolated 模式：仅推进玩家个人时间（闭关/秘境洞穴），世界冻结
 *
 * 核心改进：
 * - 修为增长加入季节灵气浓度倍率
 * - 统一入口，消灭 advanceMonth vs fastForward 的逻辑分叉
 */

import type { Character, WorldState, TimeFlowMode, BigEventLog } from '@taosim/contracts';
import { PlayerLifecycleService } from '../lifecycle/player-lifecycle.js';
import { EconomyEngine } from '../economy/economy-engine.js';
import { getSpiritRootMultiplier } from '../data/spirit-root-table.js';
import { getSpiritDensityMultiplier } from './season-system.js';
import type { CalendarEventDef } from '@taosim/contracts';
import { WorldEngine } from '../world/world-engine.js';
import { WorldClockService } from './world-clock.js';

export interface TimeAdvanceResult {
  updatedPlayer: Character;
  updatedWorldState?: WorldState;
  events: BigEventLog[];
  died: boolean;
  causeOfDeath?: string;
  expGained: number;
  /** 本时段的灵气浓度倍率（用于 UI 显示） */
  spiritDensityMult: number;
  /** 本时段激活的节气事件 */
  calendarEvent?: CalendarEventDef;
}

export class TimeAdvanceService {
  /**
   * 推进时间。
   *
   * @param player        玩家角色
   * @param worldState    世界状态（Isolated 模式可传 null）
   * @param months        推进月数
   * @param mode          时间流速模式
   * @param calendarEvent 当前激活的节气事件（可选）
   */
  static advance(
    player: Character,
    worldState: WorldState | null,
    months: number,
    mode: TimeFlowMode = 'World',
    calendarEvent?: CalendarEventDef,
  ): TimeAdvanceResult {
    const allEvents: BigEventLog[] = [];
    let updatedWorld = worldState;

    // P1：世界模式通过 WorldClockService 推进（维护权威 elapsedMinutes）
    if (mode === 'World' && worldState) {
      const engine = new WorldEngine(worldState);
      const clock = new WorldClockService(engine);
      for (let i = 0; i < months; i++) {
        // stepMonth 通过 engine.step() 推进一月 → advanceCalendar 自增 elapsedMinutes
        const stepResult = clock.stepMonth();
        if (stepResult.events.length > 0) {
          allEvents.push(...stepResult.events);
        }
      }
      updatedWorld = engine.getState();
    } else if (worldState) {
      // 隔离模式：只更新日历数字，不运转世界引擎
      const newMonthTotal = worldState.currentMonth - 1 + months;
      updatedWorld = {
        ...worldState,
        currentYear: worldState.currentYear + Math.floor(newMonthTotal / 12),
        currentMonth: (newMonthTotal % 12) + 1,
      };
      if (updatedWorld.catastropheCountdownMonths > 0) {
        updatedWorld.catastropheCountdownMonths = Math.max(0, updatedWorld.catastropheCountdownMonths - months);
      }
    }

    // 玩家时间推进（加入季节灵气浓度）
    const expBefore = player.cultivation.currentExp;
    const startMonth = worldState?.currentMonth ?? 1;

    // 逐月计算修为（每月灵气浓度不同），只在最后 floor 一次避免精度丢失
    let totalExpGain = 0;
    const rootMult = getSpiritRootMultiplier(
      player.spiritRoot.grade,
      player.spiritRoot.elements.length,
      player.spiritRoot.isVariant,
    );

    for (let i = 0; i < months; i++) {
      const currentMonth = ((startMonth - 1 + i) % 12) + 1;
      const densityMult = getSpiritDensityMultiplier(currentMonth, calendarEvent);
      // 不用 Math.floor，保留小数累计
      totalExpGain += player.attributes.comprehension * 0.5 * rootMult * densityMult;
    }
    totalExpGain = Math.floor(totalExpGain);

    // 用 PlayerLifecycleService 处理老化/寿命/灵力（但不让它算修为，我们自己加）
    // 灵石月度产出：境界俸禄水龙头（传送/坊市等消费对应）
    const playerResult = PlayerLifecycleService.advanceTime(
      player,
      months,
      EconomyEngine.realmMonthlyIncome(player.realm),
    );
    // 覆盖修为：用我们的季节感知版本替换 PlayerLifecycleService 的计算
    playerResult.updatedPlayer.cultivation.currentExp = expBefore + totalExpGain;

    // 计算最终灵气浓度（取平均）
    const avgDensityMult = getSpiritDensityMultiplier(startMonth, calendarEvent);

    return {
      updatedPlayer: playerResult.updatedPlayer,
      updatedWorldState: updatedWorld ?? undefined,
      events: allEvents,
      died: playerResult.died,
      causeOfDeath: playerResult.causeOfDeath,
      expGained: totalExpGain,
      spiritDensityMult: avgDensityMult,
      calendarEvent,
    };
  }
}
