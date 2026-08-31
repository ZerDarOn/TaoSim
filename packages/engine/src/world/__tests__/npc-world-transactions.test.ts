import { describe, expect, it } from 'vitest';
import {
  createInitialBrainState,
  type BrainTime,
  type Fact,
  type NpcRecord,
  type WorldState,
} from '@taosim/contracts';
import { purchaseNpcAsset } from '../npc-asset-purchase.js';
import { tradeNpcInformation } from '../npc-information-trade.js';
import { prepareNpcTargetTracking, resolveNpcTargetSearchAtLocation } from '../npc-target-tracking.js';

const NOW: BrainTime = { year: 2, month: 3 };

function npc(id: string, locationId: string, stones = 100): NpcRecord {
  const record = {
    id, name: id, gender: 'Male', personalityId: 'cautious', origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false }, realm: 'QiRefinement_1',
    soulState: 'Active', cultivation: { currentExp: 10, maxExp: 100 }, locationId, spiritStones: stones,
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    lifespan: { age: 20, maxLifespan: 100 }, skillIds: [], birthYear: 1, birthMonth: 1,
    aspiration: 'wander', relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 2, month: 2 },
  } as NpcRecord;
  record.brain = createInitialBrainState({
    npcId: id, personalityId: record.personalityId, aspiration: record.aspiration,
    birthYear: record.birthYear, birthMonth: record.birthMonth,
  }, NOW);
  return record;
}

function knownFact(): Fact {
  return {
    factId: 'fact_secret_cache', type: 'discovery', at: { year: 2, month: 1 },
    locationId: 'VENUE_TIANJI_TAVERN', participants: [{ entityId: 'seller', role: 'witness' }],
    title: '发现密藏', description: '城外似有前人密藏。', visibility: 'secret',
  };
}

function world(): WorldState {
  const buyer = npc('buyer', 'VENUE_TIANJI_TAVERN', 100);
  const seller = npc('seller', 'VENUE_TIANJI_TAVERN', 10);
  seller.brain!.beliefs['seller:belief:cache'] = {
    beliefId: 'seller:belief:cache', topic: 'fact', subject: { kind: 'fact', entityId: 'fact_secret_cache' },
    value: true, source: { type: 'observation', factId: 'fact_secret_cache' }, observedAt: { year: 2, month: 1 },
    confidence: 0.9, status: 'active',
  };
  return {
    currentYear: 2, currentMonth: 3, catastropheCountdownMonths: 600,
    activeContinentIds: [], globalFlags: {}, npcs: { buyer, seller }, eventLog: [], facts: [knownFact()],
  };
}

describe('NPC world transactions', () => {
  it('情报交易守恒灵石、只传播信念引用，并且重复请求不会二次扣款', () => {
    const state = world();
    const request = {
      transactionId: 'trade_info_1', buyerId: 'buyer', sellerId: 'seller',
      factId: 'fact_secret_cache', priceSpiritStones: 30,
    };

    expect(tradeNpcInformation(state, request, NOW).status).toBe('completed');
    expect(state.npcs.buyer!.spiritStones).toBe(70);
    expect(state.npcs.seller!.spiritStones).toBe(40);
    expect(state.npcs.buyer!.brain!.beliefs['belief:fact:fact:fact_secret_cache']).toMatchObject({
      value: true,
      source: { type: 'hearsay', sourceEntityId: 'seller', factId: 'fact_secret_cache' },
    });
    expect(tradeNpcInformation(state, request, NOW).status).toBe('already_completed');
    expect(state.npcs.buyer!.spiritStones).toBe(70);
    expect(state.facts?.filter((fact) => fact.outcomeId === 'trade_info_1')).toHaveLength(1);
  });

  it('情报购买资源不足时不产生部分写入', () => {
    const state = world();
    state.npcs.buyer!.spiritStones = 5;
    const beforeFacts = state.facts?.length;

    const result = tradeNpcInformation(state, {
      transactionId: 'trade_info_expensive', buyerId: 'buyer', sellerId: 'seller',
      factId: 'fact_secret_cache', priceSpiritStones: 30,
    }, NOW);

    expect(result).toMatchObject({ status: 'failed', reason: 'resource_unavailable' });
    expect(state.npcs.buyer!.spiritStones).toBe(5);
    expect(state.npcs.seller!.spiritStones).toBe(10);
    expect(state.facts).toHaveLength(beforeFacts!);
    expect(state.resourceReservations).toBeUndefined();
  });

  it('唯一资产只允许一个买家成交，所有权、灵石与挂牌同时结算', () => {
    const state = world();
    state.npcs.rival = npc('rival', 'VENUE_TIANJI_TAVERN', 100);
    state.assets = {
      sword: {
        assetId: 'sword', templateId: 'sword', name: '孤鸿剑', rarity: 'rare', ownerId: 'seller',
        origin: { source: 'loot', at: { year: 1, month: 1 } }, combatBonuses: { attack: 8 },
      },
    };
    state.assetListings = {
      listing_sword: {
        listingId: 'listing_sword', assetId: 'sword', sellerId: 'seller',
        venueId: 'VENUE_TIANJI_TAVERN', priceSpiritStones: 60, status: 'active', listedAt: NOW,
      },
    };

    expect(purchaseNpcAsset(state, {
      transactionId: 'buy_sword_1', buyerId: 'buyer', listingId: 'listing_sword',
    }, NOW).status).toBe('completed');
    expect(state.assets.sword!.ownerId).toBe('buyer');
    expect(state.assetListings.listing_sword).toMatchObject({ status: 'sold', buyerId: 'buyer' });
    expect(state.npcs.buyer!.spiritStones).toBe(40);
    expect(state.npcs.seller!.spiritStones).toBe(70);

    expect(purchaseNpcAsset(state, {
      transactionId: 'buy_sword_2', buyerId: 'rival', listingId: 'listing_sword',
    }, NOW)).toMatchObject({ status: 'failed', reason: 'listing_not_active' });
    expect(state.npcs.rival!.spiritStones).toBe(100);
  });
});

