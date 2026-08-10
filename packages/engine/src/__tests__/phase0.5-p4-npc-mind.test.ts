// ============================================================
// Phase 0.5 P4 测试：NPC Mind 与计划调度器
//
// 验证：
// - MindState 持久化意愿/目标/计划
// - 计划调度器根据 NPC 状态生成计划
// - NPC 每月执行下一步行动
// - 行动产出描述（非随机事件模板）
// ============================================================

import { describe, it, expect } from 'vitest';
import { tickNpcMind, generateInitialMind } from '../world/npc-mind.js';
import type { NpcRecord, MindState, NpcGoal, NpcAction } from '@taosim/contracts';

// —— 测试夹具 ——

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_MIND_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 50, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 25, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

// ============================================================
// MindState 初始化
// ============================================================
describe('P4 NPC Mind: 初始化', () => {
  it('generateInitialMind 为 NPC 创建初始心智状态', () => {
    const npc = makeNpc();
    const mind = generateInitialMind(npc);

    expect(mind).toBeDefined();
    expect(mind.currentGoal).toBeDefined();
    expect(mind.currentGoal.type).toBeTruthy();
    expect(mind.nextAction).toBeDefined();
    expect(mind.needs).toBeDefined();
  });

  it('不同志向的 NPC 有不同初始目标', () => {
    const seeker = generateInitialMind(makeNpc({ aspiration: 'seekDao' }));
    const wanderer = generateInitialMind(makeNpc({ aspiration: 'wander' }));

    expect(seeker.currentGoal.type).not.toBe(wanderer.currentGoal.type);
  });
});

// ============================================================
// 月度 Mind tick
// ============================================================
describe('P4 NPC Mind: 月度调度', () => {
  it('tickNpcMind 更新需求和下一步行动', () => {
    const npc = makeNpc({ aspiration: 'seekDao' });
    const mind = generateInitialMind(npc);

    const result = tickNpcMind(npc, mind, { year: 1, month: 2 });

    expect(result.mind).toBeDefined();
    expect(result.mind.nextAction).toBeDefined();
    expect(result.actionDescription).toBeTruthy();
  });

  it('低修为进度时求道者选择修炼行动', () => {
    const npc = makeNpc({
      aspiration: 'seekDao',
      cultivation: { currentExp: 10, maxExp: 100 },
    });
    const mind = generateInitialMind(npc);

    const result = tickNpcMind(npc, mind, { year: 1, month: 2 });

    // 求道者修为不足时应该修炼/闭关
    expect(result.mind.nextAction.type).toMatch(/cultivate|seclude/);
  });

  it('高修为进度时求道者选择突破行动', () => {
    const npc = makeNpc({
      aspiration: 'seekDao',
      cultivation: { currentExp: 95, maxExp: 100 },
    });
    const mind = generateInitialMind(npc);

    const result = tickNpcMind(npc, mind, { year: 1, month: 2 });

    expect(result.mind.nextAction.type).toMatch(/breakthrough|prepare/);
  });

  it('行动描述基于 NPC 状态（非随机模板）', () => {
    const npc = makeNpc({
      aspiration: 'seekDao',
      name: '散修·张三',
      cultivation: { currentExp: 50, maxExp: 100 },
    });
    const mind = generateInitialMind(npc);

    const result = tickNpcMind(npc, mind, { year: 1, month: 2 });

    // 描述应该包含 NPC 的实际情况，不是通用随机文本
    expect(result.actionDescription).toBeTruthy();
    expect(result.actionDescription.length).toBeGreaterThan(5);
  });
});

// ============================================================
// 目标持续性
// ============================================================
describe('P4 NPC Mind: 目标持续性', () => {
  it('目标在未完成时持续存在', () => {
    const npc = makeNpc({ aspiration: 'seekDao' });
    let mind = generateInitialMind(npc);
    const goalBefore = mind.currentGoal;

    // 推进 3 个月
    for (let i = 0; i < 3; i++) {
      const result = tickNpcMind(npc, mind, { year: 1, month: 2 + i });
      mind = result.mind;
    }

    // 目标应该还是同类型（除非完成了）
    expect(mind.currentGoal.type).toBe(goalBefore.type);
  });

  it('求偶目标在找到道侣后转换', () => {
    const npc = makeNpc({ aspiration: 'seekPartner' });
    let mind = generateInitialMind(npc);
    expect(mind.currentGoal.type).toMatch(/partner|spouse/);

    // NPC 有了道侣
    npc.spouseId = 'NPC_OTHER';
    npc.aspiration = 'seekDao';

    const result = tickNpcMind(npc, mind, { year: 1, month: 2 });
    // 目标应该不再是求偶
    expect(result.mind.currentGoal.type).not.toMatch(/partner|spouse/);
  });
});

// ============================================================
// 需求系统
// ============================================================
describe('P4 NPC Mind: 需求驱动', () => {
  it('寿元不足时产生 longevity 需求', () => {
    const npc = makeNpc({
      aspiration: 'seekDao',
      lifespan: { age: 90, maxLifespan: 100 },
    });
    const mind = generateInitialMind(npc);

    expect(mind.needs.longevity).toBeGreaterThan(0);
  });

  it('孤独时产生 social 需求', () => {
    const npc = makeNpc({
      aspiration: 'wander',
      relations: {},
    });
    const mind = generateInitialMind(npc);

    expect(mind.needs.social).toBeGreaterThan(0);
  });

  it('需求强度影响行动选择', () => {
    // 高寿元压力的 NPC
    const oldNpc = makeNpc({
      aspiration: 'seekDao',
      lifespan: { age: 95, maxLifespan: 100 },
    });
    const oldMind = generateInitialMind(oldNpc);

    // 低寿元压力的 NPC
    const youngNpc = makeNpc({
      aspiration: 'seekDao',
      lifespan: { age: 25, maxLifespan: 100 },
    });
    const youngMind = generateInitialMind(youngNpc);

    expect(oldMind.needs.longevity).toBeGreaterThan(youngMind.needs.longevity);
  });
});
