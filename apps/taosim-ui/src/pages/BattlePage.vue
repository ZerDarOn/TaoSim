<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { useCombat } from '@/composables/useCombat';
import HexCanvas from '@/components/HexCanvas.vue';
import ATBBar from '@/components/ATBBar.vue';
import SkillPanel from '@/components/SkillPanel.vue';
import type { Character, Skill } from '@taosim/contracts';
import { MapGenerator } from '@taosim/engine';

const router = useRouter();
const playerStore = usePlayerStore();

if (!playerStore.character) {
  router.replace('/');
}

const player = playerStore.character!;

function buildEnemy(): Character {
  return {
    id: 'ENEMY_1',
    name: '散修·张三',
    gender: 'Male',
    realm: 'QiRefinement_3',
    soulState: 'Active',
    cultivation: { currentExp: 50, maxExp: 150 },
    lifespan: { age: 32, maxLifespan: 100 },
    spiritEnergy: { current: 80, max: 80 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 6, comprehension: 4, perception: 5, agility: 7, luck: 3 },
    hp: 120, maxHp: 120, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: {
      weapon: { id: 'w_enemy', name: '铁剑', tier: 1, type: 'Equipment', attributes: { attack: 12 } },
      armor: undefined,
      treasures: [],
    },
    skills: [
      {
        id: 's_enemy1', name: '斩击', quality: 'Huang', type: 'Active',
        primitives: [], cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 0,
      },
    ],
    skillCooldowns: {},
    traits: [],
    relations: {},
    wantedLevels: {},
  } as Character;
}

const testMap = MapGenerator.generate({
  id: 'forest_cave', name: '密林洞窟', continentId: 'c1',
  coordinates: { x: 0, y: 0 }, type: 'Dungeon', tier: 2, travelCostDays: 3,
  battleMapConfig: { baseTerrain: 'Forest', clusterDensity: 0.6, hazardProbability: 0.1 },
});

const enemy = buildEnemy();
const { state, tick, movePlayer, selectSkill, attackTarget, endTurn } = useCombat(testMap, player.id, player, [enemy]);

state.engine!.placeCharacter(player.id, 1, 1);
state.engine!.placeCharacter(enemy.id, 4, 4);

const charList = computed(() =>
  Object.values(state.characters).map(c => ({
    id: c.id,
    name: c.name,
    hp: c.hp,
    maxHp: c.maxHp,
    isPlayer: c.id === player.id,
  }))
);

const availableSkills = computed(() => {
  return player.skills.filter(s => {
    const cd = player.skillCooldowns[s.id];
    return (!cd || cd <= 0) && player.spiritEnergy.current >= s.cost.spiritEnergy && player.ap >= s.cost.ap;
  });
});

function onTileClick(q: number, r: number) {
  if (state.phase === 'targeting') {
    const tile = state.engine!.getMap().tiles[`${q},${r}`];
    if (tile && tile.occupantId && tile.occupantId !== player.id) {
      attackTarget(tile.occupantId);
    }
  } else {
    movePlayer(q, r);
  }
}

function onSkillSelect(skill: Skill) {
  selectSkill(skill);
}

onMounted(() => {
  tick();
});
</script>

<template>
  <div class="flex gap-4 p-4 max-w-[1200px] mx-auto">
    <!-- 主画布 -->
    <div class="flex-1 space-y-3">
      <HexCanvas
        :map="testMap"
        :player-id="player.id"
        :view-radius="state.characters[player.id]?.attributes?.perception ?? 3"
        @tile-click="onTileClick"
      />
      <div class="text-xs text-muted text-center">
        {{ state.phase === 'targeting' ? '点击目标施放技能' : '点击空地移动（范围3格）' }}
      </div>
    </div>

    <!-- 右侧面板 -->
    <div class="w-72 space-y-3">
      <ATBBar :characters="charList" :current-turn="state.currentTurn" />
      <SkillPanel
        :skills="availableSkills"
        :selected-id="state.selectedSkill?.id ?? null"
        :phase="state.phase"
        @select="onSkillSelect"
        @cancel="state.phase = 'idle'; state.selectedSkill = null"
      />
      <button
        v-if="state.currentTurn === player.id && state.phase === 'idle'"
        @click="endTurn"
        class="w-full px-4 py-2 bg-gold text-white rounded-md font-semibold text-sm"
      >
        结束回合
      </button>

      <!-- 战斗日志 -->
      <div class="bg-surface rounded-lg border border-line p-3 max-h-48 overflow-y-auto">
        <h3 class="text-xs font-semibold text-ink-soft mb-2">战斗日志</h3>
        <div
          v-for="(line, i) in state.log.slice(-20)"
          :key="i"
          class="text-xs text-ink-soft leading-relaxed"
        >
          {{ line }}
        </div>
        <div v-if="state.log.length === 0" class="text-xs text-muted">等待行动...</div>
      </div>
    </div>
  </div>
</template>
