import type { Character, Item, ItemQuality, AttributeMap, SpecialEffectType } from '@taosim/contracts';
import type { UpgradeFailPenalty, UpgradeRule } from '@taosim/contracts';
import { DURABILITY_LOSS_ON_FAIL } from '@taosim/contracts';

// UPGRADE_RULES key: `${tier}_${from}_TO_${to}`
const UPGRADE_RULES: Record<string, UpgradeRule> = {
  // Tier 1 (天花板 Rare)
  '1_Common_TO_Rare': {
    materials: [{ templateId: 'MAT_IRON_ORE', count: 3 }],
    spiritStones: 200,
    successRate: 0.8,
    failPenalty: 'LossMaterialsOnly',
  },
  // Tier 2
  '2_Common_TO_Rare': {
    materials: [{ templateId: 'MAT_METEORITE', count: 2 }, { templateId: 'MAT_JADE', count: 1 }],
    spiritStones: 500,
    successRate: 0.7,
    failPenalty: 'LossMaterialsOnly',
  },
  '2_Rare_TO_Epic': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 1 }, { templateId: 'MAT_STARLIGHT', count: 1 }],
    spiritStones: 1000,
    successRate: 0.5,
    failPenalty: 'DurabilityLoss',
  },
  '2_Epic_TO_Legendary': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 3 }, { templateId: 'MAT_METEORITE', count: 5 }],
    spiritStones: 5000,
    successRate: 0.25,
    failPenalty: 'QualityDegrade',
  },
  // Tier 3
  '3_Common_TO_Rare': {
    materials: [{ templateId: 'MAT_METEORITE', count: 3 }, { templateId: 'MAT_DRAGON_BLOOD', count: 1 }],
    spiritStones: 1000,
    successRate: 0.65,
    failPenalty: 'LossMaterialsOnly',
  },
  '3_Rare_TO_Epic': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 2 }, { templateId: 'MAT_SKY_GOLD_SAND', count: 1 }],
    spiritStones: 3000,
    successRate: 0.45,
    failPenalty: 'DurabilityLoss',
  },
  '3_Epic_TO_Legendary': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 5 }, { templateId: 'MAT_SKY_GOLD_SAND', count: 3 }],
    spiritStones: 10000,
    successRate: 0.15,
    failPenalty: 'QualityDegrade',
  },
};

const QUALITY_ORDER: ItemQuality[] = ['Common', 'Rare', 'Epic', 'Legendary'];

function qualityMultiplier(q: ItemQuality): number {
  return q === 'Common' ? 1.0 : q === 'Rare' ? 1.5 : q === 'Epic' ? 2.5 : 5.0;
}

function degradeQuality(q: ItemQuality): ItemQuality {
  const idx = QUALITY_ORDER.indexOf(q);
  return idx > 0 ? QUALITY_ORDER[idx - 1]! : 'Common';
}

// 非战斗属性，升品时不参与倍率计算
const NON_COMBAT_ATTRS = new Set(['pillCategory', 'effectValue', 'spiritEnergyMax', 'poisonResist']);

export class UpgradeEngine {
  static getUpgradeRule(tier: number, from: ItemQuality, to: ItemQuality): UpgradeRule | null {
    const key = `${tier}_${from}_TO_${to}`;
    return UPGRADE_RULES[key] ?? null;
  }

