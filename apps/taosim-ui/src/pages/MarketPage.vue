<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { MarketEngine, MarketTransaction, ItemFactory, DEFAULT_ITEM_TEMPLATES } from '@taosim/engine';
import type { MarketInventory, MarketItem, ItemStack } from '@taosim/contracts';

const router = useRouter();
const playerStore = usePlayerStore();

const marketInv = ref<MarketInventory | null>(null);
const message = ref<string | null>(null);
const showSellPanel = ref(false);

const mockNode = {
  id: 'NODE_MARKET_DONGHUANG',
  name: '东荒坊市',
  continentId: 'CONTINENT_CANGZHOU',
  coordinates: { x: 0, y: 0 },
  type: 'Market' as const,
  tier: 2,
  travelCostDays: 1,
  battleMapConfig: { baseTerrain: 'Plain' as const, clusterDensity: 0.5, hazardProbability: 0.1 },
};

onMounted(() => {
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  const luck = playerStore.character?.attributes.luck ?? 5;
  marketInv.value = MarketEngine.refreshMarket(mockNode, 1, luck);
});

const commonItems = computed(() =>
  marketInv.value?.items ?? []
);

const playerInventory = computed(() =>
  playerStore.character?.inventory ?? []
);

function handleBuy(marketItem: MarketItem) {
  if (!playerStore.character || !marketInv.value) return;
  const result = MarketTransaction.buyFromMarket(playerStore.character, marketInv.value, marketItem, 1);
  message.value = result.success
    ? `购买成功！花费 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleSell(stack: ItemStack) {
  if (!playerStore.character || !marketInv.value) return;
  const result = MarketTransaction.sellToMarket(playerStore.character, marketInv.value, stack.item, 1);
  message.value = result.success
    ? `卖出成功！获得 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function goBack() {
  router.push('/overworld');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">东荒坊市</h1>
      <span class="text-sm text-muted">灵石: {{ playerStore.character?.spiritStones ?? 0 }}</span>
    </div>
    <div class="text-xs text-muted">下次刷新: 下月初</div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-emerald-50 text-emerald-700">{{ message }}</div>

    <!-- 商品列表 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">商品</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div v-for="mi in commonItems" :key="mi.item.id"
          class="bg-surface rounded-lg border border-line p-3 space-y-2">
          <div class="font-medium text-sm">{{ mi.item.name }}</div>
          <div class="text-xs text-muted">
            {{ mi.item.type }} · Tier {{ mi.item.tier }}
            <span v-if="mi.item.quality" class="ml-1 text-amber-600">{{ mi.item.quality }}</span>
          </div>
          <div class="text-xs">库存: {{ mi.count }}/{{ mi.maxCount }}</div>
          <div class="flex justify-between items-center">
            <span class="text-sm font-mono">{{ mi.basePrice }} 灵石</span>
            <button @click="handleBuy(mi)"
              class="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700">
              购买
            </button>
          </div>
        </div>
      </div>
      <div v-if="commonItems.length === 0" class="text-sm text-muted">暂无商品</div>
    </section>

    <!-- 卖出面板 -->
    <section>
      <button @click="showSellPanel = !showSellPanel"
        class="px-4 py-2 border border-line rounded-md text-sm hover:bg-surface-muted">
        {{ showSellPanel ? '收起' : '卖出背包物品' }}
      </button>
      <div v-if="showSellPanel" class="mt-3 space-y-2">
        <div v-for="s in playerInventory" :key="s.item.id"
          class="bg-surface rounded-lg border border-line p-3 flex justify-between items-center">
          <div>
            <span class="font-medium text-sm">{{ s.item.name }}</span>
            <span class="text-xs text-muted ml-2">x{{ s.count }}</span>
          </div>
          <button @click="handleSell(s)"
            class="px-3 py-1 bg-amber-500 text-white rounded text-xs font-semibold hover:bg-amber-600">
            卖出
          </button>
        </div>
        <div v-if="playerInventory.length === 0" class="text-sm text-muted">背包为空</div>
      </div>
    </section>

    <div class="pt-4">
      <button @click="goBack"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回大世界</button>
    </div>
  </div>
</template>
