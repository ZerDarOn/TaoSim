// ============================================================
// 灵根抽取引擎 — Phase 9 §2.1
// ============================================================

import type { SpiritRoot, SpiritRootGrade, SpiritElementType } from '@taosim/contracts';

const WUXING_ELEMENTS: SpiritElementType[] = ['Metal', 'Wood', 'Water', 'Fire', 'Earth'];
const VARIANT_ELEMENTS: SpiritElementType[] = ['Thunder', 'Ice', 'Wind', 'Dark'];

// 品级判定阈值（累积概率）
// 普通：天 5%, 地 15%, 玄 50%, 黄 30%
// 变异：天 20%, 地 40%, 玄 30%, 黄 10%
const NORMAL_GRADE_THRESHOLDS: Array<{ grade: SpiritRootGrade; threshold: number }> = [
  { grade: 'Heaven', threshold: 0.05 },
  { grade: 'Earth', threshold: 0.20 },
  { grade: 'Profound', threshold: 0.70 },
  { grade: 'Yellow', threshold: 1.00 },
];

const VARIANT_GRADE_THRESHOLDS: Array<{ grade: SpiritRootGrade; threshold: number }> = [
  { grade: 'Heaven', threshold: 0.20 },
  { grade: 'Earth', threshold: 0.60 },
  { grade: 'Profound', threshold: 0.90 },
  { grade: 'Yellow', threshold: 1.00 },
];

// 单灵根概率（按品级）
const SINGLE_ELEMENT_PROBABILITY: Record<SpiritRootGrade, number> = {
  Heaven: 0.70,
  Earth: 0.50,
  Profound: 0.25,
  Yellow: 0.05,
};

// 变异触发概率
const VARIANT_CHANCE = 0.08;

export class SpiritRootRoller {
  /**
   * roll 灵根：先判定变异，再判定品级，最后决定元素和数量
   */
  static roll(rng: () => number = Math.random): SpiritRoot {
    const isVariant = rng() <= VARIANT_CHANCE;

    if (isVariant) {
      return this.rollVariant(rng);
    }

    return this.rollNormal(rng);
  }

  private static rollNormal(rng: () => number): SpiritRoot {
    // 品级
    const grade = this.rollGrade(rng, NORMAL_GRADE_THRESHOLDS);

    // 元素数量
    const singleChance = SINGLE_ELEMENT_PROBABILITY[grade];
    const rollCount = rng();
    let count: number;
    if (rollCount < singleChance) {
      count = 1;
    } else if (rollCount < singleChance + (1 - singleChance) * 0.5) {
      count = 2;
    } else {
      count = 3;
    }

    // 元素（不重复）
    const elements = this.pickElements(WUXING_ELEMENTS, count, rng);

    return { grade, elements, isVariant: false };
  }

  private static rollVariant(rng: () => number): SpiritRoot {
    // 变异灵根品级（偏高）
    const grade = this.rollGrade(rng, VARIANT_GRADE_THRESHOLDS);

    // 变异灵根固定单属性
    const elements = this.pickElements(VARIANT_ELEMENTS, 1, rng);

    return { grade, elements, isVariant: true };
  }

  private static rollGrade(
    rng: () => number,
    thresholds: Array<{ grade: SpiritRootGrade; threshold: number }>
  ): SpiritRootGrade {
    const roll = rng();
    for (const { grade, threshold } of thresholds) {
      if (roll <= threshold) return grade;
    }
    return 'Yellow';
  }

  private static pickElements(
    pool: SpiritElementType[],
    count: number,
    rng: () => number
  ): SpiritElementType[] {
    const available = [...pool];
    const result: SpiritElementType[] = [];
    const actualCount = Math.min(count, pool.length);

    for (let i = 0; i < actualCount; i++) {
      const idx = Math.floor(rng() * available.length);
      result.push(available[idx]!);
      available.splice(idx, 1);
    }

    return result;
  }
}
