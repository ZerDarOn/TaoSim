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
  };
}

describe('TravelService 境界门槛（回归 I1）', () => {
  // 天机城（CONT_EAST）传送阵 → 西漠传送阵（requiredRealm: YuanYing）
  const SOURCE = { mapState: makeMapState(), currentNodeId: 'NODE_CITY_TIANJI' };
  const TARGET_TP = 'TP_WEST_FOZONG';

  it('炼气期（LianQi）玩家被传送阵境界门槛拦截', () => {
    const result = TravelService.canTeleport(
      makePlayer('QiRefinement_1', 600),
      SOURCE.mapState,
      SOURCE.currentNodeId,
      TARGET_TP,
    );
    expect(result.ok).toBe(false);
    expect(result.missingRealm).toBe('YuanYing');
  });

  it('元婴期（YuanYing）玩家可通过传送阵境界门槛并成功', () => {
    const result = TravelService.canTeleport(
      makePlayer('NascentSoul_1', 600),
      SOURCE.mapState,
      SOURCE.currentNodeId,
      TARGET_TP,
    );
    expect(result.ok).toBe(true);
  });

  it('灵石不足仍被拦截（境界校验之后）', () => {
    const result = TravelService.canTeleport(
      makePlayer('NascentSoul_1', 100),
      SOURCE.mapState,
      SOURCE.currentNodeId,
      TARGET_TP,
    );
    expect(result.ok).toBe(false);
    expect(result.missingStones).toBeGreaterThan(0);
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
