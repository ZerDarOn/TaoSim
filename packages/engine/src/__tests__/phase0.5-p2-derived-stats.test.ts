// ============================================================
// Phase 0.5 P2 测试：统一派生属性与境界尺度
//
// 验证：
// - Mortal 作为显式凡人境界
// - 凡人 HP=5, 灵力=0
// - DerivedStats 统一派生函数
// - 境界升级影响 HP/灵力/攻击/防御/速度
// - 玩家与 NPC 共用同一公式
// ============================================================

import { describe, it, expect } from 'vitest';
import { computeDerivedStats } from '../character/derived-stats.js';
import type { SpiritRoot } from '@taosim/contracts';

// —— 测试夹具 ——

const mortalRoot: SpiritRoot = { grade: 'Yellow', elements: ['Earth'], isVariant: false };
const heavenRoot: SpiritRoot = { grade: 'Heaven', elements: ['Fire'], isVariant: false };

const baseAttrs = { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 };

// ============================================================
// 凡人境界测试
// ============================================================
describe('P2 凡人（Mortal）境界', () => {
  it('健康成年凡人气血为 5', () => {
    const stats = computeDerivedStats({
      realm: 'Mortal',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 80,
    });
    expect(stats.maxHp).toBe(5);
  });

  it('凡人灵力上限为 0（未引气入体）', () => {
    const stats = computeDerivedStats({
      realm: 'Mortal',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 80,
    });
    expect(stats.maxSpiritEnergy).toBe(0);
  });
});

// ============================================================
// DerivedStats 统一派生
// ============================================================
describe('P2 DerivedStats 统一派生', () => {
  it('QiRefinement_1 有灵力上限（引气入体后）', () => {
    const stats = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    expect(stats.maxHp).toBeGreaterThan(5);
    expect(stats.maxSpiritEnergy).toBeGreaterThan(0);
  });

  it('境界提升时 HP 和灵力都增加', () => {
    const qi1 = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    const foundation1 = computeDerivedStats({
      realm: 'Foundation_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 50,
      maxLifespan: 200,
    });
    expect(foundation1.maxHp).toBeGreaterThan(qi1.maxHp);
    expect(foundation1.maxSpiritEnergy).toBeGreaterThan(qi1.maxSpiritEnergy);
  });

  it('境界提升时攻击/防御/速度也增加', () => {
    const qi1 = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    const foundation1 = computeDerivedStats({
      realm: 'Foundation_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 50,
      maxLifespan: 200,
    });
    expect(foundation1.attack).toBeGreaterThan(qi1.attack);
    expect(foundation1.defense).toBeGreaterThan(qi1.defense);
    expect(foundation1.speed).toBeGreaterThanOrEqual(qi1.speed);
  });

  it('体质影响 HP（同境界体质高者血厚）', () => {
    const weak = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: { ...baseAttrs, physique: 5 },
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    const strong = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: { ...baseAttrs, physique: 50 },
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    expect(strong.maxHp).toBeGreaterThan(weak.maxHp);
  });

  it('天灵根提升灵力上限（修炼效率更高）', () => {
    const yellow = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    const heaven = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: heavenRoot,
      age: 25,
      maxLifespan: 100,
    });
    expect(heaven.maxSpiritEnergy).toBeGreaterThan(yellow.maxSpiritEnergy);
  });

  it('同输入确定同输出（纯函数）', () => {
    const input = {
      realm: 'QiRefinement_3' as const,
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 30,
      maxLifespan: 120,
    };
    const a = computeDerivedStats(input);
    const b = computeDerivedStats(input);
    expect(a).toEqual(b);
  });
});

// ============================================================
// 神识/命中/闪避
// ============================================================
describe('P2 DerivedStats 扩展维度', () => {
  it('境界提升时神识增加', () => {
    const qi1 = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    const foundation1 = computeDerivedStats({
      realm: 'Foundation_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 50,
      maxLifespan: 200,
    });
    expect(foundation1.perception).toBeGreaterThan(qi1.perception);
  });

  it('凡人所有战斗属性极低', () => {
    const mortal = computeDerivedStats({
      realm: 'Mortal',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 80,
    });
    const qi1 = computeDerivedStats({
      realm: 'QiRefinement_1',
      attributes: baseAttrs,
      spiritRoot: mortalRoot,
      age: 25,
      maxLifespan: 100,
    });
    expect(mortal.attack).toBeLessThan(qi1.attack);
    expect(mortal.defense).toBeLessThan(qi1.defense);
  });
});
