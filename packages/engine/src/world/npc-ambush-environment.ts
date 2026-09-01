import type {
  BrainBelief, BrainMemory, BrainTime, CommitResult, EntityDelta, Fact, NpcRecord, WorldState,
} from '@taosim/contracts';
import { getVenue } from '../overworld/map-catalog.js';
import { PRESET_MAP } from '../overworld/preset-map.js';
import { commitOutcome } from './outcome-committer.js';

const MAX_WITNESSES = 8;

export type LocationLawLevel = 'none' | 'regulated' | 'strict';

export interface AmbushEnvironmentAssessment {
  locationId: string;
  lawLevel: LocationLawLevel;
  witnessIds: string[];
  guardIds: string[];
  intervention: 'none' | 'guard_blocked';
}

function lawLevelOf(locationId: string): LocationLawLevel {
  const venue = getVenue(locationId);
  const nodeId = venue?.nodeId ?? locationId;
  const node = PRESET_MAP.continents
    .flatMap((continent) => Object.values(continent.nodes))
    .find((candidate) => candidate.id === nodeId);
  if (node?.type === 'City' || node?.type === 'Sect') return 'strict';
  if (node?.type === 'Market' || venue) return 'regulated';
  return 'none';
}

function willGuardIntervene(
  candidate: Readonly<NpcRecord>,
  attacker: Readonly<NpcRecord>,
  defender: Readonly<NpcRecord>,
): boolean {
  const hasAuthority = candidate.socialRank === 'elder' || candidate.socialRank === 'sectMaster'
    || candidate.identity?.socialIdentityIds.includes('law_enforcer') === true
    || (!!candidate.factionId && candidate.factionId === defender.factionId && candidate.socialRank === 'disciple');
  if (!hasAuthority) return false;
  const attackerRelation = candidate.relations[attacker.id];
  const defenderRelation = candidate.relations[defender.id];
  const duty = candidate.brain
    ? candidate.brain.profile.valueWeights.reputation
      + candidate.brain.profile.behavioralBiases.aggression
      + candidate.brain.profile.behavioralBiases.riskTolerance
    : 150;
  const relationModifier = (candidate.factionId && candidate.factionId === defender.factionId ? 50 : 0)
    + Math.max(-50, Math.min(50, (defenderRelation?.bond ?? 0) * 0.5))
    - Math.max(-50, Math.min(50, (attackerRelation?.bond ?? 0) * 0.5));
  return duty + relationModifier >= 140;
}

/** 权威在场查询：环境可以看真实地点；NPC 大脑仍只接收观察与事实，不获得全知坐标。 */
export function assessAmbushEnvironment(
  world: Readonly<WorldState>,
  attackerId: string,
  defenderId: string,
  locationId: string,
): AmbushEnvironmentAssessment {
  const defender = world.npcs[defenderId];
  const attacker = world.npcs[attackerId];
  const witnessIds = Object.values(world.npcs)
    .filter((npc) => npc.soulState === 'Active' && npc.locationId === locationId
      && npc.id !== attackerId && npc.id !== defenderId)
    .map((npc) => npc.id)
    .sort()
    .slice(0, MAX_WITNESSES);
  const lawLevel = lawLevelOf(locationId);
  const guardIds = defender && attacker
    ? witnessIds.filter((id) => willGuardIntervene(world.npcs[id]!, attacker, defender))
    : [];
  return {
    locationId,
    lawLevel,
    witnessIds,
    guardIds,
    intervention: lawLevel !== 'none' && guardIds.length > 0 ? 'guard_blocked' : 'none',
  };
}

