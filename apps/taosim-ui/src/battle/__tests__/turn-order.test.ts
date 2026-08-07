import { describe, it, expect } from 'vitest';
import { computeTurnOrder } from '../turn-order';

describe('computeTurnOrder', () => {
  it('按 gauge 降序返回行动顺序', () => {
    const atb = {
      a: { gauge: 100, actionReady: true },
      b: { gauge: 60, actionReady: false },
      c: { gauge: 85, actionReady: true },
    };
    expect(computeTurnOrder(atb)).toEqual(['a', 'c', 'b']);
  });

  it('排除指定角色（当前行动者）后返回剩余预告', () => {
    const atb = {
      a: { gauge: 100, actionReady: true },
      b: { gauge: 60, actionReady: false },
    };
    expect(computeTurnOrder(atb, ['a'])).toEqual(['b']);
  });
});
