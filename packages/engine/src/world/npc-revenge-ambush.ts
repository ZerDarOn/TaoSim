import type {
  BrainActionState,
  BrainBelief,
  BrainEntityRef,
  BrainMemory,
  BrainPlanState,
  BrainTime,
  Fact,
  NamedBattleResolution,
  NpcRecord,
  WorldState,
} from '@taosim/contracts';
import { resolveNpcCapabilityAction } from './npc-mind.js';
import { purchaseNpcAsset } from './npc-asset-purchase.js';
import { tradeNpcInformation } from './npc-information-trade.js';
import { findActionableTargetLocationBelief } from './npc-target-tracking.js';
import { commitNamedNpcBattleSimulation, simulateNamedNpcBattle } from './named-npc-battle.js';
import { completeWorldResourceReservations, reserveWorldResources } from './world-resource-reservation.js';
import {
  assessAmbushEnvironment,
  commitGuardIntervention,
  createAmbushWitnessOutcomeAdditions,
  type LocationLawLevel,
} from './npc-ambush-environment.js';

const MAX_MEMORIES = 32;
const AMBUSH_INITIATIVE_GAUGE = 70;

export type NpcRevengeAmbushStage =
  | 'investigate_target'
  | 'acquire_ambush_asset'
  | 'travel_to_target'
  | 'verify_target_presence'
  | 'execute_ambush';

export type NpcRevengeAmbushFailureReason =
  | 'not_revenge_seeker'
  | 'brain_unavailable'
  | 'node_disabled'
  | 'attacker_recovering'
  | 'active_plan_conflict'
  | 'target_unavailable'
  | 'no_intelligence_source'
  | 'insufficient_intelligence_funds'
  | 'acquired_intelligence_not_retained'
  | 'target_not_at_believed_location'
  | 'resource_unavailable'
  | 'travel_failed'
  | 'guard_intervention'
  | 'environment_commit_failed'
  | 'battle_failed';

export interface NpcRevengeAmbushResult {
  status: 'not_applicable' | 'blocked' | 'progressed' | 'battle_resolved' | 'failed';
  stage?: NpcRevengeAmbushStage;
  attackerId: string;
  targetId?: string;
  claimedAction: boolean;
  reason?: NpcRevengeAmbushFailureReason | string;
  ambushDetected?: boolean;
  witnessIds?: string[];
  guardIds?: string[];
  lawLevel?: LocationLawLevel;
  resolution?: NamedBattleResolution;
}

export interface NpcRevengeAmbushOptions {
  rng: () => number;
  enabled?: boolean;
  /** 生产调度器传入已感知的同场 NPC，避免每个复仇者扫描全世界。 */
  localNpcIds?: readonly string[];
  protectFromDeath?: (npc: NpcRecord) => boolean;
}

function nextMonth(now: BrainTime): BrainTime {
  return now.month === 12 ? { year: now.year + 1, month: 1 } : { year: now.year, month: now.month + 1 };
}

function monthOrdinal(time: BrainTime): number {
  return (time.year - 1) * 12 + time.month;
}

function strongestEnemy(world: Readonly<WorldState>, seeker: Readonly<NpcRecord>): NpcRecord | undefined {
  return Object.entries(seeker.relations)
    .filter(([, relation]) => (relation.type === 'enemy' || relation.type === 'rival') && relation.bond < 0)
    .map(([id, relation]) => ({ npc: world.npcs[id], bond: relation.bond }))
    .filter((entry): entry is { npc: NpcRecord; bond: number } => entry.npc?.soulState === 'Active')
    .sort((a, b) => a.bond - b.bond || a.npc.id.localeCompare(b.npc.id))[0]?.npc;
}

function stillHoldsGrudge(seeker: Readonly<NpcRecord>, targetId: string): boolean {
  const relation = seeker.relations[targetId];
  return !!relation && (relation.type === 'enemy' || relation.type === 'rival') && relation.bond < 0;
}

function targetRef(targetId: string): BrainEntityRef {
  return { kind: 'npc', entityId: targetId };
}

