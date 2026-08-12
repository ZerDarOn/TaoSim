<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue';
import { CharacterFactory, SpiritRootRoller, rollTraits } from '@taosim/engine';
import { usePlayerStore } from '@/stores/player';
import { useAppStore } from '@/stores/app';
import { useGameFlowStore } from '@/stores/game-flow';
import type { SpiritRoot, GameMode, Gender, Trait } from '@taosim/contracts';

const playerStore = usePlayerStore();
const appStore = useAppStore();
const gameFlow = useGameFlowStore();

// ── 角色基础信息 ──
const playerName = ref('');           // 姓名（必填）
const aliasName = ref('');            // 道号（选填，不填则默认用姓名）
const playerGender = ref<Gender>('Male');
const playerBackground = ref('');     // 背景故事（选填）

// ── 游戏模式（折叠在侧边，不单独占一页）──
const gameMode = ref<GameMode>({ breakthrough: 'Simple', saveMode: 'Free' });

// ── 家世 ──
const backgrounds = [
  { id: 'orphan' as const, name: '天孤散修', cost: 0, refund: 5, desc: '无依无靠，天道垂怜 +5点' },
  { id: 'small-clan' as const, name: '修仙小族', cost: 5, refund: 0, desc: '家族底蕴尚浅' },
  { id: 'ancient-clan' as const, name: '荒古世家', cost: 12, refund: 0, desc: '底蕴深厚，资源丰富' },
];
const selectedBackground = ref(backgrounds[0]!);

// ── 天道点数 ──
const INITIAL_POINTS = 25;
const heavenPoints = ref(INITIAL_POINTS);

function selectBackground(bg: typeof backgrounds[number]) {
  heavenPoints.value += selectedBackground.value.cost - selectedBackground.value.refund;
  selectedBackground.value = bg;
  heavenPoints.value -= bg.cost - bg.refund;
}

// ── 六维属性 ──
const ATTR_BASE = 3;
const attributes = ref({
  physique: ATTR_BASE,
  comprehension: ATTR_BASE,
  perception: ATTR_BASE,
  agility: ATTR_BASE,
  luck: ATTR_BASE,
  charm: ATTR_BASE,
});

const attrLabels: Record<string, string> = {
  physique: '根骨', comprehension: '悟性', perception: '神识',
  agility: '身法', luck: '气运', charm: '仙姿',
};

const attrDescriptions: Record<string, string> = {
  physique: 'HP上限·防御', comprehension: '修为速度·功法', perception: '命中·暴击·感知',
  agility: '闪避·先手', luck: '奇遇·掉落', charm: '好感·交易',
};

const allocatedPoints = computed(() =>
  Object.values(attributes.value).reduce((s, v) => s + (v - ATTR_BASE), 0)
);

function addAttr(key: keyof typeof attributes.value) {
  if (heavenPoints.value <= 0 || attributes.value[key] >= 20) return;
  attributes.value[key]++;
  heavenPoints.value--;
}

function removeAttr(key: keyof typeof attributes.value) {
  if (attributes.value[key] <= 1) return;
  attributes.value[key]--;
  heavenPoints.value++;
}

// ── 灵根（侧边板块，内嵌显示）──
const spiritRoot = ref<SpiritRoot | null>(null);

const gradeLabels: Record<string, string> = {
  Heaven: '天灵根', Earth: '地灵根', Profound: '玄灵根', Yellow: '黄灵根',
};
const elementLabels: Record<string, string> = {
  Metal: '金', Wood: '木', Water: '水', Fire: '火', Earth: '土',
  Thunder: '雷', Ice: '冰', Wind: '风', Dark: '暗',
};

function rollSpiritRoot() {
  if (spiritRoot.value) {
    if (heavenPoints.value < 3) return;
    heavenPoints.value -= 3;
  }
  spiritRoot.value = SpiritRootRoller.roll();
}

// ── 词条（天赋）：roll 5个，免费选2个，多选花点数 ──
const rolledTraits = ref<Trait[]>([]);
const selectedTraitIndices = ref<Set<number>>(new Set());
const FREE_TRAIT_SLOTS = 2;
const EXTRA_TRAIT_COST = 5; // 每多选一个花5点

const qualityColors: Record<string, string> = {
  Red: 'text-red-500', Orange: 'text-orange-500', Purple: 'text-purple-600',
  Blue: 'text-blue-500', Green: 'text-green-600',
};
const qualityLabels: Record<string, string> = {
  Red: '神', Orange: '仙', Purple: '圣', Blue: '良', Green: '凡',
};

