import type { Item, ItemType, ItemQuality } from '@taosim/contracts';

const TYPE_BASE_PRICE: Record<ItemType, number> = {
  Material: 100,
  Medicine: 300,
  Equipment: 500,
  Talisman: 400,
  Formula: 200,
  Poison: 150,
};

const QUALITY_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 1.0,
  Rare: 1.5,
  Epic: 2.5,
  Legendary: 5.0,
};

export class MarketPricing {
  private static getQualityMultiplier(item: Item): number {
    if (!item.quality) return 1.0;
    return QUALITY_MULTIPLIER[item.quality] ?? 1.0;
  }

  static getBasePrice(item: Item): number {
    const typeBase = TYPE_BASE_PRICE[item.type] ?? 100;
    const qualityMod = this.getQualityMultiplier(item);
    return Math.floor(item.tier * typeBase * qualityMod);
  }

  static calculateBuyPrice(
    item: Item,
    nodeSellMultiplier: number,
    factionDiscount: number = 1.0,
    favorabilityDiscount: number = 1.0,
  ): number {
    const base = this.getBasePrice(item);
    const finalPrice = base * nodeSellMultiplier * factionDiscount * favorabilityDiscount;
    return Math.max(1, Math.floor(finalPrice));
  }

  static calculateSellPrice(
    item: Item,
    nodeBuyMultiplier: number,
    favorabilityBonus: number = 1.0,
    currentBuyPrice?: number,
  ): number {
    const base = this.getBasePrice(item);
    let sellPrice = base * nodeBuyMultiplier * favorabilityBonus;

    if (currentBuyPrice !== undefined) {
      sellPrice = Math.min(sellPrice, currentBuyPrice * 0.8);
    }
    return Math.max(1, Math.floor(sellPrice));
  }
}
