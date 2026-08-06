import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { PlayerLifecycleService } from '@taosim/engine';
import type { Character, Skill, Item } from '@taosim/contracts';
import { useGameFlowStore } from '@/stores/game-flow';

export const usePlayerStore = defineStore('player', () => {
  const character = ref<Character | null>(null);
  const currentNPC = ref<Character | null>(null);
  const isCreated = computed(() => character.value !== null);

  function setPlayer(c: Character) {
    character.value = c;
  }

  function updateHp(delta: number) {
    if (!character.value) return;
    character.value.hp = Math.max(0, Math.min(character.value.maxHp, character.value.hp + delta));
  }

  function updateSpiritEnergy(delta: number) {
    if (!character.value) return;
    character.value.spiritEnergy.current = Math.max(
      0,
      Math.min(character.value.spiritEnergy.max, character.value.spiritEnergy.current + delta),
    );
  }

  function addSkill(skill: Skill) {
    if (!character.value) return;
    character.value.skills.push(skill);
  }

  function addItem(item: Item, count: number = 1) {
    if (!character.value) return;
    const existing = character.value.inventory.find(s => s.item.id === item.id);
    if (existing) {
      existing.count += count;
    } else {
      character.value.inventory.push({ item, count });
    }
  }

  function reset() {
    character.value = null;
  }

  function consumeAp(amount: number = 1): boolean {
    if (!character.value) return false;
    if (character.value.monthlyActionPoints.current < amount) return false;
    character.value.monthlyActionPoints.current -= amount;
    return true;
  }

  const currentNodeId = ref<string>('NODE_SECT_QINGYUN');

  function setCurrentNode(id: string) {
    currentNodeId.value = id;
  }

  function setCurrentNPC(npc: Character | null) {
    currentNPC.value = npc;
  }

  function addExp(amount: number) {
    if (!character.value) return;
    character.value.cultivation.currentExp += amount;
  }

  function addSpiritStones(amount: number) {
    if (!character.value) return;
    character.value.spiritStones = Math.max(0, character.value.spiritStones + amount);
  }

  function unlockRecipe(recipeId: string) {
    if (!character.value) return;
    if (!character.value.unlockedRecipes.includes(recipeId)) {
      character.value.unlockedRecipes.push(recipeId);
    }
  }

  function advanceTime(days: number): { died: boolean; causeOfDeath?: string } {
    if (!character.value) return { died: false };
    // 统一时间推进：天数 → 月数（30 天 = 1 月），使用 PlayerLifecycleService 统一逻辑
    const months = days / 30;
    const result = PlayerLifecycleService.advanceTime(character.value, months);
    character.value = result.updatedPlayer;

    // 寿元耗尽时立即触发游戏结束，避免"玩一个死人"
    if (result.died) {
      const gameFlow = useGameFlowStore();
      gameFlow.enterGameOver(result.causeOfDeath);
    }
    return { died: result.died, causeOfDeath: result.causeOfDeath };
  }

  return {
    character,
    currentNPC,
    isCreated,
    setPlayer,
    updateHp,
    updateSpiritEnergy,
    addSkill,
    addItem,
    consumeAp,
    reset,
    currentNodeId,
    setCurrentNode,
    setCurrentNPC,
    addExp,
    addSpiritStones,
    unlockRecipe,
    advanceTime,
  };
});
