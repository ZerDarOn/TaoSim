import type {
  BrainBelief,
  BrainTime,
  Fact,
  NpcKnowledgeMessage,
  WorldState,
} from '@taosim/contracts';
import { updateNpcKnowledge } from './npc-perception.js';
import {
  completeWorldResourceReservations,
  reserveWorldResources,
  type ReservationFailureReason,
} from './world-resource-reservation.js';

export type NpcInformationTradeFailureReason =
  | ReservationFailureReason
  | 'invalid_trade'
  | 'buyer_or_seller_not_found'
  | 'buyer_or_seller_inactive'
  | 'not_co_located'
  | 'fact_not_found'
  | 'seller_does_not_believe_fact'
  | 'transaction_state_conflict';

export type NpcInformationTradeResult =
  | { status: 'completed' | 'already_completed'; factId: string; reservationIds: string[] }
  | { status: 'failed'; reason: NpcInformationTradeFailureReason };

export interface NpcInformationTradeRequest {
  transactionId: string;
  buyerId: string;
  sellerId: string;
  factId: string;
  priceSpiritStones: number;
}

function nextMonth(now: BrainTime): BrainTime {
  return now.month === 12 ? { year: now.year + 1, month: 1 } : { year: now.year, month: now.month + 1 };
}

function addMonths(now: BrainTime, months: number): BrainTime {
  const ordinal = (now.year - 1) * 12 + now.month - 1 + months;
  return { year: Math.floor(ordinal / 12) + 1, month: ordinal % 12 + 1 };
}

function transactionFactId(transactionId: string): string {
  return `fact:transaction:${transactionId}`;
}

function beliefForFact(beliefs: Record<string, BrainBelief>, factId: string): BrainBelief | undefined {
  return Object.values(beliefs).find((belief) => belief.status === 'active'
    && (belief.source.factId === factId
      || (belief.subject.kind === 'fact' && belief.subject.entityId === factId)));
}

function createTransactionFact(
  request: NpcInformationTradeRequest,
  now: BrainTime,
  locationId: string,
): Fact {
  return {
    factId: transactionFactId(request.transactionId),
    outcomeId: request.transactionId,
    type: 'transaction',
    at: { ...now },
    locationId,
    participants: [
      { entityId: request.buyerId, role: 'buyer' },
      { entityId: request.sellerId, role: 'seller' },
    ],
    title: '完成一笔情报交易',
    description: `双方以 ${request.priceSpiritStones} 灵石交易了一则情报。`,
    causedBy: [request.factId],
    visibility: 'secret',
    metadata: {
      tradedFactId: request.factId,
      priceSpiritStones: request.priceSpiritStones,
    },
  };
}

/**
 * NPC 间真实情报交易。情报是“对既有事实的信念”，交易不会把传闻升级成世界真相。
 * 所有验证和认知计算都先完成，再统一扣款、入账、写 Brain 与事实。
 */
export function tradeNpcInformation(
  world: WorldState,
  request: Readonly<NpcInformationTradeRequest>,
  now: BrainTime,
): NpcInformationTradeResult {
  const completedFactId = transactionFactId(request.transactionId);
  if (world.facts?.some((fact) => fact.factId === completedFactId || fact.outcomeId === request.transactionId)) {
    return { status: 'already_completed', factId: completedFactId, reservationIds: [] };
  }
  if (!request.transactionId || request.buyerId === request.sellerId
    || !Number.isFinite(request.priceSpiritStones) || request.priceSpiritStones <= 0) {
    return { status: 'failed', reason: 'invalid_trade' };
  }
  const buyer = world.npcs[request.buyerId];
  const seller = world.npcs[request.sellerId];
  if (!buyer || !seller) return { status: 'failed', reason: 'buyer_or_seller_not_found' };
  if (buyer.soulState !== 'Active' || seller.soulState !== 'Active') {
    return { status: 'failed', reason: 'buyer_or_seller_inactive' };
  }
  if (!buyer.locationId || buyer.locationId !== seller.locationId) {
    return { status: 'failed', reason: 'not_co_located' };
  }
  if (!world.facts?.some((fact) => fact.factId === request.factId)) {
    return { status: 'failed', reason: 'fact_not_found' };
  }
  const sellerBelief = seller.brain && beliefForFact(seller.brain.beliefs, request.factId);
  if (!sellerBelief || !buyer.brain) {
    return { status: 'failed', reason: 'seller_does_not_believe_fact' };
  }

  const message: NpcKnowledgeMessage = {
    messageId: `${request.transactionId}:information`,
    topic: 'fact',
    subject: { kind: 'fact', entityId: request.factId },
    value: true,
    source: { type: 'hearsay', sourceEntityId: seller.id, factId: request.factId },
    observedAt: { ...now },
    confidence: Math.max(0.3, Math.min(0.85, sellerBelief.confidence * 0.85)),
    expiresAt: addMonths(now, 12),
  };
  const nextBuyerBrain = updateNpcKnowledge(buyer.brain, [message], now).brain;
  const reservationIds = [
    `${request.transactionId}:action`,
    `${request.transactionId}:stones`,
  ];
  if (reservationIds.some((id) => {
    const existing = world.resourceReservations?.[id];
    return existing && existing.status !== 'active';
  })) {
    return { status: 'failed', reason: 'transaction_state_conflict' };
  }
  const reserved = reserveWorldResources(world, [
    {
      reservationId: reservationIds[0]!, ownerId: buyer.id, planId: request.transactionId,
      resource: { kind: 'action_slot', resourceId: `${buyer.id}:${now.year}:${now.month}`, amount: 1 },
      expiresAt: nextMonth(now),
    },
    {
      reservationId: reservationIds[1]!, ownerId: buyer.id, planId: request.transactionId,
      resource: { kind: 'spirit_stones', amount: request.priceSpiritStones }, expiresAt: nextMonth(now),
    },
  ], now);
  if (reserved.status === 'failed') return { status: 'failed', reason: reserved.reason };
  buyer.spiritStones = (buyer.spiritStones ?? 0) - request.priceSpiritStones;
  seller.spiritStones = (seller.spiritStones ?? 0) + request.priceSpiritStones;
  buyer.brain = nextBuyerBrain;
  world.facts ??= [];
  world.facts.push(createTransactionFact(request, now, buyer.locationId));
  completeWorldResourceReservations(world, reservationIds, 'consumed', now);
  return { status: 'completed', factId: completedFactId, reservationIds };
}
