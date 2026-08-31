<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { useGameFlowStore } from '@/stores/game-flow';
import { useEventLogStore } from '@/stores/event-log';
import { useBattleEngine } from '@/composables/useBattleEngine';
import { useBattleUI } from '@/composables/useBattleUI';
import HexCanvas from '@/components/HexCanvas.vue';
import BattleStatusPanel from '@/components/BattleStatusPanel.vue';
import BattleLog from '@/components/BattleLog.vue';
import BattleCommandBar from '@/components/BattleCommandBar.vue';
import type { Character } from '@taosim/contracts';
import type { WorldOutcome, EntityDelta } from '@taosim/contracts';
import { MapGenerator, resolveBattleOutcome, commitOutcome, createNpcBattleEntityDelta } from '@taosim/engine';
import type { BattleOutcome } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import { formatRealm, formatSpiritRootGrade, formatSpiritElement } from '@/utils/i18n-game';

const timers: number[] = [];
function later(fn: () => void, ms: number) {
  timers.push(window.setTimeout(fn, ms));
}

const playerStore = usePlayerStore();
const uiStore = useUiStore();
const gameFlow = useGameFlowStore();
const eventLog = useEventLogStore();

const player = computed(() => playerStore.character!);
const battleConfig = computed(() => uiStore.battleConfig!);
const enemy = computed(() => battleConfig.value.enemy);

// 战斗结果
const battleResult = ref<BattleOutcome | null>(null);
const showResult = ref(false);

// 战斗地图：根据敌人 tier 生成
const battleMap = computed(() => {
  const tier = enemy.value.attributes ? Math.max(1, Math.floor(enemy.value.maxHp / 40)) : 2;
  return MapGenerator.generate({
    id: `battle_${Date.now()}`,
    name: battleConfig.value.title,
    continentId: 'battle',
    coordinates: { x: 0, y: 0 },
    type: 'Dungeon',
    tier,
    travelCostDays: 0,
    battleMapConfig: { baseTerrain: 'Forest', clusterDensity: 0.5, hazardProbability: 0.1 },
  });
});

// 玩家副本（战斗中修改的是副本，不直接影响 store）
const playerClone = computed<Character>(() => ({
  ...player.value,
  skills: [...player.value.skills],
  skillCooldowns: { ...player.value.skillCooldowns },
}));

function stableBattleSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// NB4：生产 UI 固定使用唯一 BattleEngine；旧 useCombat 只保留回归测试，不再参与正式玩法。
const battleId = battleConfig.value.sceneId
  ?? `battle:${player.value.id}:${enemy.value.id}:${Date.now()}`;
const combat = useBattleEngine(
  battleMap.value,
  player.value.id,
  playerClone.value,
  [enemy.value],
  {
    fleeEnabled: true,
    surrenderEnabled: battleConfig.value.type === 'duel',
  },
  { seed: stableBattleSeed(battleId), battleId },
);
const { state, start, setPaused } = combat;
const ui = useBattleUI(combat, player.value.id);

// 悬停详情（设计文档 §6.4）
const hoverInfo = ref<{ q: number; r: number; characterId?: string } | null>(null);
const hoverCharacter = computed(() =>
  hoverInfo.value?.characterId ? state.characters[hoverInfo.value.characterId] ?? null : null,
);

/** 灵根展示：品阶 + 五行，如"黄阶·火" */
function spiritRootLabel(c: Character): string {
  const elements = c.spiritRoot?.elements?.length
    ? c.spiritRoot.elements.map(formatSpiritElement).join('/')
    : '无';
  return `${formatSpiritRootGrade(c.spiritRoot?.grade ?? 'Yellow')}阶·${elements}`;
}

const availableSkills = computed(() => {
  const p = state.characters[player.value.id];
  if (!p) return [];
  return p.skills.filter(s => {
    const cd = p.skillCooldowns[s.id];
    return (!cd || cd <= 0)
      && p.spiritEnergy.current >= s.cost.spiritEnergy
      && p.ap >= s.cost.ap;
  });
});

const currentActor = computed(() =>
  state.currentTurn ? state.characters[state.currentTurn] ?? null : null,
);

