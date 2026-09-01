import type {
  BrainState,
  BrainTime,
  NpcRecord,
  PersistentCondition,
} from '@taosim/contracts';
import type {
  NpcBrainCapabilityId,
  NpcBrainNodeDefinition,
  NpcBrainScoreConsiderations,
} from './npc-brain-node-registry.js';
import { NpcBrainNodeRegistry } from './npc-brain-node-registry.js';

const GOAL_FIT_WEIGHT = 0.35;
const OPPORTUNITY_WEIGHT = 0.3;
const URGENCY_WEIGHT = 0.2;
const PROFILE_FIT_WEIGHT = 0.15;
const HYSTERESIS_MARGIN = 10;
const NOISE_AMPLITUDE = 1;
const MAX_DIFFERENCE_SAMPLES = 20;
export const DEFAULT_NPC_BRAIN_SATISFACTION_THRESHOLD = 65;

export interface NpcBrainScoredCandidate {
  nodeId: string;
  capabilityId: NpcBrainCapabilityId;
  label: string;
  score: number;
  considerations: NpcBrainScoreConsiderations;
  deterministicNoise: number;
}

export interface NpcBrainRejectedCandidate {
  nodeId: string;
  capabilityId: NpcBrainCapabilityId;
  reasonCode: string;
  reason: string;
}

export interface NpcBrainShadowDecision {
  npcId: string;
  at: BrainTime;
  selected?: NpcBrainScoredCandidate;
  candidates: NpcBrainScoredCandidate[];
  rejected: NpcBrainRejectedCandidate[];
  hysteresisApplied: boolean;
  satisficingApplied: boolean;
  incumbentCapabilityId?: string;
  activeGoalKind: string;
  commitEligibility: NpcBrainCommitEligibility;
}

export interface NpcBrainCommitEligibility {
  eligible: boolean;
  reasonCode: 'covered_goal' | 'no_recommendation' | 'goal_not_fully_covered';
  /** 复杂闭环由专用编排器提交，不得送入通用单步 Action 提交器。 */
  executor?: 'revenge_ambush';
}

const SINGLE_WRITE_CAPABILITIES_BY_GOAL: Readonly<Record<string, readonly NpcBrainCapabilityId[]>> = {
  cultivate_to_breakthrough: ['cultivate', 'seclude', 'breakthrough'],
  explore: ['wander'],
  seek_revenge: ['revenge_ambush'],
};

/**
 * 单写资格按“完整目标闭环”放行，而不是只看某个动作是否恰好有节点。
 * 这样延寿/复仇等目标不会在其他主行动尚未迁移时被通用云游或闭关吞掉。
 */
export function getNpcBrainCommitEligibility(
  activeGoalKind: string,
  capabilityId: NpcBrainCapabilityId | undefined,
): NpcBrainCommitEligibility {
  if (!capabilityId) return { eligible: false, reasonCode: 'no_recommendation' };
  const covered = SINGLE_WRITE_CAPABILITIES_BY_GOAL[activeGoalKind];
  return covered?.includes(capabilityId)
    ? capabilityId === 'revenge_ambush'
      ? { eligible: true, reasonCode: 'covered_goal', executor: 'revenge_ambush' }
      : { eligible: true, reasonCode: 'covered_goal' }
    : { eligible: false, reasonCode: 'goal_not_fully_covered' };
}

export interface NpcBrainShadowContext {
  now: BrainTime;
  registry: NpcBrainNodeRegistry;
  condition?: Readonly<PersistentCondition>;
  incumbentCapabilityId?: string;
  /** 普通 NPC 可按稳定节点顺序接受首个达到阈值的候选；省略时取最高分。 */
  satisfactionThreshold?: number;
}

export interface NpcBrainShadowDifference {
  npcId: string;
  oldActionType: string;
  recommendedCapabilityId?: NpcBrainCapabilityId;
  recommendedScore?: number;
  topCandidates: Array<{ capabilityId: NpcBrainCapabilityId; score: number }>;
}

