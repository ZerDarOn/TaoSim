// ============================================================
// 游戏枚举 → 中文显示映射（纯函数）
// ============================================================
import type {
  RealmFullPath,
  RealmType,
  ItemType,
  ItemQuality,
  Gender,
  SoulState,
  SpiritRootGrade,
  SpiritElementType,
  TraitQuality,
  SkillQuality,
  FactionRank,
  OverworldNode,
} from '@taosim/contracts';

// RealmType → 中文大境界
const REALM_TYPE_MAP: Record<RealmType, string> = {
  Mortal: '凡人',
  LianQi: '炼气',
  ZhuJi: '筑基',
  JinDan: '金丹',
  YuanYing: '元婴',
  HuaShen: '化神',
};

// RealmFullPath 前缀 → 中文境界期名
const REALM_PREFIX_MAP: Record<string, string> = {
  Mortal: '凡人',
  QiRefinement: '炼气期',
  Foundation: '筑基期',
  GoldenCore: '金丹期',
  NascentSoul: '元婴期',
  SoulFormation: '化神期',
};

// 子层数字 → 中文数字
const CN_NUM: Record<string, string> = {
  '1': '一',
  '2': '二',
  '3': '三',
  '4': '四',
  '5': '五',
  '6': '六',
  '7': '七',
  '8': '八',
  '9': '九',
};

/**
 * RealmFullPath → 中文境界
 * 例：QiRefinement_1 → '炼气期一层', GoldenCore_3 → '金丹期三层'
 */
export function formatRealm(r: RealmFullPath): string {
  // P2：凡人境界无子层级
  if (r === 'Mortal') return '凡人';
  const [prefix, levelStr] = r.split('_') as [string, string];
  const period = REALM_PREFIX_MAP[prefix];
  const level = CN_NUM[levelStr] ?? levelStr;
  return `${period}${level}层`;
}

/** RealmType → 中文大境界 */
export function formatRealmType(rt: RealmType): string {
  return REALM_TYPE_MAP[rt];
}

const ITEM_TYPE_MAP: Record<ItemType, string> = {
  Medicine: '丹药',
  Equipment: '装备',
  Talisman: '法宝',
  Material: '材料',
  Poison: '毒物',
  Formula: '秘籍',
};

/** ItemType → 中文 */
export function formatItemType(t: ItemType): string {
  return ITEM_TYPE_MAP[t];
}

const QUALITY_MAP: Record<ItemQuality, string> = {
  Common: '凡品',
  Rare: '灵品',
  Epic: '宝品',
  Legendary: '仙品',
};

/** ItemQuality → 中文；undefined 视为 Common */
export function formatQuality(q?: ItemQuality): string {
  return QUALITY_MAP[q ?? 'Common'];
}

const GENDER_MAP: Record<Gender, string> = {
  Male: '男',
  Female: '女',
  Other: '其他',
};

/** Gender → 中文 */
export function formatGender(g: Gender): string {
  return GENDER_MAP[g];
}

const SOUL_STATE_MAP: Record<SoulState, string> = {
  Active: '在世',
  PrimordialSoul: '元神',
  RemnantSoul: '残魂',
  Oblivion: '湮灭',
};

/** SoulState → 中文 */
export function formatSoulState(s: SoulState): string {
  return SOUL_STATE_MAP[s];
}

const SPIRIT_ROOT_GRADE_MAP: Record<SpiritRootGrade, string> = {
  Heaven: '天',
  Earth: '地',
  Profound: '玄',
  Yellow: '黄',
};

/** SpiritRootGrade → 中文 */
export function formatSpiritRootGrade(g: SpiritRootGrade): string {
  return SPIRIT_ROOT_GRADE_MAP[g];
}

const SPIRIT_ELEMENT_MAP: Record<SpiritElementType, string> = {
  Metal: '金',
  Wood: '木',
  Water: '水',
  Fire: '火',
  Earth: '土',
  Thunder: '雷',
  Ice: '冰',
  Wind: '风',
  Dark: '暗',
};

/** SpiritElementType → 中文 */
export function formatSpiritElement(e: SpiritElementType): string {
  return SPIRIT_ELEMENT_MAP[e];
}

