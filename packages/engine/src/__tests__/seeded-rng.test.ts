import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../battle/seeded-rng.js';

describe('createSeededRng', () => {
  it('相同 seed 产生相同序列', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('不同 seed 产生不同序列', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it('输出始终在 [0, 1) 区间', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
