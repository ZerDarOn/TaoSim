import { describe, it, expect } from 'vitest';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

const sword: Item = {
  id: 'SWORD_1', name: '铁剑', tier: 1, type: 'Equipment',
  attributes: { attack: 12, critRate: 3 },
};

const armor: Item = {
  id: 'ARMOR_1', name: '布甲', tier: 1, type: 'Equipment',
  attributes: { defense: 8 },
};

const treasure: Item = {
  id: 'TREASURE_1', name: '护心镜', tier: 2, type: 'Equipment',
  attributes: { defense: 5, physique: 2 },
};

describe('EquipmentManager', () => {
  it('穿戴武器到空槽位', () => {
    const player = makePlayer({ inventory: [{ item: sword, count: 1 }] });
    const result = EquipmentManager.equip(player, sword);
    expect(result.success).toBe(true);
    expect(player.equipmentSlots.weapon).toBeDefined();
    expect(player.equipmentSlots.weapon!.id).toBe('SWORD_1');
    expect(player.inventory.length).toBe(0);
  });

  it('槽位已有装备时先卸下再穿戴', () => {
    const oldSword: Item = { ...sword, id: 'OLD_SWORD' };
    const player = makePlayer({
      equipmentSlots: { weapon: oldSword, armor: undefined, treasures: [] },
      inventory: [{ item: sword, count: 1 }],
    });
    const result = EquipmentManager.equip(player, sword);
    expect(result.success).toBe(true);
    expect(player.equipmentSlots.weapon!.id).toBe('SWORD_1');
    expect(player.inventory.find(s => s.item.id === 'OLD_SWORD')).toBeDefined();
  });

  it('卸下装备退回背包', () => {
    const player = makePlayer({
      equipmentSlots: { weapon: sword, armor: undefined, treasures: [] },
    });
    const result = EquipmentManager.unequip(player, 'weapon');
    expect(result.success).toBe(true);
    expect(player.equipmentSlots.weapon).toBeUndefined();
    expect(player.inventory.find(s => s.item.id === 'SWORD_1')!.count).toBe(1);
  });

  it('聚合所有装备属性加成', () => {
    const player = makePlayer({
      equipmentSlots: {
        weapon: sword,
        armor: armor,
        treasures: [treasure],
      },
    });
    const bonuses = EquipmentManager.getCombatBonuses(player);
    expect(bonuses.attack).toBe(12);
    expect(bonuses.defense).toBe(13);
    expect(bonuses.critRate).toBe(3);
    expect(bonuses.physique).toBe(2);
  });
});
