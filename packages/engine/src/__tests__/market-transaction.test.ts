import { describe, it, expect, beforeEach } from 'vitest';
import { MarketTransaction } from '../market/market-transaction.js';
import { ItemFactory } from '../market/item-factory.js';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import { MarketEngine } from '../market/market-engine.js';
import { NPCTradeEngine } from '../market/npc-trade-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '玩家', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 1000, maxExp: 2000 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 1000,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

function makeNode(tier: number = 2) {
  return {
    id: 'NODE_01', name: '坊市', continentId: 'C1',
    coordinates: { x: 0, y: 0 }, type: 'Market' as const, tier,
    travelCostDays: 1,
    battleMapConfig: { baseTerrain: 'Plain' as const, clusterDensity: 0.5, hazardProbability: 0.1 },
  };
}

describe('MarketTransaction', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  });

  it('buyFromMarket 成功购买扣灵石加背包', () => {
    const player = makePlayer({ spiritStones: 99999 });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    const targetItem = inv.items[0]!;
    const buyCount = Math.min(2, targetItem.count);

    const result = MarketTransaction.buyFromMarket(player, inv, targetItem, buyCount);
    expect(result.success).toBe(true);
    expect(player.spiritStones).toBeLessThan(99999);
    expect(player.inventory.length).toBeGreaterThan(0);
  });

  it('buyFromMarket 灵石不足失败', () => {
    const player = makePlayer({ spiritStones: 1 });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    const targetItem = inv.items[0]!;

    const result = MarketTransaction.buyFromMarket(player, inv, targetItem, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('灵石不足');
  });

  it('buyFromMarket 库存不足失败', () => {
    const player = makePlayer({ spiritStones: 99999 });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    const targetItem = inv.items[0]!;

    const result = MarketTransaction.buyFromMarket(player, inv, targetItem, 999);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('库存不足');
  });

  it('sellToMarket 成功卖出加灵石扣背包', () => {
    const player = makePlayer({
      spiritStones: 0,
      inventory: [{
        item: {
          id: 'MAT_SPIRIT_GRASS', templateId: 'MAT_SPIRIT_GRASS',
          name: '灵草', tier: 1, type: 'Material', attributes: {},
        },
        count: 10,
      }],
    });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);

    const result = MarketTransaction.sellToMarket(player, inv, player.inventory[0]!.item, 3);
    expect(result.success).toBe(true);
    expect(player.spiritStones).toBeGreaterThan(0);
    expect(player.inventory[0]!.count).toBe(7);
  });

  it('sellToNPC 成功交易扣 NPC 预算', () => {
    const player = makePlayer({
      spiritStones: 0,
      inventory: [{
        item: {
          id: 'MAT_SPIRIT_GRASS', templateId: 'MAT_SPIRIT_GRASS',
          name: '灵草', tier: 1, type: 'Material', attributes: {},
        },
        count: 10,
      }],
    });
    const npc = makePlayer({ id: 'NPC_01', realm: 'Foundation_1' });
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    const budgetBefore = offer.budget;

    const result = MarketTransaction.sellToNPC(player, offer, player.inventory[0]!.item, 1);
    expect(result.success).toBe(true);
    expect(offer.budget).toBeLessThan(budgetBefore);
    expect(player.spiritStones).toBeGreaterThan(0);
  });

  it('sellToNPC NPC 预算不足失败', () => {
    const player = makePlayer({
      spiritStones: 0,
      inventory: [{
        item: {
          id: 'EQ_STAR_SWORD', templateId: 'EQ_STAR_SWORD',
          name: '星辰剑', tier: 3, type: 'Equipment', attributes: {},
        },
        count: 1,
      }],
    });
    const npc = makePlayer({ id: 'NPC_POOR', realm: 'QiRefinement_1' });
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    offer.budget = 1;

    const result = MarketTransaction.sellToNPC(player, offer, player.inventory[0]!.item, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('灵石不足');
  });

  it('buyFromNPC 成功从 NPC 购买', () => {
    const player = makePlayer({ spiritStones: 9999 });
    const npc = makePlayer({ id: 'NPC_01', realm: 'Foundation_1' });
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    const buyItem = offer.selling[0]!;

    const result = MarketTransaction.buyFromNPC(player, offer, buyItem, 1);
    expect(result.success).toBe(true);
    expect(player.spiritStones).toBeLessThan(9999);
    expect(buyItem.count).toBeLessThan(buyItem.maxCount);
  });

  it('物品不存在背包时卖出失败', () => {
    const player = makePlayer({ spiritStones: 0, inventory: [] });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);

    const result = MarketTransaction.sellToMarket(player, inv, {
      id: 'NO_SUCH_ITEM', name: 'no', tier: 1, type: 'Material', attributes: {},
    }, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('物品');
  });
});
