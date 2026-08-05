import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';

export interface ForgeResult {
  success: boolean;
  reason?: string;
  equipment?: Item;
}

export class ForgeEngine {
  static craft(character: Character, recipeName: string, auxMaterials: string[] = []): ForgeResult {
    const recipe = RecipeRegistry.getForgeRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    // 1. 主材检查
    const mainStack = character.inventory.find(s => s.item.id === recipe.mainMaterialId);
    if (!mainStack || mainStack.count < 1) {
      return { success: false, reason: `主材不足：${recipe.mainMaterialId}` };
    }
    mainStack.count--;

    // 2. 辅材检查与消耗
    const usedAux: Item[] = [];
    for (const auxId of auxMaterials.slice(0, 2)) {
      const stack = character.inventory.find(s => s.item.id === auxId);
      if (stack && stack.count >= 1) {
        stack.count--;
        usedAux.push(stack.item);
      }
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 成功率：基础 0.7 × (1 + 根骨/200) + 辅材加成
    const physiqueBonus = character.attributes.physique / 200;
    const auxBonus = usedAux.length * 0.1;
    const successRate = Math.min(0.95, 0.7 + physiqueBonus + auxBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 4. 产出（辅材提升属性）
    const attributes: Record<string, number> = { ...recipe.outputItem.attributes };
    for (const aux of usedAux) {
      if (aux.attributes.attack) attributes.attack = (attributes.attack ?? 0) + Math.floor((aux.attributes.attack ?? 0) * 0.5);
      if (aux.attributes.defense) attributes.defense = (attributes.defense ?? 0) + Math.floor((aux.attributes.defense ?? 0) * 0.5);
      if (aux.attributes.critRate) attributes.critRate = (attributes.critRate ?? 0) + Math.floor((aux.attributes.critRate ?? 0) * 0.3);
    }

    const equipment: Item = {
      id: `${recipe.outputItem.id}_${Date.now()}`,
      name: recipe.outputItem.name,
      tier: recipe.tier,
      type: 'Equipment',
      attributes,
    };

    return { success: true, equipment };
  }
}