function rollInnateTraits() {
  // 如果已经有词条，退还已花费的额外点数
  const extraCount = Math.max(0, selectedTraitIndices.value.size - FREE_TRAIT_SLOTS);
  heavenPoints.value += extraCount * EXTRA_TRAIT_COST;
  rolledTraits.value = rollTraits(5);
  selectedTraitIndices.value.clear();
}

function toggleTrait(i: number) {
  if (!rolledTraits.value[i]) return;
  if (selectedTraitIndices.value.has(i)) {
    // 取消选中
    selectedTraitIndices.value.delete(i);
    // 如果是超出免费槽位的，退还点数
    if (selectedTraitIndices.value.size >= FREE_TRAIT_SLOTS) {
      heavenPoints.value += EXTRA_TRAIT_COST;
    }
  } else {
    // 选中
    const willBeExtra = selectedTraitIndices.value.size >= FREE_TRAIT_SLOTS;
    if (willBeExtra && heavenPoints.value < EXTRA_TRAIT_COST) return;
    if (willBeExtra) heavenPoints.value -= EXTRA_TRAIT_COST;
    selectedTraitIndices.value.add(i);
  }
  // 触发响应式
  selectedTraitIndices.value = new Set(selectedTraitIndices.value);
}

// 自动 roll 一次
watchEffect(() => {
  if (rolledTraits.value.length === 0) {
    rollInnateTraits();
  }
});

// ── 六维雷达图辅助 ──
const ATTR_ORDER = ['physique', 'comprehension', 'perception', 'agility', 'luck', 'charm'] as const;

function hexVertex(r: number, i: number): { x: number; y: number } {
  const angle = (Math.PI / 3) * i - Math.PI / 2;
  return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
}

function hexPoints(r: number): string {
  return Array.from({ length: 6 }, (_, i) => {
    const v = hexVertex(r, i);
    return `${v.x},${v.y}`;
  }).join(' ');
}

function attrIndex(key: string): number {
  return ATTR_ORDER.indexOf(key as typeof ATTR_ORDER[number]);
}

function attrPolygonPoints(): string {
  const vals = ATTR_ORDER.map(k => attributes.value[k] ?? 3);
  return vals.map((val, i) => {
    const r = (val / 20) * 90;
    const v = hexVertex(r, i);
    return `${v.x},${v.y}`;
  }).join(' ');
}

// ── 确认 ──
function canConfirm(): boolean {
  return !!playerName.value && !!spiritRoot.value;
}

