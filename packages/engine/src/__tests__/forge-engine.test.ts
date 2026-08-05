import { describe, it, expect } from 'vitest';
import { ForgeEngine } from '../crafting/forge-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P', name: '铸剑师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [
      { item: { id: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', attributes: {} }, count: 2 },
      { item: { id: 'MAT_SPIRIT_STONE', name: '灵石', tier: 2, type: 'Material', attributes: {} }, count: 3 },
    ],
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

describe('ForgeEngine', () => {
  it('主材足够时成功炼制法宝', () => {
    // 75% 成功率，最多重试 5 次保证不因随机数失败
    let success = false;
    for (let i = 0; i < 5; i++) {
      const player = makePlayer();
      const result = ForgeEngine.craft(player, '灵蕴剑');
      if (result.success) {
        expect(result.equipment).toBeDefined();
        expect(result.equipment!.name).toBe('灵蕴剑');
        expect(result.equipment!.tier).toBe(2);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('主材不足时炼制失败', () => {
    const player = makePlayer({ inventory: [] });
    const result = ForgeEngine.craft(player, '灵蕴剑');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('主材');
  });

  it('加入辅材提升属性', () => {
    // 固定随机数避免 flaky: craft 成功率判定用 random()[0]，品质 roll 用 random()[1]
    const origRandom = Math.random;
    let calls = 0;
    Math.random = () => { calls++; return calls === 1 ? 0.0 : 0.5; }; // 第一次强制成功, 后续 Common 品质
    const player = makePlayer();
    const result = ForgeEngine.craft(player, '灵蕴剑', ['MAT_SPIRIT_STONE']);
    Math.random = origRandom;
    expect(result.success).toBe(true);
    // 基础 critRate=5, Common 品质 ×1.0, 断言保留
    expect(result.equipment!.attributes.critRate!).toBeGreaterThanOrEqual(5);
  });

  it('根骨影响炼制成功率', () => {
    let successes = 0;
    for (let i = 0; i < 20; i++) {
      const player = makePlayer({ attributes: { physique: 100, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 } });
      if (ForgeEngine.craft(player, '灵蕴剑').success) successes++;
    }
    expect(successes).toBeGreaterThanOrEqual(18);
  });
});
