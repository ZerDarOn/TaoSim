import type {
  BigEventLog,
  Character,
  CharacterRelation,
  ChildhoodChoiceId,
  Fact,
  NpcRecord,
  PlayerEntryMode,
  PlayerEntryProfile,
  PlayerFamilyLink,
  SpatialAddress,
  WorldState,
} from '@taosim/contracts';
import { computeDerivedStats } from './derived-stats.js';
import { MINUTES_PER_MONTH, MINUTES_PER_YEAR, projectTime } from '../time/world-clock.js';

export type NewPlayerEntryMode = Exclude<PlayerEntryMode, 'legacy'>;
export type PlayerBackground = Exclude<PlayerEntryProfile['background'], 'legacy'>;

export interface BeginPlayerEntryOptions {
  mode: NewPlayerEntryMode;
  background: PlayerBackground;
  childhoodChoice?: ChildhoodChoiceId;
  startAge?: number;
  worldSeed: number;
}

export interface PlayerEntryTransition {
  player: Character;
  worldState: WorldState;
  childhoodMonths: number;
}

export interface GodInterventionResult {
  ok: boolean;
  reason?: string;
  player: Character;
  worldState: WorldState;
  event?: BigEventLog;
}

const CHILDHOOD_MONTHS = 6 * 12;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function elapsed(world: WorldState): number {
  return world.elapsedMinutes
    ?? ((world.currentYear - 1) * 12 + (world.currentMonth - 1)) * MINUTES_PER_MONTH;
}

function timeAt(minutes: number): { year: number; month: number } {
  const value = projectTime(minutes);
  return { year: value.year, month: value.month };
}

function entryFactId(playerId: string, phase: 'birth' | 'entry' | 'childhood'): string {
  return `FACT_PLAYER_${playerId}_${phase.toUpperCase()}`;
}

function entryEventId(playerId: string, phase: 'birth' | 'entry' | 'childhood'): string {
  return `EVT_PLAYER_${playerId}_${phase.toUpperCase()}`;
}

function appendFact(world: WorldState, fact: Fact): void {
  world.facts ??= [];
  if (!world.facts.some((item) => item.factId === fact.factId)) world.facts.push(fact);
}

function appendEvent(world: WorldState, event: BigEventLog): void {
  if (!world.eventLog.some((item) => item.id === event.id)) world.eventLog.push(event);
}

function stableOffset(seed: number, length: number): number {
  if (length <= 0) return 0;
  const normalized = Math.abs(Math.trunc(seed * 2654435761)) >>> 0;
  return normalized % length;
}

function stationaryAddress(npc: NpcRecord | undefined): SpatialAddress | undefined {
  if (!npc?.spatialAddress) return undefined;
  if (npc.travel?.status === 'in_transit') return undefined;
  return {
    ...clone(npc.spatialAddress),
    occupancy: 'stationary',
  };
}

function rotate<T>(items: T[], offset: number): T[] {
  return items.length === 0 ? [] : [...items.slice(offset), ...items.slice(0, offset)];
}

function familyCandidates(world: WorldState, seed: number): NpcRecord[] {
  const candidates = Object.values(world.npcs)
    .filter((npc) => npc.soulState === 'Active'
      && npc.lifespan.age >= 18
      && npc.lifespan.age <= npc.lifespan.maxLifespan * 0.8
      && npc.travel?.status !== 'in_transit')
    .sort((a, b) => a.id.localeCompare(b.id));
  return rotate(candidates, stableOffset(seed, candidates.length));
}

function chooseFamily(world: WorldState, background: PlayerBackground, seed: number): PlayerFamilyLink[] {
  const candidates = familyCandidates(world, seed);
  if (candidates.length === 0) return [];
  if (background === 'orphan') return [{ npcId: candidates[0]!.id, role: 'guardian' }];

  for (const candidate of candidates) {
    const spouse = candidate.spouseId ? world.npcs[candidate.spouseId] : undefined;
    if (spouse && candidates.some((item) => item.id === spouse.id)) {
      return [
        { npcId: candidate.id, role: 'parent' },
        { npcId: spouse.id, role: 'parent' },
      ];
    }
  }

  const first = candidates[0]!;
  const sameHome = candidates.find((item) => item.id !== first.id
    && (item.factionId === first.factionId || item.spatialAddress?.nodeId === first.spatialAddress?.nodeId));
  return [
    { npcId: first.id, role: 'guardian' },
    ...(sameHome ? [{ npcId: sameHome.id, role: 'elder' } as PlayerFamilyLink] : []),
  ];
}

