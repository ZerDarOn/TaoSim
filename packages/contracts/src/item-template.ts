// ============================================================
// ItemTemplate 物品模板数据模型 — Phase 6
// ============================================================

import type { ItemType, AttributeMap } from './item.js';

export interface ItemTemplate {
  templateId: string;
  name: string;
  tier: number;
  type: ItemType;
  baseAttributes: AttributeMap;
  poisonValence?: number;
  maxDurability?: number;
}
