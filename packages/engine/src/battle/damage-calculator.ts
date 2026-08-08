import type { Character, RealmFullPath, Skill, SkillElement } from '@taosim/contracts';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import { BATTLE_CONFIG } from './battle-config.js';

export interface DamageSpec {
  multiplier: number;      // 技能系数（普攻 1.0）
  element: SkillElement;
  tier: number;            // 攻击方功法阶位
}

/**
 * 从 Skill 推导伤害规格：
 * - multiplier 取 Numeric 原子中的最大 multiplier（无则 1.0）
 * - element 取 skill.element（无则 Physical）
 * - tier 取 skill.tier（无则 1）
 */
export function skillToDamageSpec(skill: Skill): DamageSpec {
  let multiplier = 1.0;
  for (const p of skill.primitives) {
    if (p.category === 'Numeric' && typeof p.params.multiplier === 'number') {
      multiplier = Math.max(multiplier, p.params.multiplier);
    }
  }
  return {
    multiplier,
    element: skill.element ?? 'Physical',
    tier: skill.tier ?? 1,
  };
}

export interface DamageResult {
  finalDamage: number;
  missed: boolean;
  crit: boolean;
  blockedByBarrier: boolean;
}

/** 五行相克环：key 克 value（金→木→土→水→火→金） */
const ELEMENT_CYCLE: Record<string, string> = {
  Metal: 'Wood', Wood: 'Earth', Earth: 'Water', Water: 'Fire', Fire: 'Metal',
};

/** 境界层数：层数越高 tier 越大（SoulFormation=5 … QiRefinement=1） */
function realmTier(realm: RealmFullPath): number {
  if (realm.startsWith('SoulFormation')) return 5;
  if (realm.startsWith('NascentSoul')) return 4;
  if (realm.startsWith('GoldenCore')) return 3;
  if (realm.startsWith('Foundation')) return 2;
  return 1; // QiRefinement
}

/** 防御方护体元素来源：armor → weapon → treasures[0]，默认 Physical/tier 1 */
function getDefenseElement(defender: Character): { element: SkillElement; tier: number } {
  const eq = defender.equipmentSlots;
  const armor = eq?.armor;
  if (armor) return { element: armor.element ?? 'Physical', tier: armor.tier };
  const weapon = eq?.weapon;
  if (weapon) return { element: weapon.element ?? 'Physical', tier: weapon.tier };
  const treasure = eq?.treasures?.[0];
  if (treasure) return { element: treasure.element ?? 'Physical', tier: treasure.tier };
  return { element: 'Physical', tier: 1 };
}

/** 五行交互系数（雷冰风暗不进入生克环，只参与同源抵消） */
// 注：def.tier / atkTier 为 Phase B 功法阶位压制预留，当前仅用于签名一致
function elementMultiplier(atk: SkillElement, def: { element: SkillElement; tier: number }, atkTier: number): number {
  if (atk === 'Physical' || def.element === 'Physical') return 1.0;
  if (atk === def.element) return 0.85;              // 同源抵消
  if (ELEMENT_CYCLE[atk] === def.element) return 1.3; // 相克
  if (ELEMENT_CYCLE[def.element] === atk) return 0.7; // 被克
  return 1.0;
}

/**
 * 伤害结算。固定随机顺序：先命中判定，后暴击判定；未命中不判暴击、不附加伤害。
 */
export function calculateDamage(
  attacker: Character,
  defender: Character,
  spec: DamageSpec,
  rng: () => number,
  critRate?: number,
): DamageResult {
  const atkBonuses = EquipmentManager.getCombatBonuses(attacker);
  const defBonuses = EquipmentManager.getCombatBonuses(defender);
  const attackPower = atkBonuses.attack + 10;
  const baseDefense = defender.attributes.physique * 0.5;
  // 暴击率：显式传入优先；否则用词条暴击加成；都没有时退回基础 0.05
  const finalCritRate = critRate ?? (atkBonuses.critRate > 0 ? atkBonuses.critRate / 100 : 0.05);

  const atkTier = realmTier(attacker.realm);
  const defTier = realmTier(defender.realm);

  // 闪避判定
  const dodge = Math.min(
    BATTLE_CONFIG.MAX_DODGE_RATE,
    BATTLE_CONFIG.BASE_DODGE_RATE
      + ((defender.attributes.agility - attacker.attributes.agility)
        / Math.max(1, attacker.attributes.agility + defender.attributes.agility))
      * BATTLE_CONFIG.AGILITY_DODGE_SCALE,
  );
  const missed = rng() < dodge;

  // 暴击判定（未命中不判暴击）
  const crit = !missed && rng() < finalCritRate;

  // 境界硬壁垒
  let barrierRate = 0;
  if (defTier > atkTier) barrierRate = 1.0;

  let damage = Math.max(0, (attackPower - baseDefense) * spec.multiplier - defBonuses.defense);
  damage = damage * (1 - barrierRate) * elementMultiplier(spec.element, getDefenseElement(defender), spec.tier);
  if (crit) damage *= BATTLE_CONFIG.CRIT_MULTIPLIER;

  return {
    finalDamage: missed ? 0 : Math.round(damage),
    missed,
    crit,
    blockedByBarrier: barrierRate >= 1.0,
  };
}
