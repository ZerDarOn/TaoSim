import type { ItemTemplate } from '@taosim/contracts';

export const DEFAULT_ITEM_TEMPLATES: ItemTemplate[] = [
  // Tier 1
  { templateId: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_BLOOD_FLOWER', name: '血花', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_QI_PILL', name: '聚气丹', tier: 1, type: 'Medicine', baseAttributes: {} },
  // Tier 2
  { templateId: 'MAT_YIN_DEW', name: '阴露', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: 2 },
  { templateId: 'MAT_YANG_STONE', name: '阳石', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: -2 },
  { templateId: 'MAT_JADE', name: '灵玉', tier: 2, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_SPIRIT_STONE', name: '灵石矿', tier: 2, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_FOUNDATION_PILL', name: '筑基丹', tier: 2, type: 'Medicine', baseAttributes: {} },
  { templateId: 'EQ_SPIRIT_SWORD', name: '灵蕴剑', tier: 2, type: 'Equipment', baseAttributes: { attack: 15, critRate: 5 } },
  { templateId: 'EQ_SPIRIT_ARMOR', name: '灵甲', tier: 2, type: 'Equipment', baseAttributes: { defense: 10, physique: 2 } },
  // Tier 3
  { templateId: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_PHOENIX_FEATHER', name: '凤羽', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_METEORITE', name: '陨铁', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_STARLIGHT', name: '星光粉', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_LONGEVITY_PILL', name: '延寿丹', tier: 3, type: 'Medicine', baseAttributes: {} },
  { templateId: 'EQ_STAR_SWORD', name: '星辰剑', tier: 3, type: 'Equipment', baseAttributes: { attack: 30, critRate: 10, agility: 3 } },
  // Tier 4
  { templateId: 'MAT_MILLENNIUM_LINGZHI', name: '万年灵芝', tier: 4, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_SKY_GOLD_SAND', name: '天金砂', tier: 4, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_NASCENT_SOUL_PILL', name: '凝婴丹', tier: 4, type: 'Medicine', baseAttributes: {} },
  // Tier 5
  { templateId: 'MAT_IMMORTAL_JADE', name: '仙灵玉髓', tier: 5, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_CHAOS_STONE', name: '混沌石', tier: 5, type: 'Material', baseAttributes: {} },
];
