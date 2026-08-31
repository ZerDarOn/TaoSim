import { describe, expect, it } from 'vitest';
import { createInitialBrainState, type NpcRecord } from '@taosim/contracts';
import { commitNpcBrainAction } from '../npc-brain-action-commit.js';

function npc(): NpcRecord {
  return {
    id: 'npc_commit', name: '归一', gender: 'Male', personalityId: 'cautious',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 20, maxExp: 100 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 25, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    aspiration: 'seekDao', relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
  };
}

function brainFor(record: NpcRecord) {
  return createInitialBrainState({
    npcId: record.id, personalityId: record.personalityId, aspiration: record.aspiration,
    birthYear: record.birthYear, birthMonth: record.birthMonth,
  }, { year: 1, month: 1 });
}

describe('commitNpcBrainAction', () => {
  it('同一 NPC 同月只提交一次，重复调用不会重复获得修为', () => {
    const record = npc();
    const first = commitNpcBrainAction(record, brainFor(record), 'cultivate', 'cultivate_to_breakthrough', { year: 1, month: 2 }, { qi: 1 });
    const exp = record.cultivation.currentExp;
    const second = commitNpcBrainAction(record, first.brain, 'cultivate', 'cultivate_to_breakthrough', { year: 1, month: 2 }, { qi: 1 });

    expect(first.resolution?.completed).toBe(true);
    expect(first.brain.currentAction?.status).toBe('succeeded');
    expect(second.alreadyCommitted).toBe(true);
    expect(record.cultivation.currentExp).toBe(exp);
  });

  it('闭关由 Brain Action 保存三个月进度，只在第三个月结算一次', () => {
    const record = npc();
    let brain = brainFor(record);
    const initialExp = record.cultivation.currentExp;

    for (const month of [2, 3]) {
      const result = commitNpcBrainAction(record, brain, 'seclude', 'cultivate_to_breakthrough', { year: 1, month }, { qi: 1 });
      brain = result.brain;
      expect(result.resolution?.completed).toBe(false);
      expect(record.cultivation.currentExp).toBe(initialExp);
    }
    const result = commitNpcBrainAction(record, brain, 'seclude', 'cultivate_to_breakthrough', { year: 1, month: 4 }, { qi: 1 });

    expect(result.resolution?.completed).toBe(true);
    expect(result.brain.currentAction).toMatchObject({ status: 'succeeded', progress: 1 });
    expect(record.cultivation.currentExp).toBeGreaterThan(initialExp);
  });
});
