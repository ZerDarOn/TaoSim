import { describe, it, expect } from 'vitest';
import type { NpcRecord } from '@taosim/contracts';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';
import { npcHexPos, npcSpatialIndex, deriveNpcHexPos } from '../overworld/npc-spatial.js';

const grid = generateWorldGrid('CONT_EAST');

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_1',
    name: '散修·甲',
    gender: 'Male',
    personalityId: 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
    realm: 'QiRefinement_3',
    soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 240 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [],
    birthYear: 1,
    birthMonth: 1,
    relations: {},
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

describe('npcHexPos（venue→node→hex 换算）', () => {
  it('场所可换算到其节点对应 hex', () => {
    // VENUE_QINGYUN_HALL → NODE_SECT_QINGYUN (400,250) → 固定网格坐标
    const pos = npcHexPos('VENUE_QINGYUN_HALL', grid);
    expect(pos).not.toBeNull();
    const hex = grid.hexes.get(`${pos!.q},${pos!.r}`);
    expect(hex?.landmarkId).toBe('NODE_SECT_QINGYUN');
  });

  it('无场所返回 null', () => {
    expect(npcHexPos(undefined, grid)).toBeNull();
  });

  it('未知场所返回 null', () => {
    expect(npcHexPos('VENUE_NOT_EXIST', grid)).toBeNull();
  });
});

describe('npcSpatialIndex（同格聚合）', () => {
  it('同场所 NPC 落入同格索引', () => {
    const a = makeNpc({ id: 'NPC_A', locationId: 'VENUE_QINGYUN_HALL' });
    const b = makeNpc({ id: 'NPC_B', locationId: 'VENUE_QINGYUN_TRAINING' }); // 同节点不同场所
    const c = makeNpc({ id: 'NPC_C', locationId: 'VENUE_TIANJI_TAVERN' });
    const index = npcSpatialIndex({ A: a, B: b, C: c }, grid);
    // A、B 都在青云宗节点格
    const qingyunPos = npcHexPos('VENUE_QINGYUN_HALL', grid)!;
    const key = `${qingyunPos.q},${qingyunPos.r}`;
    const list = index.get(key);
    expect(list?.map(n => n.id).sort()).toEqual(['NPC_A', 'NPC_B']);
  });

  it('hexPos 优先于 locationId 换算（wandering 时位置独立）', () => {
    const npc = makeNpc({
      id: 'NPC_W',
      locationId: 'VENUE_QINGYUN_HALL',
      hexPos: { q: 5, r: 5 },
      moveState: 'wandering',
    });
    const index = npcSpatialIndex({ W: npc }, grid);
    expect(index.get('5,5')?.length).toBe(1);
    const home = npcHexPos('VENUE_QINGYUN_HALL', grid)!;
    expect(index.get(`${home.q},${home.r}`)).toBeUndefined();
  });

  it('陨落 NPC 不入索引', () => {
    const dead = makeNpc({
      id: 'NPC_D',
      locationId: 'VENUE_QINGYUN_HALL',
      soulState: 'RemnantSoul',
    });
    const index = npcSpatialIndex({ D: dead }, grid);
    expect(index.size).toBe(0);
  });
});

describe('deriveNpcHexPos（月度维护：无 locationId 时向目标漂移）', () => {
  it('有 locationId：返回场所对应格', () => {
    const pos = deriveNpcHexPos({ q: 0, r: 0 }, 'VENUE_QINGYUN_HALL', undefined, grid);
    expect(grid.hexes.get(`${pos.hexPos.q},${pos.hexPos.r}`)?.landmarkId).toBe('NODE_SECT_QINGYUN');
    expect(pos.moveState).toBe('resident');
  });

  it('wandering 且目标相邻：一步到达并归巢', () => {
    const from = { q: 5, r: 5 };
    const pos = deriveNpcHexPos(from, undefined, { q: 6, r: 5 }, grid);
    expect(pos.hexPos).toEqual({ q: 6, r: 5 }); // 一步到达
    expect(pos.reached).toBe(true);
  });

  it('wandering 有目标但需多步：仅移动一步', () => {
    const from = { q: 3, r: 3 };
    const target = { q: 6, r: 3 };
    const pos = deriveNpcHexPos(from, undefined, target, grid);
    // 应移动 1 格（沿直线方向），不能一步跳 3 格
    const dist = Math.abs(pos.hexPos.q - from.q) + Math.abs(pos.hexPos.r - from.r);
    expect(dist).toBeLessThanOrEqual(1);
    expect(pos.hexPos).not.toEqual(target);
  });
});
