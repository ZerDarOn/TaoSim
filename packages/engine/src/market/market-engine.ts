import type { OverworldNode, MarketInventory, MarketItem } from '@taosim/contracts';
import { ItemFactory } from './item-factory.js';
import { MarketPricing } from './market-pricing.js';

export class MarketEngine {
  static refreshMarket(
    node: OverworldNode,
    currentMonth: number,
    playerLuck: number = 0,
  ): MarketInventory {
    const minTier = Math.max(1, node.tier - 1);
    const maxTier = Math.min(9, node.tier + 1);

    const newItems: MarketItem[] = [];

    const commonCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < commonCount; i++) {
      const item = ItemFactory.generateRandomItem({ minTier, maxTier });
      const count = item.type === 'Material' ? 5 + Math.floor(Math.random() * 16) : 1 + Math.floor(Math.random() * 3);
      newItems.push({
        item,
        count,
        maxCount: count,
        basePrice: MarketPricing.getBasePrice(item),
      });
    }

    const rareChance = 0.1 * (1 + playerLuck / 100);
    if (Math.random() < rareChance) {
      const rareItem = ItemFactory.generateRandomItem({ minTier: node.tier, maxTier });
      newItems.push({
        item: rareItem,
        count: 1,
        maxCount: 1,
        basePrice: MarketPricing.getBasePrice(rareItem),
      });
    }

    return {
      nodeId: node.id,
      items: newItems,
      buyPriceMultiplier: 0.7,
      sellPriceMultiplier: 1.2,
      lastRefreshMonth: currentMonth,
    };
  }

  static needsRefresh(inventory: MarketInventory, currentMonth: number): boolean {
    return inventory.lastRefreshMonth < currentMonth;
  }
}
