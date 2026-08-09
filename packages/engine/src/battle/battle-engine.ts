import type { BattleState, BattleUnit, BattleCommand, BattleEvent, HexBattleMap, Character } from '@taosim/contracts';
import { hexKey, hexDistance, hexNeighbors } from '@taosim/contracts';
import { createSeededRng } from './seeded-rng.js';
import { BATTLE_CONFIG } from './battle-config.js';
import { calculateDamage } from './damage-calculator.js';
import { BattleAI } from './battle-ai.js';

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
  start(map: HexBattleMap, players: Character[], enemies: Character[]): { error?: string } {
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
      case 'Guard':
        return this.dispatchGuard(cmd.actorId);
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
    if (!tile || tile.isBlocked || tile.isWater) return { error: 'blocked' };
    if (tile.occupantId) return { error: 'occupied' };
    // BFS 寻路：必须存在 ≤ movePoints 的可通行路径，不能直线跨过阻挡/水域格
    const d = this.shortestMoveDistance(from.q, from.r, toQ, toR, unit.movePoints);
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
   * 每格可通行条件：格子存在 && 非阻挡 && 非水域 &&（格为空 || 该格就是目标格）。
   * 步数上限 maxSteps 内到达目标格返回步数，否则返回 null。
   */
  private shortestMoveDistance(fromQ: number, fromR: number, toQ: number, toR: number, maxSteps: number): number | null {
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
          if (!tile || tile.isBlocked || tile.isWater) continue;
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
    const result = calculateDamage(attacker, defender, { multiplier: 1, element: 'Physical', tier: 1 }, this.rng);
    // 防御减伤（§战斗：Guard 不应只是 +1 AP）：被攻击单位守卫未过期 → 承伤减半。
    // 原实现只写 guarding 标志、结算从不读取，GUARD_DAMAGE_MULTIPLIER 形同虚设
    let finalDamage = result.finalDamage;
    if (dunit.guarding && dunit.guarding.expiresAtActivation >= this.state.turnNumber) {
      finalDamage = Math.round(finalDamage * BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER);
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
    return {};
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

  private resolveAiTurn(npcId: string): void {
    const npc = this.state.characters[npcId]!;
    const playerIds = Object.values(this.state.units)
      .filter((u) => u.team === 'Player' && this.state.characters[u.characterId]!.hp > 0)
      .map((u) => u.characterId);
    const decision = BattleAI.decide(npc, playerIds, this);
    if (decision.type === 'basicAttack') {
      this.dispatch({ type: 'BasicAttack', actorId: npcId, targetId: decision.targetId });
    } else {
      this.dispatch({ type: 'Guard', actorId: npcId });
    }
    if (this.state.currentTurnId === npcId) {
      this.dispatch({ type: 'EndActivation', actorId: npcId });
    }
  }
}
