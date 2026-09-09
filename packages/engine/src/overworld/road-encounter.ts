import type {
  ActiveWorldEncounter,
  Character,
  Fact,
  NpcRecord,
  RoadEncounterIntent,
  SpatialLink,
  TravelRouteSegment,
  TravelState,
  WorldOutcome,
  WorldState,
  PlayerEncounterChoice,
  WorldEncounterChange,
} from '@taosim/contracts';
import { evaluateSpatialTravelPosition, pauseSpatialTravel, resumeSpatialTravel } from './spatial-travel.js';
import { projectTime } from '../time/world-clock.js';
import { commitOutcome } from '../world/outcome-committer.js';

const MINUTES_PER_DAY = 1_440;

export interface RoadEncounterCandidate {
  encounterId: string;
  npcId: string;
  intent: RoadEncounterIntent;
  occursAtMinutes: number;
  linkId: string;
  progress: number;
  nodeId: string;
  playerTravelId: string;
  npcTravelId: string;
}

export type RoadEncounterChoiceResult =
  | { ok: true; updatedPlayer: Character; launchBattle: boolean; npc: NpcRecord }
  | { ok: false; reason: 'encounter_missing' | 'not_awaiting_decision' | 'choice_unavailable' | 'stale_travel' | 'commit_failed' };

export interface RoadEncounterBattleCompletion {
  updatedPlayer: Character;
  npcTravel: TravelState;
  encounterChange: WorldEncounterChange;
}

interface TravelLegWindow {
  linkId: string;
  fromNodeId: string;
  toNodeId: string;
  startsAtMinutes: number;
  endsAtMinutes: number;
  positionAtStart: number;
  velocityPerMinute: number;
  distance: number;
}

/**
 * 查找一个时间窗内最早的真实 NPC 道路接触。候选只由已存在的旅行轨迹和
 * NPC 持久化意图产生；函数不掷随机数、不写事实，也不修改输入状态。
 */
export function findEarliestRoadEncounter(
  world: Readonly<WorldState>,
  player: Readonly<Character>,
  untilMinutes: number,
): RoadEncounterCandidate | null {
  const nowMinutes = world.elapsedMinutes ?? 0;
  const playerTravel = player.travel;
  const spatial = world.spatialState;
  if (!spatial || !playerTravel || playerTravel.status !== 'in_transit' || untilMinutes <= nowMinutes) return null;
  if (Object.values(world.activeEncounters ?? {}).some((encounter) =>
    encounter.status === 'awaiting_decision' && encounter.playerId === player.id)) return null;

  const playerLegs = remainingLegWindows(playerTravel, spatial.links, nowMinutes, untilMinutes);
  let earliest: RoadEncounterCandidate | null = null;
  for (const npc of Object.values(world.npcs)) {
    if (npc.soulState !== 'Active' || !npc.travel || npc.travel.status !== 'in_transit') continue;
    const intent = roadIntentForNpc(npc, player.id);
    if (!intent) continue;
    const encounterKey = roadEncounterKey(playerTravel, npc.travel);
    if (playerTravel.encounteredFactIds.includes(encounterKey)
      || npc.travel.encounteredFactIds.includes(encounterKey)) continue;
    const npcLegs = remainingLegWindows(npc.travel, spatial.links, nowMinutes, untilMinutes);
    for (const playerLeg of playerLegs) {
      for (const npcLeg of npcLegs) {
        if (playerLeg.linkId !== npcLeg.linkId) continue;
        const contact = solveLegContact(playerLeg, npcLeg);
        if (!contact || contact.occursAtMinutes > untilMinutes) continue;
        const candidate: RoadEncounterCandidate = {
          encounterId: `ENCOUNTER_${encounterKey}`,
          npcId: npc.id,
          intent,
          occursAtMinutes: contact.occursAtMinutes,
          linkId: playerLeg.linkId,
          progress: contact.progress,
          nodeId: contact.progress < 0.5 ? playerLeg.fromNodeId : playerLeg.toNodeId,
          playerTravelId: playerTravel.travelId,
          npcTravelId: npc.travel.travelId,
        };
        if (!earliest || candidate.occursAtMinutes < earliest.occursAtMinutes
          || (candidate.occursAtMinutes === earliest.occursAtMinutes && candidate.npcId < earliest.npcId)) {
          earliest = candidate;
        }
      }
    }
  }
  return earliest;
}

