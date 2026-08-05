<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { NPCInteractionEngine } from '@taosim/engine';

const router = useRouter();
const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const interactionDone = ref(false);

const npc = computed(() => playerStore.currentNPC);

const favorability = computed(() => {
  if (!playerStore.character || !npc.value) return 0;
  const rel = playerStore.character.relations[npc.value!.id];
  return rel?.favorability ?? 0;
});

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
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <div v-if="!interactionDone" class="flex gap-3">
      <button @click="handleDuel"
        class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold">切磋</button>
      <button @click="handleDiscuss"
        class="px-4 py-2 border border-line rounded-md text-sm">论道</button>
      <button @click="handleLeave"
        class="px-4 py-2 border border-line rounded-md text-sm text-muted">离开</button>
    </div>
    <div v-else class="pt-4">
      <button @click="handleLeave"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回大世界</button>
    </div>
  </div>
</template>
