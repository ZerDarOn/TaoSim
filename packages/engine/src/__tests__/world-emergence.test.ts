import { describe, it, expect } from 'vitest';
import {
  WorldEngine,
  eraFromTurmoil,
  ERA_TURMOIL_THRESHOLDS,
} from '../world/world-engine.js';
import { isNearby, nodeOf } from '../world/spatial.js';
import { rumorPool, visibleToPlayer } from '../world/chronicle.js';
import { tryFeud } from '../world/world-social-rules.js';
import type { NpcRecord, WorldState, BigEventLog, Character, Faction, Rng } from '@taosim/contracts';

const baseState: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
  eventLog: [],
};

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_TEST_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

function makeQingyunFaction(leaderId: string, members: string[]): Faction {
  return {
    id: 'FACT_QINGYUN',
    name: '青云宗',
    alignment: 'Righteous',
    leaderId,
    members,
    territories: ['NODE_SECT_QINGYUN'],
    spiritVeinLevel: 2,
    treasurySpiritStones: 8000,
    diplomacy: {},
    aiPolicy: { expansionism: 0.3, aggression: 0.2 },
  };
}

function makeEvent(overrides: Partial<BigEventLog> = {}): BigEventLog {
  return {
    id: `EVT_${Math.random()}`,
    year: 1,
    month: 1,
    isMajorEvent: false,
    category: 'world',
    severity: 'normal',
    visibility: 'local',
    source: 'engine',
    title: '事件',
    description: '事件描述',
    involvedCharacterIds: [],
    ...overrides,
  };
}

function makePlayer(): Character {
  return {
    id: 'PLAYER',
    name: '修士',
    gender: 'Male',
    personalityId: 'steady',
    realm: 'QiRefinement_9',
    soulState: 'Active',
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    cultivation: { currentExp: 100, maxExp: 720 },
    lifespan: { age: 16, maxLifespan: 120 },
    skills: [],
    skillIds: [],
    spiritStones: 100,
    inventory: [],
    locationId: 'VENUE_TIANJI_TAVERN',
    relationEntries: {},
    tags: [],
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
  };
}

describe('世界局势状态机（§2.2 世界轨道）', () => {
  it('eraFromTurmoil 阈值：<30 和平 / <60 乱世 / <85 大争 / ≥85 量劫', () => {
    expect(eraFromTurmoil(0)).toBe('peace');
    expect(eraFromTurmoil(29)).toBe('peace');
    expect(eraFromTurmoil(ERA_TURMOIL_THRESHOLDS.turbulent)).toBe('turbulent');
    expect(eraFromTurmoil(59)).toBe('turbulent');
    expect(eraFromTurmoil(ERA_TURMOIL_THRESHOLDS.warring)).toBe('warring');
    expect(eraFromTurmoil(84)).toBe('warring');
    expect(eraFromTurmoil(ERA_TURMOIL_THRESHOLDS.cataclysm)).toBe('cataclysm');
    expect(eraFromTurmoil(100)).toBe('cataclysm');
  });

  it('乱世指数越阈 → 引擎产出 world.era 事件并更新 state.worldEra', () => {
    const state: WorldState = { ...baseState, npcs: {}, worldEra: 'peace', worldTurmoil: 35 };
    const engine = new WorldEngine(state, { rng: () => 0.99 });
    const result = engine.step();
    expect(result.updatedState.worldEra).toBe('turbulent');
    const eraEvent = result.events.find(e => e.title === '乱世初显');
    expect(eraEvent).toBeDefined();
  });

  it('世界事件由引擎产出（§4.10：UI 不再自行 roll）', () => {
    const engine = new WorldEngine(baseState, { rng: () => 0.01 });
    const result = engine.step();
    const evt = result.events.find(e => e.title === '宗门大比');
    expect(evt).toBeDefined();
  });
});

