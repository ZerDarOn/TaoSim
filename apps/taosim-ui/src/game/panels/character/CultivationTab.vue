<script setup lang="ts">
/**
 * CultivationTab — 角色「修炼」子页签
 * 内容源自原 CultivationPanel，去掉「返回场所」按钮逻辑（场所退出改由大地图完成）
 */
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';
import { useEventLogStore } from '@/stores/event-log';
import { TribulationEngine, getSpiritRootMultiplier, FactionEngine } from '@taosim/engine';
import type { RealmBreakthroughConfig, RealmFullPath } from '@taosim/contracts';
import { formatRealm, formatSpiritRootGrade, formatSpiritElement, formatItemId, formatFactionName } from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const world = useWorld();
const eventLog = useEventLogStore();
const resultMessage = ref<string | null>(null);
const factionMessage = ref<string | null>(null);

// ---- 宗门 ----

const factionName = computed(() => formatFactionName(playerStore.character?.factionId));

const factionRankLabel = computed(() => {
  const rank = playerStore.character?.factionRank;
  if (!rank) return '—';
  const labels: Record<string, string> = {
    Disciple: '弟子',
    Deacon: '执事',
    Elder: '长老',
    Leader: '宗主',
  };
  return labels[rank] ?? rank;
});

// 简易贡献度跟踪（用灵石累计贡献量）
const totalContribution = ref(0);

function contribute(amount: number) {
  if (!playerStore.character || playerStore.character.spiritStones < amount) {
    factionMessage.value = '灵石不足';
    return;
  }
  playerStore.character.spiritStones -= amount;
  totalContribution.value += amount;
  factionMessage.value = `贡献 ${amount} 灵石成功`;
  eventLog.addEvent('social', `贡献宗门`, `向${factionName.value}贡献 ${amount} 灵石`);
}

function attemptPromote() {
  if (!playerStore.character) return;
  const result = FactionEngine.promote(playerStore.character, totalContribution.value);
  if (result.success) {
    factionMessage.value = `晋升成功！当前阶位：${factionRankLabel.value}`;
    eventLog.addEvent('social', `宗门晋升`, `晋升为${factionName.value} · ${factionRankLabel.value}`, { isMajorEvent: true });
  } else {
    factionMessage.value = result.reason ?? '晋升失败';
  }
}

function leaveFaction() {
  if (!playerStore.character?.factionId) return;
  playerStore.character.factionId = undefined;
  playerStore.character.factionRank = undefined;
  factionMessage.value = '已脱离宗门，遭到通缉';
}

// ---- 修炼速度面板 ----

const rootMultiplier = computed(() => {
  const c = playerStore.character;
  if (!c) return 0;
  return getSpiritRootMultiplier(c.spiritRoot.grade, c.spiritRoot.elements.length, c.spiritRoot.isVariant);
});

const monthlyExpRate = computed(() => {
  const c = playerStore.character;
  if (!c) return 0;
  // 公式：悟性 × 0.5 × 灵根倍率（每月修为）
  return Math.floor(c.attributes.comprehension * 0.5 * rootMultiplier.value);
});

const yearlyExpRate = computed(() => monthlyExpRate.value * 12);

const expProgress = computed(() => {
  const c = playerStore.character;
  if (!c) return 0;
  return Math.min(100, (c.cultivation.currentExp / c.cultivation.maxExp) * 100);
});

const spiritRootText = computed(() => {
  const c = playerStore.character;
  if (!c) return '';
  const grade = formatSpiritRootGrade(c.spiritRoot.grade);
  const elements = c.spiritRoot.elements.map(e => formatSpiritElement(e)).join('');
  return `${grade}灵根 · ${elements}${c.spiritRoot.isVariant ? '（变异）' : ''}`;
});

// ---- 闭关 ----

const isCultivating = computed(() => world.state.advancing);

async function cultivate(months: number) {
  resultMessage.value = null;
  const result = await world.fastForward(months);
  if (!result.died) {
    const densityInfo = world.state.lastSpiritDensity !== 1.0
      ? ` · 灵气浓度 ${(world.state.lastSpiritDensity * 100).toFixed(0)}%`
      : '';
    const eventInfo = world.state.lastCalendarEventName
      ? ` · ${world.state.lastCalendarEventName}`
      : '';
    resultMessage.value = `闭关 ${months} 月圆满。修为 +${result.expGained}，年寿 +${(months / 12).toFixed(1)} 岁${densityInfo}${eventInfo}`;
  }
}

