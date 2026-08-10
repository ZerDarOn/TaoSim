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
  eventLog: [],
};

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_TEST_1',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
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

describe('NPC 生命周期归档（S4）', () => {
  it('归档不删除：死亡宽限期后 NPC 从 state.npcs 移除，但出现在 state.archivedNpcs', () => {
    // 超宽限期：11 年前陨落（> OBLIVION_GRACE_YEARS=10）应被归档
    const ancient = makeNpc({
      id: 'NPC_ANCIENT_1',
      name: '古人·测试',
      soulState: 'PrimordialSoul',
      causeOfDeath: '仇杀陨落',
      deathYear: 1,
      deathMonth: 1,
      realm: 'GoldenCore_2',
      lifespan: { age: 45, maxLifespan: 100 },
    });
    const engine = new WorldEngine({
      ...baseState,
      currentYear: 12,
      currentMonth: 1,
      npcs: { [ancient.id]: ancient },
    });

    engine.step();

    const state = engine.getState();
    // 已从活动字典移除
    expect(state.npcs[ancient.id]).toBeUndefined();
    // 但在历史档案中保留（不删除）
    expect(state.archivedNpcs).toBeDefined();
    expect(state.archivedNpcs![ancient.id]).toBeDefined();
    expect(state.archivedNpcs![ancient.id]!.name).toBe('古人·测试');
    expect(state.archivedNpcs![ancient.id]!.causeOfDeath).toBe('仇杀陨落');
  });

  it('墓碑投影：getGraveyard 返回的墓碑信息正确', () => {
    const ancient = makeNpc({
      id: 'NPC_GRAVE_1',
      name: '墓主·测试',
      soulState: 'PrimordialSoul',
      causeOfDeath: '寿元耗尽',
      deathYear: 5,
      deathMonth: 3,
      realm: 'GoldenCore_2',
      lifespan: { age: 88, maxLifespan: 100 },
      relations: {
        NPC_FRIEND_1: { type: 'friend', bond: 60, trust: 50, events: [], changedAt: { year: 2, month: 1 } },
      },
    });
    const engine = new WorldEngine({
      ...baseState,
      currentYear: 16,
      currentMonth: 3,
      npcs: { [ancient.id]: ancient },
    });

    engine.step();

    const graveyard = engine.getGraveyard();
    expect(graveyard).toHaveLength(1);
    const marker = graveyard[0]!;
    expect(marker.characterId).toBe('NPC_GRAVE_1');
    expect(marker.name).toBe('墓主·测试');
    expect(marker.deathYear).toBe(5);
    expect(marker.causeOfDeath).toBe('寿元耗尽');
    expect(marker.deathAge).toBe(88);
    expect(marker.realmAtDeath).toBe('JinDan');
    expect(marker.relationHooks).toEqual([
      { targetId: 'NPC_FRIEND_1', relationType: 'friend' },
    ]);
  });

  it('归档 NPC 不参与 tick：archivedNpcs 中的 NPC 不被月度规则处理', () => {
    // 一个归档 NPC（年龄 30）和一个活动 NPC（年龄 30）
    // 月度推进会让活动 NPC age +1/12，但归档 NPC 的 age 不应变化
    const archived = makeNpc({
      id: 'NPC_ARCHIVED_1',
      name: '已归档·测试',
      soulState: 'RemnantSoul',
      causeOfDeath: '寿元耗尽',
      deathYear: 1,
      deathMonth: 1,
      lifespan: { age: 30, maxLifespan: 100 },
    });
    const active = makeNpc({
      id: 'NPC_ACTIVE_1',
      name: '在世·测试',
      soulState: 'Active',
      lifespan: { age: 30, maxLifespan: 100 },
      locationId: 'NODE_TEST',
    });
    const engine = new WorldEngine({
      ...baseState,
      currentYear: 2,
      currentMonth: 1,
      npcs: { [active.id]: active },
      archivedNpcs: { [archived.id]: archived },
    });

    const beforeAge = engine.getState().archivedNpcs![archived.id]!.lifespan.age;
    engine.step();
    const afterState = engine.getState();
    const afterAge = afterState.archivedNpcs![archived.id]!.lifespan.age;

    // 归档 NPC 年龄不变（不被 tick 处理）
    expect(afterAge).toBe(beforeAge);
    // 活动 NPC 仍在活动字典
    expect(afterState.npcs[active.id]).toBeDefined();
    // 归档 NPC 仍在档案（未被错误移回活动）
    expect(afterState.archivedNpcs![archived.id]).toBeDefined();
  });

  it('人口统计：活动人口 = state.npcs 数量；总人口 = state.npcs + state.archivedNpcs', () => {
    const active1 = makeNpc({ id: 'NPC_POP_A1', soulState: 'Active', locationId: 'NODE_TEST_1' });
    const active2 = makeNpc({ id: 'NPC_POP_A2', soulState: 'Active', locationId: 'NODE_TEST_2' });
    const archived1 = makeNpc({
      id: 'NPC_POP_R1',
      soulState: 'RemnantSoul',
      deathYear: 1,
      deathMonth: 1,
      lifespan: { age: 60, maxLifespan: 100 },
    });
    const engine = new WorldEngine({
      ...baseState,
      currentYear: 1,
      currentMonth: 1,
      npcs: { [active1.id]: active1, [active2.id]: active2 },
      archivedNpcs: { [archived1.id]: archived1 },
    });

    const state = engine.getState();
    const activePopulation = Object.keys(state.npcs).length;
    const archivedPopulation = Object.keys(state.archivedNpcs ?? {}).length;
    const totalPopulation = activePopulation + archivedPopulation;

    expect(activePopulation).toBe(2);
    expect(archivedPopulation).toBe(1);
    expect(totalPopulation).toBe(3);
  });
});
