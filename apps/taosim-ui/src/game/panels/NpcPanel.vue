<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { NPCInteractionEngine, NPCTradeEngine, MarketTransaction, ItemFactory, DEFAULT_ITEM_TEMPLATES } from '@taosim/engine';
import type { NPCTradeOffer, MarketItem, ItemStack } from '@taosim/contracts';
import { formatRealm, formatGender, formatItemType, formatQuality } from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const subView = ref<'interact' | 'trade'>('interact');
const message = ref<string | null>(null);
const interactionDone = ref(false);
const showTradeDenied = ref(false);

// 交易状态
const npcOffer = ref<NPCTradeOffer | null>(null);

const npc = computed(() => playerStore.currentNPC);

const favorability = computed(() => {
  if (!playerStore.character || !npc.value) return 0;
  const rel = playerStore.character.relations[npc.value!.id];
  return rel?.favorability ?? 0;
});

const canTrade = computed(() => favorability.value > -50);

// 交易相关 computed
const npcSelling = computed(() => npcOffer.value?.selling ?? []);
const playerSellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(s => interest.includes(s.item.type) && s.count > 0);
});
const playerUnsellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(s => !interest.includes(s.item.type) && s.count > 0);
});

function handleDuel() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.duel(playerStore.character, npc.value, true);
  message.value = result.message;
  if (result.unlockedRecipe) {
    playerStore.unlockRecipe(result.unlockedRecipe);
  }
  interactionDone.value = true;
}

function handleDiscuss() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.discuss(playerStore.character, npc.value);
  playerStore.character.cultivation.currentExp += result.expGained;
  message.value = result.message;
  if (result.unlockedRecipe) {
    playerStore.unlockRecipe(result.unlockedRecipe);
  }
  interactionDone.value = true;
}

function handleTrade() {
  if (!canTrade.value) {
    showTradeDenied.value = true;
    return;
  }
  // 切换到交易子视图，并初始化报价
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  if (playerStore.character && npc.value) {
    npcOffer.value = NPCTradeEngine.refreshNPCOffer(npc.value, 1);
  }
  subView.value = 'trade';
  message.value = null;
}

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

function backToInteract() {
  subView.value = 'interact';
  message.value = null;
}

function handleLeave() {
  playerStore.currentNPC = null;
  message.value = null;
  interactionDone.value = false;
  subView.value = 'interact';
}
</script>

