import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlayerStore } from '../player';
import type { BattleDelta, Item, Character } from '@taosim/contracts';

function makeItem(id: string): Item {
  return { id, name: id, type: 'Medicine', tier: 1, quality: 'Common', attributes: {} } as Item;
}

function makeCharacter(id: string, hp = 100): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10 },
    spiritRoot: { grade: 'Yellow', elements: ['Fire'], isVariant: false },
    gameMode: { breakthrough: 'Traditional', saveMode: 'Free' },
    hp, maxHp: 100, ap: 3, canFly: false,
    inventory: [{ item: makeItem('med1'), count: 3 }],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, spiritStones: 0,
    wantedLevels: {}, unlockedRecipes: [],
  } as Character;
}

function makeDelta(overrides: Partial<BattleDelta> = {}): BattleDelta {
  return {
    battleId: 'b1',
    baseRevision: 0,
    characterId: 'p',
    hpAfter: 70,
    spiritEnergyAfter: 30,
    apAfter: 1,
    skillCooldownsAfter: { s1: 2 },
    consumedItems: [{ itemId: 'med1', count: 1 }],
    rewards: { cultivationExp: 50, spiritStones: 10, items: [] },
    relationChanges: [],
    ...overrides,
  };
}

describe('commitBattleDelta', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function seedPlayer() {
    const store = usePlayerStore();
    store.setPlayer(makeCharacter('p'));
    return store;
  }

  it('成功提交：HP/灵力/AP/冷却/经验/灵石/道具扣除全部生效', () => {
    const store = seedPlayer();
    const result = store.commitBattleDelta(makeDelta());
    expect(result).toBe('Committed');
    const c = store.character!;
    expect(c.hp).toBe(70);
    expect(c.spiritEnergy.current).toBe(30);
    expect(c.ap).toBe(1);
    expect(c.skillCooldowns.s1).toBe(2);
    expect(c.cultivation.currentExp).toBe(50);
    expect(c.spiritStones).toBe(10);
    expect(c.inventory[0]!.count).toBe(2);
  });

  it('重复 battleId 提交返回 AlreadyCommitted，不重复奖励', () => {
    const store = seedPlayer();
    const delta = makeDelta();
    expect(store.commitBattleDelta(delta)).toBe('Committed');
    expect(store.commitBattleDelta(delta)).toBe('AlreadyCommitted');
    expect(store.character!.cultivation.currentExp).toBe(50);
    expect(store.character!.inventory[0]!.count).toBe(2);
  });

  it('版本冲突返回 VersionConflict，不做任何写入', () => {
    const store = seedPlayer();
    const delta = makeDelta({ baseRevision: 99 });
    expect(store.commitBattleDelta(delta)).toBe('VersionConflict');
    // 全字段零写入：HP/灵力/AP/经验/灵石/道具均不变（防半提交回归）
    const c = store.character!;
    expect(c.hp).toBe(100);
    expect(c.spiritEnergy.current).toBe(50);
    expect(c.ap).toBe(3);
    expect(c.cultivation.currentExp).toBe(0);
    expect(c.spiritStones).toBe(0);
    expect(c.inventory[0]!.count).toBe(3);
  });

  it('库存不足返回 InsufficientItems，不做任何写入', () => {
    const store = seedPlayer();
    const delta = makeDelta({ consumedItems: [{ itemId: 'med1', count: 99 }] });
    expect(store.commitBattleDelta(delta)).toBe('InsufficientItems');
    // 全字段零写入
    const c = store.character!;
    expect(c.hp).toBe(100);
    expect(c.spiritEnergy.current).toBe(50);
    expect(c.ap).toBe(3);
    expect(c.cultivation.currentExp).toBe(0);
    expect(c.spiritStones).toBe(0);
    expect(c.inventory[0]!.count).toBe(3);
  });

  it('关系好感度变化生效', () => {
    const store = seedPlayer();
    store.character!.relations = {
      npc1: { targetId: 'npc1', favorability: 10, hatred: 0, jealousy: 0, tags: [] },
    };
    const result = store.commitBattleDelta(makeDelta({ relationChanges: [{ targetId: 'npc1', favorabilityDelta: 5 }] }));
    expect(result).toBe('Committed');
    expect(store.character!.relations.npc1!.favorability).toBe(15);
  });

  it('奖励道具入包：已存在合并数量，不存在新增', () => {
    const store = seedPlayer();
    const existing = makeItem('med1');
    const reward = makeItem('new1');
    const delta = makeDelta({
      consumedItems: [],
      rewards: {
        cultivationExp: 0, spiritStones: 0,
        items: [{ item: existing, count: 2 }, { item: reward, count: 1 }],
      },
    });
    expect(store.commitBattleDelta(delta)).toBe('Committed');
    expect(store.character!.inventory.find(s => s.item.id === 'med1')!.count).toBe(5); // 3 + 2
    expect(store.character!.inventory.find(s => s.item.id === 'new1')!.count).toBe(1);
  });
});
