// ============================================================
// useBattleEngine — 新 BattleEngine 的 UI adapter（S7）
// 目标：提供与 useCombat 完全相同的接口表面，让 useBattleUI 透明切换
// 策略：包装 BattleEngine，维护一个响应式 state 镜像同步引擎内部状态
// 旧路径（useCombat）保留为 legacy，通过 engineMode 开关切换
// ============================================================

import { reactive, onScopeDispose } from 'vue';
import type { Character, HexBattleMap, Skill, BattleSceneConfig, BattleState } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';
import {
  BattleEngine,
  attemptFlee,
  type FleeResult,
} from '@taosim/engine';

/** 与 useCombat 的 CombatState 接口兼容的镜像类型（engine 字段类型不同） */
interface V2CombatState {
  engine: BattleEngine | null;       // v1 是 CombatEngine，v2 是 BattleEngine
  map: HexBattleMap;
  characters: Record<string, Character>;
  currentTurn: string | null;
  selectedSkill: Skill | null;
  phase: 'idle' | 'moving' | 'targeting' | 'executing';
  log: string[];
  atb: Record<string, { gauge: number; actionReady: boolean }>;
  movePoints: number;
  maxMovePoints: number;
  turnNumber: number;
  guards: Record<string, number>;
}

/** 与 useCombat 的 AttackResult 相同的结构 */
export interface AttackResult {
  defenderId: string;
  damage: number;
  crit: boolean;
  missed: boolean;
  blockedByBarrier: boolean;
  guarded: boolean;
}

/**
 * 新引擎 UI adapter。返回值结构/useBattleUI 完全兼容。
 * @param sceneConfig 场景规则（可选）— 从 BattleConfig 传入
 */
