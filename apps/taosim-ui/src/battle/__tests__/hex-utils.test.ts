import { describe, it, expect } from 'vitest';
import type { HexBattleMap, HexTile } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';
import { computeMoveRange, computeAttackTargets, findOccupant } from '../hex-utils';

function makeMap(w = 7, h = 7): HexBattleMap {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < h; r++) {
    for (let q = 0; q < w; q++) {
      tiles[hexKey(q, r)] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  return { width: w, height: h, tiles };
}

describe('findOccupant', () => {
  it('返回指定角色的所在格，不存在返回 null', () => {
    const map = makeMap();
    map.tiles[hexKey(2, 3)]!.occupantId = 'p';
    expect(findOccupant(map, 'p')).toEqual({ q: 2, r: 3 });
    expect(findOccupant(map, 'x')).toBeNull();
  });
});

describe('computeMoveRange', () => {
  it('movePoints=2 时返回全部距离 1~2 的可达格（18 格）', () => {
    const map = makeMap();
    const range = computeMoveRange(map, { q: 3, r: 3 }, 2, false);
    expect(range.length).toBe(18);
    expect(range.some(t => t.q === 3 && t.r === 3)).toBe(false); // 不含起点
  });

  it('阻挡格不可达，且不穿过阻挡', () => {
    const map = makeMap();
    map.tiles[hexKey(4, 3)]!.isBlocked = true; // (3,3) 的东侧邻居
    const range = computeMoveRange(map, { q: 3, r: 3 }, 2, false);
    expect(range.some(t => t.q === 5 && t.r === 3)).toBe(false); // 阻挡后方不可达
    expect(range.some(t => t.q === 4 && t.r === 3)).toBe(false);
  });

  it('占用格不可移动', () => {
    const map = makeMap();
    map.tiles[hexKey(4, 3)]!.occupantId = 'enemy';
    const range = computeMoveRange(map, { q: 3, r: 3 }, 3, false);
    expect(range.some(t => t.q === 4 && t.r === 3)).toBe(false);
  });

  it('水格：非飞行不可达，飞行可达', () => {
    const map = makeMap();
    map.tiles[hexKey(4, 3)]!.isWater = true;
    expect(computeMoveRange(map, { q: 3, r: 3 }, 2, false).some(t => t.q === 4 && t.r === 3)).toBe(false);
    expect(computeMoveRange(map, { q: 3, r: 3 }, 2, true).some(t => t.q === 4 && t.r === 3)).toBe(true);
  });
});

describe('computeAttackTargets', () => {
  it('射程 1 时只包含相邻敌人，不含自身', () => {
    const map = makeMap();
    map.tiles[hexKey(3, 3)]!.occupantId = 'p';
    map.tiles[hexKey(4, 3)]!.occupantId = 'e1';
    map.tiles[hexKey(5, 3)]!.occupantId = 'e2'; // 距离 2
    const targets = computeAttackTargets(map, 'p', 1);
    expect(targets).toEqual([{ q: 4, r: 3, characterId: 'e1' }]);
  });
});
