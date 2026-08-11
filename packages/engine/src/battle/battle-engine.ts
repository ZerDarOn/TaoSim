import type { BattleState, BattleUnit, BattleCommand, BattleEvent, HexBattleMap, Character, Skill } from '@taosim/contracts';
import { hexKey, hexDistance, hexNeighbors } from '@taosim/contracts';
import { createSeededRng } from './seeded-rng.js';
import { BATTLE_CONFIG } from './battle-config.js';
import { calculateDamage, skillToDamageSpec } from './damage-calculator.js';
import { BattleAI } from './battle-ai.js';
import { attemptFlee } from './flee.js';
import { BASIC_ATTACK_SKILL } from './basic-skills.js';
import { interpretSkill, makeAtomicContext, maxRange } from './atomic/registry.js';
import type { AtomicOutcome, AtomicResult } from './atomic/types.js';
import { isAtomicFailure } from './atomic/types.js';

/**
 * BattleEngine — 战斗状态的唯一写入者。
 * UI 只能通过 dispatch(BattleCommand) 提交命令并读取 getState() 快照；
 * 快照为内部状态的直接引用，调用方不得写入。
 */
export class BattleEngine {
  private state: BattleState;
  private rng: () => number;
  private seq = 0;
  private battleId: string;

  constructor(seed: number, battleId?: string) {
    this.rng = createSeededRng(seed);
    this.battleId = battleId ?? `battle_${seed}_${Date.now()}`;
    this.state = {
      battleId: this.battleId,
      map: { width: 0, height: 0, tiles: {} },
      units: {},
      characters: {},
      currentTurnId: null,
      events: [],
      phase: 'Idle',
      tickNumber: 0,
      turnNumber: 0,
      winner: null,
      lootPool: [],
    };
  }

  getState(): Readonly<BattleState> {
    return this.state;
  }

  private cloneCharacter(c: Character): Character {
    return structuredClone(c);
  }

  private emit(
    type: string,
    actorId?: string,
    targetIds?: string[],
    data: Record<string, string | number | boolean> = {},
  ): void {
    const ev: BattleEvent = { sequence: this.seq++, tickNumber: this.state.tickNumber, type, actorId, targetIds, data };
    this.state.events.push(ev);
    if (this.state.events.length > BATTLE_CONFIG.MAX_EVENT_HISTORY) {
      this.state.events.shift();
    }
  }

  /**
   * 注册双方单位并放置到出生格（深拷贝隔离）。
   * 启动前依次校验（任一失败即返回结构化错误，不做任何部分写入，state 保持 Idle 原样）：
   *   1. 单位 ID 唯一（重复会互相覆盖 state.units）→ { error: 'duplicate_unit_id' }
   *   2. 双方至少一名存活单位（hp > 0）→ { error: 'no_alive_unit' }
   *   3. 任一侧可放置格不足 → { error: 'not_enough_spawn_slots' }
   */
  start(map: HexBattleMap, players: Character[], enemies: Character[], sceneConfig?: import('@taosim/contracts').BattleSceneConfig): { error?: string } {
    const allIds = [...players, ...enemies].map((c) => c.id);
    if (new Set(allIds).size !== allIds.length) {
      return { error: 'duplicate_unit_id' };
    }
    if (!players.some((p) => p.hp > 0) || !enemies.some((e) => e.hp > 0)) {
      return { error: 'no_alive_unit' };
    }
    const mid = Math.floor(map.width / 2);
    const tiles = Object.values(map.tiles);
    const leftCount = tiles.filter((t) => t.q < mid && !t.isBlocked && !t.isWater && !t.occupantId).length;
    const rightCount = tiles.filter((t) => t.q >= mid && !t.isBlocked && !t.isWater && !t.occupantId).length;
    if (leftCount < players.length || rightCount < enemies.length) {
      return { error: 'not_enough_spawn_slots' };
    }

    this.state.map = structuredClone(map);
    this.state.characters = {};
    this.state.units = {};
    this.state.currentTurnId = null;
    this.state.tickNumber = 0;
    this.state.turnNumber = 0;
    this.state.winner = null;
    this.state.events = [];
    this.state.sceneConfig = sceneConfig;
    this.state.fled = false;

    for (const p of players) {
      this.state.characters[p.id] = this.cloneCharacter(p);
      this.state.units[p.id] = this.makeUnit(p.id, 'Player', p.attributes.agility);
    }
    for (const e of enemies) {
      this.state.characters[e.id] = this.cloneCharacter(e);
      this.state.units[e.id] = this.makeUnit(e.id, 'Enemy', e.attributes.agility);
    }

    for (const p of players) {
      const slot = this.findStartSlot('left');
      if (slot) this.placeUnit(p.id, slot.q, slot.r);
    }
    for (const e of enemies) {
      const slot = this.findStartSlot('right');
      if (slot) this.placeUnit(e.id, slot.q, slot.r);
    }

    this.state.phase = 'Running';
    this.emit('battle_start', undefined, undefined, { players: players.length, enemies: enemies.length });
    return {};
  }

