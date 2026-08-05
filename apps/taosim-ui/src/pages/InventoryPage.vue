<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { EquipmentManager } from '@taosim/engine';
import type { Item } from '@taosim/contracts';

const playerStore = usePlayerStore();
const message = ref<string | null>(null);

const character = computed(() => playerStore.character);

const inventoryItems = computed(() => character.value?.inventory ?? []);

const equipmentDisplay = computed(() => {
  if (!character.value) return null;
  const c = character.value;
  return {
    weapon: c.equipmentSlots.weapon?.name ?? '空',
    armor: c.equipmentSlots.armor?.name ?? '空',
    treasures: c.equipmentSlots.treasures.map(t => t.name),
  };
});

function handleEquip(item: Item) {
  if (!character.value) return;
  const r = EquipmentManager.equip(character.value, item);
  message.value = r.success ? `装备了 ${item.name}` : r.reason ?? '失败';
}

function handleUnequipWeapon() {
  if (!character.value) return;
  const r = EquipmentManager.unequip(character.value, 'weapon');
  message.value = r.success ? '卸下武器' : r.reason ?? '失败';
}

function handleUnequipArmor() {
  if (!character.value) return;
  const r = EquipmentManager.unequip(character.value, 'armor');
  message.value = r.success ? '卸下防具' : r.reason ?? '失败';
}

function handleUnequipTreasure(itemId: string) {
  if (!character.value) return;
  const r = EquipmentManager.unequip(character.value, 'treasures', itemId);
  message.value = r.success ? '卸下法宝' : r.reason ?? '失败';
}

const attrLabels: Record<string, string> = {
  attack: '攻击', defense: '防御', critRate: '暴击',
  physique: '根骨', comprehension: '悟性', perception: '神识',
  agility: '身法', luck: '气运',
};

function formatAttrs(attrs: Record<string, number>): string {
  return Object.entries(attrs)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${attrLabels[k] ?? k}+${v}`)
    .join(' ');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">乾坤袋</h1>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <!-- 装备面板 -->
    <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
      <h2 class="text-sm font-semibold text-ink-soft mb-2">当前装备</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="flex justify-between">
          <span class="text-muted">武器</span>
          <span class="font-semibold">{{ equipmentDisplay?.weapon }}</span>
          <button v-if="character?.equipmentSlots.weapon" @click="handleUnequipWeapon"
            class="text-xs text-danger ml-2">卸下</button>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">防具</span>
          <span class="font-semibold">{{ equipmentDisplay?.armor }}</span>
          <button v-if="character?.equipmentSlots.armor" @click="handleUnequipArmor"
            class="text-xs text-danger ml-2">卸下</button>
        </div>
      </div>
      <div v-if="equipmentDisplay?.treasures.length" class="text-sm">
        <span class="text-muted">法宝：</span>
        <span v-for="t in character?.equipmentSlots.treasures" :key="t.id"
          class="inline-flex items-center gap-1 mr-3">
          <span class="font-semibold">{{ t.name }}</span>
          <button @click="handleUnequipTreasure(t.id)" class="text-xs text-danger">卸下</button>
        </span>
      </div>
    </div>

    <!-- 背包列表 -->
    <div class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-soft">物品 ({{ inventoryItems.length }})</h2>
      <div v-if="inventoryItems.length === 0" class="text-sm text-muted p-4 text-center">空空如也</div>
      <div v-for="stack in inventoryItems" :key="stack.item.id"
        class="bg-surface rounded-lg border border-line p-3 flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold">{{ stack.item.name }}
            <span class="text-xs text-muted">x{{ stack.count }}</span>
          </div>
          <div class="text-xs text-ink-soft">
            {{ stack.item.type }} · {{ stack.item.tier }}阶
            <span v-if="Object.keys(stack.item.attributes).length">
              · {{ formatAttrs(stack.item.attributes) }}
            </span>
          </div>
        </div>
        <button v-if="stack.item.type === 'Equipment'" @click="handleEquip(stack.item)"
          class="px-2 py-1 bg-jade text-white rounded text-xs">装备</button>
      </div>
    </div>
  </div>
</template>
