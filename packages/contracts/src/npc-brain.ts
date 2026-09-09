import type { MindState, NpcAspiration, NpcBiography, RelationEntry } from './npc-record.js';
import type { PersistentCondition } from './condition.js';

export const NPC_BRAIN_SCHEMA_VERSION = 1 as const;

export interface BrainTime {
  year: number;
  month: number;
}

export type BrainEntityKind = 'npc' | 'player' | 'faction' | 'location' | 'asset' | 'fact';

export interface BrainEntityRef {
  kind: BrainEntityKind;
  entityId: string;
}

export type BrainValue = 'dao' | 'longevity' | 'belonging' | 'reputation' | 'autonomy' | 'security';
export type BrainBias = 'riskTolerance' | 'aggression' | 'patience' | 'curiosity' | 'sociability';

/**
 * 长期性格投影。NpcRecord.personalityId / aspiration 仍是权威来源；
 * 这里保存版本化快照，避免以后调整人格模板时悄悄改写旧世界中的角色。
 */
export interface BrainProfile {
  sourcePersonalityId: string;
  sourceAspiration?: NpcAspiration;
  valueWeights: Record<BrainValue, number>;
  behavioralBiases: Record<BrainBias, number>;
}

export interface BrainBelief {
  beliefId: string;
  topic: 'location' | 'relation' | 'possession' | 'intent' | 'threat' | 'identity' | 'fact' | 'custom';
  subject: BrainEntityRef;
  value: string | number | boolean;
  source: {
    type: 'observation' | 'hearsay' | 'inference' | 'memory';
    sourceEntityId?: string;
    factId?: string;
  };
  observedAt: BrainTime;
  confidence: number;
  status: 'active' | 'questioned' | 'refuted';
  expiresAt?: BrainTime;
}

export interface BrainMemory {
  memoryId: string;
  kind: 'experience' | 'relationship' | 'failure' | 'success' | 'trauma' | 'rumor' | 'reflection';
  at: BrainTime;
  factId?: string;
  participantIds: string[];
  locationId?: string;
  summary: string;
  valence: number;
  salience: number;
  lastRecalledAt?: BrainTime;
}

export interface BrainGoalState {
  goalId: string;
  kind: string;
  targets: BrainEntityRef[];
  priority: number;
  status: 'active' | 'suspended' | 'completed' | 'failed' | 'abandoned';
  createdAt: BrainTime;
  motiveIds: string[];
  completedAt?: BrainTime;
  failureReason?: string;
}

export interface BrainPlanStep {
  stepId: string;
  capabilityId: string;
  status: 'pending' | 'reserved' | 'executing' | 'succeeded' | 'failed' | 'skipped';
  targets: BrainEntityRef[];
  reservationIds: string[];
  startedAt?: BrainTime;
  completedAt?: BrainTime;
  failureReason?: string;
}

export interface BrainPlanState {
  planId: string;
  goalId: string;
  status: 'draft' | 'active' | 'blocked' | 'completed' | 'failed' | 'cancelled';
  steps: BrainPlanStep[];
  currentStepIndex: number;
  createdAt: BrainTime;
  updatedAt: BrainTime;
  revision: number;
}

export interface BrainActionState {
  actionId: string;
  planId?: string;
  capabilityId: string;
  status: 'planned' | 'validating' | 'reserved' | 'executing' | 'succeeded' | 'failed' | 'cancelled';
  targets: BrainEntityRef[];
  reservationIds: string[];
  progress: number;
  plannedAt: BrainTime;
  startedAt?: BrainTime;
  completedAt?: BrainTime;
  failureReason?: string;
}

export interface BrainEmotionState {
  fear: number;
  anger: number;
  grief: number;
  attachment: number;
  stress: number;
}

