// ============================================================
// Watchlist — P5 关注人物与日志降噪
//
// 三层事件过滤：
// - timeline：关注人物的事件（始终显示在时间线中）
// - world：重大世界事件（所有人可见）
// - local：同地点事件（本地消息）
// - filtered：低相关性事件（降噪隐藏）
//
// 红线 #7：关注人物不得获得剧情保护或概率特权。
// Watchlist 仅控制事件可见性，不影响任何游戏机制。
// ============================================================

import type { BigEventLog } from '@taosim/contracts';

/** 事件相关性层级 */
export type EventRelevanceLayer = 'timeline' | 'world' | 'local' | 'filtered';

/**
 * 关注列表。纯数据容器，不提供任何数值修正。
 */
export class Watchlist {
  private watched: Set<string> = new Set();

  add(npcId: string): void {
    this.watched.add(npcId);
  }

  remove(npcId: string): void {
    this.watched.delete(npcId);
  }

  isWatched(npcId: string): boolean {
    return this.watched.has(npcId);
  }

  getAll(): string[] {
    return Array.from(this.watched);
  }

  /** 清空关注列表 */
  clear(): void {
    this.watched.clear();
  }

  /**
   * 红线 #7：关注人物无特权。
   * 此方法始终返回 undefined——watchlist 不提供任何概率/属性修正。
   */
  getBonus(_npcId: string): undefined {
    return undefined;
  }

  /** 序列化（存档用） */
  toJSON(): string[] {
    return this.getAll();
  }

  /** 从存档恢复 */
  static fromJSON(ids: string[]): Watchlist {
    const wl = new Watchlist();
    for (const id of ids) wl.add(id);
    return wl;
  }
}

/**
 * 判断事件的相关性层级。
 *
 * 优先级（高→低）：
 * 1. timeline — 关注人物参与
 * 2. world — critical/epoch 级世界事件
 * 3. local — 同地点可见事件
 * 4. filtered — 低相关性（降噪）
 */
export function filterEventRelevance(event: BigEventLog, watchlist: Watchlist): EventRelevanceLayer {
  // 1. 检查是否涉及关注人物
  const involvedWatched = event.involvedCharacterIds.some(id => watchlist.isWatched(id));
  if (involvedWatched) {
    return 'timeline';
  }

  // 2. epoch 级世界事件
  if (event.severity === 'epoch') {
    return 'world';
  }

  // 3. major 级事件
  if (event.severity === 'major') {
    return 'world';
  }

  // 4. local 可见性
  if (event.visibility === 'local') {
    return 'local';
  }

  // 5. normal 级事件 → world
  if (event.severity === 'normal') {
    return 'world';
  }

  // 6. minor 级事件 → filtered（降噪）
  return 'filtered';
}
