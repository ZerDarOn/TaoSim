import type { Character, MarketInventory, MarketItem, NPCTradeOffer } from '@taosim/contracts';
import type { Item, ItemStack } from '@taosim/contracts';
import { MarketPricing } from './market-pricing.js';
import { NPCInteractionEngine } from '../interaction/npc-interaction-engine.js';

export interface TransactionResult {
  success: boolean;
  reason?: string;
  totalCost?: number;
}

function findStack(inventory: ItemStack[], itemId: string): ItemStack | undefined {
  return inventory.find(s => s.item.id === itemId);
}

function removeFromInventory(inventory: ItemStack[], itemId: string, count: number): void {
  const idx = inventory.findIndex(s => s.item.id === itemId);
  if (idx === -1) return;
  const stack = inventory[idx]!;
  stack.count -= count;
  if (stack.count <= 0) {
    inventory.splice(idx, 1);
  }
}

function addToInventory(inventory: ItemStack[], item: Item, count: number): void {
  const existing = inventory.find(s => s.item.id === item.id || s.item.templateId === item.templateId);
  if (existing) {
    existing.count += count;
  } else {
    inventory.push({ item: { ...item }, count });
  }
}

export class MarketTransaction {
  static buyFromMarket(
    player: Character,
    market: MarketInventory,
    marketItem: MarketItem,
    quantity: number,
  ): TransactionResult {
    if (marketItem.count < quantity) {
      return { success: false, reason: '库存不足' };
    }

    const totalCost = MarketPricing.calculateBuyPrice(
      marketItem.item,
      market.sellPriceMultiplier,
    );

    const totalBuyCost = totalCost * quantity;
    if (player.spiritStones < totalBuyCost) {
      return { success: false, reason: '灵石不足' };
    }

    player.spiritStones -= totalBuyCost;
    marketItem.count -= quantity;
    addToInventory(player.inventory, marketItem.item, quantity);

    if (marketItem.count <= 0) {
      const idx = market.items.indexOf(marketItem);
      if (idx !== -1) market.items.splice(idx, 1);
    }

    return { success: true, totalCost: totalBuyCost };
  }

  static sellToMarket(
    player: Character,
    market: MarketInventory,
    item: Item,
    quantity: number,
  ): TransactionResult {
    const stack = findStack(player.inventory, item.id);
    if (!stack) return { success: false, reason: '背包中无此物品' };
    if (stack.count < quantity) return { success: false, reason: '物品数量不足' };

    const unitPrice = MarketPricing.calculateSellPrice(item, market.buyPriceMultiplier);
    const totalRevenue = unitPrice * quantity;

    removeFromInventory(player.inventory, item.id, quantity);
    player.spiritStones += totalRevenue;

    return { success: true, totalCost: totalRevenue };
  }

  static buyFromNPC(
    player: Character,
    offer: NPCTradeOffer,
    marketItem: MarketItem,
    quantity: number,
  ): TransactionResult {
    if (marketItem.count < quantity) {
      return { success: false, reason: '库存不足' };
    }

    const favorabilityDiscount = NPCInteractionEngine.getPriceMultiplier(player, offer.npcId);
    const totalCost = MarketPricing.calculateBuyPrice(
      marketItem.item,
      1.0,
      1.0,
      favorabilityDiscount,
    );

    const totalBuyCost = totalCost * quantity;
    if (player.spiritStones < totalBuyCost) {
      return { success: false, reason: '灵石不足' };
    }

    player.spiritStones -= totalBuyCost;
    marketItem.count -= quantity;
    addToInventory(player.inventory, marketItem.item, quantity);

    if (marketItem.count <= 0) {
      const idx = offer.selling.indexOf(marketItem);
      if (idx !== -1) offer.selling.splice(idx, 1);
    }

    return { success: true, totalCost: totalBuyCost };
  }

  static sellToNPC(
    player: Character,
    offer: NPCTradeOffer,
    item: Item,
    quantity: number,
  ): TransactionResult {
    const stack = findStack(player.inventory, item.id);
    if (!stack) return { success: false, reason: '背包中无此物品' };
    if (stack.count < quantity) return { success: false, reason: '物品数量不足' };

    const favorabilityBonus = 1.0 + (NPCInteractionEngine.getPriceMultiplier(player, offer.npcId) - 1.0) * -1;
    const unitPrice = MarketPricing.calculateSellPrice(item, 0.5, favorabilityBonus);
    const totalRevenue = unitPrice * quantity;

    if (offer.budget < totalRevenue) {
      return { success: false, reason: '对方灵石不足' };
    }

    removeFromInventory(player.inventory, item.id, quantity);
    player.spiritStones += totalRevenue;
    offer.budget -= totalRevenue;

    return { success: true, totalCost: totalRevenue };
  }
}
