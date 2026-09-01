import type {
  BrainBelief,
  BrainState,
  BrainTime,
  Fact,
  NpcKnowledgeMessage,
  NpcPerceptionSnapshot,
  NpcRecord,
  WorldState,
} from '@taosim/contracts';
import { getVenue, getVenuesByNode } from '../overworld/map-catalog.js';

const MAX_DIRECT_NPC_OBSERVATIONS = 24;
const MAX_FACT_OBSERVATIONS = 16;
const MAX_PERSISTED_BELIEFS = 32;
const DIRECT_LOCATION_TTL_MONTHS = 3;
const HEARSAY_TTL_MONTHS = 12;
const INDEXED_FACT_WINDOW = MAX_FACT_OBSERVATIONS * 2;

function monthOrdinal(time: BrainTime): number {
  return (time.year - 1) * 12 + time.month;
}

function addMonths(time: BrainTime, months: number): BrainTime {
  const ordinal = monthOrdinal(time) - 1 + months;
  return { year: Math.floor(ordinal / 12) + 1, month: (ordinal % 12) + 1 };
}

export interface NpcPerceptionIndex {
  npcsByLocation: ReadonlyMap<string, readonly NpcRecord[]>;
  publicFacts: readonly Fact[];
  factsByLocation: ReadonlyMap<string, readonly Fact[]>;
  factsByParticipant: ReadonlyMap<string, readonly Fact[]>;
  factsByFaction: ReadonlyMap<string, readonly Fact[]>;
}

function addIndexed<T>(map: Map<string, T[]>, key: string | undefined, value: T): void {
  if (!key) return;
  const entries = map.get(key) ?? [];
  entries.push(value);
  map.set(key, entries);
}

/** 月初构建一次，避免每个 NPC 扫描全世界，并冻结本月观察顺序。 */
export function createNpcPerceptionIndex(world: Readonly<WorldState>): NpcPerceptionIndex {
  const npcsByLocation = new Map<string, NpcRecord[]>();
  for (const npc of Object.values(world.npcs)) {
    if (npc.soulState === 'Active') addIndexed(npcsByLocation, npc.locationId, npc);
  }
  const publicFacts: Fact[] = [];
  const factsByLocation = new Map<string, Fact[]>();
  const factsByParticipant = new Map<string, Fact[]>();
  const factsByFaction = new Map<string, Fact[]>();
  for (const fact of world.facts ?? []) {
    if (fact.visibility === 'public') publicFacts.push(fact);
    if (fact.visibility === 'local') addIndexed(factsByLocation, fact.locationId, fact);
    if (fact.visibility === 'faction') {
      const factionId = typeof fact.metadata?.factionId === 'string' ? fact.metadata.factionId : undefined;
      addIndexed(factsByFaction, factionId, fact);
    }
    for (const participant of fact.participants) {
      addIndexed(factsByParticipant, participant.entityId, fact);
    }
  }
  const recent = (facts: Fact[]) => facts
    .sort((a, b) => monthOrdinal(b.at) - monthOrdinal(a.at) || b.factId.localeCompare(a.factId))
    .slice(0, INDEXED_FACT_WINDOW);
  const boundMap = (map: Map<string, Fact[]>) => new Map(
    [...map.entries()].map(([key, facts]) => [key, recent(facts)]),
  );
  return {
    npcsByLocation,
    publicFacts: recent(publicFacts),
    factsByLocation: boundMap(factsByLocation),
    factsByParticipant: boundMap(factsByParticipant),
    factsByFaction: boundMap(factsByFaction),
  };
}

/** 只读取观察者可达的信息；不把 WorldState 全量档案直接交给普通 NPC。 */
export function buildNpcPerceptionSnapshot(
  observer: Readonly<NpcRecord>,
  world: Readonly<WorldState>,
  now: BrainTime,
  index: NpcPerceptionIndex = createNpcPerceptionIndex(world),
): NpcPerceptionSnapshot {
  const currentVenue = observer.locationId ? getVenue(observer.locationId) : undefined;
  const knownLocationIds = currentVenue
    ? getVenuesByNode(currentVenue.nodeId).map((venue) => venue.id).sort()
    : observer.locationId ? [observer.locationId] : [];
  const observations: NpcKnowledgeMessage[] = [];

  const visibleNpcs = [...(observer.locationId ? index.npcsByLocation.get(observer.locationId) ?? [] : [])]
    .filter((npc) => npc.id !== observer.id
      && npc.soulState === 'Active'
      && npc.locationId !== undefined
      && npc.locationId === observer.locationId)
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, MAX_DIRECT_NPC_OBSERVATIONS);
  for (const npc of visibleNpcs) {
    observations.push({
      messageId: `${observer.id}:observe:location:${npc.id}:${now.year}:${now.month}`,
      topic: 'location',
      subject: { kind: 'npc', entityId: npc.id },
      value: npc.locationId!,
      source: { type: 'observation' },
      observedAt: { ...now },
      confidence: 1,
      expiresAt: addMonths(now, DIRECT_LOCATION_TTL_MONTHS),
    });
  }

  const factPool = [
    ...index.publicFacts,
    ...(observer.locationId ? index.factsByLocation.get(observer.locationId) ?? [] : []),
    ...(index.factsByParticipant.get(observer.id) ?? []),
    ...(observer.factionId ? index.factsByFaction.get(observer.factionId) ?? [] : []),
  ];
  const visibleFacts = [...new Map(factPool.map((fact) => [fact.factId, fact])).values()]
    .sort((a, b) => monthOrdinal(b.at) - monthOrdinal(a.at) || b.factId.localeCompare(a.factId))
    .slice(0, MAX_FACT_OBSERVATIONS);
  for (const fact of visibleFacts) {
    const direct = fact.participants.some((entry) => entry.entityId === observer.id)
      || (fact.visibility === 'local' && fact.locationId === observer.locationId);
    const observedAt = direct ? now : fact.at;
    const expiresAt = direct ? undefined : addMonths(observedAt, HEARSAY_TTL_MONTHS);
    if (expiresAt && monthOrdinal(expiresAt) <= monthOrdinal(now)) continue;
    observations.push({
      messageId: `${observer.id}:fact:${fact.factId}`,
      topic: 'fact',
      subject: { kind: 'fact', entityId: fact.factId },
      // 正文只保留在唯一事实账本；Brain 保存引用和相信/不相信，避免 800 份文本副本。
      value: true,
      source: { type: direct ? 'observation' : 'hearsay', factId: fact.factId },
      observedAt: { ...observedAt },
      confidence: direct ? 1 : 0.6,
      expiresAt,
    });
  }

  return {
    observerId: observer.id,
    at: { ...now },
    locationId: observer.locationId,
    knownLocationIds,
    observations,
  };
}

