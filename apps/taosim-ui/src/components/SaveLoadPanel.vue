<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';

const router = useRouter();
const appStore = useAppStore();
const playerStore = usePlayerStore();

const saving = ref(false);
const loading = ref(false);

onMounted(async () => {
  await appStore.loadSaveHeaders();
});

async function handleSave() {
  saving.value = true;
  try { await appStore.saveGame(); }
  finally { saving.value = false; }
}

async function handleLoad(saveId: string) {
  loading.value = true;
  try {
    await appStore.loadGame(saveId);
    router.push('/world');
  } finally { loading.value = false; }
}

async function handleDelete(saveId: string) {
  await appStore.deleteSave(saveId);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-semibold text-ink-soft">存档管理</h3>
      <button
        @click="handleSave"
        :disabled="saving || !playerStore.isCreated"
        class="px-3 py-1 bg-jade text-white rounded text-xs font-semibold disabled:opacity-50"
      >
        {{ saving ? '保存中...' : '保存当前进度' }}
      </button>
    </div>

    <div v-if="appStore.saveHeaders.length === 0" class="text-xs text-muted">尚无存档</div>

    <div
      v-for="header in appStore.saveHeaders"
      :key="header.saveId"
      class="flex items-center justify-between p-2 rounded bg-surface-muted"
    >
      <div class="text-xs space-y-0.5">
        <div class="font-semibold">{{ header.playerSummary.name }} — {{ header.playerSummary.realm }}</div>
        <div class="text-muted">{{ formatTime(header.timestamp) }}</div>
      </div>
      <div class="flex gap-2">
        <button
          @click="handleLoad(header.saveId)"
          :disabled="loading"
          class="px-2 py-1 bg-gold text-white rounded text-[10px] font-semibold"
        >加载</button>
        <button
          @click="handleDelete(header.saveId)"
          class="px-2 py-1 border border-danger text-danger rounded text-[10px]"
        >删除</button>
      </div>
    </div>
  </div>
</template>
