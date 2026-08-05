import { describe, it, expect } from 'vitest';
import { RecipeRegistry } from '../crafting/recipe-registry.js';

describe('RecipeRegistry', () => {
  it('根据丹药名称查询配方', () => {
    const recipe = RecipeRegistry.getPillRecipe('筑基丹');
    expect(recipe).toBeDefined();
    expect(recipe!.name).toBe('筑基丹');
    expect(recipe!.requiredMaterials.length).toBeGreaterThan(0);
    expect(recipe!.tier).toBe(2);
  });

  it('未知道丹药返回 null', () => {
    expect(RecipeRegistry.getPillRecipe('不存在的丹药')).toBeNull();
  });

  it('根据法宝名称查询炼器配方', () => {
    const recipe = RecipeRegistry.getForgeRecipe('灵蕴剑');
    expect(recipe).toBeDefined();
    expect(recipe!.name).toBe('灵蕴剑');
    expect(recipe!.tier).toBe(2);
  });

  it('列出所有已注册的丹药配方', () => {
    const all = RecipeRegistry.listPillRecipes();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});

describe('RecipeRegistry unlock system', () => {
  it('getUnlockedRecipes 返回默认解锁的配方', () => {
    const { pills, forges } = RecipeRegistry.getUnlockedRecipes([]);
    // 聚气丹默认解锁
    expect(pills.some(r => r.id === 'RECIPE_QI_PILL')).toBe(true);
    // 筑基丹不默认解锁
    expect(pills.some(r => r.id === 'RECIPE_FOUNDATION_PILL')).toBe(false);
    // 锻造配方默认全锁
    expect(forges.length).toBe(0);
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
