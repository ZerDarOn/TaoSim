// ============================================================
// Item 数据模型 — 架构规范 §23
// ============================================================

export type ItemType = 'Medicine' | 'Equipment' | 'Talisman' | 'Material' | 'Poison';

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

export interface Item {
  id: string;
  name: string;
  tier: number;             // 1-5 阶
  type: ItemType;
  attributes: AttributeMap;
  poisonValence?: number;   // 毒性值 (炼丹/毒功)
}

export interface ItemStack {
  item: Item;
  count: number;
}
