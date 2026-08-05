import { describe, it, expect } from 'vitest';
import { SpiritRootRoller } from '../character/spirit-root-roller.js';
import type { SpiritElementType } from '@taosim/contracts';

// 确定性 RNG 工厂
function makeRng(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

describe('SpiritRootRoller', () => {
  it('roll 普通灵根返回正确结构', () => {
    // rng()[0]=0.95 → 非变异(>0.92), rng()[1]=0.95 → 黄阶(>0.80)
    const root = SpiritRootRoller.roll(makeRng(0.95, 0.95, 0.5, 0.5, 0.5));
    expect(root.isVariant).toBe(false);
    expect(root.grade).toBe('Yellow');
    expect(root.elements.length).toBeGreaterThanOrEqual(1);
    expect(root.elements.length).toBeLessThanOrEqual(3);
  });

  it('roll 天灵根', () => {
    // rng()[0]=0.95 → 非变异, rng()[1]=0.01 → 天阶(<=0.05)
    const root = SpiritRootRoller.roll(makeRng(0.95, 0.01, 0.5));
    expect(root.grade).toBe('Heaven');
    expect(root.isVariant).toBe(false);
  });

  it('roll 地灵根', () => {
    // rng()[0]=0.95 → 非变异, rng()[1]=0.10 → 地阶(0.05< <=0.20)
    const root = SpiritRootRoller.roll(makeRng(0.95, 0.10, 0.5));
    expect(root.grade).toBe('Earth');
  });

  it('roll 玄灵根', () => {
    // rng()[0]=0.95 → 非变异, rng()[1]=0.50 → 玄阶(0.20< <=0.70)
    const root = SpiritRootRoller.roll(makeRng(0.95, 0.50, 0.5));
    expect(root.grade).toBe('Profound');
  });

  it('roll 变异灵根返回 isVariant=true', () => {
    // rng()[0]=0.05 → 变异(<=0.08)
    const root = SpiritRootRoller.roll(makeRng(0.05, 0.5, 0.5, 0.5));
    expect(root.isVariant).toBe(true);
    expect(root.elements.length).toBe(1);
  });

  it('roll 变异灵根元素只能是 Thunder/Ice/Wind/Dark', () => {
    // 多次 roll 变异灵根
    const variantElements: SpiritElementType[] = ['Thunder', 'Ice', 'Wind', 'Dark'];
    for (let i = 0; i < 20; i++) {
      const root = SpiritRootRoller.roll(makeRng(0.01, 0.5, 0.5, Math.random()));
      expect(root.isVariant).toBe(true);
      expect(variantElements).toContain(root.elements[0]);
    }
  });

  it('roll 普通灵根元素只能是五行', () => {
    const wuxing: SpiritElementType[] = ['Metal', 'Wood', 'Water', 'Fire', 'Earth'];
    for (let i = 0; i < 20; i++) {
      const root = SpiritRootRoller.roll(makeRng(0.95, 0.5, Math.random(), Math.random(), Math.random()));
      expect(root.isVariant).toBe(false);
      root.elements.forEach(e => expect(wuxing).toContain(e));
    }
  });

  it('roll 不返回空 elements', () => {
    for (let i = 0; i < 30; i++) {
      const root = SpiritRootRoller.roll();
      expect(root.elements.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('roll 多次产出不同结果（随机性验证）', () => {
    const grades = new Set<string>();
    for (let i = 0; i < 100; i++) {
      grades.add(SpiritRootRoller.roll().grade);
    }
    // 100 次 roll 应该至少出现 3 种以上品级
    expect(grades.size).toBeGreaterThanOrEqual(3);
  });
});
