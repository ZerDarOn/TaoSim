<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { RecipeRegistry, AlchemyEngine, ForgeEngine, UpgradeEngine } from '@taosim/engine';
import type { Item, ItemQuality } from '@taosim/contracts';
import { formatQuality } from '@/utils/i18n-game';

const playerStore = usePlayerStore();

// 顶层子视图切换（炼制 / 升品），替代原 CraftingPage 与 UpgradePage 的路由跳转
const subView = ref<'craft' | 'upgrade'>('craft');

// ---- 炼制子视图状态（原 CraftingPage）----
const activeTab = ref<'pill' | 'forge'>('pill');
const result = ref<string | null>(null);

const unlockedIds = computed(() => playerStore.character?.unlockedRecipes ?? ['RECIPE_QI_PILL']);
const unlockedRecipes = computed(() => RecipeRegistry.getUnlockedRecipes(unlockedIds.value));

const pillRecipes = computed(() => unlockedRecipes.value.pills);
const forgeRecipes = computed(() => unlockedRecipes.value.forges);

const lockedPillRecipes = computed(() =>
  RecipeRegistry.listPillRecipes().filter(r => !unlockedIds.value.includes(r.id) && !r.unlockedByDefault)
);
const lockedForgeRecipes = computed(() =>
  RecipeRegistry.listForgeRecipes().filter(r => !unlockedIds.value.includes(r.id) && !r.unlockedByDefault)
);

function craftPill(recipeName: string) {
  if (!playerStore.character) return;
  if (!playerStore.consumeAp(1)) {
    result.value = '行动点不足（次月恢复）';
    return;
  }
  const r = AlchemyEngine.craftPill(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.pill!.name}（${r.pill!.tier} 阶 · ${formatQuality(r.pill!.quality)}品质）`
    : `炼制失败：${r.reason}`;
}

function forgeEquipment(recipeName: string) {
  if (!playerStore.character) return;
  if (!playerStore.consumeAp(1)) {
    result.value = '行动点不足（次月恢复）';
    return;
  }
  const r = ForgeEngine.craft(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.equipment!.name}（${r.equipment!.tier} 阶 · ${formatQuality(r.equipment!.quality)}品质${r.equipment!.specialEffect ? ' · 特效 ' + r.equipment!.specialEffect : ''}）`
    : `炼制失败：${r.reason}`;
}

function forgeMaster(recipeName: string) {
  if (!playerStore.character) return;
  if (!playerStore.consumeAp(1)) {
    result.value = '行动点不足（次月恢复）';
    return;
  }
  const r = ForgeEngine.craftMaster(playerStore.character, recipeName);
  result.value = r.success
    ? `大师锻造成功：${r.equipment!.name}（${formatQuality(r.equipment!.quality)}品质${r.equipment!.specialEffect ? ' · 特效 ' + r.equipment!.specialEffect : ''}）`
    : `大师锻造失败：${r.reason}`;
}

// ---- 升品子视图状态（原 UpgradePage）----
const selectedItem = ref<Item | null>(null);

const equipmentItems = computed(() =>
  (playerStore.character?.inventory ?? []).filter(s => s.item.type === 'Equipment')
);

function selectItem(item: Item) {
  selectedItem.value = item;
  result.value = null;
}

function getNextQuality(item: Item): ItemQuality | null {
  const q = item.quality ?? 'Common';
  if (q === 'Common') return 'Rare';
  if (q === 'Rare') return 'Epic';
  if (q === 'Epic') return 'Legendary';
  return null;
}

