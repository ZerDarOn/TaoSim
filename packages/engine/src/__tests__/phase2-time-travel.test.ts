import { describe, expect, it } from 'vitest';
import type { Character, WorldState } from '@taosim/contracts';
import { createLegacySpatialState, planSpatialTravel } from '../index.js';
import { TimeAdvanceService } from '../time/time-advance-service.js';
import { MINUTES_PER_DAY } from '../time/world-clock.js';

function player(): Character {
  return {
    id: 'PLAYER_PHASE2', name: '测试修士', gender: 'Other', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 10, max: 100 }, monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' }, hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [], equipmentSlots: { treasures: [] }, skills: [], skillCooldowns: {}, traits: [], relations: {},
    spiritStones: 100, wantedLevels: {}, unlockedRecipes: [],
  };
}

function world(): WorldState {
  return {
    currentYear: 1, currentMonth: 1, catastropheCountdownMonths: 600, activeContinentIds: ['CONT_EAST'],
    globalFlags: {}, npcs: {}, eventLog: [], spatialState: createLegacySpatialState(),
  };
}

describe('Phase 2 unified minute travel', () => {
  it('keeps a player in transit during a sub-month advance', () => {
    const p = player();
    const w = world();
    const planned = planSpatialTravel(w.spatialState!, {
      travelId: 'player-trip', entityId: p.id,
      origin: { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'stationary' },
      destination: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
      movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    p.spatialAddress = planned.travel.origin;
    p.travel = planned.travel;

    const halfway = TimeAdvanceService.advanceMinutes(p, w, 2 * MINUTES_PER_DAY);
    expect(halfway.updatedWorldState?.elapsedMinutes).toBe(2 * MINUTES_PER_DAY);
    expect(halfway.updatedWorldState?.currentMonth).toBe(1);
    expect(halfway.updatedPlayer.travel?.status).toBe('in_transit');
    expect(halfway.updatedPlayer.spatialAddress?.occupancy).toBe('traveling');

    const arrived = TimeAdvanceService.advanceMinutes(
      halfway.updatedPlayer,
      halfway.updatedWorldState!,
      MINUTES_PER_DAY,
    );
    expect(arrived.updatedPlayer.travel).toBeUndefined();
    expect(arrived.updatedPlayer.spatialAddress?.nodeId).toBe('NODE_CITY_TIANJI');
    expect(arrived.updatedWorldState?.elapsedMinutes).toBe(3 * MINUTES_PER_DAY);
  });
});
