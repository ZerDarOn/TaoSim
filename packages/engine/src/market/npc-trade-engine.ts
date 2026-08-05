import type { Character, NPCTradeOffer, ItemType } from '@taosim/contracts';
import { parseRealm } from '@taosim/contracts';
import { ItemFactory } from './item-factory.js';

const BUDGET_MAP: Record<string, number> = {
  LianQi: 200,
  ZhuJi: 500,
  JinDan: 1500,
  YuanYing: 5000,
  HuaShen: 15000,
};

const DEFAULT_BUDGET = 200;

function getRealmNumericTier(realmStr: string): number {
  const parsed = parseRealm(realmStr as any);
  const tierMap: Record<string, number> = {
    LianQi: 1,
    ZhuJi: 2,
    JinDan: 3,
    YuanYing: 4,
    HuaShen: 5,
  };
  return tierMap[parsed.realmType] ?? 1;
}

function inferProfessionPreferences(npc: Character): ItemType[] {
  const types: ItemType[] = ['Material'];
  if (npc.attributes.comprehension >= 10) {
    types.push('Medicine');
  }
  if (npc.attributes.physique >= 10) {
    types.push('Equipment');
  }
  if (npc.attributes.agility >= 10) {
    types.push('Talisman');
  }
  return types;
}

export class NPCTradeEngine {
  static getNPCBudget(realm: string): number {
    const parsed = parseRealm(realm as any);
    return BUDGET_MAP[parsed.realmType] ?? DEFAULT_BUDGET;
  }

  static refreshNPCOffer(npc: Character, currentMonth: number): NPCTradeOffer {
    const realmTier = getRealmNumericTier(npc.realm);
    const budget = this.getNPCBudget(npc.realm);
    const preferences = inferProfessionPreferences(npc);

    const sellCount = 3 + Math.floor(Math.random() * 3);
    const sellingItems = ItemFactory.generateNPCTradeItems(realmTier, preferences, sellCount);

    return {
      npcId: npc.id,
      selling: sellingItems,
      buyingInterest: preferences,
      budget,
      lastRefreshMonth: currentMonth,
    };
  }
}
