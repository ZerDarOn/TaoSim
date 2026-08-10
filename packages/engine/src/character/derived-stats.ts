// ============================================================
// DerivedStats — P2 统一派生属性
//
// 从境界、基础属性、灵根、年龄、寿元等权威输入计算
// HP、灵力、攻击、防御、速度、神识等战斗/移动派生值。
//
// 玩家与 NPC 共用此纯函数；存档保存输入，不保存派生值。
// ============================================================

import type { RealmFullPath, SpiritRoot } from '@taosim/contracts';
import { parseRealm } from '@taosim/contracts';

// —— 派生结果 ——

export interface DerivedStats {
  maxHp: number;
  maxSpiritEnergy: number;
  attack: number;
  defense: number;
  speed: number;
  /** 神识（感知范围/探测能力） */
  perception: number;
  /** 命中 */
  accuracy: number;
  /** 闪避 */
  evasion: number;
}

// —— 输入 ——

export interface DerivedStatsInput {
  realm: RealmFullPath;
  attributes: {
    physique: number;
    comprehension: number;
    perception: number;
    agility: number;
    luck: number;
    charm: number;
  };
  spiritRoot: SpiritRoot;
  age: number;
  maxLifespan: number;
  /** 装备加成（可选） */
  equipmentBonus?: { attack?: number; defense?: number };
  /** 长期状态修正（可选，如伤势/经脉损伤） */
  conditionModifier?: { hpMultiplier?: number; spiritMultiplier?: number };
}

// —— 境界倍率表 ——

/**
 * 每个大境界的派生属性倍率。
 * 倍率 × 基础值 = 该境界的派生值。
 * 子层级（如 QiRefinement_3 vs QiRefinement_1）在 tier 基础上叠加微调。
 */
const REALM_MULTIPLIERS: Record<string, {
  hp: number;
  spirit: number;
  attack: number;
  defense: number;
  speed: number;
  perception: number;
}> = {
  Mortal:       { hp: 0,  spirit: 0,    attack: 0.2,  defense: 0.2,  speed: 0.5,  perception: 0.3 },
  LianQi:       { hp: 1,  spirit: 1,    attack: 1,    defense: 1,    speed: 1,    perception: 1 },
  ZhuJi:        { hp: 5,  spirit: 3,    attack: 3,    defense: 3,    speed: 1.5,  perception: 2 },
  JinDan:       { hp: 15, spirit: 8,    attack: 8,    defense: 8,    speed: 2,    perception: 3 },
  YuanYing:     { hp: 40, spirit: 20,   attack: 20,   defense: 20,   speed: 3,    perception: 5 },
  HuaShen:      { hp: 100, spirit: 50,  attack: 50,   defense: 50,   speed: 5,    perception: 8 },
};

/** 境界子层级微调（每 +1 子层 +2.5%） */
const SUBLEVEL_FACTOR = 0.025;

/** 凡人基准气血（方案 §3.1） */
const MORTAL_BASE_HP = 5;

/** 修士炼气基准气血（引气入体后） */
const CULTIVATOR_BASE_HP = 50;

/** 修士炼气基准灵力 */
const CULTIVATOR_BASE_SPIRIT = 30;

/** 灵根等级 → 灵力效率倍率 */
const SPIRIT_ROOT_MULTIPLIER: Record<string, number> = {
  Yellow: 1.0,
  Profound: 1.3,
  Earth: 1.6,
  Heaven: 2.0,
};

/**
 * 从权威输入计算全部派生属性。
 *
 * 纯函数：同输入永远同输出。
 * 玩家与 NPC 使用同一公式，场景投影只叠加临时状态。
 */
export function computeDerivedStats(input: DerivedStatsInput): DerivedStats {
  const { realmType, subLevel } = parseRealm(input.realm);
  const mult = REALM_MULTIPLIERS[realmType ?? 'Mortal'] ?? REALM_MULTIPLIERS.Mortal!;

  // 子层级微调因子
  const subBonus = 1 + (isNaN(subLevel) ? 0 : subLevel - 1) * SUBLEVEL_FACTOR;

  // 年龄修正：壮年（16-50）全属性；少年（<16）和老年（>maxLifespan*0.7）递减
  const ageRatio = input.age / input.maxLifespan;
  const ageFactor =
    input.age < 16 ? 0.6 + (input.age / 16) * 0.4 :   // 少年渐强
    ageRatio > 0.7 ? Math.max(0.3, 1 - (ageRatio - 0.7) * 2) : // 老年递减
    1.0;

  // 灵根倍率
  const rootMult = SPIRIT_ROOT_MULTIPLIER[input.spiritRoot.grade] ?? 1.0;

  // HP 计算
  let maxHp: number;
  if (realmType === 'Mortal') {
    // 凡人：固定基准 5，体质不大幅影响（凡人尺度）
    maxHp = MORTAL_BASE_HP + Math.floor(input.attributes.physique / 20);
  } else {
    // 修士：基准 × 境界倍率 × 子层级 × 年龄 × 体质
    maxHp = Math.floor(
      CULTIVATOR_BASE_HP * mult.hp * subBonus * ageFactor
      + input.attributes.physique * 3 * mult.hp
    );
  }
  maxHp = Math.max(1, maxHp);

  // 灵力计算
  const maxSpiritEnergy = realmType === 'Mortal'
    ? 0
    : Math.floor(
        CULTIVATOR_BASE_SPIRIT * mult.spirit * subBonus * rootMult
        + input.attributes.comprehension * 2 * mult.spirit * rootMult
      );

  // 攻击 = 基础 × 境界 + 体质 + 装备
  const attack = Math.floor(
    (10 * mult.attack * subBonus + input.attributes.physique * 0.5 * mult.attack)
    + (input.equipmentBonus?.attack ?? 0)
  );

  // 防御 = 基础 × 境界 + 体质 + 装备
  const defense = Math.floor(
    (8 * mult.defense * subBonus + input.attributes.physique * 0.3 * mult.defense)
    + (input.equipmentBonus?.defense ?? 0)
  );

  // 速度 = 基础 × 境界 + 敏捷
  const speed = Math.floor(
    5 * mult.speed * subBonus + input.attributes.agility * 0.5 * mult.speed
  );

  // 神识 = 基础 × 境界 + 感知
  const perception = Math.floor(
    3 * mult.perception * subBonus + input.attributes.perception * 0.5 * mult.perception
  );

  // 命中 = 敏捷 + 感知 + 境界加成
  const accuracy = Math.floor(
    input.attributes.agility + input.attributes.perception * 0.5 + 5 * (mult.attack)
  );

  // 闪避 = 敏捷 × 境界速度因子
  const evasion = Math.floor(
    input.attributes.agility * 0.5 * mult.speed + 2
  );

  // 应用长期状态修正
  const hpFinal = Math.max(1, Math.floor(maxHp * (input.conditionModifier?.hpMultiplier ?? 1)));
  const spiritFinal = Math.max(0, Math.floor(maxSpiritEnergy * (input.conditionModifier?.spiritMultiplier ?? 1)));

  return {
    maxHp: hpFinal,
    maxSpiritEnergy: spiritFinal,
    attack,
    defense,
    speed,
    perception,
    accuracy,
    evasion,
  };
}