describe('NPC target tracking', () => {
  function trackingWorld(actualTargetLocation: string): WorldState {
    const tracker = npc('tracker', 'VENUE_TIANJI_TAVERN');
    const target = npc('target', actualTargetLocation);
    tracker.brain!.beliefs['belief:location:npc:target'] = {
      beliefId: 'belief:location:npc:target', topic: 'location', subject: { kind: 'npc', entityId: 'target' },
      value: 'VENUE_TIANJI_SHOP', source: { type: 'hearsay', sourceEntityId: 'seller' },
      observedAt: { year: 2, month: 2 }, expiresAt: { year: 2, month: 6 }, confidence: 0.7, status: 'active',
    };
    return {
      currentYear: 2, currentMonth: 3, catastropheCountdownMonths: 600,
      activeContinentIds: [], globalFlags: {}, npcs: { tracker, target }, eventLog: [],
    };
  }

  it('依据信念制定计划，到场后找到目标并消费行动预留', () => {
    const state = trackingWorld('VENUE_TIANJI_SHOP');
    const prepared = prepareNpcTargetTracking(state, 'tracker', 'target', NOW);
    expect(prepared.status).toBe('prepared');
    if (prepared.status !== 'prepared') return;
    state.npcs.tracker!.brain = prepared.brain;
    state.npcs.tracker!.locationId = prepared.believedLocationId;

    expect(resolveNpcTargetSearchAtLocation(state, 'tracker', 'target', NOW)).toMatchObject({ status: 'found' });
    expect(Object.values(state.resourceReservations ?? {})).toEqual([
      expect.objectContaining({ status: 'consumed' }),
    ]);
  });

  it('过期位置情报导致扑空时反驳旧信念，但不泄露目标真实位置', () => {
    const state = trackingWorld('VENUE_QINGYUN_HALL');
    const prepared = prepareNpcTargetTracking(state, 'tracker', 'target', NOW);
    expect(prepared.status).toBe('prepared');
    if (prepared.status !== 'prepared') return;
    state.npcs.tracker!.brain = prepared.brain;
    state.npcs.tracker!.locationId = prepared.believedLocationId;

    const result = resolveNpcTargetSearchAtLocation(state, 'tracker', 'target', NOW);

    expect(result).toMatchObject({ status: 'failed', reason: 'target_not_at_believed_location' });
    const locationBeliefs = Object.values(state.npcs.tracker!.brain!.beliefs)
      .filter((belief) => belief.topic === 'location' && belief.subject.entityId === 'target');
    expect(locationBeliefs).toEqual([expect.objectContaining({ value: 'VENUE_TIANJI_SHOP', status: 'refuted' })]);
    expect(JSON.stringify(state.npcs.tracker!.brain)).not.toContain('VENUE_QINGYUN_HALL');
    expect(Object.values(state.resourceReservations ?? {})).toEqual([
      expect.objectContaining({ status: 'released', failureReason: 'target_not_at_believed_location' }),
    ]);
  });
});
