import type {
  BrainEntityRef,
  BrainState,
  NpcRecord,
  WorldState,
} from '@taosim/contracts';
import { NPC_BRAIN_SCHEMA_VERSION } from '@taosim/contracts';

export type BrainInvariantSeverity = 'error' | 'warning';

export interface BrainInvariantIssue {
  code:
    | 'MISSING_BRAIN'
    | 'BRAIN_SCHEMA_VERSION_UNSUPPORTED'
    | 'BRAIN_PROFILE_SOURCE_MISMATCH'
    | 'DANGLING_NPC_REF'
    | 'DANGLING_LOCATION'
    | 'DANGLING_ASSET_REF'
    | 'DANGLING_FACT_REF'
    | 'BELIEF_CONFIDENCE_OUT_OF_RANGE'
    | 'EMOTION_OUT_OF_RANGE'
    | 'PLAN_GOAL_MISMATCH'
    | 'PLAN_STEP_OUT_OF_RANGE'
    | 'ACTION_PLAN_MISMATCH'
    | 'DANGLING_RESERVATION'
    | 'RESERVATION_OWNER_MISMATCH'
    | 'ASSET_LISTING_DANGLING_ASSET'
    | 'ASSET_LISTING_OWNER_MISMATCH'
    | 'ASSET_LISTING_INVALID_PRICE'
    | 'DANGLING_CONDITION_OWNER'
    | 'CONDITION_OUT_OF_RANGE';
  severity: BrainInvariantSeverity;
  npcId?: string;
  path: string;
  message: string;
}

export interface BrainInvariantOptions {
  /** 地图目录不在 WorldState 内，由调用者传入可用场所 id；省略时不检查地点引用。 */
  knownLocationIds?: ReadonlySet<string>;
}

function issue(
  code: BrainInvariantIssue['code'],
  severity: BrainInvariantSeverity,
  path: string,
  message: string,
  npcId?: string,
): BrainInvariantIssue {
  return { code, severity, npcId, path, message };
}

function inspectRef(
  ref: BrainEntityRef,
  path: string,
  npcId: string,
  state: WorldState,
  options: BrainInvariantOptions,
): BrainInvariantIssue[] {
  if (ref.kind === 'npc' && !state.npcs[ref.entityId] && !state.archivedNpcs?.[ref.entityId]) {
    return [issue('DANGLING_NPC_REF', 'error', path, `NPC 引用不存在：${ref.entityId}`, npcId)];
  }
  if (ref.kind === 'location' && options.knownLocationIds && !options.knownLocationIds.has(ref.entityId)) {
    return [issue('DANGLING_LOCATION', 'error', path, `地点引用不存在：${ref.entityId}`, npcId)];
  }
  if (ref.kind === 'asset' && !state.assets?.[ref.entityId]) {
    return [issue('DANGLING_ASSET_REF', 'error', path, `资产引用不存在：${ref.entityId}`, npcId)];
  }
  if (ref.kind === 'fact' && !state.facts?.some((fact) => fact.factId === ref.entityId)) {
    return [issue('DANGLING_FACT_REF', 'error', path, `事实引用不存在：${ref.entityId}`, npcId)];
  }
  return [];
}

