import type { BrainTime, Fact, WorldState } from '@taosim/contracts';
import {
  completeWorldResourceReservations,
  reserveWorldResources,
  type ReservationFailureReason,
} from './world-resource-reservation.js';

export type NpcAssetPurchaseFailureReason =
  | ReservationFailureReason
  | 'invalid_purchase'
  | 'listing_not_found'
  | 'listing_not_active'
  | 'asset_not_found'
  | 'seller_no_longer_owns_asset'
  | 'buyer_or_seller_not_found'
  | 'buyer_or_seller_inactive'
  | 'buyer_not_at_listing_venue'
  | 'transaction_state_conflict';

export type NpcAssetPurchaseResult =
  | { status: 'completed' | 'already_completed'; factId: string; reservationIds: string[] }
  | { status: 'failed'; reason: NpcAssetPurchaseFailureReason };

export interface NpcAssetPurchaseRequest {
  transactionId: string;
  buyerId: string;
  listingId: string;
}

function nextMonth(now: BrainTime): BrainTime {
  return now.month === 12 ? { year: now.year + 1, month: 1 } : { year: now.year, month: now.month + 1 };
}

function transactionFactId(transactionId: string): string {
  return `fact:transaction:${transactionId}`;
}

function purchaseFact(
  request: NpcAssetPurchaseRequest,
  sellerId: string,
  assetId: string,
  assetName: string,
  price: number,
  venueId: string,
  now: BrainTime,
): Fact {
  return {
    factId: transactionFactId(request.transactionId),
    outcomeId: request.transactionId,
    type: 'transaction', at: { ...now }, locationId: venueId,
    participants: [
      { entityId: request.buyerId, role: 'buyer' },
      { entityId: sellerId, role: 'seller' },
      { entityId: assetId, role: 'asset' },
    ],
    title: `易主：${assetName}`,
    description: `${assetName}以 ${price} 灵石成交。`,
    visibility: 'local',
    metadata: { assetId, listingId: request.listingId, priceSpiritStones: price },
  };
}

/** 唯一资产的竞争购买：挂牌、所有权、双方灵石与成交事实在同一个同步事务中结算。 */
export function purchaseNpcAsset(
  world: WorldState,
  request: Readonly<NpcAssetPurchaseRequest>,
  now: BrainTime,
): NpcAssetPurchaseResult {
  const completedFactId = transactionFactId(request.transactionId);
  if (world.facts?.some((fact) => fact.factId === completedFactId || fact.outcomeId === request.transactionId)) {
    return { status: 'already_completed', factId: completedFactId, reservationIds: [] };
  }
  if (!request.transactionId || !request.buyerId || !request.listingId) {
    return { status: 'failed', reason: 'invalid_purchase' };
  }
  const listing = world.assetListings?.[request.listingId];
  if (!listing) return { status: 'failed', reason: 'listing_not_found' };
  if (listing.status !== 'active') return { status: 'failed', reason: 'listing_not_active' };
  const asset = world.assets?.[listing.assetId];
  if (!asset) return { status: 'failed', reason: 'asset_not_found' };
  if (asset.ownerId !== listing.sellerId) return { status: 'failed', reason: 'seller_no_longer_owns_asset' };
  const buyer = world.npcs[request.buyerId];
  const seller = world.npcs[listing.sellerId];
  if (!buyer || !seller) return { status: 'failed', reason: 'buyer_or_seller_not_found' };
  if (buyer.id === seller.id || !Number.isFinite(listing.priceSpiritStones) || listing.priceSpiritStones <= 0) {
    return { status: 'failed', reason: 'invalid_purchase' };
  }
  if (buyer.soulState !== 'Active' || seller.soulState !== 'Active') {
    return { status: 'failed', reason: 'buyer_or_seller_inactive' };
  }
  if (buyer.locationId !== listing.venueId || seller.locationId !== listing.venueId) {
    return { status: 'failed', reason: 'buyer_not_at_listing_venue' };
  }

  const reservationIds = [
    `${request.transactionId}:action`, `${request.transactionId}:stones`, `${request.transactionId}:asset`,
  ];
  if (reservationIds.some((id) => {
    const existing = world.resourceReservations?.[id];
    return existing && existing.status !== 'active';
  })) {
    return { status: 'failed', reason: 'transaction_state_conflict' };
  }
  const expiresAt = nextMonth(now);
  const reserved = reserveWorldResources(world, [
    {
      reservationId: reservationIds[0]!, ownerId: buyer.id, planId: request.transactionId,
      resource: { kind: 'action_slot', resourceId: `${buyer.id}:${now.year}:${now.month}`, amount: 1 }, expiresAt,
    },
    {
      reservationId: reservationIds[1]!, ownerId: buyer.id, planId: request.transactionId,
      resource: { kind: 'spirit_stones', amount: listing.priceSpiritStones }, expiresAt,
    },
    {
      reservationId: reservationIds[2]!, ownerId: buyer.id, planId: request.transactionId,
      resource: { kind: 'asset', resourceId: asset.assetId, amount: 1 }, expiresAt,
    },
  ], now);
  if (reserved.status === 'failed') return { status: 'failed', reason: reserved.reason };
  buyer.spiritStones = (buyer.spiritStones ?? 0) - listing.priceSpiritStones;
  seller.spiritStones = (seller.spiritStones ?? 0) + listing.priceSpiritStones;
  asset.ownerId = buyer.id;
  listing.status = 'sold';
  listing.completedAt = { ...now };
  listing.buyerId = buyer.id;
  listing.transactionFactId = completedFactId;
  world.facts ??= [];
  world.facts.push(purchaseFact(
    request, seller.id, asset.assetId, asset.name, listing.priceSpiritStones, listing.venueId, now,
  ));
  completeWorldResourceReservations(world, reservationIds, 'consumed', now);
  return { status: 'completed', factId: completedFactId, reservationIds };
}
