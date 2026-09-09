import { describe, expect, it } from 'vitest';
import type { Character, NpcRecord, WorldState } from '@taosim/contracts';
import { createLegacySpatialState } from '../overworld/spatial-catalog.js';
import {
  chooseRoadEncounter,
  findEarliestRoadEncounter,
  prepareRoadEncounterBattleCompletion,
} from '../overworld/road-encounter.js';
import { commitOutcome } from '../world/outcome-committer.js';
import { planSpatialTravel } from '../overworld/spatial-travel.js';
import { TimeAdvanceService } from '../time/time-advance-service.js';
import { MINUTES_PER_DAY } from '../time/world-clock.js';

function player(): Character {
  return {
    id: 'PLAYER_ROAD', name: '行路人', gender: 'Other', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 10, max: 100 }, monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' }, hp: 20, maxHp: 20, ap: 3, canFly: false,
    inventory: [], equipmentSlots: { treasures: [] }, skills: [], skillCooldowns: {}, traits: [], relations: {},
    spiritStones: 0, wantedLevels: {}, unlockedRecipes: [],
  };
}

function npc(): NpcRecord {
  return {
    id: 'NPC_ROAD', name: '云游客', gender: 'Other', personalityId: 'warm',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1', soulState: 'Active', cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Wood'], isVariant: false },
    attributes: { physique: 8, comprehension: 8, perception: 8, agility: 8, luck: 8, charm: 8 },
    lifespan: { age: 30, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    relations: {}, biography: { milestones: [], summary: '' }, lastUpdate: { year: 1, month: 1 },
    aspiration: 'wander',
    mind: {
      currentGoal: { type: 'explore' },
      needs: { longevity: 0, social: 70, dao: 30, fame: 0, safety: 20 },
      nextAction: { type: 'socialize' },
    },
  };
}

