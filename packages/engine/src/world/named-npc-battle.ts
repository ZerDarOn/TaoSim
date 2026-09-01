import type {
  BrainTime,
  Character,
  CommitResult,
  EntityDelta,
  Fact,
  HexBattleMap,
  Injury,
  NamedBattleResolution,
  NamedEncounterContext,
  SocialEntry,
  WorldOutcome,
  WorldState,
} from '@taosim/contracts';
import { NamedBattleSession } from '../battle/named-battle-session.js';
import { expandForScene } from './scene-projection.js';
import { commitOutcome } from './outcome-committer.js';

const DEFAULT_MAX_TICKS = 2_000;
const PARTIAL_LOOT_RATE = 0.3;
const PARTIAL_LOOT_CAP = 500;

export interface NamedNpcBattleRequest {
  encounterId: string;
  attackerId: string;
  defenderId: string;
  kind: 'duel' | 'deadly';
  locationId: string;
  seed: number;
  maxTicks?: number;
  allowFlee?: boolean;
  allowSurrender?: boolean;
  lootPolicy?: 'none' | 'partial' | 'all_on_elimination';
  relationPolicy?: 'hostile' | 'preserve';
  approach?: 'open' | 'ambush';
  ambushDetected?: boolean;
  /** 已通过侦察结算获得的先手值；只改变 ATB 起点。 */
  attackerInitialGauge?: number;
}

export interface NamedNpcBattleSimulation {
  context: NamedEncounterContext;
  resolution: NamedBattleResolution;
  charactersAfter: Record<string, Character>;
}

export type SimulateNamedNpcBattleResult =
  | { status: 'simulated'; simulation: NamedNpcBattleSimulation }
  | { status: 'failed'; reason: 'invalid_request' | 'participant_not_found' | 'participant_inactive' | 'not_co_located' | 'battle_start_failed' };

export type CommitNamedNpcBattleResult =
  | { status: 'committed' | 'already_committed'; resolution: NamedBattleResolution; outcome: WorldOutcome; commit: CommitResult }
  | { status: 'failed'; reason: 'participant_not_found' | 'version_conflict' | 'outcome_validation_failed'; resolution: NamedBattleResolution };

function plainBattleMap(width = 7, height = 7): HexBattleMap {
  const tiles: HexBattleMap['tiles'] = {};
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      tiles[`${q},${r}`] = {
        q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true,
      };
    }
  }
  return { width, height, tiles };
}

/** 展开真实 NPC，并由 BattleEngine 全自动演算；此阶段不修改 WorldState。 */
export function simulateNamedNpcBattle(
  world: Readonly<WorldState>,
  request: Readonly<NamedNpcBattleRequest>,
): SimulateNamedNpcBattleResult {
  if (!request.encounterId || request.attackerId === request.defenderId
    || !request.locationId || !Number.isInteger(request.seed)) {
    return { status: 'failed', reason: 'invalid_request' };
  }
  const attacker = world.npcs[request.attackerId];
  const defender = world.npcs[request.defenderId];
  if (!attacker || !defender) return { status: 'failed', reason: 'participant_not_found' };
  if (attacker.soulState !== 'Active' || defender.soulState !== 'Active') {
    return { status: 'failed', reason: 'participant_inactive' };
  }
  if (attacker.locationId !== request.locationId || defender.locationId !== request.locationId) {
    return { status: 'failed', reason: 'not_co_located' };
  }
  const now = { year: world.currentYear, month: world.currentMonth };
  const attackerCharacter = expandForScene(attacker, {
    sceneType: 'battle', condition: world.conditions?.[attacker.id], currentTime: now,
    assets: Object.values(world.assets ?? {}).filter((asset) => asset.ownerId === attacker.id),
  });
  const defenderCharacter = expandForScene(defender, {
    sceneType: 'battle', condition: world.conditions?.[defender.id], currentTime: now,
    assets: Object.values(world.assets ?? {}).filter((asset) => asset.ownerId === defender.id),
  });
  const context: NamedEncounterContext = {
    encounterId: request.encounterId, kind: request.kind, seed: request.seed,
    locationId: request.locationId, startedAt: now,
    sideAIds: [attacker.id], sideBIds: [defender.id],
    maxTicks: request.maxTicks ?? DEFAULT_MAX_TICKS,
    approach: request.approach,
    ambushDetected: request.ambushDetected,
    initialGaugeById: request.attackerInitialGauge
      ? { [attacker.id]: request.attackerInitialGauge }
      : undefined,
  };
  try {
    const session = new NamedBattleSession(
      context,
      plainBattleMap(),
      [attackerCharacter],
      [defenderCharacter],
      {
        sceneConfig: {
          fleeEnabled: request.allowFlee ?? request.kind === 'deadly',
          surrenderEnabled: request.allowSurrender ?? request.kind === 'duel',
        },
        controllers: { [attacker.id]: 'AI', [defender.id]: 'AI' },
        initialGaugeById: context.initialGaugeById,
      },
    );
    const resolution = session.runToCompletion();
    return {
      status: 'simulated',
      simulation: {
        context, resolution,
        charactersAfter: structuredClone(session.getState().characters),
      },
    };
  } catch {
    return { status: 'failed', reason: 'battle_start_failed' };
  }
}

