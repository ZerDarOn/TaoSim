import { describe, it, expect } from 'vitest';
import { PlayerLifecycleService } from '../lifecycle/player-lifecycle.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 18, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 5, agility: 5, luck: 5, charm: 5 },
    hp: 100, maxHp: 100, ap: 3, canFly: false, spiritStones: 0,
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    inventory: [], equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('PlayerLifecycleService', () => {
  it('advanceTime 推进 12 个月角色 age 增长 1 岁', () => {
    const player = makePlayer();
    const result = PlayerLifecycleService.advanceTime(player, 12);
    expect(result.updatedPlayer.lifespan.age).toBeCloseTo(19, 1);
  });

  it('advanceTime 修为按悟性增长', () => {
    const player = makePlayer({ attributes: { physique: 10, comprehension: 20, perception: 5, agility: 5, luck: 5, charm: 5 } });
    const result = PlayerLifecycleService.advanceTime(player, 12);
    // comprehension=20, 12 个月: 20 * 12 * 0.5 = 120
    expect(result.updatedPlayer.cultivation.currentExp).toBeGreaterThanOrEqual(100);
  });

  it('advanceTime 恢复灵力至满', () => {
    const player = makePlayer({ spiritEnergy: { current: 10, max: 100 } });
    const result = PlayerLifecycleService.advanceTime(player, 1);
    expect(result.updatedPlayer.spiritEnergy.current).toBe(100);
  });

  it('advanceTime 寿命未耗尽返回存活', () => {
    const player = makePlayer({ lifespan: { age: 50, maxLifespan: 100 } });
    const result = PlayerLifecycleService.advanceTime(player, 12);
    expect(result.died).toBe(false);
  });

  it('advanceTime 寿命耗尽标记死亡', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 } });
    const result = PlayerLifecycleService.advanceTime(player, 24); // +2 岁 → 101 > 100
    expect(result.died).toBe(true);
    expect(result.causeOfDeath).toContain('寿元');
  });

  it('advanceTime 死亡时更新 soulState', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 }, realm: 'QiRefinement_9' });
    const result = PlayerLifecycleService.advanceTime(player, 24);
    expect(result.updatedPlayer.soulState).not.toBe('Active');
  });

  it('advanceTime 金丹以上死亡为元神出窍', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 }, realm: 'GoldenCore_1' });
    const result = PlayerLifecycleService.advanceTime(player, 24);
    expect(result.updatedPlayer.soulState).toBe('PrimordialSoul');
  });

  it('advanceTime 金丹以下死亡为残魂', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 }, realm: 'Foundation_1' });
    const result = PlayerLifecycleService.advanceTime(player, 24);
    expect(result.updatedPlayer.soulState).toBe('RemnantSoul');
  });

  it('advanceTime 月度行动点恢复', () => {
    const player = makePlayer({ monthlyActionPoints: { current: 3, max: 10 } });
    const result = PlayerLifecycleService.advanceTime(player, 1);
    expect(result.updatedPlayer.monthlyActionPoints.current).toBe(10);
  });

  it('advanceTime 不修改原对象（不可变）', () => {
    const player = makePlayer();
    const originalAge = player.lifespan.age;
    PlayerLifecycleService.advanceTime(player, 12);
    expect(player.lifespan.age).toBe(originalAge);
  });
});