function createPlan(npc: NpcRecord, targetId: string, now: BrainTime): BrainPlanState {
  const goalId = `${npc.id}:brain-goal:seek_revenge:${targetId}:${now.year}:${now.month}`;
  const planId = `${npc.id}:brain-plan:revenge-ambush:${targetId}:${now.year}:${now.month}`;
  const stages: NpcRevengeAmbushStage[] = [
    'investigate_target', 'acquire_ambush_asset', 'travel_to_target',
    'verify_target_presence', 'execute_ambush',
  ];
  npc.brain = {
    ...npc.brain!,
    revision: npc.brain!.revision + 1,
    currentGoal: {
      goalId, kind: 'seek_revenge', targets: [targetRef(targetId)], priority: 85,
      status: 'active', createdAt: { ...now }, motiveIds: ['aspiration:seekRevenge'],
    },
  };
  return {
    planId, goalId, status: 'active', currentStepIndex: 0,
    steps: stages.map((stage, index) => ({
      stepId: `${planId}:step:${index}:${stage}`,
      capabilityId: stage,
      status: 'pending',
      targets: [targetRef(targetId)],
      reservationIds: [],
    })),
    createdAt: { ...now }, updatedAt: { ...now }, revision: 0,
  };
}

function activeRevengePlan(npc: NpcRecord, targetId: string, now: BrainTime): BrainPlanState | undefined {
  const brain = npc.brain;
  if (!brain) return undefined;
  const existing = brain.currentPlan;
  if (existing?.status === 'active') {
    const sameTarget = brain.currentGoal?.kind === 'seek_revenge'
      && brain.currentGoal.targets.some((entry) => entry.kind === 'npc' && entry.entityId === targetId);
    return sameTarget ? existing : undefined;
  }
  const plan = createPlan(npc, targetId, now);
  npc.brain = { ...npc.brain!, currentPlan: plan };
  return plan;
}

function updateCurrentStep(
  npc: NpcRecord,
  now: BrainTime,
  status: 'succeeded' | 'failed' | 'skipped',
  options: { reason?: string; targets?: BrainEntityRef[]; reservationIds?: string[]; advance?: boolean } = {},
): void {
  const brain = npc.brain!;
  const plan = brain.currentPlan!;
  const index = plan.currentStepIndex;
  const nextIndex = options.advance === false ? index : Math.min(plan.steps.length - 1, index + 1);
  npc.brain = {
    ...brain,
    revision: brain.revision + 1,
    currentPlan: {
      ...plan,
      currentStepIndex: nextIndex,
      updatedAt: { ...now },
      revision: plan.revision + 1,
      steps: plan.steps.map((step, stepIndex) => stepIndex === index ? {
        ...step,
        status,
        targets: options.targets ?? step.targets,
        reservationIds: options.reservationIds ?? step.reservationIds,
        startedAt: step.startedAt ?? { ...now },
        completedAt: { ...now },
        failureReason: options.reason,
      } : step),
    },
  };
}

function recordAction(
  npc: NpcRecord,
  capabilityId: NpcRevengeAmbushStage,
  now: BrainTime,
  status: BrainActionState['status'],
  targets: BrainEntityRef[],
  reservationIds: string[],
  failureReason?: string,
): void {
  const brain = npc.brain!;
  npc.brain = {
    ...brain,
    revision: brain.revision + 1,
    currentAction: {
      actionId: `${npc.id}:brain-action:${capabilityId}:${now.year}:${now.month}`,
      planId: brain.currentPlan?.planId,
      capabilityId,
      status,
      targets,
      reservationIds,
      progress: status === 'succeeded' || status === 'failed' ? 1 : 0,
      plannedAt: { ...now }, startedAt: { ...now }, completedAt: { ...now }, failureReason,
    },
    lastEvaluatedAt: { ...now },
  };
}

function reserveMainAction(world: WorldState, npc: NpcRecord, planId: string, stage: string, now: BrainTime): string | undefined {
  const reservationId = `${planId}:${stage}:action:${now.year}:${now.month}`;
  const reserved = reserveWorldResources(world, [{
    reservationId, ownerId: npc.id, planId,
    resource: { kind: 'action_slot', resourceId: `${npc.id}:${now.year}:${now.month}`, amount: 1 },
    expiresAt: nextMonth(now),
  }], now);
  return reserved.status === 'failed' ? undefined : reservationId;
}