function addMonths(time: BrainTime, months: number): BrainTime {
  const ordinal = (time.year - 1) * 12 + time.month - 1 + months;
  return { year: Math.floor(ordinal / 12) + 1, month: ordinal % 12 + 1 };
}

function injuryFor(hpRatio: number, now: BrainTime): Injury | undefined {
  if (hpRatio >= 0.95) return undefined;
  const level = hpRatio <= 0.15 ? 'critical'
    : hpRatio <= 0.4 ? 'severe'
      : hpRatio <= 0.7 ? 'moderate' : 'minor';
  const recoveryMonths = { minor: 2, moderate: 4, severe: 8, critical: 12 }[level];
  return {
    level, source: 'named_battle', acquiredAt: { ...now }, recoversAt: addMonths(now, recoveryMonths),
  };
}

export interface CreateNpcBattleEntityDeltaInput {
  entityId: string;
  characterAfter: Readonly<Character>;
  kind: 'duel' | 'deadly';
  now: BrainTime;
  killedBy?: string;
  protectedFromDeath?: boolean;
}

/** 战斗副本到 NPC 长期状态的统一差量口径，UI 与后台共用。 */
export function createNpcBattleEntityDelta(
  input: Readonly<CreateNpcBattleEntityDeltaInput>,
): EntityDelta {
  const hpRatio = input.characterAfter.hp / Math.max(1, input.characterAfter.maxHp);
  const down = input.characterAfter.hp <= 0;
  const delta: EntityDelta = { entityId: input.entityId };
  if (input.kind === 'deadly' && down && !input.protectedFromDeath) {
    delta.killed = true;
    delta.killedBy = input.killedBy;
    delta.soulStateChanged = 'RemnantSoul';
    return delta;
  }
  if (input.kind === 'duel') {
    if (hpRatio < 0.95) {
      delta.injuriesAdded = [{
        level: 'minor', source: 'named_duel', acquiredAt: { ...input.now },
        recoversAt: addMonths(input.now, 1),
      }];
    }
    return delta;
  }
  const injury = injuryFor(down && input.protectedFromDeath ? 0.05 : hpRatio, input.now);
  if (injury) delta.injuriesAdded = [injury];
  return delta;
}

function nextHostileRelation(
  world: Readonly<WorldState>,
  ownerId: string,
  targetId: string,
  now: BrainTime,
  label: string,
): SocialEntry {
  const authoritative = world.socialStates?.[ownerId]?.[targetId];
  const legacy = world.npcs[ownerId]?.relations[targetId];
  return {
    targetId,
    type: 'enemy',
    bond: Math.max(-100, (authoritative?.bond ?? legacy?.bond ?? 0) - 8),
    trust: Math.max(0, (authoritative?.trust ?? legacy?.trust ?? 20) - 10),
    hatred: Math.min(100, (authoritative?.hatred ?? Math.max(0, -(legacy?.bond ?? 0))) + 12),
    jealousy: authoritative?.jealousy ?? 0,
    events: [...(authoritative?.events ?? legacy?.events ?? []), label],
    changedAt: { ...now },
    direction: authoritative?.direction ?? legacy?.direction,
  };
}

function outcomeFact(
  request: Readonly<NamedNpcBattleRequest>,
  simulation: NamedNpcBattleSimulation,
  factId: string,
  now: BrainTime,
  attackerName: string,
  defenderName: string,
): Fact {
  const winnerId = simulation.resolution.winnerSide === 'A'
    ? request.attackerId
    : simulation.resolution.winnerSide === 'B' ? request.defenderId : undefined;
  return {
    factId, outcomeId: request.encounterId, type: 'battle', at: { ...now }, locationId: request.locationId,
    participants: [
      { entityId: request.attackerId, role: 'attacker' },
      { entityId: request.defenderId, role: 'defender' },
    ],
    title: winnerId
      ? `${winnerId === request.attackerId ? attackerName : defenderName}在斗法中取胜`
      : `${attackerName}与${defenderName}斗法未分胜负`,
    description: `战斗历经 ${simulation.resolution.turnNumber} 个行动回合，以${simulation.resolution.termination}结束。`,
    visibility: 'local',
    metadata: {
      battleId: simulation.resolution.battleId,
      termination: simulation.resolution.termination,
      turns: simulation.resolution.turnNumber,
      ticks: simulation.resolution.tickNumber,
      winnerId: winnerId ?? '',
      approach: request.approach ?? 'open',
      ambushDetected: request.ambushDetected ?? false,
    },
  };
}