describe('社会轨道（§2.2：入宗→弟子→长老→宗主）', () => {
  it('身处宗门驻地的散修拜入宗门（弟子）', () => {
    const npc = makeNpc({ id: 'NPC_JOIN', name: '求道者', locationId: 'VENUE_QINGYUN_HALL' });
    // 序列：0.9 避免世界事件/奇遇/云游（保持驻地），0.01 触发拜入
    const engine = new WorldEngine({ ...baseState, npcs: { NPC_JOIN: npc } }, { rng: seqRng([0.9, 0.9, 0.9, 0.01]) });
    const result = engine.step();
    const after = result.updatedState.npcs['NPC_JOIN']!;
    expect(after.factionId).toBe('FACT_QINGYUN');
    expect(after.socialRank).toBe('disciple');
    expect(result.updatedState.factions!['FACT_QINGYUN'].members).toContain('NPC_JOIN');
    expect(result.events.some(e => e.title === '求道者 拜入青云宗门下')).toBe(true);
  });

  it('金丹弟子晋升长老', () => {
    const npc = makeNpc({
      id: 'NPC_DISCIPLE',
      name: '金丹弟子',
      factionId: 'FACT_QINGYUN',
      socialRank: 'disciple',
      realm: 'GoldenCore_1',
      cultivation: { currentExp: 0, maxExp: 1500 },
    });
    const faction = makeQingyunFaction('NPC_SECT_MASTER', ['NPC_DISCIPLE']);
    const engine = new WorldEngine(
      { ...baseState, npcs: { NPC_DISCIPLE: npc }, factions: { FACT_QINGYUN: faction } },
      { rng: () => 0.01 },
    );
    const result = engine.step();
    expect(result.updatedState.npcs['NPC_DISCIPLE']!.socialRank).toBe('elder');
    expect(result.events.some(e => e.title === '金丹弟子 晋升为青云宗长老')).toBe(true);
  });

  it('掌门陨落 → 修为最高长老临危继任，前任从成员表中除名', () => {
    const leader = makeNpc({
      id: 'SECT_MASTER',
      name: '云沧澜',
      factionId: 'FACT_QINGYUN',
      socialRank: 'sectMaster',
      soulState: 'PrimordialSoul',
      realm: 'NascentSoul_2',
    });
    const elder = makeNpc({
      id: 'SECT_ELDER',
      name: '玄都真人',
      factionId: 'FACT_QINGYUN',
      socialRank: 'elder',
      realm: 'SoulFormation_1',
    });
    const faction = makeQingyunFaction('SECT_MASTER', ['SECT_MASTER', 'SECT_ELDER']);
    const engine = new WorldEngine(
      { ...baseState, npcs: { SECT_MASTER: leader, SECT_ELDER: elder }, factions: { FACT_QINGYUN: faction } },
      { rng: () => 0.01 },
    );
    const result = engine.step();
    const qingyun = result.updatedState.factions!['FACT_QINGYUN'];
    expect(qingyun.leaderId).toBe('SECT_ELDER');
    expect(result.updatedState.npcs['SECT_ELDER']!.socialRank).toBe('sectMaster');
    expect(qingyun.members).toEqual(['SECT_ELDER']);
    expect(result.events.some(e => e.title === '玄都真人 继任青云宗宗主')).toBe(true);
  });
});

describe('遗府闭环（§4.7）', () => {
  it('金丹坐化 → 遗府现世（新机缘源）＋ 推高乱世指数', () => {
    const npc = makeNpc({
      id: 'NPC_DYING',
      name: '金丹真人',
      realm: 'GoldenCore_1',
      lifespan: { age: 100, maxLifespan: 100 },
      locationId: 'VENUE_QINGYUN_TRAINING',
    });
    const engine = new WorldEngine({ ...baseState, npcs: { NPC_DYING: npc } }, { rng: () => 0.99 });
    const result = engine.step();
    const site = result.updatedState.heritageSites!['NPC_DYING'];
    expect(site).toBeDefined();
    expect(site!.npcName).toBe('金丹真人');
    expect(site!.venueName).toBe('练功场');
    expect(result.updatedState.npcs['NPC_DYING']!.soulState).toBe('PrimordialSoul');
    expect(result.events.some(e => e.title === '金丹真人 坐化，遗府现世于练功场')).toBe(true);
    expect(result.updatedState.worldTurmoil).toBeGreaterThan(0);
  });
});

