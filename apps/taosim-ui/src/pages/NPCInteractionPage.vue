<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { NPCInteractionEngine } from '@taosim/engine';

const router = useRouter();
const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const interactionDone = ref(false);
const showTradeDenied = ref(false);

const npc = computed(() => playerStore.currentNPC);

const favorability = computed(() => {
  if (!playerStore.character || !npc.value) return 0;
  const rel = playerStore.character.relations[npc.value!.id];
  return rel?.favorability ?? 0;
});

const canTrade = computed(() => favorability.value > -50);

function handleDuel() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.duel(playerStore.character, npc.value, true);
  message.value = result.message;
  interactionDone.value = true;
}

function handleDiscuss() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.discuss(playerStore.character, npc.value);
  playerStore.character.cultivation.currentExp += result.expGained;
  message.value = result.message;
  interactionDone.value = true;
}

function handleTrade() {
  if (!canTrade.value) {
    showTradeDenied.value = true;
    return;
  }
  router.push('/npc-trade');
}

function handleLeave() {
  playerStore.currentNPC = null;
  router.push('/overworld');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">偶遇修士</h1>

    <div v-if="npc" class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div class="font-semibold text-lg">{{ npc.name }}</div>
      <div class="text-muted">{{ npc.realm }} · {{ npc.gender === 'Male' ? '男' : '女' }}</div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">好感度</span>
        <div class="flex-1 bg-surface-muted h-2 rounded-full max-w-[120px]">
          <div class="h-2 rounded-full transition-all"
            :class="favorability >= 0 ? 'bg-jade' : 'bg-danger'"
            :style="{ width: Math.abs(favorability) + '%' }"></div>
        </div>
        <span class="text-xs font-mono">{{ favorability }}</span>
      </div>
      <div class="text-xs italic text-muted pt-1">"道友有何贵干？"</div>
    </div>

    <div v-if="showTradeDenied" class="p-3 rounded-md text-sm bg-red-50 text-red-600">
      对方对你戒心极重，拒绝与你交易。
      <button @click="showTradeDenied = false" class="ml-2 underline text-xs">关闭</button>
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-emerald-50 text-emerald-700">{{ message }}</div>

    <div v-if="!interactionDone" class="grid grid-cols-2 gap-3 max-w-[300px]">
      <button @click="handleDuel"
        class="px-4 py-3 bg-emerald-600 text-white rounded-md text-sm font-semibold hover:bg-emerald-700">切磋</button>
      <button @click="handleDiscuss"
        class="px-4 py-3 border border-line rounded-md text-sm hover:bg-surface-muted">论道</button>
      <button @click="handleTrade"
        :disabled="!canTrade"
        class="px-4 py-3 rounded-md text-sm font-semibold"
        :class="canTrade ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-surface-muted text-muted cursor-not-allowed'">
        交易
      </button>
      <button @click="handleLeave"
        class="px-4 py-3 border border-line rounded-md text-sm text-muted hover:bg-surface-muted">离开</button>
    </div>
    <div v-else class="pt-4">
      <button @click="handleLeave"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回大世界</button>
    </div>
  </div>
</template>
