import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Character, Skill, Item, BattleDelta } from '@taosim/contracts';

export const usePlayerStore = defineStore('player', () => {
  const character = ref<Character | null>(null);
  const currentNPC = ref<Character | null>(null);
  const isCreated = computed(() => character.value !== null);

  /** 战斗提交修订号：每次成功提交 +1，用于并发/重复提交防护 */
  const battleRevision = ref(0);
  /** 最近已提交的 battleId（幂等键） */
  const lastCommittedBattleId = ref<string | null>(null);

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

  /**
   * 原子提交战斗差量。一次成功：HP/灵力/AP/冷却/经验/灵石/道具/关系全部生效。
   * 重复 battleId 返回 AlreadyCommitted；baseRevision 不匹配返回 VersionConflict；
   * 库存不足返回 InsufficientItems。任何失败都不做部分写入。
   */
  function commitBattleDelta(delta: BattleDelta): 'Committed' | 'AlreadyCommitted' | 'VersionConflict' | 'InsufficientItems' {
    if (!character.value) return 'VersionConflict';
    if (lastCommittedBattleId.value === delta.battleId) return 'AlreadyCommitted';
    if (delta.baseRevision !== battleRevision.value) return 'VersionConflict';

    const c = character.value;

    // 校验库存（先验证后提交，保证原子性）
    for (const ci of delta.consumedItems) {
      const stack = c.inventory.find(s => s.item.id === ci.itemId);
      if (!stack || stack.count < ci.count) return 'InsufficientItems';
    }

    // 一次性写入
    c.hp = Math.max(0, Math.min(c.maxHp, delta.hpAfter));
    c.spiritEnergy.current = Math.max(0, Math.min(c.spiritEnergy.max, delta.spiritEnergyAfter));
    c.ap = delta.apAfter;
    c.skillCooldowns = { ...delta.skillCooldownsAfter };
    c.cultivation.currentExp += delta.rewards.cultivationExp;
    c.spiritStones = Math.max(0, c.spiritStones + delta.rewards.spiritStones);

    for (const ci of delta.consumedItems) {
      const stack = c.inventory.find(s => s.item.id === ci.itemId);
      if (stack) {
        stack.count -= ci.count;
        if (stack.count <= 0) {
          c.inventory = c.inventory.filter(s => s.item.id !== ci.itemId);
        }
      }
    }

    for (const ri of delta.rewards.items) {
      const existing = c.inventory.find(s => s.item.id === ri.item.id);
      if (existing) existing.count += ri.count;
      else c.inventory.push({ item: ri.item, count: ri.count });
    }

    for (const rc of delta.relationChanges) {
      const rel = c.relations[rc.targetId];
      if (rel) rel.favorability += rc.favorabilityDelta;
    }

    lastCommittedBattleId.value = delta.battleId;
    battleRevision.value += 1;
    return 'Committed';
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
    battleRevision,
    commitBattleDelta,
  };
});