// ---- 突破 ----

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
  {
    fromRealm: 'NascentSoul_3', toRealm: 'SoulFormation_1', tier: 4,
    requirements: { expThreshold: 80000, requiredItems: ['SoulFormationPill'] },
    simpleModeSuccessRate: 0.40,
    postBreakthrough: { maxLifespan: 1500, hpMultiplier: 2.5, spiritEnergyMultiplier: 2.5 },
  },
];

const availableConfig = computed<RealmBreakthroughConfig | null>(() => {
  if (!playerStore.character) return null;
  const currentRealm = playerStore.character.realm;
  return allConfigs.find(c => c.fromRealm === currentRealm) ?? null;
});

// ---- 小境界圆满提升（练气1→2→...→9 等） ----

/** 当前境界能否圆满提升到下一小境界（非大境界突破） */
const canAdvanceMinorRealm = computed(() => {
  if (!playerStore.character) return false;
  // 如果有大境界突破配置（如练气9→筑基1），走突破逻辑而非圆满提升
  if (availableConfig.value) return false;
  if (isMaxRealm.value) return false;
  // 修满 maxExp 才能圆满
  return playerStore.character.cultivation.currentExp >= playerStore.character.cultivation.maxExp;
});

/** 获取下一个小境界 */
function getNextMinorRealm(current: string): string | null {
  const match = current.match(/^(.+?)_(\d+)$/);
  if (!match) return null;
  const prefix = match[1]!;
  const num = parseInt(match[2]!, 10);

  // 各大境界最大阶数
  const maxStage: Record<string, number> = {
    QiRefinement: 9,
    Foundation: 3,
    GoldenCore: 3,
    NascentSoul: 3,
    SoulFormation: 1,
  };

  const max = maxStage[prefix] ?? 1;
  if (num >= max) return null; // 已到该境界顶级，需大境界突破
  return `${prefix}_${num + 1}`;
}

function advanceMinorRealm() {
  if (!playerStore.character) return;
  const nextRealm = getNextMinorRealm(playerStore.character.realm);
  if (!nextRealm) return;

  const oldMaxExp = playerStore.character.cultivation.maxExp;
  // 提升境界
  playerStore.character.realm = nextRealm as RealmFullPath;
  // 修为上限提升（每小境界 +50%）
  playerStore.character.cultivation.maxExp = Math.floor(oldMaxExp * 1.5);
  // 消耗当前修为的一半（圆满消耗）
  playerStore.character.cultivation.currentExp = Math.floor(playerStore.character.cultivation.currentExp * 0.3);
  // 气血/灵力上限小幅增长
  playerStore.character.maxHp = Math.floor(playerStore.character.maxHp * 1.15);
  playerStore.character.hp = playerStore.character.maxHp;
  playerStore.character.spiritEnergy.max = Math.floor(playerStore.character.spiritEnergy.max * 1.1);
  playerStore.character.spiritEnergy.current = playerStore.character.spiritEnergy.max;

  resultMessage.value = `境界圆满！已踏入 ${formatRealm(nextRealm as RealmFullPath)}`;
  eventLog.addEvent('cultivation', `境界圆满 · ${formatRealm(nextRealm as RealmFullPath)}`, '修为精进，更上一层', {
    isMajorEvent: true,
  });
}

// 判断是否已达最高境界
const isMaxRealm = computed(() => {
  if (!playerStore.character) return false;
  return playerStore.character.realm.startsWith('SoulFormation');
});

// 判断修为是否足够突破
const canBreakthrough = computed(() => {
  if (!availableConfig.value || !playerStore.character) return false;
  return playerStore.character.cultivation.currentExp >= availableConfig.value.requirements.expThreshold;
});

