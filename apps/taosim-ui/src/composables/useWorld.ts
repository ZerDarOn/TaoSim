import { reactive } from 'vue';
import { createGameSnapshot } from '../utils/game-snapshot';
import { TimeAdvanceService, rollCalendarEvent, MINUTES_PER_DAY, MINUTES_PER_MONTH, projectTime } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';
import { useEventLogStore } from '@/stores/event-log';

/**
 * 全局世界状态（单例）。
 */
const globalState = reactive({
  recentEvents: [] as import('@taosim/contracts').BigEventLog[],
  advancing: false,
  deathMessage: null as string | null,
  /** 最近一次时间推进的灵气浓度倍率 */
  lastSpiritDensity: 1.0,
  /** 最近一次激活的节气事件名称 */
  lastCalendarEventName: null as string | null,
  /** 实时演算速度：0=暂停，1/4/16（1x = 1 世界小时/真实秒） */
  realtimeSpeed: 0 as 0 | 1 | 4 | 16,
});

export const REALTIME_TICK_MS = 1_000;

/** 每拍应推进的世界分钟数。1x = 1 世界小时/真实秒。 */
export function realtimeMinutesPerTick(speed: 0 | 1 | 4 | 16): number {
  return speed * (MINUTES_PER_DAY / 24) * (REALTIME_TICK_MS / 1_000);
}

/** 实时演算：不足一分钟的浮点分钟累积。 */
let minuteAccumulator = 0;
/** 实时演算定时器句柄 */
let realtimeTimer: ReturnType<typeof setInterval> | null = null;
/** 实时演算推进委托（指向 useWorld 内的统一分钟入口） */
let advanceRealtimeMinutes: ((minutes: number) => void) | null = null;

/** 实时演算：停表并清零累积 */
function stopRealtime() {
  if (realtimeTimer !== null) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
  globalState.realtimeSpeed = 0;
  minuteAccumulator = 0;
}

/** 实时演算按世界小时累积，所有整数分钟仍通过统一时钟推进。 */
function tickRealtime() {
  if (globalState.advancing || globalState.realtimeSpeed <= 0) return;
  minuteAccumulator += realtimeMinutesPerTick(globalState.realtimeSpeed);
  const wholeMinutes = Math.floor(minuteAccumulator);
  minuteAccumulator -= wholeMinutes;
  if (wholeMinutes <= 0) return;
  // 实时显示不再自己改变日期；真实日期由 WorldState.elapsedMinutes 投影得到。
  // 实时推进跳过铁人自动存档（频率过高），世界事件照常导入。
  advanceRealtimeMinutes?.(wholeMinutes);
}

