import { ref, computed, watch } from 'vue';
import type { Character, Skill, HexBattleMap } from '@taosim/contracts';
import { skillRange } from '@taosim/engine';
import type { BattleUIPhase, FloatingText, ReachableTile, AttackTargetTile } from '@/battle/types';
import { computeMoveRange, computeAttackTargets, findOccupant } from '@/battle/hex-utils';
const ATTACK_RANGE = 1;

interface BattleUiCombatPort {
  state: {
    map: HexBattleMap;
    characters: Record<string, Character>;
    currentTurn: string | null;
    selectedSkill: Skill | null;
    movePoints: number;
  };
  selectSkill(skill: Skill): void;
  movePlayer(q: number, r: number): unknown;
  basicAttack(targetId: string): { defenderId: string; damage: number; crit?: boolean; missed?: boolean; guarded?: boolean } | null;
  attackTarget(targetId: string): { defenderId: string; damage: number; crit?: boolean; missed?: boolean; guarded?: boolean } | null;
  defend(): void;
  endTurn(): void;
  flee(battleType: 'duel' | 'encounter'): 'success' | 'escape-hit' | 'hit' | 'caught';
}

let floatId = 0;

/**
 * 战斗 UI 状态机（设计文档 §5）。只依赖最小命令端口，不感知具体战斗引擎。
 * 轮到玩家（currentTurn === playerId）时自动进入 command。
 */
