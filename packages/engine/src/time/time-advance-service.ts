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
import { MINUTES_PER_MONTH, WorldClockService, projectTime } from './world-clock.js';
import { advanceSpatialTravel, evaluateSpatialTravelPosition } from '../overworld/spatial-travel.js';
import { createRoadEncounterOutcome, findEarliestRoadEncounter } from '../overworld/road-encounter.js';
import { commitOutcome } from '../world/outcome-committer.js';

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
  /** 调用实际推进的分钟数；遇到需要玩家决策的相遇时小于请求值。 */
  advancedMinutes: number;
  /** 尚未执行的请求时间；不会在相遇弹窗背后偷偷结算。 */
  remainingMinutes: number;
  interruption?: { kind: 'encounter'; encounterId: string };
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
    return this.advanceMinutes(player, worldState, months * MINUTES_PER_MONTH, calendarEvent);
  }

  /**
   * 以分钟推进玩家与世界。移动、实时演算和快进都必须走此入口，
   * 因而小于一个月的旅行不会被错误抬高为整月。
   */
  static advanceMinutes(
    player: Character,
    worldState: WorldState,
    minutes: number,
    calendarEvent?: CalendarEventDef,
  ): TimeAdvanceResult {
    const safeMinutes = Math.max(0, minutes);
    const blockingEncounter = Object.values(worldState.activeEncounters ?? {}).find((encounter) =>
      encounter.playerId === player.id
      && (encounter.status === 'awaiting_decision' || encounter.status === 'active'));
    if (blockingEncounter) {
      const currentMonth = projectTime(worldState.elapsedMinutes ?? 0).month;
      return {
        updatedPlayer: player,
        updatedWorldState: worldState,
        events: [],
        died: false,
        expGained: 0,
        spiritDensityMult: getSpiritDensityMultiplier(currentMonth, calendarEvent),
        calendarEvent,
        advancedMinutes: 0,
        remainingMinutes: safeMinutes,
        interruption: { kind: 'encounter', encounterId: blockingEncounter.encounterId },
      };
    }
    const elapsedBefore = worldState.elapsedMinutes
      ?? ((worldState.currentYear - 1) * 12 + (worldState.currentMonth - 1)) * MINUTES_PER_MONTH;
    const encounterCandidate = findEarliestRoadEncounter(worldState, player, elapsedBefore + safeMinutes);
    const advancedMinutes = encounterCandidate
      ? Math.max(0, Math.min(safeMinutes, encounterCandidate.occursAtMinutes - elapsedBefore))
      : safeMinutes;
    const elapsedAfter = elapsedBefore + advancedMinutes;
    const months = advancedMinutes / MINUTES_PER_MONTH;
    const completedMonthBoundaries = Math.floor(elapsedAfter / MINUTES_PER_MONTH)
      - Math.floor(elapsedBefore / MINUTES_PER_MONTH);

    // P1/P2：通过 WorldClockService 推进（维护权威 elapsedMinutes + 唤醒队列）
    const engine = new WorldEngine(worldState, { npcBrainV2Mode: 'single-write' });
    const clock = new WorldClockService(engine);
    const allEvents = clock.advanceMinutes(advancedMinutes);
    const updatedWorld = engine.getState();

    // 玩家时间推进（加入季节灵气浓度）
    const startMonth = projectTime(elapsedBefore).month;

    // 逐月计算修为（每月灵气浓度不同），只在最后 floor 一次避免精度丢失
    let totalExpGain = 0;
    const rootMult = getSpiritRootMultiplier(
      player.spiritRoot.grade,
      player.spiritRoot.elements.length,
      player.spiritRoot.isVariant,
    );

    let weightedDensityMinutes = 0;
    let cursor = elapsedBefore;
    while (cursor < elapsedAfter) {
      const nextMonthBoundary = (Math.floor(cursor / MINUTES_PER_MONTH) + 1) * MINUTES_PER_MONTH;
      const segmentEnd = Math.min(elapsedAfter, nextMonthBoundary);
      const segmentMinutes = segmentEnd - cursor;
      const currentMonth = projectTime(cursor).month;
      const densityMult = getSpiritDensityMultiplier(currentMonth, calendarEvent);
      totalExpGain += player.attributes.comprehension * 0.5 * rootMult * densityMult
        * (segmentMinutes / MINUTES_PER_MONTH);
      weightedDensityMinutes += densityMult * segmentMinutes;
      cursor = segmentEnd;
    }

    // 用 PlayerLifecycleService 处理老化/寿命/灵力
    const playerResult = PlayerLifecycleService.advanceElapsedTime(
      player,
      months,
      completedMonthBoundaries,
      EconomyEngine.realmMonthlyIncome(player.realm),
    );
    playerResult.updatedPlayer.cultivation.currentExp = player.cultivation.currentExp + totalExpGain;

    // 玩家连续旅行同样只在统一时钟之后更新；途中不把渲染坐标冒充为抵达事实。
    let updatedPlayer = playerResult.updatedPlayer;
    if (updatedPlayer.travel) {
      const travel = advanceSpatialTravel(updatedPlayer.travel, elapsedAfter);
      if (travel.status === 'arrived') {
        updatedPlayer.spatialAddress = { ...travel.destination, occupancy: 'stationary' };
        updatedPlayer.travel = undefined;
        const factId = `FACT_TRAVEL_ARRIVAL_${travel.travelId}`;
        updatedWorld.facts ??= [];
        if (!updatedWorld.facts.some((fact) => fact.factId === factId)) {
          const arrivedAtMinutes = travel.estimatedArrivalAtMinutes;
          const at = projectTime(arrivedAtMinutes);
          updatedWorld.facts.push({
            factId,
            type: 'custom',
            at: { year: at.year, month: at.month },
            locationId: travel.destination.nodeId,
            participants: [{ entityId: player.id, role: 'traveler' }],
            title: `${player.name}抵达目的地`,
            description: `行程 ${travel.travelId} 于预计时刻完成；抵达只结算一次。`,
            visibility: 'local',
            metadata: {
              travelId: travel.travelId,
              startedAtMinutes: travel.startedAtMinutes,
              arrivedAtMinutes,
            },
          });
          const arrivalEvent: BigEventLog = {
            id: `EVT_TRAVEL_ARRIVAL_${travel.travelId}`,
            year: at.year,
            month: at.month,
            isMajorEvent: false,
            category: 'travel',
            title: `${player.name}抵达目的地`,
            description: `从${travel.origin.nodeId}抵达${travel.destination.nodeId}。`,
            involvedCharacterIds: [player.id],
            severity: 'minor',
            visibility: 'local',
            source: 'engine',
            locationId: travel.destination.nodeId,
            templateKey: 'player.travel.arrival',
          };
          updatedWorld.eventLog.push(arrivalEvent);
          allEvents.push(arrivalEvent);
        }
      } else {
        updatedPlayer.spatialAddress = evaluateSpatialTravelPosition(travel).address;
        updatedPlayer.travel = travel;
      }
    }

    let interruption: TimeAdvanceResult['interruption'];
    if (encounterCandidate && updatedPlayer.travel) {
      const started = createRoadEncounterOutcome(updatedWorld, updatedPlayer, encounterCandidate);
      if (started) {
        const committed = commitOutcome(updatedWorld, started.outcome);
        if (committed.status === 'success' || committed.status === 'already_applied') {
          updatedPlayer = started.pausedPlayer;
          updatedPlayer.spatialAddress = evaluateSpatialTravelPosition(started.pausedPlayer.travel!).address;
          interruption = { kind: 'encounter', encounterId: started.encounter.encounterId };
          const npc = updatedWorld.npcs[started.encounter.initiatorNpcId];
          const at = projectTime(started.encounter.occursAtMinutes);
          const encounterEvent: BigEventLog = {
            id: `EVT_START_${started.encounter.encounterId}`,
            year: at.year,
            month: at.month,
            isMajorEvent: started.encounter.intent === 'ambush',
            category: started.encounter.intent === 'greet' ? 'social' : 'combat',
            title: `途中遇见${npc?.name ?? '一名修士'}`,
            description: started.outcome.facts?.[0]?.description ?? '道路上的行程被真实相遇中断。',
            involvedCharacterIds: started.encounter.participantIds,
            severity: started.encounter.intent === 'ambush' ? 'normal' : 'minor',
            visibility: 'local',
            source: 'engine',
            locationId: started.encounter.location.nodeId,
            templateKey: `travel.encounter.${started.encounter.intent}`,
          };
          updatedWorld.eventLog.push(encounterEvent);
          allEvents.push(encounterEvent);
        }
      }
    }

    // 计算最终灵气浓度（取平均）
    const avgDensityMult = advancedMinutes > 0
      ? weightedDensityMinutes / advancedMinutes
      : getSpiritDensityMultiplier(startMonth, calendarEvent);

    return {
      updatedPlayer,
      updatedWorldState: updatedWorld,
      events: allEvents,
      died: playerResult.died,
      causeOfDeath: playerResult.causeOfDeath,
      expGained: totalExpGain,
      spiritDensityMult: avgDensityMult,
      calendarEvent,
      advancedMinutes,
      remainingMinutes: Math.max(0, safeMinutes - advancedMinutes),
      interruption,
    };
  }
}
