import { reactive } from 'vue';
import { TimeAdvanceService, rollCalendarEvent } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';
import { useEventLogStore } from '@/stores/event-log';
import type { TimeFlowMode } from '@taosim/contracts';

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
  /** 实时演算：当前世界日（1-30，月内流逝；实时模式逐日推进，满月结算一次） */
  worldDay: 1,
  /** 实时演算速度：0=暂停，1/4/16（1x = 1 世界日/真实秒） */
  realtimeSpeed: 0 as 0 | 1 | 4 | 16,
});

/** 实时演算：不足一日的浮点日数累积（250ms tick × 倍速） */
let dayAccumulator = 0;
/** 实时演算定时器句柄 */
let realtimeTimer: ReturnType<typeof setInterval> | null = null;
/** 实时演算：满月结算委托（指向 useWorld 内的 advanceTime，避免模块级闭包越界） */
let advanceRealtimeMonth: (() => void) | null = null;

/** 实时演算：停表并清零累积 */
function stopRealtime() {
  if (realtimeTimer !== null) {
    clearInterval(realtimeTimer);
    realtimeTimer = null;
  }
  globalState.realtimeSpeed = 0;
  dayAccumulator = 0;
}

/** 实时演算：250ms 一拍，按倍速累积世界日；满 30 日 → 推进 1 月（世界同步运转） */
function tickRealtime() {
  if (globalState.advancing || globalState.realtimeSpeed <= 0) return;
  dayAccumulator += 0.25 * globalState.realtimeSpeed;
  const whole = Math.floor(dayAccumulator);
  dayAccumulator -= whole;
  if (whole <= 0) return;
  globalState.worldDay += whole;
  while (globalState.worldDay > 30) {
    globalState.worldDay -= 30;
    // 实时推进跳过铁人自动存档（频率过高），世界事件照常导入
    advanceRealtimeMonth?.();
  }
}

export function useWorld() {
  const appStore = useAppStore();
  const playerStore = usePlayerStore();
  const gameFlow = useGameFlowStore();
  const eventLog = useEventLogStore();

  // 实时演算委托：满月结算复用统一入口 advanceTime
  advanceRealtimeMonth = () => {
    void advanceTime(1, 'World', { autoSave: false });
  };

  /**
   * 推进时间 — 统一入口
   *
   * @param months  月数
   * @param mode    World=世界同步运转（正式玩法唯一模式）; Isolated 已禁止正式调用
   * @param opts    实时推进选项（autoSave=false：跳过铁人自动存档）
   */
  async function advanceTime(
    months: number,
    mode: TimeFlowMode = 'World',
    opts?: { autoSave?: boolean },
  ): Promise<{ months: number; expGained: number; died: boolean; causeOfDeath?: string }> {
    if (!appStore.currentWorldState || !playerStore.character) {
      return { months: 0, expGained: 0, died: false };
    }

    // P1：正式玩法禁止调用 Isolated 时间（红线 #8）
    if (mode === 'Isolated') {
      throw new Error('[useWorld] 正式玩法禁止调用 Isolated 时间模式。所有时间推进必须通过 World 模式。');
    }

    globalState.advancing = true;

    try {
      // 检查当月节气事件
      const startMonth = appStore.currentWorldState.currentMonth;
      const calendarEvent = rollCalendarEvent(startMonth);

      const result = TimeAdvanceService.advance(
        playerStore.character,
        appStore.currentWorldState,
        months,
        mode,
        calendarEvent,
      );

      // eslint-disable-next-line no-console
      console.log('[useWorld] advanceTime result:', {
        months, mode,
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
      if (!result.died) {
        eventLog.addEvent('cultivation', `闭关${months >= 12 ? Math.floor(months / 12) + '年' : months + '月'}`, `修为 +${result.expGained}${calendarEvent ? `（${calendarEvent.name}）` : ''}`, {
          isMajorEvent: months >= 12,
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
        return { months, expGained: result.expGained, died: true, causeOfDeath: result.causeOfDeath };
      }

      return { months, expGained: result.expGained, died: false };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[useWorld] advanceTime error:', err);
      return { months: 0, expGained: 0, died: false };
    } finally {
      globalState.advancing = false;
    }
  }

  /** 推进 1 月（世界模式）：暂停实时演算，从月初开始 */
  function advanceMonth() {
    stopRealtime();
    globalState.worldDay = 1;
    return advanceTime(1, 'World');
  }

  /**
   * 玩家快进：暂停实时计时器后，让玩家与整个世界共同推进。
   *
   * 闭关只表示玩家暂时不接收常规操作，不表示世界停止演化；
   * Isolated 仅保留给预览、测试等明确不应改动世界状态的内部场景。
   */
  async function fastForward(months: number) {
    stopRealtime();
    return advanceTime(months, 'World');
  }

  /**
   * P1：旅行/移动推进时间——玩家与整个世界共同推进。
   *
   * 替代旧 playerStore.advanceTime(days) 只推进玩家的隔离路径。
   * 天数转月数后调用统一 advanceTime(World 模式)。
   */
  async function travelAdvanceDays(days: number): Promise<{ died: boolean; causeOfDeath?: string }> {
    // 天数 → 月数（30 天/月）
    const months = days / 30;
    if (months < 1) {
      // 不足 1 月：推进世界到足月边界
      // 用 World 模式推进 1 月（世界与玩家都走）
      const result = await advanceTime(1, 'World');
      return { died: result.died, causeOfDeath: result.causeOfDeath };
    }
    const result = await advanceTime(Math.ceil(months), 'World');
    return { died: result.died, causeOfDeath: result.causeOfDeath };
  }

  /**
   * 实时演算（世界盒子式）：世界持续演化，无需手动推进。
   * @param speed 0=暂停，1/4/16（1x = 1 世界日/真实秒）
   */
  function setRealtimeSpeed(speed: 0 | 1 | 4 | 16) {
    stopRealtime();
    if (speed <= 0) return;
    globalState.realtimeSpeed = speed;
    realtimeTimer = setInterval(tickRealtime, 250);
  }

  return { state: globalState, advanceMonth, advanceTime, fastForward, travelAdvanceDays, setRealtimeSpeed, stopRealtime };
}
