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
} from '@taosim/contracts';

// RealmType → 中文大境界
const REALM_TYPE_MAP: Record<RealmType, string> = {
  LianQi: '炼气',
  ZhuJi: '筑基',
  JinDan: '金丹',
  YuanYing: '元婴',
  HuaShen: '化神',
};

// RealmFullPath 前缀 → 中文境界期名
const REALM_PREFIX_MAP: Record<string, string> = {
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
