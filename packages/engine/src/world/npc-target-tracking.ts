import type {
  BrainBelief,
  BrainGoalState,
  BrainMemory,
  BrainPlanState,
  BrainState,
  BrainTime,
  NpcRecord,
  WorldState,
} from '@taosim/contracts';
import {
  completeWorldResourceReservations,
  reserveWorldResources,
  type ReservationFailureReason,
} from './world-resource-reservation.js';

const MAX_MEMORIES = 32;

export type NpcTargetTrackingFailureReason =
  | ReservationFailureReason
  | 'tracker_or_target_not_found'
  | 'tracker_or_target_inactive'
  | 'no_actionable_location_belief'
  | 'active_plan_conflict'
  | 'tracking_plan_not_active'
  | 'not_at_search_location'
  | 'target_not_at_believed_location';

export type PrepareNpcTargetTrackingResult =
  | { status: 'prepared'; brain: BrainState; believedLocationId: string; reservationIds: string[] }
  | { status: 'failed'; reason: NpcTargetTrackingFailureReason };

export type ResolveNpcTargetTrackingResult =
  | { status: 'found'; brain: BrainState; targetId: string; locationId: string }
  | { status: 'failed'; reason: NpcTargetTrackingFailureReason; brain?: BrainState };

function ordinal(time: BrainTime): number {
  return (time.year - 1) * 12 + time.month;
}

function nextMonth(now: BrainTime): BrainTime {
  return now.month === 12 ? { year: now.year + 1, month: 1 } : { year: now.year, month: now.month + 1 };
}

function activeLocationBelief(brain: BrainState, targetId: string, now: BrainTime): BrainBelief | undefined {
  return Object.values(brain.beliefs)
    .filter((belief) => belief.topic === 'location'
      && belief.subject.kind === 'npc'
      && belief.subject.entityId === targetId
      && belief.status === 'active'
      && typeof belief.value === 'string'
      && (!belief.expiresAt || ordinal(belief.expiresAt) > ordinal(now)))
    .sort((a, b) => b.confidence - a.confidence || ordinal(b.observedAt) - ordinal(a.observedAt))[0];
}

function trackingGoal(
  tracker: NpcRecord,
  brain: BrainState,
  targetId: string,
  now: BrainTime,
): BrainGoalState {
  if (brain.currentGoal?.kind === 'track_target'
    && brain.currentGoal.status === 'active'
    && brain.currentGoal.targets.some((target) => target.kind === 'npc' && target.entityId === targetId)) {
    return { ...brain.currentGoal, targets: brain.currentGoal.targets.map((target) => ({ ...target })) };
  }
  return {
    goalId: `${tracker.id}:brain-goal:track:${targetId}:${now.year}:${now.month}`,
    kind: 'track_target', targets: [{ kind: 'npc', entityId: targetId }], priority: 60,
    status: 'active', createdAt: { ...now }, motiveIds: [],
  };
}

/** 只按 NPC 自己的地点信念制定追踪计划，不读取目标的真实位置。 */
export function prepareNpcTargetTracking(
  world: WorldState,
  trackerId: string,
  targetId: string,
  now: BrainTime,
): PrepareNpcTargetTrackingResult {
  const tracker = world.npcs[trackerId];
  const target = world.npcs[targetId];
  if (!tracker || !target || !tracker.brain) return { status: 'failed', reason: 'tracker_or_target_not_found' };
  if (tracker.soulState !== 'Active' || target.soulState !== 'Active') {
    return { status: 'failed', reason: 'tracker_or_target_inactive' };
  }
  const belief = activeLocationBelief(tracker.brain, targetId, now);
  if (!belief) return { status: 'failed', reason: 'no_actionable_location_belief' };
  const believedLocationId = belief.value as string;
  const planId = `${tracker.id}:brain-plan:track:${targetId}:${now.year}:${now.month}`;
  if (tracker.brain.currentPlan?.status === 'active' && tracker.brain.currentPlan.planId !== planId) {
    return { status: 'failed', reason: 'active_plan_conflict' };
  }
  const goal = trackingGoal(tracker, tracker.brain, targetId, now);
  const targetRef = { kind: 'npc' as const, entityId: targetId };
  const locationRef = { kind: 'location' as const, entityId: believedLocationId };
  const plan: BrainPlanState = {
    planId, goalId: goal.goalId, status: 'active', currentStepIndex: 1,
    steps: [
      {
        stepId: `${planId}:verify-intelligence`, capabilityId: 'verify_target_intelligence',
        status: 'succeeded', targets: [targetRef, locationRef], reservationIds: [],
        startedAt: { ...now }, completedAt: { ...now },
      },
      {
        stepId: `${planId}:travel`, capabilityId: 'wander', status: 'pending',
        targets: [locationRef], reservationIds: [],
      },
      {
        stepId: `${planId}:search`, capabilityId: 'track_target', status: 'pending',
        targets: [targetRef, locationRef], reservationIds: [],
      },
    ],
    createdAt: { ...now }, updatedAt: { ...now }, revision: 0,
  };
  return {
    status: 'prepared', believedLocationId, reservationIds: [],
    brain: { ...tracker.brain, revision: tracker.brain.revision + 1, currentGoal: goal, currentPlan: plan },
  };
}

