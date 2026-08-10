// ============================================================
// 稳定身份与实体目录 — S1 统一底座
//
// 玩家保持 Character 权威，不复制成 NpcRecord；
// NPC 由 NpcRecord 权威持有。
// ============================================================

/** 实体类型标记 */
export type EntityKind = 'player' | 'npc' | 'faction' | 'venue' | 'asset';

/** 稳定实体引用 */
export interface EntityRef {
  id: string;
  kind: EntityKind;
}

/**
 * 实体目录：通过 ID 解析权威持有者。
 * 玩家 Character 是唯一玩家权威，NPC 由 NpcRecord 权威持有。
 * 关系可引用 playerId 而不要求玩家拥有 NpcRecord。
 */
export interface EntityDirectory {
  /** 判断 ID 是否属于玩家 */
  isPlayer(id: string): boolean;
  /** 判断 ID 是否属于活动 NPC（worldState.npcs） */
  isActiveNpc(id: string): boolean;
  /** 判断 ID 是否属于历史档案 NPC（archivedNpcs） */
  isArchivedNpc(id: string): boolean;
  /** 获取实体类型 */
  resolveKind(id: string): EntityKind | null;
}
