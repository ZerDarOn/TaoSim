import type { Character, RealmBreakthroughConfig, RealmFullPath } from '@taosim/contracts';

export interface TribulationResult {
  success: boolean;
  reason?: string;
  newRealm?: RealmFullPath;
  updatedCharacter?: Character;
}

export class TribulationEngine {
  static attempt(character: Character, config: RealmBreakthroughConfig): TribulationResult {
    const c = structuredClone(character);

    if (c.cultivation.currentExp < config.requirements.expThreshold) {
      return { success: false, reason: '修为不足，无法突破' };
    }

    if (config.requirements.requiredItems) {
      for (const itemId of config.requirements.requiredItems) {
        const stack = c.inventory.find(s => s.item.id === itemId);
        if (!stack || stack.count < 1) {
          return { success: false, reason: `缺少材料：${itemId}` };
        }
      }
    }

    // 消耗材料
    if (config.requirements.requiredItems) {
      for (const itemId of config.requirements.requiredItems) {
        const stack = c.inventory.find(s => s.item.id === itemId);
        if (stack) {
          stack.count--;
        }
      }
      c.inventory = c.inventory.filter(s => s.count > 0);
    }

    // 成功率判定
    const physiqueBonus = c.attributes.physique / 100;
    const luckBonus = c.attributes.luck / 100;
    const successRate = Math.min(0.95, config.simpleModeSuccessRate + physiqueBonus + luckBonus);

    if (Math.random() > successRate) {
      c.hp = Math.max(1, c.hp - Math.floor(c.maxHp * 0.1));
      return { success: false, reason: '突破失败，气血受损', updatedCharacter: c };
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
