export interface PillRecipe {
  type: 'pill';
  id: string;
  name: string;
  tier: number;
  requiredMaterials: string[];       // item IDs
  yinYangThreshold: number;          // 阴阳平衡安全区间上限
  baseSuccessRate: number;
}

export interface ForgeRecipe {
  type: 'forge';
  id: string;
  name: string;
  tier: number;
  mainMaterialId: string;            // 主材 item ID
  optionalAuxMaterials: string[];    // 辅材 item IDs（至多 2 种）
  outputItem: {
    id: string;
    name: string;
    type: 'Equipment';
    attributes: Record<string, number>;
  };
}

const PILL_RECIPES: PillRecipe[] = [
  {
    type: 'pill', id: 'RECIPE_FOUNDATION_PILL', name: '筑基丹', tier: 2,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_YIN_DEW', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.5, baseSuccessRate: 0.7,
  },
  {
    type: 'pill', id: 'RECIPE_QI_PILL', name: '聚气丹', tier: 1,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_BLOOD_FLOWER'],
    yinYangThreshold: 0.6, baseSuccessRate: 0.9,
  },
  {
    type: 'pill', id: 'RECIPE_LONGEVITY_PILL', name: '延寿丹', tier: 3,
    requiredMaterials: ['MAT_YIN_DEW', 'MAT_YANG_STONE', 'MAT_DRAGON_BLOOD', 'MAT_PHOENIX_FEATHER'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.4,
  },
];

const FORGE_RECIPES: ForgeRecipe[] = [
  {
    type: 'forge', id: 'RECIPE_SPIRIT_SWORD', name: '灵蕴剑', tier: 2,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: ['MAT_SPIRIT_STONE'],
    outputItem: { id: 'ITEM_SPIRIT_SWORD', name: '灵蕴剑', type: 'Equipment', attributes: { attack: 15, critRate: 5 } },
  },
  {
    type: 'forge', id: 'RECIPE_SPIRIT_ARMOR', name: '灵甲', tier: 2,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: ['MAT_JADE'],
    outputItem: { id: 'ITEM_SPIRIT_ARMOR', name: '灵甲', type: 'Equipment', attributes: { defense: 10, physique: 2 } },
  },
  {
    type: 'forge', id: 'RECIPE_STAR_SWORD', name: '星辰剑', tier: 3,
    mainMaterialId: 'MAT_METEORITE',
    optionalAuxMaterials: ['MAT_SPIRIT_STONE', 'MAT_STARLIGHT'],
    outputItem: { id: 'ITEM_STAR_SWORD', name: '星辰剑', type: 'Equipment', attributes: { attack: 30, critRate: 10, agility: 3 } },
  },
];

export class RecipeRegistry {
  static getPillRecipe(name: string): PillRecipe | null {
    return PILL_RECIPES.find(r => r.name === name) ?? null;
  }

  static getForgeRecipe(name: string): ForgeRecipe | null {
    return FORGE_RECIPES.find(r => r.name === name) ?? null;
  }

  static listPillRecipes(): PillRecipe[] {
    return [...PILL_RECIPES];
  }

  static listForgeRecipes(): ForgeRecipe[] {
    return [...FORGE_RECIPES];
  }
}