async function attemptBreakthrough() {
  if (!playerStore.character || !availableConfig.value) return;

  // 修为检查
  if (playerStore.character.cultivation.currentExp < availableConfig.value.requirements.expThreshold) {
    resultMessage.value = `修为不足！需 ${availableConfig.value.requirements.expThreshold} 修为方可突破`;
    return;
  }

  // 材料不再硬性要求，只影响成功率（引擎层处理）
  // 计算预估成功率用于提示
  const config = availableConfig.value;
  const requiredItems = config.requirements.requiredItems ?? [];
  const hasItems = requiredItems.filter(itemId =>
    playerStore.character!.inventory.some(
      s => (s.item.templateId === itemId || s.item.id === itemId) && s.count > 0
    )
  );
  const materialBonus = hasItems.length * 0.25;
  const noMaterialPenalty = requiredItems.length > 0 && hasItems.length === 0 ? -0.30 : 0;
  const physiqueBonus = (playerStore.character.attributes.physique ?? 0) / 100;
  const luckBonus = (playerStore.character.attributes.luck ?? 0) / 100;
  const estSuccessRate = Math.max(0.05, Math.min(0.99,
    config.simpleModeSuccessRate + physiqueBonus + luckBonus + materialBonus + noMaterialPenalty
  ));

  // 如果没有材料且成功率低，提示但不阻止
  if (requiredItems.length > 0 && hasItems.length === 0 && estSuccessRate < 0.5) {
    resultMessage.value = `无材料加成，突破成功率仅 ${Math.round(estSuccessRate * 100)}%（材料：${requiredItems.map(formatItemId).join(', ')}）`;
  }

  const result = TribulationEngine.attempt(playerStore.character, availableConfig.value);
  if (result.success && result.updatedCharacter) {
    playerStore.character = result.updatedCharacter;
    resultMessage.value = `突破成功！已踏入 ${formatRealm(result.newRealm!)}`;
    eventLog.addEvent('cultivation', `突破成功 · ${formatRealm(result.newRealm!)}`, `踏入全新境界`, {
      isMajorEvent: true,
    });
  } else {
    resultMessage.value = result.reason ?? '突破失败';
    eventLog.addEvent('cultivation', '突破失败', result.reason ?? '劫数未至', {
      isMajorEvent: true,
    });
    if (result.updatedCharacter) {
      playerStore.character = result.updatedCharacter;
    }
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 角色修炼概览 -->
    <div v-if="playerStore.character" class="p-4 bg-slate-800 rounded-lg space-y-3 text-sm">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-slate-400 text-xs">当前境界</span>
          <div class="font-semibold text-amber-300 text-base">{{ formatRealm(playerStore.character.realm) }}</div>
        </div>
        <div class="text-right">
          <span class="text-slate-400 text-xs">年寿</span>
          <div class="text-slate-200">{{ Math.floor(playerStore.character.lifespan.age) }} / {{ playerStore.character.lifespan.maxLifespan }}</div>
        </div>
      </div>

      <!-- 修为进度条 -->
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="text-slate-400">修为</span>
          <span class="text-amber-200">{{ playerStore.character.cultivation.currentExp }} / {{ playerStore.character.cultivation.maxExp }}</span>
        </div>
        <div class="h-2.5 bg-slate-700 rounded-full overflow-hidden">
          <div class="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-300"
            :style="{ width: expProgress + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- 修炼速度面板 -->
    <div v-if="playerStore.character" class="p-4 bg-slate-800 rounded-lg space-y-2 text-sm">
      <h3 class="text-xs font-semibold text-slate-400 uppercase tracking-wide">修炼速度</h3>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-400">灵根</span>
          <span class="text-slate-200">{{ spiritRootText }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">灵根倍率</span>
          <span class="text-emerald-300">×{{ rootMultiplier.toFixed(2) }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">悟性</span>
          <span class="text-slate-200">{{ playerStore.character.attributes.comprehension }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-400">每月修为</span>
          <span class="text-amber-300 font-semibold">+{{ monthlyExpRate }}</span>
        </div>
      </div>
      <div class="pt-1 border-t border-slate-700 flex justify-between text-xs">
        <span class="text-slate-400">预计每年修为</span>
        <span class="text-amber-300 font-semibold">+{{ yearlyExpRate }}</span>
      </div>
    </div>

    <!-- 闭关按钮 -->
    <div class="space-y-2">
      <!-- 按月闭关（精细修炼） -->
      <div class="grid grid-cols-3 gap-2">
        <button @click="cultivate(1)"
          class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition disabled:opacity-50"
          :disabled="isCultivating">
          闭关 1 月
        </button>
        <button @click="cultivate(3)"
          class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition disabled:opacity-50"
          :disabled="isCultivating">
          闭关 3 月
        </button>
        <button @click="cultivate(6)"
          class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition disabled:opacity-50"
          :disabled="isCultivating">
          闭关 6 月
        </button>
      </div>
      <!-- 按年闭关（长期闭关） -->
      <button @click="cultivate(12)"
        class="w-full px-4 py-3 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
        :disabled="isCultivating">
        {{ isCultivating ? '闭关中...' : '闭关修行 1 年' }}
      </button>
      <div class="grid grid-cols-2 gap-2">
        <button @click="cultivate(60)"
          class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition disabled:opacity-50"
          :disabled="isCultivating">
          闭关 5 年
        </button>
        <button @click="cultivate(120)"
          class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition disabled:opacity-50"
          :disabled="isCultivating">
          闭关 10 年
        </button>
      </div>
    </div>

    <!-- 闭关反馈 -->
    <div v-if="resultMessage && !resultMessage.includes('突破')"
      :class="['p-3 rounded-lg text-sm', resultMessage.includes('圆满') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300']">
      {{ resultMessage }}
    </div>

    <!-- 境界圆满提升（小境界） -->
    <div v-if="canAdvanceMinorRealm" class="p-4 bg-emerald-900/30 rounded-lg border border-emerald-600/50 space-y-2">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-emerald-300 text-sm font-semibold">境界圆满</span>
          <div class="text-xs text-slate-400">修为已满，可突破至下一阶</div>
        </div>
        <button @click="advanceMinorRealm"
          class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition">
          圆满提升
        </button>
      </div>
    </div>

    <!-- 突破区域（大境界） -->
    <div v-if="availableConfig" class="p-4 bg-slate-800 rounded-lg border border-amber-600/50 space-y-3">
      <h3 class="text-sm font-semibold text-amber-400">突破契机</h3>
      <div class="text-xs text-slate-300 space-y-1">
        <div>目标境界：<span class="text-amber-300">{{ formatRealm(availableConfig.toRealm as RealmFullPath) }}</span></div>
        <div>需修为：<span :class="canBreakthrough ? 'text-emerald-300' : 'text-red-300'">{{ availableConfig.requirements.expThreshold }}</span></div>
        <div v-if="availableConfig.requirements.requiredItems?.length">
          辅材：<span class="text-slate-400">{{ availableConfig.requirements.requiredItems.map(formatItemId).join(', ') }}</span>
          <span class="text-xs text-slate-500">（有则提升成功率）</span>
        </div>
      </div>
      <button @click="attemptBreakthrough"
        class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!canBreakthrough">
        {{ canBreakthrough ? `冲击 ${formatRealm(availableConfig.toRealm as RealmFullPath)}` : '修为不足' }}
      </button>
    </div>
    <div v-else-if="isMaxRealm" class="p-4 bg-slate-800 rounded-lg text-center">
      <div class="text-amber-300 text-sm font-semibold mb-1">已臻化神之境</div>
      <div class="text-xs text-slate-500">修仙界巅峰，再无前人之路</div>
    </div>
    <div v-else class="p-4 bg-slate-800 rounded-lg text-center">
      <div class="text-xs text-slate-500">继续修炼至境界圆满，方可突破</div>
    </div>

    <!-- 突破反馈 -->
    <div v-if="resultMessage && resultMessage.includes('突破')"
      :class="['p-3 rounded-lg text-sm', resultMessage.includes('成功') ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300']">
      {{ resultMessage }}
    </div>

    <!-- 宗门区域 -->
    <div class="p-4 bg-slate-800 rounded-lg space-y-3">
      <h3 class="text-sm font-semibold text-slate-300">宗门</h3>
      <div v-if="playerStore.character?.factionId">
        <div class="text-xs text-slate-400 mb-2">
          {{ factionName }} · <span class="text-amber-300">{{ factionRankLabel }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button @click="contribute(100)"
            class="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-xs transition disabled:opacity-50"
            :disabled="(playerStore.character?.spiritStones ?? 0) < 100">
            贡献 100 灵石
          </button>
          <button @click="attemptPromote"
            class="px-3 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs font-semibold transition">
            申请晋升
          </button>
        </div>
        <button @click="leaveFaction"
          class="w-full mt-2 px-3 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-300 rounded text-xs transition">
          脱离宗门（将遭通缉）
        </button>
      </div>
      <div v-else class="text-xs text-slate-500">
        无宗门归属。前往宗门节点可加入修仙门派。
      </div>
      <div v-if="factionMessage" class="text-xs mt-1" :class="factionMessage.includes('成功') ? 'text-green-400' : 'text-red-400'">
        {{ factionMessage }}
      </div>
    </div>
  </div>
</template>
