<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { useAppStore } from '@/stores/app';
import {
  NPCInteractionEngine, NPCTradeEngine, MarketTransaction, ItemFactory,
  DEFAULT_ITEM_TEMPLATES, ContentRegistry, inspectNpcBrain, setNpcBrainNodeEnabled,
} from '@taosim/engine';
import { resolvePersonalityId } from '@taosim/engine';
import type { NPCTradeOffer, MarketItem, ItemStack } from '@taosim/contracts';
import type { NpcPersonality, NpcDialogue } from '@taosim/engine';
import { formatRealm, formatGender, formatItemType, formatQuality } from '@/utils/i18n-game';

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const appStore = useAppStore();
const subView = ref<'interact' | 'trade' | 'brain'>('interact');
const message = ref<string | null>(null);
const interactionDone = ref(false);
const showTradeDenied = ref(false);

// 交易状态
const npcOffer = ref<NPCTradeOffer | null>(null);

const npc = computed(() => playerStore.currentNPC);
const worldNpc = computed(() => {
  const id = npc.value?.id;
  return id ? appStore.currentWorldState?.npcs[id] : undefined;
});
const brainInspection = computed(() => {
  const world = appStore.currentWorldState;
  const id = npc.value?.id;
  return world && id ? inspectNpcBrain(world, id) : undefined;
});
const brainNodes = computed(() => {
  const decision = brainInspection.value?.decision;
  if (!decision) return [];
  return [
    ...decision.candidates.map((candidate) => ({
      ...candidate, enabled: true, selected: decision.selected?.nodeId === candidate.nodeId,
      reason: undefined as string | undefined,
    })),
    ...decision.rejected.map((candidate) => ({
      ...candidate, score: undefined as number | undefined, considerations: undefined,
      deterministicNoise: 0, enabled: candidate.reasonCode !== 'node_disabled', selected: false,
    })),
  ].sort((a, b) => Number(b.selected) - Number(a.selected)
    || (b.score ?? -Infinity) - (a.score ?? -Infinity)
    || a.nodeId.localeCompare(b.nodeId));
});

// ---- NPC 性格系统（确定性映射：按 NPC id 哈希选性格） ----

const npcPersonality = computed<NpcPersonality | null>(() => {
  if (!npc.value) return null;
  const pool = ContentRegistry.npcPersonalities;
  if (pool.length === 0) return null;
  // 优先读角色自带性格，老数据回退到 id 哈希（与 NPCGenerator 同源）
  const pid = npc.value.personalityId ?? resolvePersonalityId(npc.value.id);
  return pool.find(p => p.id === pid) ?? null;
});

const npcGreeting = computed<NpcDialogue | null>(() => {
  if (!npcPersonality.value) return null;
  return ContentRegistry.npcDialogues.find(
    d => d.personalityId === npcPersonality.value!.id && d.occasion === 'first_meet',
  ) ?? null;
});

const favorability = computed(() => {
  if (!playerStore.character || !npc.value) return 0;
  const rel = playerStore.character.relations[npc.value!.id];
  return rel?.favorability ?? 0;
});

const canTrade = computed(() => favorability.value > -50);

// 交易相关 computed
const npcSelling = computed(() => npcOffer.value?.selling ?? []);
const playerSellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(s => interest.includes(s.item.type) && s.count > 0);
});
const playerUnsellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(s => !interest.includes(s.item.type) && s.count > 0);
});

function handleDuel() {
  if (!playerStore.character || !npc.value) return;
  // S5：若该 NPC 是世界档案中的真实 NPC，带上 enemyNpcId 以便战后回写
  const worldNpcs = appStore.currentWorldState?.npcs ?? {};
  const enemyNpcId = npc.value.id && worldNpcs[npc.value.id] ? npc.value.id : undefined;
  // 触发实际战斗覆盖层，不再硬编码胜利
  uiStore.startBattle({
    enemy: { ...npc.value },
    type: 'duel',
    title: `切磋 · ${npc.value.name}`,
    description: '点到即止的修士比试，败者保留一息生机',
    enemyNpcId,
    sceneId: `duel_${npc.value.id}_${Date.now()}`,
  });
  // NPCInteractionEngine 仍用于记录好感度变化（在战斗结果中结算）
  interactionDone.value = true;
}

