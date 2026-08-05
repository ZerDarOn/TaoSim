import { describe, it, expect } from 'vitest';
import { AlchemyEngine } from '../crafting/alchemy-engine.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '丹师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 20, perception: 8, agility: 5, luck: 5, charm: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [
      { item: { id: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', attributes: {} }, count: 3 },
      { item: { id: 'MAT_YIN_DEW', name: '阴露', tier: 2, type: 'Material', attributes: {}, poisonValence: 2 }, count: 2 },
      { item: { id: 'MAT_YANG_STONE', name: '阳石', tier: 2, type: 'Material', attributes: {}, poisonValence: -2 }, count: 2 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

describe('AlchemyEngine 品质系统', () => {
  it('craftPill 成功产出带品质的丹药', () => {
    let success = false;
    for (let i = 0; i < 10; i++) {
      const player = makePlayer();
      const result = AlchemyEngine.craftPill(player, '筑基丹');
      if (result.success && result.pill) {
        expect(result.pill.quality).toBeDefined();
        expect(['Common', 'Rare', 'Epic', 'Legendary']).toContain(result.pill.quality);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('getPillEffect 聚气丹 Common 因丹毒打折', () => {
    const pill: Item = {
      id: 'TEST', name: '聚气丹', tier: 1, type: 'Medicine',
      attributes: { pillCategory: 0, effectValue: 50 } as Item['attributes'],
      quality: 'Common',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(30); // 50 * 0.6
  });

  it('getPillEffect 聚气丹 Legendary', () => {
    const pill: Item = {
      id: 'TEST', name: '聚气丹', tier: 1, type: 'Medicine',
      attributes: { pillCategory: 0, effectValue: 50 } as Item['attributes'],
      quality: 'Legendary',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(120); // 50 * 2.4
  });

  it('getPillEffect 突破丹固定加成', () => {
    const pill: Item = {
      id: 'TEST', name: '筑基丹', tier: 2, type: 'Medicine',
      attributes: { pillCategory: 1 } as Item['attributes'],
      quality: 'Common',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(5);
  });

  it('getPillEffect 突破丹 Legendary', () => {
    const pill: Item = {
      id: 'TEST', name: '筑基丹', tier: 2, type: 'Medicine',
      attributes: { pillCategory: 1 } as Item['attributes'],
      quality: 'Legendary',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(25);
  });
});
