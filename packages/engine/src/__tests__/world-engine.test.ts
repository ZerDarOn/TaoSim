import { describe, it, expect } from 'vitest';
import { WorldEngine } from '../world/world-engine.js';
import type { WorldState } from '@taosim/contracts';

const baseState: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
};

describe('WorldEngine', () => {
  it('月度推进更新日历', () => {
    const engine = new WorldEngine({ ...baseState, currentMonth: 12 });
    engine.step();
    expect(engine.getState().currentYear).toBe(2);
    expect(engine.getState().currentMonth).toBe(1);
  });

  it('量劫倒计时递减', () => {
    const engine = new WorldEngine({ ...baseState, catastropheCountdownMonths: 10 });
    engine.step();
    expect(engine.getState().catastropheCountdownMonths).toBe(9);
  });

  it('fastForward 正确推进 N 个月', () => {
    const engine = new WorldEngine(baseState);
    engine.fastForward(24);
    expect(engine.getState().currentYear).toBe(3);
    expect(engine.getState().currentMonth).toBe(1);
  });

  it('step() 返回 MonthlyTickResult 含 events', () => {
    const engine = new WorldEngine(baseState);
    const result = engine.step();
    expect(result.updatedState).toBeDefined();
    expect(result.events).toBeDefined();
    expect(Array.isArray(result.events)).toBe(true);
  });

  it('NPC 人口补充：初始为空逐步生成散修', () => {
    const engine = new WorldEngine(baseState);
    // 连续推进 80 个月（约 6.7 年），应产生 NPC 生成事件
    const events = [];
    for (let i = 0; i < 80; i++) {
      const result = engine.step();
      events.push(...result.events);
    }
    // 应该有一些 NPC 生成事件（标题含"散修"或其他）
    const spawnEvents = events.filter(e => e.title.includes('散修'));
    expect(spawnEvents.length).toBeGreaterThan(0);
  });
});
