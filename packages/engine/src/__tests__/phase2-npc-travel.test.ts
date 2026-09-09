import { describe, expect, it } from 'vitest';
import type { NpcRecord, WorldState } from '@taosim/contracts';
import { createLegacySpatialState } from '../overworld/spatial-catalog.js';
import { planSpatialTravel } from '../overworld/spatial-travel.js';
import { WorldEngine } from '../world/world-engine.js';
import { WorldClockService, MINUTES_PER_DAY } from '../time/world-clock.js';

function npc(): NpcRecord {
  return {
    id: 'NPC_PHASE2_WANDER', name: '行旅修士', gender: 'Other', personalityId: 'neutral',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1', soulState: 'Active', cultivation: { currentExp: 0, maxExp: 80 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    lifespan: { age: 30, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    relations: {}, biography: { milestones: [], summary: '' }, lastUpdate: { year: 1, month: 1 },
    locationId: 'VENUE_QINGYUN_HALL', aspiration: 'wander',
  };
}

function world(): WorldState {
  return {
    currentYear: 1, currentMonth: 1, catastropheCountdownMonths: 600,
    activeContinentIds: ['CONT_EAST'], globalFlags: {}, npcs: { NPC_PHASE2_WANDER: npc() }, eventLog: [],
    spatialState: createLegacySpatialState(),
  };
}

describe('Phase 2 NPC continuous travel', () => {
  it('records departure/in-transit and arrives only after the ETA', () => {
    const engine = new WorldEngine(world(), { rng: () => 0.99 });
    const departed = engine.step().updatedState.npcs.NPC_PHASE2_WANDER!;
    expect(departed.travel?.status).toBe('in_transit');
    expect(departed.spatialAddress?.occupancy).toBe('traveling');
    expect(departed.locationId).toBe('VENUE_QINGYUN_HALL');
    const destinationNodeId = departed.travel!.destination.nodeId;
    const remainingMinutes = departed.travel!.estimatedArrivalAtMinutes - (engine.getState().elapsedMinutes ?? 0);
    expect(remainingMinutes).toBeGreaterThan(0);

    const clock = new WorldClockService(new WorldEngine(engine.getState(), { rng: () => 0.99 }));
    clock.advanceMinutes(remainingMinutes - 1);
    const stillInTransit = clock.getState().npcs.NPC_PHASE2_WANDER!;
    expect(stillInTransit.travel?.status).toBe('in_transit');

    clock.advanceMinutes(1);
    const arrived = clock.getState().npcs.NPC_PHASE2_WANDER!;
    expect(arrived.travel).toBeUndefined();
    expect(arrived.spatialAddress?.occupancy).toBe('stationary');
    expect(arrived.spatialAddress?.nodeId).toBe(destinationNodeId);
  });

  it('does not process a future wake when a partial advance merely crosses a month boundary', () => {
    const elapsed = 28 * MINUTES_PER_DAY;
    const state = world();
    state.elapsedMinutes = elapsed;
    const traveler = state.npcs.NPC_PHASE2_WANDER!;
    traveler.spatialAddress = { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'stationary' };
    const planned = planSpatialTravel(state.spatialState!, {
      travelId: 'future-trip',
      entityId: traveler.id,
      origin: traveler.spatialAddress,
      destination: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
      movementMode: 'walk',
      speed: { baseDistancePerDay: 1 },
      nowMinutes: elapsed,
      distanceOverride: 17,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    traveler.travel = planned.travel;

    const engine = new WorldEngine(state, { rng: () => 0.99, npcBrainV2Mode: 'single-write' });
    const clock = new WorldClockService(engine);
    clock.advanceMinutes(3 * MINUTES_PER_DAY);

    const after = clock.getState();
    expect(after.elapsedMinutes).toBe(31 * MINUTES_PER_DAY);
    expect(after.npcs.NPC_PHASE2_WANDER?.travel?.travelId).toBe('future-trip');
    expect(after.npcs.NPC_PHASE2_WANDER?.travel?.status).toBe('in_transit');
    expect(after.npcs.NPC_PHASE2_WANDER?.spatialAddress?.nodeId).toBe('NODE_SECT_QINGYUN');
    expect(after.scheduledWakes?.[0]?.atMinutes).toBe(45 * MINUTES_PER_DAY);
  });
});
