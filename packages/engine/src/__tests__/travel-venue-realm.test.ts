import { describe, it, expect } from 'vitest';
import type { Character, PlayerMapState, RealmFullPath } from '@taosim/contracts';
import { CharacterFactory } from '../character/character-factory.js';
import { TravelService } from '../overworld/travel-service.js';
import { VenueService } from '../overworld/venue-service.js';

/**
 * 回归测试：境界门槛（I1）
 *
 * 修复前 travel/venue 用 `player.realm.split('_')[0]` 得到 'QiRefinement' 前缀，
 * 而 REALM_ORDER 的键是 RealmType（LianQi/ZhuJi/...），查不到 → undefined < X 恒 false，
 * 导致境界门槛全线失效（fail-open）。修复后改用 parseRealm 正确比较。
 */

function makePlayer(realm: RealmFullPath, spiritStones = 1000): Character {
  return {
    ...CharacterFactory.create({
      name: '测试修士',
      gender: 'Male',
      background: 'orphan',
      attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
      innateTraits: [],
    }),
    realm,
    spiritStones,
  };
}

function makeMapState(): PlayerMapState {
  return {
    activeLayer: 'Region',
    activeCosmosId: 'COSMOS_TAIYANG',
    activeContinentId: 'CONT_EAST',
    activeVenueId: null,
    exploredHexes: {},
    hexPos: { q: 0, r: 0 },
  };
}

describe('TravelService 目标大陆可用性（回归：占位大陆单向死路）', () => {
  // 天机城（CONT_EAST）传送阵 → 西漠传送阵：西漠为占位大陆（PRESET_MAP 无节点，
  // 传送阵 nodeId 暂挂东荒节点），原实现放行后玩家落入无地标/无场所的空白网格，
  // 无法传送返回也无法进入场所（能出不能进的单向死路）。修复后统一拦截为"尚未开放"。
  const SOURCE = { mapState: makeMapState(), currentNodeId: 'NODE_CITY_TIANJI' };
  const TARGET_TP = 'TP_WEST_FOZONG';

  it('炼气期玩家被拦截：目标大陆尚未开放', () => {
    const result = TravelService.canTeleport(
      makePlayer('QiRefinement_1', 600),
      SOURCE.mapState,
      SOURCE.currentNodeId,
      TARGET_TP,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('该大陆尚未开放');
  });

  it('元婴期玩家同样无法传送至未开放大陆（防止单向死路）', () => {
    const result = TravelService.canTeleport(
      makePlayer('NascentSoul_1', 600),
      SOURCE.mapState,
      SOURCE.currentNodeId,
      TARGET_TP,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('该大陆尚未开放');
  });

  it('灵石充足与否均被未开放拦截（可用性校验优先于费用）', () => {
    const result = TravelService.canTeleport(
      makePlayer('NascentSoul_1', 100),
      SOURCE.mapState,
      SOURCE.currentNodeId,
      TARGET_TP,
    );
    expect(result.ok).toBe(false);
  });
});

describe('VenueService 境界门槛（回归 I1）', () => {
  it('炼气期玩家无法进入元婴门槛的传送院', () => {
    const result = VenueService.canEnter(makePlayer('QiRefinement_1'), 'VENUE_TIANJI_TELEPORT');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('YuanYing');
  });

  it('元婴期玩家可进入元婴门槛的传送院', () => {
    const result = VenueService.canEnter(makePlayer('NascentSoul_1'), 'VENUE_TIANJI_TELEPORT');
    expect(result.ok).toBe(true);
  });
});
