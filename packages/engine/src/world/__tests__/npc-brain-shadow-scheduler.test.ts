import { describe, expect, it } from 'vitest';
import {
  createInitialBrainState,
  type BrainState,
  type NpcRecord,
} from '@taosim/contracts';
import {
  NpcBrainNodeRegistry,
  createDefaultNpcBrainNodeRegistry,
} from '../npc-brain-node-registry.js';
import { evaluateNpcBrainShadow } from '../npc-brain-shadow-scheduler.js';

function npc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  const record = {
    id: 'npc_1',
    name: '测试修士',
    personalityId: 'cautious',
    aspiration: 'seekDao',
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 20, maxExp: 100 },
    lifespan: { age: 25, maxLifespan: 100 },
    relations: {},
    biography: { milestones: [], summary: '' },
    birthYear: 1,
    birthMonth: 1,
    moveState: 'resident',
    ...overrides,
  } as unknown as NpcRecord;
  record.brain ??= createInitialBrainState({
    npcId: record.id,
    personalityId: record.personalityId,
    aspiration: record.aspiration,
    birthYear: record.birthYear,
    birthMonth: record.birthMonth,
  }, { year: 3, month: 2 });
  return record;
}

function evaluate(record: NpcRecord, registry = createDefaultNpcBrainNodeRegistry()) {
  return evaluateNpcBrainShadow(record, record.brain as BrainState, {
    now: { year: 3, month: 2 },
    registry,
  });
}

describe('NpcBrainNodeRegistry', () => {
  it('关闭节点会移除对应手段，同时保留明确抑制原因', () => {
    const registry = createDefaultNpcBrainNodeRegistry();
    registry.setEnabled('cultivate', false);

    const result = evaluate(npc(), registry);

    expect(result.candidates.some((candidate) => candidate.capabilityId === 'cultivate')).toBe(false);
    expect(result.rejected).toContainEqual(expect.objectContaining({
      capabilityId: 'cultivate', reasonCode: 'node_disabled',
    }));
  });

  it('拒绝重复节点 id，避免注册顺序静默覆盖能力', () => {
    const registry = new NpcBrainNodeRegistry();
    const definition = createDefaultNpcBrainNodeRegistry().get('cultivate')!;
    registry.register(definition);

    expect(() => registry.register(definition)).toThrowError(/重复节点/);
  });
});

