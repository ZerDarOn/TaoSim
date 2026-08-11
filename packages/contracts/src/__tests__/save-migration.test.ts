import { describe, it, expect } from 'vitest';
import { SaveMigrationRunner, type SavePayload } from '@taosim/contracts';
import type { Character, WorldState } from '@taosim/contracts';

// ============================================================
// 辅助工厂：构造各版本的原始存档 payload
// ============================================================

function makeMinimalPlayer(): Character {
  return {
    id: 'player_1', name: '测试者', gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [], equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, spiritStones: 0,
    wantedLevels: {}, unlockedRecipes: [],
  } as Character;
}

function makeWorldState(): WorldState {
  return {
    currentYear: 5,
    currentMonth: 3,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
  };
}

/** v1 原始存档（无 npcs、无 eventLog、schemaVersion=1） */
function makeV1Payload(): any {
  return {
    header: {
      saveId: 'save_v1',
      schemaVersion: 1,
      gameVersion: '0.1.0',
      timestamp: Date.now(),
      playTimeMonths: 10,
      playerSummary: { name: '测试者', realm: 'QiRefinement_1', portraitId: 'default' },
    },
    worldState: {
      currentYear: 1,
      currentMonth: 11,
      catastropheCountdownMonths: 600,
      activeContinentIds: ['CONTINENT_CANGZHOU'],
      globalFlags: {},
      // 无 npcs、无 eventLog
    },
    player: makeMinimalPlayer(),
    activeNPCs: {},
    factions: {},
    overworldMap: { continents: [] },
    marketInventories: {},
    npcTradeOffers: {},
    graveyard: [],
    // 无 playerMapState
  };
}

/** v3 存档（有 npcs + eventLog，含废弃字段，schemaVersion=3） */
function makeV3Payload(): any {
  return {
    header: {
      saveId: 'save_v3',
      schemaVersion: 3,
      gameVersion: '0.2.0',
      timestamp: Date.now(),
      playTimeMonths: 50,
      playerSummary: { name: '测试者', realm: 'Foundation_1', portraitId: 'default' },
    },
    worldState: makeWorldState(),
    player: makeMinimalPlayer(),
    activeNPCs: {},
    factions: { f1: { id: 'f1', name: '测试宗门', type: 'Sect' } },
    overworldMap: { continents: [] },
    marketInventories: {},
    npcTradeOffers: {},
    graveyard: [],
    playerMapState: {
      activeLayer: 'Region',
      activeCosmosId: 'COSMOS_DEFAULT',
      activeContinentId: 'CONTINENT_CANGZHOU',
      activeVenueId: null,
      exploredHexes: {},
      hexPos: { q: 10, r: 10 },
    },
  };
}

/** v4 新格式存档（无废弃字段，schemaVersion=4） */
function makeV4Payload(): SavePayload {
  return {
    header: {
      saveId: 'save_v4',
      schemaVersion: 4,
      gameVersion: '0.2.0',
      timestamp: Date.now(),
      playTimeMonths: 50,
      playerSummary: { name: '测试者', realm: 'Foundation_1', portraitId: 'default' },
    },
    worldState: makeWorldState(),
    player: makeMinimalPlayer(),
    graveyard: [],
    playerMapState: {
      activeLayer: 'Region',
      activeCosmosId: 'COSMOS_DEFAULT',
      activeContinentId: 'CONTINENT_CANGZHOU',
      activeVenueId: null,
      exploredHexes: {},
      hexPos: { q: 10, r: 10 },
    },
  };
}

// ============================================================
// 测试
// ============================================================

