import { describe, it, expect } from 'vitest';
import { MigrationService } from '../migration.js';

// ============================================================
// 辅助工厂：构造各版本的原始存档 payload
// ============================================================

function makeMinimalPlayer(): any {
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
  };
}

function baseHeader(overrides: Partial<any> = {}) {
  return {
    saveId: 'save_test',
    schemaVersion: 7,
    gameVersion: '0.3.0',
    timestamp: Date.now(),
    playTimeMonths: 10,
    playerSummary: { name: '测试者', realm: 'QiRefinement_1', portraitId: 'default' },
    ...overrides,
  };
}

function baseWorldState(overrides: Partial<any> = {}) {
  return {
    currentYear: 1,
    currentMonth: 1,
    catastropheCountdownMonths: 600,
    activeContinentIds: ['CONTINENT_CANGZHOU'],
    globalFlags: {},
    npcs: {},
    eventLog: [],
    elapsedMinutes: 0,
    ...overrides,
  };
}

function makeV1Payload(): any {
  return {
    header: baseHeader({ schemaVersion: 1 }),
    worldState: {
      currentYear: 1, currentMonth: 11,
      catastropheCountdownMonths: 600,
      activeContinentIds: ['CONTINENT_CANGZHOU'],
      globalFlags: {},
      // v1 无 npcs、无 eventLog
    },
    player: makeMinimalPlayer(),
    activeNPCs: {},
    factions: {},
    overworldMap: { continents: [] },
    marketInventories: {},
    npcTradeOffers: {},
    graveyard: [],
  };
}

function makeV2Payload(): any {
  const p = makeV1Payload();
  p.header.schemaVersion = 2;
  return p;
}

function makeV3Payload(): any {
  const p = makeV1Payload();
  p.header.schemaVersion = 3;
  p.worldState = baseWorldState();
  return p;
}

function makeV4Payload(): any {
  return {
    header: baseHeader({ schemaVersion: 4 }),
    worldState: baseWorldState(),
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

function makeV5Payload(): any {
  const p = makeV4Payload();
  p.header.schemaVersion = 5;
  p.worldState.elapsedMinutes = 50 * 43200;
  return p;
}

function makeV7Payload(): any {
  const p = makeV4Payload();
  p.header.schemaVersion = 7;
  p.worldState.elapsedMinutes = 50 * 43200;
  p.watchedNpcIds = ['npc_1', 'npc_2'];
  return p;
}

// ============================================================
// 测试
// ============================================================

describe('MigrationService', () => {
  describe('loadWithMigration — v1→v7 全链迁移', () => {
    it('v1 存档迁移到 v7：补 npcs + eventLog + elapsedMinutes + watchedNpcIds', () => {
      const result = MigrationService.loadWithMigration(makeV1Payload());

      expect(result.header.schemaVersion).toBe(7);
      expect(result.worldState.npcs).toEqual({});
      expect(result.worldState.eventLog).toEqual([]);
      expect(result.worldState.elapsedMinutes).toBeDefined();
      expect(result.player).toBeDefined();
      // 旧字段保留
      expect((result as any).activeNPCs).toEqual({});
      // 旧存档无 watchedNpcIds 补 []
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('loadWithMigration — v2→v7', () => {
    it('v2 迁移到 v7', () => {
      const result = MigrationService.loadWithMigration(makeV2Payload());

      expect(result.header.schemaVersion).toBe(7);
      expect(result.worldState.eventLog).toEqual([]);
      expect(result.worldState.elapsedMinutes).toBeDefined();
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('loadWithMigration — v3→v7', () => {
    it('v3 迁移到 v7', () => {
      const result = MigrationService.loadWithMigration(makeV3Payload());

      expect(result.header.schemaVersion).toBe(7);
      expect(result.worldState.npcs).toEqual({});
      expect(result.worldState.eventLog).toEqual([]);
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('loadWithMigration — v4→v7', () => {
    it('v4 迁移到 v7：elapsedMinutes 正确计算 + watchedNpcIds 补 []', () => {
      const result = MigrationService.loadWithMigration(JSON.parse(JSON.stringify(makeV4Payload())));

      expect(result.header.schemaVersion).toBe(7);
      // currentYear=1, currentMonth=1 → (1-1)*12 + (1-1)=0 → 0 minutes
      expect(result.worldState.elapsedMinutes).toBe(0);
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('loadWithMigration — v5→v7', () => {
    it('v5 迁移到 v7', () => {
      const result = MigrationService.loadWithMigration(JSON.parse(JSON.stringify(makeV5Payload())));

      expect(result.header.schemaVersion).toBe(7);
      expect(result.watchedNpcIds).toEqual([]);
    });
  });

  describe('loadWithMigration — 已是 v7', () => {
    it('v7 存档不变', () => {
      const original = makeV7Payload();
      const result = MigrationService.loadWithMigration(JSON.parse(JSON.stringify(original)));

      expect(result.header.schemaVersion).toBe(7);
      expect(result.header.saveId).toBe('save_test');
      expect(result.player.id).toBe('player_1');
      expect(result.watchedNpcIds).toEqual(['npc_1', 'npc_2']);
      expect(result.playerMapState?.activeLayer).toBe('Region');
    });
  });

  describe('损坏数据防御处理', () => {
    it('header 缺失 schemaVersion 时报错', () => {
      const damaged = makeV4Payload();
      delete damaged.header.schemaVersion;
      expect(() => MigrationService.loadWithMigration(damaged)).toThrowError(/schemaVersion 不是数字/);
    });

    it('header 完全缺失时报错', () => {
      const damaged = makeV4Payload();
      delete (damaged as any).header;
      expect(() => MigrationService.loadWithMigration(damaged)).toThrowError(/header 缺失/);
    });

    it('null payload 报错', () => {
      expect(() => MigrationService.loadWithMigration(null)).toThrowError(/不是对象/);
    });

    it('undefined payload 报错', () => {
      expect(() => MigrationService.loadWithMigration(undefined)).toThrowError(/不是对象/);
    });

    it('非对象输入（数字）报错', () => {
      expect(() => MigrationService.loadWithMigration(42)).toThrowError(/不是对象/);
    });

    it('非对象输入（字符串）报错', () => {
      expect(() => MigrationService.loadWithMigration('bad_data')).toThrowError(/不是对象/);
    });

    it('空对象 {} 报错', () => {
      expect(() => MigrationService.loadWithMigration({})).toThrowError(/header 缺失/);
    });

    it('header 为 null 时报错', () => {
      expect(() => MigrationService.loadWithMigration({ header: null })).toThrowError(/header 缺失/);
    });

    it('header.schemaVersion 为字符串时报错', () => {
      expect(() => MigrationService.loadWithMigration({
        header: { schemaVersion: 'not_a_number' },
      })).toThrowError(/schemaVersion 不是数字/);
    });

    it('header.schemaVersion 为 null 时报错', () => {
      expect(() => MigrationService.loadWithMigration({
        header: { schemaVersion: null },
      })).toThrowError(/schemaVersion 不是数字/);
    });
  });

  describe('registerMigration', () => {
    it('注册自定义迁移步骤后生效', () => {
      // 使用远离内建版本链的编号，避免覆盖产品迁移步骤
      let called = false;
      MigrationService.registerMigration(99, (data: any) => {
        called = true;
        data.customField = 'migrated';
        return data;
      });

      const custom = makeV7Payload();
      custom.header.schemaVersion = 99;
      const result = MigrationService.loadWithMigration(custom);

      expect(called).toBe(true);
      expect(result.header.schemaVersion).toBe(100);
      expect((result as any).customField).toBe('migrated');
    });
  });
});
