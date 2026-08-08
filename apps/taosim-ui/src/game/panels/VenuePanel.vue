<script setup lang="ts">
/**
 * VenuePanel — 城镇内部面板（L0 场所）
 *
 * 当玩家进入城镇地标后，显示该城镇的所有场所（酒馆/商铺/传送院/...）。
 * 每个场所是一个入口按钮，点击后进入对应玩法（目前跳转到对应 tab）。
 */
import { computed } from 'vue';
import { useMapStore } from '@/stores/map';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import {
  VenueService,
  VENUE_TYPE_LABEL,
  VENUE_TYPE_ICON,
} from '@taosim/engine';
import { getVenue } from '@taosim/engine';
import type { VenueDef } from '@taosim/contracts';

const mapStore = useMapStore();
const playerStore = usePlayerStore();
const uiStore = useUiStore();

// 当前所在城镇的所有场所
const venues = computed<VenueDef[]>(() => {
  const nodeId = playerStore.currentNodeId;
  return nodeId ? VenueService.listVenues(nodeId) : [];
});

// 当前场所详情
const currentVenue = computed(() => {
  const id = mapStore.activeVenueId;
  return id ? getVenue(id) : null;
});

function canEnter(venue: VenueDef): boolean {
  if (!playerStore.character || !venue.requiredRealm) return true;
  return VenueService.canEnter(playerStore.character, venue.id).ok;
}

function enterVenue(venue: VenueDef) {
  if (!playerStore.character) return;
  const result = VenueService.enter(playerStore.character, venue.id);
  if (!result.success) return;

  mapStore.enterVenue(venue.id);

  // 根据场所类型跳转对应 tab
  switch (venue.type) {
    case 'shop':
      uiStore.setTab('market');
      break;
    case 'training_ground':
      uiStore.setCharSubTab('cultivation');
      uiStore.setTab('character');
      break;
    default:
      // 其他场所暂留在 venue 面板
      break;
  }
}

function leaveVenue() {
  // 从具体场所返回到场所列表（仍在城镇内）
  mapStore.backToVenueList();
}

function exitCity() {
  // 离开城镇，回到区域网格
  mapStore.leaveVenue();
  mapStore.setActiveLayer('Region');
}
</script>

<template>
  <div class="space-y-3">
    <!-- 场所标题 -->
    <div class="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
      <div>
        <div class="text-sm font-semibold text-amber-200">
          {{ currentVenue?.name ?? '城镇内部' }}
        </div>
        <div class="text-xs text-slate-400">
          {{ venues.length }} 个场所可探访
        </div>
      </div>
      <button @click="exitCity"
        class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded-md font-medium transition">
        离开城镇
      </button>
    </div>

    <!-- 当前所在场所描述 -->
    <div v-if="currentVenue" class="p-3 bg-amber-900/20 rounded-lg border border-amber-700/40">
      <div class="flex items-center gap-2">
        <div class="w-7 h-7 rounded flex items-center justify-center bg-amber-700/50 text-amber-200 text-xs font-bold">
          {{ VENUE_TYPE_ICON[currentVenue.type] }}
        </div>
        <div class="flex-1">
          <div class="text-sm text-amber-200 font-semibold">{{ currentVenue.name }}</div>
          <div class="text-xs text-slate-400">{{ currentVenue.description }}</div>
        </div>
        <button @click="leaveVenue"
          class="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded">
          返回
        </button>
      </div>
    </div>

    <!-- 场所列表 -->
    <div v-if="!currentVenue" class="grid grid-cols-1 gap-2">
      <button
        v-for="venue in venues" :key="venue.id"
        @click="canEnter(venue) && enterVenue(venue)"
        :disabled="!canEnter(venue)"
        :class="[
          'flex items-center gap-3 p-3 rounded-lg border transition text-left',
          canEnter(venue)
            ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 cursor-pointer'
            : 'bg-slate-900 border-slate-800 opacity-50 cursor-not-allowed',
        ]"
      >
        <div class="w-9 h-9 rounded flex items-center justify-center font-bold text-sm flex-shrink-0"
          :style="{
            backgroundColor: venue.type === 'teleport_office' ? '#7c3aed44'
              : venue.type === 'shop' ? '#0891b244'
              : venue.type === 'tavern' ? '#d9770644'
              : '#47556944',
            color: venue.type === 'teleport_office' ? '#c4b5fd'
              : venue.type === 'shop' ? '#67e8f9'
              : venue.type === 'tavern' ? '#fcd34d'
              : '#cbd5e1',
          }">
          {{ VENUE_TYPE_ICON[venue.type] }}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-sm text-slate-100 font-medium truncate">{{ venue.name }}</div>
          <div class="text-xs text-slate-400 truncate">{{ venue.description }}</div>
        </div>
        <div v-if="!canEnter(venue)" class="text-xs text-red-400 flex-shrink-0">
          境界不足
        </div>
        <div v-else class="text-xs text-slate-500 flex-shrink-0">
          {{ VENUE_TYPE_LABEL[venue.type] }} ›
        </div>
      </button>
    </div>
  </div>
</template>
