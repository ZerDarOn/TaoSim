<script setup lang="ts">
import { ref } from 'vue';

// 创角步骤
type Step = 'background' | 'attributes' | 'luck' | 'confirm';

const currentStep = ref<Step>('background');
const playerName = ref('');

// 家世选项
const backgrounds = [
  { id: 'orphan', name: '天孤散修', cost: 0, desc: '无家族背景，额外获赠 5 点自由属性点', bonus: 5 },
  { id: 'small-clan', name: '修仙小族', cost: 4, desc: '自带一阶灵脉洞府与基础资源', bonus: 0 },
  { id: 'ancient-clan', name: '荒古世家', cost: 10, desc: '自带上乘功法、极品法宝与宗门靠山', bonus: 0 },
];

const selectedBackground = ref(backgrounds[0]!);

// 属性分配
const totalPoints = ref(15);
const attributes = ref({
  physique: 3,     // 根骨
  comprehension: 3, // 悟性
  perception: 3,    // 神识
  agility: 3,       // 身法
  luck: 3,          // 气运
});

const remainingPoints = ref(totalPoints.value - 15);

function addAttribute(key: keyof typeof attributes.value) {
  if (remainingPoints.value <= 0) return;
  attributes.value[key]++;
  remainingPoints.value--;
}

function removeAttribute(key: keyof typeof attributes.value) {
  if (attributes.value[key] <= 1) return;
  attributes.value[key]--;
  remainingPoints.value++;
}

// 先天气运词条（赌词条）
const innateTraits = ref<string[]>([
  '暂无词条，点击刷新',
  '暂无词条，点击刷新',
  '暂无词条，点击刷新',
]);

const lockTrait = ref<boolean[]>([false, false, false]);