function witnessDelta(
  witnessId: string,
  attacker: Readonly<NpcRecord>,
  defender: Readonly<NpcRecord>,
  now: BrainTime,
  factId: string,
  blocked: boolean,
): EntityDelta {
  const memory: BrainMemory = {
    memoryId: `${witnessId}:memory:${factId}`,
    kind: 'experience',
    at: { ...now },
    factId,
    participantIds: [witnessId, attacker.id, defender.id],
    locationId: attacker.locationId,
    summary: blocked
      ? `目睹${attacker.name}试图袭击${defender.name}，被现场守卫制止。`
      : `目睹${attacker.name}在此袭击${defender.name}。`,
    valence: -35,
    salience: 75,
  };
  const beliefId = `${witnessId}:belief:threat:${attacker.id}`;
  const belief: BrainBelief = {
    beliefId,
    topic: 'threat',
    subject: { kind: 'npc', entityId: attacker.id },
    value: blocked ? 'attempted_ambush' : 'committed_ambush',
    source: { type: 'observation', factId },
    observedAt: { ...now },
    confidence: 1,
    status: 'active',
  };
  return { entityId: witnessId, memoriesAdded: [memory], beliefsUpserted: [belief] };
}

export interface AmbushWitnessOutcomeAdditions {
  fact: Fact;
  entityDeltas: EntityDelta[];
}

function createObservationAdditions(
  world: Readonly<WorldState>,
  attackerId: string,
  defenderId: string,
  now: BrainTime,
  encounterId: string,
  assessment: Readonly<AmbushEnvironmentAssessment>,
  blocked: boolean,
): AmbushWitnessOutcomeAdditions {
  const attacker = world.npcs[attackerId]!;
  const defender = world.npcs[defenderId]!;
  const factId = `fact:${encounterId}:${blocked ? 'guard-intervention' : 'witnessed-crime'}`;
  const observerIds = blocked
    ? [...new Set([...assessment.guardIds, ...assessment.witnessIds])]
    : assessment.witnessIds;
  const fact: Fact = {
    factId,
    type: 'custom',
    at: { ...now },
    locationId: assessment.locationId,
    participants: [
      { entityId: attackerId, role: 'suspect' },
      { entityId: defenderId, role: 'target' },
      ...observerIds.map((entityId) => ({ entityId, role: assessment.guardIds.includes(entityId) ? 'guard' : 'witness' })),
    ],
    title: blocked ? `${attacker.name}的袭击被守卫制止` : `${attacker.name}袭击${defender.name}被人目睹`,
    description: blocked
      ? `${assessment.guardIds.length}名守卫介入，使袭击未能转入斗法。`
      : `${assessment.witnessIds.length}名在场者目睹了袭击，消息可能沿当地社会关系传播。`,
    visibility: assessment.lawLevel === 'none' ? 'local' : 'public',
    metadata: {
      encounterId,
      lawLevel: assessment.lawLevel,
      witnessCount: assessment.witnessIds.length,
      guardCount: assessment.guardIds.length,
      blocked,
    },
  };
  const entityDeltas = observerIds
    .map((witnessId) => world.npcs[witnessId])
    .filter((witness): witness is NpcRecord => !!witness?.brain)
    .map((witness) => witnessDelta(witness.id, attacker, defender, now, factId, blocked));
  return { fact, entityDeltas };
}

export function commitGuardIntervention(
  world: WorldState,
  attackerId: string,
  defenderId: string,
  now: BrainTime,
  encounterId: string,
  assessment: Readonly<AmbushEnvironmentAssessment>,
): CommitResult {
  const additions = createObservationAdditions(world, attackerId, defenderId, now, encounterId, assessment, true);
  return commitOutcome(world, {
    outcomeId: `${encounterId}:guard-intervention`,
    baseRevision: world.worldRevision ?? 0,
    source: 'guard_intervention',
    entityDeltas: additions.entityDeltas,
    facts: [additions.fact],
  });
}

export function createAmbushWitnessOutcomeAdditions(
  world: Readonly<WorldState>,
  attackerId: string,
  defenderId: string,
  now: BrainTime,
  encounterId: string,
  assessment: Readonly<AmbushEnvironmentAssessment>,
): AmbushWitnessOutcomeAdditions | undefined {
  return assessment.witnessIds.length > 0
    ? createObservationAdditions(world, attackerId, defenderId, now, encounterId, assessment, false)
    : undefined;
}