export interface CommitNamedNpcBattleOptions {
  factId?: string;
  protectedEntityIds?: ReadonlySet<string>;
}

/** 将战斗副本差量化为一个 WorldOutcome，再通过唯一提交器原子回写。 */
export function commitNamedNpcBattleSimulation(
  world: WorldState,
  request: Readonly<NamedNpcBattleRequest>,
  simulation: NamedNpcBattleSimulation,
  options: CommitNamedNpcBattleOptions = {},
): CommitNamedNpcBattleResult {
  const attacker = world.npcs[request.attackerId];
  const defender = world.npcs[request.defenderId];
  if (!attacker || !defender) {
    return { status: 'failed', reason: 'participant_not_found', resolution: simulation.resolution };
  }
  const now = { year: world.currentYear, month: world.currentMonth };
  const winnerId = simulation.resolution.winnerSide === 'A'
    ? attacker.id
    : simulation.resolution.winnerSide === 'B' ? defender.id : undefined;
  const loserId = winnerId === attacker.id ? defender.id : winnerId === defender.id ? attacker.id : undefined;
  const factId = options.factId ?? `fact:battle:${request.encounterId}`;
  const deltas: EntityDelta[] = [attacker, defender].map((npc) => {
    const after = simulation.charactersAfter[npc.id]!;
    const protectedFromDeath = options.protectedEntityIds?.has(npc.id) === true;
    const delta = createNpcBattleEntityDelta({
      entityId: npc.id, characterAfter: after, kind: request.kind, now,
      killedBy: winnerId, protectedFromDeath,
    });
    if (request.relationPolicy !== 'preserve') {
      delta.socialChanges = [nextHostileRelation(
        world, npc.id, npc.id === attacker.id ? defender.id : attacker.id, now,
        winnerId === npc.id ? '斗法取胜' : winnerId ? '斗法落败' : '斗法僵持',
      )];
    }
    delta.memoriesAdded = [{
      memoryId: `${npc.id}:memory:battle:${request.encounterId}`,
      kind: winnerId === npc.id ? 'success' : winnerId ? 'trauma' : 'experience',
      at: { ...now }, factId,
      participantIds: [attacker.id, defender.id], locationId: request.locationId,
      summary: request.approach === 'ambush'
        ? (npc.id === attacker.id
            ? `对仇敌发起偷袭，${request.ambushDetected ? '却被提前察觉' : '抢得了先机'}。`
            : `遭到仇敌偷袭，${request.ambushDetected ? '及时察觉' : '被对方抢得先机'}。`)
        : winnerId === npc.id ? '在一场具名斗法中取胜。' : winnerId ? '在一场具名斗法中落败。' : '一场斗法陷入僵持。',
      valence: winnerId === npc.id ? 25 : winnerId ? -45 : -10,
      salience: request.kind === 'deadly' ? 90 : 70,
    }];
    return delta;
  });

  if (winnerId && loserId && request.kind === 'deadly' && request.lootPolicy !== 'none') {
    const loser = world.npcs[loserId]!;
    const loserDown = simulation.charactersAfter[loserId]!.hp <= 0;
    const loot = request.lootPolicy === 'all_on_elimination' && loserDown
      ? (loser.spiritStones ?? 0)
      : Math.min(Math.floor((loser.spiritStones ?? 0) * PARTIAL_LOOT_RATE), PARTIAL_LOOT_CAP);
    deltas.find((entry) => entry.entityId === winnerId)!.spiritStonesDelta = loot;
    deltas.find((entry) => entry.entityId === loserId)!.spiritStonesDelta = -loot;
  }

  const outcome: WorldOutcome = {
    outcomeId: request.encounterId,
    baseRevision: world.worldRevision ?? 0,
    source: 'named_battle',
    entityDeltas: deltas,
    facts: [outcomeFact(request, simulation, factId, now, attacker.name, defender.name)],
  };
  const commit = commitOutcome(world, outcome);
  if (commit.status === 'version_conflict') {
    return { status: 'failed', reason: 'version_conflict', resolution: simulation.resolution };
  }
  if (commit.status === 'validation_failed') {
    return { status: 'failed', reason: 'outcome_validation_failed', resolution: simulation.resolution };
  }
  return {
    status: commit.status === 'already_applied' ? 'already_committed' : 'committed',
    resolution: simulation.resolution,
    outcome,
    commit,
  };
}

export function resolveAndCommitNamedNpcBattle(
  world: WorldState,
  request: Readonly<NamedNpcBattleRequest>,
  options: CommitNamedNpcBattleOptions = {},
): SimulateNamedNpcBattleResult | CommitNamedNpcBattleResult {
  const simulated = simulateNamedNpcBattle(world, request);
  if (simulated.status === 'failed') return simulated;
  return commitNamedNpcBattleSimulation(world, request, simulated.simulation, options);
}
