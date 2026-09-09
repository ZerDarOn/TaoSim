// ============================================================
// 六边形移动事件的权威玩家结算
//
// 地图组件只能提出“走到某格”的请求和展示结果；库存等事实由引擎
// 在这里结算，避免 UI 直接制造物品或改写玩家档案。
// ============================================================

import type { Character, Item } from '@taosim/contracts';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import type { HexMoveEvent } from './hex-overworld-engine.js';

export interface HexMoveEventSettlement {
  updatedPlayer: Character;
  materialIds: string[];
}

function materialItem(itemId: string): Item | null {
  const template = DEFAULT_ITEM_TEMPLATES.find((item) => item.templateId === itemId);
  if (!template || template.type !== 'Material') return null;
  return {
    id: template.templateId,
    templateId: template.templateId,
    name: template.name,
    tier: template.tier,
    type: template.type,
    attributes: { ...template.baseAttributes },
    poisonValence: template.poisonValence,
    quality: 'Common',
  };
}

/** 结算一次已通过地图/时间权威验证的六边形移动事件。 */
export function settleHexMoveEvents(
  player: Character,
  events: readonly HexMoveEvent[],
): HexMoveEventSettlement {
  const updatedPlayer = structuredClone(player);
  const materialIds: string[] = [];
  for (const event of events) {
    if (event.type !== 'material_found' || !event.materialId) continue;
    const item = materialItem(event.materialId);
    if (!item) continue;
    const existing = updatedPlayer.inventory.find((stack) =>
      stack.item.id === item.id || stack.item.templateId === item.templateId,
    );
    if (existing) existing.count += 1;
    else updatedPlayer.inventory.push({ item, count: 1 });
    materialIds.push(item.id);
  }
  return { updatedPlayer, materialIds };
}
