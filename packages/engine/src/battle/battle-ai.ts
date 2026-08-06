import type { Character } from '@taosim/contracts';

export type AiDecision =
  | { type: 'basicAttack'; targetId: string }
  | { type: 'move'; to: { q: number; r: number } }
  | { type: 'guard' };

/** 引擎只读视图 — 结构化接口，避免 BattleAI 对 BattleEngine 实现的强依赖 */
export interface EngineLike {
  getState(): { characters: Record<string, Character> };
}

/**
 * N vs N AI — Phase A 简化版。
 * 无技能/技能不可用时普攻血量最低目标；无目标时防御（永不软锁）。
 * Phase B 将加入技能收益评估与五行克制倾向。
 */
export class BattleAI {
  static decide(npc: Character, playerIds: string[], engine: EngineLike): AiDecision {
    const alive = playerIds.filter((id) => (engine.getState().characters[id]?.hp ?? 0) > 0);
    if (alive.length === 0) return { type: 'guard' };

    // 目标选择：血量最低（补刀优先）
    const targetId = [...alive].sort((a, b) => {
      const ha = engine.getState().characters[a]!.hp;
      const hb = engine.getState().characters[b]!.hp;
      return ha - hb;
    })[0]!;

    return { type: 'basicAttack', targetId };
  }
}