export interface NpcBrainShadowMonthlyReport {
  at: BrainTime;
  evaluatedNpcCount: number;
  matchedCount: number;
  differedCount: number;
  noRecommendationCount: number;
  evaluationErrorCount: number;
  committedCount: number;
  legacyFallbackCount: number;
  commitErrorCount: number;
  knowledgeLearnedCount: number;
  knowledgeQuestionedCount: number;
  knowledgePrunedCount: number;
  plansPreparedCount: number;
  reservationsExpiredCount: number;
  reservationsPrunedCount: number;
  hysteresisCount: number;
  satisficingCount: number;
  selectedCounts: Record<string, number>;
  rejectionCounts: Record<string, number>;
  /** key = "旧行动→新建议"，用于跨月校准而不保留逐 NPC 明细。 */
  comparisonCounts: Record<string, number>;
  committedCounts: Record<string, number>;
  legacyFallbackCounts: Record<string, number>;
  planningFailureCounts: Record<string, number>;
  evaluationErrorSamples: string[];
  differenceSamples: NpcBrainShadowDifference[];
}

export interface NpcBrainShadowAggregateReport
  extends Omit<NpcBrainShadowMonthlyReport, 'at'> {
  from: BrainTime;
  to: BrainTime;
  monthCount: number;
}