function handleDiscuss() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.discuss(playerStore.character, npc.value);
  playerStore.character.cultivation.currentExp += result.expGained;
  message.value = result.message;
  if (result.unlockedRecipe) {
    playerStore.unlockRecipe(result.unlockedRecipe);
  }
  interactionDone.value = true;
}

function handleTrade() {
  if (!canTrade.value) {
    showTradeDenied.value = true;
    return;
  }
  // 切换到交易子视图，并初始化报价
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  if (playerStore.character && npc.value) {
    npcOffer.value = NPCTradeEngine.refreshNPCOffer(npc.value, 1);
  }
  subView.value = 'trade';
  message.value = null;
}

function handleBuy(marketItem: MarketItem) {
  if (!playerStore.character || !npcOffer.value) return;
  const result = MarketTransaction.buyFromNPC(playerStore.character, npcOffer.value, marketItem, 1);
  message.value = result.success
    ? `购买成功！花费 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleSell(stack: ItemStack) {
  if (!playerStore.character || !npcOffer.value) return;
  const result = MarketTransaction.sellToNPC(playerStore.character, npcOffer.value, stack.item, 1);
  message.value = result.success
    ? `卖出成功！获得 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function backToInteract() {
  subView.value = 'interact';
  message.value = null;
}

function openBrain() {
  subView.value = 'brain';
  message.value = null;
}

function sourceLabel(source: string, sourceId?: string): string {
  const label = { core: '本能', species: '种族', lineage: '血脉', culture: '文化', identity: '身份' }[source] ?? source;
  return sourceId ? `${label} · ${sourceId}` : label;
}

function speciesLabel(speciesId?: string): string {
  return { human: '人族', 'fox-spirit': '狐族', 'wood-spirit': '草木灵族' }[speciesId ?? ''] ?? speciesId ?? '未知';
}

function toggleBrainNode(nodeId: string, enabled: boolean) {
  const world = appStore.currentWorldState;
  const id = npc.value?.id;
  if (!world || !id) return;
  setNpcBrainNodeEnabled(world, id, nodeId, enabled);
}

function handleLeave() {
  playerStore.currentNPC = null;
  message.value = null;
  interactionDone.value = false;
  subView.value = 'interact';
}
</script>

<template>
  <div class="space-y-4">
    <!-- 无 NPC 时 -->
    <div v-if="!npc" class="p-4 bg-slate-800 rounded text-slate-400 text-sm">
      暂无相遇之人。在大地图游历时可能偶遇修仙者。
    </div>

    <template v-else>
      <!-- 互动子视图 -->
      <div v-if="subView === 'interact'" class="space-y-4">
        <div class="bg-slate-800 rounded p-4 space-y-2 text-sm">
          <div class="font-semibold text-lg text-amber-200 flex items-center gap-2">
            {{ npc.name }}
            <button
              @click="appStore.toggleFollowNpc(npc.id)"
              class="text-xs px-2 py-0.5 rounded border transition-colors"
              :class="appStore.isWatchingNpc(npc.id)
                ? 'bg-amber-900/40 border-amber-700 text-amber-300 hover:bg-amber-900/60'
                : 'bg-slate-700 border-slate-600 text-slate-400 hover:text-amber-300 hover:border-amber-700'"
            >
              {{ appStore.isWatchingNpc(npc.id) ? '★ 关注中' : '☆ 关注' }}
            </button>
          </div>
          <div class="text-slate-400">{{ formatRealm(npc.realm) }} · {{ formatGender(npc.gender) }}</div>
          <div v-if="npcPersonality" class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300">{{ npcPersonality.name }}</span>
            <span class="text-xs text-slate-500">{{ npcPersonality.description }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400">好感度</span>
            <div class="flex-1 bg-slate-700 h-2 rounded-full max-w-[120px]">
              <div class="h-2 rounded-full transition-all"
                :class="favorability >= 0 ? 'bg-green-500' : 'bg-red-500'"
                :style="{ width: Math.abs(favorability) + '%' }"></div>
            </div>
            <span class="text-xs text-slate-300">{{ favorability }}</span>
          </div>
          <div class="text-xs italic text-slate-500 pt-1">"{{ npcGreeting?.text ?? '道友有何贵干？' }}"</div>
        </div>

        <div v-if="showTradeDenied" class="p-3 rounded text-sm bg-red-900/50 text-red-300">
          对方对你戒心极重，拒绝与你交易。
          <button @click="showTradeDenied = false" class="ml-2 underline text-xs">关闭</button>
        </div>

        <div v-if="message" class="p-3 rounded text-sm bg-green-900/50 text-green-300">{{ message }}</div>

        <div v-if="!interactionDone" class="grid grid-cols-2 gap-3 max-w-[300px]">
          <button @click="handleDuel"
            class="px-4 py-3 bg-emerald-700 text-white rounded text-sm font-semibold hover:bg-emerald-600">切磋</button>
          <button @click="handleDiscuss"
            class="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded text-sm">论道</button>
          <button @click="handleTrade"
            :disabled="!canTrade"
            class="px-4 py-3 rounded text-sm font-semibold"
            :class="canTrade ? 'bg-amber-700 text-white hover:bg-amber-600' : 'bg-slate-700 text-slate-500 cursor-not-allowed'">
            交易
          </button>
          <button @click="openBrain"
            class="px-4 py-3 bg-indigo-800 hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-300 rounded text-sm font-semibold transition-colors cursor-pointer">
            观察大脑
          </button>
          <button @click="handleLeave"
            class="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded text-sm text-slate-400">离开</button>
        </div>
        <div v-else class="pt-2">
          <button @click="handleLeave"
            class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">离开</button>
        </div>
      </div>

      <!-- 大脑观察器 -->
      <div v-else-if="subView === 'brain'" class="space-y-4">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-amber-200 text-lg font-semibold">{{ npc.name }} · 大脑观察器</h3>
            <p class="text-xs text-slate-500 mt-1">上帝模式可限制行为手段，但不会删除其动机、目标、计划与记忆。</p>
          </div>
          <button @click="backToInteract"
            class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 rounded text-xs transition-colors cursor-pointer">
            返回互动
          </button>
        </div>

        <div v-if="!worldNpc?.brain || !brainInspection" class="p-4 bg-slate-800 rounded text-sm text-slate-400">
          此人物尚未建立可观察的大脑档案。
        </div>

        <template v-else>
          <section class="grid grid-cols-2 gap-3 text-xs">
            <div class="bg-slate-800 rounded p-3">
              <div class="text-slate-500">当前目标</div>
              <div class="text-slate-100 mt-1">{{ worldNpc.brain.currentGoal?.kind ?? '暂无明确目标' }}</div>
              <div class="text-slate-500 mt-1">优先级 {{ worldNpc.brain.currentGoal?.priority ?? 0 }}</div>
            </div>
            <div class="bg-slate-800 rounded p-3">
              <div class="text-slate-500">当前行动建议</div>
              <div class="text-emerald-300 mt-1">{{ brainInspection.decision.selected?.label ?? '未找到合适行动' }}</div>
              <div class="text-slate-500 mt-1">{{ brainInspection.decision.selected ? `得分 ${brainInspection.decision.selected.score}` : brainInspection.decision.commitEligibility.reasonCode }}</div>
            </div>
          </section>

          <section class="bg-slate-800 rounded p-3 space-y-2 text-xs">
            <h4 class="text-slate-200 font-semibold">身份装配</h4>
            <div class="flex flex-wrap gap-2">
              <span class="px-2 py-1 rounded bg-cyan-950 text-cyan-300">肉身 {{ speciesLabel(worldNpc.identity?.bodySpeciesId) }}</span>
              <span v-for="culture in worldNpc.identity?.cultureIds ?? []" :key="culture"
                class="px-2 py-1 rounded bg-violet-950 text-violet-300">文化 {{ culture }}</span>
              <span v-for="identity in worldNpc.identity?.socialIdentityIds ?? []" :key="identity"
                class="px-2 py-1 rounded bg-slate-700 text-slate-300">身份 {{ identity }}</span>
            </div>
          </section>

          <section class="space-y-2">
            <div class="flex items-center justify-between">
              <h4 class="text-sm text-slate-200 font-semibold">行为节点</h4>
              <span class="text-xs text-slate-500">候选 {{ brainInspection.decision.candidates.length }} · 抑制 {{ brainInspection.decision.rejected.length }}</span>
            </div>
            <div class="space-y-2">
              <article v-for="node in brainNodes" :key="node.nodeId"
                class="rounded border p-3 text-xs"
                :class="node.selected ? 'border-emerald-700 bg-emerald-950/30' : 'border-slate-700 bg-slate-800'">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium" :class="node.enabled ? 'text-slate-100' : 'text-slate-500'">{{ node.label }}</span>
                      <span v-if="node.selected" class="px-1.5 py-0.5 rounded bg-emerald-800 text-emerald-100">当前选择</span>
                    </div>
                    <div class="text-slate-500 mt-1">{{ sourceLabel(node.source, node.sourceId) }}</div>
                    <div v-if="node.reason" class="text-rose-300 mt-1">受抑制：{{ node.reason }}</div>
                    <div v-else-if="node.considerations" class="text-slate-400 mt-1">
                      目标 {{ node.considerations.goalFit }} · 机会 {{ node.considerations.opportunity }} · 紧迫 {{ node.considerations.urgency }} · 性格 {{ node.considerations.profileFit }}
                    </div>
                  </div>
                  <button
                    type="button"
                    :aria-label="`${node.enabled ? '关闭' : '启用'}${node.label}节点`"
                    :aria-pressed="node.enabled"
                    @click="toggleBrainNode(node.nodeId, !node.enabled)"
                    class="shrink-0 px-2.5 py-1 rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 transition-colors cursor-pointer"
                    :class="node.enabled ? 'border-emerald-700 text-emerald-300 hover:bg-emerald-950' : 'border-slate-600 text-slate-400 hover:bg-slate-700'">
                    {{ node.enabled ? '已启用' : '已关闭' }}
                  </button>
                </div>
              </article>
            </div>
          </section>

          <section class="grid grid-cols-2 gap-3 text-xs">
            <div class="bg-slate-800 rounded p-3 space-y-2">
              <h4 class="text-slate-200 font-semibold">当前计划</h4>
              <div v-if="worldNpc.brain.currentPlan" class="space-y-1">
                <div class="text-slate-300">{{ worldNpc.brain.currentPlan.status }} · 步骤 {{ worldNpc.brain.currentPlan.currentStepIndex + 1 }}/{{ worldNpc.brain.currentPlan.steps.length }}</div>
                <div v-for="step in worldNpc.brain.currentPlan.steps" :key="step.stepId" class="text-slate-500">
                  {{ step.status }} · {{ step.capabilityId }}
                </div>
              </div>
              <div v-else class="text-slate-500">暂无跨月计划</div>
            </div>
            <div class="bg-slate-800 rounded p-3 space-y-2">
              <h4 class="text-slate-200 font-semibold">认知与记忆</h4>
              <div class="text-slate-400">信念 {{ brainInspection.beliefCount }} 条 · 记忆 {{ brainInspection.memoryCount }} 条</div>
              <div v-for="memory in worldNpc.brain.memories.slice(-3).reverse()" :key="memory.memoryId" class="text-slate-500">
                {{ memory.at.year }}年{{ memory.at.month }}月 · {{ memory.summary }}
              </div>
            </div>
          </section>

          <section class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div class="bg-slate-800 rounded p-3 space-y-2">
              <h4 class="text-slate-200 font-semibold">情绪状态</h4>
              <div class="grid grid-cols-2 gap-2 text-slate-400">
                <span>恐惧 {{ worldNpc.brain.emotion.fear }}</span>
                <span>愤怒 {{ worldNpc.brain.emotion.anger }}</span>
                <span>悲伤 {{ worldNpc.brain.emotion.grief }}</span>
                <span>依恋 {{ worldNpc.brain.emotion.attachment }}</span>
                <span>压力 {{ worldNpc.brain.emotion.stress }}</span>
              </div>
              <div v-if="worldNpc.brain.currentAction" class="pt-2 border-t border-slate-700 text-slate-400">
                当前行动：{{ worldNpc.brain.currentAction.capabilityId }} · {{ worldNpc.brain.currentAction.status }}
                <span v-if="worldNpc.brain.currentAction.failureReason" class="block text-rose-300 mt-1">
                  失败归因：{{ worldNpc.brain.currentAction.failureReason }}
                </span>
              </div>
            </div>
            <div class="bg-slate-800 rounded p-3 space-y-2">
              <h4 class="text-slate-200 font-semibold">关键认知</h4>
              <div v-if="Object.keys(worldNpc.brain.beliefs).length === 0" class="text-slate-500">尚无可展示的个人认知</div>
              <div v-for="belief in Object.values(worldNpc.brain.beliefs).sort((a, b) => b.confidence - a.confidence).slice(0, 5)"
                :key="belief.beliefId" class="border-l-2 border-slate-600 pl-2 text-slate-400">
                <div>{{ belief.topic }} · {{ belief.subject.entityId }} · {{ belief.value }}</div>
                <div class="text-slate-500">可信度 {{ Math.round(belief.confidence * 100) }}% · {{ belief.status }} · 来源 {{ belief.source.type }}</div>
              </div>
            </div>
          </section>
        </template>
      </div>

      <!-- 交易子视图 -->
      <div v-else class="space-y-4">
        <div class="flex justify-between items-center">
          <h3 class="text-amber-300 text-lg font-semibold">与 {{ npc.name }} 交易</h3>
          <span class="text-sm text-slate-400">灵石: {{ playerStore.character?.spiritStones ?? 0 }}</span>
        </div>
        <div class="text-xs text-slate-500 flex gap-4">
          <span>对方修为: {{ formatRealm(npc.realm) }}</span>
          <span>对方预算: {{ npcOffer?.budget ?? 0 }} 灵石</span>
        </div>

        <div v-if="message" class="p-3 rounded text-sm bg-green-900/50 text-green-300">{{ message }}</div>

        <!-- NPC 出售区 -->
        <section>
          <h4 class="text-sm font-semibold text-slate-300 mb-2">对方出售</h4>
          <div v-if="npcSelling.length === 0" class="text-sm text-slate-500">对方暂无物品出售</div>
          <div class="grid grid-cols-2 gap-3">
            <div v-for="mi in npcSelling" :key="mi.item.id"
              class="bg-slate-800 rounded p-3 space-y-1">
              <div class="font-medium text-sm text-slate-100">{{ mi.item.name }}</div>
              <div class="text-xs text-slate-400">
                {{ formatItemType(mi.item.type) }} · {{ mi.item.tier }}阶
                <span v-if="mi.item.quality" class="ml-1 text-amber-400">{{ formatQuality(mi.item.quality) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-sm text-amber-300">{{ mi.basePrice }} 灵石</span>
                <button @click="handleBuy(mi)"
                  class="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs">购买 ({{ mi.count }})</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 玩家卖出区 -->
        <section>
          <h4 class="text-sm font-semibold text-slate-300 mb-2">出售给 {{ npc.name }}</h4>
          <div v-if="playerSellable.length === 0 && playerUnsellable.length === 0" class="text-sm text-slate-500">背包为空</div>
          <div class="space-y-2">
            <div v-for="s in playerSellable" :key="s.item.id"
              class="bg-slate-800 rounded p-3 flex justify-between items-center">
              <div>
                <span class="font-medium text-sm text-slate-100">{{ s.item.name }}</span>
                <span class="text-xs text-slate-400 ml-2">×{{ s.count }}</span>
              </div>
              <button @click="handleSell(s)"
                :disabled="npcOffer === null || (npcOffer?.budget ?? 0) <= 0"
                class="px-3 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed">卖出</button>
            </div>
            <div v-for="s in playerUnsellable" :key="s.item.id"
              class="bg-slate-800/50 rounded p-3 flex justify-between items-center opacity-50">
              <div>
                <span class="font-medium text-sm text-slate-100">{{ s.item.name }}</span>
                <span class="text-xs text-slate-400 ml-2">×{{ s.count }}</span>
                <span class="text-xs text-red-400 ml-2">对方不感兴趣</span>
              </div>
              <button disabled class="px-3 py-1 bg-slate-700 rounded text-xs cursor-not-allowed">不可卖出</button>
            </div>
          </div>
        </section>

        <button @click="backToInteract"
          class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm">返回</button>
      </div>
    </template>
  </div>
</template>
