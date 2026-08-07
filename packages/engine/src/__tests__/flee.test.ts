import { describe, it, expect } from 'vitest';
import { attemptFlee, type FleeAttemptInput, type FleeResult } from '../battle/flee.js';

function makeInput(overrides: Partial<FleeAttemptInput> = {}): FleeAttemptInput {
  return {
    playerRealm: 'Foundation_1',
    enemyRealm: 'Foundation_1',
    playerAgility: 10,
    enemyAgility: 10,
    enemyPersonalityId: undefined,
    battleType: 'duel',
    distanceToEdge: 0,
    rng: () => 0.5,
    ...overrides,
  };
}

/** 构造 rng 序列：先追击意愿（<P 则追），再两个 d20 */
function rngSeq(...vals: number[]): () => number {
  const q = [...vals];
  return () => (q.length > 0 ? q.shift()! : 0.5);
}

describe('attemptFlee 碾压', () => {
  it('敌方高 3 大境界（大修对凡人）必被抓住，不掷骰', () => {
    for (const r of [0.01, 0.5, 0.99]) {
      const input = makeInput({
        playerRealm: 'QiRefinement_1',
        enemyRealm: 'SoulFormation_1', // tier 5 - 1 = 4 >= 3
        rng: () => r,
      });
      expect(attemptFlee(input)).toBe('caught');
    }
  });
});

describe('attemptFlee 追击意愿', () => {
  it('敌方放弃追击时直接 success', () => {
    // 同阶 duel 中性：P = 0.5 - 0.2 = 0.3；rng 0.99 >= 0.3 → 不追
    const input = makeInput({ rng: () => 0.99 });
    expect(attemptFlee(input)).toBe('success');
  });

  it('追击概率 clamp 到上限 0.95：高追击+encounter+境界差 2 → P 归 0.95，rng 0.99 不追', () => {
    const input = makeInput({
      playerRealm: 'Foundation_1',
      enemyRealm: 'NascentSoul_1', // tier 4 - 2 = 2
      enemyPersonalityId: 'PERSONALITY_HOT_BLOODED',
      battleType: 'encounter',
      rng: () => 0.99, // >= 0.95 → 不追
    });
    expect(attemptFlee(input)).toBe('success');
  });

  it('追击概率 clamp 到下限 0.05：低追击+duel+逆向境界差 4 → P 归 0.05，rng 0.01 仍会追', () => {
    const input = makeInput({
      playerRealm: 'SoulFormation_1', // tier 5
      enemyRealm: 'QiRefinement_1',   // tier 1 → realmDiff = -4
      enemyPersonalityId: 'PERSONALITY_GENTLE',
      battleType: 'duel',
      rng: rngSeq(0.01, 0.05, 0.99), // 0.01 < 0.05 → 追；玩家 d20 低、敌方 d20 高 → 至少 hit
    });
    const result = attemptFlee(input);
    expect(['hit', 'caught']).toContain(result);
  });

  it('逆向境界差（玩家高境界）敌方检定被扣减，容易逃脱', () => {
    const input = makeInput({
      playerRealm: 'GoldenCore_1',    // tier 3
      enemyRealm: 'QiRefinement_1',   // tier 1 → realmDiff = -2
      rng: rngSeq(0.01, 0.99, 0.01),  // 追；玩家 d20 20 vs 敌方 d20 1，enemyRoll 再 -4
    });
    expect(attemptFlee(input)).toBe('success');
  });
});

describe('attemptFlee 对抗检定分档（同阶 duel 中性，P=0.3，用 rng 0.01 触发追击）', () => {
  // d20 = 1 + floor(rng * 20)；双方 agility 10 → 各 +1；distance 0
  it('diff >= 1 → success', () => {
    // 玩家 d20 20(+1)=21，敌方 d20 1(+1)=2 → diff 19
    expect(attemptFlee(makeInput({ rng: rngSeq(0.01, 0.99, 0.01) }))).toBe('success');
  });
  it('diff == 0 → escape-hit（防守方优先）', () => {
    // 双方 d20 11(+1)=12 → diff 0
    expect(attemptFlee(makeInput({ rng: rngSeq(0.01, 0.5, 0.5) }))).toBe('escape-hit');
  });
  it('diff -4..-1 → hit（没逃掉挨打）', () => {
    // 玩家 d20 2(+1)=3，敌方 d20 6(+1)=7 → diff -4
    expect(attemptFlee(makeInput({ rng: rngSeq(0.01, 0.05, 0.25) }))).toBe('hit');
  });
  it('diff <= -5 → caught（被抓住）', () => {
    // 玩家 d20 2(+1)=3，敌方 d20 7(+1)=8 → diff -5
    expect(attemptFlee(makeInput({ rng: rngSeq(0.01, 0.05, 0.3) }))).toBe('caught');
  });
});

describe('attemptFlee 距离修正', () => {
  it('距离越远越难逃：同 rng 序列下 distance 0 成功、distance 25 失败', () => {
    const base = {
      playerRealm: 'Foundation_1',
      enemyRealm: 'Foundation_1',
      playerAgility: 10,
      enemyAgility: 10,
      battleType: 'encounter', // P = 0.7，rng 0.01 → 追
    } as const;
    const near = attemptFlee(makeInput({ ...base, distanceToEdge: 0, rng: rngSeq(0.01, 0.99, 0.01) }));
    const far = attemptFlee(makeInput({ ...base, distanceToEdge: 25, rng: rngSeq(0.01, 0.99, 0.01) }));
    expect(near).toBe('success');
    expect(far).not.toBe('success');
  });
});
