import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { WorldEngine, PlayerLifecycleService } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import type { BigEventLog } from '@taosim/contracts';

export function useWorld() {
  const appStore = useAppStore();
  const playerStore = usePlayerStore();
  const router = useRouter();
  const state = reactive({
    recentEvents: [] as BigEventLog[],
    advancing: false,
    deathMessage: null as string | null,
  });

  function advanceMonth() {
    if (!appStore.currentWorldState || !playerStore.character) return;
    const engine = new WorldEngine(appStore.currentWorldState);
    const result = engine.step();
    appStore.currentWorldState = result.updatedState;
    if (result.events[0]) {
      state.recentEvents = [result.events[0], ...state.recentEvents].slice(0, 50);
    }
    applyPlayerTime(1);
  }

  async function fastForward(months: number) {
    if (!appStore.currentWorldState || !playerStore.character) return;
    state.advancing = true;
    const engine = new WorldEngine(appStore.currentWorldState);
    let died = false;

    const batchSize = 12;
    for (let i = 0; i < months && !died; i += batchSize) {
      const batch = Math.min(batchSize, months - i);
      const result = engine.fastForward(batch);
      appStore.currentWorldState = engine.getState();
      state.recentEvents = [...result.events, ...state.recentEvents].slice(0, 50);

      // 联动玩家时间
      const playerResult = PlayerLifecycleService.advanceTime(playerStore.character, batch);
      playerStore.character = playerResult.updatedPlayer;
      if (playerResult.died) {
        died = true;
        state.deathMessage = playerResult.causeOfDeath ?? '寿元耗尽';
        state.advancing = false;
        router.push('/game-over');
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    state.advancing = false;
  }

  function applyPlayerTime(months: number) {
    if (!playerStore.character) return;
    const result = PlayerLifecycleService.advanceTime(playerStore.character, months);
    playerStore.character = result.updatedPlayer;

    // 铁人模式：月度自动存档
    if (playerStore.character.gameMode?.saveMode === 'Ironman') {
      appStore.saveGame().catch(() => {});
    }

    if (result.died) {
      state.deathMessage = result.causeOfDeath ?? '寿元耗尽';
      router.push('/game-over');
    }
  }

  return { state, advanceMonth, fastForward };
}
