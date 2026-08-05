import { describe, it, expect } from 'vitest';
import { ForgeEngine } from '../crafting/forge-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '炼器师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 8, agility: 5, luck: 5, charm: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 5000,
    inventory: [
      { item: { id: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_METEORITE', name: '陨铁', tier: 3, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', attributes: {} }, count: 3 },
      { item: { id: 'MAT_STARLIGHT', name: '星光粉', tier: 3, type: 'Material', attributes: {} }, count: 2 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

describe('ForgeEngine 品质系统', () => {
  it('craft 成功产出带品质的装备', () => {
    let success = false;
    for (let i = 0; i < 10; i++) {
      const player = makePlayer();
      const result = ForgeEngine.craft(player, '灵蕴剑');
      if (result.success && result.equipment) {
        expect(result.equipment.quality).toBeDefined();
        expect(['Common', 'Rare', 'Epic', 'Legendary']).toContain(result.equipment.quality);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('craft Epic 品质属性放大', () => {
    const origRandom = Math.random;
    Math.random = () => 0.05;
    const player = makePlayer();
    const result = ForgeEngine.craft(player, '灵蕴剑');
    Math.random = origRandom;
    if (result.success && result.equipment) {
      expect(result.equipment.attributes.attack).toBeGreaterThanOrEqual(30);
    }
  });

  it('craftMaster 成功保底 Rare', () => {
    let success = false;
    for (let i = 0; i < 20; i++) {
      const player = makePlayer();
      const result = ForgeEngine.craftMaster(player, '星辰剑');
      if (result.success && result.equipment) {
        expect(['Rare', 'Epic', 'Legendary']).toContain(result.equipment.quality);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('craftMaster 阶段1失败损全部材料', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    const player = makePlayer();
    const result = ForgeEngine.craftMaster(player, '星辰剑');
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.message).toContain('失败');
  });
});