function scenario(): { player: Character; world: WorldState } {
  const spatialState = createLegacySpatialState();
  const p = player();
  const n = npc();
  const playerPlan = planSpatialTravel(spatialState, {
    travelId: 'PLAYER_QINGYUN_TIANJI', entityId: p.id,
    origin: { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'stationary' },
    destination: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
    movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
  });
  const npcPlan = planSpatialTravel(spatialState, {
    travelId: 'NPC_TIANJI_QINGYUN', entityId: n.id,
    origin: { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' },
    destination: { nodeId: 'NODE_SECT_QINGYUN', occupancy: 'stationary' },
    movementMode: 'walk', speed: { baseDistancePerDay: 1 }, nowMinutes: 0,
  });
  if (!playerPlan.ok || !npcPlan.ok) throw new Error('fixture route missing');
  p.spatialAddress = playerPlan.travel.origin;
  p.travel = playerPlan.travel;
  n.spatialAddress = npcPlan.travel.origin;
  n.travel = npcPlan.travel;
  return {
    player: p,
    world: {
      currentYear: 1, currentMonth: 1, elapsedMinutes: 0, catastropheCountdownMonths: 600,
      activeContinentIds: ['CONT_EAST'], globalFlags: {}, npcs: { [n.id]: n }, eventLog: [],
      spatialState, activeEncounters: {},
    },
  };
}

describe('persistent road encounter slice', () => {
  it('finds the real meeting point from two continuous journeys', () => {
    const state = scenario();
    const candidate = findEarliestRoadEncounter(state.world, state.player, 3 * MINUTES_PER_DAY);
    expect(candidate).toMatchObject({
      npcId: 'NPC_ROAD', intent: 'greet', occursAtMinutes: 1.5 * MINUTES_PER_DAY,
      linkId: 'LINK_NODE_SECT_QINGYUN_NODE_CITY_TIANJI', progress: 0.5,
    });
  });

  it('stops the common clock at contact, persists the encounter, then resumes both journeys after avoidance', () => {
    const state = scenario();
    const interrupted = TimeAdvanceService.advanceMinutes(state.player, state.world, 3 * MINUTES_PER_DAY);
    const world = interrupted.updatedWorldState!;
    const encounter = Object.values(world.activeEncounters ?? {})[0]!;

    expect(interrupted.advancedMinutes).toBe(1.5 * MINUTES_PER_DAY);
    expect(interrupted.remainingMinutes).toBe(1.5 * MINUTES_PER_DAY);
    expect(world.elapsedMinutes).toBe(1.5 * MINUTES_PER_DAY);
    expect(interrupted.updatedPlayer.travel?.status).toBe('paused');
    expect(world.npcs.NPC_ROAD?.travel?.status).toBe('paused');
    expect(encounter.status).toBe('awaiting_decision');
    expect(world.facts?.filter((fact) => fact.factId === encounter.startFactId)).toHaveLength(1);

    const blocked = TimeAdvanceService.advanceMinutes(interrupted.updatedPlayer, world, MINUTES_PER_DAY);
    expect(blocked.advancedMinutes).toBe(0);
    expect(blocked.updatedWorldState?.elapsedMinutes).toBe(1.5 * MINUTES_PER_DAY);

    const avoided = chooseRoadEncounter(world, interrupted.updatedPlayer, encounter.encounterId, 'avoid');
    expect(avoided.ok).toBe(true);
    if (!avoided.ok) return;
    expect(avoided.updatedPlayer.travel?.status).toBe('in_transit');
    expect(world.npcs.NPC_ROAD?.travel?.status).toBe('in_transit');
    expect(world.activeEncounters?.[encounter.encounterId]).toBeUndefined();

    const completed = TimeAdvanceService.advanceMinutes(avoided.updatedPlayer, world, interrupted.remainingMinutes);
    expect(completed.updatedWorldState?.elapsedMinutes).toBe(3 * MINUTES_PER_DAY);
    expect(completed.updatedPlayer.travel).toBeUndefined();
    expect(completed.updatedPlayer.spatialAddress?.nodeId).toBe('NODE_CITY_TIANJI');
  });

  it('keeps a chosen battle persistent until the battle outcome atomically resumes both journeys', () => {
    const state = scenario();
    const interrupted = TimeAdvanceService.advanceMinutes(state.player, state.world, 3 * MINUTES_PER_DAY);
    const world = interrupted.updatedWorldState!;
    const encounter = Object.values(world.activeEncounters ?? {})[0]!;
    const fight = chooseRoadEncounter(world, interrupted.updatedPlayer, encounter.encounterId, 'fight');
    expect(fight).toMatchObject({ ok: true, launchBattle: true });
    expect(world.activeEncounters?.[encounter.encounterId]?.status).toBe('active');

    const completion = prepareRoadEncounterBattleCompletion(
      world,
      fight.ok ? fight.updatedPlayer : interrupted.updatedPlayer,
      encounter.encounterId,
    );
    expect(completion).not.toBeNull();
    const committed = commitOutcome(world, {
      outcomeId: `BATTLE_${encounter.encounterId}`,
      baseRevision: world.worldRevision ?? 0,
      source: 'test_battle',
      entityDeltas: [{ entityId: 'NPC_ROAD', travelChanged: completion!.npcTravel }],
      encounterChanges: [completion!.encounterChange],
      facts: [{
        factId: `FACT_BATTLE_${encounter.encounterId}`,
        type: 'battle',
        at: { year: 1, month: 1 },
        participants: [{ entityId: 'PLAYER_ROAD', role: 'attacker' }, { entityId: 'NPC_ROAD', role: 'defender' }],
        title: '途中斗法结束', description: '真实战斗结果', visibility: 'local',
      }],
    });
    expect(committed.status).toBe('success');
    expect(world.activeEncounters?.[encounter.encounterId]).toBeUndefined();
    expect(world.npcs.NPC_ROAD?.travel?.status).toBe('in_transit');
    expect(completion!.updatedPlayer.travel?.status).toBe('in_transit');
  });
});
