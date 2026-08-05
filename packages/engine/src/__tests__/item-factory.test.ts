import { describe, it, expect, beforeEach } from 'vitest';
import { ItemFactory } from '../market/item-factory.js';
import type { ItemTemplate } from '@taosim/contracts';

const TEST_TEMPLATES: ItemTemplate[] = [
  { templateId: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_YIN_DEW', name: '阴露', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: 2 },
  { templateId: 'MAT_YANG_STONE', name: '阳石', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: -2 },
  { templateId: 'MED_FOUNDATION_PILL', name: '筑基丹', tier: 2, type: 'Medicine', baseAttributes: {} },
  { templateId: 'MED_QI_PILL', name: '聚气丹', tier: 1, type: 'Medicine', baseAttributes: {} },
  { templateId: 'EQ_SPIRIT_SWORD', name: '灵蕴剑', tier: 2, type: 'Equipment', baseAttributes: { attack: 15 } },
  { templateId: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', baseAttributes: {} },
];

describe('ItemFactory', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...TEST_TEMPLATES]);
  });

  it('generateRandomItem 生成带独立 ID 的物品', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 1, maxTier: 2 });
    expect(item.id).toBeTruthy();
    expect(item.templateId).toBeTruthy();
    expect(item.tier).toBeGreaterThanOrEqual(1);
    expect(item.tier).toBeLessThanOrEqual(2);
  });

  it('同一模板生成的两次实例 ID 不同', () => {
    const item1 = ItemFactory.generateRandomItem({ minTier: 2, maxTier: 2 });
    const item2 = ItemFactory.generateRandomItem({ minTier: 2, maxTier: 2 });
    expect(item1.id).not.toBe(item2.id);
  });

  it('preferredType 过滤只生成指定类型', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 1, maxTier: 3, preferredType: 'Medicine' });
    expect(item.type).toBe('Medicine');
  });

  it('三级 Fallback: 无匹配类型时放宽限制', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 1, maxTier: 2, preferredType: 'Formula' });
    expect(item).toBeDefined();
  });

  it('三级 Fallback: 无匹配 tier 时保底全库', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 5, maxTier: 5 });
    expect(item).toBeDefined();
  });

  it('空模板库时抛错', () => {
    ItemFactory.loadTemplates([]);
    expect(() => ItemFactory.generateRandomItem({ minTier: 1, maxTier: 1 })).toThrow('[ItemFactory]');
  });

  it('getItemPool 按 tier 筛选', () => {
    const pool = ItemFactory.getItemPool(2);
    expect(pool.length).toBe(4);
    expect(pool.every(t => t.tier === 2)).toBe(true);
  });

  it('generateNPCTradeItems 生成 3-5 件 MarketItem', () => {
    const items = ItemFactory.generateNPCTradeItems(2, ['Material', 'Medicine'], 4, () => 0.5);
    expect(items.length).toBe(4);
    items.forEach(mi => {
      expect(mi.item).toBeDefined();
      expect(mi.basePrice).toBeGreaterThan(0);
      expect(mi.count).toBeGreaterThanOrEqual(1);
    });
  });

  it('RNG 种子可复现', () => {
    const seedFn = () => 0.3;
    const items1 = ItemFactory.generateNPCTradeItems(2, ['Material'], 3, seedFn);
    ItemFactory.loadTemplates([...TEST_TEMPLATES]);
    const items2 = ItemFactory.generateNPCTradeItems(2, ['Material'], 3, seedFn);
    expect(items1.map(m => m.item.templateId)).toEqual(items2.map(m => m.item.templateId));
  });
});