/** 在接触分钟创建可存档相遇，并把 NPC 行程与事实纳入同一事务。 */
export function createRoadEncounterOutcome(
  world: Readonly<WorldState>,
  player: Readonly<Character>,
  candidate: RoadEncounterCandidate,
): { encounter: ActiveWorldEncounter; pausedPlayer: Character; outcome: WorldOutcome } | null {
  const npc = world.npcs[candidate.npcId];
  if (!npc?.travel || !player.travel
    || npc.travel.travelId !== candidate.npcTravelId
    || player.travel.travelId !== candidate.playerTravelId) return null;

  const atMinutes = world.elapsedMinutes ?? candidate.occursAtMinutes;
  const encounterKey = roadEncounterKey(player.travel, npc.travel);
  const startFactId = encounterKey;
  const pausedPlayerTravel = appendEncounterMarker(pauseSpatialTravel(player.travel, atMinutes), startFactId);
  const pausedNpcTravel = appendEncounterMarker(pauseSpatialTravel(npc.travel, atMinutes), startFactId);
  if (pausedPlayerTravel.status === 'arrived' || pausedNpcTravel.status === 'arrived') return null;

  const encounter: ActiveWorldEncounter = {
    encounterId: candidate.encounterId,
    kind: 'road_contact',
    status: 'awaiting_decision',
    source: 'npc_intent',
    intent: candidate.intent,
    initiatorNpcId: npc.id,
    playerId: player.id,
    participantIds: [player.id, npc.id],
    occursAtMinutes: atMinutes,
    location: {
      linkId: candidate.linkId,
      progress: candidate.progress,
      nodeId: candidate.nodeId,
    },
    travelGenerations: {
      [player.id]: pausedPlayerTravel.planGeneration ?? 1,
      [npc.id]: pausedNpcTravel.planGeneration ?? 1,
    },
    availableChoices: candidate.intent === 'ambush'
      ? ['fight', 'avoid']
      : ['talk', 'avoid', 'fight'],
    startFactId,
  };
  const at = projectTime(atMinutes);
  const fact: Fact = {
    factId: startFactId,
    type: 'custom',
    at: { year: at.year, month: at.month },
    locationId: candidate.nodeId,
    participants: [
      { entityId: player.id, role: 'traveler' },
      { entityId: npc.id, role: 'initiator' },
    ],
    title: `${player.name}途中遇见${npc.name}`,
    description: encounterDescription(candidate.intent, npc.name),
    visibility: 'local',
    metadata: {
      encounterId: encounter.encounterId,
      intent: candidate.intent,
      occursAtMinutes: atMinutes,
      linkId: candidate.linkId,
      progress: candidate.progress,
    },
  };
  return {
    encounter,
    pausedPlayer: { ...player, travel: pausedPlayerTravel },
    outcome: {
      outcomeId: `OUTCOME_START_${candidate.encounterId}`,
      baseRevision: world.worldRevision ?? 0,
      source: 'road_encounter_start',
      entityDeltas: [{ entityId: npc.id, travelChanged: pausedNpcTravel }],
      encounterChanges: [{ type: 'upsert', encounter }],
      facts: [fact],
    },
  };
}

/**
 * 提交玩家对相遇的选择。交谈/避让会结束相遇并恢复双方行程；战斗选择只把
 * 相遇推进到 active，交由 BattleOverlay 用同一 battle outcome 完成结算。
 */
