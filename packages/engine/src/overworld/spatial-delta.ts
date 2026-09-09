// ============================================================
// 动态空间差量运行时 — Phase 3
//
// 差量先在副本上完整应用并校验，成功后一次发布；失败不会留下半个
// 节点、连接或特征。deltas 是可回放的历史记录，不是 UI 缓存。
// ============================================================

import type {
  DynamicSpatialFeature,
  SpatialDelta,
  SpatialDeltaOperation,
  SpatialLink,
  SpatialNode,
  SpatialState,
} from '@taosim/contracts';
import { validateSpatialState } from '@taosim/contracts';

export type SpatialDeltaApplyResult =
  | { ok: true; state: SpatialState }
  | { ok: false; reason: 'revision_conflict' | 'not_due' | 'duplicate_id' | 'missing_target' | 'invalid_state' };

/** 原子应用一条空间差量；输入状态不会被修改。 */
export function applySpatialDelta(
  state: SpatialState,
  delta: SpatialDelta,
  atMinutes = delta.effectiveAtMinutes,
): SpatialDeltaApplyResult {
  if (delta.baseRevision !== state.revision) return { ok: false, reason: 'revision_conflict' };
  if (delta.effectiveAtMinutes > atMinutes) return { ok: false, reason: 'not_due' };

  const next = structuredClone(state);
  for (const operation of delta.operations) {
    const result = applyOperation(next, operation);
    if (!result.ok) return result;
  }
  const violations = validateSpatialState(next);
  if (violations.length > 0) return { ok: false, reason: 'invalid_state' };

  next.revision += 1;
  next.deltas.push(structuredClone(delta));
  return { ok: true, state: next };
}

function applyOperation(
  state: SpatialState,
  operation: SpatialDeltaOperation,
): { ok: true } | { ok: false; reason: 'duplicate_id' | 'missing_target' } {
  switch (operation.type) {
    case 'add_node':
      if (state.nodes[operation.node.id]) return { ok: false, reason: 'duplicate_id' };
      state.nodes[operation.node.id] = structuredClone(operation.node);
      return { ok: true };
    case 'patch_node': {
      const node = state.nodes[operation.nodeId];
      if (!node) return { ok: false, reason: 'missing_target' };
      state.nodes[operation.nodeId] = { ...node, ...structuredClone(operation.patch) };
      return { ok: true };
    }
    case 'add_link':
      if (state.links[operation.link.id]) return { ok: false, reason: 'duplicate_id' };
      state.links[operation.link.id] = structuredClone(operation.link);
      return { ok: true };
    case 'patch_link': {
      const link = state.links[operation.linkId];
      if (!link) return { ok: false, reason: 'missing_target' };
      state.links[operation.linkId] = { ...link, ...structuredClone(operation.patch) };
      return { ok: true };
    }
    case 'add_feature':
      if (state.features[operation.feature.id]) return { ok: false, reason: 'duplicate_id' };
      state.features[operation.feature.id] = structuredClone(operation.feature);
      return { ok: true };
    case 'patch_feature': {
      const feature = state.features[operation.featureId];
      if (!feature) return { ok: false, reason: 'missing_target' };
      state.features[operation.featureId] = { ...feature, ...structuredClone(operation.patch) };
      return { ok: true };
    }
    case 'archive_node': {
      const node = state.nodes[operation.nodeId];
      if (!node) return { ok: false, reason: 'missing_target' };
      state.nodes[operation.nodeId] = {
        ...node,
        status: 'archived',
        archivedAtMinutes: operation.archivedAtMinutes,
      };
      return { ok: true };
    }
    case 'archive_link': {
      const link = state.links[operation.linkId];
      if (!link) return { ok: false, reason: 'missing_target' };
      state.links[operation.linkId] = { ...link, status: 'archived' };
      return { ok: true };
    }
  }
}

export function activeSpatialFeature(
  state: SpatialState,
  featureId: string,
  atMinutes: number,
): DynamicSpatialFeature | undefined {
  const feature = state.features[featureId];
  if (!feature || atMinutes < feature.startsAtMinutes || feature.lifecycle === 'archived') return undefined;
  if (feature.endsAtMinutes !== undefined && atMinutes >= feature.endsAtMinutes) return undefined;
  return feature;
}

// 保证运行时结构导出的类型在编译器中保持可见（并避免未来差量操作被默默放宽）。
export type { DynamicSpatialFeature, SpatialDelta, SpatialLink, SpatialNode };