// 检测战斗是否结束
function checkBattleEnd() {
  if (showResult.value) return;
  const playerChar = state.characters[player.value.id];
  const enemyChar = state.characters[enemy.value.id];
  if (!playerChar || !enemyChar) return;

  const playerDown = playerChar.hp <= 0;
  const enemyDown = enemyChar.hp <= 0;
  const engineState = state.engine?.getState();
  const engineEnded = engineState?.phase === 'BattleEnd';

  if (playerDown || enemyDown || engineEnded) {
    pauseBattle();
    const fledEntityId = engineState?.fledBy;
    const forcedWinner = engineState?.winner
      ?? (fledEntityId === enemyChar.id ? 'Player' : fledEntityId === playerChar.id ? 'Enemy' : undefined);
    const outcome = resolveBattleOutcome(playerChar, [enemyChar], battleConfig.value.type, {
      forcedWinner,
      rewardsAllowed: engineState?.endReason !== 'flee',
    });
    battleResult.value = outcome;
    showResult.value = true;

    // 回写结果到 playerStore
    applyOutcome(outcome);
  }
}

function applyOutcome(outcome: BattleOutcome) {
  if (!playerStore.character) return;
  const c = playerStore.character;

  // 更新 HP
  c.hp = outcome.playerHpAfter;

  if (outcome.victory) {
    // 经验
    c.cultivation.currentExp += outcome.expGained;
    // 灵石
    if (outcome.spiritStonesGained > 0) {
      c.spiritStones += outcome.spiritStonesGained;
    }
    // 好感度（切磋）
    if (outcome.favorabilityChange > 0 && enemy.value.id in c.relations) {
      c.relations[enemy.value.id]!.favorability += outcome.favorabilityChange;
    }
    // 战斗日志
    const rewards: string[] = [];
    if (outcome.expGained > 0) rewards.push(`经验 +${outcome.expGained}`);
    if (outcome.spiritStonesGained > 0) rewards.push(`灵石 +${outcome.spiritStonesGained}`);
    eventLog.addEvent('combat', `战斗胜利 · ${enemy.value.name}`, rewards.join('，'), {
      isMajorEvent: battleConfig.value.type === 'duel',
    });
  } else {
    eventLog.addEvent('combat', `战斗失利 · ${enemy.value.name}`, battleConfig.value.type === 'encounter' ? '不幸陨落' : '切磋落败', {
      isMajorEvent: outcome.shouldGameOver,
    });
  }

  // GameOver
  if (outcome.shouldGameOver) {
    later(() => {
      gameFlow.enterGameOver();
    }, 2000);
  }

  // S5b：如果敌人来自世界 NPC，回写 WorldOutcome 到 worldState
  if (battleConfig.value.enemyNpcId) {
    const appStore = useAppStore();
    const worldState = appStore.currentWorldState;
    if (worldState) {
      const enemyNpcId = battleConfig.value.enemyNpcId;

      const enemyAfter = state.characters[enemy.value.id];
      const enemyDelta: EntityDelta = enemyAfter
        ? createNpcBattleEntityDelta({
            entityId: enemyNpcId,
            characterAfter: enemyAfter,
            kind: battleConfig.value.type === 'duel' ? 'duel' : 'deadly',
            now: { year: worldState.currentYear, month: worldState.currentMonth },
            killedBy: playerStore.character!.id,
          })
        : { entityId: enemyNpcId };

      if (outcome.victory) {
        // 灵石转移：玩家赢得灵石 = NPC 失去灵石
        enemyDelta.spiritStonesDelta = -(outcome.spiritStonesGained || 0);

        // NPC 的伤势/死亡已由统一差量函数按实际战后状态生成。
      }
      // 玩家失败不转移奖励；NPC 若在交战中受伤，仍按真实战后状态回写。

      // 战斗状态、世界结算和事实共用同一个场景 ID，保证一战一事实、可幂等重放。
      const sceneId = battleId;
      const worldOutcome: WorldOutcome = {
        outcomeId: sceneId,
        baseRevision: worldState.worldRevision ?? 0,
        source: battleConfig.value.type === 'duel' ? 'duel' : 'encounter',
        entityDeltas: [enemyDelta],
        facts: [{
          factId: `fact_${sceneId}`,
          outcomeId: sceneId,
          type: 'battle',
          at: { year: worldState.currentYear, month: worldState.currentMonth },
          participants: [
            { entityId: playerStore.character!.id, role: 'attacker' },
            { entityId: enemyNpcId, role: 'defender' },
          ],
          title: outcome.victory ? `击败 ${enemy.value.name}` : `败于 ${enemy.value.name}`,
          description: battleConfig.value.description,
          visibility: 'local',
        }],
      };

      const result = commitOutcome(worldState, worldOutcome);
      if (result.status === 'version_conflict') {
        // eslint-disable-next-line no-console
        console.warn('[BattleOverlay] WorldOutcome 版本冲突', result);
      } else if (result.status === 'validation_failed') {
        // eslint-disable-next-line no-console
        console.warn('[BattleOverlay] WorldOutcome 校验失败', {
          sceneId, reason: result.reason, enemyNpcId,
        });
      }
    }
  }
}

