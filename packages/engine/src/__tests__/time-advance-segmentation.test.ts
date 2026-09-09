import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Character, WorldState } from '@taosim/contracts';
import { createLegacySpatialState } from '../overworld/spatial-catalog.js';
import { planSpatialTravel } from '../overworld/spatial-travel.js';
import { TimeAdvanceService } from '../time/time-advance-service.js';
import { MINUTES_PER_DAY } from '../time/world-clock.js';

function player(): Character {
  return {
    id: 'PLAYER_SEGMENT', name: '分段修士', gender: 'Other', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 7, maxExp: 8_000 }, lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 10, max: 100 }, monthlyActionPoints: { current: 1, max: 3 },
    attributes: { physique: 10, comprehension: 1_000, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' }, hp: 33, maxHp: 100, ap: 2, canFly: false,
    inventory: [], equipmentSlots: { treasures: [] }, skills: [], skillCooldowns: {}, traits: [], relations: {},
    spiritStones: 100, wantedLevels: {}, unlockedRecipes: [],
  };
}

function world(elapsedMinutes = 0): WorldState {
  return {
    currentYear: 1,
    currentMonth: 1,
    elapsedMinutes,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONT_EAST'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
    spatialState: createLegacySpatialState(),
  };
}

function withTravel(p: Character, w: WorldState, durationDays: number): Character {
  const planned = planSpatialTravel(w.spatialState!, {
    travelId: `player-trip-${durationDays}`,
    entityId: p.id,
    origin: { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'stationary' },
    destination: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
    movementMode: 'walk',
    speed: { baseDistancePerDay: 1 },
    nowMinutes: w.elapsedMinutes ?? 0,
    distanceOverride: durationDays,
  });
  if (!planned.ok) throw new Error(planned.reason);
  return { ...p, spatialAddress: planned.travel.origin, travel: planned.travel };
}

function advanceChunks(p: Character, w: WorldState, chunks: number[]) {
  let currentPlayer = structuredClone(p);
  let currentWorld = structuredClone(w);
  const events: string[] = [];
  for (const minutes of chunks) {
    const result = TimeAdvanceService.advanceMinutes(currentPlayer, currentWorld, minutes);
    currentPlayer = result.updatedPlayer;
    currentWorld = result.updatedWorldState!;
    events.push(...result.events.map((event) => `${event.id}:${event.title}`));
  }
  return { player: currentPlayer, world: currentWorld, events };
}

function expectEquivalent(left: ReturnType<typeof advanceChunks>, right: ReturnType<typeof advanceChunks>) {
  expect(left.world.elapsedMinutes).toBe(right.world.elapsedMinutes);
  expect(left.world.currentYear).toBe(right.world.currentYear);
  expect(left.world.currentMonth).toBe(right.world.currentMonth);
  expect(Object.keys(left.world.npcs)).toHaveLength(Object.keys(right.world.npcs).length);
  expect(left.events).toEqual(right.events);
  expect(new Set(left.events).size).toBe(left.events.length);
  expect(left.player.cultivation.currentExp).toBeCloseTo(right.player.cultivation.currentExp, 8);
  expect(left.player.lifespan.age).toBeCloseTo(right.player.lifespan.age, 8);
  expect(left.player.spiritStones).toBe(right.player.spiritStones);
  expect(left.player.spiritEnergy.current).toBe(right.player.spiritEnergy.current);
  expect(left.player.monthlyActionPoints.current).toBe(right.player.monthlyActionPoints.current);
  expect(left.player.hp).toBe(right.player.hp);
  expect(left.player.travel).toEqual(right.player.travel);
  expect(left.player.spatialAddress).toEqual(right.player.spatialAddress);
}

describe('TimeAdvanceService segmentation invariance', () => {
  afterEach(() => vi.restoreAllMocks());

  it('treats a zero-minute request as a no-op for player rewards and recovery', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const p = player();
    const result = TimeAdvanceService.advanceMinutes(p, world(), 0);

    expect(result.expGained).toBe(0);
    expect(result.events).toEqual([]);
    expect(result.updatedPlayer).toEqual(p);
  });

  it('makes 96 realtime 15-minute advances equivalent to one day without free recovery', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = world();
    const p = withTravel(player(), w, 1);
    const segmented = advanceChunks(p, w, Array.from({ length: 96 }, () => 15));
    const single = advanceChunks(p, w, [MINUTES_PER_DAY]);

    expectEquivalent(segmented, single);
    expect(segmented.player.cultivation.currentExp).toBeGreaterThan(7);
    expect(segmented.player.spiritEnergy.current).toBe(10);
    expect(segmented.player.monthlyActionPoints.current).toBe(1);
    expect(segmented.player.spiritStones).toBe(100);
    expect(segmented.player.hp).toBe(33);
    expect(segmented.player.travel).toBeUndefined();
    expect(segmented.player.spatialAddress?.nodeId).toBe('NODE_CITY_TIANJI');
    const arrivalFacts = segmented.world.facts?.filter((fact) => fact.metadata?.travelId === 'player-trip-1') ?? [];
    expect(arrivalFacts).toHaveLength(1);
    expect(segmented.world.eventLog.filter((event) => event.templateKey === 'player.travel.arrival')).toHaveLength(1);
  });

  it('makes a split cross-month advance equivalent to one advance and applies monthly effects once', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const w = world(28 * MINUTES_PER_DAY);
    const p = withTravel(player(), w, 3);
    const segmented = advanceChunks(p, w, [2 * MINUTES_PER_DAY, 2 * MINUTES_PER_DAY]);
    const single = advanceChunks(p, w, [4 * MINUTES_PER_DAY]);

    expectEquivalent(segmented, single);
    expect(segmented.player.spiritEnergy.current).toBe(100);
    expect(segmented.player.monthlyActionPoints.current).toBe(3);
    expect(segmented.player.spiritStones).toBeGreaterThan(100);
    expect(segmented.player.hp).toBe(33);
    expect(segmented.player.travel).toBeUndefined();
  });
});
