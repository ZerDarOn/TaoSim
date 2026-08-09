import { describe, it, expect } from 'vitest';
import type { Skill } from '@taosim/contracts';
import { skillRange } from '../battle/skill-range.js';

function makeSkill(primitives: Skill['primitives']): Skill {
  return {
    id: 's', name: '测试', quality: 'Huang', type: 'Active',
    primitives, cost: { ap: 1, spiritEnergy: 0 }, cooldownTurns: 0,
  };
}

describe('skillRange（技能射程解析）', () => {
  it('普攻（无 Geometry 原子）默认射程 1', () => {
    expect(skillRange(makeSkill([]))).toBe(1);
  });

  it('从 Geometry 原子解析 range', () => {
    const skill = makeSkill([
      { id: 'a1', category: 'Geometry', params: { type: 'Single', range: 2 }, costBudget: 10 },
      { id: 'a2', category: 'Numeric', params: { multiplier: 1.2 }, costBudget: 10 },
    ]);
    expect(skillRange(skill)).toBe(2);
  });

  it('无 range 参数的 Geometry 原子回退 1', () => {
    const skill = makeSkill([
      { id: 'a1', category: 'Geometry', params: { type: 'Self' }, costBudget: 8 },
    ]);
    expect(skillRange(skill)).toBe(1);
  });

  it('多 Geometry 原子取最大 range（覆盖 AOE/Line 组合）', () => {
    const skill = makeSkill([
      { id: 'a1', category: 'Geometry', params: { type: 'Single', range: 1 }, costBudget: 10 },
      { id: 'a2', category: 'Geometry', params: { type: 'AOE', range: 3 }, costBudget: 12 },
    ]);
    expect(skillRange(skill)).toBe(3);
  });
});
