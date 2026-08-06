import { describe, it, expect } from 'vitest';
import { BattleAI } from '../battle/battle-ai.js';
import type { Character } from '@taosim/contracts';

/** 用与 damage-calculator.test.ts 相同的真实 Character 构造方式 */
function makeChar(id: string, hp: number): Character {
  return {
    id,
    name: id,
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
    hp,
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
  };
}

describe('BattleAI', () => {
  // 简化引擎桩：仅暴露 getState().characters 供 AI 查询血量
  const stubEngine = (chars: Record<string, Character>) =>
    ({ getState: () => ({ characters: chars }) }) as any;

  it('无技能时普攻血量最低的存活目标', () => {
    const npc = makeChar('n', 100);
    const targets = { a: makeChar('a', 80), b: makeChar('b', 30) };
    const decision = BattleAI.decide(npc, ['a', 'b'], stubEngine(targets));
    expect(decision.type).toBe('basicAttack');
    expect((decision as any).targetId).toBe('b');
  });

  it('没有任何存活目标时选择防御（永不软锁）', () => {
    const npc = makeChar('n', 100);
    const decision = BattleAI.decide(npc, [], stubEngine({}));
    expect(decision.type).toBe('guard');
  });

  it('有冷却/灵力不足的技能时回退普攻', () => {
    const npc = makeChar('n', 100);
    npc.skills = [
      {
        id: 's1',
        name: 'fire',
        quality: 'Huang',
        type: 'Active',
        primitives: [],
        cost: { ap: 1, spiritEnergy: 999 },
        cooldownTurns: 1,
      },
    ];
    const decision = BattleAI.decide(npc, ['a'], stubEngine({ a: makeChar('a', 80) }));
    expect(decision.type).toBe('basicAttack');
  });
});
