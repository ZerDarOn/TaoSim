import { describe, it, expect } from 'vitest';
import { WorldEngine } from '../world/world-engine.js';
import type { NpcRecord, WorldState } from '@taosim/contracts';

const baseState: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
};

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_TEST_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

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
    const events: import('@taosim/contracts').BigEventLog[] = [];
    for (let i = 0; i < 80; i++) {
      const result = engine.step();
      events.push(...result.events);
    }
    const spawnEvents = events.filter(e => e.title.includes('散修'));
    expect(spawnEvents.length).toBeGreaterThan(0);
  });

  it('NPC 跨推进持久：重建引擎后 NPC 仍在（持久化语义）', () => {
    const npc = makeNpc();
    const engine = new WorldEngine({ ...baseState, npcs: { [npc.id]: npc } });
    engine.fastForward(12);

    const state = engine.getState();
    expect(state.npcs[npc.id]).toBeDefined();

    // 用状态重建引擎（模拟 存档→读档 → 下一次推进）
    const engine2 = new WorldEngine(state);
    expect(engine2.getState().npcs[npc.id]).toBeDefined();
    engine2.step();
    expect(engine2.getState().npcs[npc.id]).toBeDefined();
    expect(engine2.getState().npcs[npc.id]!.soulState).toBe('Active');
  });

  it('寿元耗尽：NPC 坐化并记录死亡信息', () => {
    const npc = makeNpc({ lifespan: { age: 99.9, maxLifespan: 100 } });
    const engine = new WorldEngine({ ...baseState, npcs: { [npc.id]: npc } });

    // 第一月：99.95 + 1/12 < 100，仍活着
    engine.step();
    expect(engine.getState().npcs[npc.id]!.soulState).toBe('Active');

    // 第二月：超过寿元 → 坐化
    const result = engine.step();
    const deadNpc = engine.getState().npcs[npc.id]!;
    expect(deadNpc.soulState).toBe('PrimordialSoul');
    expect(deadNpc.causeOfDeath).toBe('寿元耗尽');
    expect(deadNpc.deathYear).toBeDefined();
    expect(result.events.some(e => e.title.includes('坐化'))).toBe(true);
  });

  it('人口补充生成含天骄/英才命格的 NPC', () => {
    const engine = new WorldEngine(baseState);
    engine.fastForward(80);
    const npcs = Object.values(engine.getState().npcs);
    expect(npcs.length).toBeGreaterThan(500);
    const special = npcs.filter(n => n.destiny.tier === 'prodigy' || n.destiny.tier === 'talented');
    expect(special.length).toBeGreaterThan(0);
  });

  it('社交/寻仇：同地点 NPC 关系沉淀并产生 social/combat 事件', () => {
    const strong = makeNpc({ id: 'NPC_S1', realm: 'GoldenCore_1', locationId: 'LOC_A', skillIds: ['SKILL_X'] });
    const weak = makeNpc({ id: 'NPC_S2', locationId: 'LOC_A' });
    const enemyEntry = { type: 'enemy' as const, bond: -40, trust: 5, events: ['结仇'], changedAt: { year: 1, month: 1 } };
    weak.relations[strong.id] = enemyEntry;
    strong.relations[weak.id] = enemyEntry;
    const engine = new WorldEngine({ ...baseState, npcs: { [strong.id]: strong, [weak.id]: weak } });

    const events: import('@taosim/contracts').BigEventLog[] = [];
    for (let i = 0; i < 240; i++) {
      const result = engine.step();
      events.push(...result.events);
    }

    const social = events.filter(e => e.category === 'social');
    const combat = events.filter(e => e.category === 'combat');
    expect(social.length + combat.length).toBeGreaterThan(0);

    const state = engine.getState();
    const s1 = state.npcs['NPC_S1']!;
    const s2 = state.npcs['NPC_S2']!;
    expect(s1.relations['NPC_S2'] || s2.relations['NPC_S1']).toBeDefined();
  });
});
