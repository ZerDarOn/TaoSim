<script setup lang="ts">
import { ref, computed } from 'vue';
import { CharacterFactory, SpiritRootRoller, rollTraits, BIRTH_STORIES, TRANSMIGRATION_STORY } from '@taosim/engine';
import type { ArrivalMode } from '@taosim/engine';
import { usePlayerStore } from '@/stores/player';
import { useAppStore } from '@/stores/app';
import { useGameFlowStore } from '@/stores/game-flow';
import type { SpiritRoot, GameMode, Gender, Trait } from '@taosim/contracts';

const playerStore = usePlayerStore();
const appStore = useAppStore();
const gameFlow = useGameFlowStore();

type Step = 'mode' | 'arrival' | 'background' | 'attributes' | 'spiritRoot' | 'traits' | 'confirm';
const currentStep = ref<Step>('mode');

const stepLabels: Record<Step, string> = {
  mode: '模式', arrival: '降临', background: '出身', attributes: '属性',
  spiritRoot: '灵根', traits: '天赋', confirm: '确认',
};

// Step 1: 模式
const gameMode = ref<GameMode>({ breakthrough: 'Simple', saveMode: 'Free' });

// Step 2: 家世 + 性别 + 姓名
const playerName = ref('');
const playerGender = ref<Gender>('Male');

const backgrounds = [
  { id: 'orphan' as const, name: '天孤散修', cost: 0, refund: 5, desc: '无依无靠，但天道垂怜，额外获赠 5 点自由属性' },
  { id: 'small-clan' as const, name: '修仙小族', cost: 5, refund: 0, desc: '家族底蕴尚浅，但有一阶灵脉洞府与基础功法' },
  { id: 'ancient-clan' as const, name: '荒古世家', cost: 12, refund: 0, desc: '底蕴深厚，自带上乘功法、灵蕴法宝与宗门靠山' },
];
const selectedBackground = ref(backgrounds[0]!);

// 天道点数
const INITIAL_POINTS = 25;
const heavenPoints = ref(INITIAL_POINTS);

function selectBackground(bg: typeof backgrounds[number]) {
  // 退还之前的选择
  heavenPoints.value += selectedBackground.value.cost - selectedBackground.value.refund;
  selectedBackground.value = bg;
  heavenPoints.value -= bg.cost - bg.refund;
}

// Step 3: 属性分配
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
  physique: '影响 HP 上限与防御成长',
  comprehension: '影响修为获取速度与功法参悟',
  perception: '影响命中、暴击与感知范围',
  agility: '影响闪避与先手顺序',
  luck: '影响奇遇触发率与物品掉落',
  charm: '影响 NPC 好感初始值与交易折扣',
};

const allocatedPoints = computed(() =>
  Object.values(attributes.value).reduce((s, v) => s + (v - ATTR_BASE), 0)
);

function addAttr(key: keyof typeof attributes.value) {
  if (heavenPoints.value <= 0) return;
  if (attributes.value[key] >= 20) return;
  attributes.value[key]++;
  heavenPoints.value--;
}

function removeAttr(key: keyof typeof attributes.value) {
  if (attributes.value[key] <= 1) return;
  attributes.value[key]--;
  heavenPoints.value++;
}

// Step 4: 灵根
const spiritRoot = ref<SpiritRoot | null>(null);
const spiritRootRolled = ref(false);

const gradeLabels: Record<string, string> = {
  Heaven: '天灵根', Earth: '地灵根', Profound: '玄灵根', Yellow: '黄灵根',
};
const elementLabels: Record<string, string> = {
  Metal: '金', Wood: '木', Water: '水', Fire: '火', Earth: '土',
  Thunder: '雷', Ice: '冰', Wind: '风', Dark: '暗',
};

function rollSpiritRoot() {
  if (spiritRootRolled.value) {
    // 重 roll 消耗 3 点
    if (heavenPoints.value < 3) return;
    heavenPoints.value -= 3;
  }
  spiritRoot.value = SpiritRootRoller.roll();
  spiritRootRolled.value = true;
}

