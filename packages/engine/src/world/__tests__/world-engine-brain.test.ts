import { describe, expect, it } from 'vitest';
import type { NpcRecord, WorldState } from '@taosim/contracts';
import { WorldEngine } from '../world-engine.js';

describe('WorldEngine NB1 Brain hydration', () => {
  it('加载旧 NPC 时确定性补 Brain，且不改写旧 Mind 行为状态', () => {
    const record = {
      id: 'npc_legacy',
      name: '旧世修士',
      personalityId: 'cautious',
      aspiration: 'seekDao',
      birthYear: 1,
      birthMonth: 1,
      mind: {
        currentGoal: { type: 'cultivate_to_breakthrough' },
        needs: { longevity: 10, social: 20, dao: 80, fame: 5, safety: 30 },
        nextAction: { type: 'cultivate' },
        actionStatus: 'planned',
      },
    } as NpcRecord;
    const state = {
      currentYear: 8,
      currentMonth: 6,
      catastropheCountdownMonths: 100,
      activeContinentIds: [],
      globalFlags: {},
      npcs: { [record.id]: record },
      eventLog: [],
    } as WorldState;
    const originalMind = JSON.stringify(record.mind);

    const first = new WorldEngine(state).getState().npcs.npc_legacy!;
    const second = new WorldEngine(state).getState().npcs.npc_legacy!;

    expect(first.brain).toEqual(second.brain);
    expect(first.brain?.currentGoal?.kind).toBe('cultivate_to_breakthrough');
    expect(JSON.stringify(first.mind)).toBe(originalMind);
  });
});
