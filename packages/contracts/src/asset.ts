// ============================================================
// 真实资产所有权 — S1 统一底座
//
// 重要物品使用稳定资产 ID 与真实所有权。
// 普通消耗品可按价值/类别聚合，但重要法宝/功法载体/储物袋保留实例与所有者。
// ============================================================

import type { SkillElement } from './skill.js';

/** 资产稀有度 */
export type AssetRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/** 稳定资产实例：重要物品的唯一实体 */
export interface AssetInstance {
  /** 稳定资产 ID（全局唯一） */
  assetId: string;
  /** 物品模板 ID（引用 ItemTemplate） */
  templateId: string;
  /** 显示名称 */
  name: string;
  /** 稀有度 */
  rarity: AssetRarity;
  /** 当前所有者实体 ID（playerId 或 npcId，undefined = 无主） */
  ownerId?: string;
  /** 来源记录 */
  origin: {
    /** 获取方式 */
    source: 'loot' | 'craft' | 'reward' | 'purchase' | 'inherit' | 'unknown';
    /** 获取时间 */
    at: { year: number; month: number };
  };
  /** 战斗加成（与 Item.attributes 对齐） */
  combatBonuses: {
    attack?: number;
    defense?: number;
    critRate?: number;
  };
  /** 元素属性（法宝的五行归属） */
  element?: SkillElement;
}

/** 资产所有权记录 */
export interface AssetOwnershipLog {
  /** 资产 ID */
  assetId: string;
  /** 所有者变更链 */
  history: {
    ownerId: string;
    acquiredAt: { year: number; month: number };
    lostAt?: { year: number; month: number };
    reason: string;
  }[];
}