// Step 5: 天赋词条
const rolledTraits = ref<Trait[]>([]);
const lockTrait = ref<boolean[]>([false, false, false]);

const qualityColors: Record<string, string> = {
  Red: 'text-red-500', Orange: 'text-orange-500', Purple: 'text-purple-600',
  Blue: 'text-blue-500', Green: 'text-green-600',
};
const qualityLabels: Record<string, string> = {
  Red: '神', Orange: '仙', Purple: '圣', Blue: '良', Green: '凡',
};

function rollInnateTraits() {
  if (rolledTraits.value.length > 0) {
    // 刷新消耗 2 点
    if (heavenPoints.value < 2) return;
    heavenPoints.value -= 2;
  }
  const fresh = rollTraits(3);
  // 保留锁定的
  rolledTraits.value = fresh.map((t, i) => lockTrait.value[i] ? rolledTraits.value[i]! : t);
}

function toggleLock(i: number) {
  if (!rolledTraits.value[i]) return;
  if (!lockTrait.value[i]) {
    // 锁定消耗 3 点
    if (heavenPoints.value < 3) return;
    heavenPoints.value -= 3;
  } else {
    // 解锁退还
    heavenPoints.value += 3;
  }
  lockTrait.value[i] = !lockTrait.value[i];
}

// Step 6: 确认
function confirmCreate() {
  if (!playerName.value || !spiritRoot.value) return;

  const lockedTraitIds = rolledTraits.value
    .filter((_, i) => lockTrait.value[i])
    .map(t => t.id);

  const character = CharacterFactory.create({
    name: playerName.value,
    gender: playerGender.value,
    background: selectedBackground.value.id,
    attributes: { ...attributes.value },
    innateTraits: lockedTraitIds,
    spiritRoot: spiritRoot.value,
    gameMode: gameMode.value,
  });

  playerStore.setPlayer(character);
  appStore.initialize(character.id);
  gameFlow.enterPlaying();
}

function canProceed(): boolean {
  switch (currentStep.value) {
    case 'mode': return true;
    case 'background': return !!playerName.value;
    case 'attributes': return true;
    case 'spiritRoot': return spiritRoot.value !== null;
    case 'traits': return true;
    default: return true;
  }
}

function nextStep() {
  const order: Step[] = ['mode', 'background', 'attributes', 'spiritRoot', 'traits', 'confirm'];
  const idx = order.indexOf(currentStep.value);
  if (idx < order.length - 1) currentStep.value = order[idx + 1]!;
}

