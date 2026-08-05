import type { Character } from '@taosim/contracts';
import { RecipeRegistry } from '../crafting/recipe-registry.js';

export interface InteractionResult {
  triggerBattle: boolean;
  expGained: number;
  favorabilityChange: number;
  message: string;
  battleEnemy?: Character;
  unlockedRecipe?: string;
}

export class NPCInteractionEngine {
  static duel(player: Character, npc: Character, playerWin: boolean): InteractionResult {
    const favChange = playerWin ? 5 : 1;
    this.adjustFavorability(player, npc.id, favChange);

    let unlockedRecipe: string | undefined;
    let message = playerWin ? '切磋胜利！' : '技不如人…';

    if (playerWin && Math.random() < 0.1) {
      const lockedIds = RecipeRegistry.getLockedRecipeIds(player.unlockedRecipes);
      if (lockedIds.length > 0) {
        const chosen = lockedIds[Math.floor(Math.random() * lockedIds.length)]!;
        unlockedRecipe = chosen;
        const recipeName = RecipeRegistry.getPillRecipe(chosen)?.name
          ?? RecipeRegistry.getForgeRecipe(chosen)?.name
          ?? '???';
        message = `切磋胜利！对方心悦诚服，赠你丹方「${recipeName}」`;
      }
    }

    return {
      triggerBattle: true,
      expGained: playerWin ? npc.cultivation.maxExp * 0.2 : 0,
      favorabilityChange: favChange,
      message,
      battleEnemy: npc,
      unlockedRecipe,
    };
  }

  static discuss(player: Character, npc: Character): InteractionResult {
    const comprehensionDiff = player.attributes.comprehension - npc.attributes.comprehension;
    const baseExp = 100 + Math.max(0, comprehensionDiff) * 20;
    const expGained = Math.round(baseExp);
    this.adjustFavorability(player, npc.id, 3);

    // 论道 20% 概率授予新配方
    let unlockedRecipe: string | undefined;
    let message = `论道有所领悟，获得 ${expGained} 修为`;

    if (Math.random() < 0.2) {
      const lockedIds = RecipeRegistry.getLockedRecipeIds(player.unlockedRecipes);
      if (lockedIds.length > 0) {
        const chosen = lockedIds[Math.floor(Math.random() * lockedIds.length)]!;
        unlockedRecipe = chosen;
        message += `，并获赠丹方「${RecipeRegistry.getPillRecipe(chosen)?.name ?? RecipeRegistry.getForgeRecipe(chosen)?.name ?? '???'}」`;
      }
    }

    return {
      triggerBattle: false,
      expGained,
      favorabilityChange: 3,
      message,
      unlockedRecipe,
    };
  }

  static getPriceMultiplier(player: Character, npcId: string): number {
    const relation = player.relations[npcId];
    if (!relation) return 1.0;
    const mult = 1.0 - relation.favorability / 200;
    return Math.max(0.3, Math.min(1.5, mult));
  }

  static adjustFavorability(player: Character, npcId: string, delta: number): void {
    if (!player.relations[npcId]) {
      player.relations[npcId] = { targetId: npcId, favorability: 0, hatred: 0, jealousy: 0, tags: [] };
    }
    const relation = player.relations[npcId]!;
    relation.favorability = Math.max(-100, Math.min(100, relation.favorability + delta));
  }
}