export interface BrainState {
  schemaVersion: typeof NPC_BRAIN_SCHEMA_VERSION;
  revision: number;
  profile: BrainProfile;
  beliefs: Record<string, BrainBelief>;
  memories: BrainMemory[];
  currentGoal?: BrainGoalState;
  currentPlan?: BrainPlanState;
  currentAction?: BrainActionState;
  emotion: BrainEmotionState;
  /** 上帝模式下逐 NPC 关闭的行为节点；不删除动机、目标、计划或记忆。 */
  disabledNodeIds?: string[];
  initializedAt: BrainTime;
  lastEvaluatedAt?: BrainTime;
}

export interface BrainInitializationInput {
  npcId: string;
  personalityId: string;
  aspiration?: NpcAspiration;
  birthYear: number;
  birthMonth: number;
  legacyMind?: MindState;
  relations?: Record<string, RelationEntry>;
  biography?: NpcBiography;
  /** 只用于推导初始情绪，不复制伤势/毒素数值。 */
  condition?: PersistentCondition;
}

const MAX_INITIAL_RELATION_BELIEFS = 12;
const MAX_INITIAL_BIOGRAPHY_MEMORIES = 12;

const aspirationGoal: Record<NpcAspiration, string> = {
  seekDao: 'cultivate_to_breakthrough',
  seekFame: 'build_reputation',
  seekLongevity: 'extend_lifespan',
  seekRevenge: 'seek_revenge',
  seekPartner: 'find_partner',
  seekSuccessor: 'find_successor',
  wander: 'explore',
};

const aspirationValue: Record<NpcAspiration, BrainValue> = {
  seekDao: 'dao',
  seekFame: 'reputation',
  seekLongevity: 'longevity',
  seekRevenge: 'autonomy',
  seekPartner: 'belonging',
  seekSuccessor: 'belonging',
  wander: 'autonomy',
};

function createProfile(personalityId: string, aspiration?: NpcAspiration): BrainProfile {
  const valueWeights: Record<BrainValue, number> = {
    dao: 50,
    longevity: 50,
    belonging: 50,
    reputation: 50,
    autonomy: 50,
    security: 50,
  };
  if (aspiration) valueWeights[aspirationValue[aspiration]] = 80;

  const normalized = personalityId.toLowerCase();
  const behavioralBiases: Record<BrainBias, number> = {
    riskTolerance: 50,
    aggression: 50,
    patience: 50,
    curiosity: 50,
    sociability: 50,
  };
  if (normalized.includes('cautious') || normalized.includes('谨慎')) {
    behavioralBiases.riskTolerance = 25;
    behavioralBiases.patience = 70;
  }
  if (normalized.includes('reckless') || normalized.includes('冒险')) {
    behavioralBiases.riskTolerance = 95;
    behavioralBiases.curiosity = 75;
  }
  if (normalized.includes('vengeful') || normalized.includes('复仇')) {
    behavioralBiases.aggression = 75;
    behavioralBiases.patience = 60;
  }
  if (normalized.includes('scholar') || normalized.includes('求知')) {
    behavioralBiases.curiosity = 80;
    behavioralBiases.patience = 65;
  }

  return { sourcePersonalityId: personalityId, sourceAspiration: aspiration, valueWeights, behavioralBiases };
}

function refsFromLegacyGoal(mind: MindState | undefined): BrainEntityRef[] {
  return mind?.currentGoal.targetNpcId
    ? [{ kind: 'npc', entityId: mind.currentGoal.targetNpcId }]
    : [];
}

function refsFromLegacyAction(mind: MindState | undefined): BrainEntityRef[] {
  return mind?.nextAction.targetLocationId
    ? [{ kind: 'location', entityId: mind.nextAction.targetLocationId }]
    : [];
}

function createInitialBeliefs(input: BrainInitializationInput): Record<string, BrainBelief> {
  const entries = Object.entries(input.relations ?? {})
    .sort(([idA, a], [idB, b]) => Math.abs(b.bond) - Math.abs(a.bond) || idA.localeCompare(idB))
    .slice(0, MAX_INITIAL_RELATION_BELIEFS);
  return Object.fromEntries(entries.map(([targetId, relation]) => {
    const beliefId = `${input.npcId}:belief:relation:${targetId}`;
    return [beliefId, {
      beliefId,
      topic: 'relation' as const,
      subject: { kind: 'npc' as const, entityId: targetId },
      value: relation.type,
      source: { type: 'memory' as const },
      observedAt: { ...relation.changedAt },
      confidence: Math.max(0, Math.min(1, relation.trust / 100)),
      status: 'active' as const,
    }];
  }));
}

