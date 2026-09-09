import { describe, expect, it } from 'vitest';
import type { NpcRecord, WorldState } from '@taosim/contracts';
import { WorldEngine } from '../world/world-engine.js';
import { createSeededRng } from '../battle/seeded-rng.js';
import { createLegacySpatialState } from '../overworld/spatial-catalog.js';

const BASE_WORLD: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
  eventLog: [],
};

const PERFORMANCE_NODES = [
  'NODE_SECT_QINGYUN',
  'NODE_CITY_TIANJI',
  'NODE_MARKET',
  'NODE_DUNGEON_HEIFENG',
  'NODE_WILD_EAST',
] as const;

function makePerformanceNpc(index: number): NpcRecord {
  const nodeId = PERFORMANCE_NODES[index % PERFORMANCE_NODES.length]!;
  return {
    id: `NPC_PERF_${index}`,
    name: `性能样本${index}`,
    gender: 'Other',
    personalityId: 'cautious',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 20, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    locationId: nodeId,
    spatialAddress: { nodeId, occupancy: 'stationary' },
  };
}

function makePerformanceWorld(count: number): WorldState {
  const npcs: Record<string, NpcRecord> = {};
  for (let index = 0; index < count; index++) {
    const record = makePerformanceNpc(index);
    npcs[record.id] = record;
  }
  return {
    ...structuredClone(BASE_WORLD),
    activeContinentIds: ['CONT_EAST'],
    npcs,
    spatialState: createLegacySpatialState(),
    elapsedMinutes: 0,
  };
}

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
    const serializedStateBytes = new TextEncoder().encode(JSON.stringify(engine.getState())).byteLength;

    console.info(
      `[G0_PERF] namedNpcs=${Object.keys(engine.getState().npcs).length} ` +
      `monthMs=${monthDurationMs.toFixed(1)} yearMs=${yearDurationMs.toFixed(1)} ` +
      `stateMiB=${(serializedStateBytes / 1024 / 1024).toFixed(2)}`,
    );

    expect(monthDurationMs).toBeLessThan(1_000);
    expect(yearDurationMs).toBeLessThan(10_000);
    expect(serializedStateBytes).toBeLessThan(15 * 1024 * 1024);
  }, 15_000);

  it('NB2 shadow 在 800 NPC 下保持有界诊断与月度性能预算', () => {
    const seedEngine = new WorldEngine(BASE_WORLD, { rng: createSeededRng(20260831) });
    seedEngine.fastForward(80);
    const shadowEngine = new WorldEngine(seedEngine.getState(), {
      rng: createSeededRng(20260831),
      npcBrainV2Shadow: true,
    });

    const startedAt = performance.now();
    shadowEngine.step();
    const durationMs = performance.now() - startedAt;
    const report = shadowEngine.getBrainShadowReport()!;

    console.info(
      `[NB2_SHADOW_PERF] evaluated=${report.evaluatedNpcCount} `
      + `monthMs=${durationMs.toFixed(1)} differences=${report.differedCount} `
      + `samples=${report.differenceSamples.length}`,
    );

    expect(report.evaluatedNpcCount).toBeGreaterThanOrEqual(790);
    expect(report.differenceSamples.length).toBeLessThanOrEqual(20);
    expect(durationMs).toBeLessThan(1_000);
  }, 15_000);

  it('NB2 single-write 在 800 NPC 下保持原子提交与月度性能预算', () => {
    const seedEngine = new WorldEngine(BASE_WORLD, { rng: createSeededRng(20260831) });
    seedEngine.fastForward(80);
    const singleWriteEngine = new WorldEngine(seedEngine.getState(), {
      rng: createSeededRng(20260831),
      npcBrainV2Mode: 'single-write',
    });

    const startedAt = performance.now();
    singleWriteEngine.step();
    const durationMs = performance.now() - startedAt;
    const report = singleWriteEngine.getBrainShadowReport()!;
    const yearStartedAt = performance.now();
    singleWriteEngine.fastForward(11);
    const remainingYearMs = performance.now() - yearStartedAt;
    const finalState = singleWriteEngine.getState();
    const reservationCount = Object.keys(finalState.resourceReservations ?? {}).length;
    const serializedStateBytes = new TextEncoder().encode(JSON.stringify(finalState)).byteLength;

    console.info(
      `[NB2_SINGLE_WRITE_PERF] evaluated=${report.evaluatedNpcCount} `
      + `committed=${report.committedCount} fallback=${report.legacyFallbackCount} `
      + `monthMs=${durationMs.toFixed(1)} remainingYearMs=${remainingYearMs.toFixed(1)} `
      + `reservations=${reservationCount} stateMiB=${(serializedStateBytes / 1024 / 1024).toFixed(2)} `
      + `errors=${report.commitErrorCount}`,
    );

    expect(report.evaluatedNpcCount).toBeGreaterThanOrEqual(790);
    expect(report.committedCount + report.legacyFallbackCount).toBe(report.evaluatedNpcCount);
    expect(report.commitErrorCount).toBe(0);
    expect(durationMs).toBeLessThan(1_000);
    expect(remainingYearMs).toBeLessThan(10_000);
    expect(reservationCount).toBeLessThan(10_000);
    expect(serializedStateBytes).toBeLessThan(20 * 1024 * 1024);
  }, 15_000);
});

describe('Phase 7 800/1500 具名 NPC 高倍快进基线', () => {
  it.each([800, 1500])('记录 %i NPC 的 1 年、10 年快进与存档体积', (count) => {
    const engine = new WorldEngine(makePerformanceWorld(count), {
      rng: createSeededRng(20260904 + count),
      npcBrainV2Mode: 'single-write',
    });
    const yearStartedAt = performance.now();
    engine.fastForward(12);
    const yearMs = performance.now() - yearStartedAt;
    const tenYearStartedAt = performance.now();
    engine.fastForward(108);
    const tenYearRemainderMs = performance.now() - tenYearStartedAt;
    const state = engine.getState();
    const stateBytes = new TextEncoder().encode(JSON.stringify(state)).byteLength;

    console.info(
      `[PHASE7_PERF] namedNpcs=${Object.keys(state.npcs).length} `
      + `yearMs=${yearMs.toFixed(1)} tenYearRemainderMs=${tenYearRemainderMs.toFixed(1)} `
      + `tenYearTotalMs=${(yearMs + tenYearRemainderMs).toFixed(1)} `
      + `scheduledWakes=${state.scheduledWakes?.length ?? 0} `
      + `spatialNodes=${Object.keys(state.spatialState?.nodes ?? {}).length} `
      + `stateMiB=${(stateBytes / 1024 / 1024).toFixed(2)}`,
    );

    expect(Object.keys(state.npcs).length).toBeGreaterThanOrEqual(count);
    expect(state.elapsedMinutes).toBe(120 * 30 * 24 * 60);
    expect(state.spatialState).toBeDefined();
    // 1500 个具名档案各保留有界 Brain/Fact 引用；门禁只防止无界膨胀。
    expect(stateBytes).toBeLessThan(30 * 1024 * 1024);
  }, 120_000);
});
