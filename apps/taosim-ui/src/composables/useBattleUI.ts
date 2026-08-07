import { ref, computed, watch } from 'vue';
import type { Skill, HexBattleMap } from '@taosim/contracts';
import type { BattleUIPhase, FloatingText, ReachableTile, AttackTargetTile } from '@/battle/types';
import { computeMoveRange, computeAttackTargets, findOccupant } from '@/battle/hex-utils';
import { ATTACK_RANGE } from './useCombat';
import type { useCombat } from './useCombat';

type Combat = ReturnType<typeof useCombat>;

let floatId = 0;

/**
 * 战斗 UI 状态机（设计文档 §5）。封装 useCombat，管理 phase/高亮/飘字。
 * 轮到玩家（currentTurn === playerId）时自动进入 command。
 */
export function useBattleUI(combat: Combat, playerId: string) {
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

  // 攻击高亮：targeting 时射程内目标（普攻固定射程 1；技能当前统一 1）
  const attackRange = computed<AttackTargetTile[]>(() => {
    if ((phase.value !== 'targeting-attack' && phase.value !== 'targeting-skill') || !player.value) return [];
    return computeAttackTargets(combat.state.map, playerId, ATTACK_RANGE);
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

  /** 结算后：目标格生成伤害飘字并回 idle */
  function finishAction(res: { defenderId: string; damage: number } | null) {
    const defenderPos = res ? findOccupant(combat.state.map, res.defenderId) : null;
    if (res && defenderPos) {
      pushFloat(defenderPos.q, defenderPos.r, `-${res.damage}`, 'damage');
    }
    selectedSkill.value = null;
    phase.value = 'idle';
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

  /** 逃跑命令（不结束回合）：成功/escape-hit 由外层关战斗；caught 本回合锁逃跑 */
  function fleeCmd(battleType: 'duel' | 'encounter') {
    if (phase.value !== 'command' || !canFlee.value) return 'hit' as const;
    phase.value = 'executing';
    const result = combat.flee(battleType);
    if (result === 'caught') canFlee.value = false;
    phase.value = 'idle';
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