export function chooseRoadEncounter(
  world: WorldState,
  player: Character,
  encounterId: string,
  choice: PlayerEncounterChoice,
): RoadEncounterChoiceResult {
  const encounter = world.activeEncounters?.[encounterId];
  if (!encounter) return { ok: false, reason: 'encounter_missing' };
  if (encounter.status !== 'awaiting_decision') return { ok: false, reason: 'not_awaiting_decision' };
  if (!encounter.availableChoices.includes(choice)) return { ok: false, reason: 'choice_unavailable' };
  const npc = world.npcs[encounter.initiatorNpcId];
  if (!npc?.travel || !player.travel
    || npc.travel.status !== 'paused' || player.travel.status !== 'paused'
    || (npc.travel.planGeneration ?? 1) !== encounter.travelGenerations[npc.id]
    || (player.travel.planGeneration ?? 1) !== encounter.travelGenerations[player.id]) {
    return { ok: false, reason: 'stale_travel' };
  }

  const atMinutes = world.elapsedMinutes ?? encounter.occursAtMinutes;
  const at = projectTime(atMinutes);
  const resolutionFactId = `FACT_CHOICE_${encounterId}_${choice}`;
  const fact: Fact = {
    factId: resolutionFactId,
    type: 'custom',
    at: { year: at.year, month: at.month },
    locationId: encounter.location.nodeId,
    participants: [
      { entityId: player.id, role: 'chooser' },
      { entityId: npc.id, role: 'initiator' },
    ],
    title: encounterChoiceTitle(choice, npc.name),
    description: encounterChoiceDescription(choice, npc.name),
    visibility: 'local',
    metadata: { encounterId, choice, occursAtMinutes: atMinutes },
  };

  if (choice === 'fight') {
    const active: ActiveWorldEncounter = {
      ...encounter,
      status: 'active',
      chosen: choice,
      resolutionFactId,
    };
    const result = commitOutcome(world, {
      outcomeId: `OUTCOME_CHOICE_${encounterId}_${choice}`,
      baseRevision: world.worldRevision ?? 0,
      source: 'road_encounter_choice',
      entityDeltas: [],
      encounterChanges: [{ type: 'upsert', encounter: active }],
      facts: [fact],
    });
    return result.status === 'success' || result.status === 'already_applied'
      ? { ok: true, updatedPlayer: player, launchBattle: true, npc }
      : { ok: false, reason: 'commit_failed' };
  }

  const resumedPlayerTravel = resumeSpatialTravel(player.travel, atMinutes);
  const resumedNpcTravel = resumeSpatialTravel(npc.travel, atMinutes);
  const result = commitOutcome(world, {
    outcomeId: `OUTCOME_CHOICE_${encounterId}_${choice}`,
    baseRevision: world.worldRevision ?? 0,
    source: 'road_encounter_choice',
    entityDeltas: [{ entityId: npc.id, travelChanged: resumedNpcTravel }],
    encounterChanges: [{ type: 'remove', encounterId }],
    facts: [fact],
  });
  if (result.status !== 'success' && result.status !== 'already_applied') {
    return { ok: false, reason: 'commit_failed' };
  }
  const updatedPlayer: Character = {
    ...player,
    travel: resumedPlayerTravel.status === 'arrived' ? undefined : resumedPlayerTravel,
    spatialAddress: resumedPlayerTravel.status === 'arrived'
      ? { ...resumedPlayerTravel.destination, occupancy: 'stationary' }
      : evaluateSpatialTravelPosition(resumedPlayerTravel).address,
  };
  return { ok: true, updatedPlayer, launchBattle: false, npc };
}

/** 为 BattleOverlay 的既有 WorldOutcome 提供相遇结束差量，避免第二次独立提交。 */
export function prepareRoadEncounterBattleCompletion(
  world: Readonly<WorldState>,
  player: Readonly<Character>,
  encounterId: string,
): RoadEncounterBattleCompletion | null {
  const encounter = world.activeEncounters?.[encounterId];
  const npc = encounter ? world.npcs[encounter.initiatorNpcId] : undefined;
  if (!encounter || encounter.status !== 'active' || !npc?.travel || !player.travel) return null;
  const atMinutes = world.elapsedMinutes ?? encounter.occursAtMinutes;
  const npcTravel = resumeSpatialTravel(npc.travel, atMinutes);
  const playerTravel = resumeSpatialTravel(player.travel, atMinutes);
  return {
    updatedPlayer: {
      ...player,
      travel: playerTravel.status === 'arrived' ? undefined : playerTravel,
      spatialAddress: playerTravel.status === 'arrived'
        ? { ...playerTravel.destination, occupancy: 'stationary' }
        : evaluateSpatialTravelPosition(playerTravel).address,
    },
    npcTravel,
    encounterChange: { type: 'remove', encounterId },
  };
}

function roadIntentForNpc(npc: Readonly<NpcRecord>, playerId: string): RoadEncounterIntent | null {
  const targetIds = new Set([
    ...(npc.brain?.currentGoal?.targets ?? []),
    ...(npc.brain?.currentAction?.targets ?? []),
  ].filter((target) => target.kind === 'player' || target.kind === 'npc').map((target) => target.entityId));
  const relation = npc.relations[playerId];
  if ((npc.brain?.currentAction?.capabilityId === 'revenge_ambush'
      || npc.brain?.currentGoal?.kind === 'seek_revenge'
      || npc.mind?.currentGoal.type === 'seek_revenge'
      || npc.aspiration === 'seekRevenge')
    && (targetIds.has(playerId) || relation?.type === 'enemy')) return 'ambush';
  if ((npc.mind?.nextAction.type === 'challenge'
      || npc.brain?.currentAction?.capabilityId === 'challenge')
    && targetIds.has(playerId)) return 'challenge';
  if (npc.mind?.nextAction.type === 'socialize'
    || npc.brain?.currentAction?.capabilityId === 'socialize'
    || (npc.brain?.currentGoal?.kind === 'explore'
      && (npc.brain.profile.behavioralBiases.sociability ?? 0) >= 65)) return 'greet';
  return null;
}

function roadEncounterKey(playerTravel: TravelState, npcTravel: TravelState): string {
  return `FACT_ROAD_CONTACT_${playerTravel.travelId}_${npcTravel.travelId}`;
}

