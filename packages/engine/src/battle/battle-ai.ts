import type { Character, Skill } from '@taosim/contracts';
import { hexDistance } from '@taosim/contracts';
import { maxRange } from './atomic/registry.js';
import { scoreAction, type ActionCandidate, type ScoreContext } from './utility-ai.js';

export type AiDecision =
  | { type: 'basicAttack'; targetId: string }
  | { type: 'useSkill'; skillId: string; targetId: string }
  | { type: 'move'; to: { q: number; r: number } }
  | { type: 'guard' }
  | { type: 'flee' }
  | { type: 'surrender' };

/** C3 效用决策结果（含诊断信息） */
export interface UtilityDecision {
  action: AiDecision;
  /** 候选列表（已评分排序，用于诊断） */
  diagnostics: Array<{ actionType: string; utility: number; reason: string }>;
}

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
 * N vs N AI（S6 固定优先级链，C3 后作为兜底）。
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

  // ============================================================
  // C3：Utility AI 正式战斗 AI
  //
  // 生成合法候选 → 效用评分 → 选最优。
  // BattleEngine.resolveAiTurn 通过此入口决策。
  // ============================================================

  /**
   * C3：基于效用评分的 AI 决策。
   *
   * 流程：
   *  1. 从引擎状态生成合法候选（攻击/技能/移动/逃跑/防御）
   *  2. 对每个候选估算伤害和风险
   *  3. 构建评分上下文（HP 比/距离等）
   *  4. 效用评分排序
   *  5. 返回最佳决策 + 诊断信息
   *
   * 如果候选生成失败（无存活敌人或无法定位），回退到固定优先级链。
   */
  static decideWithUtility(npc: Character, playerIds: string[], engine: EngineLike): AiDecision {
    const state = engine.getState();
    const alive = playerIds.filter((id) => (state.characters[id]?.hp ?? 0) > 0);
    if (alive.length === 0) return { type: 'guard' };

    const npcPos = findPosition(engine, npc.id);
    if (!npcPos) return { type: 'guard' };

    // 构建候选列表
    const candidates = this.generateCandidates(npc, alive, npcPos, engine);
    if (candidates.length === 0) return { type: 'guard' };

    // 评分上下文
    const nearestEnemy = this.findNearestEnemy(alive, npcPos, engine);
    const ctx: ScoreContext = {
      hpPercent: npc.hp / npc.maxHp,
      enemyHpPercent: nearestEnemy ? (state.characters[nearestEnemy.id]?.hp ?? 100) / (state.characters[nearestEnemy.id]?.maxHp ?? 100) : 1,
      distanceToEnemy: nearestEnemy?.dist,
    };

    // 评分
    const scored = candidates.map(c => scoreAction(c, ctx));
    scored.sort((a, b) => b.utility - a.utility);

    // C3 诊断输出（开发时可用 console.debug 查看）
    // scored.forEach((c, i) => console.debug(`[C3 AI] #${i} ${c.action.type} util=${c.utility} dmg=${c.estimatedDamage} risk=${c.estimatedRisk}`));

    return scored[0]!.action;
  }

  /**
   * C3：生成合法候选列表。
   * 不重复 BattleEngine 的 AP/灵力/冷却/地形检查——仅生成候选形状，
   * 无效候选在 dispatch 阶段被引擎拒绝自然衰减。
   */
  private static generateCandidates(
    npc: Character,
    aliveEnemyIds: string[],
    npcPos: { q: number; r: number },
    engine: EngineLike,
  ): ActionCandidate[] {
    const candidates: ActionCandidate[] = [];
    const state = engine.getState();

    // 最近敌人信息
    const nearest = this.findNearestEnemy(aliveEnemyIds, npcPos, engine);
    const nearestId = nearest?.id;
    const nearestDist = nearest?.dist;

    // 血量最低敌人（补刀优先目标）
    const lowestHpEnemy = [...aliveEnemyIds].sort(
      (a, b) => (state.characters[a]?.hp ?? 999) - (state.characters[b]?.hp ?? 999),
    )[0];

    // ── 攻击候选 ──
    if (nearestId && nearestDist !== undefined) {
      // 普攻（距离 1）
      if (nearestDist <= 1) {
        const target = lowestHpEnemy ?? nearestId;
        candidates.push({
          action: { type: 'basicAttack', targetId: target },
          estimatedDamage: npc.attributes.physique * 1.2, // 基础普攻估算
          estimatedRisk: this.estimateCounterDamage(npc, target, engine),
          utility: 0,
        });
      }

      // 可用技能（取前 5 个避免枚举爆炸）
      const castable = npc.skills
        .filter(s => isSkillCastable(s, npc))
        .slice(0, 5);
      for (const skill of castable) {
        const range = maxRange(skill.primitives);
        if (nearestDist > range) continue;

        // 估算伤害
        let mult = 1.0;
        for (const p of skill.primitives) {
          if (p.category === 'Numeric' && typeof p.params.multiplier === 'number') {
            mult = Math.max(mult, p.params.multiplier);
          }
        }
        const estimatedDamage = npc.attributes.comprehension * mult * 2;

        // 对每个在射程内的敌人各生成一个候选
        for (const enemyId of aliveEnemyIds) {
          const ep = findPosition(engine, enemyId);
          if (!ep) continue;
          if (hexDistance(npcPos.q, npcPos.r, ep.q, ep.r) > range) continue;

          candidates.push({
            action: { type: 'useSkill', skillId: skill.id, targetId: enemyId },
            estimatedDamage: estimatedDamage,
            estimatedRisk: this.estimateCounterDamage(npc, enemyId, engine),
            utility: 0,
          });
        }
      }
    }

    // ── 移动候选（朝最近敌人方向） ──
    if (nearestDist && nearestDist > 1) {
      const nearestPos = findPosition(engine, nearestId!);
      if (nearestPos) {
        const moveTarget = BattleAI.findBestMoveToward(npcPos, nearestPos, engine, npc);
        if (moveTarget) {
          candidates.push({
            action: { type: 'move', to: moveTarget },
            estimatedDamage: 0,
            estimatedRisk: 0,
            utility: 0,
          });
        }
      }
    }

    // ── 逃跑候选（场景允许时）──
    if (state.sceneConfig?.fleeEnabled !== false) {
      candidates.push({
        action: { type: 'flee' },
        estimatedDamage: 0,
        estimatedRisk: 0,
        utility: 0,
      });
    }

    if (state.sceneConfig?.surrenderEnabled !== false && npc.hp < npc.maxHp * 0.2) {
      candidates.push({
        action: { type: 'surrender' },
        estimatedDamage: 0,
        estimatedRisk: 0,
        utility: 0,
      });
    }

    // ── 防御候选（永远是合法选项）──
    candidates.push({
      action: { type: 'guard' },
      estimatedDamage: 0,
      estimatedRisk: npc.hp < npc.maxHp * 0.3 ? 30 : 10,
      utility: 0,
    });

    return candidates;
  }

  /** 找最近存活敌人 */
  private static findNearestEnemy(
    aliveIds: string[],
    fromPos: { q: number; r: number },
    engine: EngineLike,
  ): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (const id of aliveIds) {
      const pos = findPosition(engine, id);
      if (!pos) continue;
      const dist = hexDistance(fromPos.q, fromPos.r, pos.q, pos.r);
      if (!best || dist < best.dist) {
        best = { id, dist };
      }
    }
    return best;
  }

  /** 估算来自敌人的反击伤害 */
  private static estimateCounterDamage(npc: Character, enemyId: string, engine: EngineLike): number {
    const enemy = engine.getState().characters[enemyId];
    if (!enemy) return 0;
    return enemy.attributes.physique * 0.6; // 简化估算
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
