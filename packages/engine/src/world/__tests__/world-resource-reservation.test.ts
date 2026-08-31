import { describe, expect, it } from 'vitest';
import type { NpcRecord, ResourceReservationRequest, WorldState } from '@taosim/contracts';
import { reserveWorldResources } from '../world-resource-reservation.js';

function world(stones = 100): WorldState {
  const npc = {
    id: 'npc_1', name: '守约', spiritStones: stones, soulState: 'Active', relations: {},
    cultivation: { currentExp: 0, maxExp: 100 }, lifespan: { age: 20, maxLifespan: 100 },
    biography: { milestones: [], summary: '' },
  } as unknown as NpcRecord;
  return {
    currentYear: 1, currentMonth: 1, catastropheCountdownMonths: 600,
    activeContinentIds: [], globalFlags: {}, npcs: { npc_1: npc }, eventLog: [],
    assets: {
      sword: {
        assetId: 'sword', templateId: 'sword', name: '孤剑', rarity: 'rare',
        origin: { source: 'loot', at: { year: 1, month: 1 } }, combatBonuses: {},
      },
    },
  };
}

function stoneRequest(id: string, amount: number): ResourceReservationRequest {
  return {
    reservationId: id, ownerId: 'npc_1', planId: 'plan_1',
    resource: { kind: 'spirit_stones', amount }, expiresAt: { year: 1, month: 2 },
  };
}

describe('world resource reservations', () => {
  it('多资源请求任一不足时整体失败，不留下半套预留', () => {
    const state = world(100);
    const result = reserveWorldResources(
      state,
      [stoneRequest('r1', 60), stoneRequest('r2', 60)],
      { year: 1, month: 1 },
    );

    expect(result).toMatchObject({ status: 'failed', reason: 'resource_unavailable' });
    expect(state.resourceReservations).toBeUndefined();
  });

  it('同一请求幂等，唯一资产不能同时被两个计划锁定', () => {
    const state = world();
    const first: ResourceReservationRequest = {
      reservationId: 'asset_r1', ownerId: 'npc_1', planId: 'plan_1',
      resource: { kind: 'asset', resourceId: 'sword', amount: 1 }, expiresAt: { year: 1, month: 2 },
    };
    const competing = {
      ...first, reservationId: 'asset_r2', ownerId: 'npc_1', planId: 'plan_2',
    };

    expect(reserveWorldResources(state, [first], { year: 1, month: 1 }).status).toBe('reserved');
    expect(reserveWorldResources(state, [first], { year: 1, month: 1 }).status).toBe('already_reserved');
    expect(reserveWorldResources(state, [competing], { year: 1, month: 1 }))
      .toMatchObject({ status: 'failed', reason: 'resource_unavailable' });
  });
});
