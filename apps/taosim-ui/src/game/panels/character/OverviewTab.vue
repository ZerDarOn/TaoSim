<script setup lang="ts">
/**
 * OverviewTab — 角色「概览」子页签
 * 内容源自原 CharacterDetailModal：基础信息 + 六维属性 + 天赋词条 + 游戏模式
 */
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useAppStore } from '@/stores/app';
import { projectTime } from '@taosim/engine';
import {
  formatGender,
  formatRealm,
  formatSoulState,
  formatSpiritRootGrade,
  formatSpiritElement,
  formatTraitQuality,
  traitQualityColor,
} from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const appStore = useAppStore();

const c = computed(() => playerStore.character);

const attrItems = computed(() => {
  const a = c.value?.attributes;
  if (!a) return [];
  return [
    { label: '根骨', value: a.physique },
    { label: '悟性', value: a.comprehension },
    { label: '神识', value: a.perception },
    { label: '身法', value: a.agility },
    { label: '气运', value: a.luck },
    { label: '仙姿', value: a.charm },
  ];
});

const ATTR_MAX = 20;

const spiritRootText = computed(() => {
  const r = c.value?.spiritRoot;
  if (!r) return '';
  const grade = formatSpiritRootGrade(r.grade);
  const elements = r.elements.map(formatSpiritElement).join('/');
  return `${grade}灵根 · ${elements}${r.isVariant ? '（变异）' : ''}`;
});

// 游戏模式（突破 / 存档）
const gameModeText = computed(() => {
  const m = c.value?.gameMode;
  if (!m) return '—';
  const breakthrough = m.breakthrough === 'Simple' ? '简单突破' : '传统突破';
  const save = m.saveMode === 'Ironman' ? '铁人模式' : '自由模式';
  return `${breakthrough} · ${save}`;
});

const entryModeText = computed(() => {
  const mode = c.value?.entryProfile?.mode;
  return ({ birth: '降生', transmigration: '穿越', god: '上帝观察', legacy: '旧档入世' } as const)[mode ?? 'legacy'];
});

function formatEntryTime(minutes: number | undefined): string {
  if (minutes === undefined) return '尚未完成';
  const value = projectTime(minutes);
  return `道历 ${value.year} 年 ${value.month} 月 ${value.day} 日`;
}

const familyNames = computed(() => {
  const world = appStore.currentWorldState;
  const family = c.value?.entryProfile?.family ?? [];
  if (!world) return [];
  return family.map((link) => {
    const npc = world.npcs[link.npcId] ?? world.archivedNpcs?.[link.npcId];
    const role = ({ parent: '双亲', guardian: '照料者', elder: '族中长辈' } as const)[link.role];
    return `${npc?.name ?? '姓名失考'}（${role}${world.archivedNpcs?.[link.npcId] ? '，已载入史册' : ''}）`;
  });
});

const childhoodChoiceText = computed(() => {
  const choice = c.value?.entryProfile?.childhoodChoice;
  return choice ? ({
    follow_family: '亲随家人',
    study_classics: '熟读经义',
    roam_outdoors: '山野历练',
  } as const)[choice] : undefined;
});
</script>

<template>
  <div v-if="c" class="space-y-6">
    <!-- 基础信息 -->
    <section class="space-y-2">
      <div class="text-2xl font-bold text-amber-200">{{ c.name }}</div>
      <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div><span class="text-slate-400">性别：</span>{{ formatGender(c.gender) }}</div>
        <div><span class="text-slate-400">境界：</span>{{ formatRealm(c.realm) }}</div>
        <div><span class="text-slate-400">寿元：</span>{{ Math.floor(c.lifespan.age) }} / {{ c.lifespan.maxLifespan }} 岁</div>
        <div><span class="text-slate-400">魂态：</span>{{ formatSoulState(c.soulState) }}</div>
        <div class="col-span-2"><span class="text-slate-400">灵根：</span>{{ spiritRootText }}</div>
        <div class="col-span-2"><span class="text-slate-400">游戏模式：</span>{{ gameModeText }}</div>
      </div>
    </section>

    <section v-if="c.entryProfile" class="bg-slate-800 rounded p-3 space-y-1.5">
      <h3 class="text-sm font-semibold text-slate-300">入世前史</h3>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400">
        <div><span class="text-slate-500">方式：</span>{{ entryModeText }}</div>
        <div><span class="text-slate-500">视野：</span>{{ c.entryProfile.knowledgeScope === 'omniscient' ? '全知观察' : '角色所知' }}</div>
        <div v-if="c.entryProfile.bornAtMinutes !== undefined" class="col-span-2"><span class="text-slate-500">出生：</span>{{ formatEntryTime(c.entryProfile.bornAtMinutes) }}</div>
        <div class="col-span-2"><span class="text-slate-500">自主入世：</span>{{ formatEntryTime(c.entryProfile.enteredWorldAtMinutes) }}</div>
        <div v-if="childhoodChoiceText" class="col-span-2"><span class="text-slate-500">童年选择：</span>{{ childhoodChoiceText }}</div>
        <div v-if="familyNames.length" class="col-span-2"><span class="text-slate-500">真实亲缘/照料：</span>{{ familyNames.join('、') }}</div>
        <div v-if="c.entryProfile.mode === 'god'" class="col-span-2 text-amber-300">
          地图地址是观察焦点，不是肉身位置；累计赐予 {{ c.entryProfile.godIntervention?.totalSpiritStonesGranted ?? 0 }} 灵石。
        </div>
        <div v-if="c.entryProfile.mode === 'legacy'" class="col-span-2 text-slate-500">
          旧档未记录原始入场来源；系统不会反向编造家庭或出生事件。
        </div>
      </div>
    </section>

    <!-- 六维属性 -->
    <section>
      <h3 class="text-sm font-semibold text-slate-300 mb-2">基础属性</h3>
      <div class="space-y-1.5">
        <div v-for="attr in attrItems" :key="attr.label">
          <div class="flex justify-between text-xs mb-0.5">
            <span class="text-slate-300">{{ attr.label }}</span>
            <span class="text-slate-400">{{ attr.value }}</span>
          </div>
          <div class="h-1.5 bg-slate-700 rounded">
            <div class="h-full bg-amber-500 rounded"
              :style="{ width: `${Math.min(100, (attr.value / ATTR_MAX) * 100)}%` }"></div>
          </div>
        </div>
      </div>
    </section>

    <!-- 天赋词条 -->
    <section v-if="c.traits.length">
      <h3 class="text-sm font-semibold text-slate-300 mb-2">天赋词条</h3>
      <div class="space-y-2">
        <div v-for="t in c.traits" :key="t.id"
          class="bg-slate-800 rounded p-3">
          <div class="flex items-baseline justify-between">
            <span class="text-sm font-medium text-slate-100">{{ t.name }}</span>
            <span class="text-xs" :class="traitQualityColor(t.quality)">{{ formatTraitQuality(t.quality) }}</span>
          </div>
          <div class="text-xs text-slate-400 mt-1">{{ t.description }}</div>
        </div>
      </div>
    </section>
  </div>
</template>
