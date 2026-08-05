import { describe, it, expect } from 'vitest';
import { RecipeRegistry } from '../crafting/recipe-registry.js';
import { ContentRegistry } from '../content/content-registry.js';

// 确保扩展数据已加载（测试不经过 index.ts 的自动加载）
ContentRegistry.loadAll();

describe('RecipeRegistry', () => {
  it('根据 id 查询丹方', () => {
    const recipe = RecipeRegistry.getPillRecipe('RECIPE_FOUNDATION_PILL');
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe('筑基丹');
    expect(recipe!.requiredMaterials.length).toBeGreaterThan(0);
    expect(recipe!.tier).toBe(2);
  });

  it('未知道丹方返回 null', () => {
    expect(RecipeRegistry.getPillRecipe('RECIPE_NONEXISTENT')).toBeNull();
  });

  it('根据 id 查询炼器配方', () => {
    const recipe = RecipeRegistry.getForgeRecipe('RECIPE_SPIRIT_SWORD');
    expect(recipe).not.toBeNull();
    expect(recipe!.name).toBe('灵蕴剑');
    expect(recipe!.tier).toBe(2);
  });

  it('兼容 name 查找 API', () => {
    const recipe = RecipeRegistry.getPillRecipeByName('筑基丹');
    expect(recipe).not.toBeNull();
    expect(recipe!.id).toBe('RECIPE_FOUNDATION_PILL');
  });

  it('列出所有已注册的丹方（内置 + 扩展）', () => {
    const all = RecipeRegistry.listPillRecipes();
    // 3 内置 + 15 扩展 = 18
    expect(all.length).toBeGreaterThanOrEqual(3);
    // 确认扩展配方已注册
    expect(all.some(r => r.id === 'RECIPE_BLOOD_PILL')).toBe(true);
  });
});

describe('RecipeRegistry unlock system', () => {
  it('getUnlockedRecipes 返回默认解锁的配方', () => {
    const { pills, forges } = RecipeRegistry.getUnlockedRecipes([]);
    // 聚气丹默认解锁
    expect(pills.some(r => r.id === 'RECIPE_QI_PILL')).toBe(true);
    // 筑基丹不默认解锁
    expect(pills.some(r => r.id === 'RECIPE_FOUNDATION_PILL')).toBe(false);
    // 基础锻造配方可能默认解锁 0-1 个
    expect(forges.length).toBeLessThanOrEqual(1);
  });

  it('getUnlockedRecipes 返回额外解锁的配方', () => {
    const { pills, forges } = RecipeRegistry.getUnlockedRecipes(['RECIPE_FOUNDATION_PILL', 'RECIPE_SPIRIT_SWORD']);
    expect(pills.some(r => r.id === 'RECIPE_QI_PILL')).toBe(true);       // 默认
    expect(pills.some(r => r.id === 'RECIPE_FOUNDATION_PILL')).toBe(true); // 额外解锁
    expect(forges.some(r => r.id === 'RECIPE_SPIRIT_SWORD')).toBe(true);
  });

  it('getLockedRecipeIds 返回未解锁的配方 id', () => {
    const locked = RecipeRegistry.getLockedRecipeIds([]);
    expect(locked).toContain('RECIPE_FOUNDATION_PILL');
    expect(locked).toContain('RECIPE_LONGEVITY_PILL');
    expect(locked).toContain('RECIPE_SPIRIT_SWORD');
    expect(locked).not.toContain('RECIPE_QI_PILL');  // 默认解锁
  });

  it('getLockedRecipeIds 排除已解锁的', () => {
    const locked = RecipeRegistry.getLockedRecipeIds(['RECIPE_FOUNDATION_PILL']);
    expect(locked).not.toContain('RECIPE_FOUNDATION_PILL');
  });
});