function linkFamily(player: Character, world: WorldState, family: PlayerFamilyLink[], at: { year: number; month: number }): void {
  for (const link of family) {
    const npc = world.npcs[link.npcId];
    if (!npc) continue;
    const relation: CharacterRelation = {
      targetId: npc.id,
      favorability: link.role === 'parent' ? 80 : 60,
      hatred: 0,
      jealousy: 0,
      tags: ['Kinsman'],
    };
    player.relations[npc.id] = relation;
    npc.relations[player.id] = {
      type: 'clan',
      bond: relation.favorability,
      trust: link.role === 'parent' ? 75 : 60,
      events: [link.role === 'parent' ? '血脉至亲' : '幼时照料'],
      changedAt: at,
    };
    if (link.role === 'parent' && !(npc.childrenIds ?? []).includes(player.id)) {
      npc.childrenIds = [...(npc.childrenIds ?? []), player.id];
    }
  }
}

function recomputeMortalVitals(player: Character): void {
  player.realm = 'Mortal';
  player.canFly = false;
  const derived = computeDerivedStats({
    realm: player.realm,
    attributes: player.attributes,
    spiritRoot: player.spiritRoot,
    age: player.lifespan.age,
    maxLifespan: player.lifespan.maxLifespan,
  });
  player.maxHp = derived.maxHp;
  player.hp = derived.maxHp;
  player.spiritEnergy = { current: 0, max: 0 };
}

function defaultOriginAddress(mode: NewPlayerEntryMode): SpatialAddress {
  return mode === 'transmigration'
    ? { nodeId: 'NODE_CITY_TIANJI', occupancy: 'stationary' }
    : { nodeId: 'LOCAL_CONT_EAST_OVERWORLD', occupancy: 'stationary' };
}

