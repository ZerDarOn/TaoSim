<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { UpgradeEngine } from '@taosim/engine';
import type { Item, ItemQuality } from '@taosim/contracts';

const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const selectedItem = ref<Item | null>(null);

const equipmentItems = computed(() =>
  (playerStore.character?.inventory ?? []).filter(s => s.item.type === 'Equipment')
);

function selectItem(item: Item) {
  selectedItem.value = item;
  message.value = null;
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
    message.value = '已达最高品质';
    return;
  }

  // 找到背包中的实际物品引用
  const stack = playerStore.character.inventory.find(s => s.item.id === selectedItem.value!.id);
  if (!stack) {
    message.value = '背包中找不到该物品';
    return;
  }

  const result = UpgradeEngine.enhance(stack.item, target, playerStore.character);
  message.value = result.message;

  if (result.resultItem) {
    // 无论成功还是失败，resultItem 都反映装备最新状态
    stack.item.quality = result.resultItem.quality;
    stack.item.attributes = result.resultItem.attributes;
    if (result.resultItem.specialEffect !== undefined) {
      stack.item.specialEffect = result.resultItem.specialEffect;
    }
    if (result.resultItem.durability) {
      stack.item.durability = result.resultItem.durability;
    }
    if (result.resultItem.isBroken) {
      stack.item.isBroken = true;
    }
    selectedItem.value = { ...stack.item };
  }
}

function qualityColor(quality?: string): string {
  switch (quality) {
    case 'Common': return 'text-ink-soft';
    case 'Rare': return 'text-blue-500';
    case 'Epic': return 'text-purple-600';
    case 'Legendary': return 'text-gold';
    default: return 'text-ink-soft';
  }
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">装备升品</h1>

    <div v-if="message" class="p-3 rounded-md text-sm"
      :class="message.includes('成功') ? 'bg-jade-soft text-jade' : 'bg-red-50 text-danger'">
      {{ message }}
    </div>

    <!-- 装备列表 -->
    <section>
      <h2 class="text-lg font-semibold mb-3 text-ink">选择装备</h2>
      <div v-if="equipmentItems.length === 0" class="text-sm text-muted">背包中没有装备</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button v-for="s in equipmentItems" :key="s.item.id"
          @click="selectItem(s.item)"
          :class="['text-left bg-surface rounded-lg border p-3 space-y-1 hover:border-gold',
            selectedItem?.id === s.item.id ? 'border-gold ring-1 ring-gold' : 'border-line']">
          <div class="font-medium text-sm text-ink">{{ s.item.name }}</div>
          <div class="text-xs" :class="qualityColor(s.item.quality)">
            {{ s.item.quality ?? 'Common' }}品质 · Tier {{ s.item.tier }}
          </div>
          <div v-if="s.item.specialEffect" class="text-xs text-gold">特效: {{ s.item.specialEffect }}</div>
        </button>
      </div>
    </section>

    <!-- 升品面板 -->
    <section v-if="selectedItem">
      <h2 class="text-lg font-semibold mb-3 text-ink">升品详情</h2>
      <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="font-medium text-ink">{{ selectedItem.name }}</span>
          <span :class="qualityColor(selectedItem.quality)">{{ selectedItem.quality ?? 'Common' }}</span>
        </div>
        <div class="text-xs text-muted">
          属性: {{ JSON.stringify(selectedItem.attributes) }}
        </div>
        <div v-if="selectedItem.durability" class="text-xs text-muted">
          耐久: {{ selectedItem.durability.current }}/{{ selectedItem.durability.max }}
          <span v-if="selectedItem.isBroken" class="text-danger ml-2">(已损坏)</span>
        </div>

        <div v-if="getNextQuality(selectedItem)" class="pt-2 border-t border-line">
          <div class="text-sm mb-2 text-ink">
            目标品质: <span :class="qualityColor(getNextQuality(selectedItem)!)">{{ getNextQuality(selectedItem) }}</span>
          </div>
          <div class="text-xs text-danger mb-3">
            ⚠️ 升品有风险：失败可能消耗材料、降低耐久或品质倒退
          </div>
          <button @click="handleUpgrade"
            class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold hover:bg-gold-dark">
            开始升品
          </button>
        </div>
        <div v-else class="text-sm text-gold pt-2 border-t border-line">
          已达最高品质，无法继续升品
        </div>
      </div>
    </section>
  </div>
</template>