export function useBattleUI(combat: BattleUiCombatPort, playerId: string) {
  const phase = ref<BattleUIPhase>('idle');
  const selectedSkill = ref<Skill | null>(null);
  const floatingTexts = ref<FloatingText[]>([]);
  const canFlee = ref(true);

  const player = computed(() => combat.state.characters[playerId]);

  // 轮到玩家 → command；他人回合 → idle
  watch(() => combat.state.currentTurn, (turn) => {
    if (turn === playerId) canFlee.value = true; // 新回合恢复逃跑
    if (turn === playerId && phase.value === 'idle') phase.value = 'command';
    if (turn !== null && turn !== playerId) phase.value = 'idle';
  });

  // 移动高亮：moving 时按移动池 BFS 可达格
  const moveRange = computed<ReachableTile[]>(() => {
    if (phase.value !== 'moving' || !player.value) return [];
    const pos = findOccupant(combat.state.map, playerId);
    if (!pos) return [];
    return computeMoveRange(combat.state.map, pos, combat.state.movePoints, player.value.canFly);
  });

  // 攻击高亮：targeting 时射程内目标（普攻固定射程 1；技能用自身 Geometry 原子射程）
  const attackRange = computed<AttackTargetTile[]>(() => {
    if ((phase.value !== 'targeting-attack' && phase.value !== 'targeting-skill') || !player.value) return [];
    const range = phase.value === 'targeting-skill' && selectedSkill.value
      ? skillRange(selectedSkill.value)
      : ATTACK_RANGE;
    return computeAttackTargets(combat.state.map, playerId, range);
  });

  function pushFloat(q: number, r: number, text: string, kind: FloatingText['kind']) {
    floatingTexts.value.push({ id: ++floatId, q, r, text, kind });
  }

  function removeFloatingText(id: number) {
    floatingTexts.value = floatingTexts.value.filter(t => t.id !== id);
  }

  function openAttack() {
    if (phase.value !== 'command') return;
    phase.value = 'targeting-attack';
  }

  function openSkill(skill: Skill) {
    if (phase.value !== 'command') return;
    selectedSkill.value = skill;
    combat.selectSkill(skill); // 同步旧引擎 targeting 相位
    phase.value = 'targeting-skill';
  }

  function openMove() {
    if (phase.value !== 'command') return;
    phase.value = 'moving';
  }

  /** 点击目标格（普攻/技能）或可达格（移动）统一入口 */
  function onTileClick(q: number, r: number) {
    const map: HexBattleMap = combat.state.map;
    const tile = map.tiles[`${q},${r}`];

    if (phase.value === 'moving') {
      if (combat.state.currentTurn !== playerId) return;
      const pos = findOccupant(combat.state.map, playerId);
      if (pos && pos.q === q && pos.r === r) { cancel(); return; } // 点击自身=取消移动
      if (moveRange.value.some(t => t.q === q && t.r === r)) {
        combat.movePlayer(q, r);
        phase.value = 'command'; // 移动不结束回合
      } else {
        pushFloat(q, r, '无法到达', 'info');
      }
      return;
    }

    if (phase.value === 'targeting-attack') {
      if (tile?.occupantId && tile.occupantId !== playerId && attackRange.value.some(t => t.q === q && t.r === r)) {
        phase.value = 'executing';
        const result = combat.basicAttack(tile.occupantId);
        finishAction(result ? { defenderId: result.defenderId, damage: result.damage } : null);
      } else {
        pushFloat(q, r, '超出射程', 'info');
      }
      return;
    }

    if (phase.value === 'targeting-skill') {
      if (tile?.occupantId && tile.occupantId !== playerId && attackRange.value.some(t => t.q === q && t.r === r)) {
        phase.value = 'executing';
        const result = combat.attackTarget(tile.occupantId);
        finishAction(result ? { defenderId: result.defenderId, damage: result.damage } : null);
      } else {
        pushFloat(q, r, '超出射程', 'info');
      }
      return;
    }

    // 其他状态点击不处理
  }

  /** 结算后：目标格生成类型化飘字（暴击/闪避/格挡/伤害）并按回合归属恢复命令栏 */
  function finishAction(res: { defenderId: string; damage: number; crit?: boolean; missed?: boolean; guarded?: boolean } | null) {
    const defenderPos = res ? findOccupant(combat.state.map, res.defenderId) : null;
    if (res && defenderPos) {
      if (res.missed) {
        pushFloat(defenderPos.q, defenderPos.r, '闪避', 'dodge');
      } else if (res.crit) {
        pushFloat(defenderPos.q, defenderPos.r, `-${res.damage}`, 'crit');
      } else if (res.guarded) {
        pushFloat(defenderPos.q, defenderPos.r, `-${res.damage}`, 'block');
      } else {
        pushFloat(defenderPos.q, defenderPos.r, `-${res.damage}`, 'damage');
      }
    }
    selectedSkill.value = null;
    // 新引擎可在一次激活中连续行动；仍持有回合时立即恢复命令栏。
    phase.value = combat.state.currentTurn === playerId ? 'command' : 'idle';
  }

  function defendCmd() {
    if (phase.value !== 'command') return;
    phase.value = 'executing';
    combat.defend();
    phase.value = 'idle';
  }

  function endTurnCmd() {
    if (phase.value !== 'command') return;
    phase.value = 'executing';
    combat.endTurn();
    phase.value = 'idle';
  }

  /** 逃跑命令（不结束回合）：成功/escape-hit 由外层关战斗；hit/caught 保留玩家回合，回 command 防软锁 */
  function fleeCmd(battleType: 'duel' | 'encounter') {
    if (phase.value !== 'command' || !canFlee.value) return 'hit' as const;
    phase.value = 'executing';
    const result = combat.flee(battleType);
    if (result === 'caught') canFlee.value = false;
    phase.value = result === 'success' || result === 'escape-hit' ? 'idle' : 'command';
    return result;
  }

  /** 取消当前选择（Esc / 右键 / 面板按钮），回 command */
  function cancel() {
    if (phase.value === 'targeting-attack' || phase.value === 'targeting-skill' || phase.value === 'moving') {
      selectedSkill.value = null;
      combat.state.selectedSkill = null;
      phase.value = 'command';
    }
  }

  return {
    phase, selectedSkill, moveRange, attackRange, floatingTexts,
    openAttack, openSkill, openMove, defendCmd, endTurnCmd, cancel,
    onTileClick, removeFloatingText, fleeCmd, canFlee,
  };
}