describe('轨道咬合', () => {
  it('奇遇天材地宝 → 灵石入账（奇遇 ↔ 经济轨道）', () => {
    const npc = makeNpc({ id: 'NPC_WONDER', name: '气运散修', destiny: { tier: 'common', luck: 10, hidden: false } });
    const engine = new WorldEngine({ ...baseState, npcs: { NPC_WONDER: npc } }, { rng: seqRng([0.001]) });
    const result = engine.step();
    expect(result.updatedState.npcs['NPC_WONDER']!.spiritStones).toBe(150);
    expect(result.events.some(e => e.title === '气运散修 得遇天材地宝')).toBe(true);
  });

  it('寻仇得手 → 胜者劫走败者部分灵石（实力 ↔ 经济轨道）', () => {
    const now = { year: 1, month: 1 };
    const attacker = makeNpc({
      id: 'A',
      name: '寻仇者',
      realm: 'GoldenCore_1',
      spiritStones: 100,
      relations: { B: { type: 'enemy', bond: -50, trust: 10, events: [], changedAt: now } },
    });
    const target = makeNpc({
      id: 'B',
      name: '仇家',
      realm: 'QiRefinement_9',
      spiritStones: 1000,
      relations: { A: { type: 'enemy', bond: -50, trust: 10, events: [], changedAt: now } },
    });
    const result = tryFeud(attacker, target, now, () => 0.01);
    expect(result).toBeDefined();
    expect(result!.attackerWins).toBe(true);
    expect(result!.lootStones).toBe(300); // min(1000*0.3, 500)
    expect(target.spiritStones).toBe(700);
    expect(attacker.spiritStones).toBe(400);
  });

  it('云游投奔：有挚友则前往拜访故人（关系 → 空间咬合）', () => {
    const friend = makeNpc({ id: 'FRIEND', name: '故人', locationId: 'VENUE_TIANJI_TAVERN' });
    const npc = makeNpc({
      id: 'NPC_VISITOR',
      name: '云游者',
      relations: {
        FRIEND: { type: 'friend', bond: 60, trust: 70, events: [], changedAt: { year: 1, month: 1 } },
      },
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { NPC_VISITOR: npc, FRIEND: friend } },
      { rng: () => 0.01 },
    );
    const result = engine.step();
    expect(result.events.some(e => e.title === '云游者 云游归来，拜访 故人')).toBe(true);
    expect(result.updatedState.npcs['NPC_VISITOR']!.locationId).toBe('VENUE_TIANJI_TAVERN');
  });
});

describe('空间维度（§4.8 / §6.3）', () => {
  it('isNearby：同场所/同节点邻近，异节点不相邻', () => {
    expect(isNearby('VENUE_QINGYUN_HALL', 'VENUE_QINGYUN_HALL')).toBe(true);
    expect(isNearby('VENUE_QINGYUN_HALL', 'VENUE_QINGYUN_TRAINING')).toBe(true);
    expect(isNearby('VENUE_QINGYUN_HALL', 'VENUE_TIANJI_TAVERN')).toBe(false);
    expect(isNearby(undefined, 'VENUE_TIANJI_TAVERN')).toBe(false);
    expect(isNearby('VENUE_QINGYUN_HALL', undefined)).toBe(false);
    expect(nodeOf('VENUE_QINGYUN_HALL')).toBe('NODE_SECT_QINGYUN');
    expect(nodeOf('UNKNOWN_VENUE')).toBeUndefined();
  });

  it('rumorPool：提供位置时仅扩散邻近事件（§4.8 传闻按半径）', () => {
    const here = makeEvent({ id: 'E_HERE', visibility: 'regional', severity: 'normal', locationId: 'VENUE_QINGYUN_HALL' });
    const far = makeEvent({ id: 'E_FAR', visibility: 'regional', severity: 'normal', locationId: 'VENUE_TIANJI_TAVERN' });
    const now = { year: 2, month: 1 };
    expect(rumorPool([here, far], now).length).toBe(2);
    const rumors = rumorPool([here, far], now, 24, 'VENUE_QINGYUN_HALL');
    expect(rumors.map(r => r.event.id)).toEqual(['E_HERE']);
  });

  it('visibleToPlayer：同处一地的 local 事件可见（§6.3 邻近分支）', () => {
    const e = makeEvent({ severity: 'minor', visibility: 'local', locationId: 'VENUE_QINGYUN_HALL' });
    const player = makePlayer();
    expect(visibleToPlayer(e, player, 'VENUE_QINGYUN_HALL')).toBe(true);
    expect(visibleToPlayer(e, player, 'VENUE_TIANJI_TAVERN')).toBe(false);
    expect(visibleToPlayer(e, player)).toBe(false);
  });
});
