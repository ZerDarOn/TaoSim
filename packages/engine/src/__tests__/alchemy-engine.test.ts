import { describe, it, expect } from 'vitest';
import { AlchemyEngine } from '../crafting/alchemy-engine.js';
import type { Character } from '@taosim/contracts';
import type { Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'PLAYER', name: '丹师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 10, perception: 8, agility: 5, luck: 5, charm: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [
      { item: { id: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', attributes: {}, poisonValence: 0 }, count: 3 },
      { item: { id: 'MAT_YIN_DEW', name: '阴露', tier: 1, type: 'Material', attributes: {}, poisonValence: 2 }, count: 2 },
      { item: { id: 'MAT_YANG_STONE', name: '阳石', tier: 1, type: 'Material', attributes: {}, poisonValence: -2 }, count: 2 },
    ],
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('AlchemyEngine', () => {
  it('材料足够时成功炼制筑基丹', () => {
    // 75% 成功率，最多重试 5 次保证不因随机数失败
    let success = false;
    for (let i = 0; i < 5; i++) {
      const player = makePlayer();
      const result = AlchemyEngine.craftPill(player, '筑基丹');
      if (result.success) {
        expect(result.pill).toBeDefined();
        expect(result.pill!.name).toBe('筑基丹');
        const grass = player.inventory.find(s => s.item.id === 'MAT_SPIRIT_GRASS');
        expect(grass!.count).toBe(2);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('材料不足时炼制失败', () => {
    const player = makePlayer({ inventory: [] });
    const result = AlchemyEngine.craftPill(player, '筑基丹');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('材料不足');
  });

  it('高毒性材料导致毒丹转化', () => {
    let success = false;
    const invTemplate = [
      { item: { id: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material' as const, attributes: {}, poisonValence: 0 }, count: 3 },
      { item: { id: 'MAT_YIN_DEW', name: '阴露', tier: 1, type: 'Material' as const, attributes: {}, poisonValence: 10 }, count: 2 },
      { item: { id: 'MAT_YANG_STONE', name: '阳石', tier: 1, type: 'Material' as const, attributes: {}, poisonValence: -1 }, count: 2 },
    ];
    for (let i = 0; i < 5; i++) {
      const player = makePlayer({
        inventory: invTemplate.map(s => ({ item: { ...s.item }, count: s.count })),
      });
      const result = AlchemyEngine.craftPill(player, '筑基丹');
      if (result.success) {
        expect(result.pill).toBeDefined();
        expect(result.pill!.name).toContain('毒');
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('悟性影响成功率', () => {
    const genius = makePlayer({ attributes: { physique: 5, comprehension: 100, perception: 8, agility: 5, luck: 5, charm: 5 } });
    // 高悟性几乎必定成功
    let successes = 0;
    for (let i = 0; i < 20; i++) {
      const player = makePlayer({ ...genius, inventory: [...genius.inventory.map(s => ({ ...s }))] });
      if (AlchemyEngine.craftPill(player, '筑基丹').success) successes++;
    }
    expect(successes).toBeGreaterThanOrEqual(15);
  });
});