  private makeUnit(id: string, team: 'Player' | 'Enemy', agility: number): BattleUnit {
    return {
      characterId: id,
      team,
      controller: team === 'Player' ? 'Human' : 'AI',
      gauge: 0,
      actionReady: false,
      actionPoints: BATTLE_CONFIG.MAX_AP,
      maxActionPoints: BATTLE_CONFIG.MAX_AP,
      movePoints: Math.max(BATTLE_CONFIG.MOVE_BASE, BATTLE_CONFIG.MOVE_BASE + Math.floor(agility / BATTLE_CONFIG.MOVE_AGILITY_DIVISOR)),
      maxMovePoints: 0,
      statuses: [],
    };
  }

  private findStartSlot(side: 'left' | 'right'): { q: number; r: number } | null {
    const tiles = Object.values(this.state.map.tiles);
    const mid = Math.floor(this.state.map.width / 2);
    for (const t of tiles) {
      const onSide = side === 'left' ? t.q < mid : t.q >= mid;
      if (onSide && !t.isBlocked && !t.isWater && !t.occupantId) return { q: t.q, r: t.r };
    }
    return null;
  }

  private placeUnit(id: string, q: number, r: number): void {
    const tile = this.state.map.tiles[hexKey(q, r)];
    if (!tile || tile.occupantId) return;
    tile.occupantId = id;
  }

  private findUnitPosition(id: string): { q: number; r: number } | null {
    for (const t of Object.values(this.state.map.tiles)) {
      if (t.occupantId === id) return { q: t.q, r: t.r };
    }
    return null;
  }

  /** ATB 推进。同 tick 就绪排序：溢出行动值降序 → 身法降序 → characterId 升序 */
  advanceTick(): void {
    if (this.state.phase !== 'Running') return;
    this.state.tickNumber += 1;

    const ready: string[] = [];
    for (const unit of Object.values(this.state.units)) {
      const c = this.state.characters[unit.characterId];
      if (!c || c.hp <= 0) continue;
      if (unit.actionReady) { ready.push(unit.characterId); continue; }
      const slow = unit.statuses.some((s) => s.type === 'Slow');
      const gain = (BATTLE_CONFIG.ATB_BASE_GAIN + c.attributes.agility * BATTLE_CONFIG.ATB_AGILITY_GAIN) * (slow ? 0.5 : 1);
      unit.gauge = unit.gauge + gain; // 不封顶：gauge 降序即"溢出行动值降序"排序键
      if (unit.gauge >= 100) {
        unit.actionReady = true;
        ready.push(unit.characterId);
      }
    }

    if (this.state.currentTurnId) return; // 已有行动者，等其结算

    if (ready.length > 0) {
      const next = this.pickNext(ready);
      this.state.currentTurnId = next;
      this.state.turnNumber += 1;
      const unit = this.state.units[next]!;
      unit.movePoints = Math.max(BATTLE_CONFIG.MOVE_BASE, BATTLE_CONFIG.MOVE_BASE + Math.floor(this.state.characters[next]!.attributes.agility / BATTLE_CONFIG.MOVE_AGILITY_DIVISOR));
      unit.maxMovePoints = unit.movePoints;
      this.emit('activation_start', next);

      // 控制状态（S6）：Stun/Freeze 直接跳过本回合（仍结算 status tick，但无法行动）
      const controlled = unit.statuses.some((s) => s.type === 'Stun' || s.type === 'Freeze');
      if (controlled) {
        this.emit('status_effect', undefined, [next], { type: 'stunned', skipTurn: true });
        this.dispatchEndActivation(next);
        return;
      }

      if (unit.controller === 'AI') {
        this.resolveAiTurn(next);
      }
    }
  }