function addFact(world: WorldState, fact: Fact): void {
  world.facts ??= [];
  if (!world.facts.some((entry) => entry.factId === fact.factId)) world.facts.push(fact);
}

function activeSellerBelief(
  world: Readonly<WorldState>,
  buyer: Readonly<NpcRecord>,
  targetId: string,
  now: BrainTime,
  localNpcIds?: readonly string[],
): { seller: NpcRecord; belief: BrainBelief } | undefined {
  const candidates = localNpcIds
    ? localNpcIds.map((id) => world.npcs[id]).filter((npc): npc is NpcRecord => !!npc)
    : Object.values(world.npcs);
  return candidates
    .filter((seller) => seller.id !== buyer.id && seller.soulState === 'Active'
      && !!buyer.locationId && seller.locationId === buyer.locationId && !!seller.brain)
    .map((seller) => ({ seller, belief: findActionableTargetLocationBelief(seller.brain!, targetId, now) }))
    .filter((entry): entry is { seller: NpcRecord; belief: BrainBelief } => !!entry.belief)
    .sort((a, b) => b.belief.confidence - a.belief.confidence || a.seller.id.localeCompare(b.seller.id))[0];
}

function preparationValue(world: Readonly<WorldState>, ownerId: string): number {
  return Object.values(world.assets ?? {})
    .filter((asset) => asset.ownerId === ownerId)
    .reduce((sum, asset) => sum + (asset.combatBonuses.attack ?? 0)
      + (asset.combatBonuses.defense ?? 0) + (asset.combatBonuses.critRate ?? 0), 0);
}

function suitableListing(world: Readonly<WorldState>, buyer: Readonly<NpcRecord>): string | undefined {
  const stones = buyer.spiritStones ?? 0;
  return Object.values(world.assetListings ?? {})
    .filter((listing) => listing.status === 'active' && listing.venueId === buyer.locationId
      && listing.sellerId !== buyer.id && listing.priceSpiritStones <= stones
      && world.npcs[listing.sellerId]?.soulState === 'Active'
      && world.npcs[listing.sellerId]?.locationId === listing.venueId)
    .map((listing) => {
      const asset = world.assets?.[listing.assetId];
      const value = asset
        ? (asset.combatBonuses.attack ?? 0) + (asset.combatBonuses.defense ?? 0) + (asset.combatBonuses.critRate ?? 0)
        : 0;
      return { listing, value };
    })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || a.listing.priceSpiritStones - b.listing.priceSpiritStones
      || a.listing.listingId.localeCompare(b.listing.listingId))[0]?.listing.listingId;
}

function refuteLocationBeliefs(npc: NpcRecord, targetId: string): void {
  const brain = npc.brain!;
  npc.brain = {
    ...brain,
    revision: brain.revision + 1,
    beliefs: Object.fromEntries(Object.entries(brain.beliefs).map(([id, belief]) => [id,
      belief.topic === 'location' && belief.subject.kind === 'npc' && belief.subject.entityId === targetId
        ? { ...belief, status: 'refuted' as const }
        : belief,
    ])),
  };
}

function resetAfterStaleIntelligence(npc: NpcRecord, targetId: string, now: BrainTime, locationId?: string): void {
  refuteLocationBeliefs(npc, targetId);
  const brain = npc.brain!;
  const memory: BrainMemory = {
    memoryId: `${npc.id}:memory:revenge-tracking-failed:${targetId}:${now.year}:${now.month}`,
    kind: 'failure', at: { ...now }, participantIds: [npc.id, targetId], locationId,
    summary: '依照掌握的行踪追查仇敌，但情报已经过时。', valence: -30, salience: 60,
  };
  const plan = brain.currentPlan!;
  npc.brain = {
    ...brain,
    revision: brain.revision + 1,
    memories: [...brain.memories, memory].slice(-MAX_MEMORIES),
    currentPlan: {
      ...plan, currentStepIndex: 0, status: 'active', updatedAt: { ...now }, revision: plan.revision + 1,
      steps: plan.steps.map((step, index) => ({
        ...step,
        status: index === 0 ? 'pending' : index === 1 && step.status === 'succeeded' ? 'succeeded' : 'pending',
        reservationIds: [], startedAt: undefined, completedAt: undefined,
        failureReason: index === 0 ? 'previous_intelligence_refuted' : undefined,
      })),
    },
  };
}

