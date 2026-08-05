import { describe, it, expect } from 'vitest';
import { MarketPricing } from '../market/market-pricing.js';
import type { Item } from '@taosim/contracts';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'TEST_ITEM',
    name: '测试物品',
    tier: 1,
    type: 'Material',
    attributes: {},
    ...overrides,
  };
}

describe('MarketPricing', () => {
  it('Tier 1 Material 基准价 = 100', () => {
    const item = makeItem({ tier: 1, type: 'Material' });
    expect(MarketPricing.getBasePrice(item)).toBe(100);
  });

  it('Tier 2 Medicine 基准价 = 600', () => {
    const item = makeItem({ tier: 2, type: 'Medicine' });
    expect(MarketPricing.getBasePrice(item)).toBe(600);
  });

  it('Tier 3 Equipment 基准价 = 1500', () => {
    const item = makeItem({ tier: 3, type: 'Equipment' });
    expect(MarketPricing.getBasePrice(item)).toBe(1500);
  });

  it('Quality Rare 基准价 = tier * typeBase * 1.5', () => {
    const item = makeItem({ tier: 2, type: 'Material', quality: 'Rare' });
    expect(MarketPricing.getBasePrice(item)).toBe(300);
  });

  it('Quality Epic 基准价 = tier * typeBase * 2.5', () => {
    const item = makeItem({ tier: 1, type: 'Equipment', quality: 'Epic' });
    expect(MarketPricing.getBasePrice(item)).toBe(1250);
  });

  it('Quality undefined fallback 为 1.0', () => {
    const item = makeItem({ tier: 3, type: 'Material' });
    expect(MarketPricing.getBasePrice(item)).toBe(300);
  });

  it('calculateBuyPrice 叠加多层折扣', () => {
    const item = makeItem({ tier: 2, type: 'Medicine' });
    const price = MarketPricing.calculateBuyPrice(item, 1.2, 0.9, 0.8);
    expect(price).toBe(518);
  });

  it('calculateSellPrice 基础回购价', () => {
    const item = makeItem({ tier: 1, type: 'Material' });
    const price = MarketPricing.calculateSellPrice(item, 0.7);
    expect(price).toBe(70);
  });

  it('calculateSellPrice 套利保护: 回购价不超过买入价的 80%', () => {
    const item = makeItem({ tier: 2, type: 'Equipment' });
    const currentBuyPrice = 1200;
    const sellPrice = MarketPricing.calculateSellPrice(item, 0.7, 1.0, currentBuyPrice);
    expect(sellPrice).toBeLessThanOrEqual(currentBuyPrice * 0.8);
    expect(sellPrice).toBe(700);
  });

  it('calculateSellPrice 套利保护触发: 高好感回购价被买家价限制', () => {
    const item = makeItem({ tier: 1, type: 'Equipment' });
    const currentBuyPrice = 300;
    const sellPrice = MarketPricing.calculateSellPrice(item, 0.9, 1.2, currentBuyPrice);
    expect(sellPrice).toBe(240);
  });

  it('最低价格不低于 1', () => {
    const item = makeItem({ tier: 1, type: 'Material' });
    const price = MarketPricing.calculateBuyPrice(item, 0.001, 0.001, 0.001);
    expect(price).toBeGreaterThanOrEqual(1);
  });

  it('Formula 类型基准价系数 = 200', () => {
    const item = makeItem({ tier: 2, type: 'Formula' });
    expect(MarketPricing.getBasePrice(item)).toBe(400);
  });
});
