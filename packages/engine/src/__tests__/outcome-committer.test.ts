import { describe, it, expect } from 'vitest';
import { commitOutcome } from '../world/outcome-committer.js';
import type {
  WorldState,
  WorldOutcome,
  NpcRecord,
  Fact,
  AssetInstance,
  SocialEntry,
  Injury,
} from '@taosim/contracts';

// ── 工厂辅助 ──

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_001',
    name: '散修·测试',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 8, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    spiritStones: 100,
    ...overrides,
  };
}

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    currentYear: 100,
    currentMonth: 3,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['C1'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
    worldRevision: 0,
    ...overrides,
  };
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    factId: 'FACT_001',
    type: 'battle',
    at: { year: 100, month: 3 },
    participants: [{ entityId: 'NPC_001', role: 'combatant' }],
    title: '测试事实',
    description: '用于测试的事实记录',
    visibility: 'public',
    ...overrides,
  };
}

function makeAsset(overrides: Partial<AssetInstance> = {}): AssetInstance {
  return {
    assetId: 'ASSET_001',
    templateId: 'TPL_SWORD',
    name: '测试飞剑',
    rarity: 'rare',
    ownerId: 'NPC_001',
    origin: { source: 'loot', at: { year: 99, month: 1 } },
    combatBonuses: { attack: 10 },
    ...overrides,
  };
}

function makeSocialEntry(overrides: Partial<SocialEntry> = {}): SocialEntry {
  return {
    targetId: 'NPC_002',
    type: 'rival',
    bond: -30,
    trust: 10,
    hatred: 50,
    jealousy: 0,
    events: ['初遇结仇'],
    changedAt: { year: 100, month: 3 },
    ...overrides,
  };
}

