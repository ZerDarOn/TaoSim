import type { BattleState, BattleUnit, BattleCommand, BattleEvent, HexBattleMap, Character } from '@taosim/contracts';
import { hexKey, hexDistance } from '@taosim/contracts';
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
   * 任一侧可放置格不足时启动失败：返回 { error: 'not_enough_spawn_slots' }，
   * 且不做任何部分写入（state 保持 Idle 原样，不放置、不发 battle_start）。
   */
  start(map: HexBattleMap, players: Character[], enemies: Character[]): { error?: string } {
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
    const d = hexDistance(from.q, from.r, toQ, toR);
    if (d > unit.movePoints) return { error: 'out_of_range' };
    const tile = this.state.map.tiles[hexKey(toQ, toR)];
    if (!tile || tile.isBlocked) return { error: 'blocked' };
    if (tile.occupantId) return { error: 'occupied' };
    const oldTile = this.state.map.tiles[hexKey(from.q, from.r)];
    if (oldTile) oldTile.occupantId = undefined;
    tile.occupantId = actorId;
    unit.movePoints -= d;
    this.emit('move', actorId, undefined, { toQ, toR, cost: d, remaining: unit.movePoints });
    return {};
  }

  private dispatchBasicAttack(actorId: string, targetId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const attacker = this.state.characters[actorId]!;
    const defender = this.state.characters[targetId];
    if (!defender || defender.hp <= 0) return { error: 'invalid_target' };
    const unit = this.state.units[actorId]!;
    if (unit.actionPoints < 1) return { error: 'no_ap' };

    const from = this.findUnitPosition(actorId);
    const to = this.findUnitPosition(targetId);
    if (!from || !to) return { error: 'no_position' };
    const d = hexDistance(from.q, from.r, to.q, to.r);
    if (d > 1) return { error: 'out_of_range' };

    unit.actionPoints -= 1;
    const result = calculateDamage(attacker, defender, { multiplier: 1, element: 'Physical', tier: 1 }, this.rng);
    defender.hp = Math.max(0, defender.hp - result.finalDamage);
    this.emit('damage', actorId, [targetId], {
      amount: result.finalDamage,
      missed: result.missed,
      crit: result.crit,
      blocked: result.blockedByBarrier,
    });
    if (defender.hp <= 0) {
      defender.soulState = 'RemnantSoul';
      const dunit = this.state.units[targetId]!;
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
    if (this.state.currentTurnId && this.state.currentTurnId !== actorId) return { error: 'not_your_turn' };
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
