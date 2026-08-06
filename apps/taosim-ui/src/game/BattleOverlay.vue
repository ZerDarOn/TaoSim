<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';
import { useGameFlowStore } from '@/stores/game-flow';
import { useEventLogStore } from '@/stores/event-log';
import { useCombat } from '@/composables/useCombat';
import HexCanvas from '@/components/HexCanvas.vue';
import ATBBar from '@/components/ATBBar.vue';
import SkillPanel from '@/components/SkillPanel.vue';
import type { Character, Skill } from '@taosim/contracts';
import { MapGenerator, resolveBattleOutcome } from '@taosim/engine';
import type { BattleOutcome } from '@taosim/engine';

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

const { state, start, setPaused, movePlayer, selectSkill, attackTarget, endTurn } = useCombat(
  battleMap.value,
  player.value.id,
  playerClone.value,
  [enemy.value],
);

// 放置角色
state.engine!.placeCharacter(player.value.id, 1, 1);
state.engine!.placeCharacter(enemy.value.id, 4, 4);

const charList = computed(() =>
  Object.values(state.characters).map(c => ({
    id: c.id,
    name: c.name,
    hp: Math.max(0, c.hp),
    maxHp: c.maxHp,
    isPlayer: c.id === player.value.id,
  })),
);

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

// 检测战斗是否结束
function checkBattleEnd() {
  const playerChar = state.characters[player.value.id];
  const enemyChar = state.characters[enemy.value.id];
  if (!playerChar || !enemyChar) return;

  const playerDown = playerChar.hp <= 0;
  const enemyDown = enemyChar.hp <= 0;

  if (playerDown || enemyDown) {
    pauseBattle();
    const outcome = resolveBattleOutcome(playerChar, [enemyChar], battleConfig.value.type);
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
    setTimeout(() => {
      gameFlow.enterGameOver();
    }, 2000);
  }
}

function onTileClick(q: number, r: number) {
  if (state.phase === 'targeting') {
    const tile = state.engine!.getMap().tiles[`${q},${r}`];
    if (tile && tile.occupantId && tile.occupantId !== player.value.id) {
      attackTarget(tile.occupantId);
      setTimeout(checkBattleEnd, 100);
    }
  } else {
    movePlayer(q, r);
  }
}

function onSkillSelect(skill: Skill) {
  selectSkill(skill);
}

function onEndTurn() {
  endTurn();
  setTimeout(checkBattleEnd, 600);
}

function closeBattle() {
  uiStore.endBattle();
}

onMounted(() => {
  start();
});

// 战斗结束：暂停 ATB 推进
function pauseBattle() {
  setPaused(true);
}

// NPC 回合后也检查
watch(() => state.currentTurn, (newTurn) => {
  if (newTurn === null && !showResult.value) {
    setTimeout(checkBattleEnd, 200);
  }
});
</script>

<template>
  <!-- 全屏遮罩 -->
  <div class="fixed inset-0 z-50 bg-slate-900 flex flex-col">
    <!-- 顶部标题栏 -->
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
      <div class="flex-1 flex flex-col items-center justify-center">
        <HexCanvas
          :map="state.map"
          :player-id="player.id"
          :view-radius="Math.max(2, Math.floor(player.attributes.perception / 2))"
          :characters="state.characters"
          @tile-click="onTileClick"
        />
        <div class="text-xs text-slate-500 mt-2 text-center">
          <template v-if="state.phase === 'targeting'">
            点击目标施放技能
          </template>
          <template v-else-if="state.currentTurn === player.id">
            移动点剩余 {{ state.movePoints }}/{{ state.maxMovePoints }} · 点击空地移动，再攻击或结束回合
          </template>
          <template v-else>
            行动条蓄力中，等待行动…
          </template>
        </div>
      </div>

      <!-- 右侧面板 -->
      <div class="w-72 space-y-3 flex flex-col">
        <ATBBar :characters="charList" :current-turn="state.currentTurn" :atb="state.atb" />
        <SkillPanel
          :skills="availableSkills"
          :selected-id="state.selectedSkill?.id ?? null"
          :phase="state.phase"
          @select="onSkillSelect"
          @cancel="state.phase = 'idle'; state.selectedSkill = null"
        />
        <button
          v-if="state.currentTurn === player.id && state.phase === 'idle'"
          @click="onEndTurn"
          class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-md font-semibold text-sm transition"
        >
          结束回合
        </button>

        <!-- 战斗日志 -->
        <div class="bg-slate-800 rounded-lg border border-slate-700 p-3 flex-1 overflow-y-auto min-h-[100px]">
          <h3 class="text-xs font-semibold text-slate-400 mb-2">战斗日志</h3>
          <div
            v-for="(line, i) in state.log.slice(-20)"
            :key="i"
            class="text-xs text-slate-300 leading-relaxed"
          >
            {{ line }}
          </div>
          <div v-if="state.log.length === 0" class="text-xs text-slate-600">等待行动...</div>
        </div>
      </div>
    </div>

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