// 地图点击：右键取消（HexCanvas 发 -1 哨兵）；其余交 useBattleUI 分发
function onTileClick(q: number, r: number) {
  if (q === -1 && r === -1) { ui.cancel(); return; }
  ui.onTileClick(q, r);
  later(checkBattleEnd, 100);
}

function onTileHover(info: { q: number; r: number; characterId?: string } | null) {
  hoverInfo.value = info;
}

function onEndTurn() {
  ui.endTurnCmd();
  later(checkBattleEnd, 600);
}

function onFlee() {
  const r = ui.fleeCmd(battleConfig.value.type);
  if (r === 'success') {
    closeBattle();
  } else if (r === 'escape-hit') {
    later(() => {
      checkBattleEnd();              // 防一击致死漏结算
      if (!showResult.value) closeBattle();
    }, 200);
  } else {
    later(checkBattleEnd, 100);      // hit/caught 免费攻击后可能致死
  }
}

function onEsc(e: KeyboardEvent) {
  if (e.key === 'Escape') ui.cancel();
}

function closeBattle() {
  uiStore.endBattle();
}

onMounted(() => {
  start();
  window.addEventListener('keydown', onEsc);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onEsc);
  for (const t of timers) window.clearTimeout(t);
  timers.length = 0;
});

// 战斗结束：暂停 ATB 推进
function pauseBattle() {
  setPaused(true);
}

// NPC 回合后也检查
watch(() => state.currentTurn, (newTurn) => {
  if (newTurn === null && !showResult.value) {
    later(checkBattleEnd, 200);
  }
});
</script>

