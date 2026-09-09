import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { CharacterFactory, createLegacySpatialState, MINUTES_PER_MONTH } from '@taosim/engine';
import { useAppStore } from '../../stores/app';
import { usePlayerStore } from '../../stores/player';
import { realtimeMinutesPerTick, useWorld } from '../useWorld';

describe('useWorld reactive boundary', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    useWorld().stopRealtime();
    vi.restoreAllMocks();
  });
  it('advances Pinia state and publishes a new snapshot without mutating the input', async () => {
    const app = useAppStore();
    const player = usePlayerStore();
    player.setPlayer(CharacterFactory.create({
      name: '边界测试', gender: 'Other', background: 'orphan', innateTraits: [],
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    }));
    app.currentWorldState = {
      currentYear: 1, currentMonth: 1, elapsedMinutes: 0, catastropheCountdownMonths: 600,
      activeContinentIds: ['CONT_EAST'], globalFlags: {}, npcs: {}, eventLog: [],
      spatialState: createLegacySpatialState(),
    };
    const original = app.currentWorldState;
    const before = JSON.stringify(original);
    const result = await useWorld().advanceMonth();
    expect(result.months).toBe(1);
    expect(app.currentWorldState.elapsedMinutes).toBe(MINUTES_PER_MONTH);
    expect(player.character!.cultivation.currentExp).toBeGreaterThan(0);
    expect(JSON.stringify(original)).toBe(before);
    expect(console.error).not.toHaveBeenCalled();
  });

  it('uses hour-scale realtime pacing instead of advancing one day per second at 1x', () => {
    expect(realtimeMinutesPerTick(1)).toBe(60);
    expect(realtimeMinutesPerTick(4)).toBe(240);
    expect(realtimeMinutesPerTick(16)).toBe(960);
  });
});