function createInitialMemories(input: BrainInitializationInput): BrainMemory[] {
  return [...(input.biography?.milestones ?? [])]
    .sort((a, b) => a.year - b.year || a.month - b.month || a.eventId.localeCompare(b.eventId))
    .slice(-MAX_INITIAL_BIOGRAPHY_MEMORIES)
    .map((milestone) => ({
      memoryId: `${input.npcId}:memory:milestone:${milestone.eventId}`,
      kind: 'experience',
      at: { year: milestone.year, month: milestone.month },
      factId: milestone.eventId,
      participantIds: [input.npcId],
      summary: milestone.title,
      valence: 0,
      salience: 70,
    }));
}

function createInitialEmotion(condition: PersistentCondition | undefined): BrainEmotionState {
  if (!condition) return { fear: 0, anger: 0, grief: 0, attachment: 0, stress: 0 };
  const injuryStress = condition.injuries.reduce((max, injury) => {
    const level = { minor: 15, moderate: 35, severe: 65, critical: 90 }[injury.level];
    return Math.max(max, level);
  }, 0);
  const poisonStress = condition.poisons.reduce((max, poison) => Math.max(max, poison.intensity), 0);
  const stress = Math.min(100, Math.max(injuryStress, poisonStress, condition.meridianDamage));
  return { fear: Math.round(stress * 0.5), anger: 0, grief: 0, attachment: 0, stress };
}

/** 仅由持久化权威字段派生，不消费 RNG，因而可安全用于迁移与补档。 */
export function createInitialBrainState(
  input: BrainInitializationInput,
  initializedAt: BrainTime,
): BrainState {
  const legacyMind = input.legacyMind;
  const goalKind = legacyMind?.currentGoal.type
    ?? (input.aspiration ? aspirationGoal[input.aspiration] : undefined);
  const goalCreatedAt = legacyMind?.goalStartedAt ?? initializedAt;
  const currentGoal: BrainGoalState | undefined = goalKind
    ? {
        goalId: `${input.npcId}:goal:${goalKind}:${goalCreatedAt.year}:${goalCreatedAt.month}`,
        kind: goalKind,
        targets: refsFromLegacyGoal(legacyMind),
        priority: 50,
        status: 'active',
        createdAt: { ...goalCreatedAt },
        motiveIds: input.aspiration ? [`aspiration:${input.aspiration}`] : [],
      }
    : undefined;

  const legacyStatus = legacyMind?.actionStatus;
  const actionStatus: BrainActionState['status'] = legacyStatus === 'completed'
    ? 'succeeded'
    : legacyStatus === 'failed'
      ? 'failed'
      : legacyStatus === 'executing'
        ? 'executing'
        : 'planned';
  const actionPlannedAt = legacyMind?.actionPlannedAt ?? initializedAt;
  const currentAction: BrainActionState | undefined = legacyMind
    ? {
        actionId: `${input.npcId}:action:${legacyMind.nextAction.type}:${actionPlannedAt.year}:${actionPlannedAt.month}`,
        capabilityId: legacyMind.nextAction.type,
        status: actionStatus,
        targets: refsFromLegacyAction(legacyMind),
        reservationIds: [],
        progress: 0,
        plannedAt: { ...actionPlannedAt },
        failureReason: legacyMind.actionFailureReason,
      }
    : undefined;

  return {
    schemaVersion: NPC_BRAIN_SCHEMA_VERSION,
    revision: 0,
    profile: createProfile(input.personalityId, input.aspiration),
    beliefs: createInitialBeliefs(input),
    memories: createInitialMemories(input),
    currentGoal,
    currentAction,
    emotion: createInitialEmotion(input.condition),
    initializedAt: { ...initializedAt },
  };
}
