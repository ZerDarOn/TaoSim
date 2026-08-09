import { describe, it, expect } from 'vitest';
import type { NpcRecord } from '@taosim/contracts';
import { affinity } from '../world/affinity.js';

function makeNpc(seed: number, overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: `NPC_${seed}`, name: '散修', gender: 'Male', personalityId: 'neutral',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
    realm: 'QiRefinement_3', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 240 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [], birthYear: 1, birthMonth: 1,
    relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    affinityMatrixSeed: seed,
    ...overrides,
  };
}

describe('affinity（兼容性基底 §spec 3.3.1）', () => {
  it('确定性：同对 NPC 多次计算一致', () => {
    const a = makeNpc(0.123);
    const b = makeNpc(0.456);
    expect(affinity(a, b)).toBe(affinity(a, b));
  });

  it('对称性：affinity(a,b) === affinity(b,a)', () => {
    const a = makeNpc(0.123);
    const b = makeNpc(0.456);
    expect(affinity(a, b)).toBe(affinity(b, a));
  });

  it('值域在 [-1, 1]', () => {
    for (let i = 1; i <= 50; i++) {
      const a = makeNpc(i / 100);
      const b = makeNpc((i * 7) / 100);
      const v = affinity(a, b);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('不同种子对分布不集中于 0（有差异）', () => {
    const a = makeNpc(0.1);
    const b = makeNpc(0.2);
    const c = makeNpc(0.3);
    const vals = new Set([affinity(a, b), affinity(a, c), affinity(b, c)]);
    expect(vals.size).toBeGreaterThan(1);
  });
});