function rerollTraits() {
  const pool = [
    '剑道奇才', '重瞳', '先天道体', '天生神力', '丹道天才',
    '阵道奇才', '天煞孤星', '五行灵体', '瞳术天才', '万法归宗',
  ];
  innateTraits.value = innateTraits.value.map((_, i) =>
    lockTrait.value[i] ? innateTraits.value[i]! : pool[Math.floor(Math.random() * pool.length)]!
  );
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8">
    <h1 class="text-2xl font-display text-ink mb-8">天道降临 · 创角</h1>

    <!-- 进度指示 -->
    <div class="flex gap-4 mb-8 text-sm">
      <span
        v-for="(step, name) in { background: '家世', attributes: '属性', luck: '气运', confirm: '确认' }"
        :key="step"
        :class="[
          'px-3 py-1 rounded-full transition',
          currentStep === name ? 'bg-jade text-white' : 'bg-surface-muted text-muted'
        ]"
      >
        {{ step }}
      </span>
    </div>

    <!-- 步骤 1：家世选择 -->
    <div v-if="currentStep === 'background'" class="space-y-4">
      <div class="mb-4">
        <label class="block text-sm text-ink-soft mb-1">道号</label>
        <input
          v-model="playerName"
          type="text"
          placeholder="输入你的道号..."
          class="w-full max-w-sm px-4 py-2 border border-line rounded-md bg-surface focus:outline-none focus:border-jade"
        />
      </div>
      <h3 class="text-lg font-semibold">选择家世</h3>
      <div class="grid grid-cols-3 gap-4">
        <button
          v-for="bg in backgrounds"
          :key="bg.id"
          @click="selectedBackground = bg"
          :class="[
            'p-4 rounded-lg border-2 text-left transition',
            selectedBackground.id === bg.id
              ? 'border-jade bg-jade-soft'
              : 'border-line hover:border-jade-soft'
          ]"
        >
          <div class="font-semibold">{{ bg.name }}</div>
          <div class="text-xs text-muted">{{ bg.cost }} 点数</div>
          <div class="text-sm mt-2 text-ink-soft">{{ bg.desc }}</div>
        </button>
      </div>
      <div class="pt-4">
        <button
          @click="currentStep = 'attributes'"
          class="px-6 py-2 bg-jade text-white rounded-md font-semibold"
        >
          下一步
        </button>
      </div>
    </div>

    <!-- 步骤 2：属性分配 -->
    <div v-if="currentStep === 'attributes'" class="space-y-4">
      <div class="text-sm text-ink-soft mb-2">
        剩余点数：<span class="font-bold text-jade">{{ remainingPoints }}</span>
      </div>
      <div v-for="(value, key) in attributes" :key="key" class="flex items-center gap-4">
        <span class="w-20 text-sm font-semibold">
          {{ { physique: '根骨', comprehension: '悟性', perception: '神识', agility: '身法', luck: '气运' }[key] }}
        </span>
        <button @click="removeAttribute(key as keyof typeof attributes)" class="w-8 h-8 border border-line rounded text-ink-soft">-</button>
        <span class="w-8 text-center font-mono">{{ value }}</span>
        <button @click="addAttribute(key as keyof typeof attributes)" class="w-8 h-8 border border-line rounded text-ink-soft">+</button>
        <div class="flex-1 bg-surface-muted h-2 rounded-full">
          <div class="bg-jade h-2 rounded-full transition-all" :style="{ width: ((value ?? 0) / 10) * 100 + '%' }"></div>
        </div>
      </div>
      <div class="pt-4 flex gap-3">
        <button @click="currentStep = 'background'" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button @click="currentStep = 'luck'" class="px-6 py-2 bg-jade text-white rounded-md font-semibold">下一步</button>
      </div>
    </div>

    <!-- 步骤 3：赌气运 -->
    <div v-if="currentStep === 'luck'" class="space-y-4">
      <h3 class="text-lg font-semibold">先天气运（赌词条）</h3>
      <p class="text-sm text-ink-soft">消耗天道点数可锁定词条或刷新</p>
      <div class="grid grid-cols-3 gap-4">
        <div v-for="(trait, i) in innateTraits" :key="i" class="bg-surface p-4 rounded-lg border border-line text-center">
          <div class="text-sm font-semibold mb-2">{{ trait }}</div>
          <label class="text-xs text-muted cursor-pointer">
            <input type="checkbox" v-model="lockTrait[i]" class="mr-1" />
            锁定
          </label>
        </div>
      </div>
      <button @click="rerollTraits" class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold">
        消耗天道点数刷新
      </button>
      <div class="pt-4 flex gap-3">
        <button @click="currentStep = 'attributes'" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button @click="currentStep = 'confirm'" class="px-6 py-2 bg-jade text-white rounded-md font-semibold">下一步</button>
      </div>
    </div>

    <!-- 步骤 4：确认 -->
    <div v-if="currentStep === 'confirm'" class="space-y-4">
      <h3 class="text-lg font-semibold">确认创角</h3>
      <div class="bg-surface p-6 rounded-lg border border-line space-y-2">
        <div><span class="text-muted">道号：</span><span class="font-semibold">{{ playerName || '未设置' }}</span></div>
        <div><span class="text-muted">家世：</span><span class="font-semibold">{{ selectedBackground!.name }}</span></div>
        <div><span class="text-muted">根骨：</span>{{ attributes.physique }} | <span class="text-muted">悟性：</span>{{ attributes.comprehension }} | <span class="text-muted">神识：</span>{{ attributes.perception }}</div>
        <div><span class="text-muted">身法：</span>{{ attributes.agility }} | <span class="text-muted">气运：</span>{{ attributes.luck }}</div>
        <div><span class="text-muted">先天气运：</span>{{ innateTraits.filter((_, i) => lockTrait[i]).join('、') || '无' }}</div>
      </div>
      <div class="pt-4 flex gap-3">
        <button @click="currentStep = 'luck'" class="px-6 py-2 border border-line rounded-md">返回</button>
        <button class="px-6 py-2 bg-gold text-white rounded-md font-semibold" disabled>
          降临大千世界（待接入引擎）
        </button>
      </div>
    </div>
  </div>
</template>
