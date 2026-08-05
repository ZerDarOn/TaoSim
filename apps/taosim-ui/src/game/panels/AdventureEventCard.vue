<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { AdventureEngine, ContentRegistry } from '@taosim/engine';
import type { AdventureEvent, AdventureChoice, AdventureOutcome } from '@taosim/engine';
import { formatRealm } from '@/utils/i18n-game';

const props = defineProps<{
  event: AdventureEvent;
}>();

const emit = defineEmits<{
  close: [];
}>();

const playerStore = usePlayerStore();
const resolvedOutcomes = ref<AdventureOutcome[] | null>(null);
const resultMessages = ref<string[]>([]);

const player = computed(() => playerStore.character!);

function canChoose(choice: AdventureChoice): boolean {
  return AdventureEngine.canChoose(player.value, choice);
}

function choose(choice: AdventureChoice) {
  if (!canChoose(choice)) return;

  const outcomes = AdventureEngine.resolveChoice(choice);
  resolvedOutcomes.value = outcomes;
  resultMessages.value = [];

  for (const o of outcomes) {
    applyOutcome(o);
  }
}

function applyOutcome(outcome: AdventureOutcome) {
  const c = player.value;
  let msg = '';

  switch (outcome.type) {
    case 'exp':
      c.cultivation.currentExp += outcome.value as number;
      msg = `修为 +${outcome.value}`;
      break;
    case 'spiritStones':
      c.spiritStones += outcome.value as number;
      msg = `灵石 +${outcome.value}`;
      break;
    case 'hp': {
      const hpValue = outcome.value as number;
      c.hp = Math.max(0, Math.min(c.maxHp, c.hp + hpValue));
      msg = hpValue > 0 ? `恢复 ${hpValue} 点气血` : `损失 ${Math.abs(hpValue)} 点气血`;
      break;
    }
    case 'attribute': {
      const attr = outcome.value as string;
      const [key, val] = attr.split(':');
      if (key && val) {
        (c.attributes as Record<string, number>)[key] = ((c.attributes as Record<string, number>)[key] ?? 0) + Number(val);
        msg = `${key} ${Number(val) > 0 ? '+' : ''}${val}`;
      }
      break;
    }
    case 'item': {
      const itemId = outcome.value as string;
      // 尝试在背包中累加
      const existing = c.inventory.find(s => s.item.id === itemId);
      if (existing) {
        existing.count++;
      } else {
        c.inventory.push({
          item: { id: itemId, name: itemId, tier: 1, type: 'Material', quality: 'Common', attributes: {} },
          count: 1,
        });
      }
      msg = `获得材料: ${itemId}`;
      break;
    }
    case 'skill': {
      const skillId = outcome.value as string;
      const skill = ContentRegistry.skills.find(s => s.id === skillId);
      if (skill && !c.skills.some(s => s.id === skillId)) {
        c.skills.push({ ...skill });
        msg = `习得功法: ${skill.name}`;
      } else if (c.skills.some(s => s.id === skillId)) {
        msg = `已学会此功法`;
      } else {
        msg = `发现残篇: ${skillId}（未能完整解读）`;
      }
      break;
    }
    case 'recipe':
      if (!c.unlockedRecipes.includes(outcome.value as string)) {
        c.unlockedRecipes.push(outcome.value as string);
      }
      msg = `解锁丹方: ${outcome.value}`;
      break;
    case 'favorability':
      msg = `好感度变化: ${outcome.value}`;
      break;
    case 'death':
      msg = outcome.value === 'instant' ? '你当场陨落...' : '你受了致命伤...';
      c.hp = 0;
      break;
    default:
      msg = `${outcome.type}: ${outcome.value}`;
  }

  if (outcome.probability !== undefined && outcome.probability < 1.0) {
    msg = `[概率触发] ${msg}`;
  }

  resultMessages.value.push(msg);
}

function finish() {
  emit('close');
}
</script>

<template>
  <div class="p-4 bg-indigo-900/30 rounded-lg border border-indigo-600/50 space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-indigo-300 text-base font-semibold">{{ event.title }}</h3>
      <span class="text-xs text-slate-500">{{ event.category }}</span>
    </div>

    <!-- 事件描述 -->
    <p v-if="!resolvedOutcomes" class="text-sm text-slate-300 leading-relaxed">{{ event.description }}</p>

    <!-- 选项列表（未结算时） -->
    <div v-if="!resolvedOutcomes" class="space-y-2">
      <button
        v-for="(choice, i) in event.choices"
        :key="i"
        @click="choose(choice)"
        :disabled="!canChoose(choice)"
        :class="[
          'w-full text-left p-3 rounded-md text-sm transition border',
          canChoose(choice)
            ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200 cursor-pointer'
            : 'bg-slate-800/50 border-slate-700 text-slate-500 cursor-not-allowed'
        ]"
      >
        <div class="font-medium">{{ choice.label }}</div>
        <div v-if="!canChoose(choice) && choice.lockedText" class="text-xs text-red-400 mt-1">{{ choice.lockedText }}</div>
      </button>
    </div>

    <!-- 结算结果 -->
    <div v-if="resolvedOutcomes" class="space-y-2">
      <div v-for="(msg, i) in resultMessages" :key="i"
        :class="[
          'text-sm rounded px-3 py-1.5',
          msg.includes('损失') || msg.includes('陨落') || msg.includes('致命')
            ? 'bg-red-900/40 text-red-300'
            : 'bg-emerald-900/40 text-emerald-300'
        ]">
        {{ msg }}
      </div>
      <button @click="finish"
        class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-semibold transition mt-2">
        继续
      </button>
    </div>
  </div>
</template>
