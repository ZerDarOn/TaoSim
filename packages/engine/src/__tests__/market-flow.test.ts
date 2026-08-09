import { describe, it, expect } from 'vitest';
import type { WorldState, NpcRecord } from '@taosim/contracts';
import { WorldEngine } from '../world/world-engine.js';
import { EconomyEngine } from '../economy/economy-engine.js';
import { NPCGenerator } from '../interaction/npc-generator.js';
import { characterToNpcRecord, npcRecordToCharacter } from '../world/npc-record-mapper.js';
import { VENUE_CATALOG } from '../overworld/map-catalog.js';

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

/** 顺序 rng：超出则复用最后一个值（人口补充等后续 rng 调用不受影响） */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
}

const SHOP_ID = VENUE_CATALOG.find((v) => v.type === 'shop')!.id;

describe('坊市流动（§4.6：灵石交易 / 突破材料流转 — 与玩家经济同一套数据）', () => {
  it('所有 Active NPC 按月领取境界俸禄；非坊市场所不产生交易事件', () => {
    // 酒楼（tavern）不是坊市场所：只收入，不交易
    const npc = makeNpc({ locationId: 'VENUE_TIANJI_TAVERN' });
    const engine = new WorldEngine({ ...baseState, npcs: { [npc.id]: npc } }, { rng: () => 0.5 });
    const result = engine.step();

    expect(engine.getState().npcs[npc.id]!.spiritStones).toBe(
      EconomyEngine.realmMonthlyIncome('QiRefinement_1'),
    );
    expect(result.events.some((e) => e.category === 'economy')).toBe(false);
  });

  it('坊市场所 NPC 概率参与交易：灵石支出 + market.trade 事件', () => {
    const npc = makeNpc({ locationId: SHOP_ID });
    // 单 NPC 月度 rng 顺序：奇遇(0.5 不触发) → 云游(0.5 不触发) → 交易(0.2 命中) → 材料(0.1)
    const engine = new WorldEngine(
      { ...baseState, npcs: { [npc.id]: npc } },
      { rng: seqRng([0.5, 0.5, 0.2, 0.1]) },
    );
    const result = engine.step();

    const income = EconomyEngine.realmMonthlyIncome('QiRefinement_1'); // 50
    const trade = result.events.find((e) => e.category === 'economy');
    expect(trade).toBeDefined();
    expect(trade!.involvedCharacterIds).toContain(npc.id);
    expect(trade!.visibility).toBe('local');
    expect(trade!.source).toBe('engine');
    // 支出 = min(俸禄×2, 结余)，不会超支为负
    expect(trade!.description).toContain(`${income} 灵石`);
    expect(engine.getState().npcs[npc.id]!.spiritStones).toBe(0);
  });

  it('多个月持续交易，灵石永不赤字', () => {
    const npc = makeNpc({ locationId: SHOP_ID });
    // 固定 rng 0.1：奇遇/云游均不触发，交易每月命中
    const engine = new WorldEngine(
      { ...baseState, npcs: { [npc.id]: npc } },
      { rng: () => 0.1 },
    );
    for (let i = 0; i < 6; i++) {
      const result = engine.step();
      const stones = engine.getState().npcs[npc.id]!.spiritStones;
      expect(stones).toBeGreaterThanOrEqual(0);
      expect(result.events.some((e) => e.category === 'economy')).toBe(true);
    }
  });

  it('归档/展开往返保留灵石积蓄', () => {
    const character = NPCGenerator.generate(2, 7);
    character.spiritStones = 777;
    const record = characterToNpcRecord(character, 3, 6);
    expect(record.spiritStones).toBe(777);
    const expanded = npcRecordToCharacter(record);
    expect(expanded.spiritStones).toBe(777);
  });
});
