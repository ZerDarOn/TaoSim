import { describe, it, expect, beforeEach } from 'vitest';
import { NPCTradeEngine } from '../market/npc-trade-engine.js';
import { ItemFactory } from '../market/item-factory.js';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import type { Character } from '@taosim/contracts';

function makeNPC(overrides: Partial<Character> = {}): Character {
  return {
    id: 'NPC_TEST', name: '测试修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 1000, maxExp: 2000 },
    lifespan: { age: 50, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

describe('NPCTradeEngine', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  });

  it('refreshNPCOffer 生成 NPCTradeOffer', () => {
    const npc = makeNPC();
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    expect(offer.npcId).toBe('NPC_TEST');
    expect(offer.selling.length).toBeGreaterThanOrEqual(3);
    expect(offer.selling.length).toBeLessThanOrEqual(5);
    expect(offer.budget).toBeGreaterThan(0);
    expect(offer.lastRefreshMonth).toBe(1);
  });

  it('refreshNPCOffer 按境界设置预算', () => {
    const qi = makeNPC({ realm: 'QiRefinement_1' });
    expect(NPCTradeEngine.refreshNPCOffer(qi, 1).budget).toBe(200);

    const foundation = makeNPC({ realm: 'Foundation_1' });
    expect(NPCTradeEngine.refreshNPCOffer(foundation, 1).budget).toBe(500);

    const goldenCore = makeNPC({ realm: 'GoldenCore_1' });
    expect(NPCTradeEngine.refreshNPCOffer(goldenCore, 1).budget).toBe(1500);

    const nascentSoul = makeNPC({ realm: 'NascentSoul_1' });
    expect(NPCTradeEngine.refreshNPCOffer(nascentSoul, 1).budget).toBe(5000);
  });

  it('refreshNPCOffer buyingInterest 包含合理类型', () => {
    const npc = makeNPC();
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    expect(offer.buyingInterest.length).toBeGreaterThan(0);
    offer.buyingInterest.forEach(type => {
      expect(['Material', 'Medicine', 'Equipment', 'Talisman']).toContain(type);
    });
  });

  it('getNPCBudget 单独获取预算', () => {
    expect(NPCTradeEngine.getNPCBudget('QiRefinement_1')).toBe(200);
    expect(NPCTradeEngine.getNPCBudget('Foundation_3')).toBe(500);
    expect(NPCTradeEngine.getNPCBudget('UnknownRealm')).toBe(200);
  });
});
