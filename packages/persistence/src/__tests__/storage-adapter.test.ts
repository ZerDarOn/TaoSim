import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorageAdapter } from '../storage-adapter.js';
import type { SavePayload, SaveHeader } from '@taosim/contracts';

function makePayload(saveId: string, schemaVersion = 7): SavePayload {
  return {
    header: {
      saveId,
      schemaVersion,
      gameVersion: '0.3.0',
      timestamp: Date.now(),
      playTimeMonths: 10,
      playerSummary: { name: '测试者', realm: 'QiRefinement_1', portraitId: 'default' },
    },
    worldState: {
      currentYear: 1,
      currentMonth: 1,
      catastropheCountdownMonths: 600,
      activeContinentIds: ['CONTINENT_CANGZHOU'],
      globalFlags: {},
      npcs: {},
      eventLog: [],
      elapsedMinutes: 0,
    },
    player: {
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
    } as any,
    graveyard: [],
  };
}

describe('MemoryStorageAdapter', () => {
  let adapter: MemoryStorageAdapter;

  beforeEach(() => {
    adapter = new MemoryStorageAdapter();
  });

  describe('initialize', () => {
    it('initialize 无操作，不抛错', async () => {
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });
  });

  describe('save / load', () => {
    it('保存后加载返回相同数据', async () => {
      const payload = makePayload('save_1');
      await adapter.save(payload);
      const loaded = await adapter.load('save_1');
      expect(loaded).not.toBeNull();
      expect(loaded!.header.saveId).toBe('save_1');
      expect(loaded!.player.name).toBe('测试者');
    });

    it('覆盖写入：新存档覆盖旧存档', async () => {
      const v1 = makePayload('save_1');
      const v2 = makePayload('save_1');
      v2.player.name = '新名字';

      await adapter.save(v1);
      await adapter.save(v2);
      const loaded = await adapter.load('save_1');
      expect(loaded!.player.name).toBe('新名字');
    });

    it('加载不存在的存档返回 null', async () => {
      const result = await adapter.load('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listHeaders', () => {
    it('空存储下列表返回空数组', async () => {
      const headers = await adapter.listHeaders();
      expect(headers).toEqual([]);
    });

    it('多存档时正确列出所有 header', async () => {
      await adapter.save(makePayload('save_1'));
      await adapter.save(makePayload('save_2'));
      await adapter.save(makePayload('save_3'));
      const headers = await adapter.listHeaders();
      expect(headers).toHaveLength(3);
      const ids = headers.map((h: SaveHeader) => h.saveId).sort();
      expect(ids).toEqual(['save_1', 'save_2', 'save_3']);
    });
  });

  describe('deleteSave', () => {
    it('删除后加载返回 null', async () => {
      await adapter.save(makePayload('save_1'));
      await adapter.deleteSave('save_1');
      const loaded = await adapter.load('save_1');
      expect(loaded).toBeNull();
    });

    it('删除不存在的存档不抛错', async () => {
      await expect(adapter.deleteSave('nonexistent')).resolves.toBeUndefined();
    });

    it('删除一个存档不影响其他存档', async () => {
      await adapter.save(makePayload('save_a'));
      await adapter.save(makePayload('save_b'));
      await adapter.deleteSave('save_a');

      const headers = await adapter.listHeaders();
      expect(headers).toHaveLength(1);
      expect(headers[0]!.saveId).toBe('save_b');
    });
  });

  describe('完整生命周期', () => {
    it('初始化→保存→列表→加载→删除→列表，全流程正确', async () => {
      await adapter.initialize();

      await adapter.save(makePayload('lifecycle_test'));
      let headers = await adapter.listHeaders();
      expect(headers).toHaveLength(1);

      const loaded = await adapter.load('lifecycle_test');
      expect(loaded!.header.saveId).toBe('lifecycle_test');

      await adapter.deleteSave('lifecycle_test');
      headers = await adapter.listHeaders();
      expect(headers).toHaveLength(0);

      const afterDelete = await adapter.load('lifecycle_test');
      expect(afterDelete).toBeNull();
    });
  });
});
