<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';

const appStore = useAppStore();
const playerStore = usePlayerStore();
const gameFlow = useGameFlowStore();

const saving = ref(false);
const loading = ref(false);
const saveMsg = ref('');
const loadMsg = ref('');

// 铁人模式：禁用手动保存
const isIronman = computed(() =>
  playerStore.character?.gameMode?.saveMode === 'Ironman'
);

onMounted(async () => {
  await appStore.loadSaveHeaders();
});

async function handleSave() {
  saving.value = true;
  saveMsg.value = '';
  try {
    await appStore.saveGame();
    saveMsg.value = '已保存';
    await appStore.loadSaveHeaders();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SaveLoadPanel] 保存失败:', err);
    saveMsg.value = `保存失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    saving.value = false;
  }
}

async function handleLoad(saveId: string) {
  loading.value = true;
  loadMsg.value = '';
  try {
    await appStore.loadGame(saveId);
    gameFlow.enterPlaying();
    loadMsg.value = '已加载';
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SaveLoadPanel] 加载失败:', err);
    loadMsg.value = `加载失败：${err instanceof Error ? err.message : String(err)}`;
  } finally {
    loading.value = false;
  }
}

async function handleDelete(saveId: string) {
  try {
    await appStore.deleteSave(saveId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[SaveLoadPanel] 删除失败:', err);
    loadMsg.value = `删除失败：${err instanceof Error ? err.message : String(err)}`;
  }
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
        v-if="!isIronman"
        @click="handleSave"
        :disabled="saving || !playerStore.isCreated"
        class="px-3 py-1 bg-jade text-white rounded text-xs font-semibold disabled:opacity-50"
      >
        {{ saving ? '保存中...' : '保存当前进度' }}
      </button>
      <span v-else class="text-xs text-danger">铁人模式 · 月度自动存档</span>
    </div>

    <p v-if="saveMsg" class="text-xs" :class="saveMsg.startsWith('保存失败') ? 'text-danger' : 'text-jade'">{{ saveMsg }}</p>
    <p v-if="loadMsg" class="text-xs" :class="loadMsg.includes('失败') ? 'text-danger' : 'text-jade'">{{ loadMsg }}</p>

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
