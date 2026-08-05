import { reactive } from 'vue';
import { WorldEngine } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import type { BigEventLog } from '@taosim/contracts';

export function useWorld() {
  const appStore = useAppStore();
  const state = reactive({
    recentEvents: [] as BigEventLog[],
    advancing: false,
  });

  function advanceMonth() {
    if (!appStore.currentWorldState) return;
    const engine = new WorldEngine(appStore.currentWorldState);
    const result = engine.step();
    appStore.currentWorldState = result.updatedState;
    if (result.events[0]) {
      state.recentEvents = [result.events[0], ...state.recentEvents].slice(0, 50);
    }
  }

  async function fastForward(months: number) {
    if (!appStore.currentWorldState) return;
    state.advancing = true;
    const engine = new WorldEngine(appStore.currentWorldState);

    const batchSize = 12;
    for (let i = 0; i < months; i += batchSize) {
      const batch = Math.min(batchSize, months - i);
      const result = engine.fastForward(batch);
      appStore.currentWorldState = engine.getState();
      state.recentEvents = [...result.events, ...state.recentEvents].slice(0, 50);
      await new Promise(r => setTimeout(r, 50));
    }
    state.advancing = false;
  }

  return { state, advanceMonth, fastForward };
}