function allBrainRefs(brain: BrainState): Array<{ ref: BrainEntityRef; path: string }> {
  const refs: Array<{ ref: BrainEntityRef; path: string }> = [];
  for (const [beliefId, belief] of Object.entries(brain.beliefs)) {
    refs.push({ ref: belief.subject, path: `brain.beliefs.${beliefId}.subject` });
    if (belief.source.sourceEntityId) {
      refs.push({
        ref: { kind: 'npc', entityId: belief.source.sourceEntityId },
        path: `brain.beliefs.${beliefId}.source.sourceEntityId`,
      });
    }
  }
  brain.memories.forEach((memory, memoryIndex) => {
    memory.participantIds.forEach((entityId, participantIndex) => {
      refs.push({
        ref: { kind: 'npc', entityId },
        path: `brain.memories.${memoryIndex}.participantIds.${participantIndex}`,
      });
    });
    if (memory.locationId) {
      refs.push({
        ref: { kind: 'location', entityId: memory.locationId },
        path: `brain.memories.${memoryIndex}.locationId`,
      });
    }
  });
  brain.currentGoal?.targets.forEach((ref, index) => {
    refs.push({ ref, path: `brain.currentGoal.targets.${index}` });
  });
  brain.currentPlan?.steps.forEach((step, stepIndex) => {
    step.targets.forEach((ref, targetIndex) => {
      refs.push({ ref, path: `brain.currentPlan.steps.${stepIndex}.targets.${targetIndex}` });
    });
  });
  brain.currentAction?.targets.forEach((ref, index) => {
    refs.push({ ref, path: `brain.currentAction.targets.${index}` });
  });
  return refs;
}

function inspectNpc(
  npc: NpcRecord,
  state: WorldState,
  options: BrainInvariantOptions,
): BrainInvariantIssue[] {
  const issues: BrainInvariantIssue[] = [];
  if (npc.locationId && options.knownLocationIds && !options.knownLocationIds.has(npc.locationId)) {
    issues.push(issue('DANGLING_LOCATION', 'error', 'locationId', `地点引用不存在：${npc.locationId}`, npc.id));
  }
  const brain = npc.brain;
  if (!brain) {
    issues.push(issue('MISSING_BRAIN', 'error', 'brain', 'NPC 缺少版本化 BrainState', npc.id));
    return issues;
  }
  if (brain.schemaVersion !== NPC_BRAIN_SCHEMA_VERSION) {
    issues.push(issue(
      'BRAIN_SCHEMA_VERSION_UNSUPPORTED',
      'error',
      'brain.schemaVersion',
      `不支持的 Brain 版本：${brain.schemaVersion}`,
      npc.id,
    ));
  }
  if (brain.profile.sourcePersonalityId !== npc.personalityId) {
    issues.push(issue(
      'BRAIN_PROFILE_SOURCE_MISMATCH',
      'warning',
      'brain.profile.sourcePersonalityId',
      'Brain 人格快照的来源与 NPC 权威 personalityId 不一致',
      npc.id,
    ));
  }
  for (const { ref, path } of allBrainRefs(brain)) {
    issues.push(...inspectRef(ref, path, npc.id, state, options));
  }
  for (const [beliefId, belief] of Object.entries(brain.beliefs)) {
    if (belief.confidence < 0 || belief.confidence > 1) {
      issues.push(issue(
        'BELIEF_CONFIDENCE_OUT_OF_RANGE',
        'error',
        `brain.beliefs.${beliefId}.confidence`,
        `信念置信度越界：${belief.confidence}`,
        npc.id,
      ));
    }
  }
  for (const [name, value] of Object.entries(brain.emotion)) {
    if (value < 0 || value > 100) {
      issues.push(issue('EMOTION_OUT_OF_RANGE', 'error', `brain.emotion.${name}`, `情绪值越界：${value}`, npc.id));
    }
  }
  if (brain.currentPlan) {
    if (!brain.currentGoal || brain.currentPlan.goalId !== brain.currentGoal.goalId) {
      issues.push(issue('PLAN_GOAL_MISMATCH', 'error', 'brain.currentPlan.goalId', '当前计划不属于当前目标', npc.id));
    }
    const { currentStepIndex, steps } = brain.currentPlan;
    if (currentStepIndex < 0 || (steps.length > 0 && currentStepIndex >= steps.length)) {
      issues.push(issue('PLAN_STEP_OUT_OF_RANGE', 'error', 'brain.currentPlan.currentStepIndex', '当前计划步骤索引越界', npc.id));
    }
  }
  if (brain.currentAction?.planId && brain.currentAction.planId !== brain.currentPlan?.planId) {
    issues.push(issue('ACTION_PLAN_MISMATCH', 'error', 'brain.currentAction.planId', '当前行动引用的计划不存在', npc.id));
  }
  const reservationRefs = [
    ...(brain.currentPlan?.steps.flatMap((step) => step.reservationIds) ?? []),
    ...(brain.currentAction?.reservationIds ?? []),
  ];
  for (const reservationId of new Set(reservationRefs)) {
    const reservation = state.resourceReservations?.[reservationId];
    if (!reservation) {
      issues.push(issue(
        'DANGLING_RESERVATION', 'error', `brain.reservationIds.${reservationId}`,
        `资源预留引用不存在：${reservationId}`, npc.id,
      ));
    } else if (reservation.ownerId !== npc.id) {
      issues.push(issue(
        'RESERVATION_OWNER_MISMATCH', 'error', `brain.reservationIds.${reservationId}`,
        `资源预留属于 ${reservation.ownerId}，不是当前 NPC`, npc.id,
      ));
    }
  }
  return issues;
}

