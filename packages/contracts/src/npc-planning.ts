import type { BrainEntityRef, BrainTime } from './npc-brain.js';

/** 单次感知结果只在本月调度中存在，不进入存档。 */
export interface NpcPerceptionSnapshot {
  observerId: string;
  at: BrainTime;
  locationId?: string;
  knownLocationIds: string[];
  observations: NpcKnowledgeMessage[];
}

/** 观察或传播中的知识载体；只有经过认知更新后才成为持久化 Belief。 */
export interface NpcKnowledgeMessage {
  messageId: string;
  topic: 'location' | 'relation' | 'possession' | 'intent' | 'threat' | 'identity' | 'fact' | 'custom';
  subject: BrainEntityRef;
  value: string | number | boolean;
  source: {
    type: 'observation' | 'hearsay';
    sourceEntityId?: string;
    factId?: string;
  };
  observedAt: BrainTime;
  confidence: number;
  expiresAt?: BrainTime;
}

export type ReservedResourceKind = 'action_slot' | 'spirit_stones' | 'asset';

export interface ReservedResourceRef {
  kind: ReservedResourceKind;
  /** action_slot/asset 必填；灵石按 ownerId 聚合，无需 resourceId。 */
  resourceId?: string;
  amount: number;
}

/** 世界级预留是计划与真实资源之间的唯一锁；不能只存在于 Brain 的引用数组中。 */
export interface WorldResourceReservation {
  reservationId: string;
  ownerId: string;
  planId: string;
  resource: ReservedResourceRef;
  status: 'active' | 'consumed' | 'released' | 'expired';
  createdAt: BrainTime;
  expiresAt: BrainTime;
  completedAt?: BrainTime;
  failureReason?: string;
}

export interface ResourceReservationRequest {
  reservationId: string;
  ownerId: string;
  planId: string;
  resource: ReservedResourceRef;
  expiresAt: BrainTime;
}

/** 唯一资产的世界级挂牌；挂牌状态与资产本体分离，便于取消、成交与审计。 */
export interface WorldAssetListing {
  listingId: string;
  assetId: string;
  sellerId: string;
  venueId: string;
  priceSpiritStones: number;
  status: 'active' | 'sold' | 'cancelled';
  listedAt: BrainTime;
  completedAt?: BrainTime;
  buyerId?: string;
  transactionFactId?: string;
}