function appendEncounterMarker(travel: TravelState, factId: string): TravelState {
  return {
    ...travel,
    encounteredFactIds: travel.encounteredFactIds.includes(factId)
      ? travel.encounteredFactIds
      : [...travel.encounteredFactIds, factId],
  };
}

function remainingLegWindows(
  travel: TravelState,
  links: Record<string, SpatialLink>,
  nowMinutes: number,
  untilMinutes: number,
): TravelLegWindow[] {
  const result: TravelLegWindow[] = [];
  let startsAtMinutes = nowMinutes;
  const startIndex = Math.max(0, travel.currentSegmentIndex ?? 0);
  for (let index = startIndex; index < travel.route.length; index++) {
    const segment = travel.route[index]!;
    const consumed = index === startIndex ? Math.max(0, travel.distanceOnCurrentSegment ?? 0) : 0;
    const remaining = Math.max(0, segment.distance - consumed);
    const duration = (remaining / travel.speed) * MINUTES_PER_DAY;
    const endsAtMinutes = startsAtMinutes + duration;
    if (segment.kind === 'local_path') {
      startsAtMinutes = endsAtMinutes;
      continue;
    }
    const link = links[segment.linkId];
    if (!link || link.status !== 'active') {
      startsAtMinutes = endsAtMinutes;
      continue;
    }
    if (startsAtMinutes > untilMinutes) break;
    const forward = isCanonicalDirection(segment, link);
    result.push({
      linkId: segment.linkId,
      fromNodeId: link.fromNodeId,
      toNodeId: link.toNodeId,
      startsAtMinutes,
      endsAtMinutes,
      positionAtStart: forward ? consumed : segment.distance - consumed,
      velocityPerMinute: (forward ? 1 : -1) * travel.speed / MINUTES_PER_DAY,
      distance: segment.distance,
    });
    startsAtMinutes = endsAtMinutes;
  }
  return result;
}

function isCanonicalDirection(segment: TravelRouteSegment, link: SpatialLink): boolean {
  return segment.fromNodeId === link.fromNodeId && segment.toNodeId === link.toNodeId;
}

function solveLegContact(
  first: TravelLegWindow,
  second: TravelLegWindow,
): { occursAtMinutes: number; progress: number } | null {
  const overlapStart = Math.max(first.startsAtMinutes, second.startsAtMinutes);
  const overlapEnd = Math.min(first.endsAtMinutes, second.endsAtMinutes);
  if (overlapEnd < overlapStart) return null;
  const firstAtOverlap = first.positionAtStart
    + first.velocityPerMinute * (overlapStart - first.startsAtMinutes);
  const secondAtOverlap = second.positionAtStart
    + second.velocityPerMinute * (overlapStart - second.startsAtMinutes);
  const relativeVelocity = first.velocityPerMinute - second.velocityPerMinute;
  if (Math.abs(relativeVelocity) < Number.EPSILON) {
    if (Math.abs(firstAtOverlap - secondAtOverlap) > 1e-9) return null;
    return { occursAtMinutes: Math.ceil(overlapStart), progress: clampProgress(firstAtOverlap / first.distance) };
  }
  const offsetMinutes = (secondAtOverlap - firstAtOverlap) / relativeVelocity;
  const contactAt = overlapStart + offsetMinutes;
  if (contactAt < overlapStart - 1e-9 || contactAt > overlapEnd + 1e-9) return null;
  const contactPosition = firstAtOverlap + first.velocityPerMinute * offsetMinutes;
  return {
    occursAtMinutes: Math.ceil(contactAt),
    progress: clampProgress(contactPosition / first.distance),
  };
}

function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function encounterDescription(intent: RoadEncounterIntent, npcName: string): string {
  if (intent === 'ambush') return `${npcName}依照自己的寻仇计划在道路上截住了你。`;
  if (intent === 'challenge') return `${npcName}为求一战在道路上拦下了你。`;
  return `${npcName}在同行途中主动上前与你搭话。`;
}

function encounterChoiceTitle(choice: PlayerEncounterChoice, npcName: string): string {
  if (choice === 'fight') return `决定与${npcName}交战`;
  if (choice === 'talk') return `与${npcName}途中交谈`;
  return `避开${npcName}继续赶路`;
}

function encounterChoiceDescription(choice: PlayerEncounterChoice, npcName: string): string {
  if (choice === 'fight') return `双方在道路上摆开阵势，行程保持暂停直到战斗结算。`;
  if (choice === 'talk') return `你回应了${npcName}，短暂交谈后双方继续原定行程。`;
  return `你没有停留，与${npcName}错身后继续原定行程。`;
}
