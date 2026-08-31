import type {
  BrainActionState,
  BrainGoalState,
  BrainPlanState,
  BrainState,
  BrainTime,
  NpcRecord,
} from '@taosim/contracts';
import type { NpcBrainCapabilityId } from './npc-brain-node-registry.js';
import {
  getNpcActionDuration,
  resolveNpcCapabilityAction,
  type NpcActionResolution,
  type NpcActionResolutionOptions,
} from './npc-mind.js';

export interface NpcBrainActionCommitResult {
  brain: BrainState;
  resolution?: NpcActionResolution;
  alreadyCommitted: boolean;
}

function sameTime(a: BrainTime | undefined, b: BrainTime): boolean {
  return a?.year === b.year && a.month === b.month;
}

function cloneNpc(npc: NpcRecord): NpcRecord {
  return JSON.parse(JSON.stringify(npc)) as NpcRecord;
}

/** 只提交首批能力可能改变的权威字段，禁止用场景投影整体覆盖 NpcRecord。 */
function applyCapabilityDelta(target: NpcRecord, staged: NpcRecord): void {
  target.cultivation = staged.cultivation;
  target.realm = staged.realm;
  target.lifespan = staged.lifespan;
  target.locationId = staged.locationId;
  target.moveState = staged.moveState;
  target.lastUpdate = staged.lastUpdate;
  target.biography = staged.biography;
}

function createAction(
  npcId: string,
  capabilityId: NpcBrainCapabilityId,
  planId: string,
  now: BrainTime,
): BrainActionState {
  return {
    actionId: `${npcId}:brain-action:${capabilityId}:${now.year}:${now.month}`,
    capabilityId,
    planId,
    status: 'planned',
    targets: [],
    reservationIds: [],
    progress: 0,
    plannedAt: { ...now },
  };
}

function activeGoal(npcId: string, brain: Readonly<BrainState>, goalKind: string, now: BrainTime): BrainGoalState {
  if (brain.currentGoal?.kind === goalKind && brain.currentGoal.status === 'active') {
    return { ...brain.currentGoal };
  }
  return {
    goalId: `${npcId}:brain-goal:${goalKind}:${now.year}:${now.month}`,
    kind: goalKind,
    targets: [],
    priority: 50,
    status: 'active',
    createdAt: { ...now },
    motiveIds: [],
  };
}

function activePlan(
  npcId: string,
  brain: Readonly<BrainState>,
  goal: BrainGoalState,
  capabilityId: NpcBrainCapabilityId,
  now: BrainTime,
): BrainPlanState {
  if (brain.currentPlan?.goalId === goal.goalId
    && brain.currentPlan.status === 'active'
    && brain.currentAction?.capabilityId === capabilityId
    && (brain.currentAction.status === 'planned' || brain.currentAction.status === 'executing')) {
    return { ...brain.currentPlan, steps: brain.currentPlan.steps.map((step) => ({ ...step })) };
  }
  const planId = `${npcId}:brain-plan:${capabilityId}:${now.year}:${now.month}`;
  return {
    planId,
    goalId: goal.goalId,
    status: 'active',
    steps: [{
      stepId: `${planId}:step:0`, capabilityId, status: 'pending', targets: [], reservationIds: [],
    }],
    currentStepIndex: 0,
    createdAt: { ...now },
    updatedAt: { ...now },
    revision: 0,
  };
}

/**
 * NB2.3 唯一 Brain Action 提交口：按月幂等、在副本上结算，再差量写回权威 NPC。
 */
export function commitNpcBrainAction(
  npc: NpcRecord,
  brain: Readonly<BrainState>,
  capabilityId: NpcBrainCapabilityId,
  goalKind: string,
  now: BrainTime,
  options: NpcActionResolutionOptions,
): NpcBrainActionCommitResult {
  if (sameTime(brain.lastEvaluatedAt, now)) {
    return { brain: brain as BrainState, alreadyCommitted: true };
  }

  const duration = getNpcActionDuration(capabilityId);
  if (!duration) throw new Error(`未注册的 NPC Brain 能力执行器: ${capabilityId}`);

  const goal = activeGoal(npc.id, brain, goalKind, now);
  const plan = activePlan(npc.id, brain, goal, capabilityId, now);
  const incumbent = brain.currentAction;
  const canContinue = incumbent?.capabilityId === capabilityId
    && (incumbent.status === 'planned' || incumbent.status === 'executing');
  const action = canContinue
    ? { ...incumbent, planId: plan.planId }
    : createAction(npc.id, capabilityId, plan.planId, now);
  const elapsedBefore = canContinue ? Math.round(action.progress * duration) : 0;
  const stagedNpc = cloneNpc(npc);
  const resolution = resolveNpcCapabilityAction(stagedNpc, capabilityId, elapsedBefore, now, options);
  if (!resolution) throw new Error(`NPC Brain 能力没有结算结果: ${capabilityId}`);

  applyCapabilityDelta(npc, stagedNpc);
  const elapsedAfter = Math.min(duration, elapsedBefore + 1);
  const nextAction: BrainActionState = {
    ...action,
    status: resolution.completed
      ? (resolution.success === false ? 'failed' : 'succeeded')
      : 'executing',
    progress: resolution.completed ? 1 : elapsedAfter / duration,
    startedAt: action.startedAt ?? { ...now },
    completedAt: resolution.completed ? { ...now } : undefined,
    failureReason: resolution.failureReason,
  };
  const stepStatus = resolution.completed
    ? (resolution.success === false ? 'failed' : 'succeeded')
    : 'executing';
  const nextPlan: BrainPlanState = {
    ...plan,
    status: resolution.completed
      ? (resolution.success === false ? 'failed' : 'completed')
      : 'active',
    steps: plan.steps.map((step, index) => index === plan.currentStepIndex
      ? {
          ...step,
          status: stepStatus,
          startedAt: step.startedAt ?? { ...now },
          completedAt: resolution.completed ? { ...now } : undefined,
          failureReason: resolution.failureReason,
        }
      : step),
    updatedAt: { ...now },
    revision: plan.revision + 1,
  };

  return {
    brain: {
      ...brain,
      revision: brain.revision + 1,
      currentGoal: goal,
      currentPlan: nextPlan,
      currentAction: nextAction,
      lastEvaluatedAt: { ...now },
    },
    resolution,
    alreadyCommitted: false,
  };
}
