// ============================================================
// 首批动态空间特征构造与生命周期 — Phase 3
// ============================================================

import type { DynamicSpatialFeature, SpatialDelta, SpatialState } from '@taosim/contracts';
import { applySpatialDelta } from './spatial-delta.js';

export interface SecretRealmDeltaInput {
  baseRevision: number;
  featureId: string;
  anchorNodeId: string;
  pocketRealmName: string;
  nowMinutes: number;
  seed: number;
  endsAtMinutes?: number;
  reasonFactId: string;
}

export interface ScopedFeatureDeltaInput {
  baseRevision: number;
  featureId: string;
  nodeIds: string[];
  linkIds: string[];
  nowMinutes: number;
  durationMinutes?: number;
  reasonFactId: string;
  type: 'barrier' | 'disaster_zone';
}

export function createSecretRealmDelta(input: SecretRealmDeltaInput): SpatialDelta {
  const pocketNodeId = `POCKET_${input.featureId}`;
  const innerNodeId = `${pocketNodeId}_INNER`;
  const portalLinkId = `PORTAL_${input.featureId}`;
  const feature: DynamicSpatialFeature = {
    id: input.featureId,
    type: 'secret_realm_entrance',
    lifecycle: 'active',
    scope: { nodeIds: [input.anchorNodeId, pocketNodeId, innerNodeId] },
    createdAtMinutes: input.nowMinutes,
    startsAtMinutes: input.nowMinutes,
    nextTransitionAtMinutes: input.endsAtMinutes,
    endsAtMinutes: input.endsAtMinutes,
    visibility: 'secret',
    effects: { pocketNodeId, innerNodeId, portalLinkId, timeScale: 1 },
    causeFactId: input.reasonFactId,
    seed: input.seed,
  };
  return {
    deltaId: `delta:${input.featureId}:open`,
    baseRevision: input.baseRevision,
    effectiveAtMinutes: input.nowMinutes,
    reasonFactId: input.reasonFactId,
    affectedEntityIds: [],
    operations: [
      {
        type: 'add_node',
        node: {
          id: pocketNodeId,
          name: input.pocketRealmName,
          kind: 'PocketRealm',
          parentId: 'PLANE_TAOSIM',
          coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 },
          status: 'active',
          containsChildren: true,
          createdAtMinutes: input.nowMinutes,
          createdByFactId: input.reasonFactId,
        },
      },
      {
        type: 'add_node',
        node: {
          id: innerNodeId,
          name: `${input.pocketRealmName}·入口场景`,
          kind: 'Scene',
          parentId: pocketNodeId,
          coordinateScale: { unit: 'abstract', unitsPerWorldUnit: 1 },
          status: 'active',
          containsChildren: false,
          createdAtMinutes: input.nowMinutes,
          createdByFactId: input.reasonFactId,
        },
      },
      {
        type: 'add_link',
        link: {
          id: portalLinkId,
          fromNodeId: input.anchorNodeId,
          toNodeId: innerNodeId,
          kind: 'portal',
          distance: 1,
          bidirectional: true,
          status: 'active',
          enabledFromMinutes: input.nowMinutes,
          disabledAtMinutes: input.endsAtMinutes,
          createdByFactId: input.reasonFactId,
        },
      },
      { type: 'add_feature', feature },
    ],
  };
}

export function createScopedFeatureDelta(input: ScopedFeatureDeltaInput): SpatialDelta {
  const blockedLinkIds = input.linkIds.join(',');
  const endsAtMinutes = input.durationMinutes === undefined
    ? undefined
    : input.nowMinutes + input.durationMinutes;
  const feature: DynamicSpatialFeature = {
    id: input.featureId,
    type: input.type,
    lifecycle: 'active',
    scope: { nodeIds: [...input.nodeIds] },
    createdAtMinutes: input.nowMinutes,
    startsAtMinutes: input.nowMinutes,
    nextTransitionAtMinutes: endsAtMinutes,
    endsAtMinutes,
    visibility: input.type === 'barrier' ? 'local' : 'regional',
    effects: { blockedLinkIds, movementBlocked: true },
    causeFactId: input.reasonFactId,
  };
  return {
    deltaId: `delta:${input.featureId}:active`,
    baseRevision: input.baseRevision,
    effectiveAtMinutes: input.nowMinutes,
    reasonFactId: input.reasonFactId,
    affectedEntityIds: [],
    operations: [
      ...input.linkIds.map((linkId) => ({ type: 'patch_link' as const, linkId, patch: { status: 'blocked' as const, changedByFactId: input.reasonFactId } })),
      { type: 'add_feature', feature },
    ],
  };
}

/** 根据到期时间生成关闭/恢复差量；不直接修改当前状态。 */
export function createFeatureTransitionDelta(
  state: SpatialState,
  featureId: string,
  atMinutes: number,
  reasonFactId: string,
): SpatialDelta | null {
  const feature = state.features[featureId];
  if (!feature || feature.nextTransitionAtMinutes === undefined || atMinutes < feature.nextTransitionAtMinutes) return null;
  if (feature.lifecycle === 'closed' || feature.lifecycle === 'archived' || feature.lifecycle === 'ruined') return null;

  const operations: SpatialDelta['operations'] = [
    {
      type: 'patch_feature', featureId,
      patch: {
        lifecycle: 'closed',
        nextTransitionAtMinutes: undefined,
        endFactId: reasonFactId,
        effects: { ...feature.effects, residue: feature.type === 'secret_realm_entrance' ? 'terrain_scar' : 'recovered_route' },
      },
    },
  ];
  if (feature.type === 'secret_realm_entrance') {
    const portalLinkId = feature.effects.portalLinkId;
    if (typeof portalLinkId === 'string' && state.links[portalLinkId]) {
      operations.push({ type: 'archive_link', linkId: portalLinkId });
    }
    for (const nodeId of [feature.effects.innerNodeId, feature.effects.pocketNodeId]) {
      if (typeof nodeId === 'string' && state.nodes[nodeId]?.status !== 'archived') {
        operations.push({ type: 'archive_node', nodeId, archivedAtMinutes: atMinutes });
      }
    }
  } else {
    const blockedLinkIds = typeof feature.effects.blockedLinkIds === 'string'
      ? feature.effects.blockedLinkIds.split(',').filter(Boolean)
      : [];
    for (const linkId of blockedLinkIds) {
      const link = state.links[linkId];
      const stillBlocked = Object.values(state.features).some((other) => {
        if (other.id === featureId || other.lifecycle === 'closed' || other.lifecycle === 'archived' || other.lifecycle === 'ruined') return false;
        if (other.startsAtMinutes > atMinutes || (other.endsAtMinutes !== undefined && other.endsAtMinutes <= atMinutes)) return false;
        return other.type === 'barrier' || other.type === 'disaster_zone'
          ? typeof other.effects.blockedLinkIds === 'string'
            && other.effects.blockedLinkIds.split(',').includes(linkId)
          : false;
      });
      if (link && link.status === 'blocked') {
        operations.push({ type: 'patch_link', linkId, patch: { status: stillBlocked ? 'blocked' : 'active', changedByFactId: reasonFactId } });
      }
    }
  }
  return {
    deltaId: `delta:${featureId}:transition:${atMinutes}`,
    baseRevision: state.revision,
    effectiveAtMinutes: atMinutes,
    reasonFactId,
    affectedEntityIds: [],
    operations,
  };
}

/** 便于调用方以单一函数应用已构造的差量。 */
export function applyFeatureDelta(state: SpatialState, delta: SpatialDelta, atMinutes: number) {
  return applySpatialDelta(state, delta, atMinutes);
}
