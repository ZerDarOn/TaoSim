import type { Item, ItemType } from '@taosim/contracts';
import type { ItemTemplate, MarketItem } from '@taosim/contracts';
import { MarketPricing } from './market-pricing.js';

export class ItemFactory {
  private static templates: ItemTemplate[] = [];

  static loadTemplates(pool: ItemTemplate[]): void {
    this.templates = pool;
  }

  static getItemPool(tier: number): ItemTemplate[] {
    return this.templates.filter((t) => t.tier === tier);
  }

  static generateRandomItem(opts: {
    minTier: number;
    maxTier: number;
    preferredType?: ItemType;
    rng?: () => number;
  }): Item {
    const random = opts.rng ?? Math.random;

    let eligible = this.templates.filter(
      (t) =>
        t.tier >= opts.minTier &&
        t.tier <= opts.maxTier &&
        (!opts.preferredType || t.type === opts.preferredType),
    );

    if (eligible.length === 0) {
      eligible = this.templates.filter(
        (t) => t.tier >= opts.minTier && t.tier <= opts.maxTier,
      );
    }

    if (eligible.length === 0) {
      if (this.templates.length === 0) {
        throw new Error('[ItemFactory] 物品模板库为空，无法生成物品！');
      }
      eligible = this.templates;
    }

    const template = eligible[Math.floor(random() * eligible.length)]!;
    const instanceId = `${template.templateId}_${Date.now()}_${Math.floor(random() * 10000)}`;

    return {
      id: instanceId,
      templateId: template.templateId,
      name: template.name,
      tier: template.tier,
      type: template.type,
      attributes: { ...template.baseAttributes },
      poisonValence: template.poisonValence,
    };
  }

  static generateNPCTradeItems(
    npcRealmTier: number,
    npcProfessionPreferences: ItemType[],
    count: number = 3,
    rng?: () => number,
  ): MarketItem[] {
    const random = rng ?? Math.random;
    const items: MarketItem[] = [];

    const minTier = Math.max(1, npcRealmTier - 1);
    const maxTier = Math.min(9, npcRealmTier + 1);

    for (let i = 0; i < count; i++) {
      const preferredType =
        npcProfessionPreferences.length > 0
          ? npcProfessionPreferences[Math.floor(random() * npcProfessionPreferences.length)]
          : undefined;

      const item = this.generateRandomItem({ minTier, maxTier, preferredType, rng: random });
      const itemCount = item.type === 'Material' ? Math.floor(random() * 5) + 1 : 1;

      items.push({
        item,
        count: itemCount,
        maxCount: itemCount,
        basePrice: MarketPricing.getBasePrice(item),
      });
    }

    return items;
  }
}
