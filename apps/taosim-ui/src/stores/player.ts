import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Character, Skill, Item } from '@taosim/contracts';

export const usePlayerStore = defineStore('player', () => {
  const character = ref<Character | null>(null);
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

  return {
    character,
    isCreated,
    setPlayer,
    updateHp,
    updateSpiritEnergy,
    addSkill,
    addItem,
    reset,
  };
});
