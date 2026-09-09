import { describe, it, expect } from 'vitest';
import { UpgradeEngine } from '../crafting/upgrade-engine.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 5, agility: 5, luck: 5, charm: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 10000,
    inventory: [
      { item: { id: 'MAT_IRON_ORE', templateId: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', attributes: {} }, count: 10 },
      { item: { id: 'MAT_METEORITE', templateId: 'MAT_METEORITE', name: '陨铁', tier: 3, type: 'Material', attributes: {} }, count: 10 },
      { item: { id: 'MAT_JADE', templateId: 'MAT_JADE', name: '灵玉', tier: 2, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_DRAGON_BLOOD', templateId: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', attributes: {} }, count: 10 },
      { item: { id: 'MAT_STARLIGHT', templateId: 'MAT_STARLIGHT', name: '星光粉', tier: 3, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_SKY_GOLD_SAND', templateId: 'MAT_SKY_GOLD_SAND', name: '天金砂', tier: 4, type: 'Material', attributes: {} }, count: 5 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

function makeEquipment(overrides: Partial<Item> = {}): Item {
  return {
    id: 'EQ_TEST_001',
    templateId: 'EQ_SPIRIT_SWORD',
    name: '灵蕴剑',
    tier: 2,
    type: 'Equipment',
    attributes: { attack: 15, critRate: 5 },
    quality: 'Common',
    durability: { current: 100, max: 100 },
    ...overrides,
  };
}

describe('UpgradeEngine', () => {
  it('getUpgradeRule Tier2 C→R', () => {
    const rule = UpgradeEngine.getUpgradeRule(2, 'Common', 'Rare');
    expect(rule).not.toBeNull();
    expect(rule!.successRate).toBe(0.7);
    expect(rule!.failPenalty).toBe('LossMaterialsOnly');
  });

  it('getUpgradeRule Tier2 R→E', () => {
    const rule = UpgradeEngine.getUpgradeRule(2, 'Rare', 'Epic');
    expect(rule).not.toBeNull();
    expect(rule!.failPenalty).toBe('DurabilityLoss');
  });

  it('getUpgradeRule Tier1 不能升 Epic (天花板)', () => {
    expect(UpgradeEngine.getUpgradeRule(1, 'Rare', 'Epic')).toBeNull();
  });

  it('enhance 成功升品', () => {
    const origRandom = Math.random;
    Math.random = () => 0.0;
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    Math.random = origRandom;
    expect(result.success).toBe(true);
    expect(result.resultItem!.quality).toBe('Rare');
    expect(result.resultItem!.attributes.attack).toBeGreaterThanOrEqual(20);
  });

  it('enhance 失败 LossMaterialsOnly 不损装备', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.penaltyTriggered).toBe('LossMaterialsOnly');
    expect(result.resultItem).toBeDefined();
    expect(result.resultItem!.quality).toBe('Common');
  });

  it('enhance DurabilityLoss 扣耐久', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Rare', tier: 2 });
    const result = UpgradeEngine.enhance(item, 'Epic', player);
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.penaltyTriggered).toBe('DurabilityLoss');
    expect(result.resultItem!.durability!.current).toBe(80);
  });

  it('enhance QualityDegrade 降品', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Epic', tier: 2, attributes: { attack: 38, critRate: 13 } });
    const result = UpgradeEngine.enhance(item, 'Legendary', player);
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.penaltyTriggered).toBe('QualityDegrade');
    expect(result.resultItem!.quality).toBe('Rare');
  });

  it('enhance 灵石不足失败', () => {
    const player = makePlayer({ spiritStones: 10 });
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    expect(result.success).toBe(false);
    expect(result.attempted).toBe(false);
    expect(result.message).toContain('灵石');
  });

  it('enhance 材料不足失败', () => {
    const player = makePlayer({ inventory: [] });
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    expect(result.success).toBe(false);
    expect(result.attempted).toBe(false);
    expect(result.message).toContain('材料');
  });
});