function prevStep() {
  const order: Step[] = ['mode', 'background', 'attributes', 'spiritRoot', 'traits', 'confirm'];
  const idx = order.indexOf(currentStep.value);
  if (idx > 0) currentStep.value = order[idx - 1]!;
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8">
    <h1 class="text-2xl font-display text-ink mb-2">天道降临 · 创角</h1>
    <div class="text-sm text-gold mb-6">天道点数：{{ heavenPoints }}</div>

    <!-- 进度指示 -->
    <div class="flex gap-2 mb-8 text-sm flex-wrap">
      <span
        v-for="(label, key) in stepLabels"
        :key="key"
        :class="[
          'px-3 py-1 rounded-full transition whitespace-nowrap',
          currentStep === key ? 'bg-jade text-white' : 'bg-surface-muted text-muted'
        ]"
      >{{ label }}</span>
    </div>

    <!-- Step 1: 模式选择 -->
    <div v-if="currentStep === 'mode'" class="space-y-6">
      <div>
        <h3 class="text-lg font-semibold mb-3">突破模式</h3>
        <div class="grid grid-cols-2 gap-4">
          <button
            @click="gameMode.breakthrough = 'Simple'"
            :class="['p-4 rounded-lg border-2 text-left', gameMode.breakthrough === 'Simple' ? 'border-jade bg-jade-soft' : 'border-line']"
          >
            <div class="font-semibold">简单突破</div>
            <div class="text-xs text-ink-soft mt-1">纯修为+丹药即可突破，适合体验剧情</div>
          </button>
          <button
            @click="gameMode.breakthrough = 'Traditional'"
            :class="['p-4 rounded-lg border-2 text-left', gameMode.breakthrough === 'Traditional' ? 'border-jade bg-jade-soft' : 'border-line']"
          >
            <div class="font-semibold">传统突破</div>
            <div class="text-xs text-ink-soft mt-1">需秘境材料方可渡劫，硬核修仙体验</div>
          </button>
        </div>
      </div>
      <div>
        <h3 class="text-lg font-semibold mb-3">存档模式</h3>
        <div class="grid grid-cols-2 gap-4">
          <button
            @click="gameMode.saveMode = 'Free'"
            :class="['p-4 rounded-lg border-2 text-left', gameMode.saveMode === 'Free' ? 'border-jade bg-jade-soft' : 'border-line']"
          >
            <div class="font-semibold">自由存档</div>
            <div class="text-xs text-ink-soft mt-1">随时手动存读档，从容试错</div>
          </button>
          <button
            @click="gameMode.saveMode = 'Ironman'"
            :class="['p-4 rounded-lg border-2 text-left', gameMode.saveMode === 'Ironman' ? 'border-jade bg-jade-soft' : 'border-line']"
          >
            <div class="font-semibold">铁人模式</div>
            <div class="text-xs text-ink-soft mt-1">月度自动存档，不可手动 S/L，一步一抉择</div>
          </button>
        </div>
      </div>
      <button @click="nextStep" class="px-6 py-2 bg-jade text-white rounded-md font-semibold">下一步</button>
    </div>

    <!-- Step 2: 家世 + 性别 + 姓名 -->
    <div v-if="currentStep === 'background'" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm text-ink-soft mb-1">道号</label>
          <input
            v-model="playerName"
            type="text"
            placeholder="输入你的道号..."
            class="w-full px-4 py-2 border border-line rounded-md bg-surface focus:outline-none focus:border-jade"
          />
        </div>
        <div>
          <label class="block text-sm text-ink-soft mb-1">性别</label>
          <div class="flex gap-2">
            <button
              v-for="g in (['Male', 'Female', 'Other'] as Gender[])"
              :key="g"
              @click="playerGender = g"
              :class="['px-4 py-2 rounded-md text-sm border', playerGender === g ? 'border-jade bg-jade-soft text-jade' : 'border-line text-ink-soft']"
            >{{ { Male: '男', Female: '女', Other: '其他' }[g] }}</button>
          </div>
        </div>
      </div>
      <h3 class="text-lg font-semibold pt-2">选择家世</h3>
      <div class="grid grid-cols-3 gap-4">
        <button
          v-for="bg in backgrounds"
          :key="bg.id"
          @click="selectBackground(bg)"
          :class="[
            'p-4 rounded-lg border-2 text-left transition',
            selectedBackground.id === bg.id ? 'border-jade bg-jade-soft' : 'border-line hover:border-jade-soft'
          ]"
        >
          <div class="font-semibold">{{ bg.name }}</div>
          <div class="text-xs" :class="bg.cost > heavenPoints + selectedBackground.cost ? 'text-danger' : 'text-muted'">
            {{ bg.cost === 0 ? `返还 ${bg.refund} 点` : `消耗 ${bg.cost} 点` }}
          </div>
          <div class="text-sm mt-2 text-ink-soft">{{ bg.desc }}</div>
        </button>
      </div>
      <div class="pt-4 flex gap-3">
        <button @click="prevStep" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button @click="nextStep" :disabled="!playerName" class="px-6 py-2 bg-jade text-white rounded-md font-semibold disabled:opacity-50">下一步</button>
      </div>
    </div>

    <!-- Step 3: 属性分配 -->
    <div v-if="currentStep === 'attributes'" class="space-y-4">
      <p class="text-sm text-ink-soft">分配天道点数到六维属性（基础各 3，上限 20）</p>
      <div v-for="(value, key) in attributes" :key="key" class="flex items-center gap-4">
        <div class="w-16">
          <span class="text-sm font-semibold">{{ attrLabels[key] }}</span>
        </div>
        <button @click="removeAttr(key as keyof typeof attributes)" class="w-8 h-8 border border-line rounded text-ink-soft">-</button>
        <span class="w-8 text-center font-mono">{{ value }}</span>
        <button @click="addAttr(key as keyof typeof attributes)" :disabled="heavenPoints <= 0" class="w-8 h-8 border border-line rounded text-ink-soft disabled:opacity-30">+</button>
        <span class="text-xs text-muted flex-1">{{ attrDescriptions[key] }}</span>
      </div>
      <div class="text-sm">已分配 {{ allocatedPoints }} 点 | 剩余 <span class="text-gold font-bold">{{ heavenPoints }}</span> 点</div>
      <div class="pt-4 flex gap-3">
        <button @click="prevStep" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button @click="nextStep" class="px-6 py-2 bg-jade text-white rounded-md font-semibold">下一步</button>
      </div>
    </div>

    <!-- Step 4: 灵根抽取 -->
    <div v-if="currentStep === 'spiritRoot'" class="space-y-4">
      <h3 class="text-lg font-semibold">灵根测试</h3>
      <p class="text-sm text-ink-soft">灵根决定修炼效率。首次免费，重 roll 消耗 3 点天道点数。</p>
      <div v-if="spiritRoot" class="bg-surface p-6 rounded-lg border border-line text-center space-y-3">
        <div class="text-2xl font-display" :class="spiritRoot.grade === 'Heaven' ? 'text-gold' : spiritRoot.grade === 'Earth' ? 'text-purple-600' : 'text-ink'">
          {{ gradeLabels[spiritRoot.grade] }}
          <span v-if="spiritRoot.isVariant" class="text-red-500 text-sm">（变异）</span>
        </div>
        <div class="text-lg">
          <span
            v-for="el in spiritRoot.elements"
            :key="el"
            class="inline-block mx-1 px-3 py-1 rounded-full bg-surface-muted text-sm font-semibold"
          >{{ elementLabels[el] }}灵根</span>
        </div>
        <div class="text-xs text-muted">
          {{ spiritRoot.isVariant ? '变异灵根，威力强大，修炼效率额外提升' : '' }}
          {{ spiritRoot.elements.length === 1 ? '单灵根，精纯无比' : spiritRoot.elements.length === 2 ? '双灵根，中规中矩' : '三灵根，属性混杂' }}
        </div>
      </div>
      <div class="flex gap-3">
        <button v-if="!spiritRootRolled" @click="rollSpiritRoot" class="px-6 py-2 bg-gold text-white rounded-md font-semibold">测试灵根</button>
        <button v-else @click="rollSpiritRoot" :disabled="heavenPoints < 3" class="px-4 py-2 border border-gold text-gold rounded-md text-sm disabled:opacity-30">
          重新测试（消耗 3 点）
        </button>
      </div>
      <div class="pt-4 flex gap-3">
        <button @click="prevStep" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button @click="nextStep" :disabled="!spiritRoot" class="px-6 py-2 bg-jade text-white rounded-md font-semibold disabled:opacity-50">下一步</button>
      </div>
    </div>

    <!-- Step 5: 天赋赌词条 -->
    <div v-if="currentStep === 'traits'" class="space-y-4">
      <h3 class="text-lg font-semibold">先天气运（赌词条）</h3>
      <p class="text-sm text-ink-soft">刷新消耗 2 点，锁定每条 3 点。词条含正负效果，慎重抉择。</p>
      <div class="grid grid-cols-3 gap-4">
        <div
          v-for="(trait, i) in rolledTraits"
          :key="i"
          :class="[
            'p-4 rounded-lg border text-center space-y-2',
            lockTrait[i] ? 'border-gold bg-gold-soft' : 'border-line bg-surface'
          ]"
        >
          <div :class="['font-semibold', qualityColors[trait.quality]]">{{ trait.name }}</div>
          <div class="text-xs text-muted">〔{{ qualityLabels[trait.quality] }}阶〕</div>
          <div class="text-xs text-ink-soft">{{ trait.description }}</div>
          <button
            v-if="trait"
            @click="toggleLock(i)"
            :class="[
              'px-2 py-0.5 rounded text-[10px] font-semibold',
              lockTrait[i] ? 'bg-gold text-white' : 'border border-line text-muted'
            ]"
          >{{ lockTrait[i] ? '已锁定' : '锁定(3点)' }}</button>
        </div>
      </div>
      <div class="flex gap-3">
        <button v-if="rolledTraits.length === 0" @click="rollInnateTraits" class="px-6 py-2 bg-gold text-white rounded-md font-semibold">开始赌词条</button>
        <button v-else @click="rollInnateTraits" :disabled="heavenPoints < 2" class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold disabled:opacity-30">
          刷新未锁定词条（2点）
        </button>
      </div>
      <div class="pt-4 flex gap-3">
        <button @click="prevStep" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button @click="nextStep" class="px-6 py-2 bg-jade text-white rounded-md font-semibold">下一步</button>
      </div>
    </div>

    <!-- Step 6: 确认 -->
    <div v-if="currentStep === 'confirm'" class="space-y-4">
      <h3 class="text-lg font-semibold">确认创角</h3>
      <div class="bg-surface p-6 rounded-lg border border-line space-y-3">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-muted">道号：</span><span class="font-semibold">{{ playerName }}</span></div>
          <div><span class="text-muted">性别：</span>{{ { Male: '男', Female: '女', Other: '其他' }[playerGender] }}</div>
          <div><span class="text-muted">家世：</span>{{ selectedBackground.name }}</div>
          <div><span class="text-muted">突破：</span>{{ gameMode.breakthrough === 'Simple' ? '简单' : '传统' }}</div>
          <div><span class="text-muted">存档：</span>{{ gameMode.saveMode === 'Free' ? '自由' : '铁人' }}</div>
        </div>
        <div class="pt-2 border-t border-line">
          <div class="text-sm font-semibold mb-2">灵根</div>
          <div v-if="spiritRoot" class="text-sm">
            {{ gradeLabels[spiritRoot.grade] }}{{ spiritRoot.isVariant ? '（变异）' : '' }} —
            <span v-for="el in spiritRoot.elements" :key="el">{{ elementLabels[el] }}</span>
          </div>
        </div>
        <div class="pt-2 border-t border-line">
          <div class="text-sm font-semibold mb-2">属性</div>
          <div class="grid grid-cols-3 gap-2 text-sm">
            <div v-for="(val, key) in attributes" :key="key">
              <span class="text-muted">{{ attrLabels[key] }}：</span>{{ val }}
            </div>
          </div>
        </div>
        <div v-if="rolledTraits.some((_, i) => lockTrait[i])" class="pt-2 border-t border-line">
          <div class="text-sm font-semibold mb-2">锁定词条</div>
          <div class="flex flex-wrap gap-2">
            <span
              v-for="(trait, i) in rolledTraits"
              :key="i"
              v-show="lockTrait[i]"
              :class="['text-sm px-2 py-0.5 rounded', qualityColors[trait.quality]]"
            >{{ trait.name }}</span>
          </div>
        </div>
      </div>
      <div class="pt-4 flex gap-3">
        <button @click="prevStep" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button
          @click="confirmCreate"
          :disabled="!playerName || !spiritRoot"
          class="px-6 py-2 bg-gold text-white rounded-md font-semibold disabled:opacity-50"
        >降临大千世界</button>
      </div>
    </div>
  </div>
</template>