export function beginPlayerEntry(
  originalPlayer: Character,
  originalWorld: WorldState,
  options: BeginPlayerEntryOptions,
): PlayerEntryTransition {
  const player = clone(originalPlayer);
  const world = clone(originalWorld);
  if (player.entryProfile?.status === 'active') return { player, worldState: world, childhoodMonths: 0 };

  const nowMinutes = elapsed(world);
  const at = timeAt(nowMinutes);
  const entryId = `PLAYER_ENTRY_${player.id}`;

  if (options.mode === 'birth') {
    const family = chooseFamily(world, options.background, options.worldSeed);
    const anchorNpc = family.map((link) => world.npcs[link.npcId]).find(Boolean);
    const origin = stationaryAddress(anchorNpc) ?? defaultOriginAddress('birth');
    player.lifespan.age = 0;
    player.travel = undefined;
    player.spatialAddress = origin;
    recomputeMortalVitals(player);
    linkFamily(player, world, family, at);
    player.entryProfile = {
      entryId,
      mode: 'birth',
      status: 'childhood',
      knowledgeScope: 'character',
      physicalPresence: true,
      source: 'simulated_birth',
      background: options.background,
      bornAtMinutes: nowMinutes,
      originNodeId: origin.nodeId,
      family,
      childhoodChoice: options.childhoodChoice ?? 'follow_family',
    };
    const familyIds = family.map((link) => link.npcId);
    appendFact(world, {
      factId: entryFactId(player.id, 'birth'),
      type: 'birth',
      at,
      locationId: origin.nodeId,
      participants: [
        { entityId: player.id, role: 'child' },
        ...familyIds.map((entityId) => ({ entityId, role: 'family' })),
      ],
      title: `${player.name}降生`,
      description: familyIds.length > 0
        ? `${player.name}降生于真实生活在此处的家庭与照料关系之中。`
        : `${player.name}降生于此地，未能追溯到具名亲属。`,
      visibility: 'local',
      metadata: { source: 'simulation', background: options.background },
    });
    appendEvent(world, {
      id: entryEventId(player.id, 'birth'),
      year: at.year,
      month: at.month,
      isMajorEvent: false,
      category: 'social',
      title: `${player.name}降生`,
      description: '这是一条由世界入场规则提交的出生事实，家人和地点均引用真实世界实体。',
      involvedCharacterIds: [player.id, ...familyIds],
      severity: 'normal',
      visibility: 'local',
      source: 'engine',
      locationId: origin.nodeId,
      templateKey: 'player.entry.birth',
    });
    return { player, worldState: world, childhoodMonths: CHILDHOOD_MONTHS };
  }

  const age = options.mode === 'transmigration'
    ? Math.max(16, Math.min(80, Math.floor(options.startAge ?? player.lifespan.age ?? 20)))
    : 0;
  player.lifespan.age = age;
  player.travel = undefined;
  player.spatialAddress = defaultOriginAddress(options.mode);
  recomputeMortalVitals(player);
  player.entryProfile = {
    entryId,
    mode: options.mode,
    status: 'active',
    knowledgeScope: options.mode === 'god' ? 'omniscient' : 'character',
    physicalPresence: options.mode !== 'god',
    source: options.mode === 'god' ? 'god_manifestation' : 'transmigration',
    background: options.background,
    bornAtMinutes: options.mode === 'transmigration'
      ? Math.max(0, nowMinutes - age * MINUTES_PER_YEAR)
      : undefined,
    enteredWorldAtMinutes: nowMinutes,
    originNodeId: player.spatialAddress.nodeId,
    family: [],
    godIntervention: options.mode === 'god' ? { totalSpiritStonesGranted: 0 } : undefined,
  };
  const title = options.mode === 'god' ? '天道观察开启' : `${player.name}穿越入世`;
  appendFact(world, {
    factId: entryFactId(player.id, 'entry'),
    type: 'custom',
    at,
    locationId: player.spatialAddress.nodeId,
    participants: [{ entityId: player.id, role: options.mode === 'god' ? 'observer' : 'arrival' }],
    title,
    description: options.mode === 'god'
      ? '上帝观察者接入同一个权威世界；观察焦点不等同于肉身位置。'
      : `${player.name}在此时此地接入世界，身份与初始资产来源均记为穿越入场。`,
    visibility: options.mode === 'god' ? 'secret' : 'local',
    metadata: { source: player.entryProfile.source, physicalPresence: player.entryProfile.physicalPresence },
  });
  appendEvent(world, {
    id: entryEventId(player.id, 'entry'),
    year: at.year,
    month: at.month,
    isMajorEvent: false,
    category: options.mode === 'god' ? 'world' : 'discovery',
    title,
    description: options.mode === 'god' ? '全知观察已开启，干预必须留下来源。' : '异世之魂在天机城附近醒来。',
    involvedCharacterIds: [player.id],
    severity: 'normal',
    visibility: options.mode === 'god' ? 'world' : 'local',
    source: 'engine',
    locationId: player.spatialAddress.nodeId,
    templateKey: `player.entry.${options.mode}`,
  });
  return { player, worldState: world, childhoodMonths: 0 };
}

export function completePlayerChildhood(
  originalPlayer: Character,
  originalWorld: WorldState,
): PlayerEntryTransition {
  const player = clone(originalPlayer);
  const world = clone(originalWorld);
  const profile = player.entryProfile;
  if (!profile || profile.mode !== 'birth' || profile.status === 'active') {
    return { player, worldState: world, childhoodMonths: 0 };
  }

  const nowMinutes = elapsed(world);
  const bornAt = profile.bornAtMinutes ?? nowMinutes;
  player.lifespan.age = Math.max(0, (nowMinutes - bornAt) / MINUTES_PER_YEAR);
  const choice = profile.childhoodChoice ?? 'follow_family';
  if (choice === 'study_classics') player.attributes.comprehension += 1;
  if (choice === 'roam_outdoors') {
    player.attributes.agility += 1;
    player.attributes.perception += 1;
  }
  if (choice === 'follow_family') {
    player.attributes.physique += 1;
    for (const link of profile.family) {
      const relation = player.relations[link.npcId];
      if (relation) relation.favorability = Math.min(100, relation.favorability + 5);
    }
  }
  profile.status = 'active';
  profile.enteredWorldAtMinutes = nowMinutes;
  recomputeMortalVitals(player);

  const at = timeAt(nowMinutes);
  appendFact(world, {
    factId: entryFactId(player.id, 'childhood'),
    type: 'social',
    at,
    locationId: profile.originNodeId,
    participants: [
      { entityId: player.id, role: 'child' },
      ...profile.family.map((link) => ({ entityId: link.npcId, role: link.role })),
    ],
    title: `${player.name}完成童年开蒙`,
    description: `童年选择：${choice}。这六年与世界和家人同期推进，并非静态背景文案。`,
    causedBy: [entryFactId(player.id, 'birth')],
    visibility: 'local',
    metadata: { childhoodChoice: choice, elapsedMonths: CHILDHOOD_MONTHS },
  });
  appendEvent(world, {
    id: entryEventId(player.id, 'childhood'),
    year: at.year,
    month: at.month,
    isMajorEvent: false,
    category: 'social',
    title: `${player.name}六岁开蒙`,
    description: '童年期间，家人与周边世界照常行动；如今可以开始自主探索。',
    involvedCharacterIds: [player.id, ...profile.family.map((link) => link.npcId)],
    severity: 'normal',
    visibility: 'local',
    source: 'engine',
    locationId: profile.originNodeId,
    relatedEventIds: [entryEventId(player.id, 'birth')],
    templateKey: 'player.entry.childhood',
  });
  return { player, worldState: world, childhoodMonths: 0 };
}

