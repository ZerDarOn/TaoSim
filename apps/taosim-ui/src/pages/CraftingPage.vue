<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { RecipeRegistry, AlchemyEngine, ForgeEngine } from '@taosim/engine';

const playerStore = usePlayerStore();
const activeTab = ref<'pill' | 'forge'>('pill');
const result = ref<string | null>(null);

const pillRecipes = RecipeRegistry.listPillRecipes();
const forgeRecipes = RecipeRegistry.listForgeRecipes();

function craftPill(recipeName: string) {
  if (!playerStore.character) return;
  const r = AlchemyEngine.craftPill(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.pill!.name}（${r.pill!.tier} 阶）`
    : `炼制失败：${r.reason}`;
}

function forgeEquipment(recipeName: string) {
  if (!playerStore.character) return;
  const r = ForgeEngine.craft(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.equipment!.name}（${r.equipment!.tier} 阶，属性 ${JSON.stringify(r.equipment!.attributes)}）`
    : `炼制失败：${r.reason}`;
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">百艺坊</h1>

    <!-- Tab 切换 -->
    <div class="flex gap-2">
      <button @click="activeTab = 'pill'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold', activeTab === 'pill' ? 'bg-jade text-white' : 'bg-surface-muted text-ink-soft']">炼丹</button>
      <button @click="activeTab = 'forge'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold', activeTab === 'forge' ? 'bg-jade text-white' : 'bg-surface-muted text-ink-soft']">炼器</button>
    </div>

    <!-- 结果提示 -->
    <div v-if="result" :class="['p-3 rounded-md text-sm', result.includes('成功') ? 'bg-jade-soft text-jade' : 'bg-red-50 text-danger']">
      {{ result }}
    </div>

    <!-- 炼丹 -->
    <div v-if="activeTab === 'pill'" class="grid grid-cols-3 gap-4">
      <div v-for="recipe in pillRecipes" :key="recipe.id"
        class="bg-surface rounded-lg border border-line p-4 space-y-2">
        <h3 class="font-semibold">{{ recipe.name }} <span class="text-xs text-muted">{{ recipe.tier }}阶</span></h3>
        <div class="text-xs text-ink-soft">材料：{{ recipe.requiredMaterials.join(', ') }}</div>
        <div class="text-xs text-muted">成功率：{{ Math.round(recipe.baseSuccessRate * 100) }}%</div>
        <button @click="craftPill(recipe.name)"
          class="w-full px-3 py-1.5 bg-jade text-white rounded text-xs font-semibold">炼制</button>
      </div>
    </div>

    <!-- 炼器 -->
    <div v-if="activeTab === 'forge'" class="grid grid-cols-3 gap-4">
      <div v-for="recipe in forgeRecipes" :key="recipe.id"
        class="bg-surface rounded-lg border border-line p-4 space-y-2">
        <h3 class="font-semibold">{{ recipe.name }} <span class="text-xs text-muted">{{ recipe.tier }}阶</span></h3>
        <div class="text-xs text-ink-soft">主材：{{ recipe.mainMaterialId }}</div>
        <div class="text-xs text-muted">辅材：{{ recipe.optionalAuxMaterials.join(', ') || '无' }}</div>
        <button @click="forgeEquipment(recipe.name)"
          class="w-full px-3 py-1.5 bg-gold text-white rounded text-xs font-semibold">炼制</button>
      </div>
    </div>
  </div>
</template>