describe('evaluateNpcBrainShadow', () => {
  it('修为未满时硬性过滤突破，修为圆满时选择突破', () => {
    const unready = evaluate(npc({ cultivation: { currentExp: 99, maxExp: 100 } }));
    expect(unready.rejected).toContainEqual(expect.objectContaining({
      capabilityId: 'breakthrough', reasonCode: 'cultivation_not_full',
    }));

    const ready = evaluate(npc({ cultivation: { currentExp: 100, maxExp: 100 } }));
    expect(ready.selected?.capabilityId).toBe('breakthrough');
  });

  it('求道初期倾向修炼，逍遥目标倾向云游', () => {
    const cultivator = evaluate(npc());
    const wanderer = npc({ aspiration: 'wander' });
    wanderer.brain = createInitialBrainState({
      npcId: wanderer.id,
      personalityId: wanderer.personalityId,
      aspiration: 'wander',
      birthYear: 1,
      birthMonth: 1,
    }, { year: 3, month: 2 });

    expect(cultivator.selected?.capabilityId).toBe('cultivate');
    expect(evaluate(wanderer).selected?.capabilityId).toBe('wander');
    expect(cultivator.commitEligibility).toEqual({ eligible: true, reasonCode: 'covered_goal' });
    expect(evaluate(wanderer).commitEligibility).toEqual({ eligible: true, reasonCode: 'covered_goal' });
  });

  it('只按完整目标闭环开放单写，复仇闭环完成后不再与求偶、延寿一起被拦截', () => {
    for (const aspiration of ['seekPartner', 'seekLongevity'] as const) {
      const result = evaluate(npc({ aspiration }));
      expect(result.commitEligibility).toEqual({
        eligible: false,
        reasonCode: 'goal_not_fully_covered',
      });
    }
    const avenger = npc({ aspiration: 'seekRevenge' });
    avenger.relations.enemy = {
      type: 'enemy', bond: -80, trust: 0, events: ['家仇'], changedAt: { year: 2, month: 1 },
    };
    const revenge = evaluate(avenger);
    expect(revenge.selected?.capabilityId).toBe('revenge_ambush');
    expect(revenge.commitEligibility).toEqual({
      eligible: true, reasonCode: 'covered_goal', executor: 'revenge_ambush',
    });
  });

  it('NPC 转志后使用当前状态推导目标，不被 NB1 初始化快照锁死', () => {
    const record = npc({ aspiration: 'seekRevenge' });
    record.brain = createInitialBrainState({
      npcId: record.id,
      personalityId: record.personalityId,
      aspiration: 'seekRevenge',
      birthYear: 1,
      birthMonth: 1,
    }, { year: 1, month: 1 });
    record.aspiration = 'wander';

    const result = evaluate(record);

    expect(result.activeGoalKind).toBe('explore');
    expect(result.selected?.capabilityId).toBe('wander');
    expect(record.brain.currentGoal?.kind).toBe('seek_revenge');
  });

  it('求名者实力不足时先修炼，达到基础后才考虑外出扬名', () => {
    const weak = npc({ aspiration: 'seekFame', cultivation: { currentExp: 20, maxExp: 100 } });
    const ready = npc({ aspiration: 'seekFame', cultivation: { currentExp: 70, maxExp: 100 } });

    expect(evaluate(weak).selected?.capabilityId).toBe('cultivate');
    expect(evaluate(ready).selected?.capabilityId).toBe('wander');
  });

  it('同一输入完全可复现，且评估不会修改 NPC 或 Brain', () => {
    const record = npc();
    const before = JSON.stringify(record);

    const first = evaluate(record);
    const second = evaluate(record);

    expect(first).toEqual(second);
    expect(JSON.stringify(record)).toBe(before);
  });

  it('新候选未明显胜过当前行动时由迟滞保留当前行动', () => {
    const record = npc({ cultivation: { currentExp: 55, maxExp: 100 } });
    record.brain!.currentAction = {
      actionId: 'incumbent',
      capabilityId: 'cultivate',
      status: 'executing',
      targets: [],
      reservationIds: [],
      progress: 0.5,
      plannedAt: { year: 3, month: 1 },
    };

    const result = evaluate(record);

    expect(result.selected?.capabilityId).toBe('cultivate');
    expect(result.hysteresisApplied).toBe(true);
  });

  it('普通 NPC 可按稳定顺序接受足够好的候选，而非每次穷举最优', () => {
    const record = npc({ cultivation: { currentExp: 55, maxExp: 100 } });
    const result = evaluateNpcBrainShadow(record, record.brain!, {
      now: { year: 3, month: 2 },
      registry: createDefaultNpcBrainNodeRegistry(),
      satisfactionThreshold: 65,
    });

    expect(result.candidates[0]?.capabilityId).toBe('seclude');
    expect(result.selected?.capabilityId).toBe('cultivate');
    expect(result.satisficingApplied).toBe(true);
  });

  it('近期完成的同类行动会被冷却抑制并给出机器可读原因', () => {
    const record = npc({ aspiration: 'wander' });
    record.brain!.currentAction = {
      actionId: 'wander_done', capabilityId: 'wander', status: 'succeeded',
      targets: [], reservationIds: [], progress: 1,
      plannedAt: { year: 3, month: 1 }, completedAt: { year: 3, month: 2 },
    };

    const result = evaluate(record);

    expect(result.rejected).toContainEqual(expect.objectContaining({
      capabilityId: 'wander', reasonCode: 'cooldown',
    }));
  });

  it('恢复期 NPC 没有普通候选，所有节点说明统一硬前置失败', () => {
    const record = npc();
    const result = evaluateNpcBrainShadow(record, record.brain!, {
      now: { year: 3, month: 2 },
      registry: createDefaultNpcBrainNodeRegistry(),
      condition: {
        injuries: [], poisons: [], meridianDamage: 0,
        recoveringUntil: { year: 3, month: 4 },
      },
    });

    expect(result.selected).toBeUndefined();
    const equippedNodeCount = createDefaultNpcBrainNodeRegistry().list()
      .filter(({ definition }) => !definition.isEquipped || definition.isEquipped(record)).length;
    expect(result.rejected).toHaveLength(equippedNodeCount);
    expect(result.rejected.every((entry) => entry.reasonCode === 'recovering')).toBe(true);
  });
});
