// ============================================================
// Phase 0.5 P3 测试：聚落地图（天机城）
//
// 验证：
// - Settlement 层级契约（Area/Venue/Scene）
// - 天机城聚落图节点和道路
// - 真实在场 NPC 查询
// - 城内移动产生真实距离和耗时
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  QINGYUN_SETTLEMENT,
  TIANJI_SETTLEMENT,
  getNpcsInVenue,
  getNpcsInSettlement,
  settlementDistance,
} from '../overworld/settlement-maps.js';
import type { SettlementMap } from '../overworld/settlement-maps.js';
import type { NpcRecord } from '@taosim/contracts';

// —— 测试夹具 ——

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_TEST',
    name: '测试NPC',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 10, hidden: false },
    realm: 'QiRefinement_1',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 80 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 25, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

// ============================================================
// 天机城聚落图结构
// ============================================================
describe('P3 天机城聚落图结构', () => {
  it('包含城门、主街、百宝阁、酒楼等核心节点', () => {
    const nodeIds = TIANJI_SETTLEMENT.nodes.map(n => n.id);
    expect(nodeIds).toContain('TIANJI_GATE_SOUTH');   // 城门
    expect(nodeIds).toContain('TIANJI_MAIN_STREET');   // 主街
    expect(nodeIds).toContain('TIANJI_BAIBAO_GE');     // 百宝阁
    expect(nodeIds).toContain('TIANJI_ZUIXIAN_LOU');   // 醉仙楼
  });

  it('节点有距离和位置信息', () => {
    const gate = TIANJI_SETTLEMENT.nodes.find(n => n.id === 'TIANJI_GATE_SOUTH');
    expect(gate).toBeDefined();
    expect(gate!.position).toBeDefined();
    expect(gate!.position.x).toBeDefined();
    expect(gate!.position.y).toBeDefined();
  });

  it('道路连接节点并记录距离', () => {
    // 城门 → 主街 应该有道路连接
    const road = TIANJI_SETTLEMENT.roads.find(
      r => (r.from === 'TIANJI_GATE_SOUTH' && r.to === 'TIANJI_MAIN_STREET')
        || (r.from === 'TIANJI_MAIN_STREET' && r.to === 'TIANJI_GATE_SOUTH'),
    );
    expect(road).toBeDefined();
    expect(road!.distanceMeters).toBeGreaterThan(0);
  });

  it('从城门到百宝阁存在可通行路径', () => {
    // BFS 验证连通性
    const reachable = new Set<string>();
    const queue = ['TIANJI_GATE_SOUTH'];
    reachable.add('TIANJI_GATE_SOUTH');

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const road of TIANJI_SETTLEMENT.roads) {
        const next = road.from === current ? road.to : road.to === current ? road.from : null;
        if (next && !reachable.has(next)) {
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    expect(reachable.has('TIANJI_BAIBAO_GE')).toBe(true);
  });
});

describe('P3 聚落目录与物理距离', () => {
  it('青云宗是独立局部地图并保留宗门场所入口', () => {
    expect(QINGYUN_SETTLEMENT.nodeId).toBe('NODE_SECT_QINGYUN');
    expect(QINGYUN_SETTLEMENT.nodes.map((node) => node.id)).toContain('QINGYUN_MOUNTAIN_GATE');
    expect(QINGYUN_SETTLEMENT.nodes.map((node) => node.venueId)).toContain('VENUE_QINGYUN_HALL');
    expect(QINGYUN_SETTLEMENT.nodes.map((node) => node.venueId)).toContain('VENUE_QINGYUN_TRAINING');
    expect(QINGYUN_SETTLEMENT.nodes.some((node) => node.id.startsWith('TIANJI_'))).toBe(false);
  });

  it('加权最短路径不把最少边数误当成最短物理距离', () => {
    const map: SettlementMap = {
      definitionVersion: 1,
      nodeId: 'weighted_test',
      name: '加权测试图',
      entryNodeId: 'a',
      layout: { x: 0, y: 0, width: 100, height: 100 },
      nodes: ['a', 'b', 'c', 'd'].map((id, index) => ({
        id, name: id, type: 'street' as const, position: { x: index * 10, y: 0 },
      })),
      roads: [
        { from: 'a', to: 'b', distanceMeters: 100 },
        { from: 'b', to: 'd', distanceMeters: 100 },
        { from: 'a', to: 'c', distanceMeters: 10 },
        { from: 'c', to: 'b', distanceMeters: 10 },
      ],
    };

    expect(settlementDistance(map, 'a', 'd')).toBe(120);
    expect(settlementDistance(map, 'a', 'missing')).toBeNull();
  });
});

// ============================================================
// 场所内 NPC 查询
// ============================================================
describe('P3 在场 NPC 查询', () => {
  it('getNpcsInVenue 返回指定场所的活动 NPC', () => {
    const npcs: Record<string, NpcRecord> = {
      NPC_A: makeNpc({ id: 'NPC_A', locationId: 'VENUE_TIANJI_SHOP', soulState: 'Active' }),
      NPC_B: makeNpc({ id: 'NPC_B', locationId: 'VENUE_TIANJI_TAVERN', soulState: 'Active' }),
      NPC_C: makeNpc({ id: 'NPC_C', locationId: 'VENUE_TIANJI_SHOP', soulState: 'Oblivion' }),
    };

    const result = getNpcsInVenue(npcs, 'VENUE_TIANJI_SHOP');
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('NPC_A');
  });

  it('getNpcsInSettlement 返回天机城所有场所的活动 NPC', () => {
    const npcs: Record<string, NpcRecord> = {
      NPC_A: makeNpc({ id: 'NPC_A', locationId: 'VENUE_TIANJI_SHOP', soulState: 'Active' }),
      NPC_B: makeNpc({ id: 'NPC_B', locationId: 'VENUE_TIANJI_TAVERN', soulState: 'Active' }),
      NPC_C: makeNpc({ id: 'NPC_C', locationId: 'VENUE_MARKET_SHOP', soulState: 'Active' }), // 不在天机城
    };

    const result = getNpcsInSettlement(npcs, 'NODE_CITY_TIANJI');
    expect(result.length).toBe(2);
    const ids = result.map(n => n.id);
    expect(ids).toContain('NPC_A');
    expect(ids).toContain('NPC_B');
    expect(ids).not.toContain('NPC_C');
  });
});
