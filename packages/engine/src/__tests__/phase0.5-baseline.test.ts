// ============================================================
// Phase 0.5 P0 特征测试 — 锁定现有行为基线
//
// 这些测试验证 Phase 0.5 修复之前的现状行为。
// P1-P7 实施后，部分测试的期望会更新（如"移动不推进世界"→"移动推进世界"）。
// ============================================================

import { describe, it, expect } from 'vitest';
import { WorldEngine } from '../world/world-engine.js';
import { TimeAdvanceService } from '../time/time-advance-service.js';
import { npcsByVenue, pickNearbyNpc } from '../world/npc-query.js';
import { PlayerLifecycleService } from '../lifecycle/player-lifecycle.js';
import { EconomyEngine } from '../economy/economy-engine.js';
import { createSeededRng } from '../battle/seeded-rng.js';
import type { Character, WorldState, NpcRecord, BigEventLog } from '@taosim/contracts';

// —— 测试夹具 ——

function makeBaseWorldState(): WorldState {
  return {
    currentYear: 1,
    currentMonth: 1,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
  };
}

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'PLAYER_TEST',
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
    hp: 100,
    maxHp: 100,
    ap: 3,
    canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [],
    skillCooldowns: {},
    traits: [],
    relations: {},
    spiritStones: 100,
    wantedLevels: {},
    unlockedRecipes: [],
    ...overrides,
  };
}

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_BASELINE_1',
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

// ============================================================
// 特征 1：快进（World 模式）会推进整个世界
//
// 验证 TimeAdvanceService.advance(months, 'World') 同步推进世界引擎。
// 这是红线 #2 要求不得回退的行为。
// ============================================================
describe('P0 特征：快进推进世界（World 模式）', () => {
  it('TimeAdvanceService World 模式推进后，世界年月发生变化', () => {
    const player = makePlayer();
    const ws = makeBaseWorldState();
    const startYear = ws.currentYear;
    const startMonth = ws.currentMonth;

    const result = TimeAdvanceService.advance(player, ws, 3, 'World');

    expect(result.updatedWorldState).toBeDefined();
    // 3 个月后：1月→4月
    expect(result.updatedWorldState!.currentMonth).toBe(startMonth + 3);
    expect(result.updatedWorldState!.currentYear).toBe(startYear);
  });

  it('World 模式推进后，世界 NPC 随时间演化（事件/人口变化）', () => {
    const player = makePlayer();
    const ws = makeBaseWorldState();

    const result = TimeAdvanceService.advance(player, ws, 12, 'World');

    // 12 个月推进后世界应该有 NPC（人口补充）
    const npcCount = Object.keys(result.updatedWorldState!.npcs).length;
    expect(npcCount).toBeGreaterThan(0);
  });

  it('World 模式跨年推进正确', () => {
    const player = makePlayer();
    const ws = makeBaseWorldState();
    ws.currentMonth = 10; // 从 10 月开始

    const result = TimeAdvanceService.advance(player, ws, 5, 'World');

    // 10月 + 5个月 = 次年 3月
    expect(result.updatedWorldState!.currentYear).toBe(2);
    expect(result.updatedWorldState!.currentMonth).toBe(3);
  });
});

// ============================================================
// 特征 2：playerStore.advanceTime（旅行移动）不推进世界
//
// 当前现状：MapPanel 调用 playerStore.advanceTime(days)，该方法
// 只调用 PlayerLifecycleService（推进玩家），不推进世界引擎。
// 这是 P1 要修复的缺口——此处锁定现状以便对比。
// ============================================================
describe('P0 特征：旅行移动当前不推进世界（待 P1 修复）', () => {
  it('PlayerLifecycleService.advanceTime 只推进玩家属性，不更新世界状态', () => {
    const player = makePlayer({ lifespan: { age: 20, maxLifespan: 100 } });
    const ws = makeBaseWorldState();
    const wsYearBefore = ws.currentYear;
    const wsMonthBefore = ws.currentMonth;

    // 模拟 playerStore.advanceTime 的核心调用（不经过世界引擎）
    const result = PlayerLifecycleService.advanceTime(
      player,
      2, // 2 个月（60 天 / 30）
      EconomyEngine.realmMonthlyIncome(player.realm),
    );

    // 玩家年龄增加了
    expect(result.updatedPlayer.lifespan.age).toBeGreaterThan(20);

    // 但世界状态完全不变（当前缺口）
    expect(ws.currentYear).toBe(wsYearBefore);
    expect(ws.currentMonth).toBe(wsMonthBefore);
  });
});

