// ============================================================
// Phase 0.5 P6 测试：战斗 AI 效用评分与数值接入
//
// 验证：
// - AI 根据候选行为效用评分决策（非固定优先级）
// - DerivedStats（attack/defense/speed）影响 AI 评估
// - NPC 场景投影使用 DerivedStats
// ============================================================

import { describe, it, expect } from 'vitest';
import { scoreAction, type ActionCandidate } from '../battle/utility-ai.js';
import { computeDerivedStats } from '../character/derived-stats.js';
import { expandForScene } from '../world/scene-projection.js';
import type { NpcRecord, Character, RealmFullPath } from '@taosim/contracts';

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_BATTLE_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 25, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1, birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

// ============================================================
// 效用评分
// ============================================================
describe('P6 效用评分', () => {
  it('scoreAction 对攻击行为给出正分数', () => {
    const candidate: ActionCandidate = {
      action: { type: 'basicAttack', targetId: 'enemy_1' },
      estimatedDamage: 30,
      estimatedRisk: 10,
      utility: 0, // 待计算
    };

    const scored = scoreAction(candidate, { hpPercent: 1.0, enemyHpPercent: 0.5 });
    expect(scored.utility).toBeGreaterThan(0);
  });

  it('高伤害行为得分高于低伤害行为', () => {
    const lowDmg: ActionCandidate = {
      action: { type: 'basicAttack', targetId: 'e1' },
      estimatedDamage: 10,
      estimatedRisk: 5,
      utility: 0,
    };
    const highDmg: ActionCandidate = {
      action: { type: 'basicAttack', targetId: 'e1' },
      estimatedDamage: 50,
      estimatedRisk: 5,
      utility: 0,
    };

    const lowScored = scoreAction(lowDmg, { hpPercent: 1.0, enemyHpPercent: 0.5 });
    const highScored = scoreAction(highDmg, { hpPercent: 1.0, enemyHpPercent: 0.5 });
    expect(highScored.utility).toBeGreaterThan(lowScored.utility);
  });

  it('HP 低时逃跑得分上升', () => {
    const fleeAction: ActionCandidate = {
      action: { type: 'flee' },
      estimatedDamage: 0,
      estimatedRisk: 0,
      utility: 0,
    };

    const fullHpScore = scoreAction(fleeAction, { hpPercent: 1.0, enemyHpPercent: 1.0 });
    const lowHpScore = scoreAction(fleeAction, { hpPercent: 0.15, enemyHpPercent: 1.0 });
    expect(lowHpScore.utility).toBeGreaterThan(fullHpScore.utility);
  });
});

// ============================================================
// NPC 场景投影使用 DerivedStats
// ============================================================
describe('P6 NPC 场景投影使用 DerivedStats', () => {
  it('expandForScene 产出的角色 HP/灵力来自 computeDerivedStats', () => {
    const npc = makeNpc({
      realm: 'QiRefinement_3',
      attributes: { physique: 20, comprehension: 15, perception: 10, agility: 10, luck: 10, charm: 10 },
    });

    const expected = computeDerivedStats({
      realm: 'QiRefinement_3' as RealmFullPath,
      attributes: npc.attributes,
      spiritRoot: npc.spiritRoot,
      age: npc.lifespan.age,
      maxLifespan: npc.lifespan.maxLifespan,
    });

    const scene = expandForScene(npc, { sceneType: 'battle', currentTime: { year: 1, month: 1 } });

    expect(scene.maxHp).toBe(expected.maxHp);
    expect(scene.spiritEnergy.max).toBe(expected.maxSpiritEnergy);
  });

  it('凡人 NPC 投影后有 5 HP 和 0 灵力', () => {
    const npc = makeNpc({
      realm: 'Mortal',
      attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    });

    const scene = expandForScene(npc, { sceneType: 'battle', currentTime: { year: 1, month: 1 } });
    expect(scene.maxHp).toBe(5);
    // 凡人灵力为 0
    expect(scene.spiritEnergy.max).toBe(0);
  });
});
