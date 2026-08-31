import { describe, expect, it } from 'vitest';
import { createInitialBrainState, type NpcRecord, type WorldState } from '@taosim/contracts';
import { inspectWorldBrainInvariants } from '../npc-brain-invariants.js';

function npc(id: string): NpcRecord {
  return {
    id,
    name: id,
    personalityId: 'cautious',
    aspiration: 'seekDao',
    brain: createInitialBrainState({
      npcId: id,
      personalityId: 'cautious',
      aspiration: 'seekDao',
      birthYear: 1,
      birthMonth: 1,
    }, { year: 3, month: 2 }),
  } as NpcRecord;
}

function world(...npcs: NpcRecord[]): WorldState {
  return {
    currentYear: 3,
    currentMonth: 2,
    catastropheCountdownMonths: 100,
    activeContinentIds: [],
    globalFlags: {},
    npcs: Object.fromEntries(npcs.map((record) => [record.id, record])),
    eventLog: [],
  };
}

describe('inspectWorldBrainInvariants', () => {
  it('健康的 Brain、NPC、地点和资产引用不产生问题', () => {
    const owner = npc('owner');
    const friend = npc('friend');
    owner.locationId = 'venue_1';
    owner.brain!.currentGoal!.targets = [{ kind: 'npc', entityId: friend.id }];
    owner.brain!.beliefs.asset = {
      beliefId: 'asset',
      topic: 'possession',
      subject: { kind: 'asset', entityId: 'sword_1' },
      value: true,
      source: { type: 'observation' },
      observedAt: { year: 3, month: 2 },
      confidence: 0.8,
      status: 'active',
    };
    const state = world(owner, friend);
    state.assets = { sword_1: { id: 'sword_1' } as any };

    expect(inspectWorldBrainInvariants(state, { knownLocationIds: new Set(['venue_1']) })).toEqual([]);
  });

  it('报告悬空 NPC、地点、资产引用和越界认知值，但不修改世界', () => {
    const owner = npc('owner');
    owner.locationId = 'missing_venue';
    owner.brain!.currentGoal!.targets = [{ kind: 'npc', entityId: 'missing_npc' }];
    owner.brain!.beliefs.asset = {
      beliefId: 'asset',
      topic: 'possession',
      subject: { kind: 'asset', entityId: 'missing_asset' },
      value: true,
      source: { type: 'hearsay' },
      observedAt: { year: 3, month: 2 },
      confidence: 2,
      status: 'active',
    };
    owner.brain!.emotion.fear = -1;
    const state = world(owner);
    state.conditions = {
      ghost: { injuries: [], poisons: [], meridianDamage: 120 },
      owner: { injuries: [], poisons: [], meridianDamage: 101 },
    };
    const snapshot = JSON.stringify(state);

    const issues = inspectWorldBrainInvariants(state, { knownLocationIds: new Set(['venue_1']) });

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'DANGLING_LOCATION',
      'DANGLING_NPC_REF',
      'DANGLING_ASSET_REF',
      'BELIEF_CONFIDENCE_OUT_OF_RANGE',
      'EMOTION_OUT_OF_RANGE',
      'DANGLING_CONDITION_OWNER',
      'CONDITION_OUT_OF_RANGE',
    ]));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('缺少 Brain 会被明确报告而不是隐式补写', () => {
    const record = npc('owner');
    delete record.brain;

    expect(inspectWorldBrainInvariants(world(record)).map((issue) => issue.code))
      .toContain('MISSING_BRAIN');
  });

  it('未知 Brain 版本会被拒绝为不变量错误', () => {
    const record = npc('owner');
    (record.brain as any).schemaVersion = 999;

    expect(inspectWorldBrainInvariants(world(record)).map((issue) => issue.code))
      .toContain('BRAIN_SCHEMA_VERSION_UNSUPPORTED');
  });
});
