import { describe, it, expect } from 'vitest';
import { resolveBattleOutcome } from '../combat/battle-resolver.js';
import type { Character } from '@taosim/contracts';

function makePlayer(hp: number = 100): Character {
  return {
    id: 'PLAYER', name: '测试者', gender: 'Male', realm: 'QiRefinement_3', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 200 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    hp, maxHp: 100, ap: 3, canFly: false,
    spiritStones: 500,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    factionId: undefined, factionRank: undefined,
    unlockedRecipes: ['RECIPE_QI_PILL'],
  } as Character;
}

function makeNpc(hp: number = 80): Character {
  return {
    id: 'NPC_TEST', name: '测试对手', gender: 'Female', realm: 'QiRefinement_5', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 300 },
    lifespan: { age: 25, maxLifespan: 100 },
    spiritEnergy: { current: 80, max: 80 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 8, comprehension: 8, perception: 8, agility: 8, luck: 5, charm: 5 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    hp, maxHp: 80, ap: 3, canFly: false,
    spiritStones: 100,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    unlockedRecipes: [],
  } as Character;
}

describe('resolveBattleOutcome', () => {
  it('玩家胜利时返回 victory', () => {
    const player = makePlayer(50);
    const npc = makeNpc(0); // NPC HP 为 0
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.victory).toBe(true);
  });

  it('玩家失败时返回 defeat', () => {
    const player = makePlayer(0); // 玩家 HP 为 0
    const npc = makeNpc(30);
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.victory).toBe(false);
  });

  it('切磋胜利获得经验', () => {
    const player = makePlayer(50);
    const npc = makeNpc(0);
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.expGained).toBeGreaterThan(0);
  });

  it('切磋胜利增加好感度', () => {
    const player = makePlayer(50);
    const npc = makeNpc(0);
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.favorabilityChange).toBeGreaterThan(0);
  });

  it('切磋失败好感度变化较小', () => {
    const player = makePlayer(0);
    const npc = makeNpc(30);
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.favorabilityChange).toBeLessThanOrEqual(1);
  });

  it('遭遇战胜利获得灵石掉落', () => {
    const player = makePlayer(50);
    const npc = makeNpc(0);
    const result = resolveBattleOutcome(player, [npc], 'encounter');
    expect(result.spiritStonesGained).toBeGreaterThan(0);
  });

  it('遭遇战失败不获得奖励', () => {
    const player = makePlayer(0);
    const npc = makeNpc(30);
    const result = resolveBattleOutcome(player, [npc], 'encounter');
    expect(result.expGained).toBe(0);
    expect(result.spiritStonesGained).toBe(0);
  });

  it('玩家死亡时标记 shouldGameOver', () => {
    const player = makePlayer(0);
    const npc = makeNpc(30);
    const result = resolveBattleOutcome(player, [npc], 'encounter');
    expect(result.shouldGameOver).toBe(true);
  });

  it('玩家存活时不标记 shouldGameOver', () => {
    const player = makePlayer(1);
    const npc = makeNpc(0);
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.shouldGameOver).toBe(false);
  });

  it('切磋模式死亡不触发 GameOver（切点到为止）', () => {
    const player = makePlayer(0);
    const npc = makeNpc(30);
    const result = resolveBattleOutcome(player, [npc], 'duel');
    expect(result.shouldGameOver).toBe(false);
    expect(result.playerHpAfter).toBeGreaterThan(0);
  });
});

describe('resolveBattleOutcome 多参战者聚合', () => {
  it('encounter 胜利按所有敌人聚合经验与灵石', () => {
    const player = makePlayer(100);
    const e1 = makeNpc(0);
    const e2 = makeNpc(0);
    const result = resolveBattleOutcome(player, [e1, e2], 'encounter');
    expect(result.victory).toBe(true);
    // 精确断言：两个敌人 maxExp=300、spiritStones=100，若实现退化为"只结算第一个"将失败
    expect(result.expGained).toBe(Math.round(600 * 0.3));
    expect(result.spiritStonesGained).toBe(Math.round(200 * 0.5));
  });

  it('任一敌人存活时不判胜利', () => {
    const player = makePlayer(100);
    const e1 = makeNpc(0);
    const e2 = makeNpc(50);
    const result = resolveBattleOutcome(player, [e1, e2], 'encounter');
    expect(result.victory).toBe(false);
  });
});
