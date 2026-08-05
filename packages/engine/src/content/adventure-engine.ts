/**
 * AdventureEngine — 奇遇事件引擎
 *
 * 从 ContentRegistry 拉取已注册的事件池，根据玩家状态/节点类型筛选可触发的事件。
 * 提供"选择 → 结算"的完整流程。
 */

import { ContentRegistry } from '../content/content-registry.js';
import type { AdventureEvent, AdventureChoice, AdventureOutcome } from '../data/adventure-events.js';
import type { Character, RealmFullPath } from '@taosim/contracts';

// 境界排序表（用于比较 minRealm 条件）
const REALM_ORDER: Record<string, number> = {
  QiRefinement_1: 1, QiRefinement_2: 2, QiRefinement_3: 3, QiRefinement_4: 4,
  QiRefinement_5: 5, QiRefinement_6: 6, QiRefinement_7: 7, QiRefinement_8: 8, QiRefinement_9: 9,
  Foundation_1: 10, Foundation_2: 11, Foundation_3: 12,
  GoldenCore_1: 13, GoldenCore_2: 14, GoldenCore_3: 15,
  NascentSoul_1: 16, NascentSoul_2: 17, NascentSoul_3: 18,
  SoulFormation_1: 19, SoulFormation_2: 20, SoulFormation_3: 21,
};

export interface AdventureResult {
  event: AdventureEvent;
  outcomes: AdventureOutcome[];
  messages: string[];
}

export const AdventureEngine = {
  /**
   * 根据玩家状态和当前节点，随机选一个可触发的奇遇事件。
   * 返回 null 表示无可触发事件。
   *
   * @param player 玩家角色
   * @param nodeType 当前节点类型（City/Wilderness/Dungeon/Sect/Market）
   * @param luckBonus 额外运气加成（如来自物品/buff）
   */
  rollEvent(
    player: Character,
    nodeType?: string,
    luckBonus: number = 0,
  ): AdventureEvent | null {
    const pool = this.getAvailableEvents(player, nodeType);
    if (pool.length === 0) return null;

    // 每个事件有自己的 probability，用加权随机
    const weighted: Array<{ event: AdventureEvent; weight: number }> = pool.map(e => ({
      event: e,
      weight: (e.triggerCondition?.probability ?? 0.3) + (player.attributes.luck + luckBonus) / 200,
    }));

    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const w of weighted) {
      roll -= w.weight;
      if (roll <= 0) return w.event;
    }
    return weighted[0]?.event ?? null;
  },

  /** 获取当前可触发的所有事件（筛选条件） */
  getAvailableEvents(player: Character, nodeType?: string): AdventureEvent[] {
    return ContentRegistry.adventureEvents.filter(e => {
      const cond = e.triggerCondition;
      if (!cond) return true; // 无条件事件总是可用

      // 境界检查
      if (cond.minRealm) {
        const playerRealmLevel = REALM_ORDER[player.realm] ?? 0;
        const requiredRealmLevel = REALM_ORDER[cond.minRealm] ?? 0;
        if (playerRealmLevel < requiredRealmLevel) return false;
      }

      // 气运检查
      if (cond.minLuck && player.attributes.luck < cond.minLuck) return false;

      // 仙姿检查
      if (cond.minCharm && player.attributes.charm < cond.minCharm) return false;

      // 节点类型检查
      if (cond.nodeType && nodeType && cond.nodeType !== nodeType) return false;

      return true;
    });
  },

  /** 判断某个选项是否可选 */
  canChoose(player: Character, choice: AdventureChoice): boolean {
    const cond = choice.condition;
    if (!cond) return true;

    if (cond.minRealm) {
      const playerRealmLevel = REALM_ORDER[player.realm] ?? 0;
      const requiredRealmLevel = REALM_ORDER[cond.minRealm] ?? 0;
      if (playerRealmLevel < requiredRealmLevel) return false;
    }
    if (cond.minLuck && player.attributes.luck < cond.minLuck) return false;
    if (cond.minAttribute && cond.minValue) {
      const attrValue = player.attributes[cond.minAttribute as keyof typeof player.attributes] ?? 0;
      if (attrValue < cond.minValue) return false;
    }
    return true;
  },

  /**
   * 结算玩家选择——根据 outcomes 的 probability 判定实际结果。
   */
  resolveChoice(choice: AdventureChoice): AdventureOutcome[] {
    const results: AdventureOutcome[] = [];
    for (const outcome of choice.outcomes) {
      // probability 默认 1.0（必定发生）
      if (outcome.probability === undefined || Math.random() < outcome.probability) {
        results.push(outcome);
      }
    }
    // 如果所有概率性结果都没触发，至少返回第一个（避免空结果）
    if (results.length === 0 && choice.outcomes.length > 0) {
      results.push(choice.outcomes[0]!);
    }
    return results;
  },
};