/** 只读诊断：报告损坏或悬空引用，绝不在检查过程中修补/删除世界数据。 */
export function inspectWorldBrainInvariants(
  state: WorldState,
  options: BrainInvariantOptions = {},
): BrainInvariantIssue[] {
  const issues = Object.values(state.npcs).flatMap((npc) => inspectNpc(npc, state, options));
  for (const [ownerId, condition] of Object.entries(state.conditions ?? {})) {
    if (!state.npcs[ownerId] && !state.archivedNpcs?.[ownerId]) {
      issues.push(issue('DANGLING_CONDITION_OWNER', 'error', `conditions.${ownerId}`, '身体状态所属 NPC 不存在', ownerId));
    }
    if (condition.meridianDamage < 0 || condition.meridianDamage > 100) {
      issues.push(issue(
        'CONDITION_OUT_OF_RANGE',
        'error',
        `conditions.${ownerId}.meridianDamage`,
        `经脉损伤越界：${condition.meridianDamage}`,
        ownerId,
      ));
    }
    condition.poisons.forEach((poison, index) => {
      if (poison.intensity < 0 || poison.intensity > 100) {
        issues.push(issue(
          'CONDITION_OUT_OF_RANGE',
          'error',
          `conditions.${ownerId}.poisons.${index}.intensity`,
          `毒素强度越界：${poison.intensity}`,
          ownerId,
        ));
      }
    });
  }
  for (const [reservationId, reservation] of Object.entries(state.resourceReservations ?? {})) {
    if (!state.npcs[reservation.ownerId] && !state.archivedNpcs?.[reservation.ownerId]) {
      issues.push(issue(
        'RESERVATION_OWNER_MISMATCH', 'error', `resourceReservations.${reservationId}.ownerId`,
        `资源预留所有者不存在：${reservation.ownerId}`, reservation.ownerId,
      ));
    }
  }
  for (const [listingId, listing] of Object.entries(state.assetListings ?? {})) {
    const asset = state.assets?.[listing.assetId];
    if (!asset) {
      issues.push(issue(
        'ASSET_LISTING_DANGLING_ASSET', 'error', `assetListings.${listingId}.assetId`,
        `挂牌引用的资产不存在：${listing.assetId}`,
      ));
    } else if (listing.status === 'active' && asset.ownerId !== listing.sellerId) {
      issues.push(issue(
        'ASSET_LISTING_OWNER_MISMATCH', 'error', `assetListings.${listingId}.sellerId`,
        `挂牌卖家 ${listing.sellerId} 不是资产当前所有者`,
      ));
    }
    if (!Number.isFinite(listing.priceSpiritStones) || listing.priceSpiritStones <= 0) {
      issues.push(issue(
        'ASSET_LISTING_INVALID_PRICE', 'error', `assetListings.${listingId}.priceSpiritStones`,
        `挂牌价格无效：${listing.priceSpiritStones}`,
      ));
    }
  }
  return issues;
}
