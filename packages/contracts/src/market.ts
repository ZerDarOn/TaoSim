// ============================================================
// Market 交易系统数据模型 — Phase 6
// ============================================================

import type { Item } from './item.js';
import type { ItemType } from './item.js';

export interface MarketItem {
  item: Item;
  count: number;
  maxCount: number;
  basePrice: number;
}

export interface MarketInventory {
  nodeId: string;
  items: MarketItem[];
  buyPriceMultiplier: number;
  sellPriceMultiplier: number;
  lastRefreshMonth: number;
}

export interface NPCTradeOffer {
  npcId: string;
  selling: MarketItem[];
  buyingInterest: ItemType[];
  budget: number;
  lastRefreshMonth: number;
}
