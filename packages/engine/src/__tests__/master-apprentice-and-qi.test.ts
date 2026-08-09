// ============================================================
// 师徒传承 + 生态与地形因果 — 引擎测试
//
// 师徒：长老收徒 → 未出师弟子修行加速（×1.5）→ 金丹出师独立
// 灵气：节点灵气按 tier 折算 → 季节潮汐 → 灵气浓郁之地修炼更快
// 所有 rng 注入式，保证同种子同结果（可复现）。
// ============================================================

import { describe, expect, it } from 'vitest';
import type { Faction, NpcRecord, WorldState } from '@taosim/contracts';
import {
  WorldEngine,
  createInitialNodeSpiritQi,
  spiritQiMultiplier,
} from '../world/world-engine.js';
import { cultivateNpc } from '../world/world-tick-rules.js';

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
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
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

function runMonths(engine: WorldEngine, months: number): import('@taosim/contracts').BigEventLog[] {
  const events: import('@taosim/contracts').BigEventLog[] = [];
  for (let i = 0; i < months; i++) events.push(...engine.step().events);
  return events;
}

describe('师徒传承（关系轨道末端：收徒 → 修行加速 → 出师）', () => {
  it('收徒：长老收同门潜质弟子，建立双向师徒关系并产出事件', () => {
    const master = makeNpc({
      id: 'NPC_MASTER',
      name: '玄一真人',
      realm: 'GoldenCore_3',
      socialRank: 'elder',
      factionId: 'FACT_A',
      locationId: 'VENUE_QINGYUN_HALL',
      destiny: { tier: 'legendary', born: 'inherited', luck: 90, hidden: false },
    });
    const disciple = makeNpc({
      id: 'NPC_DISC',
      name: '青莲',
      realm: 'QiRefinement_3',
      socialRank: 'disciple',
      factionId: 'FACT_A',
      locationId: 'VENUE_QINGYUN_HALL',
      destiny: { tier: 'talented', born: 'mortal', luck: 80, hidden: false },
    });
    const faction = makeFaction({
      id: 'FACT_A',
      name: '青云宗',
      leaderId: 'NPC_MASTER',
      members: ['NPC_MASTER', 'NPC_DISC'],
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [master.id]: master, [disciple.id]: disciple } },
      { factions: { FACT_A: faction }, rng: () => 0.01 },
    );

    const events = runMonths(engine, 2);
    const apprentice = events.find((e) => e.title.includes('收') && e.title.includes('为徒'));
    expect(apprentice).toBeDefined();
    const m = engine.getState().npcs['NPC_MASTER']!;
    const d = engine.getState().npcs['NPC_DISC']!;
    expect(m.relations['NPC_DISC']?.type).toBe('master-disciple');
    expect(m.relations['NPC_DISC']?.direction).toBe('master');
    expect(d.relations['NPC_MASTER']?.type).toBe('master-disciple');
    expect(d.relations['NPC_MASTER']?.direction).toBe('disciple');
  });

  it('修行加速：未出师弟子修为增长为无师之人的 1.5 倍', () => {
    // 纯函数验证（无灵气干扰：默认 multiplier 均 1）
    const plain = makeNpc({ id: 'NPC_P', attributes: { ...makeNpc().attributes, comprehension: 10 } });
    cultivateNpc(plain);
    const undergrad = makeNpc({
      id: 'NPC_U',
      attributes: { ...makeNpc().attributes, comprehension: 10 },
    });
    cultivateNpc(undergrad, { apprentice: 1.5 });
    expect(undergrad.cultivation.currentExp).toBeCloseTo(plain.cultivation.currentExp * 1.5);
  });

  it('出师：弟子修为达金丹 → 里程碑留档 + 出师事件（保留师徒关系）', () => {
    const master = makeNpc({
      id: 'NPC_MASTER',
      name: '玄一真人',
      realm: 'GoldenCore_3',
      socialRank: 'elder',
      factionId: 'FACT_A',
      locationId: 'VENUE_QINGYUN_HALL',
    });
    const disciple = makeNpc({
      id: 'NPC_DISC',
      name: '青莲',
      realm: 'GoldenCore_1',
      socialRank: 'disciple',
      factionId: 'FACT_A',
      locationId: 'VENUE_QINGYUN_HALL',
      relations: {
        NPC_MASTER: {
          type: 'master-disciple',
          bond: 40,
          trust: 40,
          events: ['拜入师门'],
          changedAt: { year: 1, month: 1 },
          direction: 'disciple',
        },
      },
    });
    const faction = makeFaction({
      id: 'FACT_A',
      name: '青云宗',
      leaderId: 'NPC_MASTER',
      members: ['NPC_MASTER', 'NPC_DISC'],
    });
    const engine = new WorldEngine(
      { ...baseState, npcs: { [master.id]: master, [disciple.id]: disciple } },
      { factions: { FACT_A: faction }, rng: () => 0.9 },
    );

    const events = runMonths(engine, 1);
    const graduation = events.find((e) => e.title.includes('出师'));
    expect(graduation).toBeDefined();
    const d = engine.getState().npcs['NPC_DISC']!;
    expect(d.biography.milestones.some((m) => m.title === '出师')).toBe(true);
    // 出师后师徒关系保留
    expect(d.relations['NPC_MASTER']?.direction).toBe('disciple');
  });
});

