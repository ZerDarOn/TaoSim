// ============================================================
// “秘境现世”垂直切片的权威入口
//
// 这个服务只接受真实空间节点和真实世界压力：第一次调用记录征兆，
// 压力仍然存在且已有征兆时才发布入口/口袋空间/PortalLink。玩家与
// NPC 的进入都返回同一套 TravelState 规划，不在这里制造战斗结果。
// ============================================================

import type {
  Character,
  Fact,
  NpcRecord,
  SpatialAddress,
  TravelState,
  WorldOutcome,
  WorldState,
} from '@taosim/contracts';
import { activeSpatialFeature } from '../overworld/spatial-delta.js';
import { createSecretRealmDelta } from '../overworld/spatial-features.js';
import { planSpatialTravel } from '../overworld/spatial-travel.js';
import { commitOutcome } from './outcome-committer.js';
import { projectTime } from '../time/world-clock.js';

export const SECRET_REALM_PRESSURE_THRESHOLD = 70;

export interface SecretRealmPressureInput {
  featureId: string;
  anchorNodeId: string;
  pocketRealmName: string;
  seed: number;
  durationMinutes: number;
  nowMinutes?: number;
}

export type SecretRealmTriggerResult =
  | { status: 'omen_recorded'; fact: Fact; commit: ReturnType<typeof commitOutcome> }
  | { status: 'opened'; featureId: string; fact: Fact; commit: ReturnType<typeof commitOutcome> }
  | { status: 'already_open'; featureId: string }
  | { status: 'pressure_not_ready' | 'invalid_anchor' | 'revision_conflict' | 'commit_failed'; reason?: string };

function factAt(minutes: number): { year: number; month: number } {
  const time = projectTime(minutes);
  return { year: time.year, month: time.month };
}

function worldRevision(world: WorldState): number {
  return world.worldRevision ?? 0;
}

/** 由真实灵气压力先产生征兆，再在下一次满足条件时现世。 */
export function triggerSecretRealmFromPressure(
  world: WorldState,
  input: Readonly<SecretRealmPressureInput>,
): SecretRealmTriggerResult {
  const spatial = world.spatialState;
  const nowMinutes = input.nowMinutes ?? world.elapsedMinutes ?? 0;
  if (!spatial?.nodes[input.anchorNodeId]) return { status: 'invalid_anchor' };
  const existing = spatial.features[input.featureId];
  if (existing && existing.lifecycle !== 'closed' && existing.lifecycle !== 'archived' && existing.lifecycle !== 'ruined') {
    return { status: 'already_open', featureId: input.featureId };
  }
  const qi = world.nodeSpiritQi?.[input.anchorNodeId] ?? 0;
  if (qi < SECRET_REALM_PRESSURE_THRESHOLD) return { status: 'pressure_not_ready' };

  const omenFactId = `FACT_SECRET_OMEN_${input.featureId}`;
  const hasOmen = (world.facts ?? []).some((fact) => fact.factId === omenFactId);
  if (!hasOmen) {
    const fact: Fact = {
      factId: omenFactId,
      type: 'discovery',
      at: factAt(nowMinutes),
      locationId: input.anchorNodeId,
      participants: [],
      title: '秘境征兆显露',
      description: `节点灵气浓度达到 ${qi}，尘封空间出现稳定异常波动。`,
      visibility: 'local',
      metadata: { featureId: input.featureId, pressure: 'node_spirit_qi', qi },
    };
    const outcome: WorldOutcome = {
      outcomeId: `OUTCOME_SECRET_OMEN_${input.featureId}`,
      baseRevision: worldRevision(world),
      source: 'secret_realm_pressure',
      entityDeltas: [],
      facts: [fact],
    };
    const commit = commitOutcome(world, outcome);
    if (commit.status === 'version_conflict') return { status: 'revision_conflict' };
    if (commit.status !== 'success' && commit.status !== 'already_applied') {
      return { status: 'commit_failed', reason: commit.status === 'validation_failed' ? commit.reason : undefined };
    }
    return { status: 'omen_recorded', fact, commit };
  }

  const openingFactId = `FACT_SECRET_OPEN_${input.featureId}`;
  const fact: Fact = {
    factId: openingFactId,
    type: 'discovery',
    at: factAt(nowMinutes),
    locationId: input.anchorNodeId,
    participants: [],
    title: '秘境入口现世',
    description: `${input.pocketRealmName} 的入口在真实节点处稳定成形，PortalLink 已开放。`,
    causedBy: [omenFactId],
    visibility: 'local',
    metadata: { featureId: input.featureId, pocketRealmName: input.pocketRealmName, seed: input.seed },
  };
  const delta = createSecretRealmDelta({
    baseRevision: spatial.revision,
    featureId: input.featureId,
    anchorNodeId: input.anchorNodeId,
    pocketRealmName: input.pocketRealmName,
    nowMinutes,
    seed: input.seed,
    endsAtMinutes: nowMinutes + Math.max(1, input.durationMinutes),
    reasonFactId: openingFactId,
  });
  const outcome: WorldOutcome = {
    outcomeId: `OUTCOME_SECRET_OPEN_${input.featureId}`,
    baseRevision: worldRevision(world),
    source: 'secret_realm_pressure',
    entityDeltas: [],
    spatialDelta: delta,
    facts: [fact],
  };
  const commit = commitOutcome(world, outcome);
  if (commit.status === 'version_conflict') return { status: 'revision_conflict' };
  if (commit.status !== 'success' && commit.status !== 'already_applied') {
    return { status: 'commit_failed', reason: commit.status === 'validation_failed' ? commit.reason : undefined };
  }
  return { status: 'opened', featureId: input.featureId, fact, commit };
}

export interface SecretRealmEntryPlan {
  featureId: string;
  innerNodeId: string;
  travel: TravelState;
}

/** 玩家、NPC、护送队都使用这一个 PortalLink → TravelState 入口规划。 */
export function planSecretRealmEntry(
  world: Readonly<WorldState>,
  entity: Pick<Character | NpcRecord, 'id'>,
  origin: SpatialAddress,
  featureId: string,
): { ok: true; entry: SecretRealmEntryPlan } | { ok: false; reason: string } {
  const spatial = world.spatialState;
  if (!spatial) return { ok: false, reason: 'spatial_state_missing' };
  const feature = activeSpatialFeature(spatial, featureId, world.elapsedMinutes ?? 0);
  if (!feature || feature.type !== 'secret_realm_entrance') return { ok: false, reason: 'secret_realm_not_active' };
  const innerNodeId = typeof feature.effects.innerNodeId === 'string' ? feature.effects.innerNodeId : undefined;
  if (!innerNodeId || !spatial.nodes[innerNodeId]) return { ok: false, reason: 'inner_node_missing' };
  const planned = planSpatialTravel(spatial, {
    travelId: `portal:${featureId}:${entity.id}:${world.elapsedMinutes ?? 0}`,
    entityId: entity.id,
    origin,
    destination: { nodeId: innerNodeId, occupancy: 'scene' },
    movementMode: 'portal',
    speed: { baseDistancePerDay: 1 },
    nowMinutes: world.elapsedMinutes ?? 0,
  });
  if (!planned.ok) return planned;
  return { ok: true, entry: { featureId, innerNodeId, travel: planned.travel } };
}
