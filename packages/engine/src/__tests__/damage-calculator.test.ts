import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../battle/seeded-rng.js';
import { calculateDamage } from '../battle/damage-calculator.js';
import type { Character } from '@taosim/contracts';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c1',
    name: 't',
    gender: 'Male',
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 100,
    maxHp: 100,
    ap: 3,
    canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [],
    skillCooldowns: {},
    traits: [],
    relations: {},
    spiritStones: 0,
    wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  } as Character;
}

describe('calculateDamage', () => {
  const attacker = makeChar();

  it('基础伤害 = 攻击 - 防御，最低 1', () => {
    const defender = makeChar();
    const result = calculateDamage(
      attacker,
      defender,
      { multiplier: 1, element: 'Physical', tier: 1 },
      createSeededRng(1),
    );
    expect(result.finalDamage).toBeGreaterThanOrEqual(1);
    expect(result.finalDamage).toBeLessThanOrEqual(30);
  });

  it('境界壁垒：高境界防守者免伤（无破罡）', () => {
    const defender = makeChar({ realm: 'GoldenCore_1' });
    const result = calculateDamage(
      attacker,
      defender,
      { multiplier: 1, element: 'Physical', tier: 1 },
      createSeededRng(1),
    );
    expect(result.blockedByBarrier).toBe(true);
    expect(result.finalDamage).toBe(0);
  });

  it('闪避判定：agility 悬殊时可闪避', () => {
    const evasive = makeChar({
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 50, luck: 5, charm: 5 },
    });
    let hits = 0;
    for (let i = 0; i < 100; i++) {
      const result = calculateDamage(
        attacker,
        evasive,
        { multiplier: 1, element: 'Physical', tier: 1 },
        createSeededRng(10 + i),
      );
      if (!result.missed) hits++;
    }
    expect(hits).toBeLessThan(100);
  });

  it('暴击按 critRate 生效', () => {
    const defender = makeChar();
    const result = calculateDamage(
      attacker,
      defender,
      { multiplier: 1, element: 'Physical', tier: 1 },
      createSeededRng(1),
      1.0,
    );
    expect(result.crit).toBe(true);
    expect(result.finalDamage).toBeGreaterThan(1);
  });
});
