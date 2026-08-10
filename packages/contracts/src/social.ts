// ============================================================
// 统一社交契约 — S1 统一底座
//
// 消除 RelationEntry 与 CharacterRelation 的有损语义。
// 这是权威社交状态，CharacterRelation 和 RelationEntry 都是它的投影。
// ============================================================

/** 统一关系类型（融合 NpcRecord.RelationType 和 Character.relation.tags） */
export type SocialRelationType =
  | 'master-disciple' | 'spouse' | 'dao-companion' | 'friend'
  | 'rival' | 'enemy' | 'clan' | 'benefactor' | 'debtor';

/** 统一关系条目：权威社交状态 */
export interface SocialEntry {
  /** 目标实体 ID（可以是 playerId 或 npcId） */
  targetId: string;
  /** 关系类型 */
  type: SocialRelationType;
  /** 好感/爱恨 (-100..100) */
  bond: number;
  /** 信任 (0..100) */
  trust: number;
  /** 仇恨 (0..100)——独立于 bond 的负向维度 */
  hatred: number;
  /** 嫉妒 (0..100)——天骄/功法/机缘引发的嫉妒 */
  jealousy: number;
  /** 关系事件链（结仇/报恩/倾心/背叛...），叙事资产不可覆盖 */
  events: string[];
  /** 最后变更时间 */
  changedAt: { year: number; month: number };
  /** 师徒方向（仅 master-disciple 使用） */
  direction?: 'master' | 'disciple';
}

/**
 * 社交状态：一个实体对其他所有实体的关系集合。
 * key = 目标实体 ID（playerId 或 npcId）
 */
export type SocialState = Record<string, SocialEntry>;
