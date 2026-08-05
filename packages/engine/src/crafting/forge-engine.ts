import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';
import { QualityCalculator } from './quality-calculator.js';

export interface ForgeResult {
  success: boolean;
  reason?: string;
  equipment?: Item;
  message?: string;
}

export class ForgeEngine {
  static craft(character: Character, recipeName: string, auxMaterials: string[] = []): ForgeResult {
    const recipe = RecipeRegistry.getForgeRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    const mainStack = character.inventory.find(s => s.item.id === recipe.mainMaterialId || s.item.templateId === recipe.mainMaterialId);
    if (!mainStack || mainStack.count < 1) {
      return { success: false, reason: `主材不足：${recipe.mainMaterialId}` };
    }
    mainStack.count--;

    const usedAux: Item[] = [];
    for (const auxId of auxMaterials.slice(0, 2)) {
      const stack = character.inventory.find(s => s.item.id === auxId || s.item.templateId === auxId);
      if (stack && stack.count >= 1) {
        stack.count--;
        usedAux.push(stack.item);
      }
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    const physiqueBonus = character.attributes.physique / 200;
    const auxBonus = usedAux.length * 0.1;
    const successRate = Math.min(0.95, 0.7 + physiqueBonus + auxBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    const quality = QualityCalculator.rollQuality();

    const baseAttrs: Record<string, number> = { ...recipe.outputItem.attributes };
    for (const aux of usedAux) {
      if (aux.attributes.attack) baseAttrs.attack = (baseAttrs.attack ?? 0) + Math.floor((aux.attributes.attack ?? 0) * 0.5);
      if (aux.attributes.defense) baseAttrs.defense = (baseAttrs.defense ?? 0) + Math.floor((aux.attributes.defense ?? 0) * 0.5);
    }
    const qualityMult = quality === 'Common' ? 1.0 : quality === 'Rare' ? 1.5 : quality === 'Epic' ? 2.5 : 5.0;
    const finalAttrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseAttrs)) {
      finalAttrs[k] = Math.floor(v * qualityMult);
    }

    const equipment: Item = {
      id: `${recipe.outputItem.id}_${Date.now()}`,
      templateId: recipe.outputItem.id,
      name: recipe.outputItem.name,
      tier: recipe.tier,
      type: 'Equipment',
      attributes: finalAttrs,
      quality,
      durability: { current: 100, max: 100 },
    };

    if (quality === 'Legendary') {
      equipment.specialEffect = QualityCalculator.rollSpecialEffect();
    }

    return { success: true, equipment };
  }

  static craftMaster(character: Character, recipeName: string): ForgeResult {
    const recipe = RecipeRegistry.getForgeRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    const masterSpiritCost = (recipe.tier ?? 2) * 1000;
    if (character.spiritStones < masterSpiritCost) {
      return { success: false, reason: `灵石不足，需要 ${masterSpiritCost}` };
    }

    const mainStack = character.inventory.find(s => s.item.id === recipe.mainMaterialId || s.item.templateId === recipe.mainMaterialId);
    if (!mainStack || mainStack.count < 2) {
      return { success: false, reason: `主材不足（大师锻造需 2 份）：${recipe.mainMaterialId}` };
    }
    mainStack.count -= 2;
    character.spiritStones -= masterSpiritCost;
    character.inventory = character.inventory.filter(s => s.count > 0);

    const masteryBonus = character.attributes.physique / 300;
    const baseSuccessRate = Math.min(0.95, 0.75 + masteryBonus);
    if (Math.random() > baseSuccessRate) {
      return { success: false, reason: '大师锻造失败！材料与灵石化为灰烬', message: '大师锻造失败！材料与灵石化为灰烬' };
    }

    const quality = QualityCalculator.rollQualityMaster();

    const baseAttrs: Record<string, number> = { ...recipe.outputItem.attributes };
    const qualityMult = quality === 'Rare' ? 1.5 : quality === 'Epic' ? 2.5 : 5.0;
    const finalAttrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseAttrs)) {
      finalAttrs[k] = Math.floor(v * qualityMult);
    }

    const equipment: Item = {
      id: `${recipe.outputItem.id}_MASTER_${Date.now()}`,
      templateId: recipe.outputItem.id,
      name: recipe.outputItem.name,
      tier: recipe.tier,
      type: 'Equipment',
      attributes: finalAttrs,
      quality,
      durability: { current: 100, max: 100 },
    };

    if (quality === 'Legendary') {
      equipment.specialEffect = QualityCalculator.rollSpecialEffect();
    }

    return { success: true, equipment, message: '大师手笔，宝物出世！' };
  }
}
