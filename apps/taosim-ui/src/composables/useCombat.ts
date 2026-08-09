import { reactive, onScopeDispose } from 'vue';
import type { Character, HexBattleMap, Skill } from '@taosim/contracts';
import { hexKey, hexDistance } from '@taosim/contracts';
import { CombatEngine, NpcAI, calculateDamage, skillToDamageSpec, skillRange, BATTLE_CONFIG } from '@taosim/engine';
import { attemptFlee, type FleeResult } from '@taosim/engine';
import type { DamageResult } from '@taosim/engine';

interface CombatState {
  engine: CombatEngine | null;
  map: HexBattleMap;                 // 响应式地图（moveCharacter 修改可被 Vue 追踪）
  characters: Record<string, Character>;
  currentTurn: string | null;
  selectedSkill: Skill | null;
  phase: 'idle' | 'moving' | 'targeting' | 'executing';
  log: string[];
  // ATB 行动条镜像（引擎 atbQueue 的响应式副本，供 UI 展示行动值）
  atb: Record<string, { gauge: number; actionReady: boolean }>;
  // 本回合移动池：由身法决定，每次移动消耗实际距离
  movePoints: number;
  maxMovePoints: number;
  // 回合计数：每分配一个新行动者 +1（守卫过期判定基准，语义同 v2 引擎）
  turnNumber: number;
  // 守卫标记：characterId → 有效截止回合（>= turnNumber 时受击减半）
  guards: Record<string, number>;
}

/** ATB 行动条推进间隔（毫秒） */
const ATB_TICK_MS = 400;
/** 普通技能攻击射程（格） */
export const ATTACK_RANGE = 1;

/** 战斗内最大行动点（防御回复封顶值，也用于 UI 显示 ●●●） */
export const MAX_AP = 3;

/** 普攻内置 Skill：射程 1、系数 1.0、消耗 1 AP，复用 calculateDamage 结算 */
export const BASIC_ATTACK_SKILL: Skill = {
  id: 'basic_attack',
  name: '普攻',
  quality: 'Huang',
  type: 'Active',
  primitives: [],
  cost: { ap: 1, spiritEnergy: 0 },
  cooldownTurns: 0,
};

/** 攻击结算结果（供 UI 飘字：暴击/闪避/格挡/伤害） */
export interface AttackResult {
  defenderId: string;
  damage: number;
  crit: boolean;
  missed: boolean;
  blockedByBarrier: boolean;
  guarded: boolean; // 防御减伤触发
}

/** 对目标造成伤害的统一结算：应用守卫减伤并返回完整结果（含飘字需要的类型标记） */
function applyHit(defender: Character, attacker: Character, result: DamageResult, guardActive: boolean): number {
  let finalDamage = result.finalDamage;
  if (guardActive) {
    finalDamage = Math.round(finalDamage * BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER);
  }
  defender.hp = Math.max(0, defender.hp - finalDamage);
  return finalDamage;
}

  /** 每回合移动池 = 2 + ⌊身法/5⌋（身法 5→3 格、10→4 格、15→5 格、20→6 格） */
export function calcMovePoints(agility: number): number {
  return Math.max(2, 2 + Math.floor(agility / 5));
}