function mergeCounts(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

/** 合并跨月 shadow 统计；样本仍有全局上限，不会随快进时间增长。 */
export function mergeNpcBrainShadowReports(
  aggregate: NpcBrainShadowAggregateReport | undefined,
  monthly: NpcBrainShadowMonthlyReport,
): NpcBrainShadowAggregateReport {
  if (!aggregate) {
    return {
      from: { ...monthly.at },
      to: { ...monthly.at },
      monthCount: 1,
      evaluatedNpcCount: monthly.evaluatedNpcCount,
      matchedCount: monthly.matchedCount,
      differedCount: monthly.differedCount,
      noRecommendationCount: monthly.noRecommendationCount,
      evaluationErrorCount: monthly.evaluationErrorCount,
      committedCount: monthly.committedCount,
      legacyFallbackCount: monthly.legacyFallbackCount,
      commitErrorCount: monthly.commitErrorCount,
      knowledgeLearnedCount: monthly.knowledgeLearnedCount,
      knowledgeQuestionedCount: monthly.knowledgeQuestionedCount,
      knowledgePrunedCount: monthly.knowledgePrunedCount,
      plansPreparedCount: monthly.plansPreparedCount,
      reservationsExpiredCount: monthly.reservationsExpiredCount,
      reservationsPrunedCount: monthly.reservationsPrunedCount,
      hysteresisCount: monthly.hysteresisCount,
      satisficingCount: monthly.satisficingCount,
      selectedCounts: { ...monthly.selectedCounts },
      rejectionCounts: { ...monthly.rejectionCounts },
      comparisonCounts: { ...monthly.comparisonCounts },
      committedCounts: { ...monthly.committedCounts },
      legacyFallbackCounts: { ...monthly.legacyFallbackCounts },
      planningFailureCounts: { ...monthly.planningFailureCounts },
      evaluationErrorSamples: monthly.evaluationErrorSamples.slice(0, MAX_DIFFERENCE_SAMPLES),
      differenceSamples: monthly.differenceSamples.slice(0, MAX_DIFFERENCE_SAMPLES),
    };
  }
  const merged: NpcBrainShadowAggregateReport = {
    ...aggregate,
    to: { ...monthly.at },
    monthCount: aggregate.monthCount + 1,
    evaluatedNpcCount: aggregate.evaluatedNpcCount + monthly.evaluatedNpcCount,
    matchedCount: aggregate.matchedCount + monthly.matchedCount,
    differedCount: aggregate.differedCount + monthly.differedCount,
    noRecommendationCount: aggregate.noRecommendationCount + monthly.noRecommendationCount,
    evaluationErrorCount: aggregate.evaluationErrorCount + monthly.evaluationErrorCount,
    committedCount: aggregate.committedCount + monthly.committedCount,
    legacyFallbackCount: aggregate.legacyFallbackCount + monthly.legacyFallbackCount,
    commitErrorCount: aggregate.commitErrorCount + monthly.commitErrorCount,
    knowledgeLearnedCount: aggregate.knowledgeLearnedCount + monthly.knowledgeLearnedCount,
    knowledgeQuestionedCount: aggregate.knowledgeQuestionedCount + monthly.knowledgeQuestionedCount,
    knowledgePrunedCount: aggregate.knowledgePrunedCount + monthly.knowledgePrunedCount,
    plansPreparedCount: aggregate.plansPreparedCount + monthly.plansPreparedCount,
    reservationsExpiredCount: aggregate.reservationsExpiredCount + monthly.reservationsExpiredCount,
    reservationsPrunedCount: aggregate.reservationsPrunedCount + monthly.reservationsPrunedCount,
    hysteresisCount: aggregate.hysteresisCount + monthly.hysteresisCount,
    satisficingCount: aggregate.satisficingCount + monthly.satisficingCount,
    selectedCounts: { ...aggregate.selectedCounts },
    rejectionCounts: { ...aggregate.rejectionCounts },
    comparisonCounts: { ...aggregate.comparisonCounts },
    committedCounts: { ...aggregate.committedCounts },
    legacyFallbackCounts: { ...aggregate.legacyFallbackCounts },
    planningFailureCounts: { ...aggregate.planningFailureCounts },
    evaluationErrorSamples: [...aggregate.evaluationErrorSamples, ...monthly.evaluationErrorSamples]
      .slice(0, MAX_DIFFERENCE_SAMPLES),
    differenceSamples: [...aggregate.differenceSamples, ...monthly.differenceSamples]
      .slice(0, MAX_DIFFERENCE_SAMPLES),
  };
  mergeCounts(merged.selectedCounts, monthly.selectedCounts);
  mergeCounts(merged.rejectionCounts, monthly.rejectionCounts);
  mergeCounts(merged.comparisonCounts, monthly.comparisonCounts);
  mergeCounts(merged.committedCounts, monthly.committedCounts);
  mergeCounts(merged.legacyFallbackCounts, monthly.legacyFallbackCounts);
  mergeCounts(merged.planningFailureCounts, monthly.planningFailureCounts);
  return merged;
}

/** 热循环只聚合计数并保留有限分歧样本，避免逐 NPC 日志与无界诊断内存。 */
export class NpcBrainShadowReportBuilder {
  private readonly report: NpcBrainShadowMonthlyReport;

  constructor(at: BrainTime) {
    this.report = {
      at: { ...at },
      evaluatedNpcCount: 0,
      matchedCount: 0,
      differedCount: 0,
      noRecommendationCount: 0,
      evaluationErrorCount: 0,
      committedCount: 0,
      legacyFallbackCount: 0,
      commitErrorCount: 0,
      knowledgeLearnedCount: 0,
      knowledgeQuestionedCount: 0,
      knowledgePrunedCount: 0,
      plansPreparedCount: 0,
      reservationsExpiredCount: 0,
      reservationsPrunedCount: 0,
      hysteresisCount: 0,
      satisficingCount: 0,
      selectedCounts: {},
      rejectionCounts: {},
      comparisonCounts: {},
      committedCounts: {},
      legacyFallbackCounts: {},
      planningFailureCounts: {},
      evaluationErrorSamples: [],
      differenceSamples: [],
    };
  }

  record(decision: NpcBrainShadowDecision, oldActionType: string): void {
    this.report.evaluatedNpcCount++;
    if (decision.hysteresisApplied) this.report.hysteresisCount++;
    if (decision.satisficingApplied) this.report.satisficingCount++;
    for (const rejected of decision.rejected) {
      this.report.rejectionCounts[rejected.reasonCode] =
        (this.report.rejectionCounts[rejected.reasonCode] ?? 0) + 1;
    }
    const selected = decision.selected;
    const comparisonKey = `${oldActionType}→${selected?.capabilityId ?? 'none'}`;
    this.report.comparisonCounts[comparisonKey] =
      (this.report.comparisonCounts[comparisonKey] ?? 0) + 1;
    if (!selected) {
      this.report.noRecommendationCount++;
      this.report.differedCount++;
    } else {
      this.report.selectedCounts[selected.capabilityId] =
        (this.report.selectedCounts[selected.capabilityId] ?? 0) + 1;
      if (selected.capabilityId === oldActionType) this.report.matchedCount++;
      else this.report.differedCount++;
    }
    if (selected?.capabilityId === oldActionType || this.report.differenceSamples.length >= MAX_DIFFERENCE_SAMPLES) {
      return;
    }
    this.report.differenceSamples.push({
      npcId: decision.npcId,
      oldActionType,
      recommendedCapabilityId: selected?.capabilityId,
      recommendedScore: selected?.score,
      topCandidates: decision.candidates.slice(0, 3).map((candidate) => ({
        capabilityId: candidate.capabilityId,
        score: candidate.score,
      })),
    });
  }

  recordEvaluationError(npcId: string, oldActionType: string): void {
    this.report.evaluatedNpcCount++;
    this.report.differedCount++;
    this.report.noRecommendationCount++;
    this.report.evaluationErrorCount++;
    this.report.rejectionCounts.evaluation_error =
      (this.report.rejectionCounts.evaluation_error ?? 0) + 1;
    const comparisonKey = `${oldActionType}→none`;
    this.report.comparisonCounts[comparisonKey] =
      (this.report.comparisonCounts[comparisonKey] ?? 0) + 1;
    if (this.report.evaluationErrorSamples.length < MAX_DIFFERENCE_SAMPLES) {
      this.report.evaluationErrorSamples.push(npcId);
    }
  }

  recordCommit(capabilityId: NpcBrainCapabilityId): void {
    this.report.committedCount++;
    this.report.committedCounts[capabilityId] = (this.report.committedCounts[capabilityId] ?? 0) + 1;
  }

  recordLegacyFallback(reasonCode: string): void {
    this.report.legacyFallbackCount++;
    this.report.legacyFallbackCounts[reasonCode] = (this.report.legacyFallbackCounts[reasonCode] ?? 0) + 1;
  }

  recordCommitError(npcId: string): void {
    this.report.commitErrorCount++;
    this.report.legacyFallbackCount++;
    this.report.legacyFallbackCounts.commit_error = (this.report.legacyFallbackCounts.commit_error ?? 0) + 1;
    if (this.report.evaluationErrorSamples.length < MAX_DIFFERENCE_SAMPLES) {
      this.report.evaluationErrorSamples.push(npcId);
    }
  }

  recordKnowledge(learned: number, questioned: number, pruned: number): void {
    this.report.knowledgeLearnedCount += learned;
    this.report.knowledgeQuestionedCount += questioned;
    this.report.knowledgePrunedCount += pruned;
  }

  recordPlanPrepared(): void {
    this.report.plansPreparedCount++;
  }

  recordPlanningFailure(reasonCode: string): void {
    this.report.planningFailureCounts[reasonCode] =
      (this.report.planningFailureCounts[reasonCode] ?? 0) + 1;
  }

  recordReservationsExpired(count: number): void {
    this.report.reservationsExpiredCount += count;
  }

  recordReservationsPruned(count: number): void {
    this.report.reservationsPrunedCount += count;
  }

  build(): NpcBrainShadowMonthlyReport {
    return JSON.parse(JSON.stringify(this.report)) as NpcBrainShadowMonthlyReport;
  }
}

function monthOrdinal(time: BrainTime): number {
  return (time.year - 1) * 12 + time.month;
}

function deriveActiveGoalKind(npc: Readonly<NpcRecord>): string {
  const lifespanRatio = npc.lifespan.maxLifespan > 0
    ? npc.lifespan.age / npc.lifespan.maxLifespan
    : 1;
  if (lifespanRatio > 0.91) return 'extend_lifespan';
  if (npc.aspiration === 'seekPartner' && npc.spouseId) return 'cultivate_to_breakthrough';
  return {
    seekDao: 'cultivate_to_breakthrough',
    seekFame: 'build_reputation',
    seekLongevity: 'extend_lifespan',
    seekRevenge: 'seek_revenge',
    seekPartner: 'find_partner',
    seekSuccessor: 'find_successor',
    wander: 'explore',
  }[npc.aspiration ?? 'wander'];
}

function isRecovering(condition: Readonly<PersistentCondition> | undefined, now: BrainTime): boolean {
  return condition?.recoveringUntil !== undefined
    && monthOrdinal(condition.recoveringUntil) > monthOrdinal(now);
}

function stableNoise(npcId: string, nodeId: string, now: BrainTime): number {
  const source = `${npcId}|${nodeId}|${now.year}|${now.month}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return (normalized * 2 - 1) * NOISE_AMPLITUDE;
}

function isOnCooldown(node: NpcBrainNodeDefinition, brain: Readonly<BrainState>, now: BrainTime): boolean {
  if (node.cooldownMonths <= 0) return false;
  const action = brain.currentAction;
  if (!action?.completedAt || action.capabilityId !== node.capabilityId) return false;
  return monthOrdinal(now) - monthOrdinal(action.completedAt) < node.cooldownMonths;
}

function scoreCandidate(
  npc: Readonly<NpcRecord>,
  node: NpcBrainNodeDefinition,
  considerations: NpcBrainScoreConsiderations,
  now: BrainTime,
): NpcBrainScoredCandidate {
  const normalized: NpcBrainScoreConsiderations = Object.fromEntries(
    Object.entries(considerations).map(([key, value]) => [key, Math.max(0, Math.min(100, value))]),
  ) as unknown as NpcBrainScoreConsiderations;
  const deterministicNoise = stableNoise(npc.id, node.nodeId, now);
  const rawScore =
    normalized.goalFit * GOAL_FIT_WEIGHT
    + normalized.opportunity * OPPORTUNITY_WEIGHT
    + normalized.urgency * URGENCY_WEIGHT
    + normalized.profileFit * PROFILE_FIT_WEIGHT
    - normalized.riskCost
    - normalized.timeCost
    + deterministicNoise;
  return {
    nodeId: node.nodeId,
    capabilityId: node.capabilityId,
    label: node.label,
    score: Math.round(rawScore * 100) / 100,
    considerations: normalized,
    deterministicNoise: Math.round(deterministicNoise * 100) / 100,
  };
}

/**
 * NB2 影子决策：只读取 NPC/Brain/conditions，输出候选、抑制原因和建议，不提交世界变化。
 */
export function evaluateNpcBrainShadow(
  npc: Readonly<NpcRecord>,
  brain: Readonly<BrainState>,
  context: NpcBrainShadowContext,
): NpcBrainShadowDecision {
  const candidates: NpcBrainScoredCandidate[] = [];
  const rejected: NpcBrainRejectedCandidate[] = [];
  const incumbentCapabilityId = context.incumbentCapabilityId ?? brain.currentAction?.capabilityId;
  const activeGoalKind = deriveActiveGoalKind(npc);

  for (const entry of context.registry.list()) {
    const node = entry.definition;
    if (!entry.enabled) {
      rejected.push({
        nodeId: node.nodeId,
        capabilityId: node.capabilityId,
        reasonCode: 'node_disabled',
        reason: '节点已关闭',
      });
      continue;
    }
    if (npc.soulState !== 'Active') {
      rejected.push({ nodeId: node.nodeId, capabilityId: node.capabilityId, reasonCode: 'npc_inactive', reason: 'NPC 不在活动状态' });
      continue;
    }
    if (isRecovering(context.condition, context.now)) {
      rejected.push({ nodeId: node.nodeId, capabilityId: node.capabilityId, reasonCode: 'recovering', reason: 'NPC 正在疗伤恢复' });
      continue;
    }
    if (isOnCooldown(node, brain, context.now)) {
      rejected.push({ nodeId: node.nodeId, capabilityId: node.capabilityId, reasonCode: 'cooldown', reason: '能力仍在冷却' });
      continue;
    }
    const evaluation = node.evaluate({
      npc,
      brain,
      now: context.now,
      condition: context.condition,
      activeGoalKind,
    });
    if (!evaluation.allowed || !evaluation.considerations) {
      rejected.push({
        nodeId: node.nodeId,
        capabilityId: node.capabilityId,
        reasonCode: evaluation.reasonCode ?? 'hard_precondition_failed',
        reason: evaluation.reason ?? '硬前置不满足',
      });
      continue;
    }
    candidates.push(scoreCandidate(npc, node, evaluation.considerations, context.now));
  }

  const candidatesInConsiderationOrder = [...candidates];
  candidates.sort((a, b) => b.score - a.score || a.nodeId.localeCompare(b.nodeId));
  const best = candidates[0];
  const satisfactionThreshold = context.satisfactionThreshold;
  let selected = satisfactionThreshold === undefined
    ? best
    : candidatesInConsiderationOrder.find((candidate) => candidate.score >= satisfactionThreshold) ?? best;
  const satisficingApplied = selected !== undefined && best !== undefined && selected.nodeId !== best.nodeId;
  let hysteresisApplied = false;
  if (selected && incumbentCapabilityId && selected.capabilityId !== incumbentCapabilityId) {
    const incumbent = candidates.find((candidate) => candidate.capabilityId === incumbentCapabilityId);
    if (incumbent && selected.score < incumbent.score + HYSTERESIS_MARGIN) {
      selected = incumbent;
      hysteresisApplied = true;
    }
  }

  return {
    npcId: npc.id,
    at: { ...context.now },
    selected,
    candidates,
    rejected,
    hysteresisApplied,
    satisficingApplied,
    incumbentCapabilityId,
    activeGoalKind,
    commitEligibility: getNpcBrainCommitEligibility(activeGoalKind, selected?.capabilityId),
  };
}