// ---- 角色详情弹窗专用的额外映射（trait/skill）----

/** TraitQuality → 中文品阶 */
const TRAIT_QUALITY_MAP: Record<TraitQuality, string> = {
  Red: '神阶',
  Orange: '仙阶',
  Purple: '圣阶',
  Blue: '良阶',
  Green: '凡阶',
};

/** TraitQuality → 中文品阶 */
export function formatTraitQuality(q: TraitQuality): string {
  return TRAIT_QUALITY_MAP[q];
}

/** TraitQuality → tailwind 文本颜色类 */
export function traitQualityColor(q: TraitQuality): string {
  switch (q) {
    case 'Red': return 'text-red-400';
    case 'Orange': return 'text-orange-400';
    case 'Purple': return 'text-purple-400';
    case 'Blue': return 'text-blue-400';
    case 'Green': return 'text-green-400';
    default: return 'text-slate-300';
  }
}

const SKILL_QUALITY_MAP: Record<SkillQuality, string> = {
  Huang: '黄阶',
  Xuan: '玄阶',
  Di: '地阶',
  Tian: '天阶',
};

/** SkillQuality → 中文品阶 */
export function formatSkillQuality(q: SkillQuality): string {
  return SKILL_QUALITY_MAP[q];
}

/** Skill.type → 中文 */
export function formatSkillType(t: 'Active' | 'Passive'): string {
  return t === 'Active' ? '主动' : '被动';
}

// ============================================================
// 角色卡重构补充映射：配方 / 物品 / 宗门
// ============================================================

// 配方 ID → 中文名
const RECIPE_NAME_MAP: Record<string, string> = {
  // 丹方
  RECIPE_QI_PILL: '聚气丹',
  RECIPE_BLOOD_PILL: '活血丹',
  RECIPE_CLEAR_SOUL_PILL: '清心丹',
  RECIPE_TONIFY_PILL: '培元丹',
  RECIPE_FOUNDATION_PILL: '筑基丹',
  RECIPE_ANTIDOTE_PILL: '解毒丹',
  RECIPE_QI_CONDENSE_PILL: '凝气丹',
  RECIPE_REVIVE_PILL: '回春丹',
  RECIPE_MERIDIAN_PILL: '护脉丹',
  RECIPE_LONGEVITY_PILL: '延寿丹',
  RECIPE_MARROW_WASH_PILL: '洗髓丹',
  RECIPE_BARRIER_PILL: '破障丹',
  RECIPE_BONE_FORGE_PILL: '锻骨丹',
  RECIPE_SPIRIT_LINK_PILL: '通灵丹',
  RECIPE_NINE_TURN_SOUL_PILL: '九转还魂丹',
  RECIPE_DRAGON_BODY_PILL: '龙血锻体丹',
  RECIPE_SKY_BREAK_PILL: '天元破境丹',
  RECIPE_CHAOS_NINE_TURN_PILL: '混沌九转丹',
  // 锻造
  RECIPE_IRON_SWORD: '青锋剑',
  RECIPE_SPIRIT_CLOTH: '灵草布衣',
  RECIPE_SPIRIT_SWORD: '灵蕴剑',
  RECIPE_SPIRIT_ARMOR: '灵甲',
  RECIPE_COLD_MOON_BLADE: '冷月玄刀',
  RECIPE_WIND_SPEAR: '破风枪',
  RECIPE_YIN_YANG_ROBE: '阴阳道袍',
  RECIPE_STAR_SWORD: '星辰剑',
  RECIPE_HEAVEN_GANG_SWORD: '天罡剑',
  RECIPE_XUAN_GUI_ARMOR: '玄龟宝甲',
  RECIPE_GOLD_SCALE_BOOTS: '金鳞灵靴',
  RECIPE_METEOR_BLADE: '陨星刀',
  RECIPE_MOUNTAIN_SEAL: '山河印',
  RECIPE_DRAGON_SCALE_ARMOR: '龙鳞战甲',
  RECIPE_STAR_PHOENIX_BLADE: '凤鸣星辰剑',
};

