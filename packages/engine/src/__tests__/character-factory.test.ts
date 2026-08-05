import { describe, it, expect } from 'vitest';
import { CharacterFactory } from '../character/character-factory.js';

describe('CharacterFactory', () => {
  const DEFAULT_ATTRS = {
    physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5,
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

  it('先天气运词条被正确挂载', () => {
    const c = CharacterFactory.create({
      name: '气运之子',
      gender: 'Female',
      background: 'small-clan',
      attributes: { ...DEFAULT_ATTRS },
      innateTraits: ['剑道奇才', '重瞳'],
    });
    expect(c.traits.length).toBe(2);
    expect(c.traits[0]!.name).toBe('剑道奇才');
    expect(Object.keys(c.traits[0]!.effects).length).toBeGreaterThan(0);
  });
});
