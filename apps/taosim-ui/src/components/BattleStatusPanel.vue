<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '@taosim/contracts';
import { formatRealm } from '@/utils/i18n-game';
import { computeTurnOrder } from '@/battle/turn-order';
import { MAX_AP } from '@/composables/useCombat';

interface AtbInfo { gauge: number; actionReady: boolean; }

const props = defineProps<{
  characters: Record<string, Character>;
  atb: Record<string, AtbInfo>;
  currentTurn: string | null;
}>();

const actor = computed(() => (props.currentTurn ? props.characters[props.currentTurn] : null));
const preview = computed(() => computeTurnOrder(props.atb, props.currentTurn ? [props.currentTurn] : []).slice(0, 2));

function hpColor(hp: number, maxHp: number) {
  const ratio = hp / maxHp;
  return ratio > 0.5 ? 'bg-green-500' : ratio > 0.25 ? 'bg-orange-500' : 'bg-red-500';
}
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
    <!-- 当前行动者卡牌 -->
    <div v-if="actor" class="rounded-lg border p-3"
      :class="actor.id === props.currentTurn ? 'border-gold bg-gold-soft/10' : 'border-line'">
      <div class="flex items-center justify-between">
        <span class="font-bold text-sm"
          :class="actor.id === currentTurn ? 'text-gold' : 'text-ink-soft'">{{ actor.name }}</span>
        <span class="text-[10px] text-muted">{{ formatRealm(actor.realm) }}</span>
      </div>
      <!-- HP -->
      <div class="mt-2 space-y-1">
        <div class="flex justify-between text-[10px] text-muted"><span>气血</span><span>{{ Math.max(0, Math.ceil(actor.hp)) }}/{{ actor.maxHp }}</span></div>
        <div class="h-2 bg-line rounded-full overflow-hidden">
          <div class="h-full transition-all duration-300" :class="hpColor(actor.hp, actor.maxHp)"
            :style="{ width: Math.max(0, (actor.hp / actor.maxHp) * 100) + '%' }"></div>
        </div>
        <!-- 灵力 -->
        <div class="flex justify-between text-[10px] text-muted pt-1"><span>灵力</span><span>{{ actor.spiritEnergy.current }}/{{ actor.spiritEnergy.max }}</span></div>
        <div class="h-1.5 bg-line rounded-full overflow-hidden">
          <div class="h-full bg-sky-400 transition-all duration-300"
            :style="{ width: (actor.spiritEnergy.current / actor.spiritEnergy.max) * 100 + '%' }"></div>
        </div>
      </div>
      <!-- AP 点数 -->
      <div class="mt-2 text-sm tracking-widest text-amber-300" :title="`行动点 ${actor.ap}/${MAX_AP}`">
        <span v-for="i in MAX_AP" :key="i" class="mr-0.5">{{ i <= actor.ap ? '●' : '○' }}</span>
        <span class="ml-2 text-[10px] text-muted">行动点 {{ actor.ap }}/{{ MAX_AP }}</span>
      </div>
    </div>
    <div v-else class="text-xs text-muted py-2 text-center">等待行动…</div>

    <!-- 行动顺序预告 -->
    <div>
      <h3 class="text-xs font-semibold text-ink-soft mb-2">行动顺序</h3>
      <div class="space-y-1.5">
        <div v-if="currentTurn" class="flex items-center gap-2 p-1.5 rounded bg-gold-soft/20 ring-1 ring-gold">
          <span class="w-2 h-2 rounded-full bg-gold"></span>
          <span class="text-xs font-semibold text-gold flex-1 truncate">{{ characters[currentTurn]?.name }}</span>
          <span class="text-[10px] text-gold">行动中</span>
        </div>
        <div v-for="id in preview" :key="id" class="flex items-center gap-2 p-1.5 rounded bg-surface-muted">
          <span class="w-2 h-2 rounded-full" :class="atb[id]?.actionReady ? 'bg-amber-300' : 'bg-slate-500'"></span>
          <span class="text-xs text-ink-soft flex-1 truncate">{{ characters[id]?.name }}</span>
          <span class="text-[10px] text-muted w-6 text-right">{{ Math.floor(atb[id]?.gauge ?? 0) }}</span>
        </div>
        <div v-if="!currentTurn && preview.length === 0" class="text-[10px] text-muted">战斗尚未开始</div>
      </div>
    </div>
  </div>
</template>
