<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { NPCTradeEngine, MarketTransaction, ItemFactory, DEFAULT_ITEM_TEMPLATES } from '@taosim/engine';
import type { NPCTradeOffer, MarketItem, ItemStack } from '@taosim/contracts';

const router = useRouter();
const playerStore = usePlayerStore();
const npc = computed(() => playerStore.currentNPC);

const npcOffer = ref<NPCTradeOffer | null>(null);
const message = ref<string | null>(null);

onMounted(() => {
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  if (playerStore.character && npc.value) {
    npcOffer.value = NPCTradeEngine.refreshNPCOffer(npc.value, 1);
  }
});

const npcSelling = computed(() => npcOffer.value?.selling ?? []);

const playerSellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(
    s => interest.includes(s.item.type) && s.count > 0,
  );
});

const playerUnsellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(
    s => !interest.includes(s.item.type) && s.count > 0,
  );
});

function handleBuy(marketItem: MarketItem) {
  if (!playerStore.character || !npcOffer.value) return;
  const result = MarketTransaction.buyFromNPC(playerStore.character, npcOffer.value, marketItem, 1);
  message.value = result.success
    ? `购买成功！花费 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleSell(stack: ItemStack) {
  if (!playerStore.character || !npcOffer.value) return;
  const result = MarketTransaction.sellToNPC(playerStore.character, npcOffer.value, stack.item, 1);
  message.value = result.success
    ? `卖出成功！获得 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleBack() {
  router.push('/npc-interaction');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">交易 — {{ npc?.name ?? '修士' }}</h1>
      <span class="text-sm text-muted">灵石: {{ playerStore.character?.spiritStones ?? 0 }}</span>
    </div>

    <div v-if="npc" class="text-sm text-muted flex gap-4">
      <span>对方修为: {{ npc.realm }}</span>
      <span>对方预算: {{ npcOffer?.budget ?? 0 }} 灵石</span>
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-emerald-50 text-emerald-700">{{ message }}</div>

    <!-- NPC 出售区 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">对方出售</h2>
      <div v-if="npcSelling.length === 0" class="text-sm text-muted">对方暂无物品出售</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="mi in npcSelling" :key="mi.item.id"
          class="bg-surface rounded-lg border border-line p-3 space-y-2">
          <div class="font-medium text-sm">{{ mi.item.name }}</div>
          <div class="text-xs text-muted">
            {{ mi.item.type }} · Tier {{ mi.item.tier }}
            <span v-if="mi.item.quality" class="ml-1 text-emerald-600">{{ mi.item.quality }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm font-mono">{{ mi.basePrice }} 灵石</span>
            <button @click="handleBuy(mi)"
              class="px-3 py-1 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700">
              购买 ({{ mi.count }})
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 玩家卖出区 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">出售给{{ npc?.name }}</h2>
      <div v-if="playerSellable.length === 0 && playerUnsellable.length === 0" class="text-sm text-muted">背包为空</div>
      <div class="space-y-2">
        <div v-for="s in playerSellable" :key="s.item.id"
          class="bg-surface rounded-lg border border-line p-3 flex justify-between items-center">
          <div>
            <span class="font-medium text-sm">{{ s.item.name }}</span>
            <span class="text-xs text-muted ml-2">x{{ s.count }}</span>
          </div>
          <button @click="handleSell(s)"
            :disabled="npcOffer === null || (npcOffer?.budget ?? 0) <= 0"
            class="px-3 py-1 bg-amber-500 text-white rounded text-xs font-semibold hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed">
            卖出
          </button>
        </div>
        <div v-for="s in playerUnsellable" :key="s.item.id"
          class="bg-surface-muted rounded-lg border border-line p-3 flex justify-between items-center opacity-50">
          <div>
            <span class="font-medium text-sm">{{ s.item.name }}</span>
            <span class="text-xs text-muted ml-2">x{{ s.count }}</span>
            <span class="text-xs text-red-500 ml-2">对方不感兴趣</span>
          </div>
          <button disabled class="px-3 py-1 bg-surface-muted rounded text-xs cursor-not-allowed">不可卖出</button>
        </div>
      </div>
    </section>

    <div class="pt-4">
      <button @click="handleBack"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回</button>
    </div>
  </div>
</template>