function resolveDetection(attacker: Readonly<NpcRecord>, defender: Readonly<NpcRecord>, preparedValue: number, rng: () => number): boolean {
  const concealment = attacker.attributes.agility + attacker.attributes.perception * 0.5
    + attacker.brain!.profile.behavioralBiases.patience * 0.2 + Math.min(20, preparedValue);
  const vigilance = defender.attributes.perception + defender.attributes.agility * 0.35
    + defender.brain!.profile.behavioralBiases.riskTolerance * 0.2;
  const detectionChance = Math.max(0.1, Math.min(0.9, 0.5 + (vigilance - concealment) / 120));
  return rng() < detectionChance;
}

/**
 * NB5 第一条完整目标链：所有步骤都只提交自己的差量，删掉编排器也不会使交易、追踪或战斗能力失效。
 */
export function advanceNpcRevengeAmbush(
  world: WorldState,
  attackerId: string,
  now: BrainTime,
  options: NpcRevengeAmbushOptions,
): NpcRevengeAmbushResult {
  const attacker = world.npcs[attackerId];
  if (!attacker || attacker.soulState !== 'Active' || attacker.aspiration !== 'seekRevenge') {
    return { status: 'not_applicable', attackerId, claimedAction: false, reason: 'not_revenge_seeker' };
  }
  if (!attacker.brain) return { status: 'failed', attackerId, claimedAction: false, reason: 'brain_unavailable' };
  if (options.enabled === false) {
    return { status: 'not_applicable', attackerId, claimedAction: false, reason: 'node_disabled' };
  }
  const recoveringUntil = world.conditions?.[attacker.id]?.recoveringUntil;
  if (recoveringUntil && monthOrdinal(recoveringUntil) > monthOrdinal(now)) {
    return { status: 'blocked', attackerId, claimedAction: false, reason: 'attacker_recovering' };
  }
  const plannedTargetId = attacker.brain.currentGoal?.kind === 'seek_revenge'
    ? attacker.brain.currentGoal.targets.find((entry) => entry.kind === 'npc')?.entityId
    : undefined;
  const target = (plannedTargetId && stillHoldsGrudge(attacker, plannedTargetId)
    && world.npcs[plannedTargetId]?.soulState === 'Active')
    ? world.npcs[plannedTargetId]!
    : strongestEnemy(world, attacker);
  if (!target) {
    attacker.aspiration = 'seekDao';
    if (attacker.brain.currentGoal?.kind === 'seek_revenge') {
      attacker.brain = {
        ...attacker.brain,
        revision: attacker.brain.revision + 1,
        currentGoal: {
          ...attacker.brain.currentGoal, status: 'abandoned', completedAt: { ...now }, failureReason: 'target_unavailable',
        },
        currentPlan: attacker.brain.currentPlan?.status === 'active'
          ? { ...attacker.brain.currentPlan, status: 'cancelled', updatedAt: { ...now }, revision: attacker.brain.currentPlan.revision + 1 }
          : attacker.brain.currentPlan,
      };
    }
    return { status: 'blocked', attackerId, claimedAction: false, reason: 'target_unavailable' };
  }
  if (attacker.brain.currentPlan?.status === 'active'
    && attacker.brain.currentGoal?.kind !== 'seek_revenge') {
    return { status: 'blocked', attackerId, targetId: target.id, claimedAction: false, reason: 'active_plan_conflict' };
  }
  if (attacker.brain.currentPlan?.status === 'active'
    && attacker.brain.currentGoal?.kind === 'seek_revenge'
    && plannedTargetId !== target.id) {
    attacker.brain = {
      ...attacker.brain,
      revision: attacker.brain.revision + 1,
      currentGoal: attacker.brain.currentGoal && {
        ...attacker.brain.currentGoal, status: 'abandoned', completedAt: { ...now }, failureReason: 'target_changed',
      },
      currentPlan: {
        ...attacker.brain.currentPlan, status: 'cancelled', updatedAt: { ...now }, revision: attacker.brain.currentPlan.revision + 1,
      },
    };
  }
  const plan = activeRevengePlan(attacker, target.id, now);
  if (!plan) return { status: 'blocked', attackerId, targetId: target.id, claimedAction: false, reason: 'active_plan_conflict' };

  for (let transition = 0; transition < 5; transition++) {
    const livePlan = attacker.brain!.currentPlan!;
    const step = livePlan.steps[livePlan.currentStepIndex]!;
    const stage = step.capabilityId as NpcRevengeAmbushStage;

    if (stage === 'investigate_target') {
      const known = findActionableTargetLocationBelief(attacker.brain!, target.id, now);
      if (known) {
        updateCurrentStep(attacker, now, 'succeeded', {
          targets: [targetRef(target.id), { kind: 'location', entityId: String(known.value) }],
        });
        continue;
      }
      const source = activeSellerBelief(world, attacker, target.id, now, options.localNpcIds);
      if (!source) return { status: 'blocked', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'no_intelligence_source' };
      const price = Math.max(5, Math.min(30, Math.round(10 + source.belief.confidence * 20)));
      if ((attacker.spiritStones ?? 0) < price) {
        return { status: 'blocked', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'insufficient_intelligence_funds' };
      }
      const transactionId = `${livePlan.planId}:intelligence:${now.year}:${now.month}`;
      const traded = tradeNpcInformation(world, {
        transactionId, buyerId: attacker.id, sellerId: source.seller.id,
        beliefId: source.belief.beliefId, factId: source.belief.source.factId,
        priceSpiritStones: price,
      }, now);
      if (traded.status === 'failed') {
        return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: false, reason: traded.reason };
      }
      const acquired = findActionableTargetLocationBelief(attacker.brain!, target.id, now);
      if (!acquired) {
        updateCurrentStep(attacker, now, 'failed', {
          reason: 'acquired_intelligence_not_retained', reservationIds: traded.reservationIds, advance: false,
        });
        recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], traded.reservationIds, 'acquired_intelligence_not_retained');
        return {
          status: 'failed', stage, attackerId, targetId: target.id, claimedAction: true,
          reason: 'acquired_intelligence_not_retained',
        };
      }
      updateCurrentStep(attacker, now, 'succeeded', {
        targets: [targetRef(target.id), { kind: 'npc', entityId: source.seller.id }, { kind: 'location', entityId: String(acquired.value) }],
        reservationIds: traded.reservationIds,
      });
      recordAction(attacker, stage, now, 'succeeded', [targetRef(target.id)], traded.reservationIds);
      return { status: 'progressed', stage, attackerId, targetId: target.id, claimedAction: true };
    }

    if (stage === 'acquire_ambush_asset') {
      if (preparationValue(world, attacker.id) > 0) {
        updateCurrentStep(attacker, now, 'skipped', { reason: 'already_prepared' });
        continue;
      }
      const listingId = suitableListing(world, attacker);
      if (!listingId) {
        updateCurrentStep(attacker, now, 'skipped', { reason: 'no_suitable_asset' });
        continue;
      }
      const transactionId = `${livePlan.planId}:preparation:${now.year}:${now.month}`;
      const purchased = purchaseNpcAsset(world, { transactionId, buyerId: attacker.id, listingId }, now);
      if (purchased.status === 'failed') {
        return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: false, reason: purchased.reason };
      }
      const assetId = world.assetListings?.[listingId]?.assetId;
      updateCurrentStep(attacker, now, 'succeeded', {
        targets: assetId ? [targetRef(target.id), { kind: 'asset', entityId: assetId }] : [targetRef(target.id)],
        reservationIds: purchased.reservationIds,
      });
      recordAction(attacker, stage, now, 'succeeded', [targetRef(target.id)], purchased.reservationIds);
      return { status: 'progressed', stage, attackerId, targetId: target.id, claimedAction: true };
    }

    const belief = findActionableTargetLocationBelief(attacker.brain!, target.id, now);
    if (!belief) {
      resetAfterStaleIntelligence(attacker, target.id, now, attacker.locationId);
      return { status: 'blocked', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'no_intelligence_source' };
    }
    const believedLocationId = String(belief.value);

    if (stage === 'travel_to_target') {
      if (attacker.locationId === believedLocationId) {
        updateCurrentStep(attacker, now, 'succeeded', { targets: [targetRef(target.id), { kind: 'location', entityId: believedLocationId }] });
        continue;
      }
      const reservationId = reserveMainAction(world, attacker, livePlan.planId, stage, now);
      if (!reservationId) return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'resource_unavailable' };
      const resolution = resolveNpcCapabilityAction(attacker, 'wander', 0, now, { targetLocationId: believedLocationId, rng: options.rng });
      if (!resolution?.completed || resolution.success === false) {
        completeWorldResourceReservations(world, [reservationId], 'released', now, 'travel_failed');
        recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], [reservationId], 'travel_failed');
        return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: true, reason: 'travel_failed' };
      }
      completeWorldResourceReservations(world, [reservationId], 'consumed', now);
      updateCurrentStep(attacker, now, 'succeeded', {
        targets: [targetRef(target.id), { kind: 'location', entityId: believedLocationId }], reservationIds: [reservationId],
      });
      recordAction(attacker, stage, now, 'succeeded', [targetRef(target.id)], [reservationId]);
      addFact(world, {
        factId: `fact:${livePlan.planId}:travel:${now.year}:${now.month}`, type: 'discovery', at: { ...now },
        locationId: believedLocationId, participants: [{ entityId: attacker.id, role: 'tracker' }],
        title: `${attacker.name}追查仇敌行踪`, description: `${attacker.name}依据掌握的情报赶往目标地点。`,
        visibility: 'secret', metadata: { targetId: target.id },
      });
      return { status: 'progressed', stage, attackerId, targetId: target.id, claimedAction: true };
    }

    if (stage === 'verify_target_presence') {
      if (attacker.locationId !== believedLocationId) {
        resetAfterStaleIntelligence(attacker, target.id, now, attacker.locationId);
        return { status: 'blocked', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'target_not_at_believed_location' };
      }
      const reservationId = reserveMainAction(world, attacker, livePlan.planId, stage, now);
      if (!reservationId) return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'resource_unavailable' };
      if (target.locationId !== believedLocationId) {
        completeWorldResourceReservations(world, [reservationId], 'released', now, 'target_not_at_believed_location');
        resetAfterStaleIntelligence(attacker, target.id, now, believedLocationId);
        recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], [reservationId], 'target_not_at_believed_location');
        return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: true, reason: 'target_not_at_believed_location' };
      }
      completeWorldResourceReservations(world, [reservationId], 'consumed', now);
      updateCurrentStep(attacker, now, 'succeeded', {
        targets: [targetRef(target.id), { kind: 'location', entityId: believedLocationId }], reservationIds: [reservationId],
      });
      recordAction(attacker, stage, now, 'succeeded', [targetRef(target.id)], [reservationId]);
      return { status: 'progressed', stage, attackerId, targetId: target.id, claimedAction: true };
    }

    if (target.locationId !== attacker.locationId || !attacker.locationId) {
      resetAfterStaleIntelligence(attacker, target.id, now, attacker.locationId);
      return { status: 'blocked', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'target_not_at_believed_location' };
    }
    const reservationId = reserveMainAction(world, attacker, livePlan.planId, stage, now);
    if (!reservationId) return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: false, reason: 'resource_unavailable' };
    const environment = assessAmbushEnvironment(world, attacker.id, target.id, attacker.locationId);
    const encounterId = `${livePlan.planId}:battle:${now.year}:${now.month}`;
    if (environment.intervention === 'guard_blocked') {
      const intervention = commitGuardIntervention(world, attacker.id, target.id, now, encounterId, environment);
      if (intervention.status === 'validation_failed' || intervention.status === 'version_conflict') {
        completeWorldResourceReservations(world, [reservationId], 'released', now, 'environment_commit_failed');
        recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], [reservationId], 'environment_commit_failed');
        return {
          status: 'failed', stage, attackerId, targetId: target.id, claimedAction: true,
          reason: 'environment_commit_failed', witnessIds: environment.witnessIds,
          guardIds: environment.guardIds, lawLevel: environment.lawLevel,
        };
      }
      completeWorldResourceReservations(world, [reservationId], 'consumed', now);
      updateCurrentStep(attacker, now, 'failed', {
        reason: 'guard_intervention', targets: [targetRef(target.id)], reservationIds: [reservationId], advance: false,
      });
      recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], [reservationId], 'guard_intervention');
      return {
        status: 'blocked', stage, attackerId, targetId: target.id, claimedAction: true,
        reason: 'guard_intervention', witnessIds: environment.witnessIds,
        guardIds: environment.guardIds, lawLevel: environment.lawLevel,
      };
    }
    const preparedValue = preparationValue(world, attacker.id);
    const ambushDetected = resolveDetection(attacker, target, preparedValue, options.rng);
    const request = {
      encounterId, attackerId: attacker.id, defenderId: target.id, kind: 'deadly' as const,
      locationId: attacker.locationId, seed: Math.floor(options.rng() * 2_147_483_647),
      allowFlee: true, allowSurrender: false, lootPolicy: 'all_on_elimination' as const,
      relationPolicy: 'hostile' as const, approach: 'ambush' as const, ambushDetected,
      attackerInitialGauge: ambushDetected ? 0 : AMBUSH_INITIATIVE_GAUGE,
    };
    const simulated = simulateNamedNpcBattle(world, request);
    if (simulated.status === 'failed') {
      completeWorldResourceReservations(world, [reservationId], 'released', now, simulated.reason);
      recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], [reservationId], simulated.reason);
      return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: true, reason: 'battle_failed' };
    }
    const protectedEntityIds = new Set<string>();
    for (const participant of simulated.simulation.resolution.participants) {
      if (participant.result !== 'down') continue;
      const record = world.npcs[participant.entityId];
      if (record && options.protectFromDeath?.(record)) protectedEntityIds.add(record.id);
    }
    const witnessAdditions = createAmbushWitnessOutcomeAdditions(
      world, attacker.id, target.id, now, encounterId, environment,
    );
    const committed = commitNamedNpcBattleSimulation(world, request, simulated.simulation, {
      protectedEntityIds,
      additionalFacts: witnessAdditions ? [witnessAdditions.fact] : undefined,
      additionalEntityDeltas: witnessAdditions?.entityDeltas,
    });
    if (committed.status === 'failed') {
      completeWorldResourceReservations(world, [reservationId], 'released', now, committed.reason);
      recordAction(attacker, stage, now, 'failed', [targetRef(target.id)], [reservationId], committed.reason);
      return { status: 'failed', stage, attackerId, targetId: target.id, claimedAction: true, reason: 'battle_failed' };
    }
    completeWorldResourceReservations(world, [reservationId], 'consumed', now);
    updateCurrentStep(attacker, now, 'succeeded', { targets: [targetRef(target.id)], reservationIds: [reservationId], advance: false });
    const brain = attacker.brain!;
    const targetStillActive = world.npcs[target.id]?.soulState === 'Active';
    attacker.brain = {
      ...brain,
      revision: brain.revision + 1,
      currentGoal: brain.currentGoal && {
        ...brain.currentGoal,
        status: targetStillActive ? 'failed' : 'completed', completedAt: { ...now },
        failureReason: targetStillActive ? 'target_survived' : undefined,
      },
      currentPlan: brain.currentPlan && { ...brain.currentPlan, status: 'completed', updatedAt: { ...now }, revision: brain.currentPlan.revision + 1 },
    };
    recordAction(attacker, stage, now, 'succeeded', [targetRef(target.id)], [reservationId]);
    return {
      status: 'battle_resolved', stage, attackerId, targetId: target.id, claimedAction: true,
      ambushDetected, witnessIds: environment.witnessIds, guardIds: environment.guardIds,
      lawLevel: environment.lawLevel, resolution: committed.resolution,
    };
  }

  return { status: 'blocked', attackerId, targetId: target.id, claimedAction: false, reason: 'active_plan_conflict' };
}
