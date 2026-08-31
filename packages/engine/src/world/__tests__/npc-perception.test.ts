import { describe, expect, it } from 'vitest';
import { createInitialBrainState, type Fact, type NpcRecord, type WorldState } from '@taosim/contracts';
import { buildNpcPerceptionSnapshot, updateNpcKnowledge } from '../npc-perception.js';

function npc(id: string, locationId: string): NpcRecord {
  return {
    id, name: id, gender: 'Male', personalityId: 'cautious', origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false }, realm: 'QiRefinement_1',
    soulState: 'Active', cultivation: { currentExp: 10, maxExp: 100 }, locationId,
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 20, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    aspiration: 'wander', relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
  };
}

function fact(overrides: Partial<Fact>): Fact {
  return {
    factId: 'fact_public', type: 'discovery', at: { year: 1, month: 1 }, participants: [],
    title: '远方异象', description: '有人见到异象', visibility: 'public', ...overrides,
  };
}

describe('NPC perception and knowledge', () => {
  it('只观察同场所 NPC、同节点公共地点和允许传播的事实', () => {
    const observer = npc('observer', 'VENUE_TIANJI_TAVERN');
    const nearby = npc('nearby', 'VENUE_TIANJI_TAVERN');
    const remote = npc('remote', 'VENUE_QINGYUN_HALL');
    const world = {
      currentYear: 1, currentMonth: 2, catastropheCountdownMonths: 600,
      activeContinentIds: [], globalFlags: {}, npcs: { observer, nearby, remote }, eventLog: [],
      facts: [
        fact({}),
        fact({ factId: 'fact_secret', visibility: 'secret', title: '密谋' }),
      ],
    } satisfies WorldState;

    const snapshot = buildNpcPerceptionSnapshot(observer, world, { year: 1, month: 2 });

    expect(snapshot.knownLocationIds).toContain('VENUE_TIANJI_SHOP');
    expect(snapshot.observations).toContainEqual(expect.objectContaining({
      topic: 'location', subject: { kind: 'npc', entityId: 'nearby' },
    }));
    expect(snapshot.observations.some((entry) => entry.subject.entityId === 'remote')).toBe(false);
    expect(snapshot.observations.some((entry) => entry.subject.entityId === 'fact_public')).toBe(true);
    expect(snapshot.observations.some((entry) => entry.subject.entityId === 'fact_secret')).toBe(false);
  });

  it('传闻会形成较低置信信念并在到期后转为存疑，而非被当成世界真相', () => {
    const record = npc('observer', 'VENUE_TIANJI_TAVERN');
    const brain = createInitialBrainState({
      npcId: record.id, personalityId: record.personalityId, aspiration: record.aspiration,
      birthYear: 1, birthMonth: 1,
    }, { year: 1, month: 1 });
    const learned = updateNpcKnowledge(brain, [{
      messageId: 'rumor_1', topic: 'fact', subject: { kind: 'fact', entityId: 'fact_1' },
      value: '秘境将开', source: { type: 'hearsay', factId: 'fact_1' },
      observedAt: { year: 1, month: 2 }, confidence: 0.6, expiresAt: { year: 1, month: 3 },
    }], { year: 1, month: 2 });
    const aged = updateNpcKnowledge(learned.brain, [], { year: 1, month: 3 });

    expect(learned.brain.beliefs['belief:fact:fact:fact_1']).toMatchObject({
      confidence: 0.6, status: 'active', source: { type: 'hearsay', factId: 'fact_1' },
    });
    expect(aged.brain.beliefs['belief:fact:fact:fact_1']?.status).toBe('questioned');
  });
});