  static enhance(
    item: Item,
    targetQuality: ItemQuality,
    player: Character
  ): {
    success: boolean;
    attempted: boolean;
    resultItem?: Item;
    penaltyTriggered?: UpgradeFailPenalty;
    message: string;
  } {
    const rule = this.getUpgradeRule(item.tier, item.quality ?? 'Common', targetQuality);
    if (!rule) {
      return { success: false, attempted: false, message: `无法从 ${item.quality} 升至 ${targetQuality}（品阶天花板或路径不存在）` };
    }

    // 检查灵石
    if (player.spiritStones < rule.spiritStones) {
      return { success: false, attempted: false, message: `灵石不足，需要 ${rule.spiritStones}` };
    }

    // 检查材料
    for (const mat of rule.materials) {
      const stack = player.inventory.find(
        s => s.item.templateId === mat.templateId || s.item.id === mat.templateId
      );
      if (!stack || stack.count < mat.count) {
        return { success: false, attempted: false, message: `材料不足：${mat.templateId}` };
      }
    }

    // 消耗灵石和材料
    player.spiritStones -= rule.spiritStones;
    for (const mat of rule.materials) {
      const stack = player.inventory.find(
        s => s.item.templateId === mat.templateId || s.item.id === mat.templateId
      )!;
      stack.count -= mat.count;
    }
    player.inventory = player.inventory.filter(s => s.count > 0);

    // Roll 成功
    if (Math.random() <= rule.successRate) {
      const updatedItem = this.applyQualityToItem(item, targetQuality);
      return {
        success: true,
        attempted: true,
        resultItem: updatedItem,
        message: `升品成功！${item.name} 已升至 ${targetQuality}`,
      };
    }

    // 失败: 应用惩罚
    const penalizedItem = this.applyFailPenalty(item, rule.failPenalty);
    return {
      success: false,
      attempted: true,
      resultItem: penalizedItem,
      penaltyTriggered: rule.failPenalty,
      message: this.getFailMessage(rule.failPenalty),
    };
  }

  // 反推法: 当前属性 / 当前倍率 × 新倍率（精度损失 ≤1）
  private static applyQualityToItem(item: Item, quality: ItemQuality): Item {
    const newMult = qualityMultiplier(quality);
    const currentMult = qualityMultiplier(item.quality ?? 'Common');

    const newAttrs: AttributeMap = {};
    const attrs = item.attributes as Record<string, number>;
    for (const [k, v] of Object.entries(attrs)) {
      if (NON_COMBAT_ATTRS.has(k)) {
        newAttrs[k as keyof AttributeMap] = v;
      } else {
        const baseValue = Math.round(v / currentMult);
        newAttrs[k as keyof AttributeMap] = Math.floor(baseValue * newMult);
      }
    }

    const updated: Item = {
      ...item,
      attributes: newAttrs,
      quality,
    };

    // Legendary 升品成功且原本无特效 → 随机分配
    if (quality === 'Legendary' && !item.specialEffect) {
      const effects: SpecialEffectType[] = ['SOUL_GUARD', 'BLOOD_THIRST', 'MANA_SHIELD', 'QUICK_STRIKE', 'PHOENIX_REBIRTH', 'VITALITY_SIPHON'];
      updated.specialEffect = effects[Math.floor(Math.random() * effects.length)]!;
    }

    return updated;
  }

  private static applyFailPenalty(item: Item, penalty: UpgradeFailPenalty): Item {
    const updated: Item = {
      ...item,
      attributes: { ...(item.attributes as Record<string, number>) } as AttributeMap,
      durability: item.durability ? { ...item.durability } : undefined,
    };

    switch (penalty) {
      case 'LossMaterialsOnly':
        // 装备不损
        break;
      case 'DurabilityLoss':
        if (updated.durability) {
          updated.durability.current -= DURABILITY_LOSS_ON_FAIL;
          if (updated.durability.current <= 0) {
            updated.isBroken = true;
          }
        }
        break;
      case 'QualityDegrade': {
        const degradeTo = degradeQuality(item.quality ?? 'Common');
        return this.applyQualityToItem(updated, degradeTo);
      }
    }

    return updated;
  }

  private static getFailMessage(penalty: UpgradeFailPenalty): string {
    switch (penalty) {
      case 'LossMaterialsOnly': return '升品失败，材料已消耗，装备无恙';
      case 'DurabilityLoss': return '升品失败！装备耐久度受损';
      case 'QualityDegrade': return '升品失败！装备品质倒退';
    }
  }
}
