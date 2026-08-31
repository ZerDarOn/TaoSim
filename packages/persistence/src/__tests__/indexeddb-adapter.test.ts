/**
 * IndexedDBStorageAdapter 测试 — 使用 fake-indexeddb 模拟浏览器 IndexedDB 环境。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createInitialBrainState, type SavePayload } from '@taosim/contracts';

// 安装 fake-indexeddb 到 global（一次性）
beforeAll(async () => {
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  (globalThis as any).indexedDB = indexedDB;
  (globalThis as any).IDBKeyRange = IDBKeyRange;
});

// 懒加载 adapter 类
let _adapterMod: any = null;
async function getAdapterClass() {
  if (!_adapterMod) {
    _adapterMod = await import('../indexeddb-adapter.js');
  }
  return _adapterMod.IndexedDBStorageAdapter;
}

function makePayload(saveId: string, schemaVersion = 8): SavePayload {
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
      currentYear: 1, currentMonth: 1,
      catastropheCountdownMonths: 600,
      activeContinentIds: ['CONTINENT_CANGZHOU'],
      globalFlags: {}, npcs: {}, eventLog: [], elapsedMinutes: 0,
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

async function createAdapter(): Promise<any> {
  const Adapter = await getAdapterClass();
  const adapter = new Adapter();
  await adapter.initialize();
  return adapter;
}

describe('IndexedDBStorageAdapter (fake-indexeddb)', () => {
  describe('initialize', () => {
    it('初始化不抛错', async () => {
      const Adapter = await getAdapterClass();
      const adapter = new Adapter();
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });

    it('重复初始化不抛错', async () => {
      const adapter = await createAdapter();
      await expect(adapter.initialize()).resolves.toBeUndefined();
    });
  });

  describe('save / load', () => {
    it('保存后加载返回相同数据', async () => {
      const adapter = await createAdapter();
      const id = 'idb_save_1_' + Date.now();
      const payload = makePayload(id);
      await adapter.save(payload);

      const loaded = await adapter.load(id);
      expect(loaded).not.toBeNull();
      expect(loaded!.header.saveId).toBe(id);
      expect(loaded!.player.name).toBe('测试者');
    });

    it('覆盖写入：保存同名存档后加载最新数据', async () => {
      const adapter = await createAdapter();
      const id = 'idb_overwrite_' + Date.now();
      await adapter.save(makePayload(id));

      const v2 = makePayload(id);
      v2.player.name = '覆盖后名字';
      await adapter.save(v2);

      const loaded = await adapter.load(id);
      expect(loaded!.player.name).toBe('覆盖后名字');
    });

    it('无损保存 Brain 的错误信念、记忆、计划以及独立的长期身体状态', async () => {
      const adapter = await createAdapter();
      const id = 'idb_brain_' + Date.now();
      const payload = makePayload(id);
      const brain = createInitialBrainState({
        npcId: 'npc_brain',
        personalityId: 'cautious',
        aspiration: 'seekDao',
        birthYear: 1,
        birthMonth: 1,
      }, { year: 5, month: 6 });
      brain.beliefs.false_belief = {
        beliefId: 'false_belief',
        topic: 'intent',
        subject: { kind: 'npc', entityId: 'npc_other' },
        value: 'hostile',
        source: { type: 'hearsay' },
        observedAt: { year: 5, month: 6 },
        confidence: 0.6,
        status: 'active',
      };
      brain.memories.push({
        memoryId: 'memory_1', kind: 'rumor', at: { year: 5, month: 6 },
        participantIds: ['npc_other'], summary: '误信传闻', valence: -20, salience: 60,
      });
      brain.currentPlan = {
        planId: 'plan_1', goalId: brain.currentGoal!.goalId, status: 'active',
        steps: [{ stepId: 'step_1', capabilityId: 'investigate', status: 'pending', targets: [], reservationIds: [] }],
        currentStepIndex: 0, createdAt: { year: 5, month: 6 }, updatedAt: { year: 5, month: 6 }, revision: 1,
      };
      payload.worldState.npcs.npc_brain = { id: 'npc_brain', brain } as any;
      payload.worldState.conditions = {
        npc_brain: {
          injuries: [{ level: 'moderate', source: '旧战', acquiredAt: { year: 5, month: 5 } }],
          poisons: [], meridianDamage: 15,
        },
      };
      payload.worldState.facts = [{
        factId: 'fact_1', type: 'discovery', at: { year: 5, month: 6 }, participants: [],
        title: '秘境现世', description: '秘境真实出现', visibility: 'public',
      }];
      payload.worldState.resourceReservations = {
        reservation_1: {
          reservationId: 'reservation_1', ownerId: 'npc_brain', planId: 'plan_1',
          resource: { kind: 'action_slot', resourceId: 'npc_brain:5:6', amount: 1 },
          status: 'active', createdAt: { year: 5, month: 6 }, expiresAt: { year: 5, month: 7 },
        },
      };

      await adapter.save(payload);
      const loaded = await adapter.load(id);

      expect(loaded?.worldState.npcs.npc_brain?.brain).toEqual(brain);
      expect(loaded?.worldState.conditions?.npc_brain?.injuries[0]?.source).toBe('旧战');
      expect(loaded?.worldState.facts?.[0]?.factId).toBe('fact_1');
      expect(loaded?.worldState.resourceReservations?.reservation_1?.status).toBe('active');
    });

    it('加载不存在的存档返回 null', async () => {
      const adapter = await createAdapter();
      const result = await adapter.load('nonexistent_' + Date.now());
      expect(result).toBeNull();
    });

    it('未初始化时 save 抛错', async () => {
      const Adapter = await getAdapterClass();
      const adapter = new Adapter();
      await expect(adapter.save(makePayload('no_init'))).rejects.toThrowError('not initialized');
    });

    it('未初始化时 load 抛错', async () => {
      const Adapter = await getAdapterClass();
      const adapter = new Adapter();
      await expect(adapter.load('no_init')).rejects.toThrowError('not initialized');
    });
  });

  describe('listHeaders', () => {
    it('多个存档时列出所有 header（使用唯一 ID 隔离）', async () => {
      const adapter = await createAdapter();
      const prefix = 'lst_' + Date.now() + '_';
      await adapter.save(makePayload(prefix + '1'));
      await adapter.save(makePayload(prefix + '2'));
      await adapter.save(makePayload(prefix + '3'));

      const headers = await adapter.listHeaders();
      // 只过滤我们本次测试写入的数据
      const ours = headers.filter((h: any) => h.saveId.startsWith(prefix));
      expect(ours).toHaveLength(3);
      const ids = ours.map((h: any) => h.saveId).sort();
      expect(ids).toEqual([prefix + '1', prefix + '2', prefix + '3']);
    });

    it('未初始化时 listHeaders 抛错', async () => {
      const Adapter = await getAdapterClass();
      const adapter = new Adapter();
      await expect(adapter.listHeaders()).rejects.toThrowError('not initialized');
    });
  });

  describe('deleteSave', () => {
    it('删除后加载返回 null', async () => {
      const adapter = await createAdapter();
      const id = 'idb_del_' + Date.now();
      await adapter.save(makePayload(id));
      await adapter.deleteSave(id);
      const loaded = await adapter.load(id);
      expect(loaded).toBeNull();
    });

    it('删除不存在的存档不抛错', async () => {
      const adapter = await createAdapter();
      await expect(adapter.deleteSave('nonexistent_' + Date.now())).resolves.toBeUndefined();
    });

    it('删除一个存档不影响同一批次的另一个存档', async () => {
      const adapter = await createAdapter();
      const prefix = 'del_batch_' + Date.now() + '_';
      await adapter.save(makePayload(prefix + 'a'));
      await adapter.save(makePayload(prefix + 'b'));
      await adapter.deleteSave(prefix + 'a');

      const headers = await adapter.listHeaders();
      // 过滤本次写入的数据
      const ours = headers.filter((h: any) => h.saveId.startsWith(prefix));
      expect(ours).toHaveLength(1);
      expect(ours[0]!.saveId).toBe(prefix + 'b');
    });

    it('未初始化时 deleteSave 抛错', async () => {
      const Adapter = await getAdapterClass();
      const adapter = new Adapter();
      await expect(adapter.deleteSave('no_init')).rejects.toThrowError('not initialized');
    });
  });

  describe('全链路', () => {
    it('初始化→保存→列表→加载→删除→列表', async () => {
      const adapter = await createAdapter();
      const id = 'idb_full_' + Date.now();
      await adapter.save(makePayload(id));

      let headers = await adapter.listHeaders();
      const beforeDelete = headers.filter((h: any) => h.saveId === id);
      expect(beforeDelete).toHaveLength(1);

      const loaded = await adapter.load(id);
      expect(loaded!.header.saveId).toBe(id);

      await adapter.deleteSave(id);
      headers = await adapter.listHeaders();
      const afterDelete = headers.filter((h: any) => h.saveId === id);
      expect(afterDelete).toHaveLength(0);

      const afterLoadDelete = await adapter.load(id);
      expect(afterLoadDelete).toBeNull();
    });
  });
});
