import type { Character, RealmBreakthroughConfig, RealmFullPath } from '@taosim/contracts';

export interface TribulationResult {
  success: boolean;
  reason?: string;
  newRealm?: RealmFullPath;
  updatedCharacter?: Character;
}

export class TribulationEngine {
  static attempt(character: Character, config: RealmBreakthroughConfig): TribulationResult {
    const c: Character = JSON.parse(JSON.stringify(character));

    if (c.cultivation.currentExp < config.requirements.expThreshold) {
      return { success: false, reason: '修为不足，无法突破' };
    }

    // 材料不再强制需要，而是影响成功率
    // 有材料：成功率大幅提升；无材料：成功率降低但仍可尝试
    let materialBonus = 0;
    const consumedMaterials: string[] = [];
    if (config.requirements.requiredItems) {
      for (const itemId of config.requirements.requiredItems) {
        const stack = c.inventory.find(s => s.item.id === itemId || s.item.templateId === itemId);
        if (stack && stack.count >= 1) {
          materialBonus += 0.25; // 每种材料 +25% 成功率
          consumedMaterials.push(itemId);
        }
      }
    }

    // 无材料惩罚：如果需要材料但一个都没有，成功率大幅降低
    const needsMaterials = (config.requirements.requiredItems?.length ?? 0) > 0;
    const hasAnyMaterial = consumedMaterials.length > 0;
    const noMaterialPenalty = (needsMaterials && !hasAnyMaterial) ? -0.30 : 0;

    // 成功率判定
    const physiqueBonus = c.attributes.physique / 100;
    const luckBonus = c.attributes.luck / 100;
    const successRate = Math.max(0.05, Math.min(0.99,
      config.simpleModeSuccessRate + physiqueBonus + luckBonus + materialBonus + noMaterialPenalty
    ));

    // 消耗已拥有的材料（无论突破是否成功）
    for (const itemId of consumedMaterials) {
      const stack = c.inventory.find(s => s.item.id === itemId || s.item.templateId === itemId);
      if (stack) stack.count--;
    }
    c.inventory = c.inventory.filter(s => s.count > 0);

    if (Math.random() > successRate) {
      c.hp = Math.max(1, c.hp - Math.floor(c.maxHp * 0.1));
      const reason = hasAnyMaterial
        ? `突破失败（成功率${Math.round(successRate * 100)}%），气血受损`
        : `突破失败（无材料加成，成功率仅${Math.round(successRate * 100)}%），气血受损`;
      return { success: false, reason, updatedCharacter: c };
    }

    // 成功：境界提升
    c.realm = config.toRealm as RealmFullPath;
    c.cultivation.currentExp = 0;
    c.cultivation.maxExp = Math.floor(c.cultivation.maxExp * 3);

    if (config.postBreakthrough) {
      c.lifespan.maxLifespan = config.postBreakthrough.maxLifespan;
      c.maxHp = Math.floor(c.maxHp * config.postBreakthrough.hpMultiplier);
      c.spiritEnergy.max = Math.floor(c.spiritEnergy.max * config.postBreakthrough.spiritEnergyMultiplier);
      if (config.postBreakthrough.canFly !== undefined) {
        c.canFly = config.postBreakthrough.canFly;
      }
    } else {
      c.lifespan.maxLifespan = 200;
      c.maxHp = Math.floor(c.maxHp * 2);
      c.spiritEnergy.max = Math.floor(c.spiritEnergy.max * 1.5);
      c.canFly = true;
    }

    c.hp = c.maxHp;
    c.spiritEnergy.current = c.spiritEnergy.max;

    return {
      success: true,
      newRealm: config.toRealm as RealmFullPath,
      updatedCharacter: c,
    };
  }
}
