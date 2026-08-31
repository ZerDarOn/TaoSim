import type {
  BrainTime,
  ResourceReservationRequest,
  WorldResourceReservation,
  WorldState,
} from '@taosim/contracts';

export type ReservationFailureReason =
  | 'invalid_request'
  | 'reservation_id_conflict'
  | 'resource_unavailable'
  | 'owner_not_found'
  | 'owner_inactive';

export type ReserveWorldResourcesResult =
  | { status: 'reserved' | 'already_reserved'; reservationIds: string[] }
  | { status: 'failed'; reason: ReservationFailureReason; requestId?: string };

function ordinal(time: BrainTime): number {
  return (time.year - 1) * 12 + time.month;
}

export function expireWorldResourceReservations(world: WorldState, now: BrainTime): number {
  if (!world.resourceReservations || Object.keys(world.resourceReservations).length === 0) return 0;
  let expired = 0;
  for (const reservation of Object.values(world.resourceReservations ?? {})) {
    if (reservation.status === 'active' && ordinal(reservation.expiresAt) <= ordinal(now)) {
      reservation.status = 'expired';
      reservation.completedAt = { ...now };
      reservation.failureReason = 'reservation_expired';
      expired++;
    }
  }
  return expired;
}

/** 终态预留只保留审计窗口；仍被当前 Brain 引用的记录绝不裁剪。 */
export function pruneWorldResourceReservations(
  world: WorldState,
  now: BrainTime,
  retentionMonths = 24,
): number {
  if (!world.resourceReservations || Object.keys(world.resourceReservations).length === 0) return 0;
  const referenced = new Set<string>();
  for (const npc of [
    ...Object.values(world.npcs),
    ...Object.values(world.archivedNpcs ?? {}),
  ]) {
    for (const step of npc.brain?.currentPlan?.steps ?? []) {
      for (const reservationId of step.reservationIds) referenced.add(reservationId);
    }
    for (const reservationId of npc.brain?.currentAction?.reservationIds ?? []) {
      referenced.add(reservationId);
    }
  }
  let pruned = 0;
  for (const [reservationId, reservation] of Object.entries(world.resourceReservations)) {
    if (reservation.status === 'active' || referenced.has(reservationId) || !reservation.completedAt) continue;
    if (ordinal(now) - ordinal(reservation.completedAt) < retentionMonths) continue;
    delete world.resourceReservations![reservationId];
    pruned++;
  }
  return pruned;
}

function sameReservation(existing: WorldResourceReservation, request: ResourceReservationRequest): boolean {
  return existing.ownerId === request.ownerId
    && existing.planId === request.planId
    && existing.resource.kind === request.resource.kind
    && existing.resource.resourceId === request.resource.resourceId
    && existing.resource.amount === request.resource.amount;
}

/** 多资源预留先完整校验再统一写入，失败时不会留下半套锁。 */
export function reserveWorldResources(
  world: WorldState,
  requests: readonly ResourceReservationRequest[],
  now: BrainTime,
): ReserveWorldResourcesResult {
  expireWorldResourceReservations(world, now);
  if (requests.length === 0 || new Set(requests.map((entry) => entry.reservationId)).size !== requests.length) {
    return { status: 'failed', reason: 'invalid_request' };
  }
  const ledger = world.resourceReservations ?? {};
  const active = Object.values(ledger).filter((entry) => entry.status === 'active');

  for (const request of requests) {
    if (!request.reservationId || !request.ownerId || !request.planId
      || !['action_slot', 'spirit_stones', 'asset'].includes(request.resource.kind)
      || !Number.isFinite(request.resource.amount)
      || request.resource.amount <= 0
      || ordinal(request.expiresAt) <= ordinal(now)
      || (request.resource.kind !== 'spirit_stones' && request.resource.amount !== 1)) {
      return { status: 'failed', reason: 'invalid_request', requestId: request.reservationId };
    }
    const existing = ledger[request.reservationId];
    if (existing && !sameReservation(existing, request)) {
      return { status: 'failed', reason: 'reservation_id_conflict', requestId: request.reservationId };
    }
    if (existing) continue;
    const owner = world.npcs[request.ownerId];
    if (!owner) return { status: 'failed', reason: 'owner_not_found', requestId: request.reservationId };
    if (owner.soulState !== 'Active') {
      return { status: 'failed', reason: 'owner_inactive', requestId: request.reservationId };
    }

    if (request.resource.kind === 'spirit_stones') {
      const alreadyHeld = active
        .filter((entry) => entry.ownerId === request.ownerId && entry.resource.kind === 'spirit_stones')
        .reduce((sum, entry) => sum + entry.resource.amount, 0);
      const requestedTogether = requests
        .filter((entry) => entry.ownerId === request.ownerId
          && entry.resource.kind === 'spirit_stones'
          && !ledger[entry.reservationId])
        .reduce((sum, entry) => sum + entry.resource.amount, 0);
      if ((owner.spiritStones ?? 0) - alreadyHeld < requestedTogether) {
        return { status: 'failed', reason: 'resource_unavailable', requestId: request.reservationId };
      }
    } else {
      if (!request.resource.resourceId) {
        return { status: 'failed', reason: 'invalid_request', requestId: request.reservationId };
      }
      const locked = active.some((entry) => entry.resource.kind === request.resource.kind
        && entry.resource.resourceId === request.resource.resourceId
        && entry.reservationId !== request.reservationId);
      if (locked) return { status: 'failed', reason: 'resource_unavailable', requestId: request.reservationId };
      if (request.resource.kind === 'asset' && !world.assets?.[request.resource.resourceId]) {
        return { status: 'failed', reason: 'resource_unavailable', requestId: request.reservationId };
      }
    }
  }

  world.resourceReservations ??= {};
  let created = false;
  for (const request of requests) {
    if (world.resourceReservations[request.reservationId]) continue;
    world.resourceReservations[request.reservationId] = {
      reservationId: request.reservationId,
      ownerId: request.ownerId,
      planId: request.planId,
      resource: { ...request.resource },
      status: 'active',
      createdAt: { ...now },
      expiresAt: { ...request.expiresAt },
    };
    created = true;
  }
  return { status: created ? 'reserved' : 'already_reserved', reservationIds: requests.map((entry) => entry.reservationId) };
}

export function completeWorldResourceReservations(
  world: WorldState,
  reservationIds: readonly string[],
  status: 'consumed' | 'released',
  now: BrainTime,
  failureReason?: string,
): void {
  for (const reservationId of reservationIds) {
    const reservation = world.resourceReservations?.[reservationId];
    if (!reservation || reservation.status !== 'active') continue;
    reservation.status = status;
    reservation.completedAt = { ...now };
    reservation.failureReason = failureReason;
  }
}
