import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';

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
    const consumed: { id: string; poison: number }[] = [];
    for (const matId of recipe.requiredMaterials) {
      const stack = character.inventory.find(s => s.item.id === matId)!;
      stack.count--;
      const poison = stack.item.poisonValence ?? 0;
      totalPoison += poison;
      consumed.push({ id: matId, poison });
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 阴阳平衡判定（|totalPoison| > yinYangThreshold → 毒丹）
    const isPoison = Math.abs(totalPoison) > recipe.yinYangThreshold;

    // 4. 成功率：基础成功率 × (1 + 悟性/200)
    const comprehensionBonus = character.attributes.comprehension / 200;
    const successRate = Math.min(0.95, recipe.baseSuccessRate + comprehensionBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 5. 产出
    const pillName = isPoison ? `毒${recipe.name}` : recipe.name;
    const pillItem: Item = {
      id: `PILL_${Date.now()}`,
      name: pillName,
      tier: recipe.tier,
      type: isPoison ? 'Poison' : 'Medicine',
      attributes: isPoison ? { poisonResist: -5 } : { spiritEnergyMax: recipe.tier * 50 },
      poisonValence: isPoison ? Math.abs(totalPoison) : 0,
    };

    return { success: true, pill: pillItem };
  }
}