function finishTrackingBrain(
  brain: BrainState,
  now: BrainTime,
  succeeded: boolean,
  failureReason?: string,
  memory?: BrainMemory,
  searchReservationIds: string[] = [],
): BrainState {
  const plan = brain.currentPlan!;
  const searchStepIndex = plan.steps.findIndex((step) => step.capabilityId === 'track_target');
  return {
    ...brain,
    revision: brain.revision + 1,
    currentGoal: brain.currentGoal && {
      ...brain.currentGoal,
      status: succeeded ? 'completed' : 'failed', completedAt: { ...now }, failureReason,
    },
    currentPlan: {
      ...plan, status: succeeded ? 'completed' : 'failed', currentStepIndex: searchStepIndex,
      updatedAt: { ...now }, revision: plan.revision + 1,
      steps: plan.steps.map((step, index) => {
        if (step.capabilityId === 'wander' && index < searchStepIndex) {
          return { ...step, status: 'succeeded', completedAt: { ...now } };
        }
        if (index === searchStepIndex) {
          return {
            ...step, status: succeeded ? 'succeeded' : 'failed', reservationIds: searchReservationIds,
            startedAt: { ...now }, completedAt: { ...now }, failureReason,
          };
        }
        return step;
      }),
    },
    memories: memory ? [...brain.memories, memory].slice(-MAX_MEMORIES) : brain.memories,
    lastEvaluatedAt: { ...now },
  };
}

/**
 * 到达信念中的地点后才核验目标。若扑空，只反驳旧信念；绝不把目标真实新位置泄露给追踪者。
 */
export function resolveNpcTargetSearchAtLocation(
  world: WorldState,
  trackerId: string,
  targetId: string,
  now: BrainTime,
): ResolveNpcTargetTrackingResult {
  const tracker = world.npcs[trackerId];
  const target = world.npcs[targetId];
  if (!tracker || !target || !tracker.brain) {
    return { status: 'failed', reason: 'tracker_or_target_not_found', brain: tracker?.brain };
  }
  if (tracker.soulState !== 'Active' || target.soulState !== 'Active') {
    return { status: 'failed', reason: 'tracker_or_target_inactive', brain: tracker.brain };
  }
  const plan = tracker.brain.currentPlan;
  const step = plan?.steps.find((entry) => entry.capabilityId === 'track_target');
  const locationRef = step?.targets.find((entry) => entry.kind === 'location');
  const targetRef = step?.targets.find((entry) => entry.kind === 'npc');
  if (plan?.status !== 'active' || !step
    || targetRef?.entityId !== targetId || !locationRef) {
    return { status: 'failed', reason: 'tracking_plan_not_active', brain: tracker.brain };
  }
  if (tracker.locationId !== locationRef.entityId) {
    return { status: 'failed', reason: 'not_at_search_location', brain: tracker.brain };
  }

  const reservationIds = [`${plan.planId}:search-action:${now.year}:${now.month}`];
  const reserved = reserveWorldResources(world, [{
    reservationId: reservationIds[0]!, ownerId: tracker.id, planId: plan.planId,
    resource: { kind: 'action_slot', resourceId: `${tracker.id}:${now.year}:${now.month}`, amount: 1 },
    expiresAt: nextMonth(now),
  }], now);
  if (reserved.status === 'failed') {
    return { status: 'failed', reason: reserved.reason, brain: tracker.brain };
  }
  if (target.locationId === locationRef.entityId) {
    const brain = finishTrackingBrain(tracker.brain, now, true, undefined, undefined, reservationIds);
    tracker.brain = brain;
    completeWorldResourceReservations(world, reservationIds, 'consumed', now);
    return { status: 'found', brain, targetId, locationId: locationRef.entityId };
  }

  const beliefs = Object.fromEntries(Object.entries(tracker.brain.beliefs).map(([id, belief]) => [
    id,
    belief.topic === 'location' && belief.subject.kind === 'npc' && belief.subject.entityId === targetId
      ? { ...belief, status: 'refuted' as const }
      : belief,
  ]));
  const memory: BrainMemory = {
    memoryId: `${tracker.id}:memory:tracking-failed:${targetId}:${now.year}:${now.month}`,
    kind: 'failure', at: { ...now }, participantIds: [tracker.id, targetId],
    locationId: locationRef.entityId, summary: '依照旧情报追踪目标，但目标已不在原处。',
    valence: -30, salience: 55,
  };
  const brain = finishTrackingBrain(
    { ...tracker.brain, beliefs }, now, false, 'target_not_at_believed_location', memory, reservationIds,
  );
  tracker.brain = brain;
  completeWorldResourceReservations(world, reservationIds, 'released', now, 'target_not_at_believed_location');
  return { status: 'failed', reason: 'target_not_at_believed_location', brain };
}
