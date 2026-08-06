// ============================================================
// 任务 1：丹方与锻造配方扩充
// 15 个新丹方 + 12 个新锻造配方
// 交付后与主配方表（crafting/recipe-registry.ts）合并使用
// ============================================================

import type { AttributeMap } from '@taosim/contracts';

// ---- 丹方（与主配方表格式保持一致）----
export interface PillRecipe {
  type: 'pill';
  id: string;                    // 如 'RECIPE_BLOOD_PILL'
  name: string;                  // 如 '活血丹'
  tier: number;                  // 1-5 阶
  requiredMaterials: string[];   // 材料 id，从材料池中选
  yinYangThreshold: number;      // 0-1，阴阳平衡阈值，越低越难炼
  baseSuccessRate: number;       // 0-1
  unlockedByDefault?: boolean;   // 只有最基础的设 true
}

// ---- 锻造配方 ----
export interface ForgeRecipe {
  type: 'forge';
  id: string;
  name: string;
  tier: number;
  mainMaterialId: string;            // 主材 id
  optionalAuxMaterials: string[];    // 辅材 id（至多 2 种）
  outputItem: {
    id: string;
    name: string;
    type: 'Equipment';
    attributes: AttributeMap;
  };
  unlockedByDefault?: boolean;
}

export const PILL_RECIPES_EXPANSION: PillRecipe[] = [
  // ==================== 一阶丹药（成功率 0.8-0.95）====================
  {
    type: 'pill', id: 'RECIPE_BLOOD_PILL', name: '活血丹', tier: 1,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_BLOOD_FLOWER'],
    yinYangThreshold: 0.7, baseSuccessRate: 0.95,
    unlockedByDefault: true,   // 最基础的疗伤丹，开局可炼
  },
  {
    type: 'pill', id: 'RECIPE_CLEAR_SOUL_PILL', name: '清心丹', tier: 1,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_YIN_DEW'],
    yinYangThreshold: 0.65, baseSuccessRate: 0.85,
  },
  {
    type: 'pill', id: 'RECIPE_TONIFY_PILL', name: '培元丹', tier: 1,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.6, baseSuccessRate: 0.8,
  },

  // ==================== 二阶丹药（成功率 0.6-0.8）====================
  {
    type: 'pill', id: 'RECIPE_ANTIDOTE_PILL', name: '解毒丹', tier: 2,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_BLOOD_FLOWER', 'MAT_YIN_DEW'],
    yinYangThreshold: 0.55, baseSuccessRate: 0.75,
  },
  {
    type: 'pill', id: 'RECIPE_QI_CONDENSE_PILL', name: '凝气丹', tier: 2,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_YIN_DEW', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.5, baseSuccessRate: 0.7,
  },
  {
    type: 'pill', id: 'RECIPE_REVIVE_PILL', name: '回春丹', tier: 2,
    requiredMaterials: ['MAT_BLOOD_FLOWER', 'MAT_YIN_DEW', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.5, baseSuccessRate: 0.65,
  },
  {
    type: 'pill', id: 'RECIPE_MERIDIAN_PILL', name: '护脉丹', tier: 2,
    requiredMaterials: ['MAT_YIN_DEW', 'MAT_YANG_STONE', 'MAT_IRON_ORE'],
    yinYangThreshold: 0.45, baseSuccessRate: 0.6,
  },

  // ==================== 三阶丹药（成功率 0.4-0.6）====================
  {
    type: 'pill', id: 'RECIPE_MARROW_WASH_PILL', name: '洗髓丹', tier: 3,
    requiredMaterials: ['MAT_SPIRIT_STONE', 'MAT_JADE', 'MAT_BLOOD_FLOWER', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.45, baseSuccessRate: 0.55,
  },
  {
    type: 'pill', id: 'RECIPE_BARRIER_PILL', name: '破障丹', tier: 3,
    requiredMaterials: ['MAT_SPIRIT_STONE', 'MAT_JADE', 'MAT_DRAGON_BLOOD'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.5,
  },
  {
    type: 'pill', id: 'RECIPE_BONE_FORGE_PILL', name: '锻骨丹', tier: 3,
    requiredMaterials: ['MAT_JADE', 'MAT_METEORITE', 'MAT_DRAGON_BLOOD'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.45,
  },
  {
    type: 'pill', id: 'RECIPE_SPIRIT_LINK_PILL', name: '通灵丹', tier: 3,
    requiredMaterials: ['MAT_SPIRIT_STONE', 'MAT_JADE', 'MAT_YIN_DEW', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.5,
  },

  // ==================== 四阶丹药（成功率 0.2-0.4）====================
  {
    type: 'pill', id: 'RECIPE_NINE_TURN_SOUL_PILL', name: '九转还魂丹', tier: 4,
    requiredMaterials: ['MAT_DRAGON_BLOOD', 'MAT_PHOENIX_FEATHER', 'MAT_METEORITE', 'MAT_JADE'],
    yinYangThreshold: 0.3, baseSuccessRate: 0.35,
  },
  {
    type: 'pill', id: 'RECIPE_DRAGON_BODY_PILL', name: '龙血锻体丹', tier: 4,
    requiredMaterials: ['MAT_DRAGON_BLOOD', 'MAT_METEORITE', 'MAT_SPIRIT_STONE', 'MAT_JADE', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.3, baseSuccessRate: 0.3,
  },
  {
    type: 'pill', id: 'RECIPE_SKY_BREAK_PILL', name: '天元破境丹', tier: 4,
    requiredMaterials: ['MAT_PHOENIX_FEATHER', 'MAT_METEORITE', 'MAT_DRAGON_BLOOD', 'MAT_STARLIGHT'],
    yinYangThreshold: 0.25, baseSuccessRate: 0.25,
  },

  // ==================== 五阶丹药（传说级，成功率 0.1-0.2）====================
  {
    type: 'pill', id: 'RECIPE_CHAOS_NINE_TURN_PILL', name: '混沌九转丹', tier: 5,
    requiredMaterials: ['MAT_STARLIGHT', 'MAT_PHOENIX_FEATHER', 'MAT_DRAGON_BLOOD', 'MAT_METEORITE', 'MAT_JADE'],
    yinYangThreshold: 0.15, baseSuccessRate: 0.12,
  },
];

export const FORGE_RECIPES_EXPANSION: ForgeRecipe[] = [
  // ==================== 一阶锻造（attack/defense 5-8）====================
  {
    type: 'forge', id: 'RECIPE_IRON_SWORD', name: '青锋剑', tier: 1,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: [],
    outputItem: { id: 'ITEM_IRON_SWORD', name: '青锋剑', type: 'Equipment', attributes: { attack: 8 } },
    unlockedByDefault: true,   // 最基础的兵器，开局可锻造
  },
  {
    type: 'forge', id: 'RECIPE_SPIRIT_CLOTH', name: '灵草布衣', tier: 1,
    mainMaterialId: 'MAT_SPIRIT_GRASS',
    optionalAuxMaterials: [],
    outputItem: { id: 'ITEM_SPIRIT_CLOTH', name: '灵草布衣', type: 'Equipment', attributes: { defense: 6 } },
  },

  // ==================== 二阶锻造（attack/defense 10-20）====================
  {
    type: 'forge', id: 'RECIPE_COLD_MOON_BLADE', name: '冷月玄刀', tier: 2,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: ['MAT_YIN_DEW'],
    outputItem: { id: 'ITEM_COLD_MOON_BLADE', name: '冷月玄刀', type: 'Equipment', attributes: { attack: 15, critRate: 3 } },
  },
  {
    type: 'forge', id: 'RECIPE_WIND_SPEAR', name: '破风枪', tier: 2,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: ['MAT_YANG_STONE'],
    outputItem: { id: 'ITEM_WIND_SPEAR', name: '破风枪', type: 'Equipment', attributes: { attack: 14, agility: 2 } },
  },
  {
    type: 'forge', id: 'RECIPE_YIN_YANG_ROBE', name: '阴阳道袍', tier: 2,
    mainMaterialId: 'MAT_SPIRIT_GRASS',
    optionalAuxMaterials: ['MAT_YIN_DEW', 'MAT_YANG_STONE'],
    outputItem: { id: 'ITEM_YIN_YANG_ROBE', name: '阴阳道袍', type: 'Equipment', attributes: { defense: 12, spiritEnergyMax: 20 } },
  },

  // ==================== 三阶锻造（attack/defense 20-35）====================
  {
    type: 'forge', id: 'RECIPE_HEAVEN_GANG_SWORD', name: '天罡剑', tier: 3,
    mainMaterialId: 'MAT_JADE',
    optionalAuxMaterials: ['MAT_SPIRIT_STONE', 'MAT_YANG_STONE'],
    outputItem: { id: 'ITEM_HEAVEN_GANG_SWORD', name: '天罡剑', type: 'Equipment', attributes: { attack: 28, critRate: 8 } },
  },
  {
    type: 'forge', id: 'RECIPE_XUAN_GUI_ARMOR', name: '玄龟宝甲', tier: 3,
    mainMaterialId: 'MAT_JADE',
    optionalAuxMaterials: ['MAT_IRON_ORE'],
    outputItem: { id: 'ITEM_XUAN_GUI_ARMOR', name: '玄龟宝甲', type: 'Equipment', attributes: { defense: 25, physique: 5 } },
  },
  {
    type: 'forge', id: 'RECIPE_GOLD_SCALE_BOOTS', name: '金鳞灵靴', tier: 3,
    mainMaterialId: 'MAT_SPIRIT_STONE',
    optionalAuxMaterials: ['MAT_JADE'],
    outputItem: { id: 'ITEM_GOLD_SCALE_BOOTS', name: '金鳞灵靴', type: 'Equipment', attributes: { defense: 22, agility: 6 } },
  },

  // ==================== 四阶锻造（attack/defense 35-50，带 critRate/agility 等）====================
  {
    type: 'forge', id: 'RECIPE_METEOR_BLADE', name: '陨星刀', tier: 4,
    mainMaterialId: 'MAT_METEORITE',
    optionalAuxMaterials: ['MAT_DRAGON_BLOOD'],
    outputItem: { id: 'ITEM_METEOR_BLADE', name: '陨星刀', type: 'Equipment', attributes: { attack: 45, critRate: 12 } },
  },
  {
    type: 'forge', id: 'RECIPE_MOUNTAIN_SEAL', name: '山河印', tier: 4,
    mainMaterialId: 'MAT_METEORITE',
    optionalAuxMaterials: ['MAT_JADE', 'MAT_DRAGON_BLOOD'],
    outputItem: { id: 'ITEM_MOUNTAIN_SEAL', name: '山河印', type: 'Equipment', attributes: { attack: 40, spiritEnergyMax: 50 } },
  },
  {
    type: 'forge', id: 'RECIPE_DRAGON_SCALE_ARMOR', name: '龙鳞战甲', tier: 4,
    mainMaterialId: 'MAT_DRAGON_BLOOD',
    optionalAuxMaterials: ['MAT_METEORITE'],
    outputItem: { id: 'ITEM_DRAGON_SCALE_ARMOR', name: '龙鳞战甲', type: 'Equipment', attributes: { defense: 46, physique: 8, poisonResist: 6 } },
  },

  // ==================== 五阶锻造（神器级，attack/defense 50+，多属性）====================
  {
    type: 'forge', id: 'RECIPE_STAR_PHOENIX_BLADE', name: '凤鸣星辰剑', tier: 5,
    mainMaterialId: 'MAT_PHOENIX_FEATHER',
    optionalAuxMaterials: ['MAT_STARLIGHT', 'MAT_METEORITE'],
    outputItem: { id: 'ITEM_STAR_PHOENIX_BLADE', name: '凤鸣星辰剑', type: 'Equipment', attributes: { attack: 60, critRate: 18, agility: 10, spiritEnergyMax: 30 } },
  },
];
