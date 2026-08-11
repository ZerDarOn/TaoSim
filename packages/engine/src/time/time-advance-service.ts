/**
 * TimeAdvanceService — 统一时间推进服务（C0：World-only）
 *
 * 正式玩法唯一模式：World 模式，推进时世界引擎同步运转（NPC成长/事件/灵脉）。
 * Isolated 已从公开 API 移除；内部预览/测试如需冻结世界，使用独立 PreviewEngine。
 *
 * 核心改进：
 * - 修为增长加入季节灵气浓度倍率
 * - 统一入口，通过 WorldClockService 维护权威 elapsedMinutes
 */

import type { Character, WorldState, BigEventLog } from '@taosim/contracts';
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
   * 推进时间（C0：World-only，正式 API 不接受 mode 参数）。
   *
   * @param player        玩家角色
   * @param worldState    世界状态（必传，World 模式）
   * @param months        推进月数
   * @param calendarEvent 当前激活的节气事件（可选）
   */
  static advance(
    player: Character,
    worldState: WorldState,
    months: number,
    calendarEvent?: CalendarEventDef,
  ): TimeAdvanceResult {
    const allEvents: BigEventLog[] = [];

    // P1：通过 WorldClockService 推进（维护权威 elapsedMinutes）
    const engine = new WorldEngine(worldState);
    const clock = new WorldClockService(engine);
    for (let i = 0; i < months; i++) {
      const stepResult = clock.stepMonth();
      if (stepResult.events.length > 0) {
        allEvents.push(...stepResult.events);
      }
    }
    const updatedWorld = engine.getState();

    // 玩家时间推进（加入季节灵气浓度）
    const startMonth = worldState.currentMonth;

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
      totalExpGain += player.attributes.comprehension * 0.5 * rootMult * densityMult;
    }
    totalExpGain = Math.floor(totalExpGain);

    // 用 PlayerLifecycleService 处理老化/寿命/灵力
    const playerResult = PlayerLifecycleService.advanceTime(
      player,
      months,
      EconomyEngine.realmMonthlyIncome(player.realm),
    );
    playerResult.updatedPlayer.cultivation.currentExp = player.cultivation.currentExp + totalExpGain;

    // 计算最终灵气浓度（取平均）
    const avgDensityMult = getSpiritDensityMultiplier(startMonth, calendarEvent);

    return {
      updatedPlayer: playerResult.updatedPlayer,
      updatedWorldState: updatedWorld,
      events: allEvents,
      died: playerResult.died,
      causeOfDeath: playerResult.causeOfDeath,
      expGained: totalExpGain,
      spiritDensityMult: avgDensityMult,
      calendarEvent,
    };
  }
}
