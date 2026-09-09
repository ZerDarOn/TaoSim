import { describe, it, expect } from 'vitest';
import { CharacterFactory } from '../character/character-factory.js';
import { getTraitById } from '../data/trait-registry.js';

describe('CharacterFactory', () => {
  const DEFAULT_ATTRS = {
    physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5,
  } as const;

  it('从散修背景创建尚未引气入体的凡人', () => {
    const c = CharacterFactory.create({
      name: '测试道人',
      gender: 'Male',
      background: 'orphan',
      attributes: { ...DEFAULT_ATTRS },
      innateTraits: [],
    });
    expect(c.id).toBeTruthy();
    expect(c.name).toBe('测试道人');
    expect(c.gender).toBe('Male');
    expect(c.realm).toBe('Mortal');
    expect(c.canFly).toBe(false);
    expect(c.hp).toBe(c.maxHp);
    expect(c.maxHp).toBe(5);
    expect(c.spiritEnergy).toEqual({ current: 0, max: 0 });
    expect(c.inventory).toEqual([]);
  });

  it('荒古世家也不凭空获得功法、法宝或宗门身份', () => {
    const c = CharacterFactory.create({
      name: '世家子',
      gender: 'Male',
      background: 'ancient-clan',
      attributes: { ...DEFAULT_ATTRS },
      innateTraits: [],
    });
    expect(c.factionId).toBeUndefined();
    expect(c.factionRank).toBeUndefined();
    expect(c.equipmentSlots.weapon).toBeUndefined();
    expect(c.skills).toEqual([]);
  });

  it('先天气运词条被正确挂载（从 TRAIT_REGISTRY）', () => {
    const c = CharacterFactory.create({
      name: '气运之子',
      gender: 'Female',
      background: 'small-clan',
      attributes: { ...DEFAULT_ATTRS },
      innateTraits: ['TRAIT_SWORD_BONE', 'TRAIT_BORN_WISDOM'],
    });
    expect(c.traits.length).toBe(2);
    // 剑骨 = TRAIT_SWORD_BONE
    const swordBone = c.traits.find(t => t.id === 'TRAIT_SWORD_BONE');
    expect(swordBone).toBeTruthy();
    expect(swordBone!.name).toBe('剑骨');
    expect(Object.keys(swordBone!.effects).length).toBeGreaterThan(0);
  });
});

describe('CharacterFactory — registry 接入 + 凡人家世资财', () => {
  const baseParams = {
    name: '测试修士',
    gender: 'Male' as const,
    background: 'orphan' as const,
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    innateTraits: ['TRAIT_SWORD_BONE'],
    spiritRoot: { grade: 'Yellow' as const, elements: ['Earth' as const], isVariant: false },
    gameMode: { breakthrough: 'Simple' as const, saveMode: 'Free' as const },
  };

  it('用 TRAIT_REGISTRY 查词条，trait 内容与 registry 一致', () => {
    const c = CharacterFactory.create(baseParams);
    expect(c.traits.length).toBe(1);
    expect(c.traits[0]!.id).toBe('TRAIT_SWORD_BONE');
    const registryTrait = getTraitById('TRAIT_SWORD_BONE');
    expect(c.traits[0]!.effects).toEqual(registryTrait!.effects);
    expect(c.traits[0]!.quality).toEqual(registryTrait!.quality);
  });

  it('orphan 背景没有凭空灵石', () => {
    const c = CharacterFactory.create(baseParams);
    expect(c.spiritStones).toBe(0);
  });

  it('small-clan 背景只有凡人尺度资财', () => {
    const c = CharacterFactory.create({ ...baseParams, background: 'small-clan' });
    expect(c.spiritStones).toBe(20);
  });

  it('ancient-clan 背景只有可追溯的家族资财', () => {
    const c = CharacterFactory.create({ ...baseParams, background: 'ancient-clan' });
    expect(c.spiritStones).toBe(100);
  });

  it('未知的 trait id 被静默跳过（不抛错）', () => {
    const c = CharacterFactory.create({ ...baseParams, innateTraits: ['TRAIT_NONEXISTENT'] });
    expect(c.traits.length).toBe(0);
  });
});

describe('CharacterFactory arrival modes', () => {
  it('诞生模式从 age = 0 交给世界同期演化', () => {
    const c = CharacterFactory.create({
      name: '测试', gender: 'Male', background: 'orphan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [], arrivalMode: 'birth',
    });
    expect(c.lifespan.age).toBe(0);
    expect(c.realm).toBe('Mortal');
  });

  it('穿越模式 age = startAge', () => {
    const c = CharacterFactory.create({
      name: '测试', gender: 'Male', background: 'orphan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [], arrivalMode: 'transmigration', startAge: 25,
    });
    expect(c.lifespan.age).toBe(25);
  });

  it('穿越模式白板开局（无灵石/装备/宗门）', () => {
    const c = CharacterFactory.create({
      name: '测试', gender: 'Male', background: 'ancient-clan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [], arrivalMode: 'transmigration', startAge: 20,
    });
    expect(c.spiritStones).toBe(0);
    expect(c.equipmentSlots.weapon).toBeUndefined();
    expect(c.factionId).toBeUndefined();
    expect(c.skills.length).toBe(0);
  });

  it('穿越模式悟性 +5', () => {
    const c = CharacterFactory.create({
      name: '测试', gender: 'Male', background: 'orphan',
      attributes: { physique: 5, comprehension: 10, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [], arrivalMode: 'transmigration', startAge: 20,
    });
    expect(c.attributes.comprehension).toBe(15);
  });

  it('诞生模式 ancient-clan 只保留凡人资财', () => {
    const c = CharacterFactory.create({
      name: '测试', gender: 'Male', background: 'ancient-clan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [], arrivalMode: 'birth',
    });
    expect(c.lifespan.age).toBe(0);
    expect(c.spiritStones).toBe(100);
    expect(c.equipmentSlots.weapon).toBeUndefined();
    expect(c.factionId).toBeUndefined();
  });

  it('上帝观察模式没有肉身资源或修为', () => {
    const c = CharacterFactory.create({
      name: '天道', gender: 'Other', background: 'ancient-clan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [], arrivalMode: 'god',
    });
    expect(c.realm).toBe('Mortal');
    expect(c.spiritStones).toBe(0);
    expect(c.spiritEnergy.max).toBe(0);
    expect(c.skills).toEqual([]);
  });

  it('默认 unlockedRecipes 含聚气丹', () => {
    const c = CharacterFactory.create({
      name: '测试', gender: 'Male', background: 'orphan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [],
    });
    expect(c.unlockedRecipes).toContain('RECIPE_QI_PILL');
  });
});