export function useCombat(map: HexBattleMap, playerId: string, player: Character, enemies: Character[]) {
  const allChars = [player, ...enemies];
  const charMap = Object.fromEntries(allChars.map(c => [c.id, reactive(c)])) as Record<string, Character>;

  const mapState = reactive(map);
  const engine = new CombatEngine(mapState, allChars);

  // 战斗地图 q 列边界（逃跑难度按"距最近边缘格数"折算；原实现直接把列坐标 q 当距离，
  // 越往敌方半场跑惩罚越重，与"靠近边缘才好逃"的直觉相反）
  const qs = Object.values(map.tiles).map((t) => t.q);
  const qBounds = { min: qs.length ? Math.min(...qs) : 0, max: qs.length ? Math.max(...qs) : 0 };
  const state = reactive<CombatState>({
    engine,
    map: mapState,
    characters: charMap,
    currentTurn: null,
    selectedSkill: null,
    phase: 'idle',
    log: [],
    atb: {},
    movePoints: 0,
    maxMovePoints: 0,
    turnNumber: 0,
    guards: {},
  });

  /** 同步引擎 ATB 行动条到响应式镜像（供 ATBBar 渲染行动值） */
  function syncAtb() {
    for (const unit of engine.getAtbQueue()) {
      state.atb[unit.characterId] = { gauge: unit.gauge, actionReady: unit.actionReady };
    }
  }
  syncAtb();

  let timer: ReturnType<typeof setInterval> | null = null;
  let paused = false;

  /** 回合开始前刷新角色技能冷却，并按身法重置移动池 */
  function beginTurn(id: string) {
    const c = state.characters[id];
    if (!c) return;
    for (const key of Object.keys(c.skillCooldowns)) {
      const cd = c.skillCooldowns[key];
      if (cd !== undefined && cd > 0) {
        c.skillCooldowns[key] = cd - 1;
      }
    }
    if (id === playerId) {
      state.maxMovePoints = calcMovePoints(c.attributes.agility);
      state.movePoints = state.maxMovePoints;
    }
  }

  /**
   * 推进 ATB 行动条。无当前行动者时才推进：
   * 行动条满的角色获得回合；若为 NPC 则自动执行其回合。
   */
  function tick() {
    if (paused) return;
    state.engine!.tickATB(state.characters);
    syncAtb();
    const ready = state.engine!.getReadyUnits();
    if (ready.length > 0 && state.currentTurn === null) {
      const unit = ready[0]!;
      state.turnNumber += 1; // 每个新行动者分配一个新回合号（守卫判定基准）
      state.currentTurn = unit.characterId;
      beginTurn(unit.characterId);
      if (unit.characterId !== playerId) {
        void executeNpcTurn(unit.characterId);
      }
    }
  }

  /** 启动 ATB 循环（战斗开始时调用） */
  function start() {
    if (timer) return;
    tick(); // 立即推进一次
    timer = setInterval(() => {
      if (state.currentTurn === null) tick();
    }, ATB_TICK_MS);
  }

  /** 暂停/恢复 ATB 推进（战斗结算期间暂停） */
  function setPaused(v: boolean) {
    paused = v;
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  onScopeDispose(stop);

  function movePlayer(toQ: number, toR: number) {
    if (state.currentTurn !== playerId) return;
    const pos = state.engine!.findCharacterPosition(playerId);
    if (!pos) return;
    const dist = hexDistance(pos.q, pos.r, toQ, toR);
    const tile = mapState.tiles[hexKey(toQ, toR)];
    if (!tile || dist > state.movePoints) return; // 超出本回合移动池
    if (tile.isBlocked) return;
    if (tile.occupantId) return; // 目标格已被占用
    if (!tile.isRevealed) return; // 战争迷雾：不可见区域不可移动
    const character = state.characters[playerId];
    if (character && tile.isWater && !character.canFly) return;
    state.engine!.moveCharacter(playerId, toQ, toR);
    state.movePoints -= dist;
    state.phase = 'idle';
  }

  function selectSkill(skill: Skill) {
    if (state.currentTurn !== playerId) return;
    state.selectedSkill = skill;
    state.phase = 'targeting';
  }

  function attackTarget(targetId: string): AttackResult | null {
    if (!state.currentTurn || !state.selectedSkill) return null;
    const attacker = state.characters[state.currentTurn];
    const defender = state.characters[targetId];
    if (!attacker || !defender) return null;

    const skill = state.selectedSkill;
    // 射程校验：技能用自身 Geometry 原子射程（风刃术 range 2 等），普攻内置 1
    const range = skillRange(skill);
    const aPos = state.engine!.findCharacterPosition(attacker.id);
    const dPos = state.engine!.findCharacterPosition(targetId);
    if (aPos && dPos && hexDistance(aPos.q, aPos.r, dPos.q, dPos.r) > range) {
      state.log.push(`距离过远，${attacker.name} 无法命中 ${defender.name}`);
      state.phase = 'idle';
      return null;
    }

    // AP 前置校验：行动力不足拒绝施放（原实现结算后 Math.max(0,...) 扣减，0 AP 仍可出手）
    if (attacker.ap < skill.cost.ap) {
      state.log.push(`行动力不足，${attacker.name} 无法施展 ${skill.name}`);
      state.phase = 'idle';
      return null;
    }
    const result = calculateDamage(attacker, defender, skillToDamageSpec(skill), Math.random);
    const guardExpire = state.guards[targetId];
    const guardActive = guardExpire !== undefined && guardExpire >= state.turnNumber;
    const finalDamage = applyHit(defender, attacker, result, guardActive);
    if (result.missed) {
      state.log.push(`${attacker.name} 的攻击被 ${defender.name} 闪避`);
    } else if (result.crit) {
      state.log.push(`${attacker.name} 对 ${defender.name} 造成暴击 ${finalDamage} 点伤害`);
    } else {
      state.log.push(`${attacker.name} 对 ${defender.name} 造成 ${finalDamage} 点伤害`);
    }

    if (result.blockedByBarrier) {
      state.log.push(`境界壁垒触发！${defender.name} 毫发无伤`);
    }
    if (guardActive && finalDamage > 0) {
      state.log.push(`${defender.name} 举盾格挡，伤害减半`);
    }

    // 消耗 AP 与灵力
    attacker.ap = Math.max(0, attacker.ap - skill.cost.ap);
    attacker.spiritEnergy.current = Math.max(0, attacker.spiritEnergy.current - skill.cost.spiritEnergy);
    // 记录技能冷却
    if (skill.cooldownTurns > 0) {
      attacker.skillCooldowns[skill.id] = skill.cooldownTurns;
    }

    if (defender.hp <= 0) {
      state.log.push(`${defender.name} 已被击败`);
      defender.soulState = 'RemnantSoul';
    }

    // 消耗本回合，交由 ATB 循环继续
    state.engine!.consumeTurn(state.currentTurn);
    syncAtb();
    state.selectedSkill = null;
    state.phase = 'idle';
    state.currentTurn = null;
    return {
      defenderId: targetId,
      damage: finalDamage,
      crit: result.crit,
      missed: result.missed,
      blockedByBarrier: result.blockedByBarrier,
      guarded: guardActive,
    };
  }

  /**
   * 普攻：不依赖技能，射程 1，消耗 1 AP。
   * 返回结算结果供 UI 飘字；失败返回 null。
   */
  function basicAttack(targetId: string): AttackResult | null {
    if (state.currentTurn !== playerId) return null;
    const attacker = state.characters[state.currentTurn];
    const defender = state.characters[targetId];
    if (!attacker || !defender) return null;

    const aPos = state.engine!.findCharacterPosition(attacker.id);
    const dPos = state.engine!.findCharacterPosition(targetId);
    if (aPos && dPos && hexDistance(aPos.q, aPos.r, dPos.q, dPos.r) > ATTACK_RANGE) {
      state.log.push(`距离过远，${attacker.name} 无法命中 ${defender.name}`);
      state.phase = 'idle';
      return null;
    }

    // AP 前置校验：行动力不足拒绝普攻
    if (attacker.ap < BASIC_ATTACK_SKILL.cost.ap) {
      state.log.push(`行动力不足，${attacker.name} 无法出手`);
      state.phase = 'idle';
      return null;
    }

    const result = calculateDamage(attacker, defender, skillToDamageSpec(BASIC_ATTACK_SKILL), Math.random);
    const guardExpire = state.guards[targetId];
    const guardActive = guardExpire !== undefined && guardExpire >= state.turnNumber;
    const finalDamage = applyHit(defender, attacker, result, guardActive);
    if (result.missed) {
      state.log.push(`${attacker.name} 的攻击被 ${defender.name} 闪避`);
    } else if (result.crit) {
      state.log.push(`${attacker.name} 对 ${defender.name} 造成暴击 ${finalDamage} 点伤害`);
    } else {
      state.log.push(`${attacker.name} 对 ${defender.name} 造成 ${finalDamage} 点伤害`);
    }
    if (result.blockedByBarrier) {
      state.log.push(`境界壁垒触发！${defender.name} 毫发无伤`);
    }
    if (guardActive && finalDamage > 0) {
      state.log.push(`${defender.name} 举盾格挡，伤害减半`);
    }

    attacker.ap = Math.max(0, attacker.ap - BASIC_ATTACK_SKILL.cost.ap);

    if (defender.hp <= 0) {
      state.log.push(`${defender.name} 已被击败`);
      defender.soulState = 'RemnantSoul';
    }

    state.engine!.consumeTurn(state.currentTurn);
    syncAtb();
    state.selectedSkill = null;
    state.phase = 'idle';
    state.currentTurn = null;
    return {
      defenderId: targetId,
      damage: finalDamage,
      crit: result.crit,
      missed: result.missed,
      blockedByBarrier: result.blockedByBarrier,
      guarded: guardActive,
    };
  }

  /** 逃跑尝试：不消耗玩家回合；hit/caught/escape-hit 时敌方免费攻击一次 */
  function flee(battleType: 'duel' | 'encounter'): FleeResult {
    const playerChar = state.characters[playerId];
    const enemyChar = state.characters[enemies[0]?.id ?? ''];
    if (!playerChar || !enemyChar || state.currentTurn !== playerId) return 'hit';
    const pos = state.engine!.findCharacterPosition(playerId);
    const result = attemptFlee({
      playerRealm: playerChar.realm,
      enemyRealm: enemyChar.realm,
      playerAgility: playerChar.attributes.agility,
      enemyAgility: enemyChar.attributes.agility,
      enemyPersonalityId: enemyChar.personalityId,
      battleType,
      distanceToEdge: pos ? Math.min(pos.q - qBounds.min, qBounds.max - pos.q) : 0,
      rng: Math.random,
    });
    if (result === 'success') {
      state.log.push(`${playerChar.name} 成功逃离战斗`);
    } else if (result === 'escape-hit' || result === 'hit' || result === 'caught') {
      const dmg = calculateDamage(enemyChar, playerChar, skillToDamageSpec(BASIC_ATTACK_SKILL), Math.random);
      if (dmg.blockedByBarrier) {
        state.log.push(`境界壁垒触发！${playerChar.name} 毫发无伤`);
      } else if (dmg.missed) {
        state.log.push(`${enemyChar.name} 追击落空，${playerChar.name} 闪避了攻击`);
      } else {
        playerChar.hp = Math.max(0, playerChar.hp - dmg.finalDamage);
        state.log.push(`${enemyChar.name} 追击，对 ${playerChar.name} 造成 ${dmg.finalDamage} 点伤害`);
      }
      if (playerChar.hp <= 0) {
        state.log.push(`${playerChar.name} 已被击败`);
        playerChar.soulState = 'RemnantSoul';
      }
      if (result === 'escape-hit') {
        state.log.push(`${playerChar.name} 带伤逃离战斗`);
      } else if (result === 'hit') {
        state.log.push(`${playerChar.name} 没能甩开敌人`);
      } else {
        state.log.push(`${playerChar.name} 被敌人抓住了！`);
      }
    }
    state.phase = 'idle';
    return result;
  }

  /** 防御：回复 1 AP（封顶 MAX_AP）+ 本回合至下次行动前获得 50% 减伤（同 v2 引擎语义），并结束回合 */
  function defend(): void {
    if (state.currentTurn !== playerId) return;
    const c = state.characters[state.currentTurn];
    if (!c) return;
    c.ap = Math.min(MAX_AP, c.ap + 1);
    state.guards[playerId] = state.turnNumber + 1; // 覆盖本回合剩余 + 下一行动者回合（受击减半）
    state.log.push(`${c.name} 防御，回复 1 点行动力，举盾减伤`);
    endTurn();
  }

  async function executeNpcTurn(npcId: string) {
    const npc = state.characters[npcId];
    const playerChar = state.characters[playerId];
    if (!npc || !playerChar || !state.engine) return;

    await new Promise(r => setTimeout(r, 500));

    const action = NpcAI.decide(npc, playerChar, state.engine as any, state.characters);

    if (action.type === 'attack' && action.targetId) {
      // NpcAI 无可用技能时退化普攻（不带 skill）：补内置普攻 Skill 复用 attackTarget 全流程
      state.selectedSkill = action.skill ?? BASIC_ATTACK_SKILL;
      attackTarget(action.targetId);
    } else if (action.type === 'move' && action.toQ !== undefined && action.toR !== undefined) {
      state.engine.moveCharacter(npcId, action.toQ, action.toR);
      state.log.push(`${npc.name} 移动到 (${action.toQ}, ${action.toR})`);
      endTurn();
    } else {
      endTurn();
    }
  }

  function endTurn() {
    if (!state.currentTurn) return;
    state.engine!.consumeTurn(state.currentTurn);
    syncAtb();
    state.currentTurn = null;
    state.phase = 'idle';
    // 由 ATB 循环驱动下一次行动
  }

  return { state, start, stop, setPaused, tick, movePlayer, selectSkill, attackTarget, basicAttack, defend, endTurn, executeNpcTurn, flee };
}
