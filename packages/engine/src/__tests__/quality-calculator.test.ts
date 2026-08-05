import { describe, it, expect } from 'vitest';
import { QualityCalculator } from '../crafting/quality-calculator.js';
import type { ItemTemplate, ItemQuality } from '@taosim/contracts';

function makeTemplate(overrides: Partial<ItemTemplate> = {}): ItemTemplate {
  return {
    templateId: 'EQ_TEST',
    name: '测试剑',
    tier: 2,
    type: 'Equipment',
    baseAttributes: { attack: 20, critRate: 5 },
    ...overrides,
  };
}

describe('QualityCalculator', () => {
  it('Common 品质 ×1.0', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Common');
    expect(attrs.attack).toBe(20);
    expect(attrs.critRate).toBe(5);
  });

  it('Rare 品质 ×1.5', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Rare');
    expect(attrs.attack).toBe(30);
    expect(attrs.critRate).toBe(7);
  });

  it('Epic 品质 ×2.5', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Epic');
    expect(attrs.attack).toBe(50);
  });

  it('Legendary 品质 ×5.0', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Legendary');
    expect(attrs.attack).toBe(100);
  });

  it('getMaxQualityForTier Tier 1 封顶 Rare', () => {
    expect(QualityCalculator.getMaxQualityForTier(1)).toBe('Rare');
  });

  it('getMaxQualityForTier Tier 2+ 可到 Legendary', () => {
    expect(QualityCalculator.getMaxQualityForTier(2)).toBe('Legendary');
    expect(QualityCalculator.getMaxQualityForTier(5)).toBe('Legendary');
  });

  it('rollSpecialEffect 返回有效特效', () => {
    const effect = QualityCalculator.rollSpecialEffect();
    expect(['SOUL_GUARD', 'BLOOD_THIRST', 'MANA_SHIELD', 'QUICK_STRIKE', 'PHOENIX_REBIRTH', 'VITALITY_SIPHON']).toContain(effect);
  });

  it('rollQuality 普通锻造分布 (mock random)', () => {
    expect(QualityCalculator.rollQuality(() => 0.005)).toBe('Legendary');
    expect(QualityCalculator.rollQuality(() => 0.05)).toBe('Epic');
    expect(QualityCalculator.rollQuality(() => 0.20)).toBe('Rare');
    expect(QualityCalculator.rollQuality(() => 0.50)).toBe('Common');
  });

  it('rollQualityMaster 大师锻造分布', () => {
    expect(QualityCalculator.rollQualityMaster(() => 0.03)).toBe('Legendary');
    expect(QualityCalculator.rollQualityMaster(() => 0.15)).toBe('Epic');
    expect(QualityCalculator.rollQualityMaster(() => 0.50)).toBe('Rare');
  });

  it('rollPillQuality 炼丹品质分布', () => {
    expect(QualityCalculator.rollPillQuality(() => 0.03)).toBe('Legendary');
    expect(QualityCalculator.rollPillQuality(() => 0.10)).toBe('Epic');
    expect(QualityCalculator.rollPillQuality(() => 0.30)).toBe('Rare');
    expect(QualityCalculator.rollPillQuality(() => 0.60)).toBe('Common');
  });
});
