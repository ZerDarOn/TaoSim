import { describe, expect, it } from 'vitest';
import type { Fact, NpcRecord, WorldState } from '@taosim/contracts';
import {
  buildNpcPerceptionSnapshot,
  chooseNpcSpatialResponse,
  commitOutcome,
  createLegacySpatialState,
  createSecretRealmDelta,
} from '../index.js';
import { WorldEngine } from '../world/world-engine.js';

function npc(id: string, personalityId: string): NpcRecord {
  return {
    id, name: id, gender: 'Other', personalityId, origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false }, realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 }, attributes: { physique: 5, comprehension: 5, perception: 10, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 }, spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    skillIds: [], birthYear: 1, birthMonth: 1, relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 }, locationId: 'NODE_DUNGEON_HEIFENG', aspiration: 'seekDao',
  };
}

function fact(factId: string): Fact {
  return { factId, type: 'discovery', at: { year: 1, month: 1 }, participants: [], title: '秘境征兆', description: '古阵显露', visibility: 'public' };
}

function world(): WorldState {
  return {
    currentYear: 1, currentMonth: 1, elapsedMinutes: 0, catastropheCountdownMonths: 600,
    activeContinentIds: ['CONT_EAST'], globalFlags: {},
    npcs: { cautious: npc('cautious', 'cautious'), reckless: npc('reckless', 'reckless') }, eventLog: [],
    spatialState: createLegacySpatialState(), facts: [],
  };
}

describe('Phase 4 NPC spatial perception and response', () => {
  it('does not expose an out-of-scope secret feature', () => {
    const w = world();
    const opening = createSecretRealmDelta({
      baseRevision: 0, featureId: 'FEATURE_SECRET_PERCEPTION', anchorNodeId: 'NODE_DUNGEON_HEIFENG',
      pocketRealmName: '感知测试内府', nowMinutes: 0, seed: 1, reasonFactId: 'FACT_PERCEPTION',
    });
    commitOutcome(w, { outcomeId: 'OUTCOME_PERCEPTION', baseRevision: 0, source: 'test', entityDeltas: [], spatialDelta: opening, facts: [fact('FACT_PERCEPTION')] });
    const far = npc('far', 'reckless');
    far.locationId = 'NODE_SECT_QINGYUN';
    const snapshot = buildNpcPerceptionSnapshot(far, { ...w, npcs: { far } }, { year: 1, month: 1 });
    expect(snapshot.visibleFeatureIds).toEqual([]);
  });

  it('lets cautious and reckless identities choose differently for the same visible secret realm', () => {
    const w = world();
    const opening = createSecretRealmDelta({
      baseRevision: 0, featureId: 'FEATURE_SECRET_CHOICE', anchorNodeId: 'NODE_DUNGEON_HEIFENG',
      pocketRealmName: '选择测试内府', nowMinutes: 0, seed: 2, reasonFactId: 'FACT_CHOICE',
    });
    commitOutcome(w, { outcomeId: 'OUTCOME_CHOICE', baseRevision: 0, source: 'test', entityDeltas: [], spatialDelta: opening, facts: [fact('FACT_CHOICE')] });
    const feature = w.spatialState!.features.FEATURE_SECRET_CHOICE!;
    expect(chooseNpcSpatialResponse(w.npcs.cautious!, feature).response).toBe('avoid');
    expect(chooseNpcSpatialResponse(w.npcs.reckless!, feature).response).toBe('enter');

    const engine = new WorldEngine(w, { npcBrainV2Mode: 'single-write', rng: () => 0.99 });
    engine.step();
    expect(engine.getState().npcs.cautious?.travel).toBeUndefined();
    expect(engine.getState().npcs.reckless?.travel?.destination.nodeId).toBe('POCKET_FEATURE_SECRET_CHOICE_INNER');
  });
});
