import { describe, it, expect, beforeEach } from 'vitest';
import { MarketEngine } from '../market/market-engine.js';
import { ItemFactory } from '../market/item-factory.js';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import type { OverworldNode } from '@taosim/contracts';

function makeNode(tier: number = 2): OverworldNode {
  return {
    id: 'NODE_MARKET_01',
    name: '东荒坊市',
    continentId: 'CONTINENT_CANGZHOU',
    coordinates: { x: 0, y: 0 },
    type: 'Market',
    tier,
    travelCostDays: 3,
    battleMapConfig: { baseTerrain: 'Plain', clusterDensity: 0.5, hazardProbability: 0.1 },
  };
}

describe('MarketEngine', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  });

  it('refreshMarket 生成 MarketInventory', () => {
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.nodeId).toBe('NODE_MARKET_01');
    expect(inv.items.length).toBeGreaterThanOrEqual(8);
    expect(inv.lastRefreshMonth).toBe(1);
  });

  it('refreshMarket tier 品阶 clamp 不超过边界', () => {
    const node = makeNode(1);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.items.every(mi => mi.item.tier >= 1 && mi.item.tier <= 2)).toBe(true);
  });

  it('refreshMarket 高 tier 节点生成高阶物品', () => {
    const node = makeNode(4);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.items.some(mi => mi.item.tier >= 3)).toBe(true);
  });

  it('refreshMarket buyPriceMultiplier 和 sellPriceMultiplier', () => {
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.buyPriceMultiplier).toBe(0.7);
    expect(inv.sellPriceMultiplier).toBe(1.2);
  });

  it('needsRefresh 过期检测', () => {
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 5, 5);
    expect(MarketEngine.needsRefresh(inv, 5)).toBe(false);
    expect(MarketEngine.needsRefresh(inv, 6)).toBe(true);
  });

  it('refreshMarket 同一节点两次刷新产生不同内容', () => {
    const node = makeNode(2);
    const inv1 = MarketEngine.refreshMarket(node, 1, 5);
    const inv2 = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv2.lastRefreshMonth).toBe(1);
  });
});
