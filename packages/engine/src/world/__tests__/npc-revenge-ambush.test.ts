import { describe, expect, it } from 'vitest';
import { createInitialBrainState, type BrainTime, type NpcRecord, type WorldState } from '@taosim/contracts';
import { advanceNpcRevengeAmbush } from '../npc-revenge-ambush.js';
import { assessAmbushEnvironment } from '../npc-ambush-environment.js';
import { WorldEngine } from '../world-engine.js';

const START: BrainTime = { year: 3, month: 1 };

function npc(
  id: string,
  locationId: string,
  aspiration: NpcRecord['aspiration'] = 'seekDao',
  physique = 10,
): NpcRecord {
  const record = {
    id, name: id, gender: 'Male', personalityId: id === 'attacker' ? 'vengeful' : 'cautious',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1', soulState: 'Active', cultivation: { currentExp: 10, maxExp: 100 },
    locationId, spiritStones: id === 'attacker' ? 200 : 20,
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    attributes: { physique, comprehension: physique, perception: 20, agility: physique, luck: 10, charm: 10 },
    lifespan: { age: 20, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    aspiration, relations: {}, biography: { milestones: [], summary: '' }, lastUpdate: { year: 2, month: 12 },
  } as NpcRecord;
  record.brain = createInitialBrainState({
    npcId: id, personalityId: record.personalityId, aspiration,
    birthYear: record.birthYear, birthMonth: record.birthMonth,
  }, START);
  return record;
}

function scenario(): WorldState {
  const attacker = npc('attacker', 'tavern', 'seekRevenge', 80);
  const seller = npc('seller', 'tavern');
  const target = npc('target', 'mountain', 'seekDao', 2);
  attacker.relations.target = {
    type: 'enemy', bond: -90, trust: 0,
    events: ['家仇'], changedAt: { year: 2, month: 1 },
  };
  seller.brain!.beliefs['seller:target-location'] = {
    beliefId: 'seller:target-location', topic: 'location', subject: { kind: 'npc', entityId: 'target' },
    value: 'mountain', source: { type: 'observation' }, observedAt: { year: 2, month: 12 },
    confidence: 0.9, status: 'active', expiresAt: { year: 3, month: 8 },
  };
  return {
    currentYear: 3, currentMonth: 1, catastropheCountdownMonths: 600,
    activeContinentIds: [], globalFlags: {}, npcs: { attacker, seller, target }, eventLog: [], facts: [],
    worldRevision: 0,
    assets: {
      poison_blade: {
        assetId: 'poison_blade', templateId: 'poison_blade', name: '迟滞毒刃', rarity: 'rare',
        ownerId: 'seller', origin: { source: 'loot', at: { year: 2, month: 1 } },
        combatBonuses: { attack: 18, critRate: 5 }, element: 'Dark',
      },
    },
    assetListings: {
      poison_blade_listing: {
        listingId: 'poison_blade_listing', assetId: 'poison_blade', sellerId: 'seller', venueId: 'tavern',
        priceSpiritStones: 60, status: 'active', listedAt: START,
      },
    },
  };
}

function month(index: number): BrainTime {
  return { year: 3, month: index };
}

describe('NPC revenge ambush vertical slice', () => {
  it('从地点情报交易、购买准备、追踪核验走到真实伏击战斗与世界回写', () => {
    const state = scenario();
    const options = { rng: () => 0.99 };

    expect(advanceNpcRevengeAmbush(state, 'attacker', month(1), options)).toMatchObject({
      status: 'progressed', stage: 'investigate_target', claimedAction: true,
    });
    expect(state.npcs.attacker!.brain!.beliefs['belief:location:npc:target']).toMatchObject({
      value: 'mountain', source: { type: 'hearsay', sourceEntityId: 'seller' },
    });

    expect(advanceNpcRevengeAmbush(state, 'attacker', month(2), options)).toMatchObject({
      status: 'progressed', stage: 'acquire_ambush_asset', claimedAction: true,
    });
    expect(state.assets!.poison_blade!.ownerId).toBe('attacker');

    expect(advanceNpcRevengeAmbush(state, 'attacker', month(3), options)).toMatchObject({
      status: 'progressed', stage: 'travel_to_target', claimedAction: true,
    });
    expect(state.npcs.attacker!.locationId).toBe('mountain');

    expect(advanceNpcRevengeAmbush(state, 'attacker', month(4), options)).toMatchObject({
      status: 'progressed', stage: 'verify_target_presence', claimedAction: true,
    });

    const battle = advanceNpcRevengeAmbush(state, 'attacker', month(5), options);
    expect(battle).toMatchObject({ status: 'battle_resolved', stage: 'execute_ambush', claimedAction: true });
    expect(state.facts).toContainEqual(expect.objectContaining({
      type: 'battle', metadata: expect.objectContaining({ approach: 'ambush', ambushDetected: false }),
    }));
    expect(state.npcs.attacker!.brain!.currentPlan).toMatchObject({ status: 'completed' });
    expect(state.npcs.attacker!.brain!.memories).toContainEqual(expect.objectContaining({
      factId: expect.stringContaining('fact:battle:'),
    }));
  });

  it('旧行踪扑空只反驳原信念并重新调查，不泄露目标新地点', () => {
    const state = scenario();
    const options = { rng: () => 0.99 };
    advanceNpcRevengeAmbush(state, 'attacker', month(1), options);
    advanceNpcRevengeAmbush(state, 'attacker', month(2), options);
    advanceNpcRevengeAmbush(state, 'attacker', month(3), options);
    state.npcs.target!.locationId = 'hidden_cave';

    const failed = advanceNpcRevengeAmbush(state, 'attacker', month(4), options);

    expect(failed).toMatchObject({ status: 'failed', reason: 'target_not_at_believed_location' });
    expect(state.npcs.attacker!.brain!.beliefs['belief:location:npc:target']).toMatchObject({
      value: 'mountain', status: 'refuted',
    });
    expect(JSON.stringify(state.npcs.attacker!.brain)).not.toContain('hidden_cave');
    expect(state.npcs.attacker!.brain!.currentPlan).toMatchObject({ status: 'active', currentStepIndex: 0 });
  });

  it('关闭偷袭节点后保留复仇动机，但不创建或推进伏击计划', () => {
    const state = scenario();
    const beforeGoal = structuredClone(state.npcs.attacker!.brain!.currentGoal);

    expect(advanceNpcRevengeAmbush(state, 'attacker', month(1), { rng: () => 0.99, enabled: false }))
      .toMatchObject({ status: 'not_applicable', reason: 'node_disabled', claimedAction: false });
    expect(state.npcs.attacker!.brain!.currentGoal).toEqual(beforeGoal);
    expect(state.npcs.attacker!.brain!.currentPlan).toBeUndefined();
  });

  it('生产世界月循环会逐月推进整条链，不再走旧的跨地点概率寻仇', () => {
    const engine = new WorldEngine(scenario(), {
      rng: () => 0.99,
      encounterRng: () => 0.99,
      npcBrainV2Mode: 'single-write',
    });

    for (let index = 0; index < 5; index++) engine.step();
    const state = engine.getState();

    expect(state.facts).toContainEqual(expect.objectContaining({
      type: 'battle', metadata: expect.objectContaining({ approach: 'ambush' }),
    }));
    expect(state.eventLog).toContainEqual(expect.objectContaining({ templateKey: expect.stringContaining('combat.ambush') }));
    expect(state.globalFlags['diagnostics.revengeAmbush.execute_ambush.battle_resolved']).toBe(1);
  });

  it('受管辖地点的真实在场守卫会阻止袭击，并让目击者形成事实与记忆', () => {
    const state = scenario();
    const protectedVenue = 'VENUE_TIANJI_TAVERN';
    state.npcs.target!.locationId = protectedVenue;
    state.npcs.seller!.brain!.beliefs['seller:target-location']!.value = protectedVenue;
    const guard = npc('guard', protectedVenue, 'seekFame', 40);
    guard.socialRank = 'elder';
    state.npcs.guard = guard;
    const options = { rng: () => 0.99 };

    for (let index = 1; index <= 4; index++) {
      advanceNpcRevengeAmbush(state, 'attacker', month(index), options);
    }
    const blocked = advanceNpcRevengeAmbush(state, 'attacker', month(5), options);

    expect(blocked).toMatchObject({
      status: 'blocked', reason: 'guard_intervention', claimedAction: true,
      guardIds: ['guard'], lawLevel: 'strict',
    });
    expect(state.facts).toContainEqual(expect.objectContaining({
      title: expect.stringContaining('守卫制止'),
      participants: expect.arrayContaining([expect.objectContaining({ entityId: 'guard', role: 'guard' })]),
    }));
    expect(state.facts?.some((fact) => fact.type === 'battle')).toBe(false);
    expect(state.npcs.guard!.brain!.memories).toContainEqual(expect.objectContaining({
      participantIds: expect.arrayContaining(['attacker', 'target']),
    }));
  });

  it('有执法身份也不会固定介入：个人关系经历可以压过身份倾向', () => {
    const state = scenario();
    const protectedVenue = 'VENUE_TIANJI_TAVERN';
    state.npcs.attacker!.locationId = protectedVenue;
    state.npcs.target!.locationId = protectedVenue;
    const conflictedGuard = npc('guard', protectedVenue, 'seekFame', 40);
    conflictedGuard.socialRank = 'elder';
    conflictedGuard.relations.attacker = {
      type: 'benefactor', bond: 100, trust: 100, events: ['救命之恩'], changedAt: { year: 2, month: 1 },
    };
    conflictedGuard.relations.target = {
      type: 'enemy', bond: -100, trust: 0, events: ['灭族旧恨'], changedAt: { year: 2, month: 1 },
    };
    state.npcs.guard = conflictedGuard;

    expect(assessAmbushEnvironment(state, 'attacker', 'target', protectedVenue)).toMatchObject({
      lawLevel: 'strict', witnessIds: ['guard'], guardIds: [], intervention: 'none',
    });
  });

  it('无人制止时，战斗、目击事实、记忆和威胁认知在同一 outcome 中提交', () => {
    const state = scenario();
    state.npcs.witness = npc('witness', 'mountain');
    const options = { rng: () => 0.99 };
    for (let index = 1; index <= 4; index++) {
      advanceNpcRevengeAmbush(state, 'attacker', month(index), options);
    }
    const revisionBeforeBattle = state.worldRevision ?? 0;

    expect(advanceNpcRevengeAmbush(state, 'attacker', month(5), options)).toMatchObject({
      status: 'battle_resolved', witnessIds: ['witness'], lawLevel: 'none',
    });
    expect(state.worldRevision).toBe(revisionBeforeBattle + 1);
    expect(state.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'battle' }),
      expect.objectContaining({ title: expect.stringContaining('被人目睹') }),
    ]));
    expect(state.npcs.witness!.brain!.memories).toContainEqual(expect.objectContaining({
      factId: expect.stringContaining('witnessed-crime'),
    }));
    expect(state.npcs.witness!.brain!.beliefs['witness:belief:threat:attacker']).toMatchObject({
      value: 'committed_ambush', confidence: 1,
    });
  });
});