function confirmCreate() {
  if (!canConfirm()) return;

  const finalName = aliasName.value || playerName.value;
  const selectedTraitIds = [...selectedTraitIndices.value]
    .map(i => rolledTraits.value[i]!.id);

  const character = CharacterFactory.create({
    name: finalName,
    gender: playerGender.value,
    background: selectedBackground.value.id,
    attributes: { ...attributes.value },
    innateTraits: selectedTraitIds,
    spiritRoot: spiritRoot.value!,
    gameMode: gameMode.value,
  });

  playerStore.setPlayer(character);
  gameFlow.enterGenerating();
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-2xl font-display text-jade">角色卡</h1>
      <div class="text-sm text-gold">天道点数：{{ heavenPoints }}</div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- ── 左侧：角色基本信息 + 属性 ── -->
      <div class="lg:col-span-2 space-y-6">
        <!-- 基本信息 -->
        <div class="bg-surface rounded-lg border border-line p-5 space-y-4">
          <h3 class="text-sm font-semibold text-muted uppercase tracking-wide">基本信息</h3>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs text-ink-soft mb-1">姓名 <span class="text-danger">*</span></label>
              <input
                v-model="playerName"
                type="text"
                placeholder="你的姓名"
                class="w-full px-3 py-2 border border-line rounded-md bg-surface focus:outline-none focus:border-jade text-sm"
              />
            </div>
            <div>
              <label class="block text-xs text-ink-soft mb-1">道号 <span class="text-muted">(选填)</span></label>
              <input
                v-model="aliasName"
                type="text"
                placeholder="江湖称呼，不填默认用姓名"
                class="w-full px-3 py-2 border border-line rounded-md bg-surface focus:outline-none focus:border-jade text-sm"
              />
            </div>
            <div>
              <label class="block text-xs text-ink-soft mb-1">性别</label>
              <div class="flex gap-2">
                <button
                  v-for="g in (['Male', 'Female', 'Other'] as Gender[])"
                  :key="g"
                  @click="playerGender = g"
                  :class="['px-3 py-1.5 rounded-md text-xs border', playerGender === g ? 'border-jade bg-jade-soft text-jade' : 'border-line text-ink-soft']"
                >{{ { Male: '男', Female: '女', Other: '其他' }[g] }}</button>
              </div>
            </div>
            <div>
              <label class="block text-xs text-ink-soft mb-1">家世</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  v-for="bg in backgrounds"
                  :key="bg.id"
                  @click="selectBackground(bg)"
                  :class="['px-3 py-1.5 rounded-md text-xs border', selectedBackground.id === bg.id ? 'border-gold bg-gold-soft text-gold' : 'border-line text-ink-soft']"
                >{{ bg.name }}</button>
              </div>
            </div>
          </div>
          <!-- 背景故事 -->
          <div>
            <label class="block text-xs text-ink-soft mb-1">背景故事 <span class="text-muted">(选填)</span></label>
            <textarea
              v-model="playerBackground"
              rows="2"
              placeholder="你从何处来？经历了什么？（可选，不影响数值）"
              class="w-full px-3 py-2 border border-line rounded-md bg-surface focus:outline-none focus:border-jade text-sm resize-none"
            ></textarea>
          </div>
        </div>

        <!-- 六维属性 + 雷达图 -->
        <div class="bg-surface rounded-lg border border-line p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-semibold text-muted uppercase tracking-wide">六维属性</h3>
            <span class="text-xs text-muted">已分配 {{ allocatedPoints }} | 剩余 <span class="text-gold font-bold">{{ heavenPoints }}</span></span>
          </div>

          <div class="grid grid-cols-2 gap-6">
            <!-- 属性控制 -->
            <div class="space-y-2">
              <div v-for="(value, key) in attributes" :key="key" class="flex items-center gap-3">
                <div class="w-12 text-xs font-semibold">{{ attrLabels[key] }}</div>
                <button @click="removeAttr(key as keyof typeof attributes)" class="w-6 h-6 border border-line rounded text-ink-soft text-xs">-</button>
                <span class="w-6 text-center font-mono text-sm font-bold">{{ value }}</span>
                <button @click="addAttr(key as keyof typeof attributes)" :disabled="heavenPoints <= 0" class="w-6 h-6 border border-line rounded text-ink-soft text-xs disabled:opacity-30">+</button>
                <span class="text-[10px] text-muted flex-1 truncate">{{ attrDescriptions[key] }}</span>
              </div>
            </div>

            <!-- 六维图（SVG 雷达图）-->
            <div class="flex items-center justify-center">
              <svg viewBox="-110 -110 220 220" class="w-32 h-32">
                <!-- 网格 -->
                <polygon
                  v-for="r in [30, 60, 90]"
                  :key="r"
                  :points="hexPoints(r)"
                  fill="none"
                  stroke="currentColor"
                  :stroke-width="0.5"
                  class="text-line"
                />
                <!-- 轴线 -->
                <line
                  v-for="i in 6"
                  :key="'axis' + i"
                  :x1="0" :y1="0"
                  :x2="hexVertex(90, i - 1).x"
                  :y2="hexVertex(90, i - 1).y"
                  stroke="currentColor"
                  :stroke-width="0.3"
                  class="text-line"
                />
                <!-- 数据多边形 -->
                <polygon
                  :points="attrPolygonPoints()"
                  fill="rgba(74, 158, 100, 0.2)"
                  stroke="#4a9e64"
                  :stroke-width="1.5"
                />
                <!-- 顶点标签 -->
                <text
                  v-for="(val, key) in attributes"
                  :key="'label' + key"
                  :x="hexVertex(105, attrIndex(key)).x"
                  :y="hexVertex(105, attrIndex(key)).y"
                  text-anchor="middle"
                  dominant-baseline="central"
                  class="fill-current text-[8px] text-ink-soft"
                >{{ attrLabels[key] }} {{ val }}</text>
              </svg>
            </div>
          </div>
        </div>

        <!-- 灵根 + 游戏模式 -->
        <div class="bg-surface rounded-lg border border-line p-5">
          <div class="grid grid-cols-2 gap-4">
            <!-- 灵根 -->
            <div>
              <h3 class="text-sm font-semibold text-muted uppercase tracking-wide mb-3">灵根</h3>
              <div v-if="spiritRoot" class="text-center space-y-1">
                <div class="text-lg font-display" :class="spiritRoot.grade === 'Heaven' ? 'text-gold' : spiritRoot.grade === 'Earth' ? 'text-purple-600' : 'text-ink'">
                  {{ gradeLabels[spiritRoot.grade] }}
                  <span v-if="spiritRoot.isVariant" class="text-red-500 text-xs">（变异）</span>
                </div>
                <div class="flex justify-center gap-1 flex-wrap">
                  <span
                    v-for="el in spiritRoot.elements"
                    :key="el"
                    class="px-2 py-0.5 rounded-full bg-surface-muted text-xs font-semibold"
                  >{{ elementLabels[el] }}</span>
                </div>
              </div>
              <div v-else class="text-xs text-muted text-center py-4">尚未测试</div>
              <button @click="rollSpiritRoot" :disabled="!!spiritRoot && heavenPoints < 3" class="mt-2 px-4 py-1.5 bg-gold text-white rounded-md text-xs font-semibold disabled:opacity-30 w-full">
                {{ spiritRoot ? (heavenPoints >= 3 ? '重测 (3点)' : '点数不足') : '测试灵根' }}
              </button>
            </div>
            <!-- 游戏模式 -->
            <div>
              <h3 class="text-sm font-semibold text-muted uppercase tracking-wide mb-3">游戏模式</h3>
              <div class="space-y-2">
                <div class="flex gap-1">
                  <button
                    @click="gameMode.breakthrough = 'Simple'"
                    :class="['flex-1 px-2 py-1 rounded text-xs border', gameMode.breakthrough === 'Simple' ? 'border-jade bg-jade-soft text-jade' : 'border-line text-ink-soft']"
                  >简单突破</button>
                  <button
                    @click="gameMode.breakthrough = 'Traditional'"
                    :class="['flex-1 px-2 py-1 rounded text-xs border', gameMode.breakthrough === 'Traditional' ? 'border-jade bg-jade-soft text-jade' : 'border-line text-ink-soft']"
                  >传统突破</button>
                </div>
                <div class="flex gap-1">
                  <button
                    @click="gameMode.saveMode = 'Free'"
                    :class="['flex-1 px-2 py-1 rounded text-xs border', gameMode.saveMode === 'Free' ? 'border-jade bg-jade-soft text-jade' : 'border-line text-ink-soft']"
                  >自由存档</button>
                  <button
                    @click="gameMode.saveMode = 'Ironman'"
                    :class="['flex-1 px-2 py-1 rounded text-xs border', gameMode.saveMode === 'Ironman' ? 'border-jade bg-jade-soft text-jade' : 'border-line text-ink-soft']"
                  >铁人模式</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── 右侧：词条 ── -->
      <div class="space-y-4">
        <div class="bg-surface rounded-lg border border-line p-5">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-muted uppercase tracking-wide">先天气运</h3>
            <button @click="rollInnateTraits" :disabled="heavenPoints < 0" class="text-xs text-gold hover:underline">
              重新roll
            </button>
          </div>
          <p class="text-xs text-muted mb-3">免费选 {{ FREE_TRAIT_SLOTS }} 个，多选每个花 {{ EXTRA_TRAIT_COST }} 点</p>

          <div class="space-y-2">
            <button
              v-for="(trait, i) in rolledTraits"
              :key="i"
              @click="toggleTrait(i)"
              :class="[
                'w-full p-3 rounded-lg border text-left transition',
                selectedTraitIndices.has(i)
                  ? 'border-gold bg-gold-soft'
                  : 'border-line hover:border-gold'
              ]"
            >
              <div class="flex items-center justify-between">
                <span :class="['font-semibold text-sm', qualityColors[trait.quality]]">{{ trait.name }}</span>
                <span class="text-xs text-muted">〔{{ qualityLabels[trait.quality] }}〕</span>
              </div>
              <div class="text-xs text-ink-soft mt-1">{{ trait.description }}</div>
              <div v-if="selectedTraitIndices.has(i)" class="text-xs text-gold mt-1">✓ 已选</div>
            </button>
          </div>
        </div>

        <!-- 确认按钮 -->
        <button
          @click="confirmCreate"
          :disabled="!canConfirm()"
          class="w-full px-6 py-3 bg-gold text-white rounded-md font-semibold disabled:opacity-50 transition text-lg"
        >降临大千世界</button>
        <p v-if="!playerName" class="text-xs text-danger text-center">请填写姓名</p>
        <p v-if="!spiritRoot" class="text-xs text-danger text-center">请测试灵根</p>
      </div>
    </div>
  </div>
</template>
