import { describe, it, expect } from 'vitest';
import { DamagePipeline } from '../combat/damage-pipeline.js';
import type { Character, Skill } from '@taosim/contracts';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'test-' + Math.random().toString(36).slice(2, 6),
    name: 'Test', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 25, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 5 },
    hp: 500, maxHp: 500, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: { weapon: { id: 'sword', name: '剑', tier: 1, type: 'Equipment', attributes: { attack: 20 } }, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return { id: 'skill-test', name: 'Test', quality: 'Huang', type: 'Active', primitives: [], cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 0, ...overrides };
}

describe('DamagePipeline', () => {
  it('基础伤害 = (攻击力 - 防御力) * 技能系数', () => {
    const attacker = makeChar({ equipmentSlots: { weapon: { id: 'sword', name: '剑', tier: 1, type: 'Equipment', attributes: { attack: 30 } }, armor: undefined, treasures: [] } });
    const defender = makeChar({ attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 5 } });
    const result = DamagePipeline.calculate(attacker, defender, makeSkill(), false);
    expect(result.finalDamage).toBe(25);
    expect(result.blockedByBarrier).toBe(false);
  });

  it('境界壁垒：低打高无破罡时 100% 减免', () => {
    const jinDan = makeChar({ realm: 'GoldenCore_1' });
    const lianQi = makeChar({ realm: 'QiRefinement_1' });
    const highToLow = DamagePipeline.calculate(jinDan, lianQi, makeSkill(), false);
    expect(highToLow.blockedByBarrier).toBe(false);
    const lowToHigh = DamagePipeline.calculate(lianQi, jinDan, makeSkill(), false);
    expect(lowToHigh.blockedByBarrier).toBe(true);
    expect(lowToHigh.finalDamage).toBe(0);
  });

  it('破罡状态可破除境界壁垒', () => {
    const lianQi = makeChar({ realm: 'QiRefinement_1' });
    const jinDan = makeChar({ realm: 'GoldenCore_1' });
    const result = DamagePipeline.calculate(lianQi, jinDan, makeSkill(), true);
    expect(result.blockedByBarrier).toBe(false);
    expect(result.finalDamage).toBeGreaterThan(0);
  });

  it('装备防御力提供固定减伤', () => {
    const attacker = makeChar();
    const defender = makeChar({ equipmentSlots: { weapon: undefined, armor: { id: 'armor', name: '甲', tier: 1, type: 'Equipment', attributes: { defense: 10 } }, treasures: [] } });
    const result = DamagePipeline.calculate(attacker, defender, makeSkill(), false);
    expect(result.finalDamage).toBe(5);
  });

  it('伤害不低于 0', () => {
    const attacker = makeChar({ equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] } });
    const defender = makeChar({ attributes: { physique: 100, comprehension: 10, perception: 10, agility: 10, luck: 5 } });
    expect(DamagePipeline.calculate(attacker, defender, makeSkill(), false).finalDamage).toBe(0);
  });

  it('反噬效果被正确传递', () => {
    const skill = makeSkill({ backfire: { type: 'SelfDamage', intensity: 15 } });
    const result = DamagePipeline.calculate(makeChar(), makeChar(), skill, false);
    expect(result.appliedBackfire).toBeDefined();
    expect(result.appliedBackfire!.type).toBe('SelfDamage');
  });
});
