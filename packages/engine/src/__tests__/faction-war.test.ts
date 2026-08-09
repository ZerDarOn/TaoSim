// ============================================================
// 势力扩张与战争 — 引擎测试（§2.2 社会/世界轨道：宗门兴衰、地盘争夺）
//
// 覆盖：领土扩张、宣战、战争夺地、灭门、叛逃、拜师潮流（兴盛系数）
// 所有 rng 均为注入式，保证同种子同结果（可复现）。
// ============================================================

import { describe, expect, it } from 'vitest';
import type { Faction, NpcRecord, WorldState } from '@taosim/contracts';
import { WorldEngine } from '../world/world-engine.js';

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

function makeFaction(overrides: Partial<Faction> = {}): Faction {
  return {
    id: 'FACT_A',
    name: '测试宗',
    alignment: 'Neutral',
    leaderId: 'NPC_MASTER',
    members: ['NPC_MASTER'],
    territories: ['NODE_SECT_QINGYUN'],
    spiritVeinLevel: 2,
    treasurySpiritStones: 8000,
    diplomacy: {},
    aiPolicy: { expansionism: 0.3, aggression: 0.2 },
    ...overrides,
  };
}

/** 逐月推进 N 个月，返回累计事件 */
function runMonths(engine: WorldEngine, months: number): import('@taosim/contracts').BigEventLog[] {
  const events: import('@taosim/contracts').BigEventLog[] = [];
  for (let i = 0; i < months; i++) events.push(...engine.step().events);
  return events;
}