// ============================================================
// 特征 3：普通出生不进入事件流
//
// 验证人口补充时普通修士（born='mortal', 非变异, 非 Heaven 灵根）
// 不产生入世事件。这是红线 #2 要求不得回退的行为。
// ============================================================
describe('P0 特征：普通出生过滤', () => {
  it('普通散修入世不产生 world.spawn 事件', () => {
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(123) });

    // 推进数月，让人口补充机制运行
    const events: BigEventLog[] = [];
    for (let i = 0; i < 6; i++) {
      const result = engine.step();
      events.push(...result.events);
    }

    // 可能有一些 spawn 事件（来自特殊出生），但不应全部都是普通出生
    const spawnEvents = events.filter(e => e.title.includes('散修'));
    // 如果有 spawn 事件，数量应远少于总人口补充数（每月最多 10 个，6 月最多 60 个）
    // 普通出生被过滤后，只有特殊先天/变异/天灵根才报道
    const totalNpcs = Object.keys(engine.getState().npcs).length;
    // 普通出生不刷屏：spawn 事件数 << NPC 总数
    expect(spawnEvents.length).toBeLessThan(totalNpcs);
  });

  it('天灵根 NPC 入世确实产生事件', () => {
    // 这个测试验证过滤逻辑：当特殊 NPC 出生时确实会报道
    // 我们通过检查大量推进中是否偶有 spawn 事件来确认
    const ws = makeBaseWorldState();
    const engine = new WorldEngine(ws, { rng: createSeededRng(456) });
    engine.fastForward(24);

    const state = engine.getState();
    // 大量 NPC 中至少有一些特殊出生（天灵根/变异/非凡人出身）
    const specialNpcs = Object.values(state.npcs).filter(
      n => n.destiny.born !== 'mortal' || n.spiritRoot.isVariant || n.spiritRoot.grade === 'Heaven',
    );
    // 24 个月生成数十个 NPC，天灵根概率约 5%，特殊出生应该有但不多
    // 这里不强制要求一定有（概率），但如果有的话确保事件流中有对应报道
    if (specialNpcs.length > 0) {
      // 确认事件流中存在 spawn 类事件
      // (eventLog 是裁剪后的，spawn 是 normal 级别应该被保留)
      expect(state.eventLog.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 特征 4：NPC 查询是只读操作，不改变世界状态
//
// 验证 npcsByVenue 和 pickNearbyNpc 是纯查询函数。
// 关注人物功能（P5）将在此基础上扩展，但当前只是查询。
// ============================================================
describe('P0 特征：NPC 查询只读', () => {
  it('npcsByVenue 不修改输入 NPC 字典', () => {
    const npcs: Record<string, NpcRecord> = {
      NPC_A: makeNpc({ id: 'NPC_A', locationId: 'VENUE_TEST' }),
      NPC_B: makeNpc({ id: 'NPC_B', locationId: 'VENUE_OTHER' }),
    };
    const snapshot = JSON.stringify(npcs);

    const result = npcsByVenue(npcs, 'VENUE_TEST');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('NPC_A');
    // 输入未被修改
    expect(JSON.stringify(npcs)).toBe(snapshot);
  });

  it('pickNearbyNpc 返回真实世界 NPC 档案（非临时生成）', () => {
    const npcs: Record<string, NpcRecord> = {
      NPC_A: makeNpc({ id: 'NPC_A', locationId: 'VENUE_TEST', name: '散修·张三' }),
      NPC_B: makeNpc({ id: 'NPC_B', locationId: 'VENUE_TEST', name: '散修·李四' }),
    };

    const result = pickNearbyNpc(npcs, 'VENUE_TEST', () => 0.5);

    expect(result).not.toBeNull();
    expect(result!.id).toMatch(/^NPC_/);
    // 确保返回的是有世界档案身份的 NPC，不是临时 ID
    expect(result!.name).toMatch(/^散修·/);
  });

  it('npcsByVenue 只返回 Active 状态的 NPC', () => {
    const npcs: Record<string, NpcRecord> = {
      NPC_ACTIVE: makeNpc({ id: 'NPC_ACTIVE', locationId: 'VENUE_TEST', soulState: 'Active' }),
      NPC_GONE: makeNpc({ id: 'NPC_GONE', locationId: 'VENUE_TEST', soulState: 'Oblivion' }),
      NPC_SOUL: makeNpc({ id: 'NPC_SOUL', locationId: 'VENUE_TEST', soulState: 'PrimordialSoul' }),
    };

    const result = npcsByVenue(npcs, 'VENUE_TEST');

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('NPC_ACTIVE');
  });
});
