import { describe, expect, it } from 'vitest';
import type { Character, NpcRecord, WorldState } from '@taosim/contracts';
import {
  MINUTES_PER_DAY,
  WorldClockService,
  WorldEngine,
  commitNamedNpcBattleSimulation,
  planSecretRealmEntry,
  resolveAndCommitNamedNpcBattle,
  triggerSecretRealmFromPressure,
} from '../index.js';
import { TimeAdvanceService } from '../time/time-advance-service.js';
import { createLegacySpatialState } from '../overworld/spatial-catalog.js';

const ANCHOR = 'NODE_DUNGEON_HEIFENG';
const FEATURE = 'FEATURE_PHASE6_REALM';

function player(): Character {
  return {
    id: 'PLAYER_PHASE6', name: '切片玩家', gender: 'Other', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 10, max: 100 }, monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 20, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' }, hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [], equipmentSlots: { treasures: [] }, skills: [], skillCooldowns: {}, traits: [], relations: {},
    spiritStones: 100, wantedLevels: {}, unlockedRecipes: [],
    spatialAddress: { nodeId: ANCHOR, occupancy: 'stationary' },
  };
}

function npc(id: string, physique: number): NpcRecord {
  return {
    id, name: id, gender: 'Other', personalityId: 'cautious', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, lifespan: { age: 20, maxLifespan: 100 },
    attributes: { physique, comprehension: physique, perception: 10, agility: physique, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    relations: {}, locationId: ANCHOR, affinityMatrixSeed: 1,
    lastUpdate: { year: 1, month: 1 }, spatialAddress: { nodeId: ANCHOR, occupancy: 'stationary' },
    origin: { type: '散修' }, skillIds: [], birthYear: 1, birthMonth: 1,
    biography: { milestones: [], summary: '' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
  };
}

function world(): WorldState {
  return {
    currentYear: 1, currentMonth: 1, elapsedMinutes: 0, catastropheCountdownMonths: 600,
    activeContinentIds: ['CONT_EAST'], globalFlags: {}, npcs: { rivalA: npc('rivalA', 80), rivalB: npc('rivalB', 2) },
    eventLog: [], facts: [], spatialState: createLegacySpatialState(), nodeSpiritQi: { [ANCHOR]: 85 },
  };
}

function openRealm(state: WorldState): void {
  expect(triggerSecretRealmFromPressure(state, {
    featureId: FEATURE, anchorNodeId: ANCHOR, pocketRealmName: '黑风内府', seed: 606,
    durationMinutes: MINUTES_PER_DAY * 2,
  }).status).toBe('omen_recorded');
  expect(triggerSecretRealmFromPressure(state, {
    featureId: FEATURE, anchorNodeId: ANCHOR, pocketRealmName: '黑风内府', seed: 606,
    durationMinutes: MINUTES_PER_DAY * 2,
  }).status).toBe('opened');
}

describe('Phase 6 “秘境现世” vertical slice', () => {
  it('enforces pressure → omen → opening, shared portal travel, real named battle, collapse and rehoming', () => {
    const state = world();
    expect(triggerSecretRealmFromPressure(state, {
      featureId: FEATURE, anchorNodeId: ANCHOR, pocketRealmName: '黑风内府', seed: 606,
      durationMinutes: MINUTES_PER_DAY * 2,
    }).status).toBe('omen_recorded');
    const opened = triggerSecretRealmFromPressure(state, {
      featureId: FEATURE, anchorNodeId: ANCHOR, pocketRealmName: '黑风内府', seed: 606,
      durationMinutes: MINUTES_PER_DAY * 2,
    });
    expect(opened.status).toBe('opened');
    expect(state.facts?.map((fact) => fact.factId)).toEqual([
      `FACT_SECRET_OMEN_${FEATURE}`, `FACT_SECRET_OPEN_${FEATURE}`,
    ]);

    const inner = state.spatialState!.features[FEATURE]!.effects.innerNodeId as string;
    for (const record of Object.values(state.npcs)) {
      const entry = planSecretRealmEntry(state, record, record.spatialAddress!, FEATURE);
      expect(entry.ok).toBe(true);
      if (entry.ok) {
        record.spatialAddress = entry.entry.travel.origin;
        record.travel = entry.entry.travel;
      }
    }
    const p = player();
    const pEntry = planSecretRealmEntry(state, p, p.spatialAddress!, FEATURE);
    expect(pEntry.ok).toBe(true);
    if (!pEntry.ok) return;
    p.spatialAddress = pEntry.entry.travel.origin;
    p.travel = pEntry.entry.travel;

    const entered = TimeAdvanceService.advanceMinutes(p, state, MINUTES_PER_DAY);
    expect(entered.updatedPlayer.spatialAddress?.nodeId).toBe(inner);
    expect(entered.updatedPlayer.travel).toBeUndefined();
    const enteredWorld = entered.updatedWorldState!;
    expect(enteredWorld.npcs.rivalA?.spatialAddress?.nodeId).toBe(inner);
    expect(enteredWorld.npcs.rivalB?.spatialAddress?.nodeId).toBe(inner);

    const battle = resolveAndCommitNamedNpcBattle(enteredWorld, {
      encounterId: 'PHASE6_BATTLE', attackerId: 'rivalA', defenderId: 'rivalB',
      kind: 'deadly', locationId: inner, seed: 99, allowFlee: false, allowSurrender: false,
      lootPolicy: 'all_on_elimination', relationPolicy: 'hostile', approach: 'ambush', ambushDetected: false,
    });
    expect(battle.status).toBe('committed');
    expect(enteredWorld.facts?.some((fact) => fact.factId === 'fact:battle:PHASE6_BATTLE')).toBe(true);

    const collapsed = TimeAdvanceService.advanceMinutes(entered.updatedPlayer, enteredWorld, MINUTES_PER_DAY);
    const collapsedWorld = collapsed.updatedWorldState!;
    expect(collapsedWorld.spatialState?.features[FEATURE]?.lifecycle).toBe('closed');
    expect(collapsedWorld.spatialState?.nodes[inner]?.status).toBe('archived');
    for (const record of Object.values(collapsedWorld.npcs)) {
      expect(record.spatialAddress?.nodeId).toBe(ANCHOR);
      expect(record.travel).toBeUndefined();
    }

    const reloaded = new WorldEngine(structuredClone(collapsedWorld), { rng: () => 0.99 });
    expect(reloaded.getState().spatialState?.features[FEATURE]?.effects.residue).toBe('terrain_scar');
    expect(reloaded.getState().npcs.rivalA?.spatialAddress?.nodeId).toBe(ANCHOR);
  });

  it('normal minute chunks and fast-forward produce the same closed feature state for the same seed', () => {
    const first = world();
    first.npcs = {};
    openRealm(first);
    const second = structuredClone(first);

    const normalEngine = new WorldEngine(first, { rng: () => 0.99 });
    const normalClock = new WorldClockService(normalEngine);
    normalClock.advanceMinutes(30);
    normalClock.advanceMinutes(30);
    normalClock.advanceMinutes(MINUTES_PER_DAY * 30 - 60);

    const fastEngine = new WorldEngine(second, { rng: () => 0.99 });
    fastEngine.fastForward(1);

    const normal = normalEngine.getState();
    const fast = fastEngine.getState();
    expect(normal.elapsedMinutes).toBe(MINUTES_PER_DAY * 30);
    expect(fast.elapsedMinutes).toBe(MINUTES_PER_DAY * 30);
    expect(normal.spatialState?.features[FEATURE]?.lifecycle).toBe('closed');
    expect(fast.spatialState?.features[FEATURE]?.lifecycle).toBe('closed');
    expect(normal.spatialState?.nodes[`POCKET_${FEATURE}`]?.status).toBe('archived');
    expect(fast.spatialState?.nodes[`POCKET_${FEATURE}`]?.status).toBe('archived');
    expect(normal.facts?.some((fact) => fact.metadata?.featureId === FEATURE)).toBe(true);
    expect(fast.facts?.some((fact) => fact.metadata?.featureId === FEATURE)).toBe(true);
  });
});