/** 旧档没有 entryProfile 时只补“兼容来源”，不反向伪造出生、家庭或历史事实。 */
export function ensurePlayerEntryProfile(player: Character, world: WorldState): Character {
  if (player.entryProfile) return player;
  const enteredAtMinutes = Math.max(0, elapsed(world) - player.lifespan.age * MINUTES_PER_YEAR);
  player.entryProfile = {
    entryId: `PLAYER_ENTRY_${player.id}`,
    mode: 'legacy',
    status: 'active',
    knowledgeScope: 'character',
    physicalPresence: true,
    source: 'legacy_save',
    background: 'legacy',
    bornAtMinutes: enteredAtMinutes,
    enteredWorldAtMinutes: enteredAtMinutes,
    originNodeId: player.spatialAddress?.nodeId,
    family: [],
  };
  return player;
}

export function applyGodResourceIntervention(
  originalPlayer: Character,
  originalWorld: WorldState,
  npcId: string,
  amount = 10,
): GodInterventionResult {
  const player = clone(originalPlayer);
  const world = clone(originalWorld);
  const profile = player.entryProfile;
  if (profile?.mode !== 'god' || profile.knowledgeScope !== 'omniscient') {
    return { ok: false, reason: '仅上帝观察模式可以执行天道干预', player, worldState: world };
  }
  const npc = world.npcs[npcId];
  if (!npc || npc.soulState !== 'Active') {
    return { ok: false, reason: '目标人物已不存在或无法接受干预', player, worldState: world };
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 10) {
    return { ok: false, reason: '单次资源补给必须为 1–10 灵石', player, worldState: world };
  }
  const nowMinutes = elapsed(world);
  const monthIndex = Math.floor(nowMinutes / MINUTES_PER_MONTH);
  const intervention = profile.godIntervention ?? { totalSpiritStonesGranted: 0 };
  if (intervention.lastMonthIndex === monthIndex) {
    return { ok: false, reason: '本月天道资源干预次数已用尽', player, worldState: world };
  }

  npc.spiritStones = (npc.spiritStones ?? 0) + amount;
  profile.godIntervention = {
    lastMonthIndex: monthIndex,
    totalSpiritStonesGranted: intervention.totalSpiritStonesGranted + amount,
  };
  const at = timeAt(nowMinutes);
  const factId = `FACT_GOD_GRANT_${player.id}_${npc.id}_${monthIndex}`;
  const event: BigEventLog = {
    id: `EVT_GOD_GRANT_${player.id}_${npc.id}_${monthIndex}`,
    year: at.year,
    month: at.month,
    isMajorEvent: false,
    category: 'world',
    title: `天道赐予${npc.name} ${amount} 灵石`,
    description: '资源来自显式上帝干预，不计为人物自行获得，也不伪装成掉落或交易。',
    involvedCharacterIds: [npc.id, player.id],
    severity: 'normal',
    visibility: 'world',
    source: 'player',
    locationId: npc.spatialAddress?.nodeId,
    templateKey: 'god.intervention.resource_grant',
  };
  appendFact(world, {
    factId,
    type: 'custom',
    at,
    locationId: npc.spatialAddress?.nodeId,
    participants: [
      { entityId: player.id, role: 'god_observer' },
      { entityId: npc.id, role: 'recipient' },
    ],
    title: event.title,
    description: event.description,
    causedBy: [entryFactId(player.id, 'entry')],
    visibility: 'public',
    metadata: { source: 'god_intervention', amount },
  });
  appendEvent(world, event);
  return { ok: true, player, worldState: world, event };
}
