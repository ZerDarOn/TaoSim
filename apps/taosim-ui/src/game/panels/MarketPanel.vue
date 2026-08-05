<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { MarketEngine, MarketTransaction, ItemFactory, DEFAULT_ITEM_TEMPLATES, PRESET_MAP } from '@taosim/engine';
import type { MarketInventory, MarketItem } from '@taosim/contracts';
import { formatItemType, formatQuality } from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const showSellPanel = ref(false);

// 当前节点（真实）
const currentNode = computed(() =>
  PRESET_MAP.continents[0]?.nodes[playerStore.currentNodeId],
);

// 是否在坊市/城镇
const isAtMarket = computed(() =>
  currentNode.value?.type === 'Market' || currentNode.value?.type === 'City',
);

// 坊市商品库存（按节点生成，不同坊市不同货）
const marketInv = ref<MarketInventory | null>(null);

function refreshMarket() {
  if (!currentNode.value || !isAtMarket.value) return;
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  const luck = playerStore.character?.attributes.luck ?? 5;
  // 用节点 id 的 hash 做种子，保证同一坊市每次进入商品一致（但不同坊市不同）
  const nodeHash = Math.abs(currentNode.value.id.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0));
  // 用角色年龄做"月份"，不同时间点商品不同
  const ageSeed = Math.floor(playerStore.character?.lifespan.age ?? 6);
  marketInv.value = MarketEngine.refreshMarket(currentNode.value, nodeHash + ageSeed, luck);
}

// 进入坊市时自动刷新
watch(currentNode, () => {
  if (isAtMarket.value) {
    refreshMarket();
  } else {
    marketInv.value = null;
  }
}, { immediate: true });

const commonItems = computed(() => marketInv.value?.items ?? []);
const playerInventory = computed(() => playerStore.character?.inventory ?? []);

const marketName = computed(() => {
  if (!currentNode.value) return '';
  return currentNode.value.type === 'City' ? `${currentNode.value.name} · 商铺` : currentNode.value.name;
});

function handleBuy(marketItem: MarketItem) {
  if (!playerStore.character || !marketInv.value) return;
  const result = MarketTransaction.buyFromMarket(playerStore.character, marketInv.value, marketItem, 1);
  message.value = result.success
    ? `购买成功！花费 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleSell(stack: { item: import('@taosim/contracts').Item; count: number }) {
  if (!playerStore.character) return;
  const sellPrice = Math.max(1, Math.floor(
    (stack.item.tier * 10) * (marketInv.value?.sellPriceMultiplier ?? 1.2),
  ));
  if (stack.count <= 0) return;
  playerStore.character.spiritStones += sellPrice;
  stack.count--;
  if (stack.count <= 0) {
    const idx = playerStore.character.inventory.indexOf(stack);
    if (idx >= 0) playerStore.character.inventory.splice(idx, 1);
  }
  message.value = `售出 ${stack.item.name}，获得 ${sellPrice} 灵石`;
}
</script>

<template>
  <div class="space-y-4">
    <!-- 不在坊市时 -->
    <div v-if="!isAtMarket" class="p-8 text-center text-slate-500">
      <p class="text-sm">当前所在地点没有坊市。</p>
      <p class="text-xs mt-1">前往坊市或城镇节点方可交易。</p>
    </div>

    <!-- 坊市界面 -->
    <template v-else>
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-amber-300">{{ marketName }}</h2>
        <button @click="refreshMarket" class="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-slate-300">
          刷新商品
        </button>
      </div>

      <!-- 消息提示 -->
      <div v-if="message" class="p-3 rounded-lg text-sm bg-slate-700/50 border border-slate-600 text-amber-200">
        {{ message }}
      </div>

      <!-- 购买/出售切换 -->
      <div class="flex gap-2">
        <button @click="showSellPanel = false" :disabled="!showSellPanel"
          class="px-3 py-1.5 text-sm rounded"
          :class="!showSellPanel ? 'bg-amber-700 text-amber-100 font-semibold' : 'bg-slate-700 text-slate-300'">
          购买
        </button>
        <button @click="showSellPanel = true" :disabled="showSellPanel"
          class="px-3 py-1.5 text-sm rounded"
          :class="showSellPanel ? 'bg-amber-700 text-amber-100 font-semibold' : 'bg-slate-700 text-slate-300'">
          出售
        </button>
      </div>

      <!-- 购买列表 -->
      <div v-if="!showSellPanel" class="space-y-2">
        <div v-for="(marketItem, i) in commonItems" :key="i"
          class="p-3 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-slate-100">{{ marketItem.item.name }}</div>
            <div class="text-xs text-slate-400">
              {{ formatItemType(marketItem.item.type) }} · {{ formatQuality(marketItem.item.quality) }} · {{ marketItem.item.tier }}阶
            </div>
            <div class="text-xs text-slate-500 mt-0.5">库存 {{ marketItem.count }}</div>
          </div>
          <div class="text-right">
            <div class="text-amber-300 text-sm font-semibold">{{ marketItem.basePrice }} 灵石</div>
            <button @click="handleBuy(marketItem)"
              :disabled="(playerStore.character?.spiritStones ?? 0) < marketItem.basePrice"
              class="mt-1 px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs rounded transition">
              购买
            </button>
          </div>
        </div>
        <div v-if="commonItems.length === 0" class="text-sm text-slate-500 text-center py-4">
          商品已售罄，下月再来。
        </div>
      </div>

      <!-- 出售列表 -->
      <div v-else class="space-y-2">
        <div v-for="(stack, i) in playerInventory" :key="i"
          v-show="stack.count > 0"
          class="p-3 bg-slate-800 rounded-lg border border-slate-700 flex items-center justify-between">
          <div>
            <div class="text-sm font-medium text-slate-100">{{ stack.item.name }}</div>
            <div class="text-xs text-slate-400">
              {{ formatItemType(stack.item.type) }} · 持有 {{ stack.count }}
            </div>
          </div>
          <button @click="handleSell(stack)"
            class="px-3 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition">
            出售
          </button>
        </div>
        <div v-if="playerInventory.filter(s => s.count > 0).length === 0" class="text-sm text-slate-500 text-center py-4">
          背包空空如也。
        </div>
      </div>
    </template>
  </div>
</template>
