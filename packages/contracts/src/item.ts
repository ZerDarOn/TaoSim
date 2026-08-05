// ============================================================
// Item 数据模型 — 架构规范 §23
// ============================================================

export type ItemType = 'Medicine' | 'Equipment' | 'Talisman' | 'Material' | 'Poison' | 'Formula';

export type AttributeKey =
  | 'physique'
  | 'comprehension'
  | 'perception'
  | 'agility'
  | 'luck'
  | 'attack'
  | 'defense'
  | 'critRate'
  | 'spiritEnergyMax'
  | 'poisonResist';

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
}

export interface ItemStack {
  item: Item;
  count: number;
}
