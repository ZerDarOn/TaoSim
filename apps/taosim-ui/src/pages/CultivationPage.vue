<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';
import { TribulationEngine } from '@taosim/engine';
import type { RealmBreakthroughConfig } from '@taosim/contracts';

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
    resultMessage.value = `突破成功！已踏入 ${result.newRealm}`;
  } else {
    resultMessage.value = result.reason ?? '突破失败';
    if (result.updatedCharacter) {
      playerStore.character = result.updatedCharacter;
    }
  }
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">闭关修炼</h1>

    <div v-if="playerStore.character" class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div><span class="text-muted">当前境界：</span><span class="font-semibold text-jade">{{ playerStore.character.realm }}</span></div>
      <div><span class="text-muted">修为：</span>{{ playerStore.character.cultivation.currentExp }} / {{ playerStore.character.cultivation.maxExp }}</div>
      <div><span class="text-muted">寿元：</span>{{ playerStore.character.lifespan.age }} / {{ playerStore.character.lifespan.maxLifespan }}</div>
    </div>

    <!-- 时间快进 -->
    <button @click="world.fastForward(12)"
      class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold">
      闭关修行 12 个月
    </button>

    <div v-if="resultMessage" :class="['p-3 rounded-md text-sm', resultMessage.includes('成功') ? 'bg-jade-soft text-jade' : 'bg-red-50 text-danger']">
      {{ resultMessage }}
    </div>

    <!-- 动态突破选项 -->
    <div v-if="availableConfig" class="bg-surface rounded-lg border border-gold p-4 space-y-2">
      <h3 class="text-sm font-semibold text-gold">可突破</h3>
      <div class="text-xs text-ink-soft">
        目标：{{ availableConfig.toRealm }} ·
        需修为 {{ availableConfig.requirements.expThreshold }} ·
        需材料 {{ availableConfig.requirements.requiredItems?.join(', ') ?? '无' }}
      </div>
      <button @click="attemptBreakthrough"
        class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold">
        冲击 {{ availableConfig.toRealm }}
      </button>
    </div>
    <div v-else class="text-sm text-muted p-4 bg-surface rounded-lg border border-line">
      境界已满或需继续修炼至突破点
    </div>
  </div>
</template>
