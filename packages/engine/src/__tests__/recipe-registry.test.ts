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
