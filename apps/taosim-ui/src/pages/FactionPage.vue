<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { FactionEngine } from '@taosim/engine';
import type { Faction } from '@taosim/contracts';

const playerStore = usePlayerStore();
const result = ref<string | null>(null);
const contribution = ref(100);

// Mock 宗门数据（后续从 WorldEngine 读取）
const mockFaction: Faction = {
  id: 'FACT_TEST', name: '青云宗', alignment: 'Righteous',
  leaderId: 'NPC_LEADER', members: [], territories: [],
  spiritVeinLevel: 2, treasurySpiritStones: 5000,
  diplomacy: {},
  aiPolicy: { expansionism: 0.3, aggression: 0.2 },
};

function handleJoin() {
  if (!playerStore.character) return;
  const r = FactionEngine.joinFaction(playerStore.character, mockFaction);
  result.value = r.success ? '成功加入青云宗！' : r.reason ?? '失败';
}

function handleLeave() {
  if (!playerStore.character) return;
  const r = FactionEngine.leaveFaction(playerStore.character, mockFaction);
  result.value = r.success ? '已退出宗门' : r.reason ?? '失败';
}

function handleContribute() {
  const r = FactionEngine.contribute(mockFaction, contribution.value);
  result.value = r.success ? `贡献 ${contribution.value} 灵石成功` : r.reason ?? '失败';
}

function handlePromote() {
  if (!playerStore.character) return;
  // simplified: pass mock contribution
  const r = FactionEngine.promote(playerStore.character, contribution.value);
  result.value = r.success ? `晋升成功：${playerStore.character.factionRank}` : r.reason ?? '失败';
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">宗门 — {{ playerStore.character?.factionId ? mockFaction.name : '无归属' }}</h1>

    <div class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div><span class="text-muted">灵脉阶位：</span>{{ mockFaction.spiritVeinLevel }} 阶</div>
      <div><span class="text-muted">金库：</span>{{ mockFaction.treasurySpiritStones }} 灵石</div>
      <div><span class="text-muted">成员数：</span>{{ mockFaction.members.length }}</div>
      <div v-if="playerStore.character?.factionRank">
        <span class="text-muted">我的阶位：</span>
        <span class="font-semibold text-jade">{{ playerStore.character.factionRank }}</span>
      </div>
    </div>

    <div v-if="result" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ result }}</div>

    <div class="flex gap-3">
      <button v-if="!playerStore.character?.factionId" @click="handleJoin"
        class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold">加入青云宗</button>
      <button v-if="playerStore.character?.factionId" @click="handleLeave"
        class="px-4 py-2 border border-danger text-danger rounded-md text-sm">退出宗门</button>
    </div>

    <div v-if="playerStore.character?.factionId" class="bg-surface rounded-lg border border-line p-4 space-y-3">
      <h3 class="text-sm font-semibold">宗门贡献</h3>
      <div class="flex gap-2 items-center">
        <input v-model.number="contribution" type="number" min="1"
          class="w-24 px-3 py-1 border border-line rounded text-sm" />
        <button @click="handleContribute" class="px-3 py-1 bg-gold text-white rounded text-xs">贡献灵石</button>
        <button @click="handlePromote" class="px-3 py-1 border border-line rounded text-xs">申请晋升</button>
      </div>
    </div>
  </div>
</template>
