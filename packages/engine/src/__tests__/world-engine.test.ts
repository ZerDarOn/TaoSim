import { describe, it, expect } from 'vitest';
import { WorldEngine, trimEventLog, EVENT_LOG_MAX } from '../world/world-engine.js';
import type { NpcRecord, WorldState, BigEventLog } from '@taosim/contracts';

const baseState: WorldState = {
  currentYear: 1,
  currentMonth: 1,
  catastropheCountdownMonths: 600,
  activeContinentIds: ['CONTINENT_CANGZHOU'],
  globalFlags: {},
  npcs: {},
  eventLog: [],
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

/** 构造一条旧 major 事件（用于预置 eventLog，验证因果链/成名恢复） */
function makeMajorEvent(id: string, n: number): BigEventLog {
  return {
    id: `EVT_prior_${n}`,
    year: 1,
    month: 1,
    isMajorEvent: true,
    category: 'world',
    severity: 'major',
    visibility: 'regional',
    source: 'engine',
    title: `旧事${n}`,
    description: `旧事${n}`,
    involvedCharacterIds: [id],
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

  it('寿元耗尽：NPC 坐化并按境界分流（低阶残魂 / 高阶一念）', () => {
    const lowNpc = makeNpc({ id: 'NPC_LOW_1', realm: 'QiRefinement_1', lifespan: { age: 99.9, maxLifespan: 100 } });
    const highNpc = makeNpc({ id: 'NPC_HIGH_1', realm: 'GoldenCore_1', lifespan: { age: 99.9, maxLifespan: 100 } });
    const engine = new WorldEngine({ ...baseState, npcs: { [lowNpc.id]: lowNpc, [highNpc.id]: highNpc } });

    // 第一月：99.95 + 1/12 < 100，仍活着
    engine.step();
    expect(engine.getState().npcs[lowNpc.id]!.soulState).toBe('Active');
    expect(engine.getState().npcs[highNpc.id]!.soulState).toBe('Active');

    // 第二月：超过寿元 → 坐化（炼气残魂、金丹留一念）
    const result = engine.step();
    expect(engine.getState().npcs[lowNpc.id]!.soulState).toBe('RemnantSoul');
    const deadHigh = engine.getState().npcs[highNpc.id]!;
    expect(deadHigh.soulState).toBe('PrimordialSoul');
    expect(deadHigh.causeOfDeath).toBe('寿元耗尽');
    expect(deadHigh.deathYear).toBeDefined();
    expect(result.events.some(e => e.title.includes('坐化'))).toBe(true);
  });

  it('死亡超过宽限期的 NPC 从档案除名（Oblivion 清理激活）', () => {
    // 宽限期内：刚坐化（RemnantSoul）应保留
    const recent = makeNpc({
      id: 'NPC_RECENT_1',
      soulState: 'RemnantSoul',
      causeOfDeath: '寿元耗尽',
      deathYear: 12,
      deathMonth: 1,
    });
    // 超宽限期：11 年前陨落（> OBLIVION_GRACE_YEARS=10）应除名
    const ancient = makeNpc({
      id: 'NPC_ANCIENT_1',
      soulState: 'PrimordialSoul',
      causeOfDeath: '仇杀陨落',
      deathYear: 1,
      deathMonth: 1,
    });
    const engine = new WorldEngine({
      ...baseState,
      currentYear: 12,
      currentMonth: 1,
      npcs: { [recent.id]: recent, [ancient.id]: ancient },
    });
    engine.step();
    expect(engine.getState().npcs[recent.id]).toBeDefined();
    expect(engine.getState().npcs[ancient.id]).toBeUndefined();
  });

  it('人口补充生成含天骄/英才命格的 NPC', () => {
    const engine = new WorldEngine(baseState);
    engine.fastForward(80);
    const npcs = Object.values(engine.getState().npcs);
    expect(npcs.length).toBeGreaterThan(500);
    const special = npcs.filter(n => n.destiny.tier === 'prodigy' || n.destiny.tier === 'talented');
    expect(special.length).toBeGreaterThan(0);
  });

  it('因果链：事件 relatedTo 串联同一 NPC 的连续经历', () => {
    const npc = makeNpc({
      id: 'NPC_CHAIN_1',
      realm: 'QiRefinement_9',
      cultivation: { currentExp: 720, maxExp: 720 },
      destiny: { tier: 'common', luck: 90, hidden: false },
    });
    const prior = makeMajorEvent(npc.id, 1);
    const engine = new WorldEngine(
      { ...baseState, npcs: { [npc.id]: npc }, eventLog: [prior] },
      { rng: () => 0.01 },
    );

    const result = engine.step();
    const breakthrough = result.events.find(e => e.title.includes('突破'));
    expect(breakthrough).toBeDefined();
    expect(breakthrough!.relatedEventIds).toContain(prior.id);
    // 同月后续事件（云游）继续串联上一条
    const wander = result.events.find(e => e.title.includes('云游'));
    expect(wander?.relatedEventIds).toContain(breakthrough!.id);
  });

  it('量劫倒计时归零：触发世界级事件并开启新纪元', () => {
    const engine = new WorldEngine({ ...baseState, catastropheCountdownMonths: 1 });
    const result = engine.step();
    const tribulation = result.events.find(e => e.title.includes('天道量劫'));
    expect(tribulation).toBeDefined();
    expect(tribulation!.severity).toBe('epoch');
    expect(engine.getState().catastropheCountdownMonths).toBe(600);
  });

  it('成名正反馈：major 事件达到阈值授予江湖绰号', () => {
    const npc = makeNpc({
      id: 'NPC_FAME_1',
      realm: 'QiRefinement_9',
      cultivation: { currentExp: 720, maxExp: 720 },
      destiny: { tier: 'common', luck: 90, hidden: false },
    });
    // 预置 2 条 major 事件（恢复计数=2）→ 本次跨大境界突破 major = 3 → 授予
    const engine = new WorldEngine(
      {
        ...baseState,
        npcs: { [npc.id]: npc },
        eventLog: [makeMajorEvent(npc.id, 1), makeMajorEvent(npc.id, 2)],
      },
      { rng: () => 0.01 },
    );

    const result = engine.step();
    const npcAfter = engine.getState().npcs[npc.id]!;
    expect(npcAfter.destiny.epithet).toBeDefined();
    expect(result.events.some(e => e.title.includes('名动江湖'))).toBe(true);
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

  it('所有事件结构化：severity/visibility/source 且 isMajorEvent 与 severity 一致', () => {
    const engine = new WorldEngine(baseState);
    const events = engine.fastForward(24).events;
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) {
      expect(['minor', 'normal', 'major', 'epoch']).toContain(e.severity);
      expect(['local', 'regional', 'world']).toContain(e.visibility);
      expect(e.source).toBe('engine');
      expect(e.isMajorEvent).toBe(e.severity === 'major' || e.severity === 'epoch');
    }
  });

  it('事件流持久化：eventLog 累积且重建引擎后保留（编年史数据基础）', () => {
    const engine = new WorldEngine(baseState);
    const result = engine.step();
    const state = result.updatedState;

    expect(state.eventLog.length).toBeGreaterThan(0);
    expect(state.eventLog).toEqual(result.events);
    // 重建引擎后事件流仍在（持久化语义）
    const engine2 = new WorldEngine(state);
    const before = engine2.getState().eventLog.length;
    engine2.step();
    expect(engine2.getState().eventLog.length).toBeGreaterThan(before);
  });

  it('trimEventLog：超限裁剪但保留 major/epoch 大事', () => {
    const normal: BigEventLog = {
      id: 'E', year: 1, month: 1, isMajorEvent: false, category: 'world',
      title: 'x', description: '', involvedCharacterIds: [], severity: 'normal',
      visibility: 'local', source: 'engine',
    };
    const major: BigEventLog = { ...normal, id: 'M', severity: 'major', isMajorEvent: true };
    const epoch: BigEventLog = { ...normal, id: 'EP', severity: 'epoch', isMajorEvent: true };
    const list: BigEventLog[] = [major, epoch, ...Array.from({ length: EVENT_LOG_MAX + 10 }, () => normal)];

    const trimmed = trimEventLog(list);
    expect(trimmed.length).toBeLessThanOrEqual(EVENT_LOG_MAX + 2); // 2 条大事被保留
    expect(trimmed.some((e) => e.id === 'M')).toBe(true);
    expect(trimmed.some((e) => e.id === 'EP')).toBe(true);
    // 顺序保持（旧→新）：大事在前，普通事件滚动窗口在后
    expect(trimmed[0]!.id).toBe('M');
  });
});