describe('势力扩张与战争（宗门兴衰、地盘争夺）', () => {
  it('扩张：宗门向邻接无主节点开拓（cost 按节点 tier）', () => {
    const master = makeNpc({ id: 'NPC_MASTER', name: '掌门', realm: 'GoldenCore_1' });
    const qingyun = makeFaction({
      id: 'FACT_QINGYUN',
      name: '青云宗',
      members: ['NPC_MASTER'],
      territories: ['NODE_SECT_QINGYUN'],
      spiritVeinLevel: 2,
      treasurySpiritStones: 8000,
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [master.id]: master } },
      { factions: { FACT_QINGYUN: qingyun }, rng: () => 0.05 },
    );

    const events = runMonths(engine, 2);
    const expand = events.find((e) => e.title.includes('扩张至'));
    expect(expand).toBeDefined();
    const territories = engine.getState().factions!['FACT_QINGYUN']!.territories;
    expect(territories.length).toBeGreaterThan(1);
    // 扩张后金库扣减 500×tier
    expect(engine.getState().factions!['FACT_QINGYUN']!.treasurySpiritStones).toBeLessThan(8000);
  });

  it('宣战：邻接皆为他宗地盘且好斗 → 宣战（diplomacy 双向 War + 世界混乱）', () => {
    const qm = makeNpc({ id: 'NPC_QM', name: '青云掌门', realm: 'NascentSoul_2' });
    const tm = makeNpc({ id: 'NPC_TM', name: '天剑掌门', realm: 'GoldenCore_1' });
    const qingyun = makeFaction({
      id: 'FACT_QINGYUN',
      name: '青云宗',
      leaderId: 'NPC_QM',
      members: ['NPC_QM'],
      territories: ['NODE_SECT_QINGYUN', 'NODE_WILD_EAST', 'NODE_CITY_TIANJI', 'NODE_MARKET', 'NODE_WILD_SOUTH', 'NODE_WILD_NORTH', 'NODE_DUNGEON_MINE', 'NODE_WILD_SWAMP'],
      spiritVeinLevel: 3,
      treasurySpiritStones: 8000,
    });
    const tianjian = makeFaction({
      id: 'FACT_TIANJIAN',
      name: '天剑宗',
      leaderId: 'NPC_TM',
      members: ['NPC_TM'],
      territories: ['NODE_SECT_TIANJIAN'],
      spiritVeinLevel: 2,
      treasurySpiritStones: 8000,
      aiPolicy: { expansionism: 0.55, aggression: 0.5 },
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [qm.id]: qm, [tm.id]: tm } },
      { factions: { FACT_QINGYUN: qingyun, FACT_TIANJIAN: tianjian }, rng: () => 0.1 },
    );

    const events = runMonths(engine, 2);
    const war = events.find((e) => e.title.includes('宣战'));
    expect(war).toBeDefined();
    const q = engine.getState().factions!['FACT_QINGYUN']!;
    const t = engine.getState().factions!['FACT_TIANJIAN']!;
    // 至少一方对另一方宣战（双向记录）
    expect(q.diplomacy['FACT_TIANJIAN'] === 'War' || t.diplomacy['FACT_QINGYUN'] === 'War').toBe(true);
    expect(engine.getState().worldTurmoil ?? 0).toBeGreaterThan(0);
  });

  it('战争结算：力量占优方夺取对方地盘（territoryLost + battle 事件）', () => {
    const qm = makeNpc({ id: 'NPC_QM', name: '青云掌门', realm: 'NascentSoul_2' });
    const qe = makeNpc({ id: 'NPC_QE', name: '青云长老', realm: 'GoldenCore_3' });
    const tm = makeNpc({ id: 'NPC_TM', name: '天剑掌门', realm: 'Foundation_1' });
    const qingyun = makeFaction({
      id: 'FACT_QINGYUN',
      name: '青云宗',
      leaderId: 'NPC_QM',
      members: ['NPC_QM', 'NPC_QE'],
      territories: ['NODE_DUNGEON_MINE'],
      spiritVeinLevel: 3,
      treasurySpiritStones: 5000,
      diplomacy: { FACT_TIANJIAN: 'War' },
    });
    const tianjian = makeFaction({
      id: 'FACT_TIANJIAN',
      name: '天剑宗',
      leaderId: 'NPC_TM',
      members: ['NPC_TM'],
      territories: ['NODE_SECT_TIANJIAN'],
      spiritVeinLevel: 2,
      treasurySpiritStones: 5000,
      diplomacy: { FACT_QINGYUN: 'War' },
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [qm.id]: qm, [qe.id]: qe, [tm.id]: tm } },
      { factions: { FACT_QINGYUN: qingyun, FACT_TIANJIAN: tianjian }, rng: () => 0.2 },
    );

    const events = runMonths(engine, 4);
    const battle = events.find((e) => e.title.includes('交战于'));
    const lost = events.find((e) => e.title.includes('失守'));
    expect(battle).toBeDefined();
    expect(lost).toBeDefined();
    const t = engine.getState().factions!['FACT_TIANJIAN']!;
    // 弱势方（天剑）至少失守一地（其唯一地盘被夺 → 为空）
    expect(t.territories.length).toBe(0);
  });

  it('灭门：在世成员全灭 → status=destroyed + 覆灭事件 + 乱世骤升', () => {
    const dead = makeNpc({ id: 'NPC_DEAD', soulState: 'RemnantSoul' });
    const faction = makeFaction({
      id: 'FACT_A',
      name: '衰败宗',
      leaderId: 'NPC_DEAD',
      members: ['NPC_DEAD'],
      territories: ['NODE_SECT_QINGYUN'],
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [dead.id]: dead } },
      { factions: { FACT_A: faction }, rng: () => 0.5 },
    );

    const result = engine.step();
    const destroyed = result.events.find((e) => e.title.includes('覆灭'));
    expect(destroyed).toBeDefined();
    expect(engine.getState().factions!['FACT_A']!.status).toBe('destroyed');
    expect(engine.getState().worldTurmoil ?? 0).toBeGreaterThan(0);
  });

  it('叛逃：衰弱宗门（金库枯竭）弟子脱离，重归散修', () => {
    const disciple = makeNpc({
      id: 'NPC_DIS',
      name: '落魄弟子',
      factionId: 'FACT_A',
      socialRank: 'disciple',
      locationId: 'VENUE_QINGYUN_HALL',
    });
    const faction = makeFaction({
      id: 'FACT_A',
      name: '衰败宗',
      leaderId: 'NPC_MASTER',
      members: ['NPC_MASTER', 'NPC_DIS'],
      spiritVeinLevel: 1,
      treasurySpiritStones: 500,
    });
    const master = makeNpc({
      id: 'NPC_MASTER',
      name: '掌门',
      realm: 'GoldenCore_1',
      factionId: 'FACT_A',
      socialRank: 'sectMaster',
      locationId: 'VENUE_QINGYUN_HALL',
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [master.id]: master, [disciple.id]: disciple } },
      { factions: { FACT_A: faction }, rng: () => 0.01 },
    );

    const events = runMonths(engine, 1);
    const defect = events.find((e) => e.title.includes('脱离'));
    expect(defect).toBeDefined();
    const after = engine.getState().npcs['NPC_DIS']!;
    expect(after.factionId).toBeUndefined();
    expect(engine.getState().factions!['FACT_A']!.members).not.toContain('NPC_DIS');
  });

  it('拜师潮流：兴盛宗门（灵脉高）吸引散修，衰落宗门无人拜入', () => {
    const strongNpc = makeNpc({ id: 'NPC_S', name: '散修甲', locationId: 'VENUE_QINGYUN_HALL' });
    const strong = makeFaction({
      id: 'FACT_STRONG',
      name: '兴盛宗',
      leaderId: 'NPC_MS',
      members: ['NPC_MS'],
      spiritVeinLevel: 2, // prosperity = 1 + 0.5 = 1.5 → joinChance = 0.04×1.5 = 0.06
    });
    const strongMaster = makeNpc({
      id: 'NPC_MS',
      name: '掌门',
      realm: 'GoldenCore_1',
      factionId: 'FACT_STRONG',
      socialRank: 'sectMaster',
      locationId: 'VENUE_QINGYUN_HALL',
    });
    const engineStrong = new WorldEngine(
      { ...baseState, npcs: { [strongMaster.id]: strongMaster, [strongNpc.id]: strongNpc } },
      { factions: { FACT_STRONG: strong }, rng: () => 0.05 }, // 0.05 < 0.06 → 拜入
    );

    const weakNpc = makeNpc({ id: 'NPC_W', name: '散修乙', locationId: 'VENUE_QINGYUN_HALL' });
    const weak = makeFaction({
      id: 'FACT_WEAK',
      name: '衰落宗',
      leaderId: 'NPC_MW',
      members: ['NPC_MW'],
      spiritVeinLevel: 1, // prosperity = 1 → joinChance = 0.04
    });
    const weakMaster = makeNpc({
      id: 'NPC_MW',
      name: '掌门',
      realm: 'GoldenCore_1',
      factionId: 'FACT_WEAK',
      socialRank: 'sectMaster',
      locationId: 'VENUE_QINGYUN_HALL',
    });
    const engineWeak = new WorldEngine(
      { ...baseState, npcs: { [weakMaster.id]: weakMaster, [weakNpc.id]: weakNpc } },
      { factions: { FACT_WEAK: weak }, rng: () => 0.05 }, // 0.05 > 0.04 → 不拜入
    );

    engineStrong.step();
    engineWeak.step();
    expect(engineStrong.getState().npcs['NPC_S']!.factionId).toBe('FACT_STRONG');
    expect(engineWeak.getState().npcs['NPC_W']!.factionId).toBeUndefined();
  });
});
