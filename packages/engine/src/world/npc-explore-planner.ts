import type {
  BrainGoalState,
  BrainPlanState,
  BrainState,
  BrainTime,
  NpcPerceptionSnapshot,
  NpcRecord,
  ResourceReservationRequest,
  WorldState,
} from '@taosim/contracts';
import { reserveWorldResources, type ReservationFailureReason } from './world-resource-reservation.js';

export type PrepareNpcExplorePlanResult =
  | { status: 'prepared'; brain: BrainState; targetLocationId: string; reservationIds: string[] }
  | { status: 'failed'; reason: 'no_known_destination' | ReservationFailureReason };

function chooseDestination(npcId: string, candidates: readonly string[], now: BrainTime): string | undefined {
  if (candidates.length === 0) return undefined;
  const source = `${npcId}|${now.year}|${now.month}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return candidates[(hash >>> 0) % candidates.length];
}

function exploreGoal(npcId: string, brain: Readonly<BrainState>, now: BrainTime): BrainGoalState {
  if (brain.currentGoal?.kind === 'explore' && brain.currentGoal.status === 'active') {
    return { ...brain.currentGoal };
  }
  return {
    goalId: `${npcId}:brain-goal:explore:${now.year}:${now.month}`,
    kind: 'explore', targets: [], priority: 50, status: 'active', createdAt: { ...now }, motiveIds: [],
  };
}

/** 首个 NB3 真实计划：观察本地公共地图 → 预留本月主行动 → 前往另一个场所。 */
export function prepareNpcExplorePlan(
  world: WorldState,
  npc: Readonly<NpcRecord>,
  brain: Readonly<BrainState>,
  perception: Readonly<NpcPerceptionSnapshot>,
  now: BrainTime,
): PrepareNpcExplorePlanResult {
  const destinations = perception.knownLocationIds
    .filter((locationId) => locationId !== npc.locationId)
    .sort();
  const targetLocationId = chooseDestination(npc.id, destinations, now);
  if (!targetLocationId) return { status: 'failed', reason: 'no_known_destination' };

  const goal = exploreGoal(npc.id, brain, now);
  const planId = `${npc.id}:brain-plan:explore:${now.year}:${now.month}`;
  const reservationId = `${npc.id}:reservation:primary-action:${now.year}:${now.month}`;
  const reservationRequest: ResourceReservationRequest = {
    reservationId,
    ownerId: npc.id,
    planId,
    resource: { kind: 'action_slot', resourceId: `${npc.id}:${now.year}:${now.month}`, amount: 1 },
    expiresAt: { year: now.month === 12 ? now.year + 1 : now.year, month: now.month === 12 ? 1 : now.month + 1 },
  };
  const reserved = reserveWorldResources(world, [reservationRequest], now);
  if (reserved.status === 'failed') return { status: 'failed', reason: reserved.reason };

  const target = { kind: 'location' as const, entityId: targetLocationId };
  const plan: BrainPlanState = {
    planId,
    goalId: goal.goalId,
    status: 'active',
    steps: [
      {
        stepId: `${planId}:observe`, capabilityId: 'observe_local_area', status: 'succeeded',
        targets: [], reservationIds: [], startedAt: { ...now }, completedAt: { ...now },
      },
      {
        stepId: `${planId}:reserve`, capabilityId: 'reserve_primary_action', status: 'succeeded',
        targets: [target], reservationIds: [reservationId], startedAt: { ...now }, completedAt: { ...now },
      },
      {
        stepId: `${planId}:travel`, capabilityId: 'wander', status: 'pending',
        targets: [target], reservationIds: [reservationId],
      },
    ],
    currentStepIndex: 2,
    createdAt: { ...now },
    updatedAt: { ...now },
    revision: 0,
  };
  return {
    status: 'prepared',
    brain: { ...brain, revision: brain.revision + 1, currentGoal: goal, currentPlan: plan },
    targetLocationId,
    reservationIds: [reservationId],
  };
}
