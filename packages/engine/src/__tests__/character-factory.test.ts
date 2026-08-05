import { describe, it, expect } from 'vitest';
import { CharacterFactory } from '../character/character-factory.js';
import { getTraitById } from '../data/trait-registry.js';

describe('CharacterFactory', () => {
  const DEFAULT_ATTRS = {
    physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5,
  } as const;

  it('从散修背景创建炼气期角色', () => {
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
    expect(c.realm).toBe('QiRefinement_1');
    expect(c.canFly).toBe(false);
    expect(c.hp).toBe(c.maxHp);
    expect(c.maxHp).toBeGreaterThan(0);
    expect(c.inventory).toEqual([]);
  });

  it('荒古世家背景自带功法、法宝和宗门靠山', () => {
    const c = CharacterFactory.create({
      name: '世家子',
      gender: 'Male',
      background: 'ancient-clan',
      attributes: { ...DEFAULT_ATTRS },
      innateTraits: [],
    });
    expect(c.factionId).toBeTruthy();
    expect(c.factionRank).toBe('Disciple');
    expect(c.equipmentSlots.weapon).toBeTruthy();
    expect(c.equipmentSlots.weapon!.tier).toBe(2);
    expect(c.skills.length).toBeGreaterThan(0);
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

describe('CharacterFactory Phase 10 — registry 接入 + 初始灵石', () => {
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

  it('orphan 背景初始灵石 100', () => {
    const c = CharacterFactory.create(baseParams);
    expect(c.spiritStones).toBe(100);
  });

  it('small-clan 背景初始灵石 500', () => {
    const c = CharacterFactory.create({ ...baseParams, background: 'small-clan' });
    expect(c.spiritStones).toBe(500);
  });

  it('ancient-clan 背景初始灵石 2000', () => {
    const c = CharacterFactory.create({ ...baseParams, background: 'ancient-clan' });
    expect(c.spiritStones).toBe(2000);
  });

  it('未知的 trait id 被静默跳过（不抛错）', () => {
    const c = CharacterFactory.create({ ...baseParams, innateTraits: ['TRAIT_NONEXISTENT'] });
    expect(c.traits.length).toBe(0);
  });
});