export function useWorld() {
  const appStore = useAppStore();
  const playerStore = usePlayerStore();
  const gameFlow = useGameFlowStore();
  const eventLog = useEventLogStore();

  // 实时演算委托：每个整数分钟复用统一分钟入口。
  advanceRealtimeMinutes = (minutes) => {
    void advanceMinutes(minutes, { autoSave: false });
  };

  /**
   * 推进时间 — 统一入口（C0：World-only，无 mode 参数）。
   *
   * @param months  月数
   * @param opts    实时推进选项（autoSave=false：跳过铁人自动存档）
   */
  async function advanceMinutes(
    minutes: number,
    opts?: { autoSave?: boolean },
  ): Promise<{
    months: number;
    expGained: number;
    died: boolean;
    causeOfDeath?: string;
    interruption?: { kind: 'encounter'; encounterId: string };
    remainingMinutes?: number;
  }> {
    if (!appStore.currentWorldState || !playerStore.character) {
      return { months: 0, expGained: 0, died: false };
    }

    const safeMinutes = Math.max(0, minutes);
    const months = safeMinutes / MINUTES_PER_MONTH;
    globalState.advancing = true;

    try {
      // 检查当月节气事件
      const startMonth = projectTime(appStore.currentWorldState.elapsedMinutes ?? 0).month;
      const calendarEvent = rollCalendarEvent(startMonth);

      const result = TimeAdvanceService.advanceMinutes(
        createGameSnapshot(playerStore.character),
        createGameSnapshot(appStore.currentWorldState),
        safeMinutes,
        calendarEvent,
      );
      if (result.interruption) stopRealtime();

      // eslint-disable-next-line no-console
      console.log('[useWorld] advanceTime result:', {
        requestedMinutes: safeMinutes,
        advancedMinutes: result.advancedMinutes,
        remainingMinutes: result.remainingMinutes,
        interruption: result.interruption,
        months: result.advancedMinutes / MINUTES_PER_MONTH,
        oldMonth: startMonth,
        newMonth: result.updatedWorldState?.currentMonth,
        newYear: result.updatedWorldState?.currentYear,
        expGained: result.expGained,
        died: result.died,
      });

      // 应用结果
      playerStore.character = result.updatedPlayer;
      if (result.updatedWorldState) {
        appStore.currentWorldState = result.updatedWorldState;
      }

      // 导入世界事件到日志
      if (result.events.length > 0) {
        globalState.recentEvents = [...result.events, ...globalState.recentEvents].slice(0, 50);
        eventLog.importWorldEvents(result.events);
      }

      // 记录灵气浓度和节气事件
      globalState.lastSpiritDensity = result.spiritDensityMult;
      globalState.lastCalendarEventName = result.calendarEvent?.name ?? null;

      // 修炼日志
      if (!result.died && result.advancedMinutes > 0) {
        const actualMonths = result.advancedMinutes / MINUTES_PER_MONTH;
        const elapsedLabel = actualMonths >= 1 && Number.isInteger(actualMonths)
          ? (actualMonths >= 12 ? `${Math.floor(actualMonths / 12)}年` : `${actualMonths}月`)
          : `${result.advancedMinutes}分钟`;
        eventLog.addEvent('cultivation', `闭关${elapsedLabel}`, `修为 +${result.expGained}${calendarEvent ? `（${calendarEvent.name}）` : ''}`, {
          isMajorEvent: actualMonths >= 12,
        });

        // 节气事件日志
        if (calendarEvent) {
          eventLog.addEvent('discovery', calendarEvent.name, calendarEvent.description, {
            isMajorEvent: calendarEvent.effectType === 'heavenly_tribulation',
          });
        }
      }

      // 铁人模式自动存档（失败时给出警告，避免进度静默丢失；实时推进跳过——频率过高）
      if (playerStore.character.gameMode?.saveMode === 'Ironman' && opts?.autoSave !== false) {
        appStore.saveGame().catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[useWorld] 铁人自动存档失败:', err);
          eventLog.addEvent('world', '存档失败', '铁人模式自动存档失败，进度可能丢失，请勿刷新页面', { isMajorEvent: true });
        });
      }

      if (result.died) {
        globalState.deathMessage = result.causeOfDeath ?? '寿元耗尽';
        gameFlow.enterGameOver(globalState.deathMessage ?? undefined);
        eventLog.addEvent('cultivation', '闭关中坐化', result.causeOfDeath ?? '寿元耗尽', { isMajorEvent: true });
        return {
          months: result.advancedMinutes / MINUTES_PER_MONTH,
          expGained: result.expGained,
          died: true,
          causeOfDeath: result.causeOfDeath,
          interruption: result.interruption,
          remainingMinutes: result.remainingMinutes,
        };
      }

      return {
        months: result.advancedMinutes / MINUTES_PER_MONTH,
        expGained: result.expGained,
        died: false,
        interruption: result.interruption,
        remainingMinutes: result.remainingMinutes,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useWorld] advanceTime error:', err);
      return { months: 0, expGained: 0, died: false };
    } finally {
      globalState.advancing = false;
    }
  }

  /** 兼容月度按钮；实现仍统一转换为绝对分钟。 */
  async function advanceTime(
    months: number,
    opts?: { autoSave?: boolean },
  ) {
    return advanceMinutes(months * MINUTES_PER_MONTH, opts);
  }

  /** 推进 1 月（世界模式）：暂停实时演算，从月初开始 */
  function advanceMonth() {
    stopRealtime();
    return advanceTime(1);
  }

  /**
   * 玩家快进：暂停实时计时器后，让玩家与整个世界共同推进。
   *
   * 闭关只表示玩家暂时不接收常规操作，不表示世界停止演化。
   */
  async function fastForward(months: number) {
    stopRealtime();
    return advanceTime(months);
  }

  /**
   * 旅行/移动推进时间——玩家与整个世界共同推进。
   *
   * 替代旧 playerStore.advanceTime(days) 只推进玩家的隔离路径。
   * 天数直接转分钟后调用统一 advanceMinutes，不再向上取整或补足整月。
   */
  async function travelAdvanceDays(days: number): Promise<{ died: boolean; causeOfDeath?: string }> {
    const result = await advanceMinutes(days * MINUTES_PER_DAY);
    return { died: result.died, causeOfDeath: result.causeOfDeath };
  }

  /**
   * 实时演算（世界盒子式）：世界持续演化，无需手动推进。
   * @param speed 0=暂停，1/4/16（1x = 1 世界小时/真实秒）
   */
  function setRealtimeSpeed(speed: 0 | 1 | 4 | 16) {
    stopRealtime();
    if (speed <= 0) return;
    globalState.realtimeSpeed = speed;
    realtimeTimer = setInterval(tickRealtime, REALTIME_TICK_MS);
  }

  return { state: globalState, advanceMonth, advanceTime, advanceMinutes, fastForward, travelAdvanceDays, setRealtimeSpeed, stopRealtime };
}
