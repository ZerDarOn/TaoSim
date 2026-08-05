<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useAppStore } from '@/stores/app';

const playerStore = usePlayerStore();
const appStore = useAppStore();

const location = computed(() => {
  const continents = appStore.currentWorldState?.activeContinentIds ?? [];
  return continents.length > 0 ? continents.join('、') : '未知之地';
});

const realmInfo = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  return {
    realm: c.realm,
    cultivation: `${c.cultivation.currentExp} / ${c.cultivation.maxExp}`,
  };
});

const catastropheCountdown = computed(() => {
  return appStore.currentWorldState?.catastropheCountdownMonths ?? '未知';
});
</script>

<template>
  <div class="space-y-4">
    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">当前所在</h3>
      <p class="text-slate-300">{{ location }}</p>
    </div>

    <div v-if="realmInfo" class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">修行境界</h3>
      <p class="text-slate-300">境界：{{ realmInfo.realm }}</p>
      <p class="text-slate-300">修为：{{ realmInfo.cultivation }}</p>
      <p class="text-xs text-slate-500 mt-2">
        点"修炼"页进行闭关与突破，点顶部按钮推进时间。
      </p>
    </div>

    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">天地异象</h3>
      <p class="text-xs text-slate-500">
        劫难倒计时：{{ catastropheCountdown }} 月
      </p>
    </div>
  </div>
</template>
