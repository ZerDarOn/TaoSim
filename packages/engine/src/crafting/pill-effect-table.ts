import type { ItemQuality } from '@taosim/contracts';

// pillCategory 编码: 0=Restore(聚气), 1=Breakthrough(突破), 2=Lifespan(延寿)
// Restore 类: 基准值 × 倍率（Common 因丹毒打折）
export const RESTORE_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 0.6,
  Rare: 1.0,
  Epic: 1.6,
  Legendary: 2.4,
};

// Breakthrough 类: 固定百分比加成
export const BREAKTHROUGH_BONUS: Record<ItemQuality, number> = {
  Common: 5,
  Rare: 10,
  Epic: 18,
  Legendary: 25,
};

// Lifespan 类: 基准年数 × 倍率
export const LIFESPAN_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 0.5,
  Rare: 1.0,
  Epic: 1.6,
  Legendary: 2.4,
};