<template>
  <div class="space-y-4">
    <!-- 无 NPC 时 -->
    <div v-if="!npc" class="p-4 bg-slate-800 rounded text-slate-400 text-sm">
      暂无相遇之人。在大地图游历时可能偶遇修仙者。
    </div>

    <template v-else>
      <!-- 互动子视图 -->
      <div v-if="subView === 'interact'" class="space-y-4">
        <div class="bg-slate-800 rounded p-4 space-y-2 text-sm">
          <div class="font-semibold text-lg text-amber-200">{{ npc.name }}</div>
          <div class="text-slate-400">{{ formatRealm(npc.realm) }} · {{ formatGender(npc.gender) }}</div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400">好感度</span>
            <div class="flex-1 bg-slate-700 h-2 rounded-full max-w-[120px]">
              <div class="h-2 rounded-full transition-all"
                :class="favorability >= 0 ? 'bg-green-500' : 'bg-red-500'"
                :style="{ width: Math.abs(favorability) + '%' }"></div>
            </div>
            <span class="text-xs text-slate-300">{{ favorability }}</span>
          </div>
          <div class="text-xs italic text-slate-500 pt-1">"道友有何贵干？"</div>
        </div>

        <div v-if="showTradeDenied" class="p-3 rounded text-sm bg-red-900/50 text-red-300">
          对方对你戒心极重，拒绝与你交易。
          <button @click="showTradeDenied = false" class="ml-2 underline text-xs">关闭</button>
        </div>

        <div v-if="message" class="p-3 rounded text-sm bg-green-900/50 text-green-300">{{ message }}</div>

        <div v-if="!interactionDone" class="grid grid-cols-2 gap-3 max-w-[300px]">
          <button @click="handleDuel"
            class="px-4 py-3 bg-emerald-700 text-white rounded text-sm font-semibold hover:bg-emerald-600">切磋</button>
          <button @click="handleDiscuss"
            class="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded text-sm">论道</button>
          <button @click="handleTrade"
            :disabled="!canTrade"
            class="px-4 py-3 rounded text-sm font-semibold"
            :class="canTrade ? 'bg-amber-700 text-white hover:bg-amber-600' : 'bg-slate-700 text-slate-500 cursor-not-allowed'">
            交易
          </button>
          <button @click="handleLeave"
            class="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-400">离开</button>
        </div>
        <div v-else class="pt-2">
          <button @click="handleLeave"
            class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">离开</button>
        </div>
      </div>

      <!-- 交易子视图 -->
      <div v-else class="space-y-4">
        <div class="flex justify-between items-center">
          <h3 class="text-amber-300 text-lg font-semibold">与 {{ npc.name }} 交易</h3>
          <span class="text-sm text-slate-400">灵石: {{ playerStore.character?.spiritStones ?? 0 }}</span>
        </div>
        <div class="text-xs text-slate-500 flex gap-4">
          <span>对方修为: {{ formatRealm(npc.realm) }}</span>
          <span>对方预算: {{ npcOffer?.budget ?? 0 }} 灵石</span>
        </div>

        <div v-if="message" class="p-3 rounded text-sm bg-green-900/50 text-green-300">{{ message }}</div>

        <!-- NPC 出售区 -->
        <section>
          <h4 class="text-sm font-semibold text-slate-300 mb-2">对方出售</h4>
          <div v-if="npcSelling.length === 0" class="text-sm text-slate-500">对方暂无物品出售</div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="mi in npcSelling" :key="mi.item.id"
              class="bg-slate-800 rounded p-3 space-y-1">
              <div class="font-medium text-sm text-slate-100">{{ mi.item.name }}</div>
              <div class="text-xs text-slate-400">
                {{ formatItemType(mi.item.type) }} · {{ mi.item.tier }}阶
                <span v-if="mi.item.quality" class="ml-1 text-amber-400">{{ formatQuality(mi.item.quality) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-amber-300">{{ mi.basePrice }} 灵石</span>
                <button @click="handleBuy(mi)"
                  class="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs">购买 ({{ mi.count }})</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 玩家卖出区 -->
        <section>
          <h4 class="text-sm font-semibold text-slate-300 mb-2">出售给 {{ npc.name }}</h4>
          <div v-if="playerSellable.length === 0 && playerUnsellable.length === 0" class="text-sm text-slate-500">背包为空</div>
          <div class="space-y-2">
            <div v-for="s in playerSellable" :key="s.item.id"
              class="bg-slate-800 rounded p-3 flex justify-between items-center">
              <div>
                <span class="font-medium text-sm text-slate-100">{{ s.item.name }}</span>
                <span class="text-xs text-slate-400 ml-2">×{{ s.count }}</span>
              </div>
              <button @click="handleSell(s)"
                :disabled="npcOffer === null || (npcOffer?.budget ?? 0) <= 0"
                class="px-3 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed">卖出</button>
            </div>
            <div v-for="s in playerUnsellable" :key="s.item.id"
              class="bg-slate-800/50 rounded p-3 flex justify-between items-center opacity-50">
              <div>
                <span class="font-medium text-sm text-slate-100">{{ s.item.name }}</span>
                <span class="text-xs text-slate-400 ml-2">×{{ s.count }}</span>
                <span class="text-xs text-red-400 ml-2">对方不感兴趣</span>
              </div>
              <button disabled class="px-3 py-1 bg-slate-700 rounded text-xs cursor-not-allowed">不可卖出</button>
            </div>
          </div>
        </section>

        <button @click="backToInteract"
          class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">返回</button>
      </div>
    </template>
  </div>
</template>
