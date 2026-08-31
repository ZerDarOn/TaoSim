import { describe, expect, it } from 'vitest';
import {
  NPC_BRAIN_SCHEMA_VERSION,
  createInitialBrainState,
  type BrainState,
} from '../npc-brain.js';

const now = { year: 12, month: 4 } as const;

describe('NPC Brain contract', () => {
  it('相同权威输入会得到完全一致的初始化结果', () => {
    const input = {
      npcId: 'npc_1',
      personalityId: 'cautious',
      aspiration: 'seekLongevity' as const,
      birthYear: 2,
      birthMonth: 7,
    };

    const first = createInitialBrainState(input, now);
    const second = createInitialBrainState(input, now);

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(NPC_BRAIN_SCHEMA_VERSION);
    expect(first.currentGoal?.kind).toBe('extend_lifespan');
    expect(first.profile.sourcePersonalityId).toBe('cautious');
  });

  it('从关系、生平和身体状态生成有界认知，不复制身体权威数值', () => {
    const brain = createInitialBrainState({
      npcId: 'npc_history',
      personalityId: 'cautious',
      aspiration: 'seekDao',
      birthYear: 1,
      birthMonth: 1,
      relations: {
        npc_friend: {
          type: 'friend', bond: 80, trust: 75, events: ['并肩作战'], changedAt: { year: 8, month: 2 },
        },
      },
      biography: {
        milestones: [{ eventId: 'fact_1', year: 7, month: 3, title: '逃出秘境', realm: 'QiRefinement_5' }],
        summary: '曾历险境',
      },
      condition: {
        injuries: [{ level: 'severe', source: '秘境旧伤', acquiredAt: { year: 7, month: 3 } }],
        poisons: [],
        meridianDamage: 20,
      },
    }, now);

    expect(brain.beliefs['npc_history:belief:relation:npc_friend']).toMatchObject({
      value: 'friend', confidence: 0.75,
    });
    expect(brain.memories[0]).toMatchObject({ factId: 'fact_1', summary: '逃出秘境' });
    expect(brain.emotion).toMatchObject({ fear: 33, stress: 65 });
    expect(brain).not.toHaveProperty('condition');
    expect(brain).not.toHaveProperty('injuries');
  });

  it('从旧 MindState 保留当前目标、目标对象和执行中的行动', () => {
    const brain = createInitialBrainState({
      npcId: 'npc_legacy',
      personalityId: 'vengeful',
      aspiration: 'seekRevenge',
      birthYear: 1,
      birthMonth: 1,
      legacyMind: {
        currentGoal: { type: 'seek_revenge', targetNpcId: 'npc_enemy' },
        needs: { longevity: 1, social: 2, dao: 3, fame: 4, safety: 5 },
        nextAction: { type: 'challenge', targetLocationId: 'arena_1' },
        goalStartedAt: { year: 10, month: 2 },
        actionPlannedAt: { year: 12, month: 3 },
        actionMonthsElapsed: 2,
        actionStatus: 'executing',
      },
    }, now);

    expect(brain.currentGoal).toMatchObject({
      kind: 'seek_revenge',
      status: 'active',
      createdAt: { year: 10, month: 2 },
      targets: [{ kind: 'npc', entityId: 'npc_enemy' }],
    });
    expect(brain.currentAction).toMatchObject({
      capabilityId: 'challenge',
      status: 'executing',
      targets: [{ kind: 'location', entityId: 'arena_1' }],
      progress: 0,
    });
  });

  it('Brain 可无损 JSON 往返保存错误信念、记忆和多步计划', () => {
    const brain = createInitialBrainState({
      npcId: 'npc_round_trip',
      personalityId: 'scholar',
      aspiration: 'seekDao',
      birthYear: 3,
      birthMonth: 8,
    }, now);
    brain.beliefs['belief_false'] = {
      beliefId: 'belief_false',
      topic: 'intent',
      subject: { kind: 'npc', entityId: 'npc_friend' },
      value: 'plans_betrayal',
      source: { type: 'hearsay', sourceEntityId: 'npc_liar' },
      observedAt: now,
      confidence: 0.72,
      status: 'active',
    };
    brain.memories.push({
      memoryId: 'memory_1',
      kind: 'rumor',
      at: now,
      participantIds: ['npc_friend', 'npc_liar'],
      summary: '听闻故友将要背叛自己',
      valence: -40,
      salience: 70,
    });
    brain.currentPlan = {
      planId: 'plan_1',
      goalId: brain.currentGoal!.goalId,
      status: 'active',
      currentStepIndex: 1,
      createdAt: now,
      updatedAt: now,
      revision: 2,
      steps: [
        { stepId: 'step_1', capabilityId: 'investigate', status: 'succeeded', targets: [], reservationIds: [] },
        { stepId: 'step_2', capabilityId: 'confront', status: 'pending', targets: [{ kind: 'npc', entityId: 'npc_friend' }], reservationIds: [] },
      ],
    };

    const restored = JSON.parse(JSON.stringify(brain)) as BrainState;

    expect(restored).toEqual(brain);
    expect(restored.beliefs.belief_false!.value).toBe('plans_betrayal');
    expect(restored.currentPlan?.steps).toHaveLength(2);
  });
});
