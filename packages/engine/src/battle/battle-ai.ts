import type { Character, Skill } from '@taosim/contracts';
import { hexDistance } from '@taosim/contracts';
import { maxRange } from './atomic/registry.js';

export type AiDecision =
  | { type: 'basicAttack'; targetId: string }
  | { type: 'useSkill'; skillId: string; targetId: string }
  | { type: 'move'; to: { q: number; r: number } }
  | { type: 'guard' }
  | { type: 'flee' };

/** 引擎只读视图 — 结构化接口，避免 BattleAI 对 BattleEngine 实现的强依赖 */
export interface EngineLike {
  getState(): {
    characters: Record<string, Character>;
    units: Record<string, import('@taosim/contracts').BattleUnit>;
    map: import('@taosim/contracts').HexBattleMap;
    currentTurnId: string | null;
    sceneConfig?: import('@taosim/contracts').BattleSceneConfig;
  };
}

/**
 * 评估技能可用性：AP/灵力/冷却/目标阵营
 */
function isSkillCastable(skill: Skill, actor: Character): boolean {
  if (skill.type === 'Passive') return false;
  if (actor.ap < skill.cost.ap) return false;
  if (actor.spiritEnergy.current < skill.cost.spiritEnergy) return false;
  const cd = actor.skillCooldowns[skill.id];
  if (cd !== undefined && cd > 0) return false;
  return true;
}

/** 在地图上查找单位位置 */
function findPosition(engine: EngineLike, unitId: string): { q: number; r: number } | null {
  const { map } = engine.getState();
  for (const t of Object.values(map.tiles)) {
    if (t.occupantId === unitId) return { q: t.q, r: t.r };
  }
  return null;
}

/**
 * N vs N AI（S6 升级版）。
 * 决策链（按优先级）：
 *   1. 有可用技能且目标在射程内 → UseSkill（取 multiplier 最大者）
 *   2. 普攻射程内 → BasicAttack（血量最低）
 *   3. 距离过远 → Move 贴近（找最近敌方步进）
 *   4. 极度劣势（hp < 20% 且敌方强）→ Flee（场景允许时）
 *   5. 兜底：Guard（永不软锁）
 */
export class BattleAI {
  static decide(npc: Character, playerIds: string[], engine: EngineLike): AiDecision {
    const state = engine.getState();
    const alive = playerIds.filter((id) => (state.characters[id]?.hp ?? 0) > 0);
    if (alive.length === 0) return { type: 'guard' };

    // 极度劣势逃跑（hp < 20%）
    if (npc.hp < npc.maxHp * 0.2 && state.sceneConfig?.fleeEnabled !== false) {
      return { type: 'flee' };
    }

    const npcPos = findPosition(engine, npc.id);
    if (!npcPos) return { type: 'guard' };

    // 取所有可用技能（最多评估 8 个，避免性能问题）
    const castableSkills = npc.skills
      .filter((s) => isSkillCastable(s, npc))
      .slice(0, 8);

    // 1. 找最近存活敌人作为主目标
    let nearestTarget: { id: string; dist: number } | null = null;
    for (const id of alive) {
      const pos = findPosition(engine, id);
      if (!pos) continue;
      const dist = hexDistance(npcPos.q, npcPos.r, pos.q, pos.r);
      if (!nearestTarget || dist < nearestTarget.dist) {
        nearestTarget = { id, dist };
      }
    }
    if (!nearestTarget) return { type: 'guard' };

    // 2. 技能决策：找射程内且伤害最高的技能
    let bestSkill: { skill: Skill; damage: number } | null = null;
    for (const skill of castableSkills) {
      const range = maxRange(skill.primitives);
      if (nearestTarget.dist > range) continue;
      // 估算伤害（取 Numeric.multiplier 最大值）
      let mult = 1.0;
      for (const p of skill.primitives) {
        if (p.category === 'Numeric' && typeof p.params.multiplier === 'number') {
          mult = Math.max(mult, p.params.multiplier);
        }
      }
      if (!bestSkill || mult > bestSkill.damage) {
        bestSkill = { skill, damage: mult };
      }
    }
    if (bestSkill && bestSkill.damage > 1.0) {
      return { type: 'useSkill', skillId: bestSkill.skill.id, targetId: nearestTarget.id };
    }

    // 3. 普攻射程内（距离 1）→ BasicAttack
    if (nearestTarget.dist <= 1) {
      // 血量最低目标（补刀优先）
      const targetId = [...alive].sort((a, b) => {
        const ha = state.characters[a]!.hp;
        const hb = state.characters[b]!.hp;
        return ha - hb;
      })[0]!;
      return { type: 'basicAttack', targetId };
    }

    // 4. 距离过远 → Move 贴近（朝最近敌方）
    const targetPos = findPosition(engine, nearestTarget.id);
    if (targetPos) {
      const moveTarget = BattleAI.findBestMoveToward(npcPos, targetPos, engine, npc);
      if (moveTarget) return { type: 'move', to: moveTarget };
    }

    // 5. 兜底：Guard（永不软锁）
    return { type: 'guard' };
  }

  /**
   * 朝目标方向找最佳移动格（减少到目标的距离）。
   * 简化版：扫描 npc 周围 movePoints 范围内的可通行格，选距离目标最近者。
   */
  private static findBestMoveToward(
    from: { q: number; r: number },
    to: { q: number; r: number },
    engine: EngineLike,
    actor: Character,
  ): { q: number; r: number } | null {
    const MAX_MOVE = 3;
    const state = engine.getState();
    let best: { q: number; r: number } | null = null;
    let bestDist = Infinity;

    for (let dq = -MAX_MOVE; dq <= MAX_MOVE; dq++) {
      for (let dr = -MAX_MOVE; dr <= MAX_MOVE; dr++) {
        const q = from.q + dq;
        const r = from.r + dr;
        const dist = hexDistance(from.q, from.r, q, r);
        if (dist > MAX_MOVE || dist === 0) continue;

        const tile = state.map.tiles[`${q},${r}`];
        if (!tile || tile.isBlocked) continue;
        if (tile.isWater && !actor.canFly) continue;
        if (tile.occupantId && tile.occupantId !== actor.id) continue;

        const d = hexDistance(q, r, to.q, to.r);
        if (d < bestDist) {
          bestDist = d;
          best = { q, r };
        }
      }
    }
    return best;
  }
}