function makeInjury(overrides: Partial<Injury> = {}): Injury {
  return {
    level: 'moderate',
    source: 'battle',
    acquiredAt: { year: 100, month: 3 },
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<WorldOutcome> = {}): WorldOutcome {
  return {
    outcomeId: 'OUTCOME_001',
    baseRevision: 0,
    source: 'battle',
    entityDeltas: [],
    ...overrides,
  };
}

// ── 测试 ──

describe('commitOutcome', () => {
  it('正常提交：revision+1，NPC 灵石变更，事实追加', () => {
    const npc = makeNpc({ spiritStones: 100 });
    const ws = makeWorldState({
      npcs: { NPC_001: npc },
      worldRevision: 5,
    });
    const outcome = makeOutcome({
      baseRevision: 5,
      entityDeltas: [
        { entityId: 'NPC_001', spiritStonesDelta: -50 },
      ],
      facts: [makeFact()],
    });

    const result = commitOutcome(ws, outcome);

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.newRevision).toBe(6);
    }
    expect(ws.worldRevision).toBe(6);
    expect(npc.spiritStones).toBe(50);
    expect(ws.facts).toHaveLength(1);
    expect(ws.facts![0]!.factId).toBe('FACT_001');
  });

  it('幂等：同 outcomeId 第二次提交返回 already_applied', () => {
    const ws = makeWorldState({ worldRevision: 0 });
    const outcome = makeOutcome();

    const first = commitOutcome(ws, outcome);
    expect(first.status).toBe('success');

    const second = commitOutcome(ws, outcome);
    expect(second.status).toBe('already_applied');
    if (second.status === 'already_applied') {
      expect(second.outcomeId).toBe('OUTCOME_001');
    }
  });

  it('版本冲突：baseRevision 不匹配返回 version_conflict', () => {
    const ws = makeWorldState({ worldRevision: 3 });
    const outcome = makeOutcome({ baseRevision: 2 });

    const result = commitOutcome(ws, outcome);

    expect(result.status).toBe('version_conflict');
    if (result.status === 'version_conflict') {
      expect(result.expected).toBe(2);
      expect(result.actual).toBe(3);
    }
    // 状态不变
    expect(ws.worldRevision).toBe(3);
  });

  it('NPC 不回写 hp：hpDelta 对 NPC 无效', () => {
    const npc = makeNpc();
    const ws = makeWorldState({ npcs: { NPC_001: npc } });
    const outcome = makeOutcome({
      entityDeltas: [
        {
          entityId: 'NPC_001',
          hpDelta: -50,
          spiritStonesDelta: 10,
        },
      ],
    });

    commitOutcome(ws, outcome);

    // NpcRecord 无 hp 字段，hpDelta 不产生任何效果（不报错即可）
    // 灵石变更正常应用
    expect(npc.spiritStones).toBe(110);
    expect((npc as unknown as Record<string, unknown>).hp).toBeUndefined();
  });

  it('NPC 死亡不 delete：killed=true 后 soulState 变更但仍在 npcs 字典', () => {
    const npc = makeNpc();
    const ws = makeWorldState({ npcs: { NPC_001: npc } });
    const outcome = makeOutcome({
      entityDeltas: [
        { entityId: 'NPC_001', killed: true, killedBy: 'PLAYER_001' },
      ],
    });

    commitOutcome(ws, outcome);

    // 仍在字典中
    expect(ws.npcs.NPC_001).toBeDefined();
    // soulState 变更
    expect(npc.soulState).toBe('RemnantSoul');
    // 死亡时间与死因记录
    expect(npc.deathYear).toBe(100);
    expect(npc.deathMonth).toBe(3);
    expect(npc.causeOfDeath).toContain('PLAYER_001');
  });

  it('关系追加不覆盖：socialChanges 追加到 socialStates', () => {
    const ws = makeWorldState({
      npcs: { NPC_001: makeNpc() },
      socialStates: {
        NPC_001: {
          NPC_002: makeSocialEntry({
            targetId: 'NPC_002',
            type: 'friend',
            bond: 20,
              events: ['旧交情'],
          }),
        },
      },
    });
    const outcome = makeOutcome({
      entityDeltas: [
        {
          entityId: 'NPC_001',
          socialChanges: [
            makeSocialEntry({
              targetId: 'NPC_003',
              type: 'rival',
              bond: -40,
            }),
          ],
        },
      ],
    });

    commitOutcome(ws, outcome);

    const state = ws.socialStates!['NPC_001'];
    // 原有关系仍在
    expect(state!['NPC_002']).toBeDefined();
    expect(state!['NPC_002']!.type).toBe('friend');
    expect(state!['NPC_002']!.events).toContain('旧交情');
    // 新关系追加
    expect(state!['NPC_003']).toBeDefined();
    expect(state!['NPC_003']!.type).toBe('rival');
    expect(state!['NPC_003']!.bond).toBe(-40);
  });

  it('facts 追加：facts 加入 worldState.facts（含已有事实）', () => {
    const existingFact = makeFact({ factId: 'FACT_OLD', title: '旧事实' });
    const ws = makeWorldState({
      facts: [existingFact],
    });
    const newFact1 = makeFact({ factId: 'FACT_NEW_1', title: '新事实1' });
    const newFact2 = makeFact({ factId: 'FACT_NEW_2', title: '新事实2' });
    const outcome = makeOutcome({
      facts: [newFact1, newFact2],
    });

    commitOutcome(ws, outcome);

    expect(ws.facts).toHaveLength(3);
    expect(ws.facts!.map(f => f.factId)).toEqual([
      'FACT_OLD',
      'FACT_NEW_1',
      'FACT_NEW_2',
    ]);
  });

  it('跨实体校验失败时不留下前半段灵石或事实写入', () => {
    const npc = makeNpc({ spiritStones: 100 });
    const ws = makeWorldState({ npcs: { NPC_001: npc }, facts: [] });
    const outcome = makeOutcome({
      entityDeltas: [
        { entityId: 'NPC_001', spiritStonesDelta: 50, consumedAssetIds: ['missing_asset'] },
      ],
      facts: [makeFact()],
    });

    expect(commitOutcome(ws, outcome)).toMatchObject({
      status: 'validation_failed', reason: 'consumed_asset_missing:missing_asset',
    });
    expect(npc.spiritStones).toBe(100);
    expect(ws.facts).toEqual([]);
    expect(ws.worldRevision).toBe(0);
  });
});
