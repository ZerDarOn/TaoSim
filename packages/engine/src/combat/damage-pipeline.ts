import type { Character, Skill, BackfireEffect } from '@taosim/contracts';
import { EquipmentManager } from '../equipment/equipment-manager.js';

export interface DamageResult {
  finalDamage: number;
  blockedByBarrier: boolean;   // 境界壁垒触发
  appliedBackfire?: BackfireEffect;
}

/**
 * 伤害结算管道 — 架构规范 §5.4。
 *
 * 实际伤害 = [(攻击力 - 目标基础防御) × 技能系数 - 固定减伤]
 *          × (1 - 护体罡气免伤率) × 克制系数
 *
 * 硬壁垒：若 目标境界 > 攻击者境界 且未挂载【破罡】，强制免伤 100%。
 */
export class DamagePipeline {
  /**
   * 结算一次攻击伤害。
   * @param attacker 攻击者
   * @param defender 防御者
   * @param skill 使用的技能
   * @param hasArmorBreak 是否挂载了【破罡】状态
   */
  public static calculate(
    attacker: Character,
    defender: Character,
    skill: Skill,
    hasArmorBreak: boolean,
  ): DamageResult {
    const attackerBonuses = EquipmentManager.getCombatBonuses(attacker);
    const defenderBonuses = EquipmentManager.getCombatBonuses(defender);
    const attackPower = attackerBonuses.attack + 10;
    const baseDefense = defender.attributes.physique * 0.5;

    // 境界壁垒检测
    const attackerRealmTier = this.getRealmTier(attacker.realm);
    const defenderRealmTier = this.getRealmTier(defender.realm);

    let barrierRate = 0;
    if (defenderRealmTier > attackerRealmTier && !hasArmorBreak) {
      barrierRate = 1.0; // 100% 免伤
    }

    // 基础物理系数（技能原子由具体原子组合决定，此处保留接口）
    const skillCoefficient = 1.0;
    const flatReduction = defenderBonuses.defense;

    let damage = (attackPower - baseDefense) * skillCoefficient - flatReduction;
    damage = Math.max(0, damage);
    damage = damage * (1 - barrierRate);

    // 克制系数（预留五行克制）
    const elementMultiplier = 1.0;
    damage = damage * elementMultiplier;

    // 反噬处理
    let appliedBackfire: BackfireEffect | undefined;
    if (skill.backfire) {
      appliedBackfire = { ...skill.backfire };
    }

    return {
      finalDamage: Math.round(damage),
      blockedByBarrier: barrierRate >= 1.0,
      appliedBackfire,
    };
  }

  public static getRealmTier(realm: string): number {
    if (realm.startsWith('SoulFormation')) return 5;
    if (realm.startsWith('NascentSoul')) return 4;
    if (realm.startsWith('GoldenCore')) return 3;
    if (realm.startsWith('Foundation')) return 2;
    return 1; // LianQi
  }
}
