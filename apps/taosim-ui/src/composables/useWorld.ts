import { reactive } from 'vue';
import { TimeAdvanceService, rollCalendarEvent, rollWorldEvent } from '@taosim/engine';
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
});

export function useWorld() {
  const appStore = useAppStore();
  const playerStore = usePlayerStore();
  const gameFlow = useGameFlowStore();
  const eventLog = useEventLogStore();

  /**
   * 推进时间 — 统一入口
   *
   * @param months  月数
   * @param mode    World=世界同步运转, Isolated=仅玩家
   */
  async function advanceTime(
    months: number,
    mode: TimeFlowMode = 'World',
  ): Promise<{ months: number; expGained: number; died: boolean; causeOfDeath?: string }> {
    if (!appStore.currentWorldState || !playerStore.character) {
      return { months: 0, expGained: 0, died: false };
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

        // 世界大事日志（§4.10：异宝出世 / 妖潮 / 宗门大比 / 天灾等，独立于节气）
        const worldEvent = rollWorldEvent();
        if (worldEvent) {
          eventLog.addEvent(worldEvent.category, worldEvent.name, worldEvent.description, {
            isMajorEvent: true,
            severity: worldEvent.severity,
            visibility: worldEvent.visibility,
          });
        }
      }

      // 铁人模式自动存档（失败时给出警告，避免进度静默丢失）
      if (playerStore.character.gameMode?.saveMode === 'Ironman') {
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

  /** 推进 1 月（世界模式） */
  function advanceMonth() {
    return advanceTime(1, 'World');
  }

  /** 闭关（隔离模式） */
  async function fastForward(months: number) {
    return advanceTime(months, 'Isolated');
  }

  return { state: globalState, advanceMonth, advanceTime, fastForward };
}