export interface NpcKnowledgeUpdateResult {
  brain: BrainState;
  learnedCount: number;
  questionedCount: number;
  prunedCount: number;
}

export interface NpcKnowledgeUpdateOptions {
  /** 本次事务必须留下的消息；仅影响容量裁剪顺序，不提高可信度。 */
  retainMessageIds?: readonly string[];
}

function beliefIdOf(message: NpcKnowledgeMessage): string {
  return `belief:${message.topic}:${message.subject.kind}:${message.subject.entityId}`;
}

/** 消息转信念并处理时效；低置信、过期知识优先被有界裁剪。 */
export function updateNpcKnowledge(
  brain: Readonly<BrainState>,
  messages: readonly NpcKnowledgeMessage[],
  now: BrainTime,
  options: NpcKnowledgeUpdateOptions = {},
): NpcKnowledgeUpdateResult {
  const beliefs: Record<string, BrainBelief> = Object.fromEntries(
    Object.entries(brain.beliefs).map(([id, belief]) => [id, { ...belief }]),
  );
  let learnedCount = 0;
  let questionedCount = 0;
  for (const belief of Object.values(beliefs)) {
    if (belief.status === 'active'
      && belief.expiresAt
      && monthOrdinal(belief.expiresAt) <= monthOrdinal(now)) {
      belief.status = 'questioned';
      questionedCount++;
    }
  }

  for (const message of messages) {
    const beliefId = beliefIdOf(message);
    const existing = beliefs[beliefId];
    if (existing) {
      const timeDelta = monthOrdinal(message.observedAt) - monthOrdinal(existing.observedAt);
      if (timeDelta < 0 || (timeDelta === 0 && message.confidence <= existing.confidence)) continue;
    }
    beliefs[beliefId] = {
      beliefId,
      topic: message.topic,
      subject: { ...message.subject },
      value: message.value,
      source: { ...message.source },
      observedAt: { ...message.observedAt },
      confidence: Math.max(0, Math.min(1, message.confidence)),
      status: 'active',
      expiresAt: message.expiresAt ? { ...message.expiresAt } : undefined,
    };
    learnedCount++;
  }

  const retainedBeliefIds = new Set(messages
    .filter((message) => options.retainMessageIds?.includes(message.messageId))
    .map(beliefIdOf));
  const activePlanTargetIds = new Set(
    brain.currentPlan?.status === 'active'
      ? brain.currentPlan.steps.flatMap((step) => step.targets.map((target) => target.entityId))
      : [],
  );
  for (const [beliefId, belief] of Object.entries(beliefs)) {
    if (activePlanTargetIds.has(belief.subject.entityId)
      || (typeof belief.value === 'string' && activePlanTargetIds.has(belief.value))) {
      retainedBeliefIds.add(beliefId);
    }
  }
  const ranked = Object.entries(beliefs).sort(([idA, a], [idB, b]) => {
    const retentionDelta = Number(retainedBeliefIds.has(idB)) - Number(retainedBeliefIds.has(idA));
    if (retentionDelta !== 0) return retentionDelta;
    const statusRank = (belief: BrainBelief) => belief.status === 'active' ? 1 : 0;
    return statusRank(b) - statusRank(a)
      || b.confidence - a.confidence
      || monthOrdinal(b.observedAt) - monthOrdinal(a.observedAt)
      || a.beliefId.localeCompare(b.beliefId);
  });
  const bounded = Object.fromEntries(ranked.slice(0, MAX_PERSISTED_BELIEFS));
  const prunedCount = Math.max(0, ranked.length - MAX_PERSISTED_BELIEFS);
  const changed = learnedCount > 0 || questionedCount > 0 || prunedCount > 0;
  return {
    brain: changed ? { ...brain, revision: brain.revision + 1, beliefs: bounded } : brain as BrainState,
    learnedCount,
    questionedCount,
    prunedCount,
  };
}
