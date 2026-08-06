// ============================================================
// Item 数据模型 — 架构规范 §23
// ============================================================

import type { SkillElement } from './skill.js';

export type ItemType = 'Medicine' | 'Equipment' | 'Talisman' | 'Material' | 'Poison' | 'Formula';

export type AttributeKey =
  | 'physique'
  | 'comprehension'
  | 'perception'
  | 'agility'
  | 'luck'
  | 'charm'
  | 'attack'
  | 'defense'
  | 'critRate'
  | 'spiritEnergyMax'
  | 'poisonResist'
  | 'lifespanBonus'    // 寿元加成（词条专用）
  | 'initialStones';   // 初始灵石（词条专用，创角生效）

export type AttributeMap = Partial<Record<AttributeKey, number>>;

export type ItemQuality = 'Common' | 'Rare' | 'Epic' | 'Legendary';

export type SpecialEffectType =
  | 'SOUL_GUARD'
  | 'BLOOD_THIRST'
  | 'MANA_SHIELD'
  | 'QUICK_STRIKE'
  | 'PHOENIX_REBIRTH'
  | 'VITALITY_SIPHON';

export interface Item {
  id: string;
  name: string;
  tier: number;             // 1-5 阶
  type: ItemType;
  attributes: AttributeMap;
  poisonValence?: number;   // 毒性值 (炼丹/毒功)
  templateId?: string;    // 物品模板静态 ID
  quality?: ItemQuality;  // 可选品质
  specialEffect?: SpecialEffectType;
  durability?: import('./durability.js').DurabilityState;
  isBroken?: boolean;
  /** 法宝/防具的护体元素（五行交互防御来源，默认 Physical） */
  element?: SkillElement;
}

export interface ItemStack {
  item: Item;
  count: number;
}