function handleUpgrade() {
  if (!playerStore.character || !selectedItem.value) return;
  const target = getNextQuality(selectedItem.value);
  if (!target) {
    result.value = '已达最高品质';
    return;
  }

  if (!playerStore.consumeAp(1)) {
    result.value = '行动点不足（次月恢复）';
    return;
  }

  // 找到背包中的实际物品引用
  const stack = playerStore.character.inventory.find(s => s.item.id === selectedItem.value!.id);
  if (!stack) {
    result.value = '背包中找不到该物品';
    return;
  }

  const r = UpgradeEngine.enhance(stack.item, target, playerStore.character);
  result.value = r.message;

  if (r.resultItem) {
    // 无论成功还是失败，resultItem 都反映装备最新状态
    stack.item.quality = r.resultItem.quality;
    stack.item.attributes = r.resultItem.attributes;
    if (r.resultItem.specialEffect !== undefined) {
      stack.item.specialEffect = r.resultItem.specialEffect;
    }
    if (r.resultItem.durability) {
      stack.item.durability = r.resultItem.durability;
    }
    if (r.resultItem.isBroken) {
      stack.item.isBroken = true;
    }
    selectedItem.value = { ...stack.item };
  }
}

function qualityColor(quality?: string): string {
  switch (quality) {
    case 'Common': return 'text-slate-400';
    case 'Rare': return 'text-blue-400';
    case 'Epic': return 'text-purple-400';
    case 'Legendary': return 'text-amber-300';
    default: return 'text-slate-400';
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 顶层子视图切换 -->
    <div class="flex gap-2">
      <button @click="subView = 'craft'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold',
          subView === 'craft' ? 'bg-amber-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600']">
        炼丹炼器
      </button>
      <button @click="subView = 'upgrade'; result = null; selectedItem = null"
        :class="['px-4 py-2 rounded text-sm font-semibold',
          subView === 'upgrade' ? 'bg-amber-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600']">
        装备升品
      </button>
    </div>

    <!-- 结果提示（两个子视图共享） -->
    <div v-if="result"
      :class="['p-3 rounded text-sm',
        result.includes('成功') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300']">
      {{ result }}
    </div>

    <!-- ============ 炼制子视图 ============ -->
    <div v-if="subView === 'craft'" class="space-y-4">
      <!-- pill / forge 切换 -->
      <div class="flex gap-2">
        <button @click="activeTab = 'pill'; result = null"
          :class="['px-3 py-1.5 rounded text-xs font-semibold',
            activeTab === 'pill' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600']">
          炼丹
        </button>
        <button @click="activeTab = 'forge'; result = null"
          :class="['px-3 py-1.5 rounded text-xs font-semibold',
            activeTab === 'forge' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600']">
          炼器
        </button>
      </div>

      <!-- 炼丹配方 -->
      <div v-if="activeTab === 'pill'" class="grid grid-cols-2 gap-3">
        <div v-for="recipe in pillRecipes" :key="recipe.id"
          class="p-3 bg-slate-800 rounded space-y-2">
          <div class="flex items-baseline justify-between">
            <span class="font-semibold text-slate-100">{{ recipe.name }}</span>
            <span class="text-xs text-slate-500">{{ recipe.tier }}阶</span>
          </div>
          <div class="text-xs text-slate-400">材料：{{ recipe.requiredMaterials.join(', ') }}</div>
          <div class="text-xs text-slate-500">成功率：{{ Math.round(recipe.baseSuccessRate * 100) }}%</div>
          <button @click="craftPill(recipe.name)"
            class="w-full px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-semibold">
            炼制
          </button>
        </div>
      </div>

      <!-- 未解锁的丹方 -->
      <div v-if="activeTab === 'pill' && lockedPillRecipes.length > 0" class="mt-4">
        <div class="text-xs text-slate-500 mb-2">未习得丹方</div>
        <div class="grid grid-cols-2 gap-3">
          <div v-for="recipe in lockedPillRecipes" :key="recipe.id"
            class="p-3 bg-slate-800/50 rounded space-y-2 opacity-50 cursor-not-allowed">
            <div class="font-semibold text-slate-500">???</div>
            <div class="text-xs text-slate-600">需从 NPC 处习得</div>
          </div>
        </div>
      </div>

      <!-- 炼器配方 -->
      <div v-if="activeTab === 'forge'" class="grid grid-cols-2 gap-3">
        <div v-for="recipe in forgeRecipes" :key="recipe.id"
          class="p-3 bg-slate-800 rounded space-y-2">
          <div class="flex items-baseline justify-between">
            <span class="font-semibold text-slate-100">{{ recipe.name }}</span>
            <span class="text-xs text-slate-500">{{ recipe.tier }}阶</span>
          </div>
          <div class="text-xs text-slate-400">主材：{{ recipe.mainMaterialId }}</div>
          <div class="text-xs text-slate-500">辅材：{{ recipe.optionalAuxMaterials.join(', ') || '无' }}</div>
          <button @click="forgeEquipment(recipe.name)"
            class="w-full px-3 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-semibold">
            普通锻造
          </button>
          <button @click="forgeMaster(recipe.name)"
            class="w-full px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs font-semibold">
            大师锻造
          </button>
        </div>
      </div>

      <!-- 未解锁的器谱 -->
      <div v-if="activeTab === 'forge' && lockedForgeRecipes.length > 0" class="mt-4">
        <div class="text-xs text-slate-500 mb-2">未习得器谱</div>
        <div class="grid grid-cols-2 gap-3">
          <div v-for="recipe in lockedForgeRecipes" :key="recipe.id"
            class="p-3 bg-slate-800/50 rounded space-y-2 opacity-50 cursor-not-allowed">
            <div class="font-semibold text-slate-500">???</div>
            <div class="text-xs text-slate-600">需从 NPC 处习得</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 升品子视图 ============ -->
    <div v-else class="space-y-4">
      <!-- 装备列表 -->
      <section class="space-y-2">
        <h2 class="text-sm font-semibold text-slate-300">选择装备</h2>
        <div v-if="equipmentItems.length === 0" class="text-sm text-slate-500">背包中没有装备</div>
        <div class="grid grid-cols-2 gap-2">
          <button v-for="s in equipmentItems" :key="s.item.id"
            @click="selectItem(s.item)"
            :class="['text-left p-2 bg-slate-800 rounded space-y-1 hover:ring-1 hover:ring-amber-500',
              selectedItem?.id === s.item.id ? 'ring-1 ring-amber-500' : '']">
            <div class="text-sm font-medium text-slate-100">{{ s.item.name }}</div>
            <div class="text-xs" :class="qualityColor(s.item.quality)">
              {{ formatQuality(s.item.quality) }}品质 · Tier {{ s.item.tier }}
            </div>
            <div v-if="s.item.specialEffect" class="text-xs text-amber-300">特效: {{ s.item.specialEffect }}</div>
          </button>
        </div>
      </section>

      <!-- 升品详情 -->
      <section v-if="selectedItem" class="p-4 bg-slate-800 rounded space-y-3">
        <div class="flex justify-between items-center">
          <span class="font-medium text-slate-100">{{ selectedItem.name }}</span>
          <span :class="qualityColor(selectedItem.quality)">{{ formatQuality(selectedItem.quality) }}</span>
        </div>
        <div class="text-xs text-slate-500">
          属性: {{ JSON.stringify(selectedItem.attributes) }}
        </div>
        <div v-if="selectedItem.durability" class="text-xs text-slate-500">
          耐久: {{ selectedItem.durability.current }}/{{ selectedItem.durability.max }}
          <span v-if="selectedItem.isBroken" class="text-red-400 ml-2">(已损坏)</span>
        </div>

        <div v-if="getNextQuality(selectedItem)" class="pt-2 border-t border-slate-700 space-y-2">
          <div class="text-sm text-slate-200">
            目标品质: <span :class="qualityColor(getNextQuality(selectedItem)!)">{{ formatQuality(getNextQuality(selectedItem)!) }}</span>
          </div>
          <div class="text-xs text-red-400">
            ⚠️ 升品有风险：失败可能消耗材料、降低耐久或品质倒退
          </div>
          <button @click="handleUpgrade"
            class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-sm font-semibold">
            开始升品
          </button>
        </div>
        <div v-else class="text-sm text-amber-300 pt-2 border-t border-slate-700">
          已达最高品质，无法继续升品
        </div>
      </section>
    </div>
  </div>
</template>
