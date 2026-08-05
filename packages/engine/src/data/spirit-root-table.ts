// ============================================================
// 灵根修炼效率倍率表 — Phase 9 §2.1
// ============================================================

import type { SpiritRootGrade } from '@taosim/contracts';

// 品级基础倍率
export const GRADE_MULTIPLIER: Record<SpiritRootGrade, number> = {
  Heaven: 2.0,    // 天灵根：修炼极速
  Earth: 1.5,     // 地灵根：资质优异
  Profound: 1.0,  // 玄灵根：中规中矩
  Yellow: 0.7,    // 黄灵根：资质平庸
};

// 灵根数量修正系数（精纯度）
export const ELEMENT_COUNT_MODIFIER: Record<number, number> = {
  1: 1.3,   // 单灵根最精纯
  2: 1.0,   // 双灵根
  3: 0.8,   // 三灵根混杂
};

// 变异灵根额外系数
export const VARIANT_MULTIPLIER = 1.3;

// 废灵根倍率（隐藏档）
export const WASTE_ROOT_MULTIPLIER = 0.3;

/**
 * 计算灵根的综合修炼效率倍率
 * = 品级倍率 × 数量系数 × (变异? 1.3 : 1.0)
 */
export function getSpiritRootMultiplier(
  grade: SpiritRootGrade,
  elementCount: number,
  isVariant: boolean
): number {
  const gradeMult = GRADE_MULTIPLIER[grade];
  const countMult = ELEMENT_COUNT_MODIFIER[elementCount] ?? 0.8;
  const variantMult = isVariant ? VARIANT_MULTIPLIER : 1.0;
  return gradeMult * countMult * variantMult}