  private pickNext(ready: string[]): string {
    return [...ready].sort((a, b) => {
      const ga = this.state.units[a]!.gauge;
      const gb = this.state.units[b]!.gauge;
      if (ga !== gb) return gb - ga;
      const aa = this.state.characters[a]!.attributes.agility;
      const ab = this.state.characters[b]!.attributes.agility;
      if (aa !== ab) return ab - aa;
      return a < b ? -1 : 1;
    })[0]!;
  }

  /** 一方全灭时立即判定胜负 */
  checkVictory(): void {
    if (this.state.phase === 'BattleEnd') return;
    const playerAlive = Object.values(this.state.units).some(
      (u) => u.team === 'Player' && this.state.characters[u.characterId]!.hp > 0,
    );
    const enemyAlive = Object.values(this.state.units).some(
      (u) => u.team === 'Enemy' && this.state.characters[u.characterId]!.hp > 0,
    );
    if (!playerAlive || !enemyAlive) {
      this.state.phase = 'BattleEnd';
      this.state.winner = playerAlive ? 'Player' : 'Enemy';
      this.emit('battle_end', undefined, undefined, { winner: this.state.winner ?? 'none' });
    }
  }

  /** 统一命令入口：校验失败返回结构化错误，且不产生部分写入 */
  dispatch(cmd: BattleCommand): { error?: string } {
    switch (cmd.type) {
      case 'AdvanceTick':
        this.advanceTick();
        return {};
      case 'Move':
        return this.dispatchMove(cmd.actorId, cmd.to.q, cmd.to.r);
      case 'BasicAttack':
        return this.dispatchBasicAttack(cmd.actorId, cmd.targetId);
      case 'UseSkill':
        return this.dispatchUseSkill(cmd.actorId, cmd.skillId, cmd.targetId);
      case 'Guard':
        return this.dispatchGuard(cmd.actorId);
      case 'Flee':
        return this.dispatchFlee(cmd.actorId);
      case 'EndActivation':
        return this.dispatchEndActivation(cmd.actorId);
      default:
        return { error: 'unknown_command' };
    }
  }

  private canAct(actorId: string): { ok: boolean; error?: string } {
    if (this.state.phase !== 'Running') return { ok: false, error: 'battle_not_running' };
    if (this.state.currentTurnId !== actorId) return { ok: false, error: 'not_your_turn' };
    const c = this.state.characters[actorId];
    if (!c || c.hp <= 0) return { ok: false, error: 'actor_dead' };
    return { ok: true };
  }

