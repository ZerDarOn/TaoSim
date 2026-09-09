import { describe, expect, it } from 'vitest';
import type { Fact, WorldState } from '@taosim/contracts';
import {
  activeSpatialFeature,
  applySpatialDelta,
  commitOutcome,
  createFeatureTransitionDelta,
  createScopedFeatureDelta,
  createSecretRealmDelta,
  createLegacySpatialState,
  findSpatialRoute,
} from '../index.js';
import { WorldClockService } from '../time/world-clock.js';
import { WorldEngine } from '../world/world-engine.js';

function world(): WorldState {
  return {
    currentYear: 1, currentMonth: 1, elapsedMinutes: 0,
    catastropheCountdownMonths: 600, activeContinentIds: ['CONT_EAST'], globalFlags: {},
    npcs: {}, eventLog: [], spatialState: createLegacySpatialState(), facts: [],
  };
}

function fact(factId: string, description: string): Fact {
  return {
    factId, type: 'discovery', at: { year: 1, month: 1 }, participants: [],
    title: description, description, visibility: 'public',
  };
}

describe('Phase 3 atomic spatial deltas', () => {
  it('commits a secret realm entrance with a real pocket root and portal, then closes it', () => {
    const state = world();
    const openingFact = fact('FACT_SECRET_OPEN', '古阵入口开启');
    const opening = createSecretRealmDelta({
      baseRevision: state.spatialState!.revision,
      featureId: 'FEATURE_SECRET_1', anchorNodeId: 'NODE_DUNGEON_HEIFENG',
      pocketRealmName: '黑风洞内府', nowMinutes: 0, seed: 2026,
      endsAtMinutes: 120,
      reasonFactId: openingFact.factId,
    });
    const committed = commitOutcome(state, {
      outcomeId: 'OUTCOME_SECRET_OPEN', baseRevision: 0, source: 'secret_realm', entityDeltas: [],
      spatialDelta: opening, facts: [openingFact],
    });
    expect(committed.status).toBe('success');
    expect(state.spatialState!.nodes.POCKET_FEATURE_SECRET_1?.kind).toBe('PocketRealm');
    expect(activeSpatialFeature(state.spatialState!, 'FEATURE_SECRET_1', 60)?.lifecycle).toBe('active');
    expect(findSpatialRoute(state.spatialState!, 'NODE_DUNGEON_HEIFENG', 'POCKET_FEATURE_SECRET_1_INNER', 60)).not.toBeNull();

    state.elapsedMinutes = 120;
    const closingFact = fact('FACT_SECRET_CLOSE', '古阵入口闭合');
    const closing = createFeatureTransitionDelta(state.spatialState!, 'FEATURE_SECRET_1', 120, closingFact.factId);
    expect(closing).not.toBeNull();
    const closed = commitOutcome(state, {
      outcomeId: 'OUTCOME_SECRET_CLOSE', baseRevision: 1, source: 'secret_realm_transition', entityDeltas: [],
      spatialDelta: closing!, facts: [closingFact],
    });
    expect(closed.status).toBe('success');
    expect(state.spatialState!.features.FEATURE_SECRET_1?.lifecycle).toBe('closed');
    expect(state.spatialState!.links.PORTAL_FEATURE_SECRET_1?.status).toBe('archived');
  });

  it('atomically blocks and restores a barrier or disaster link', () => {
    const state = world();
    const linkId = 'LINK_NODE_SECT_QINGYUN_NODE_CITY_TIANJI';
    const barrier = createScopedFeatureDelta({
      baseRevision: state.spatialState!.revision, featureId: 'FEATURE_BARRIER_1',
      type: 'barrier', nodeIds: ['NODE_SECT_QINGYUN', 'NODE_CITY_TIANJI'], linkIds: [linkId],
      nowMinutes: 0, durationMinutes: 60, reasonFactId: 'FACT_BARRIER',
    });
    const applied = applySpatialDelta(state.spatialState!, barrier, 0);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.state.links[linkId]?.status).toBe('blocked');

    const disasterLinkId = 'LINK_NODE_CITY_TIANJI_NODE_MARKET';
    const disaster = createScopedFeatureDelta({
      baseRevision: applied.state.revision, featureId: 'FEATURE_DISASTER_1',
      type: 'disaster_zone', nodeIds: ['NODE_CITY_TIANJI', 'NODE_MARKET'], linkIds: [disasterLinkId],
      nowMinutes: 0, durationMinutes: 30, reasonFactId: 'FACT_DISASTER',
    });
    const disasterApplied = applySpatialDelta(applied.state, disaster, 0);
    expect(disasterApplied.ok).toBe(true);
    if (!disasterApplied.ok) return;
    expect(disasterApplied.state.features.FEATURE_DISASTER_1?.type).toBe('disaster_zone');
    expect(disasterApplied.state.links[disasterLinkId]?.status).toBe('blocked');
    // 失败不污染原快照：基于同一 revision 重复灾害不会留下半提交。
    const rejected = applySpatialDelta(disasterApplied.state, disaster, 0);
    expect(rejected.ok).toBe(false);
    expect(disasterApplied.state.features.FEATURE_DISASTER_1).toBeDefined();

    const disasterClosing = createFeatureTransitionDelta(disasterApplied.state, 'FEATURE_DISASTER_1', 30, 'FACT_DISASTER_END');
    expect(disasterClosing).not.toBeNull();
    const disasterRestored = applySpatialDelta(disasterApplied.state, disasterClosing!, 30);
    expect(disasterRestored.ok).toBe(true);
    if (!disasterRestored.ok) return;
    expect(disasterRestored.state.links[disasterLinkId]?.status).toBe('active');
    const closing = createFeatureTransitionDelta(disasterRestored.state, 'FEATURE_BARRIER_1', 60, 'FACT_BARRIER_END');
    expect(closing).not.toBeNull();
    const restored = applySpatialDelta(disasterRestored.state, closing!, 60);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.state.links[linkId]?.status).toBe('active');
  });

  it('schedules feature expiry and records the transition fact after atomic commit', () => {
    const state = world();
    const openingFact = fact('FACT_SECRET_SCHEDULED', '短期开启的秘境');
    const opening = createSecretRealmDelta({
      baseRevision: 0, featureId: 'FEATURE_SECRET_SCHEDULED', anchorNodeId: 'NODE_DUNGEON_HEIFENG',
      pocketRealmName: '短暂内府', nowMinutes: 0, seed: 7, endsAtMinutes: 60,
      reasonFactId: openingFact.factId,
    });
    expect(commitOutcome(state, {
      outcomeId: 'OUTCOME_SECRET_SCHEDULED', baseRevision: 0, source: 'secret_realm', entityDeltas: [],
      spatialDelta: opening, facts: [openingFact],
    }).status).toBe('success');

    const engine = new WorldEngine(state, { rng: () => 0.99 });
    expect(engine.getNextScheduledWakeAt()).toBe(60);
    const clock = new WorldClockService(engine);
    clock.advanceMinutes(60);
    const after = clock.getState();
    expect(after.spatialState?.features.FEATURE_SECRET_SCHEDULED?.lifecycle).toBe('closed');
    expect(after.facts?.some((entry) => entry.factId === 'FACT_FEATURE_FEATURE_SECRET_SCHEDULED_60')).toBe(true);
  });

  it('rejects an invalid delta without modifying the source state', () => {
    const state = createLegacySpatialState();
    const before = structuredClone(state);
    const result = applySpatialDelta(state, {
      deltaId: 'bad', baseRevision: 0, effectiveAtMinutes: 0, reasonFactId: 'bad', affectedEntityIds: [],
      operations: [{ type: 'patch_link', linkId: 'missing', patch: { status: 'blocked' } }],
    });
    expect(result.ok).toBe(false);
    expect(state).toEqual(before);
  });
});
