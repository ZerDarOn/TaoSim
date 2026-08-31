import { describe, expect, it } from 'vitest';
import type { WorldState } from '@taosim/contracts';
import { WorldEngine } from '../world/world-engine.js';
import { createSeededRng } from '../battle/seeded-rng.js';

const BASE_WORLD: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
  eventLog: [],
};

describe('WorldEngine 800 具名 NPC 性能基线', () => {
  it('记录单月与一年推进耗时，并守住宽松回归上限', () => {
    const engine = new WorldEngine(BASE_WORLD, { rng: createSeededRng(20260831) });
    engine.fastForward(80);
    expect(Object.keys(engine.getState().npcs).length).toBeGreaterThanOrEqual(790);

    const monthStartedAt = performance.now();
    engine.step();
    const monthDurationMs = performance.now() - monthStartedAt;

    const yearStartedAt = performance.now();
    engine.fastForward(12);
    const yearDurationMs = performance.now() - yearStartedAt;

    console.info(
      `[G0_PERF] namedNpcs=${Object.keys(engine.getState().npcs).length} ` +
      `monthMs=${monthDurationMs.toFixed(1)} yearMs=${yearDurationMs.toFixed(1)}`,
    );

    expect(monthDurationMs).toBeLessThan(1_000);
    expect(yearDurationMs).toBeLessThan(10_000);
  }, 15_000);
});