  private dispatchMove(actorId: string, toQ: number, toR: number): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const unit = this.state.units[actorId]!;
    if (unit.movePoints < 1) return { error: 'no_move_points' };
    const from = this.findUnitPosition(actorId);
    if (!from) return { error: 'no_position' };
    const tile = this.state.map.tiles[hexKey(toQ, toR)];
    if (!tile || tile.isBlocked) return { error: 'blocked' };
    if (tile.occupantId) return { error: 'occupied' };
    // 场景规则（S6）：canFly/场景 allowWaterWalk 才能越水
    const actorChar = this.state.characters[actorId];
    const allowWater = this.state.sceneConfig?.allowWaterWalk === true || actorChar?.canFly === true;
    if (tile.isWater && !allowWater) return { error: 'water_impassable' };
    // 场景规则（S6）：战争迷雾场景要求目标格可见
    if (this.state.sceneConfig?.requireRevealed === true && !tile.isRevealed) {
      return { error: 'not_revealed' };
    }
    // BFS 寻路：必须存在 ≤ movePoints 的可通行路径，不能直线跨过阻挡/水域格
    const d = this.shortestMoveDistance(from.q, from.r, toQ, toR, unit.movePoints, allowWater);
    if (d === null) {
      // 直线距离本身超出移动力 → 超程；否则是被地形阻断且无法绕行
      return { error: hexDistance(from.q, from.r, toQ, toR) > unit.movePoints ? 'out_of_range' : 'blocked' };
    }
    const oldTile = this.state.map.tiles[hexKey(from.q, from.r)];
    if (oldTile) oldTile.occupantId = undefined;
    tile.occupantId = actorId;
    unit.movePoints -= d;
    this.emit('move', actorId, undefined, { toQ, toR, cost: d, remaining: unit.movePoints });
    return {};
  }

  /**
   * BFS 最短路径步数（只做可达性判断，不做路径回放）。
   * 每格可通行条件：格子存在 && 非阻挡 &&（非水域 || 允许越水）&&（格为空 || 该格就是目标格）。
   * 步数上限 maxSteps 内到达目标格返回步数，否则返回 null。
   */
  private shortestMoveDistance(fromQ: number, fromR: number, toQ: number, toR: number, maxSteps: number, allowWater: boolean): number | null {
    const startKey = hexKey(fromQ, fromR);
    const targetKey = hexKey(toQ, toR);
    if (startKey === targetKey) return null; // 原地移动无意义
    const visited = new Set<string>([startKey]);
    let frontier: { q: number; r: number }[] = [{ q: fromQ, r: fromR }];
    for (let step = 1; step <= maxSteps; step++) {
      const next: { q: number; r: number }[] = [];
      for (const cell of frontier) {
        for (const n of hexNeighbors(cell.q, cell.r)) {
          const key = hexKey(n.q, n.r);
          if (visited.has(key)) continue;
          visited.add(key);
          const tile = this.state.map.tiles[key];
          if (!tile || tile.isBlocked) continue;
          if (tile.isWater && !allowWater) continue;
          if (key === targetKey) return step;
          if (tile.occupantId) continue; // 途经格必须为空
          next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  }

  private dispatchBasicAttack(actorId: string, targetId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const attacker = this.state.characters[actorId]!;
    const defender = this.state.characters[targetId];
    if (!defender || defender.hp <= 0) return { error: 'invalid_target' };
    // 同队不可攻击（targetId 不存在时同样拒绝，避免强断言崩溃）
    const dunit = this.state.units[targetId];
    if (!dunit || dunit.team === this.state.units[actorId]!.team) return { error: 'invalid_target' };
    const unit = this.state.units[actorId]!;
    if (unit.actionPoints < 1) return { error: 'no_ap' };

    const from = this.findUnitPosition(actorId);
    const to = this.findUnitPosition(targetId);
    if (!from || !to) return { error: 'no_position' };
    const d = hexDistance(from.q, from.r, to.q, to.r);
    if (d > 1) return { error: 'out_of_range' };

    unit.actionPoints -= 1;
    // 普攻统一走 skillToDamageSpec（S6-P4）：保持与 UseSkill 的伤害结算路径一致
    const result = calculateDamage(attacker, defender, skillToDamageSpec(BASIC_ATTACK_SKILL), this.rng);
    this.applyDamageResult(actorId, targetId, result);
    this.emit('skill_used', actorId, [targetId], { skillId: 'basic_attack', apCost: 1 });
    return {};
  }

  /**
   * 共享的伤害应用：守卫减伤 + 护盾抵消 + 扣血 + 死亡处理。
   * 普攻、UseSkill 的 Numeric 原子都经此路径。
   */
  private applyDamageResult(
    actorId: string,
    targetId: string,
    result: { finalDamage: number; missed: boolean; crit: boolean; blockedByBarrier: boolean },
  ): void {
    const defender = this.state.characters[targetId]!;
    const dunit = this.state.units[targetId]!;
    // 守卫减伤：被攻击单位守卫未过期 → 承伤减半
    let finalDamage = result.finalDamage;
    if (dunit.guarding && dunit.guarding.expiresAtActivation >= this.state.turnNumber) {
      finalDamage = Math.round(finalDamage * BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER);
    }
    // 护盾抵消（S6）：Shield 状态按 potency 抵消伤害
    if (finalDamage > 0) {
      finalDamage = this.consumeShield(targetId, finalDamage);
    }
    defender.hp = Math.max(0, defender.hp - finalDamage);
    this.emit('damage', actorId, [targetId], {
      amount: finalDamage,
      missed: result.missed,
      crit: result.crit,
      blocked: result.blockedByBarrier,
    });
    if (defender.hp <= 0) {
      defender.soulState = 'RemnantSoul';
      dunit.actionReady = false;
      this.emit('unit_down', targetId);
      this.checkVictory();
    }
  }

  /** 护盾抵消：返回扣完护盾后的实际伤害 */
  private consumeShield(targetId: string, damage: number): number {
    const unit = this.state.units[targetId];
    if (!unit) return damage;
    let remaining = damage;
    for (const s of unit.statuses) {
      if (s.type !== 'Shield' || s.potency <= 0 || remaining <= 0) continue;
      const absorbed = Math.min(s.potency, remaining);
      s.potency -= absorbed;
      remaining -= absorbed;
    }
    // 移除 potency 归零的 Shield
    unit.statuses = unit.statuses.filter((s) => !(s.type === 'Shield' && s.potency <= 0));
    return remaining;
  }

  /**
   * 施放技能（S6-P3）：校验 → 解释原子 → 应用结果 → 消耗 AP/灵力/冷却
   * 任一校验或原子解释失败 → 零部分写入
   */
  private dispatchUseSkill(actorId: string, skillId: string, targetId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const attacker = this.state.characters[actorId]!;
    const defender = this.state.characters[targetId];
    if (!defender || defender.hp <= 0) return { error: 'invalid_target' };
    const targetUnit = this.state.units[targetId];
    if (!targetUnit) return { error: 'invalid_target' };
    const unit = this.state.units[actorId]!;

    // 查找技能：必须从 attacker.skills 取（不允许外部传任意 Skill）
    const skill = attacker.skills.find((s) => s.id === skillId);
    if (!skill) return { error: 'skill_not_found' };
    if (skill.type === 'Passive') return { error: 'passive_skill_not_castable' };

    // 消耗校验：AP/灵力/冷却（任一不足拒绝）
    if (unit.actionPoints < skill.cost.ap) return { error: 'no_ap' };
    if (attacker.spiritEnergy.current < skill.cost.spiritEnergy) return { error: 'no_spirit_energy' };
    const cd = attacker.skillCooldowns[skill.id];
    if (cd !== undefined && cd > 0) return { error: 'skill_on_cooldown' };

    // 目标合法性（技能的 target 字段）
    const targetFilter = skill.target ?? 'Enemy';
    const actorUnit = unit;
    if (targetFilter === 'Enemy' && targetUnit.team === actorUnit.team) return { error: 'invalid_target' };
    if (targetFilter === 'Ally' && targetUnit.team !== actorUnit.team) return { error: 'invalid_target' };
    if (targetFilter === 'Self' && targetId !== actorId) return { error: 'invalid_target' };

    // 射程校验（Geometry 原子的 max range）
    const range = maxRange(skill.primitives);
    const from = this.findUnitPosition(actorId);
    const to = this.findUnitPosition(targetId);
    if (!from || !to) return { error: 'no_position' };
    const d = hexDistance(from.q, from.r, to.q, to.r);
    if (d > range) return { error: 'out_of_range' };

    // 解释所有原子
    const ctx = makeAtomicContext({
      actor: attacker,
      actorUnit: unit,
      primaryTargetId: targetId,
      map: this.state.map,
      units: this.state.units,
      characters: this.state.characters,
      rng: this.rng,
      turnNumber: this.state.turnNumber,
      element: skill.element ?? 'Physical',
      tier: skill.tier ?? 1,
    });
    const outcome: AtomicOutcome = interpretSkill(skill, ctx);
    if (isAtomicFailure(outcome)) {
      return { error: `atomic_failed:${outcome.reason}` };
    }
    const atomicResult: AtomicResult = outcome;

    // 应用 application（先应用，再消耗——若应用过程出错，至少不消耗资源）
    this.applyAtomicResult(actorId, atomicResult);

    // 消耗 AP/灵力/冷却
    unit.actionPoints -= skill.cost.ap;
    attacker.spiritEnergy.current = Math.max(0, attacker.spiritEnergy.current - skill.cost.spiritEnergy);
    if (skill.cooldownTurns > 0) {
      attacker.skillCooldowns[skill.id] = skill.cooldownTurns;
    }

    this.emit('skill_used', actorId, atomicResult.appliedTo, {
      skillId: skill.id,
      apCost: skill.cost.ap,
      targets: atomicResult.appliedTo.length,
    });
    return {};
  }

  /**
   * 应用原子解释器的 application 集合到战斗状态。
   * - numericApps 中的 hpDelta > 0 → 走 applyDamageResult（守卫/护盾/死亡处理）
   * - numericApps 中的 hpDelta < 0 → 治疗
   * - statusApps → push 到 unit.statuses
   * - atbApps → 直接修改 unit.gauge（钳制 ≥ 0）
   */
  private applyAtomicResult(actorId: string, result: AtomicResult): void {
    // 1. Numeric：伤害/治疗/护盾/属性
    for (const app of result.numericApps) {
      const target = this.state.characters[app.targetId];
      const targetUnit = this.state.units[app.targetId];
      if (!target || !targetUnit) continue;
      if (app.hpDelta !== undefined) {
        if (app.hpDelta > 0) {
          // 伤害：用 calculateDamage 的 result 结构（missed/crit 等已在解释器计算）
          // 但这里 calculateDamage 已经在 numeric.ts 调用过，hpDelta 是最终值
          // 仍需应用守卫/护盾/死亡处理
          this.applyPreComputedDamage(actorId, app.targetId, app.hpDelta);
        } else if (app.hpDelta < 0) {
          // 治疗
          target.hp = Math.min(target.maxHp, target.hp - app.hpDelta);
          this.emit('heal', actorId, [app.targetId], { amount: -app.hpDelta });
        }
      }
      if (app.shieldGain !== undefined && app.shieldGain > 0) {
        // 立即追加一个 Shield 状态（与 StatusHook 的 Shield 协同）
        targetUnit.statuses.push({
          id: `shield_${this.state.tickNumber}_${app.targetId}`,
          type: 'Shield',
          potency: app.shieldGain,
          remainingTurns: 2,
          sourceId: actorId,
        });
      }
    }
    // 2. Status：直接 push 到 unit.statuses
    for (const app of result.statusApps) {
      const targetUnit = this.state.units[app.targetId];
      if (!targetUnit) continue;
      // 同类型状态覆盖（取 potency 大者，刷新 duration）
      const existing = targetUnit.statuses.find((s) => s.type === app.status.type);
      if (existing) {
        existing.potency = Math.max(existing.potency, app.status.potency);
        existing.remainingTurns = Math.max(existing.remainingTurns, app.status.remainingTurns);
      } else {
        targetUnit.statuses.push(app.status);
      }
      this.emit('status_applied', actorId, [app.targetId], {
        type: app.status.type,
        duration: app.status.remainingTurns,
      });
    }
    // 3. ATB：直接修改 gauge（钳制 ≥ 0）
    for (const app of result.atbApps) {
      const targetUnit = this.state.units[app.targetId];
      if (!targetUnit) continue;
      if (app.gaugeDelta !== undefined) {
        targetUnit.gauge = Math.max(0, targetUnit.gauge + app.gaugeDelta);
      }
      if (app.extraActionPoints !== undefined) {
        targetUnit.actionPoints = Math.min(targetUnit.maxActionPoints, targetUnit.actionPoints + app.extraActionPoints);
      }
      this.emit('atb_mutate', actorId, [app.targetId], {
        gaugeDelta: app.gaugeDelta ?? 0,
      });
    }
  }

  /**
   * 应用预先计算好的伤害值（来自 Numeric 原子的 multiplier 结算）。
   * 与 applyDamageResult 不同：这里 damage 已经结算完成，不需要再调 calculateDamage。
   * 但守卫减伤/护盾抵消/死亡处理仍要走完整流程。
   */
  private applyPreComputedDamage(actorId: string, targetId: string, damage: number): void {
    const defender = this.state.characters[targetId]!;
    const dunit = this.state.units[targetId]!;
    let finalDamage = damage;
    if (dunit.guarding && dunit.guarding.expiresAtActivation >= this.state.turnNumber) {
      finalDamage = Math.round(finalDamage * BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER);
    }
    if (finalDamage > 0) {
      finalDamage = this.consumeShield(targetId, finalDamage);
    }
    defender.hp = Math.max(0, defender.hp - finalDamage);
    this.emit('damage', actorId, [targetId], { amount: finalDamage });
    if (defender.hp <= 0) {
      defender.soulState = 'RemnantSoul';
      dunit.actionReady = false;
      this.emit('unit_down', targetId);
      this.checkVictory();
    }
  }

  /**
   * 逃跑（S6-P3）：调用 attemptFlee（d20 对抗）。
   * 成功 → 战斗结束，fled=true，胜方仍为 null
   * 失败（escape-hit/hit）→ 敌方免费攻击玩家一次
   * caught → 不结束战斗，玩家被留住
   */
  private dispatchFlee(actorId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    if (this.state.sceneConfig?.fleeEnabled === false) return { error: 'flee_disabled' };

    const player = this.state.characters[actorId]!;
    if (!player) return { error: 'unknown_actor' };
    // 找第一个敌方存活单位作为追击者
    const enemyId = Object.values(this.state.units).find(
      (u) => u.team === 'Enemy' && this.state.characters[u.characterId]!.hp > 0,
    )?.characterId;
    if (!enemyId) return { error: 'no_enemy' };
    const enemy = this.state.characters[enemyId]!;

    const from = this.findUnitPosition(actorId);
    const distanceToEdge = from ? this.distanceToNearestEdge(from.q, from.r) : 0;

    const result = attemptFlee({
      playerRealm: player.realm,
      enemyRealm: enemy.realm,
      playerAgility: player.attributes.agility,
      enemyAgility: enemy.attributes.agility,
      battleType: 'encounter',
      distanceToEdge,
      rng: this.rng,
    });

    this.emit('flee_attempt', actorId, [enemyId], { result });

    if (result === 'success') {
      this.state.phase = 'BattleEnd';
      this.state.fled = true;
      this.emit('battle_end', undefined, undefined, { winner: 'none', fled: true });
      return {};
    }

    // 非成功：敌方免费攻击玩家一次
    if (result === 'escape-hit' || result === 'hit' || result === 'caught') {
      const dmgResult = calculateDamage(enemy, player, skillToDamageSpec(BASIC_ATTACK_SKILL), this.rng);
      if (!dmgResult.blockedByBarrier && !dmgResult.missed) {
        player.hp = Math.max(0, player.hp - dmgResult.finalDamage);
        this.emit('damage', enemyId, [actorId], {
          amount: dmgResult.finalDamage,
          pursuit: true,
        });
        if (player.hp <= 0) {
          player.soulState = 'RemnantSoul';
          this.emit('unit_down', actorId);
          this.checkVictory();
        }
      }
    }

    // caught：玩家被留住，不结算本回合（仍可继续行动）
    if (result === 'caught') {
      return { error: 'flee_caught' };
    }
    // escape-hit/hit：仍消耗本回合（交由 EndActivation）
    this.emit('flee_hit', actorId);
    return {};
  }

  /** 玩家到地图最近边缘的格数（逃跑难度按距离折算） */
  private distanceToNearestEdge(q: number, r: number): number {
    const qs = Object.values(this.state.map.tiles).map((t) => t.q);
    const rs = Object.values(this.state.map.tiles).map((t) => t.r);
    const qMin = qs.length ? Math.min(...qs) : 0;
    const qMax = qs.length ? Math.max(...qs) : 0;
    const rMin = rs.length ? Math.min(...rs) : 0;
    const rMax = rs.length ? Math.max(...rs) : 0;
    return Math.min(q - qMin, qMax - q, r - rMin, rMax - r);
  }

  private dispatchGuard(actorId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const unit = this.state.units[actorId]!;
    unit.actionPoints = Math.min(unit.maxActionPoints, unit.actionPoints + 1);
    unit.guarding = { element: 'Physical', tier: 1, expiresAtActivation: this.state.turnNumber + 1 };
    this.emit('guard', actorId, undefined, { ap: unit.actionPoints });
    this.dispatchEndActivation(actorId);
    return {};
  }

  private dispatchEndActivation(actorId: string): { error?: string } {
    const unit = this.state.units[actorId];
    if (!unit) return { error: 'unknown_unit' };
    // 严格回合校验：currentTurnId 必须就是 actorId（currentTurnId 为 null 时任何单位都不可调用）
    if (this.state.currentTurnId !== actorId) return { error: 'not_your_turn' };
    // 状态 tick（S6-P6）：本回合行动者身上的状态在回合结束时结算
    this.processStatusTick(actorId);
    unit.actionReady = false;
    unit.gauge = 0;
    const c = this.state.characters[actorId];
    if (c) {
      for (const key of Object.keys(c.skillCooldowns)) {
        if (c.skillCooldowns[key]! > 0) c.skillCooldowns[key]! -= 1;
      }
    }
    this.state.currentTurnId = null;
    this.emit('activation_end', actorId);
    this.checkVictory();
    return {};
  }

  /**
   * 状态回合结算（S6-P6）：在行动者回合结束时处理其身上的状态。
   * - Poison/Burn/SoulDrain：每回合扣 potency × POISON_DAMAGE_RATIO 血
   * - Regen：每回合回 potency × REGEN_HEAL_RATIO 血
   * - Stun/Freeze/Paralyze：跳过本回合（已在 advanceTick 阶段处理——这里只递减）
   * - Slow/Bind：ATB 减益（advanceTick 已读 Slow）
   * - 所有状态 remainingTurns - 1，归零时移除
   */
  private processStatusTick(unitId: string): void {
    const unit = this.state.units[unitId];
    if (!unit) return;
    const c = this.state.characters[unitId];
    if (!c || c.hp <= 0) return;

    const expired: string[] = [];
    for (const s of unit.statuses) {
      // DOT（持续伤害）
      if (s.type === 'Poison' || s.type === 'Burn' || s.type === 'SoulDrain') {
        const dmg = s.potency * BATTLE_CONFIG.POISON_DAMAGE_RATIO;
        c.hp = Math.max(0, c.hp - dmg);
        this.emit('status_tick', undefined, [unitId], {
          type: s.type,
          damage: dmg,
        });
      }
      // HOT（持续治疗）
      if (s.type === 'Regen') {
        const heal = s.potency * BATTLE_CONFIG.REGEN_HEAL_RATIO;
        c.hp = Math.min(c.maxHp, c.hp + heal);
        this.emit('status_tick', undefined, [unitId], {
          type: s.type,
          heal,
        });
      }
      s.remainingTurns -= 1;
      if (s.remainingTurns <= 0) expired.push(s.id);
    }
    if (expired.length > 0) {
      unit.statuses = unit.statuses.filter((s) => !expired.includes(s.id));
      this.emit('status_expired', undefined, [unitId], { count: expired.length });
    }
    // DOT 致死触发死亡处理
    if (c.hp <= 0) {
      c.soulState = 'RemnantSoul';
      unit.actionReady = false;
      this.emit('unit_down', unitId);
      this.checkVictory();
    }
  }

  private resolveAiTurn(npcId: string): void {
    const npc = this.state.characters[npcId]!;
    const playerIds = Object.values(this.state.units)
      .filter((u) => u.team === 'Player' && this.state.characters[u.characterId]!.hp > 0)
      .map((u) => u.characterId);
    const decision = BattleAI.decideWithUtility(npc, playerIds, this);
    // 执行决策（任一命令失败都不阻塞——AI 兜底 Guard 永不失败）
    switch (decision.type) {
      case 'basicAttack':
        this.dispatch({ type: 'BasicAttack', actorId: npcId, targetId: decision.targetId });
        break;
      case 'useSkill':
        this.dispatch({ type: 'UseSkill', actorId: npcId, skillId: decision.skillId, targetId: decision.targetId });
        break;
      case 'move':
        this.dispatch({ type: 'Move', actorId: npcId, to: decision.to });
        break;
      case 'flee':
        this.dispatch({ type: 'Flee', actorId: npcId });
        break;
      case 'guard':
      default:
        this.dispatch({ type: 'Guard', actorId: npcId });
        break;
    }
    // AI 决策后仍持有回合（没消耗完 AP 或未主动 EndActivation）→ 强制结算
    if (this.state.currentTurnId === npcId) {
      // 若还有 AP 且决策是攻击/技能，尝试再来一次（最多 3 次避免无限循环）
      let extraActions = 0;
      while (this.state.currentTurnId === npcId && extraActions < 3) {
        const unit = this.state.units[npcId]!;
        if (unit.actionPoints < 1) break;
        const next = BattleAI.decideWithUtility(npc, playerIds, this);
        if (next.type === 'basicAttack') {
          this.dispatch({ type: 'BasicAttack', actorId: npcId, targetId: next.targetId });
        } else if (next.type === 'useSkill') {
          this.dispatch({ type: 'UseSkill', actorId: npcId, skillId: next.skillId, targetId: next.targetId });
        } else {
          break;
        }
        extraActions++;
      }
      if (this.state.currentTurnId === npcId) {
        this.dispatch({ type: 'EndActivation', actorId: npcId });
      }
    }
  }
}
