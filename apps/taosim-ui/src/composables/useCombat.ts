import { reactive } from 'vue';
import type { Character, HexBattleMap, Skill } from '@taosim/contracts';
import { hexKey, hexDistance } from '@taosim/contracts';
import { CombatEngine, DamagePipeline, NpcAI } from '@taosim/engine';

interface CombatState {
  engine: CombatEngine | null;
  characters: Record<string, Character>;
  currentTurn: string | null;
  selectedSkill: Skill | null;
  phase: 'idle' | 'moving' | 'targeting' | 'executing';
  log: string[];
}

export function useCombat(map: HexBattleMap, playerId: string, player: Character, enemies: Character[]) {
  const allChars = [player, ...enemies];
  const charMap = Object.fromEntries(allChars.map(c => [c.id, reactive(c)])) as Record<string, Character>;

  const engine = new CombatEngine(map, allChars);
  const state = reactive<CombatState>({
    engine,
    characters: charMap,
    currentTurn: null,
    selectedSkill: null,
    phase: 'idle',
    log: [],
  });

  function tick() {
    state.engine!.tickATB(state.characters);
    const ready = state.engine!.getReadyUnits();
    if (ready.length > 0) {
      const unit = ready[0]!;
      state.currentTurn = unit.characterId;
      if (unit.characterId !== playerId) {
        executeNpcTurn(unit.characterId);
      }
    }
  }

  function movePlayer(toQ: number, toR: number) {
    if (!state.currentTurn) return;
    const pos = state.engine!.findCharacterPosition(state.currentTurn);
    if (!pos) return;
    const dist = hexDistance(pos.q, pos.r, toQ, toR);
    const tile = map.tiles[hexKey(toQ, toR)];
    if (!tile || dist > 3) return;
    const character = state.characters[state.currentTurn];
    if (character && tile.isWater && !character.canFly) return;
    state.engine!.moveCharacter(state.currentTurn, toQ, toR);
    state.phase = 'idle';
  }

  function selectSkill(skill: Skill) {
    state.selectedSkill = skill;
    state.phase = 'targeting';
  }

  function attackTarget(targetId: string) {
    if (!state.currentTurn || !state.selectedSkill) return;
    const attacker = state.characters[state.currentTurn];
    const defender = state.characters[targetId];
    if (!attacker || !defender) return;

    const result = DamagePipeline.calculate(attacker, defender, state.selectedSkill, false);
    defender.hp -= result.finalDamage;
    state.log.push(`${attacker.name} 对 ${defender.name} 造成 ${result.finalDamage} 点伤害`);

    if (result.blockedByBarrier) {
      state.log.push(`境界壁垒触发！${defender.name} 毫发无伤`);
    }

    if (defender.hp <= 0) {
      state.log.push(`${defender.name} 已被击败`);
      defender.soulState = 'RemnantSoul';
    }

    state.selectedSkill = null;
    state.phase = 'idle';
    state.currentTurn = null;
    tick();
  }

  async function executeNpcTurn(npcId: string) {
    const npc = state.characters[npcId];
    const playerChar = state.characters[playerId];
    if (!npc || !playerChar || !state.engine) return;

    await new Promise(r => setTimeout(r, 500));

    const action = NpcAI.decide(npc, playerChar, state.engine as any, state.characters);

    if (action.type === 'attack' && action.targetId && action.skill) {
      state.selectedSkill = action.skill;
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
    state.currentTurn = null;
    state.phase = 'idle';
    tick();
  }

  return { state, tick, movePlayer, selectSkill, attackTarget, endTurn, executeNpcTurn };
}
