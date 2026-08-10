// ============================================================
// Phase 0.5 P1 测试：权威世界时钟与可中断快进
//
// 验证：
// - elapsedMinutes 作为权威时间
// - 年月日由绝对时间投影
// - advanceWorldTime 统一入口
// - 快进可取消、可中断
// - 同种子等价性
// ============================================================

import { describe, it, expect } from 'vitest';
import { WorldEngine } from '../world/world-engine.js';
import { WorldClockService, projectTime, MINUTES_PER_MONTH, MINUTES_PER_DAY } from '../time/world-clock.js';
import { TimeAdvanceService } from '../time/time-advance-service.js';
import { createSeededRng } from '../battle/seeded-rng.js';
import type { WorldState, NpcRecord, Character } from '@taosim/contracts';

// —— 测试夹具 ——

function makeBaseWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    currentYear: 1,
    currentMonth: 1,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
    ...overrides,
  };
}

function makePlayer(): Character {
  return {
    id: 'PLAYER_P1',
    name: '测试修士',
    gender: 'Male',
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {},
    spiritStones: 100, wantedLevels: {}, unlockedRecipes: [],
  };
}

// ============================================================
// 时间投影测试
// ============================================================
describe('P1 时间投影：projectTime', () => {
  it('elapsedMinutes=0 → 1年1月1日', () => {
    const t = projectTime(0);
    expect(t.year).toBe(1);
    expect(t.month).toBe(1);
    expect(t.day).toBe(1);
  });

  it('推进 1 个月后 elapsedMinutes 正确', () => {
    const t = projectTime(MINUTES_PER_MONTH);
    expect(t.month).toBe(2);
    expect(t.year).toBe(1);
  });

  it('推进 12 个月后跨年', () => {
    const t = projectTime(MINUTES_PER_MONTH * 12);
    expect(t.year).toBe(2);
    expect(t.month).toBe(1);
  });

  it('推进 30 天 = 1 个月', () => {
    const t = projectTime(MINUTES_PER_DAY * 30);
    expect(t.month).toBe(2);
  });
});

// ============================================================
// WorldClockService：唯一时间推进入口
// ============================================================
describe('P1 WorldClockService', () => {
  it('advanceMonths 推进 elapsedMinutes 和世界', () => {
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(42) });
    const clock = new WorldClockService(engine);

    clock.advanceMonths(3);

    const state = engine.getState();
    // elapsedMinutes 应该被设置（3个月 = 3 * MINUTES_PER_MONTH）
    expect(state.elapsedMinutes).toBeDefined();
    expect(state.elapsedMinutes).toBe(3 * MINUTES_PER_MONTH);
    // 旧字段作为投影仍同步
    expect(state.currentMonth).toBe(4); // 1月 → 4月
  });

  it('advanceDays 推进世界（移动/旅行使用）', () => {
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(42) });
    const clock = new WorldClockService(engine);

    // 旅行 60 天 = 2 个月
    clock.advanceDays(60);

    const state = engine.getState();
    expect(state.elapsedMinutes).toBe(60 * MINUTES_PER_DAY);
    // 世界应该也推进了（NPC 生成等）
    expect(Object.keys(state.npcs).length).toBeGreaterThan(0);
  });

  it('advanceDays 不足一月时累积，跨月时触发世界推进', () => {
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(42) });
    const clock = new WorldClockService(engine);

    // 先走 15 天（不足一月）
    clock.advanceDays(15);
    let state = engine.getState();
    expect(state.elapsedMinutes).toBe(15 * MINUTES_PER_DAY);
    // 月还没变
    expect(state.currentMonth).toBe(1);

    // 再走 20 天（总计 35 天 = 1 月 + 5 天）
    clock.advanceDays(20);
    state = engine.getState();
    expect(state.elapsedMinutes).toBe(35 * MINUTES_PER_DAY);
    // 跨月了
    expect(state.currentMonth).toBe(2);
  });
});

// ============================================================
// 可中断快进
// ============================================================
describe('P1 可中断快进', () => {
  it('fastForward 支持 shouldContinue 回调中断', () => {
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(42) });

    let stepCount = 0;
    // 在第 3 步后中断
    const result = engine.fastForward(12, {
      shouldContinue: () => {
        stepCount++;
        return stepCount < 3;
      },
    });

    // 只推进了约 2-3 个月（而非 12 个月）
    const state = engine.getState();
    expect(state.elapsedMinutes).toBeLessThan(12 * MINUTES_PER_MONTH);
    expect(state.elapsedMinutes).toBeGreaterThan(0);
    expect(result.interrupted).toBe(true);
  });

  it('fastForward 无中断时正常完成', () => {
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(42) });

    const result = engine.fastForward(6);

    expect(result.interrupted).toBeFalsy();
    const state = engine.getState();
    expect(state.elapsedMinutes).toBe(6 * MINUTES_PER_MONTH);
  });
});

// ============================================================
// 等价性：一次快进12月 vs 逐月推进12次
// ============================================================
describe('P1 等价性：一次快进 vs 逐月推进', () => {
  it('同种子下，一次快进12月和逐月12次得到相同年月和 elapsedMinutes', () => {
    // 一次性快进
    const ws1 = makeBaseWorldState();
    const engine1 = new WorldEngine(ws1, { rng: createSeededRng(777) });
    engine1.fastForward(12);
    const state1 = engine1.getState();

    // 逐月推进
    const ws2 = makeBaseWorldState();
    const engine2 = new WorldEngine(ws2, { rng: createSeededRng(777) });
    for (let i = 0; i < 12; i++) {
      engine2.step();
    }
    const state2 = engine2.getState();

    // 年月和 elapsedMinutes 应完全一致
    expect(state1.currentYear).toBe(state2.currentYear);
    expect(state1.currentMonth).toBe(state2.currentMonth);
    expect(state1.elapsedMinutes).toBe(state2.elapsedMinutes);
  });

  it('同种子下，NPC 档案数量一致', () => {
    const ws1 = makeBaseWorldState();
    const engine1 = new WorldEngine(ws1, { rng: createSeededRng(999) });
    engine1.fastForward(6);
    const npcCount1 = Object.keys(engine1.getState().npcs).length;

    const ws2 = makeBaseWorldState();
    const engine2 = new WorldEngine(ws2, { rng: createSeededRng(999) });
    for (let i = 0; i < 6; i++) engine2.step();
    const npcCount2 = Object.keys(engine2.getState().npcs).length;

    expect(npcCount1).toBe(npcCount2);
  });
});