export function useBattleEngine(
  map: HexBattleMap,
  playerId: string,
  player: Character,
  enemies: Character[],
  sceneConfig?: BattleSceneConfig,
) {
  // 新 BattleEngine 是自包含状态机，state 内部维护
  const engine = new BattleEngine(Date.now() % 2147483647);
  const startResult = engine.start(map, [player], enemies, sceneConfig);
  if (startResult.error) {
    // 不期望失败（start 只在 map 为空时失败）；若失败抛错让 UI 显式处理
    throw new Error(`useBattleEngine: engine.start failed: ${startResult.error}`);
  }

  // 镜像 state：从 engine.getState() 同步到响应式镜像
  const state = reactive<V2CombatState>({
    engine,
    map: engine.getState().map,
    characters: engine.getState().characters,
    currentTurn: engine.getState().currentTurnId,
    selectedSkill: null,
    phase: 'idle',
    log: [],
    atb: {},
    movePoints: 0,
    maxMovePoints: 0,
    turnNumber: 0,
    guards: {},
  });

  // 初始化 atb 镜像
  syncAtbMirror();
  // 初始移动池（从玩家 unit 取）
  const playerUnit = engine.getState().units[playerId];
  if (playerUnit) {
    state.movePoints = playerUnit.movePoints;
    state.maxMovePoints = playerUnit.maxMovePoints;
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let paused = false;

  /** 同步 atb 镜像（从引擎 unit 字段） */
  function syncAtbMirror() {
    const engineState = engine.getState();
    for (const [id, unit] of Object.entries(engineState.units)) {
      state.atb[id] = {
        gauge: unit.gauge,
        actionReady: unit.actionReady,
      };
    }
  }

  /** 把引擎的内部状态完整同步到镜像（每次命令后调用） */
  function syncFromEngine() {
    const engineState = engine.getState();
    state.map = engineState.map;
    state.characters = engineState.characters;
    state.currentTurn = engineState.currentTurnId;
    state.turnNumber = engineState.turnNumber;
    syncAtbMirror();
    const p = engineState.units[playerId];
    if (p) {
      state.movePoints = p.movePoints;
      state.maxMovePoints = p.maxMovePoints;
    }
    // 从事件流同步最近日志（取最后 50 条）
    const evs = engineState.events;
    state.log = evs.slice(-50).map((e) => `${e.type}:${e.actorId ?? ''} ${Object.keys(e.data).length > 0 ? JSON.stringify(e.data).slice(0, 60) : ''}`);
    // 同步守卫：v2 引擎用 unit.guarding，需要投影到 guards 字典（characterId → 截止回合）
    state.guards = {};
    for (const [id, unit] of Object.entries(engineState.units)) {
      if (unit.guarding) {
        state.guards[id] = unit.guarding.expiresAtActivation;
      }
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      if (paused) return;
      tick();
    }, 400);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function setPaused(v: boolean) {
    paused = v;
  }

  /** ATB 推进一步：调用引擎 advanceTick，同步镜像，触发 NPC 自动行动 */
  function tick() {
    // 如果当前没有行动者，推进 ATB
    if (engine.getState().currentTurnId === null) {
      engine.dispatch({ type: 'AdvanceTick' });
    }
    syncFromEngine();
    // NPC 回合自动触发（引擎内部 resolveAiTurn 已处理）
    // 玩家回合等待 UI 命令
  }

  /** 玩家移动 */
  function movePlayer(toQ: number, toR: number): boolean {
    // 检查引擎内部 currentTurnId（而非镜像，镜像可能在 syncFromEngine 之前未更新）
    if (engine.getState().currentTurnId !== playerId) return false;
    const r = engine.dispatch({ type: 'Move', actorId: playerId, to: { q: toQ, r: toR } });
    if (r.error) {
      state.log.push(`移动失败：${r.error}`);
      return false;
    }
    syncFromEngine();
    return true;
  }

  /** 选择技能（进入 targeting 相位） */
  function selectSkill(skill: Skill) {
    state.selectedSkill = skill;
    state.phase = 'targeting';
  }

  /** 用已选技能攻击目标 */
  function attackTarget(targetId: string): AttackResult | null {
    if (engine.getState().currentTurnId !== playerId || !state.selectedSkill) return null;
    const skillId = state.selectedSkill.id;
    const targetBefore = state.characters[targetId]?.hp ?? 0;
    const r = engine.dispatch({ type: 'UseSkill', actorId: playerId, skillId, targetId });
    state.selectedSkill = null;
    state.phase = 'idle';
    if (r.error) {
      state.log.push(`技能失败：${r.error}`);
      return null;
    }
    syncFromEngine();
    const targetAfter = state.characters[targetId]?.hp ?? 0;
    const damage = Math.max(0, targetBefore - targetAfter);
    return {
      defenderId: targetId,
      damage,
      crit: false,    // 引擎事件流里有 crit 信息，UI 飘字简化处理
      missed: damage === 0,
      blockedByBarrier: false,
      guarded: state.guards[targetId] !== undefined && state.guards[targetId] >= state.turnNumber,
    };
  }

  /** 普攻 */
  function basicAttack(targetId: string): AttackResult | null {
    if (engine.getState().currentTurnId !== playerId) return null;
    const targetBefore = state.characters[targetId]?.hp ?? 0;
    const r = engine.dispatch({ type: 'BasicAttack', actorId: playerId, targetId });
    if (r.error) {
      state.log.push(`普攻失败：${r.error}`);
      return null;
    }
    syncFromEngine();
    const targetAfter = state.characters[targetId]?.hp ?? 0;
    const damage = Math.max(0, targetBefore - targetAfter);
    return {
      defenderId: targetId,
      damage,
      crit: false,
      missed: damage === 0,
      blockedByBarrier: false,
      guarded: state.guards[targetId] !== undefined && state.guards[targetId] >= state.turnNumber,
    };
  }

  /** 防御（+1 AP 封顶，置 guard 减伤） */
  function defend() {
    if (engine.getState().currentTurnId !== playerId) return;
    engine.dispatch({ type: 'Guard', actorId: playerId });
    syncFromEngine();
  }

  /** 结束玩家回合 */
  function endTurn() {
    if (engine.getState().currentTurnId !== playerId) return;
    engine.dispatch({ type: 'EndActivation', actorId: playerId });
    syncFromEngine();
  }

  /** 逃跑 */
  function flee(battleType: 'duel' | 'encounter'): FleeResult {
    if (engine.getState().currentTurnId !== playerId) return 'hit';
    const r = engine.dispatch({ type: 'Flee', actorId: playerId });
    syncFromEngine();
    if (r.error === 'flee_disabled') return 'caught';
    if (r.error === 'flee_caught') return 'caught';
    if (r.error) return 'hit';
    // 判定结果：fled=true → success；hp 减少但战斗未结束 → escape-hit/hit
    const engineState = engine.getState();
    if (engineState.fled) return 'success';
    // 检查事件流里是否有 pursue（追击命中）
    const lastFleeEvent = engineState.events.slice().reverse().find((e) => e.type === 'damage' && (e.data as any)?.pursuit);
    return lastFleeEvent ? 'escape-hit' : 'hit';
  }

  /** NPC 自动行动（新引擎内部已处理，这里空实现保持接口兼容） */
  async function executeNpcTurn(_npcId: string) {
    // 新引擎在 advanceTick 触发 actionReady 后立即由 resolveAiTurn 处理 NPC 行动
    // 此函数保留为空 stub，避免 useBattleUI 重复调用
  }

  /**
   * 测试钩子：强制激活玩家单位（绕过 ATB 等待）。
   * 仅在测试中使用，让玩家立即进入 actionReady + currentTurnId 状态。
   */
  function _forcePlayerActivationForTest() {
    const engineState = engine.getState() as BattleState;
    const playerUnit = engineState.units[playerId];
    if (playerUnit) {
      const agility = engineState.characters[playerId]?.attributes.agility ?? 10;
      const movePts = Math.max(2, 2 + Math.floor(agility / 5));
      playerUnit.actionReady = true;
      playerUnit.gauge = 100;
      playerUnit.movePoints = movePts;
      playerUnit.maxMovePoints = movePts;
      playerUnit.actionPoints = playerUnit.maxActionPoints;
      engineState.currentTurnId = playerId;
      engineState.turnNumber += 1;
    }
    syncFromEngine();
  }

  onScopeDispose(stop);

  return {
    state,
    start,
    stop,
    setPaused,
    tick,
    movePlayer,
    selectSkill,
    attackTarget,
    basicAttack,
    defend,
    endTurn,
    executeNpcTurn,
    flee,
    // 测试钩子（以下划线开头表示内部 API，生产代码不应调用）
    _forcePlayerActivationForTest,
  };
}

/** 类型导出：供 BattleOverlay 的 engineMode 开关使用 */
export type BattleEngineCombat = ReturnType<typeof useBattleEngine>;
