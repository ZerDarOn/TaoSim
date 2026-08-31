import { describe, expect, it } from 'vitest';
import type { NpcRecord, WorldState } from '@taosim/contracts';
import { createSeededRng } from '../../battle/seeded-rng.js';
import { WorldEngine } from '../world-engine.js';

function npc(id: string, aspiration: NpcRecord['aspiration'] = 'seekDao'): NpcRecord {
  return {
    id,
    name: `修士${id}`,
    gender: 'Male',
    personalityId: 'cautious',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 20, maxExp: 100 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 25, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    aspiration,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
  };
}

function world(records: NpcRecord[]): WorldState {
  return {
    currentYear: 1,
    currentMonth: 1,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs: Object.fromEntries(records.map((record) => [record.id, record])),
    eventLog: [],
  };
}

function withoutNb3Metadata(state: WorldState): WorldState {
  const copy = JSON.parse(JSON.stringify(state)) as WorldState;
  copy.facts = [];
  copy.resourceReservations = {};
  for (const record of Object.values(copy.npcs)) delete record.brain;
  for (const record of Object.values(copy.archivedNpcs ?? {})) delete record.brain;
  return copy;
}

describe('WorldEngine NB2 brain shadow integration', () => {
  it('开启 shadow 后世界结果与关闭时完全一致，差异只进入聚合报告', () => {
    const initial = world([npc('npc_1')]);
    const withoutShadow = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(20260831),
    });
    const withShadow = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(20260831),
      npcBrainV2Shadow: true,
    });

    withoutShadow.step();
    withShadow.step();

    expect(withShadow.getState()).toEqual(withoutShadow.getState());
    expect(withoutShadow.getBrainShadowReport()).toBeUndefined();
    expect(withShadow.getBrainShadowReport()).toMatchObject({
      at: { year: 1, month: 2 },
      evaluatedNpcCount: 1,
    });
  });

  it('800 NPC 只保留聚合计数和至多 20 条分歧样本', () => {
    const records = Array.from({ length: 800 }, (_, index) =>
      npc(`npc_${index}`, index % 2 === 0 ? 'seekDao' : 'wander'));
    const engine = new WorldEngine(world(records), {
      rng: createSeededRng(42),
      npcBrainV2Shadow: true,
    });

    engine.step();
    const report = engine.getBrainShadowReport()!;

    expect(report.evaluatedNpcCount).toBe(800);
    expect(report.matchedCount + report.differedCount).toBe(800);
    expect(Object.values(report.comparisonCounts).reduce((sum, count) => sum + count, 0)).toBe(800);
    expect(report.differenceSamples.length).toBeLessThanOrEqual(20);
    expect(Object.values(report.selectedCounts).reduce((sum, count) => sum + count, 0))
      .toBe(800 - report.noRecommendationCount);
  });

  it('跨月快进累计计数但不累计无界样本', () => {
    const engine = new WorldEngine(world([npc('npc_1')]), {
      rng: createSeededRng(7),
      npcBrainV2Shadow: true,
    });

    engine.fastForward(3);
    const aggregate = engine.getBrainShadowAggregateReport()!;

    expect(aggregate.monthCount).toBe(3);
    expect(aggregate.from).toEqual({ year: 1, month: 2 });
    expect(aggregate.to).toEqual({ year: 1, month: 4 });
    expect(aggregate.evaluatedNpcCount).toBeGreaterThanOrEqual(3);
    expect(aggregate.differenceSamples.length).toBeLessThanOrEqual(20);
    expect(Object.values(aggregate.comparisonCounts).reduce((sum, count) => sum + count, 0))
      .toBe(aggregate.evaluatedNpcCount);
  });

  it('连续一年开启 shadow 仍不改变任何世界结果', () => {
    const initial = world([npc('npc_1'), npc('npc_2', 'wander')]);
    const withoutShadow = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(99),
    });
    const withShadow = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(99),
      npcBrainV2Shadow: true,
    });

    withoutShadow.fastForward(12);
    withShadow.fastForward(12);

    expect(withShadow.getState()).toEqual(withoutShadow.getState());
    expect(withShadow.getBrainShadowAggregateReport()?.monthCount).toBe(12);
  });

  it('损坏 Brain 的 shadow 异常只进入报告，不得中断或改变世界推进', () => {
    const broken = npc('npc_broken');
    broken.brain = {} as any;
    const initial = world([broken]);
    const withoutShadow = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(123),
    });
    const withShadow = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(123),
      npcBrainV2Shadow: true,
    });

    withoutShadow.step();
    expect(() => withShadow.step()).not.toThrow();

    expect(withShadow.getState()).toEqual(withoutShadow.getState());
    expect(withShadow.getBrainShadowReport()).toMatchObject({
      evaluationErrorCount: 1,
      evaluationErrorSamples: ['npc_broken'],
      rejectionCounts: { evaluation_error: 1 },
    });
  });

  it('single-write 对完整求道目标由 Brain Action 唯一提交并持久化生命周期', () => {
    const engine = new WorldEngine(world([npc('npc_single')]), {
      rng: createSeededRng(20260831),
      npcBrainV2Mode: 'single-write',
    });

    engine.step();
    const record = engine.getState().npcs.npc_single!;

    expect(record.brain?.revision).toBeGreaterThan(0);
    expect(record.brain?.currentGoal?.kind).toBe('cultivate_to_breakthrough');
    expect(record.brain?.currentPlan?.status).toBe('completed');
    expect(record.brain?.currentAction).toMatchObject({ capabilityId: 'cultivate', status: 'succeeded' });
    expect(engine.getBrainShadowReport()).toMatchObject({
      committedCount: 1,
      legacyFallbackCount: 0,
      committedCounts: { cultivate: 1 },
    });
  });

  it('single-write 对未完整覆盖的求偶目标保持旧链结果，并记录明确回退原因', () => {
    const initial = world([npc('npc_partner', 'seekPartner')]);
    const legacy = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(77),
    });
    const singleWrite = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(77),
      npcBrainV2Mode: 'single-write',
    });

    legacy.step();
    singleWrite.step();

    expect(withoutNb3Metadata(singleWrite.getState())).toEqual(withoutNb3Metadata(legacy.getState()));
    expect(singleWrite.getBrainShadowReport()).toMatchObject({
      committedCount: 0,
      legacyFallbackCount: 1,
      legacyFallbackCounts: { goal_not_fully_covered: 1 },
    });
  });

  it('single-write 评估损坏时回退旧链，不中断权威世界', () => {
    const broken = npc('npc_broken_single');
    broken.brain = {} as any;
    const initial = world([broken]);
    const legacy = new WorldEngine(JSON.parse(JSON.stringify(initial)), { rng: createSeededRng(31) });
    const singleWrite = new WorldEngine(JSON.parse(JSON.stringify(initial)), {
      rng: createSeededRng(31), npcBrainV2Mode: 'single-write',
    });

    legacy.step();
    expect(() => singleWrite.step()).not.toThrow();

    expect(withoutNb3Metadata(singleWrite.getState())).toEqual(withoutNb3Metadata(legacy.getState()));
    expect(singleWrite.getBrainShadowReport()).toMatchObject({
      evaluationErrorCount: 1,
      legacyFallbackCount: 1,
      legacyFallbackCounts: { evaluation_error: 1 },
    });
  });

  it('NB3 探索者依据本地认知建立三步计划、预留行动槽并到达真实场所', () => {
    const explorer = npc('npc_explorer', 'wander');
    explorer.locationId = 'VENUE_TIANJI_TAVERN';
    const engine = new WorldEngine(world([explorer]), {
      rng: createSeededRng(20260831), npcBrainV2Mode: 'single-write',
    });

    engine.step();
    const state = engine.getState();
    const record = state.npcs.npc_explorer!;
    const plan = record.brain?.currentPlan;

    expect(record.locationId).not.toBe('VENUE_TIANJI_TAVERN');
    expect(record.locationId).toMatch(/^VENUE_TIANJI_/);
    expect(plan?.steps.map((step) => step.capabilityId)).toEqual([
      'observe_local_area', 'reserve_primary_action', 'wander',
    ]);
    expect(plan?.status).toBe('completed');
    expect(record.brain?.currentAction?.targets).toEqual([
      { kind: 'location', entityId: record.locationId },
    ]);
    const reservationId = record.brain?.currentAction?.reservationIds[0]!;
    expect(state.resourceReservations?.[reservationId]?.status).toBe('consumed');
    expect(engine.getBrainShadowReport()).toMatchObject({
      plansPreparedCount: 1,
      committedCounts: { wander: 1 },
    });
  });

  it('只有实际产生的 normal+ 事件才在月末形成结构化事实', () => {
    const cultivator = npc('npc_fact');
    cultivator.cultivation = { currentExp: 100, maxExp: 100 };
    const engine = new WorldEngine(world([cultivator]), {
      rng: createSeededRng(19), npcBrainV2Mode: 'single-write',
    });

    const result = engine.step();
    const chronicleEvents = result.events.filter((event) => event.severity !== 'minor');
    const facts = engine.getState().facts ?? [];

    expect(chronicleEvents.length).toBeGreaterThan(0);
    for (const event of chronicleEvents) {
      expect(facts).toContainEqual(expect.objectContaining({
        factId: event.id,
        title: event.title,
        description: event.description,
      }));
    }
  });
});