// 物品/材料 ID → 中文名
const ITEM_ID_NAME_MAP: Record<string, string> = {
  // 材料
  MAT_SPIRIT_GRASS: '灵草',
  MAT_BLOOD_FLOWER: '血花',
  MAT_IRON_ORE: '铁矿石',
  MAT_YIN_DEW: '阴露',
  MAT_YANG_STONE: '阳石',
  MAT_JADE: '灵玉',
  MAT_SPIRIT_STONE: '灵石矿',
  MAT_DRAGON_BLOOD: '龙血',
  MAT_PHOENIX_FEATHER: '凤羽',
  MAT_METEORITE: '陨铁',
  MAT_STARLIGHT: '星光粉',
  MAT_MILLENNIUM_LINGZHI: '万年灵芝',
  MAT_SKY_GOLD_SAND: '天金砂',
  MAT_IMMORTAL_JADE: '仙灵玉髓',
  MAT_CHAOS_STONE: '混沌石',
  // 丹药
  MED_QI_PILL: '聚气丹',
  MED_FOUNDATION_PILL: '筑基丹',
  MED_LONGEVITY_PILL: '延寿丹',
  MED_NASCENT_SOUL_PILL: '凝婴丹',
  // 突破材料
  FoundationPill: '筑基丹',
  GoldenCorePill: '金元丹',
  NascentSoulPill: '凝婴丹',
  SoulFormationPill: '化神丹',
  // 装备
  EQ_SPIRIT_SWORD: '灵蕴剑',
  EQ_SPIRIT_ARMOR: '灵甲',
  EQ_STAR_SWORD: '星辰剑',
};

// 宗门 ID → 中文名
const FACTION_NAME_MAP: Record<string, string> = {
  FACTION_QINGYUN_SECT: '青云宗',
  FACTION_TIANJIAN_SECT: '天剑宗',
  FACTION_ANCIENT_CLAN: '世家',
  FACTION_SMALL_CLAN: '小族',
};

/** 配方 ID → 中文名；未收录时原样返回 */
export function formatRecipeName(id: string): string {
  return RECIPE_NAME_MAP[id] ?? id;
}

/** 物品/材料 ID → 中文名；未收录时原样返回 */
export function formatItemId(id: string): string {
  return ITEM_ID_NAME_MAP[id] ?? id;
}

/** 宗门 ID → 中文名；空值显示"无" */
export function formatFactionName(id?: string): string {
  if (!id) return '无';
  return FACTION_NAME_MAP[id] ?? id;
}

// 属性键 → 中文标签（AttributeKey 全量）
const ATTRIBUTE_LABEL_MAP: Record<string, string> = {
  physique: '根骨',
  comprehension: '悟性',
  perception: '神识',
  agility: '身法',
  luck: '气运',
  charm: '仙姿',
  attack: '攻击',
  defense: '防御',
  critRate: '暴击',
  spiritEnergyMax: '灵力上限',
  poisonResist: '毒抗',
  lifespanBonus: '寿元加成',
  initialStones: '初始灵石',
};

/** 属性对象 → 中文摘要，如 "攻击+5 暴击+3"；只显示正值 */
export function formatAttributes(attrs: Record<string, number>): string {
  return Object.entries(attrs)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${ATTRIBUTE_LABEL_MAP[k] ?? k}+${v}`)
    .join(' ');
}

// ---- 大陆地图 / 宗门面板补充映射 ----

/** OverworldNode.type → 中文 */
const NODE_TYPE_MAP: Record<OverworldNode['type'], string> = {
  City: '城镇',
  Sect: '宗门',
  Dungeon: '秘境',
  Market: '坊市',
  Wilderness: '荒野',
};

/** OverworldNode.type → 中文；未收录时原样返回 */
export function formatNodeType(t: OverworldNode['type']): string {
  return NODE_TYPE_MAP[t] ?? t;
}

/** FactionRank → 中文职位 */
const FACTION_RANK_MAP: Record<FactionRank, string> = {
  Disciple: '弟子',
  Deacon: '执事',
  Elder: '长老',
  Leader: '掌门',
};

/** FactionRank → 中文职位；未入门显示"无" */
export function formatFactionRank(r?: FactionRank): string {
  if (!r) return '无';
  return FACTION_RANK_MAP[r] ?? r;
}