describe('SaveMigrationRunner', () => {
  describe('v1→v4 全链迁移', () => {
    it('v1 存档迁移到 v6：补 npcs + eventLog + elapsedMinutes + watchedNpcIds，schemaVersion=6', () => {
      const v1 = makeV1Payload();
      const result = SaveMigrationRunner.migrate(v1);

      expect(result.header.schemaVersion).toBe(6);
      expect(result.worldState.npcs).toEqual({});
      expect(result.worldState.eventLog).toEqual([]);
      expect(result.worldState.elapsedMinutes).toBeDefined();
      expect(result.player).toBeDefined();
      // 废弃字段保留（不破坏性删除）
      expect(result.activeNPCs).toEqual({});
      // C2：旧存档无 watchedNpcIds 补 []
      expect(result.watchedNpcIds).toEqual([]);
    });

    it('v1 存档保留 playerMapState 缺失时的兼容', () => {
      const v1 = makeV1Payload();
      const result = SaveMigrationRunner.migrate(v1);

      expect(result.playerMapState).toBeUndefined();
    });
  });

  describe('v3→v5 迁移', () => {
    it('v3 存档迁移到 v6：schemaVersion 正确升版', () => {
      const v3 = makeV3Payload();
      const result = SaveMigrationRunner.migrate(v3);

      expect(result.header.schemaVersion).toBe(6);
    });

    it('v3 存档的废弃字段保留但不影响权威数据', () => {
      const v3 = makeV3Payload();
      const result = SaveMigrationRunner.migrate(v3);

      // factions 仍在 payload（可选字段），但权威在 worldState
      expect(result.factions).toBeDefined();
      // worldState 是权威
      expect(result.worldState).toBeDefined();
      expect(result.worldState.npcs).toEqual({});
    });

    it('v3 存档的 playerMapState 正确保留', () => {
      const v3 = makeV3Payload();
      const result = SaveMigrationRunner.migrate(v3);

      expect(result.playerMapState).toBeDefined();
      expect(result.playerMapState!.activeContinentId).toBe('CONTINENT_CANGZHOU');
    });

    it('v3 存档含旧 activeNPCs/overworldMap 时迁移不报错', () => {
      const v3 = makeV3Payload();
      v3.activeNPCs = { fake_npc: { id: 'fake', name: '假人' } };
      v3.overworldMap = { continents: [{ id: 'c1', name: '假大陆', nodes: [] }] };
      const result = SaveMigrationRunner.migrate(v3);

      expect(result.header.schemaVersion).toBe(6);
      // 废弃字段保留原值（不破坏）
      expect(result.activeNPCs).toBeDefined();
      expect(result.overworldMap).toBeDefined();
    });
  });

  describe('v4→v6 迁移（P1：elapsedMinutes + C2：watchedNpcIds）', () => {
    it('v4 存档迁移到 v6：elapsedMinutes 正确 + watchedNpcIds 补 []', () => {
      const v4 = makeV4Payload();
      // currentYear=5, currentMonth=3 → (5-1)*12 + (3-1) = 50 月 → 50 * 43200 = 2160000 分
      const result = SaveMigrationRunner.migrate(JSON.parse(JSON.stringify(v4)));

      expect(result.header.schemaVersion).toBe(6);
      expect(result.worldState.elapsedMinutes).toBe(50 * 43200);
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('v5→v6 round-trip', () => {
    it('v5 存档经迁移后升至 v6，watchedNpcIds 补 []，其他数据不变', () => {
      const v5 = makeV4Payload();
      v5.header.schemaVersion = 5;
      v5.worldState.elapsedMinutes = 50 * 43200;
      const result = SaveMigrationRunner.migrate(JSON.parse(JSON.stringify(v5)));

      expect(result.header.schemaVersion).toBe(6);
      expect(result.header.saveId).toBe('save_v4');
      expect(result.worldState.currentYear).toBe(5);
      expect(result.worldState.elapsedMinutes).toBe(50 * 43200);
      expect(result.player.id).toBe('player_1');
      expect(result.graveyard).toEqual([]);
      expect(result.playerMapState?.activeLayer).toBe('Region');
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('旧字段容忍', () => {
    it('v3 存档完全无 playerMapState 时迁移成功', () => {
      const v3 = makeV3Payload();
      delete v3.playerMapState;
      const result = SaveMigrationRunner.migrate(v3);

      expect(result.header.schemaVersion).toBe(6);
    });

    it('v3 存档完全无 graveyard 时迁移成功（补默认）', () => {
      const v3 = makeV3Payload();
      delete v3.graveyard;
      // graveyard 是必填字段，但旧存档可能缺失——迁移不应崩溃
      expect(() => SaveMigrationRunner.migrate(v3)).not.toThrow();
    });
  });

  describe('损坏 header 处理', () => {
    it('header 缺失 schemaVersion 时明确报错（非隐式 TypeError）', () => {
      const damaged = makeV4Payload();
      delete (damaged as any).header.schemaVersion;
      expect(() => SaveMigrationRunner.migrate(damaged)).toThrowError(/schemaVersion 不是数字/);
    });

    it('header 完全缺失时明确报错', () => {
      const damaged = makeV4Payload();
      delete (damaged as any).header;
      expect(() => SaveMigrationRunner.migrate(damaged)).toThrowError(/header 缺失/);
    });

    it('空 payload 明确报错', () => {
      expect(() => SaveMigrationRunner.migrate({})).toThrowError(/header 缺失/);
    });

    it('null payload 明确报错', () => {
      expect(() => SaveMigrationRunner.migrate(null)).toThrowError(/不是对象/);
    });
  });

  describe('SavePayload v4 可选字段语义', () => {
    it('v4 新存档不要求 activeNPCs/factions/overworldMap/marketInventories', () => {
      const v4: SavePayload = {
        header: makeV4Payload().header,
        worldState: makeWorldState(),
        player: makeMinimalPlayer(),
        graveyard: [],
      };

      // 这些字段都是可选的，不提供也应通过类型检查
      expect(v4.activeNPCs).toBeUndefined();
      expect(v4.factions).toBeUndefined();
      expect(v4.overworldMap).toBeUndefined();
      expect(v4.marketInventories).toBeUndefined();
    });
  });
});
