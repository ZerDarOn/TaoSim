import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';
import { QualityCalculator } from './quality-calculator.js';
import { RESTORE_MULTIPLIER, BREAKTHROUGH_BONUS, LIFESPAN_MULTIPLIER } from './pill-effect-table.js';

export interface CraftResult {
  success: boolean;
  reason?: string;
  pill?: Item;
}

export class AlchemyEngine {
  static craftPill(character: Character, recipeName: string): CraftResult {
    const recipe = RecipeRegistry.getPillRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    // 1. 材料检查
    for (const matId of recipe.requiredMaterials) {
      const stack = character.inventory.find(s => s.item.id === matId);
      if (!stack || stack.count < 1) return { success: false, reason: `材料不足：${matId}` };
    }

    // 2. 消耗材料 + 收集毒性
    let totalPoison = 0;
    for (const matId of recipe.requiredMaterials) {
      const stack = character.inventory.find(s => s.item.id === matId)!;
      stack.count--;
      totalPoison += stack.item.poisonValence ?? 0;
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 阴阳平衡判定（|totalPoison| > yinYangThreshold → 毒丹）
    const isPoison = Math.abs(totalPoison) > recipe.yinYangThreshold;

    // 4. 成功率：基础成功率 + 悟性加成
    const comprehensionBonus = character.attributes.comprehension / 200;
    const successRate = Math.min(0.95, recipe.baseSuccessRate + comprehensionBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 5. 品质 roll（丹药专用分布：C50/R30/E15/L5）
    const quality = QualityCalculator.rollPillQuality();

    // 6. pillCategory 推断: 0=Restore, 1=Breakthrough, 2=Lifespan
    //    基于配方 id（与突破 requiredItems 对齐），比按名称匹配更可靠
    const BREAKTHROUGH_RECIPE_IDS = new Set([
      'RECIPE_FOUNDATION_PILL', 'RECIPE_GOLDEN_CORE_PILL',
      'RECIPE_NASCENT_SOUL_PILL', 'RECIPE_SOUL_FORMATION_PILL',
    ]);
    let pillCategory = 0;
    if (BREAKTHROUGH_RECIPE_IDS.has(recipe.id)) pillCategory = 1;
    else if (recipe.id.includes('LONGEVITY')) pillCategory = 2;

    // 7. 产出
    const pillName = isPoison ? `毒${recipe.name}` : recipe.name;
    const baseEffect = recipe.tier * 50;
    const pillItem: Item = {
      id: `PILL_${Date.now()}`,
      templateId: recipe.id,
      name: pillName,
      tier: recipe.tier,
      type: isPoison ? 'Poison' : 'Medicine',
      attributes: isPoison
        ? { poisonResist: -5, pillCategory, effectValue: Math.abs(totalPoison) } as Item['attributes']
        : { spiritEnergyMax: baseEffect, pillCategory, effectValue: baseEffect } as Item['attributes'],
      poisonValence: isPoison ? Math.abs(totalPoison) : 0,
      quality,
    };

    return { success: true, pill: pillItem };
  }

  static getPillEffect(pill: Item): number {
    const attrs = pill.attributes as Record<string, number>;
    const category = attrs.pillCategory ?? 0;
    const quality = pill.quality ?? 'Common';

    if (category === 1) {
      // Breakthrough: 固定百分比加成
      return BREAKTHROUGH_BONUS[quality];
    }

    const baseValue = attrs.effectValue ?? 50;

    if (category === 2) {
      // Lifespan: 基准年 × 倍率
      return Math.floor(baseValue * LIFESPAN_MULTIPLIER[quality]);
    }

    // Restore: 基准 × 倍率（Common 因丹毒打折）
    return Math.floor(baseValue * RESTORE_MULTIPLIER[quality]);
  }
}
