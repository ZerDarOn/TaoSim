import { ContentRegistry } from '../content/content-registry.js';

export interface PillRecipe {
  type: 'pill';
  id: string;
  name: string;
  tier: number;
  requiredMaterials: string[];       // item IDs
  yinYangThreshold: number;          // 阴阳平衡安全区间上限
  baseSuccessRate: number;
  unlockedByDefault?: boolean;
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
  unlockedByDefault?: boolean;
}

// ---- 内置基础配方（无法被移除的核心配方） ----
const BUILTIN_PILL_RECIPES: PillRecipe[] = [
  {
    type: 'pill', id: 'RECIPE_FOUNDATION_PILL', name: '筑基丹', tier: 2,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_YIN_DEW', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.5, baseSuccessRate: 0.7,
  },
  {
    type: 'pill', id: 'RECIPE_QI_PILL', name: '聚气丹', tier: 1,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_BLOOD_FLOWER'],
    yinYangThreshold: 0.6, baseSuccessRate: 0.9,
    unlockedByDefault: true,
  },
  {
    type: 'pill', id: 'RECIPE_LONGEVITY_PILL', name: '延寿丹', tier: 3,
    requiredMaterials: ['MAT_YIN_DEW', 'MAT_YANG_STONE', 'MAT_DRAGON_BLOOD', 'MAT_PHOENIX_FEATHER'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.4,
  },
  {
    type: 'pill', id: 'RECIPE_GOLDEN_CORE_PILL', name: '金丹丹', tier: 3,
    requiredMaterials: ['MAT_DRAGON_BLOOD', 'MAT_PHOENIX_FEATHER', 'MAT_METEORITE', 'MAT_STARLIGHT'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.5,
  },
  {
    type: 'pill', id: 'RECIPE_NASCENT_SOUL_PILL', name: '凝婴丹', tier: 4,
    requiredMaterials: ['MAT_MILLENNIUM_LINGZHI', 'MAT_SKY_GOLD_SAND', 'MAT_DRAGON_BLOOD'],
    yinYangThreshold: 0.3, baseSuccessRate: 0.3,
  },
  {
    type: 'pill', id: 'RECIPE_SOUL_FORMATION_PILL', name: '化神丹', tier: 5,
    requiredMaterials: ['MAT_MILLENNIUM_LINGZHI', 'MAT_SKY_GOLD_SAND', 'MAT_IMMORTAL_JADE', 'MAT_CHAOS_STONE'],
    yinYangThreshold: 0.3, baseSuccessRate: 0.2,
  },
];

const BUILTIN_FORGE_RECIPES: ForgeRecipe[] = [
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

/**
 * 配方注册中心。
 *
 * 数据来源：
 *   1. BUILTIN_*（引擎内置核心配方，不可移除）
 *   2. ContentRegistry（data/ 目录下通过约定导出注册的扩展配方）
 *
 * 新增配方只需在 data/ 目录下创建文件并导出 PILL_RECIPES_EXPANSION / FORGE_RECIPES_EXPANSION。
 */
export class RecipeRegistry {
  /** 获取所有丹方（内置 + 注册） */
  static getAllPillRecipes(): PillRecipe[] {
    return [...BUILTIN_PILL_RECIPES, ...ContentRegistry.pillRecipes];
  }

  static getAllForgeRecipes(): ForgeRecipe[] {
    return [...BUILTIN_FORGE_RECIPES, ...ContentRegistry.forgeRecipes];
  }

  /**
   * 按 id 查找丹方。
   * 兼容：如果传入的不是 id，会自动尝试按 name 查找。
   */
  static getPillRecipe(idOrName: string): PillRecipe | null {
    return this.getAllPillRecipes().find(r => r.id === idOrName)
      ?? this.getAllPillRecipes().find(r => r.name === idOrName)
      ?? null;
  }

  /**
   * 按 id 查找炼器配方。
   * 兼容：如果传入的不是 id，会自动尝试按 name 查找。
   */
  static getForgeRecipe(idOrName: string): ForgeRecipe | null {
    return this.getAllForgeRecipes().find(r => r.id === idOrName)
      ?? this.getAllForgeRecipes().find(r => r.name === idOrName)
      ?? null;
  }

  /** 旧 API 兼容：按 name 查找 */
  static getPillRecipeByName(name: string): PillRecipe | null {
    return this.getAllPillRecipes().find(r => r.name === name) ?? null;
  }

  static getForgeRecipeByName(name: string): ForgeRecipe | null {
    return this.getAllForgeRecipes().find(r => r.name === name) ?? null;
  }

  static listPillRecipes(): PillRecipe[] {
    return this.getAllPillRecipes();
  }

  static listForgeRecipes(): ForgeRecipe[] {
    return this.getAllForgeRecipes();
  }

  static getUnlockedRecipes(unlockedIds: string[]): { pills: PillRecipe[]; forges: ForgeRecipe[] } {
    const allPills = this.getAllPillRecipes();
    const allForges = this.getAllForgeRecipes();
    return {
      pills: allPills.filter(r => r.unlockedByDefault || unlockedIds.includes(r.id)),
      forges: allForges.filter(r => r.unlockedByDefault || unlockedIds.includes(r.id)),
    };
  }

  static getLockedRecipeIds(unlockedIds: string[]): string[] {
    const allPills = this.getAllPillRecipes();
    const allForges = this.getAllForgeRecipes();
    return [
      ...allPills.filter(r => !r.unlockedByDefault && !unlockedIds.includes(r.id)).map(r => r.id),
      ...allForges.filter(r => !r.unlockedByDefault && !unlockedIds.includes(r.id)).map(r => r.id),
    ];
  }
}