<template>
  <!-- 全屏遮罩 -->
  <div class="fixed inset-0 z-50 bg-slate-900 flex flex-col">
    <!-- 顶部状态条 -->
    <div class="flex items-center justify-between px-6 py-3 bg-slate-800 border-b border-slate-700">
      <div>
        <h2 class="text-lg font-bold text-amber-200">{{ battleConfig.title }}</h2>
        <p class="text-xs text-slate-400">{{ battleConfig.description }}</p>
      </div>
      <div v-if="battleConfig.type === 'duel'"
        class="text-xs text-slate-400 px-3 py-1 bg-slate-700 rounded-full">
        切磋（点到为止）
      </div>
      <div v-else
        class="text-xs text-red-300 px-3 py-1 bg-red-900/50 rounded-full">
        生死搏杀
      </div>
    </div>

    <!-- 战斗区域 -->
    <div class="flex-1 flex gap-4 p-4 overflow-hidden">
      <!-- 主画布 -->
      <div class="flex-1 relative flex flex-col items-center justify-center">
        <HexCanvas
          :map="state.map"
          :player-id="player.id"
          :view-radius="Math.max(2, Math.floor(player.attributes.perception / 2))"
          :characters="state.characters"
          :move-range="ui.moveRange.value"
          :attack-range="ui.attackRange.value"
          :selected-tile="hoverInfo ? { q: hoverInfo.q, r: hoverInfo.r } : null"
          :floating-texts="ui.floatingTexts.value"
          @tile-click="onTileClick"
          @tile-hover="onTileHover"
          @floating-text-done="ui.removeFloatingText"
        />
        <div class="text-xs text-slate-500 mt-2 text-center">
          <template v-if="ui.phase.value === 'moving'">
            移动点剩余 {{ state.movePoints }}/{{ state.maxMovePoints }} · 点击绿色格子移动，Esc/右键取消
          </template>
          <template v-else-if="ui.phase.value === 'targeting-attack' || ui.phase.value === 'targeting-skill'">
            点击红色高亮目标发动攻击，Esc/右键取消
          </template>
          <template v-else-if="state.currentTurn === player.id">
            移动点剩余 {{ state.movePoints }}/{{ state.maxMovePoints }} · 请选择命令
          </template>
          <template v-else>
            行动条蓄力中，等待行动…
          </template>
        </div>

        <!-- 目标悬停详情（设计文档 §6.4） -->
        <div v-if="hoverCharacter"
          class="absolute top-2 left-2 z-10 bg-slate-800/95 border border-slate-600 rounded-lg px-3 py-2 text-xs space-y-1 pointer-events-none w-60">
          <div class="font-bold" :class="hoverCharacter.id === player.id ? 'text-amber-300' : 'text-red-300'">
            {{ hoverCharacter.name }}
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">境界</span>
            <span class="text-slate-200">{{ formatRealm(hoverCharacter.realm) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">灵根</span>
            <span class="text-slate-200">{{ spiritRootLabel(hoverCharacter) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">气血</span>
            <span class="text-slate-200">{{ Math.max(0, Math.ceil(hoverCharacter.hp)) }}/{{ hoverCharacter.maxHp }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-400">灵力</span>
            <span class="text-slate-200">{{ hoverCharacter.spiritEnergy.current }}/{{ hoverCharacter.spiritEnergy.max }}</span>
          </div>
          <div v-if="hoverCharacter.skills.length" class="pt-1 border-t border-slate-700 space-y-0.5">
            <div v-for="s in hoverCharacter.skills" :key="s.id" class="flex justify-between text-slate-300">
              <span>{{ s.name }}</span>
              <span v-if="(hoverCharacter.skillCooldowns[s.id] ?? 0) > 0" class="text-amber-300">冷却 {{ hoverCharacter.skillCooldowns[s.id] }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧栏 -->
      <div class="w-80 space-y-3 flex flex-col">
        <BattleStatusPanel
          :characters="state.characters"
          :atb="state.atb"
          :current-turn="state.currentTurn"
        />
        <BattleLog :lines="state.log" />
      </div>
    </div>

    <!-- 底部命令栏 -->
    <BattleCommandBar
      :phase="ui.phase.value"
      :current-turn="state.currentTurn"
      :player-id="player.id"
      :actor="currentActor"
      :waiting-name="state.currentTurn && state.currentTurn !== player.id ? state.characters[state.currentTurn]?.name : undefined"
      :skills="availableSkills"
      :can-flee="ui.canFlee.value"
      @attack="ui.openAttack()"
      @skill="ui.openSkill($event)"
      @defend="ui.defendCmd()"
      @move="ui.openMove()"
      @end-turn="onEndTurn"
      @flee="onFlee"
      @cancel="ui.cancel()"
    />

    <!-- 战斗结果弹窗 -->
    <div
      v-if="showResult && battleResult"
      class="absolute inset-0 bg-black/80 flex items-center justify-center"
    >
      <div class="bg-slate-800 rounded-xl border border-slate-600 p-8 max-w-md w-full mx-4 space-y-4">
        <h2 class="text-2xl font-bold text-center"
          :class="battleResult.victory ? 'text-amber-300' : 'text-red-400'">
          {{ battleResult.victory ? '胜利！' : (battleConfig.type === 'duel' ? '惜败' : '陨落...') }}
        </h2>

        <div class="space-y-2 text-sm">
          <div v-if="battleResult.victory && battleResult.expGained > 0" class="text-emerald-300">
            修为 +{{ battleResult.expGained }}
          </div>
          <div v-if="battleResult.victory && battleResult.spiritStonesGained > 0" class="text-amber-300">
            灵石 +{{ battleResult.spiritStonesGained }}
          </div>
          <div v-if="battleResult.victory && battleResult.favorabilityChange > 0" class="text-sky-300">
            好感度 +{{ battleResult.favorabilityChange }}
          </div>
          <div v-if="!battleResult.victory && battleConfig.type === 'duel'" class="text-slate-400 text-xs">
            切磋点到为止，未伤及性命
          </div>
          <div v-if="battleResult.shouldGameOver" class="text-red-400 text-xs">
            你的修仙之路至此终结...
          </div>
        </div>

        <button
          v-if="!battleResult.shouldGameOver"
          @click="closeBattle"
          class="w-full px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-md font-semibold transition"
        >
          继续
        </button>
        <button
          v-else
          @click="closeBattle"
          class="w-full px-6 py-2 bg-red-800 hover:bg-red-700 text-white rounded-md font-semibold transition"
        >
          查看结局
        </button>
      </div>
    </div>
  </div>
</template>
