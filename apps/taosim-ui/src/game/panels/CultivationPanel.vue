<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';
import { TribulationEngine } from '@taosim/engine';
import type { RealmBreakthroughConfig, RealmFullPath } from '@taosim/contracts';
import { formatRealm } from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const world = useWorld();
const resultMessage = ref<string | null>(null);

const allConfigs: RealmBreakthroughConfig[] = [
  {
    fromRealm: 'QiRefinement_9', toRealm: 'Foundation_1', tier: 1,
    requirements: { expThreshold: 1000, requiredItems: ['FoundationPill'] },
    simpleModeSuccessRate: 0.85,
    postBreakthrough: { maxLifespan: 200, hpMultiplier: 2, spiritEnergyMultiplier: 1.5, canFly: true },
  },
  {
    fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
    requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
    simpleModeSuccessRate: 0.70,
    postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
  },
  {
    fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
    requirements: { expThreshold: 20000, requiredItems: ['NascentSoulPill'] },
    simpleModeSuccessRate: 0.55,
    postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
  },
];

const availableConfig = computed<RealmBreakthroughConfig | null>(() => {
  if (!playerStore.character) return null;
  const currentRealm = playerStore.character.realm;
  return allConfigs.find(c => c.fromRealm === currentRealm) ?? null;
});

async function attemptBreakthrough() {
  if (!playerStore.character || !availableConfig.value) return;

  // 传统突破模式：检查秘境材料
  if (playerStore.character.gameMode?.breakthrough === 'Traditional') {
    const requiredItems = availableConfig.value.requirements.requiredItems ?? [];
    for (const itemId of requiredItems) {
      const has = playerStore.character.inventory.some(
        s => (s.item.templateId === itemId || s.item.id === itemId) && s.count > 0
      );
      if (!has) {
        resultMessage.value = `传统突破需要秘境材料：${itemId}（当前缺失）`;
        return;
      }
    }
  }

  const result = TribulationEngine.attempt(playerStore.character, availableConfig.value);
  if (result.success && result.updatedCharacter) {
    playerStore.character = result.updatedCharacter;
    resultMessage.value = `突破成功！已踏入 ${formatRealm(result.newRealm!)}`;
  } else {
    resultMessage.value = result.reason ?? '突破失败';
    if (result.updatedCharacter) {
      playerStore.character = result.updatedCharacter;
    }
  }
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="playerStore.character" class="p-4 bg-slate-800 rounded space-y-2 text-sm">
      <div><span class="text-slate-400">当前境界：</span><span class="font-semibold text-amber-300">{{ formatRealm(playerStore.character.realm) }}</span></div>
      <div><span class="text-slate-400">修为：</span>{{ playerStore.character.cultivation.currentExp }} / {{ playerStore.character.cultivation.maxExp }}</div>
      <div><span class="text-slate-400">寿元：</span>{{ Math.floor(playerStore.character.lifespan.age) }} / {{ playerStore.character.lifespan.maxLifespan }}</div>
    </div>

    <button @click="world.fastForward(12)"
      class="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-sm font-semibold"
      :disabled="world.state.advancing">
      闭关修行 12 个月
    </button>

    <div v-if="resultMessage" :class="['p-3 rounded text-sm', resultMessage.includes('成功') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300']">
      {{ resultMessage }}
    </div>

    <div v-if="availableConfig" class="p-4 bg-slate-800 rounded border border-amber-600 space-y-2">
      <h3 class="text-sm font-semibold text-amber-400">可突破</h3>
      <div class="text-xs text-slate-300">
        目标：{{ formatRealm(availableConfig.toRealm as RealmFullPath) }} ·
        需修为 {{ availableConfig.requirements.expThreshold }} ·
        需材料 {{ availableConfig.requirements.requiredItems?.join(', ') ?? '无' }}
      </div>
      <button @click="attemptBreakthrough"
        class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded text-sm font-semibold">
        冲击 {{ formatRealm(availableConfig.toRealm as RealmFullPath) }}
      </button>
    </div>
    <div v-else class="text-sm text-slate-500 p-4 bg-slate-800 rounded">
      境界已满或需继续修炼至突破点
    </div>
  </div>
</template>