describe('生态与地形因果（区域灵气 → 修炼速度）', () => {
  it('初始灵气按节点 tier 折算（tier1=25 … tier5=85）', () => {
    const qi = createInitialNodeSpiritQi();
    expect(qi['NODE_SECT_QINGYUN']).toBe(40); // tier2
    expect(qi['NODE_SECT_TIANJIAN']).toBe(40); // tier2
    expect(qi['NODE_DUNGEON_ANCIENT']).toBe(85); // tier5
  });

  it('灵气浓度 → 修炼倍率单调（灵气越浓修炼越快）', () => {
    expect(spiritQiMultiplier(85)).toBeGreaterThan(spiritQiMultiplier(40));
    expect(spiritQiMultiplier(40)).toBeGreaterThan(spiritQiMultiplier(25));
    expect(spiritQiMultiplier(100)).toBe(1.6);
  });

  it('季节潮汐：每月灵气确定性波动（1 月开局 → 冬 −2）', () => {
    const engine = new WorldEngine(baseState);
    const before = engine.getState().nodeSpiritQi!['NODE_SECT_QINGYUN']!;
    engine.step(); // 1 月 → 2 月（春 +1）
    expect(engine.getState().nodeSpiritQi!['NODE_SECT_QINGYUN']!).toBe(before + 1);
  });

  it('修炼联动：灵气浓郁之地的修士月修为增长更快', () => {
    const qiRich = makeNpc({ id: 'NPC_RICH', name: '灵地修士', locationId: 'VENUE_QINGYUN_HALL' });
    const qiPoor = makeNpc({ id: 'NPC_POOR', name: '贫地修士', locationId: 'VENUE_TIANJI_TAVERN' });
    // 高灵气覆盖青云驻地节点，低灵气覆盖天机城节点
    const nodeSpiritQi = { NODE_SECT_QINGYUN: 90, NODE_CITY_TIANJI: 10 };
    const engine = new WorldEngine(
      { ...baseState, npcs: { [qiRich.id]: qiRich, [qiPoor.id]: qiPoor }, nodeSpiritQi },
      { rng: () => 0.9 },
    );

    engine.step();
    const rich = engine.getState().npcs['NPC_RICH']!.cultivation.currentExp;
    const poor = engine.getState().npcs['NPC_POOR']!.cultivation.currentExp;
    // 灵气 90 → 倍率 ≈1.48；灵气 10 → 倍率 ≈0.68 → 灵地修士显著更快
    expect(rich).toBeGreaterThan(poor * 1.8);
  });
});
