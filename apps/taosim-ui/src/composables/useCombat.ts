import { reactive } from 'vue';
import type { Character, HexBattleMap, Skill } from '@taosim/contracts';
import { hexKey, hexDistance } from '@taosim/contracts';
import { CombatEngine, DamagePipeline } from '@taosim/engine';

interface CombatState {
  engine: CombatEngine | null;
  characters: Record<string, Character>;
  currentTurn: string | null;
  selectedSkill: Skill | null;
  phase: 'idle' | 'moving' | 'targeting' | 'executing';
  log: string[];
}

export function useCombat(map: HexBattleMap, player: Character, enemies: Character[]) {
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
      state.currentTurn = ready[0]!.characterId;
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

  function endTurn() {
    state.currentTurn = null;
    state.phase = 'idle';
    tick();
  }

  return { state, tick, movePlayer, selectSkill, attackTarget, endTurn };
}
