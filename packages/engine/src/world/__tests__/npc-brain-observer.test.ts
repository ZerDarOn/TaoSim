import { describe, expect, it } from 'vitest';
import { createInitialBrainState, type NpcRecord, type WorldState } from '@taosim/contracts';
import { inspectNpcBrain, setNpcBrainNodeEnabled } from '../npc-brain-inspector.js';
import { assignEcologicalNpcIdentity, deriveLegacyNpcIdentity, inheritNpcIdentity } from '../npc-identity.js';

function npc(id: string, relations: NpcRecord['relations'] = {}): NpcRecord {
  const record = {
    id, name: id, gender: 'Male', personalityId: 'cautious', aspiration: 'seekDao',
    origin: { type: '世家' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1', soulState: 'Active', cultivation: { currentExp: 20, maxExp: 100 },
    spiritRoot: { grade: 'Yellow', elements: ['Wood'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 20, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    relations, biography: { milestones: [], summary: '' }, lastUpdate: { year: 2, month: 12 },
  } as NpcRecord;
  record.identity = { ...deriveLegacyNpcIdentity(record), lineageIds: ['family:test'] };
  record.brain = createInitialBrainState({
    npcId: id, personalityId: record.personalityId, aspiration: record.aspiration,
    birthYear: record.birthYear, birthMonth: record.birthMonth, relations,
  }, { year: 3, month: 1 });
  return record;
}

function world(record: NpcRecord): WorldState {
  return {
    currentYear: 3, currentMonth: 1, catastropheCountdownMonths: 600,
    activeContinentIds: [], globalFlags: {}, npcs: { [record.id]: record }, eventLog: [],
  };
}

describe('NPC brain observer and identity node assembly', () => {
  it('逐 NPC 关闭节点后保留目标和记忆，并在观察器中解释抑制原因', () => {
    const record = npc('observer');
    const state = world(record);
    const goalBefore = structuredClone(record.brain!.currentGoal);
    const memoriesBefore = structuredClone(record.brain!.memories);

    setNpcBrainNodeEnabled(state, record.id, 'cultivate', false);
    const inspection = inspectNpcBrain(state, record.id)!;

    expect(record.brain!.currentGoal).toEqual(goalBefore);
    expect(record.brain!.memories).toEqual(memoriesBefore);
    expect(inspection.disabledNodeIds).toContain('cultivate');
    expect(inspection.decision.rejected).toContainEqual(expect.objectContaining({
      nodeId: 'cultivate', reasonCode: 'node_disabled', source: 'core',
    }));
  });

  it('相同人族与血脉装配会因个人关系经历得到不同结果，而非固定种族好恶', () => {
    const bonded = npc('bonded', {
      kin: { type: 'clan', bond: 80, trust: 70, events: ['共同患难'], changedAt: { year: 2, month: 1 } },
    });
    const estranged = npc('estranged');

    const bondedDecision = inspectNpcBrain(world(bonded), bonded.id)!.decision;
    const estrangedDecision = inspectNpcBrain(world(estranged), estranged.id)!.decision;

    expect(bondedDecision.candidates).toContainEqual(expect.objectContaining({
      nodeId: 'protect_kin', source: 'lineage',
    }));
    expect(estrangedDecision.rejected).toContainEqual(expect.objectContaining({
      nodeId: 'protect_kin', reasonCode: 'no_close_kin',
    }));
  });

  it('异族出生来自确定生态位，子嗣保留双方祖源而不继承固定仇恨', () => {
    const fox = npc('fox');
    const human = npc('human');
    const rolled = assignEcologicalNpcIdentity(fox, () => 0.01);
    fox.identity = rolled.profile;

    expect(rolled).toMatchObject({
      profile: { bodySpeciesId: 'fox-spirit', cultureIds: expect.arrayContaining(['east-wilderness']) },
      habitatLocationId: 'NODE_WILD_NORTH',
    });
    const foxDecision = inspectNpcBrain(world(fox), fox.id)!.decision;
    expect([...foxDecision.candidates, ...foxDecision.rejected]).toContainEqual(expect.objectContaining({
      nodeId: 'fox_spirit_roaming', source: 'species', sourceId: 'fox-spirit',
    }));
    const child = inheritNpcIdentity(fox, human, () => 0.1);
    expect(child.bodySpeciesId).toBe('fox-spirit');
    expect(child.lineageIds).toEqual(expect.arrayContaining([
      'lineage:qingqiu-diaspora', 'family:test', 'family:fox+human',
    ]));
    expect(JSON.stringify(child)).not.toContain('enemy');
  });
});
