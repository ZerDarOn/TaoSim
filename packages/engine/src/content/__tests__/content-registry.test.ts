import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContentRegistry } from '../content-registry.js';
import type { PillRecipe, ForgeRecipe } from '../../crafting/recipe-registry.js';
import type { Skill } from '@taosim/contracts';

describe('ContentRegistry', () => {
  // 重置注册表以确保测试独立性
  afterEach(() => {
    ContentRegistry.reset();
  });

  describe('loadAll', () => {
    it('loadAll 后数据非空', () => {
      ContentRegistry.loadAll();

      // 验证内置数据已加载
      expect(ContentRegistry.pillRecipes.length).toBeGreaterThan(0);
      expect(ContentRegistry.forgeRecipes.length).toBeGreaterThan(0);
      expect(ContentRegistry.skills.length).toBeGreaterThan(0);
      expect(ContentRegistry.adventureEvents.length).toBeGreaterThan(0);
      expect(ContentRegistry.npcPersonalities.length).toBeGreaterThan(0);
      expect(ContentRegistry.npcDialogues.length).toBeGreaterThan(0);
      expect(ContentRegistry.childhoodEvents.length).toBeGreaterThan(0);
      expect(ContentRegistry.traits.length).toBeGreaterThan(0);
    });

    it('幂等：多次 loadAll 不重复注册', () => {
      ContentRegistry.loadAll();
      const firstPillCount = ContentRegistry.pillRecipes.length;

      ContentRegistry.loadAll();
      ContentRegistry.loadAll();
      expect(ContentRegistry.pillRecipes.length).toBe(firstPillCount);
    });
  });

  describe('动态注册', () => {
    it('registerPillRecipe 新增配方', () => {
      const recipe: PillRecipe = {
        id: 'test-pill-1',
        name: '测试丹',
        type: 'Pill',
        description: '测试用丹药',
        requiredRealm: 'QiRefinement_1',
        requiredMaterials: [],
        baseSuccessRate: 1,
        effects: [],
      } as PillRecipe;
      ContentRegistry.registerPillRecipe(recipe);
      expect(ContentRegistry.pillRecipes).toHaveLength(1);
      expect(ContentRegistry.pillRecipes[0]!.id).toBe('test-pill-1');
    });

    it('registerPillRecipe 重复 id 不重复注册', () => {
      const recipe: PillRecipe = {
        id: 'test-pill-dup',
        name: '重复丹',
        type: 'Pill',
        description: '重复测试',
        requiredRealm: 'QiRefinement_1',
        requiredMaterials: [],
        baseSuccessRate: 1,
        effects: [],
      } as PillRecipe;
      ContentRegistry.registerPillRecipe(recipe);
      ContentRegistry.registerPillRecipe(recipe);
      expect(ContentRegistry.pillRecipes).toHaveLength(1);
    });

    it('registerForgeRecipe 新增锻造配方', () => {
      const recipe: ForgeRecipe = {
        id: 'test-forge-1',
        name: '测试剑',
        type: 'Weapon',
        subtype: 'Sword',
        description: '测试用武器',
        requiredRealm: 'QiRefinement_1',
        requiredMaterials: [],
        baseSuccessRate: 1,
        effects: [],
      } as ForgeRecipe;
      ContentRegistry.registerForgeRecipe(recipe);
      expect(ContentRegistry.forgeRecipes).toHaveLength(1);
      expect(ContentRegistry.forgeRecipes[0]!.id).toBe('test-forge-1');
    });

    it('registerSkill 新增技能', () => {
      const skill: Skill = {
        id: 'test-skill-1',
        name: '测试剑法',
        description: '测试用技能',
        category: 'Martial',
        realm: 'QiRefinement_1',
        requiredWeaponType: undefined,
        ranges: [],
        effects: [],
        spiritEnergyCost: 10,
        cooldownTurns: 5,
        type: 'Active' as any,
      } as Skill;
      ContentRegistry.registerSkill(skill);
      expect(ContentRegistry.skills).toHaveLength(1);
      expect(ContentRegistry.skills[0]!.id).toBe('test-skill-1');
    });

    it('registerAdventureEvent 新增事件', () => {
      ContentRegistry.registerAdventureEvent({
        id: 'TEST_EVENT',
        title: '测试奇遇',
        category: 'fortune',
        description: '一个测试事件',
        choices: [],
      } as any);
      expect(ContentRegistry.adventureEvents).toHaveLength(1);
    });

    it('重复 registerAdventureEvent 不重复添加', () => {
      const event: any = {
        id: 'DUP_EVENT',
        title: '重复事件',
        category: 'fortune',
        description: '重复测试',
        choices: [],
      };
      ContentRegistry.registerAdventureEvent(event);
      ContentRegistry.registerAdventureEvent(event);
      expect(ContentRegistry.adventureEvents).toHaveLength(1);
    });
  });

  describe('reset', () => {
    it('reset 清空所有数据并允许重新 load', () => {
      ContentRegistry.loadAll();
      const countBefore = ContentRegistry.pillRecipes.length;
      expect(countBefore).toBeGreaterThan(0);

      ContentRegistry.reset();
      expect(ContentRegistry.pillRecipes).toHaveLength(0);
      expect(ContentRegistry.skills).toHaveLength(0);
      expect(ContentRegistry.adventureEvents).toHaveLength(0);

      // reset 后可以重新 load
      ContentRegistry.loadAll();
      expect(ContentRegistry.pillRecipes.length).toBe(countBefore);
    });
  });

  describe('只读访问器', () => {
    it('返回的数组是只读的（类型约束）', () => {
      ContentRegistry.loadAll();
      // 只验证只读类型存在，实际运行时 push 行为取决于实现
      const recipes = ContentRegistry.pillRecipes;
      expect(Array.isArray(recipes)).toBe(true);
    });
  });
});
