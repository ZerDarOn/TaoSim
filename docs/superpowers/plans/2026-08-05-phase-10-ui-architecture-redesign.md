# Phase 10 — UI 架构重构：单界面多面板体系 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将多页面路由架构重构为"单 GameScreen + 多面板 Tab 切换"架构，让游戏从网站导航变成沉浸式游戏体验。

**Architecture:** 新增 `game-flow` store 控制游戏阶段（title/creating/playing/gameover），新增 `ui` store 控制 GameScreen 内的 activeTab。`App.vue` 经 AppRoot 根据 `gameFlow.phase` 渲染对应顶层组件（MainTitleScreen / CreateCharacterPage / GameScreen / GameOverScreen）。路由简化为单一路由 `/`。现有 14 个页面按职责迁移为 GameScreen 内的 Panel 组件，去掉 `<router-link>` 改为 `uiStore.setTab(...)`。

**Tech Stack:** Vue 3.5 + TypeScript 5.7 + Pinia 2.2 + Vue Router 4.4 + TailwindCSS 3.4 + Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-05-phase-10-ui-architecture-redesign.md`

---

## 关键约束（所有 Task 共享）

1. **engine/contracts/persistence 包零改动**（除 Task 18 改 CharacterFactory 内部实现，不改签名）
2. **现有测试必须保持通过**——Phase 10 是纯 UI 重构，engine 层测试不受影响（除 Task 18 新增的 factory 测试）
3. **CreateCharacterPage 是 438 行的整页式多步向导**，保留为独立整页（不做成 Panel），仅在 phase='creating' 时渲染
4. **路由模式是 hash**（`createWebHashHistory`），简化后仍用 hash
5. **TRAIT_REGISTRY 用英文 id**（如 `TRAIT_SWORD_BONE`），而 CharacterFactory 旧的 TRAIT_TEMPLATES 用中文名 key——Task 18 要统一到 registry 体系，CreateCharacterPage 传 trait id 数组
6. **改了 engine 源码必须 rebuild dist**（`npm run build -w @taosim/engine`），否则 UI 引用会报 "No matching export" 错误
7. **迁移类 Task（11-16）必须完整搬运原 Page 的业务逻辑**，不能只留 TODO 占位——plan 里的 TODO 是写给执行者看的位置标记，最终代码必须包含完整的引擎调用

---

## File Structure

### 新增文件

| 文件 | 责任 |
|------|------|
| `apps/taosim-ui/src/stores/game-flow.ts` | 游戏阶段状态（title/creating/playing/gameover）+ deathMessage |
| `apps/taosim-ui/src/stores/ui.ts` | GameScreen 内 activeTab 状态 |
| `apps/taosim-ui/src/screens/MainTitleScreen.vue` | 创角前主菜单 |
| `apps/taosim-ui/src/screens/GameOverScreen.vue` | 死亡画面 |
| `apps/taosim-ui/src/AppRoot.vue` | 根据 gameFlow.phase 分发顶层组件 |
| `apps/taosim-ui/src/game/GameScreen.vue` | 唯一游戏界面骨架 |
| `apps/taosim-ui/src/game/TopBar.vue` | 顶部时间 + 推进控制 + 模式标识 |
| `apps/taosim-ui/src/game/LeftSidebar.vue` | 左侧角色状态常驻面板 |
| `apps/taosim-ui/src/game/EventLog.vue` | 右侧事件日志 |
| `apps/taosim-ui/src/game/BottomNav.vue` | 底部功能 Tab |
| `apps/taosim-ui/src/game/MainContent.vue` | 主交互区，根据 activeTab 渲染 Panel |
| `apps/taosim-ui/src/game/panels/MapPanel.vue` | 从 WorldPage 迁移 |
| `apps/taosim-ui/src/game/panels/CultivationPanel.vue` | 从 CultivationPage 迁移 |
| `apps/taosim-ui/src/game/panels/CraftingPanel.vue` | 从 CraftingPage + UpgradePage 迁移 |
| `apps/taosim-ui/src/game/panels/MarketPanel.vue` | 从 MarketPage 迁移 |
| `apps/taosim-ui/src/game/panels/NpcPanel.vue` | 从 NPCInteractionPage + NPCTradePage 迁移 |
| `apps/taosim-ui/src/game/panels/InventoryPanel.vue` | 从 InventoryPage 迁移 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `apps/taosim-ui/src/App.vue` | 简化为 RouterView（去掉 AppShell 包裹） |
| `apps/taosim-ui/src/router/routes.ts` | 简化为单路由 `/` |
| `apps/taosim-ui/src/composables/useWorld.ts` | 去掉 router.push('/game-over')，改用 gameFlowStore.enterGameOver() |
| `apps/taosim-ui/src/stores/app.ts` | 加 clearWorldState() action |
| `apps/taosim-ui/src/pages/CreateCharacterPage.vue` | 创角完成改为 gameFlow.enterPlaying()；traits 传 id 数组 |
| `packages/engine/src/character/character-factory.ts` | TRAIT_TEMPLATES → getTraitById；初始灵石按 background |

### 删除文件（Task 19）

`AppShell.vue`, `HomePage.vue`, `WorldPage.vue`, `CultivationPage.vue`, `CraftingPage.vue`, `UpgradePage.vue`, `MarketPage.vue`, `NPCInteractionPage.vue`, `NPCTradePage.vue`, `InventoryPage.vue`, `GameOverPage.vue`

### 保留不删

`CreateCharacterPage.vue`（仍被 AppRoot 引用）、`BattlePage.vue` / `FactionPage.vue` / `OverworldPage.vue`（不在 Phase 10 scope）

---

## Phase 10.1 — 基础架构

### Task 1: 创建 game-flow store

**Files:**
- Create: `apps/taosim-ui/src/stores/game-flow.ts`

- [ ] **Step 1: 创建 store 文件**

```typescript
// apps/taosim-ui/src/stores/game-flow.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type GamePhase = 'title' | 'creating' | 'playing' | 'gameover';

export const useGameFlowStore = defineStore('game-flow', () => {
  const phase = ref<GamePhase>('title');
  const deathMessage = ref<string | null>(null);

  function enterTitle() {
    phase.value = 'title';
    deathMessage.value = null;
  }

  function enterCreating() {
    phase.value = 'creating';
  }

  function enterPlaying() {
    phase.value = 'playing';
  }

  function enterGameOver(message?: string) {
    phase.value = 'gameover';
    if (message) deathMessage.value = message;
  }

  return { phase, deathMessage, enterTitle, enterCreating, enterPlaying, enterGameOver };
});
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/stores/game-flow.ts
git commit -m "feat(ui): add game-flow store for phase state management"
```

---

### Task 2: 创建 ui store

**Files:**
- Create: `apps/taosim-ui/src/stores/ui.ts`

- [ ] **Step 1: 创建 store 文件**

```typescript
// apps/taosim-ui/src/stores/ui.ts
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type GameTab = 'map' | 'cult' | 'craft' | 'market' | 'npc' | 'inv';

export const useUiStore = defineStore('ui', () => {
  const activeTab = ref<GameTab>('map');
  const charDetailOpen = ref(false);

  function setTab(tab: GameTab) {
    activeTab.value = tab;
  }

  function openCharDetail() {
    charDetailOpen.value = true;
  }

  function closeCharDetail() {
    charDetailOpen.value = false;
  }

  return { activeTab, charDetailOpen, setTab, openCharDetail, closeCharDetail };
});
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/stores/ui.ts
git commit -m "feat(ui): add ui store for active tab state"
```

---

### Task 3: 简化路由为单路由

**Files:**
- Modify: `apps/taosim-ui/src/router/routes.ts`

- [ ] **Step 1: 读取现有路由文件**

Run: 用 Read 工具读取 `apps/taosim-ui/src/router/routes.ts`

- [ ] **Step 2: 替换为单路由**

将整个文件内容替换为：

```typescript
import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'root',
    component: () => import('@/AppRoot.vue'),
    meta: { title: '大千修仙界' },
  },
];
```

- [ ] **Step 3: Commit（暂不 typecheck，AppRoot 还没建）**

```bash
git add apps/taosim-ui/src/router/routes.ts
git commit -m "refactor(ui): simplify routes to single root route"
```

---

### Task 4: 创建 AppRoot 分发组件

**Files:**
- Create: `apps/taosim-ui/src/AppRoot.vue`
- Modify: `apps/taosim-ui/src/App.vue`

- [ ] **Step 1: 创建 AppRoot.vue**

```vue
<!-- apps/taosim-ui/src/AppRoot.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useGameFlowStore } from '@/stores/game-flow';
import MainTitleScreen from '@/screens/MainTitleScreen.vue';
import CreateCharacterPage from '@/pages/CreateCharacterPage.vue';
import GameScreen from '@/game/GameScreen.vue';
import GameOverScreen from '@/screens/GameOverScreen.vue';

const gameFlow = useGameFlowStore();

const current = computed(() => {
  switch (gameFlow.phase) {
    case 'title':    return MainTitleScreen;
    case 'creating': return CreateCharacterPage;
    case 'playing':  return GameScreen;
    case 'gameover': return GameOverScreen;
  }
});
</script>

<template>
  <component :is="current" />
</template>
```

- [ ] **Step 2: 简化 App.vue**

读取 `apps/taosim-ui/src/App.vue`，替换为：

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>

<template>
  <RouterView />
</template>
```

- [ ] **Step 3: Commit（暂不 typecheck，引用的 screens 还没全建）**

```bash
git add apps/taosim-ui/src/AppRoot.vue apps/taosim-ui/src/App.vue
git commit -m "feat(ui): add AppRoot dispatcher based on game-flow phase"
```

---

### Task 5: 创建 MainTitleScreen（从 HomePage 迁移）

**Files:**
- Create: `apps/taosim-ui/src/screens/MainTitleScreen.vue`
- Reference: `apps/taosim-ui/src/pages/HomePage.vue`

- [ ] **Step 1: 读取 HomePage.vue 和 SaveLoadPanel.vue**

Run: 用 Read 工具读取这两个文件，确认 SaveLoadPanel 的 emits 和 HomePage 的"继续游戏"逻辑。

- [ ] **Step 2: 创建 MainTitleScreen.vue**

基于 HomePage，但：
- "开始新游戏"改为 `gameFlow.enterCreating()`（原 `router.push('/create-character')`）
- 读档成功后调 `gameFlow.enterPlaying()`

```vue
<!-- apps/taosim-ui/src/screens/MainTitleScreen.vue -->
<script setup lang="ts">
import { useGameFlowStore } from '@/stores/game-flow';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import SaveLoadPanel from '@/components/SaveLoadPanel.vue';

const gameFlow = useGameFlowStore();
const appStore = useAppStore();
const playerStore = usePlayerStore();

function startNewGame() {
  gameFlow.enterCreating();
}

async function continueGame(saveId: string) {
  await appStore.loadGame(saveId);
  if (playerStore.character) {
    gameFlow.enterPlaying();
  }
}
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-indigo-950 text-slate-100">
    <h1 class="text-6xl font-bold mb-4 text-amber-300">大千修仙界</h1>
    <p class="text-slate-400 mb-12">一入修仙深似海</p>

    <div class="flex flex-col gap-4 w-full max-w-md">
      <button
        class="px-8 py-3 bg-amber-600 hover:bg-amber-500 rounded text-lg font-semibold transition"
        @click="startNewGame"
      >
        开始新游戏
      </button>

      <SaveLoadPanel @load="continueGame" />
    </div>
  </div>
</template>
```

> **注意：** SaveLoadPanel 的实际 emit 事件名以 Step 1 读取结果为准。若不是 `@load`，按实际 emits 对齐。如果 SaveLoadPanel 内部已自治处理读档（直接调 appStore.loadGame），则 MainTitleScreen 只需监听读档成功事件后调 enterPlaying——可能需要 SaveLoadPanel 暴露一个"读档成功"emit，或在 MainTitleScreen 里 watch playerStore.character 变化。

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/screens/MainTitleScreen.vue
git commit -m "feat(ui): add MainTitleScreen (migrated from HomePage)"
```

---

### Task 6: 创建 GameOverScreen（从 GameOverPage 迁移）

**Files:**
- Create: `apps/taosim-ui/src/screens/GameOverScreen.vue`
- Reference: `apps/taosim-ui/src/pages/GameOverPage.vue`

- [ ] **Step 1: 读取 GameOverPage.vue**

- [ ] **Step 2: 创建 GameOverScreen.vue**

```vue
<!-- apps/taosim-ui/src/screens/GameOverScreen.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { useGameFlowStore } from '@/stores/game-flow';
import { usePlayerStore } from '@/stores/player';
import { useAppStore } from '@/stores/app';

const gameFlow = useGameFlowStore();
const playerStore = usePlayerStore();
const appStore = useAppStore();

const epitaph = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  return {
    name: c.name,
    realm: c.realm,
    age: Math.floor(c.lifespan.age),
    maxLifespan: c.lifespan.maxLifespan,
    soulState: c.soulState,
  };
});

const endingText = computed(() => {
  if (!epitaph.value) return '';
  if (epitaph.value.soulState === 'PrimordialSoul') return '元神出窍，神魂遁入虚空';
  if (epitaph.value.soulState === 'RemnantSoul') return '残魂消散，归于天地';
  return '道消身殒';
});

function returnToTitle() {
  playerStore.reset();
  appStore.clearWorldState();
  gameFlow.enterTitle();
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200">
    <div v-if="epitaph" class="text-center p-8 border border-slate-700 rounded-lg max-w-md">
      <h2 class="text-3xl text-amber-400 mb-2">道消身殒</h2>
      <p class="text-slate-400 mb-6">{{ gameFlow.deathMessage ?? '寿元耗尽' }}</p>

      <div class="space-y-2 mb-8">
        <p>道号：{{ epitaph.name }}</p>
        <p>境界：{{ epitaph.realm }}</p>
        <p>享年：{{ epitaph.age }} / {{ epitaph.maxLifespan }}</p>
        <p class="text-amber-300">{{ endingText }}</p>
      </div>

      <button
        class="px-6 py-2 bg-amber-700 hover:bg-amber-600 rounded"
        @click="returnToTitle"
      >
        返回首页，重新开始
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/screens/GameOverScreen.vue
git commit -m "feat(ui): add GameOverScreen (migrated from GameOverPage)"
```

---

### Task 7: 给 app store 加 clearWorldState action

**Files:**
- Modify: `apps/taosim-ui/src/stores/app.ts`

- [ ] **Step 1: 读取 app.ts**

- [ ] **Step 2: 在 actions 中新增 clearWorldState**

在 `actions` 对象内加：

```typescript
clearWorldState() {
  this.currentWorldState = null;
  this.isInitialized = false;
},
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add apps/taosim-ui/src/stores/app.ts
git commit -m "feat(ui): add clearWorldState action to app store"
```

---

### Task 8: 改造 useWorld 去除路由耦合

**Files:**
- Modify: `apps/taosim-ui/src/composables/useWorld.ts`

- [ ] **Step 1: 读取 useWorld.ts**

- [ ] **Step 2: 用 gameFlow 替代 router**

替换整个 useWorld.ts：

```typescript
// apps/taosim-ui/src/composables/useWorld.ts
import { reactive } from 'vue';
import { WorldEngine, PlayerLifecycleService } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';
import type { BigEventLog } from '@taosim/contracts';

export function useWorld() {
  const appStore = useAppStore();
  const playerStore = usePlayerStore();
  const gameFlow = useGameFlowStore();
  const state = reactive({
    recentEvents: [] as BigEventLog[],
    advancing: false,
    deathMessage: null as string | null,
  });

  function advanceMonth() {
    if (!appStore.currentWorldState || !playerStore.character) return;
    const engine = new WorldEngine(appStore.currentWorldState);
    const result = engine.step();
    appStore.currentWorldState = result.updatedState;
    if (result.events[0]) {
      state.recentEvents = [result.events[0], ...state.recentEvents].slice(0, 50);
    }
    applyPlayerTime(1);
  }

  async function fastForward(months: number) {
    if (!appStore.currentWorldState || !playerStore.character) return;
    state.advancing = true;
    const engine = new WorldEngine(appStore.currentWorldState);
    let died = false;

    const batchSize = 12;
    for (let i = 0; i < months && !died; i += batchSize) {
      const batch = Math.min(batchSize, months - i);
      const result = engine.fastForward(batch);
      appStore.currentWorldState = engine.getState();
      state.recentEvents = [...result.events, ...state.recentEvents].slice(0, 50);

      const playerResult = PlayerLifecycleService.advanceTime(playerStore.character, batch);
      playerStore.character = playerResult.updatedPlayer;
      if (playerResult.died) {
        died = true;
        state.deathMessage = playerResult.causeOfDeath ?? '寿元耗尽';
        state.advancing = false;
        gameFlow.enterGameOver(state.deathMessage ?? undefined);
        return;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    state.advancing = false;
  }

  function applyPlayerTime(months: number) {
    if (!playerStore.character) return;
    const result = PlayerLifecycleService.advanceTime(playerStore.character, months);
    playerStore.character = result.updatedPlayer;

    if (playerStore.character.gameMode?.saveMode === 'Ironman') {
      appStore.saveGame().catch(() => {});
    }

    if (result.died) {
      state.deathMessage = result.causeOfDeath ?? '寿元耗尽';
      gameFlow.enterGameOver(state.deathMessage ?? undefined);
    }
  }

  return { state, advanceMonth, fastForward };
}
```

- [ ] **Step 3: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 4: Commit**

```bash
git add apps/taosim-ui/src/composables/useWorld.ts
git commit -m "refactor(ui): decouple useWorld from router, use gameFlow store"
```

---

### Task 9: 创建 GameScreen 骨架 + 5 个布局子组件

**Files:**
- Create: `apps/taosim-ui/src/game/GameScreen.vue`
- Create: `apps/taosim-ui/src/game/TopBar.vue`
- Create: `apps/taosim-ui/src/game/LeftSidebar.vue`
- Create: `apps/taosim-ui/src/game/EventLog.vue`
- Create: `apps/taosim-ui/src/game/BottomNav.vue`
- Create: `apps/taosim-ui/src/game/MainContent.vue`
- Create: `apps/taosim-ui/src/game/panels/MapPanel.vue`（占位）
- Create: `apps/taosim-ui/src/game/panels/CultivationPanel.vue`（占位）
- Create: `apps/taosim-ui/src/game/panels/CraftingPanel.vue`（占位）
- Create: `apps/taosim-ui/src/game/panels/MarketPanel.vue`（占位）
- Create: `apps/taosim-ui/src/game/panels/NpcPanel.vue`（占位）
- Create: `apps/taosim-ui/src/game/panels/InventoryPanel.vue`（占位）

- [ ] **Step 1: 创建 GameScreen.vue**

```vue
<!-- apps/taosim-ui/src/game/GameScreen.vue -->
<script setup lang="ts">
import TopBar from './TopBar.vue';
import LeftSidebar from './LeftSidebar.vue';
import EventLog from './EventLog.vue';
import BottomNav from './BottomNav.vue';
import MainContent from './MainContent.vue';
import { usePlayerStore } from '@/stores/player';
import { useGameFlowStore } from '@/stores/game-flow';

const playerStore = usePlayerStore();
const gameFlow = useGameFlowStore();

// 守卫：若无角色（不应发生），退回主菜单
if (!playerStore.character) {
  gameFlow.enterTitle();
}
</script>

<template>
  <div class="h-screen flex flex-col bg-slate-900 text-slate-100">
    <TopBar />
    <div class="flex-1 flex overflow-hidden">
      <LeftSidebar />
      <MainContent />
      <EventLog />
    </div>
    <BottomNav />
  </div>
</template>
```

- [ ] **Step 2: 创建 TopBar.vue**

```vue
<!-- apps/taosim-ui/src/game/TopBar.vue -->
<script setup lang="ts">
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';

const appStore = useAppStore();
const playerStore = usePlayerStore();
const { advanceMonth, fastForward, state } = useWorld();

function modeLabel() {
  const m = playerStore.character?.gameMode;
  if (!m) return '';
  const parts: string[] = [];
  parts.push(m.breakthrough === 'Traditional' ? '传统突破' : '简单突破');
  parts.push(m.saveMode === 'Ironman' ? '铁人模式' : '自由模式');
  return parts.join(' · ');
}
</script>

<template>
  <header class="h-12 flex items-center justify-between px-4 bg-slate-800 border-b border-slate-700">
    <div class="text-amber-300 font-semibold">
      道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
    </div>
    <div class="flex gap-2">
      <button
        class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        :disabled="state.advancing"
        @click="advanceMonth"
      >
        推进 1 月
      </button>
      <button
        class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        :disabled="state.advancing"
        @click="fastForward(12)"
      >
        闭关 1 年
      </button>
      <button
        class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        :disabled="state.advancing"
        @click="fastForward(120)"
      >
        闭关 10 年
      </button>
    </div>
    <div class="text-xs text-slate-400">{{ modeLabel() }}</div>
  </header>
</template>
```

- [ ] **Step 3: 创建 LeftSidebar.vue**

```vue
<!-- apps/taosim-ui/src/game/LeftSidebar.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useUiStore } from '@/stores/ui';

const playerStore = usePlayerStore();
const uiStore = useUiStore();

const c = computed(() => playerStore.character);
const lifespanPct = computed(() => {
  if (!c.value) return 0;
  return Math.min(100, Math.round((c.value.lifespan.age / c.value.lifespan.maxLifespan) * 100));
});
const lifespanWarning = computed(() => lifespanPct.value >= 80);

const spiritRootText = computed(() => {
  if (!c.value) return '';
  const root = c.value.spiritRoot;
  const gradeMap = { Heaven: '天', Earth: '地', Profound: '玄', Yellow: '黄' };
  const grade = gradeMap[root.grade];
  const elements = root.elements.join('/');
  return `${grade}灵根 · ${elements}${root.isVariant ? '（变异）' : ''}`;
});
</script>

<template>
  <aside v-if="c" class="w-56 flex-shrink-0 bg-slate-800 border-r border-slate-700 p-4 overflow-y-auto">
    <div class="mb-3">
      <div class="text-lg font-semibold text-amber-200">{{ c.name }}</div>
      <div class="text-xs text-slate-400">{{ c.realm }}</div>
    </div>

    <div class="space-y-2 text-sm mb-3">
      <div>
        <div class="flex justify-between text-xs mb-0.5">
          <span>气血</span><span>{{ c.hp }}/{{ c.maxHp }}</span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded">
          <div class="h-full bg-red-500 rounded" :style="{ width: `${(c.hp / c.maxHp) * 100}%` }"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-0.5">
          <span>灵力</span><span>{{ c.spiritEnergy.current }}/{{ c.spiritEnergy.max }}</span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded">
          <div class="h-full bg-blue-500 rounded" :style="{ width: `${(c.spiritEnergy.current / c.spiritEnergy.max) * 100}%` }"></div>
        </div>
      </div>
      <div>
        <div class="flex justify-between text-xs mb-0.5">
          <span>行动</span><span>{{ c.monthlyActionPoints.current }}/{{ c.monthlyActionPoints.max }}</span>
        </div>
        <div class="h-1.5 bg-slate-700 rounded">
          <div class="h-full bg-green-500 rounded" :style="{ width: `${(c.monthlyActionPoints.current / c.monthlyActionPoints.max) * 100}%` }"></div>
        </div>
      </div>
    </div>

    <div class="text-sm mb-3">
      <div class="text-slate-400 text-xs">灵石</div>
      <div class="text-amber-300">{{ c.spiritStones }}</div>
    </div>

    <div class="text-sm mb-3" :class="{ 'text-red-400': lifespanWarning }">
      <div class="text-slate-400 text-xs">寿元 {{ lifespanWarning ? '⚠' : '' }}</div>
      <div>{{ Math.floor(c.lifespan.age) }}/{{ c.lifespan.maxLifespan }}</div>
    </div>

    <div class="text-xs text-slate-400 mb-3">
      <div class="mb-0.5">灵根</div>
      <div class="text-slate-300">{{ spiritRootText }}</div>
    </div>

    <button
      class="w-full px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded"
      @click="uiStore.openCharDetail()"
    >
      查看详情
    </button>
  </aside>
</template>
```

- [ ] **Step 4: 创建 EventLog.vue**

```vue
<!-- apps/taosim-ui/src/game/EventLog.vue -->
<script setup lang="ts">
import { useWorld } from '@/composables/useWorld';
const { state } = useWorld();
</script>

<template>
  <aside class="w-64 flex-shrink-0 bg-slate-800 border-l border-slate-700 p-3 overflow-y-auto">
    <div class="text-xs text-slate-400 mb-2 font-semibold">事件日志</div>
    <div v-if="state.recentEvents.length === 0" class="text-xs text-slate-500 italic">
      天地初开，万籁俱寂……
    </div>
    <div class="space-y-2">
      <div
        v-for="evt in state.recentEvents"
        :key="evt.id"
        class="text-xs p-2 bg-slate-700/50 rounded"
      >
        <div class="text-slate-300 font-medium">
          <span class="text-amber-400">{{ evt.year }}年{{ evt.month }}月</span>
          {{ evt.title }}
        </div>
        <div v-if="evt.description" class="text-slate-400 mt-0.5">{{ evt.description }}</div>
      </div>
    </div>
  </aside>
</template>
```

- [ ] **Step 5: 创建 BottomNav.vue**

```vue
<!-- apps/taosim-ui/src/game/BottomNav.vue -->
<script setup lang="ts">
import { useUiStore, type GameTab } from '@/stores/ui';

const uiStore = useUiStore();

const tabs: Array<{ key: GameTab; label: string }> = [
  { key: 'map',    label: '大地图' },
  { key: 'cult',   label: '修炼' },
  { key: 'craft',  label: '百艺' },
  { key: 'market', label: '坊市' },
  { key: 'npc',    label: '人际' },
  { key: 'inv',    label: '背包' },
];
</script>

<template>
  <nav class="h-12 flex items-center bg-slate-800 border-t border-slate-700">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="flex-1 h-full text-sm transition"
      :class="uiStore.activeTab === tab.key
        ? 'bg-amber-700 text-amber-100 font-semibold'
        : 'text-slate-300 hover:bg-slate-700'"
      @click="uiStore.setTab(tab.key)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>
```

- [ ] **Step 6: 创建 MainContent.vue**

```vue
<!-- apps/taosim-ui/src/game/MainContent.vue -->
<script setup lang="ts">
import { useUiStore } from '@/stores/ui';
import MapPanel from './panels/MapPanel.vue';
import CultivationPanel from './panels/CultivationPanel.vue';
import CraftingPanel from './panels/CraftingPanel.vue';
import MarketPanel from './panels/MarketPanel.vue';
import NpcPanel from './panels/NpcPanel.vue';
import InventoryPanel from './panels/InventoryPanel.vue';

const uiStore = useUiStore();
</script>

<template>
  <main class="flex-1 overflow-y-auto p-4">
    <MapPanel v-if="uiStore.activeTab === 'map'" />
    <CultivationPanel v-else-if="uiStore.activeTab === 'cult'" />
    <CraftingPanel v-else-if="uiStore.activeTab === 'craft'" />
    <MarketPanel v-else-if="uiStore.activeTab === 'market'" />
    <NpcPanel v-else-if="uiStore.activeTab === 'npc'" />
    <InventoryPanel v-else-if="uiStore.activeTab === 'inv'" />
  </main>
</template>
```

- [ ] **Step 7: 创建 6 个占位 Panel**

为 6 个 Panel 各创建一个占位文件 `apps/taosim-ui/src/game/panels/XxxPanel.vue`：

```vue
<script setup lang="ts"></script>
<template>
  <div class="text-slate-400">（Xxx Panel — 待 Task 1N 迁移）</div>
</template>
```

每个 Panel 的文字分别填：MapPanel="大地图"、CultivationPanel="修炼"、CraftingPanel="百艺"、MarketPanel="坊市"、NpcPanel="人际"、InventoryPanel="背包"。

- [ ] **Step 8: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 9: Commit**

```bash
git add apps/taosim-ui/src/game/
git commit -m "feat(ui): add GameScreen skeleton with layout sub-components"
```

---

### Task 10: 基础架构阶段验证

**Files:** 无修改

- [ ] **Step 1: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 2: dev server 冒烟**

Run: `npm run dev -w @taosim/taosim-ui`（非阻塞）

> **注意：** 此时 CreateCharacterPage 还没改（Task 17 才改），创角完成后仍会 `router.push('/world')` 跳到一个不存在的路由。这是预期的——本 Task 只验证 MainTitleScreen 能显示。要验证完整流程，先执行 Task 17。

- [ ] **Step 3: 浏览器确认 MainTitleScreen 显示**

- [ ] **Step 4: StopCommand 停 dev server**

---

## Phase 10.2 — 面板迁移

> **迁移通用规则：**
> 1. 读取原 Page.vue 源码
> 2. 提取 template 主体和 script 逻辑
> 3. 去掉所有 `<router-link>` 和 `router.push`，改为 `uiStore.setTab(...)` 或内部 ref 切换
> 4. 去掉页面级守卫（GameScreen 已有守卫）
> 5. 去掉页面自带的角色信息条（已在 LeftSidebar）
> 6. 写入对应 Panel.vue，**完整搬运业务逻辑**

---

### Task 11: 迁移 MapPanel（从 WorldPage）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/MapPanel.vue`
- Reference: `apps/taosim-ui/src/pages/WorldPage.vue`

- [ ] **Step 1: 读取 WorldPage.vue**

- [ ] **Step 2: 写 MapPanel.vue**

WorldPage 的 4 块职责中，时间控制已在 TopBar、事件已在 EventLog、角色信息已在 LeftSidebar。MapPanel 保留"当前所在场景"的展示。

```vue
<!-- apps/taosim-ui/src/game/panels/MapPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useAppStore } from '@/stores/app';

const playerStore = usePlayerStore();
const appStore = useAppStore();

const location = computed(() => {
  const wid = appStore.currentWorldState as any;
  return wid?.continentId ?? '苍洲';
});

const realmInfo = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  return {
    realm: c.realm,
    cultivation: `${c.cultivation.currentExp} / ${c.cultivation.maxExp}`,
  };
});
</script>

<template>
  <div class="space-y-4">
    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">当前所在</h3>
      <p class="text-slate-300">{{ location }}</p>
    </div>

    <div v-if="realmInfo" class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">修行境界</h3>
      <p class="text-slate-300">境界：{{ realmInfo.realm }}</p>
      <p class="text-slate-300">修为：{{ realmInfo.cultivation }}</p>
      <p class="text-xs text-slate-500 mt-2">
        点"修炼"页进行闭关与突破，点顶部按钮推进时间。
      </p>
    </div>

    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">天地异象</h3>
      <p class="text-xs text-slate-500">
        劫难倒计时：{{ (appStore.currentWorldState as any)?.catastropheCountdownMonths ?? '未知' }} 月
      </p>
    </div>
  </div>
</template>
```

> **执行注意：** `appStore.currentWorldState` 的字段名以 contracts/world-state.ts 为准。若 `continentId` 不存在，按实际字段调整。

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/game/panels/MapPanel.vue
git commit -m "feat(ui): migrate WorldPage to MapPanel"
```

---

### Task 12: 迁移 CultivationPanel（从 CultivationPage）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/CultivationPanel.vue`
- Reference: `apps/taosim-ui/src/pages/CultivationPage.vue`

- [ ] **Step 1: 读取 CultivationPage.vue 完整内容**

- [ ] **Step 2: 读取 TribulationEngine 确认 attempt 方法签名**

Run: Grep `attempt` in `packages/engine/src/tribulation/tribulation-engine.ts`，或直接 Read 该文件，确认 `attempt` 的参数和返回值。CultivationPage 原文里已有用法，以原 page 代码为准。

- [ ] **Step 3: 写 CultivationPanel.vue**

保留境界/修为显示、闭关 12 月按钮、动态突破逻辑。删除页面级守卫、router-link。

```vue
<!-- apps/taosim-ui/src/game/panels/CultivationPanel.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';
import { TribulationEngine } from '@taosim/engine';
import type { RealmFullPath } from '@taosim/contracts';

const playerStore = usePlayerStore();
const { fastForward, state } = useWorld();
const breakthroughMsg = ref<string>('');
const breakthroughOk = ref<boolean | null>(null);

interface RealmBreakthroughConfig {
  from: RealmFullPath;
  to: RealmFullPath;
  requiredMaterials: { name: string; count: number }[];
}
const allConfigs: RealmBreakthroughConfig[] = [
  { from: 'QiRefinement_9', to: 'Foundation_1', requiredMaterials: [{ name: '筑基丹', count: 1 }] },
  { from: 'Foundation_3',   to: 'GoldenCore_1', requiredMaterials: [{ name: '金丹引', count: 1 }] },
  { from: 'GoldenCore_3',   to: 'NascentSoul_1',requiredMaterials: [{ name: '元婴符', count: 1 }] },
];

const availableConfig = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  return allConfigs.find(cfg => cfg.from === c.realm) ?? null;
});

function cultivate() {
  fastForward(12);
}

function attemptBreakthrough() {
  const c = playerStore.character;
  const cfg = availableConfig.value;
  if (!c || !cfg) return;

  const isTraditional = c.gameMode?.breakthrough === 'Traditional';
  if (isTraditional) {
    breakthroughMsg.value = `传统突破需要：${cfg.requiredMaterials.map(m => `${m.name}×${m.count}`).join('，')}（材料系统待补）`;
    breakthroughOk.value = null;
    return;
  }

  // ⚠️ 以原 CultivationPage 实际调用为准：
  // 若原文是 `TribulationEngine.attempt(c, cfg.to)` 返回 { success, newRealm }，则保留下面写法
  // 若签名不同，照原 page 抄
  const result = TribulationEngine.attempt(c, cfg.to);
  if (result.success) {
    playerStore.character = { ...c, realm: result.newRealm };
    breakthroughMsg.value = '突破成功！';
    breakthroughOk.value = true;
  } else {
    breakthroughMsg.value = '突破失败，修为受损……';
    breakthroughOk.value = false;
  }
}
</script>

<template>
  <div v-if="playerStore.character" class="space-y-4">
    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">闭关修行</h3>
      <p class="text-slate-300">境界：{{ playerStore.character.realm }}</p>
      <p class="text-slate-300">修为：{{ playerStore.character.cultivation.currentExp }} / {{ playerStore.character.cultivation.maxExp }}</p>
      <p class="text-slate-300">寿元：{{ Math.floor(playerStore.character.lifespan.age) }} / {{ playerStore.character.lifespan.maxLifespan }}</p>
      <button
        class="mt-3 px-4 py-2 bg-amber-700 hover:bg-amber-600 rounded"
        :disabled="state.advancing"
        @click="cultivate"
      >
        闭关 12 个月
      </button>
    </div>

    <div v-if="availableConfig" class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">渡劫突破</h3>
      <p class="text-sm text-slate-400 mb-2">
        目标：{{ availableConfig.from }} → {{ availableConfig.to }}
      </p>
      <button class="px-4 py-2 bg-red-800 hover:bg-red-700 rounded" @click="attemptBreakthrough">
        尝试突破
      </button>
      <p
        v-if="breakthroughMsg"
        class="mt-2 text-sm"
        :class="breakthroughOk === true ? 'text-green-400' : breakthroughOk === false ? 'text-red-400' : 'text-amber-400'"
      >
        {{ breakthroughMsg }}
      </p>
    </div>

    <div v-else class="p-4 bg-slate-800 rounded text-slate-500 text-sm">
      当前境界已至巅峰或无可突破配置。
    </div>
  </div>
</template>
```

> **执行说明：** TribulationEngine.attempt 的实际签名必须以原 CultivationPage.vue 代码为准，照抄其调用形式。如果原 page 用了不同的参数或返回值解构，按原 page 改这里的代码。

- [ ] **Step 4: Commit**

```bash
git add apps/taosim-ui/src/game/panels/CultivationPanel.vue
git commit -m "feat(ui): migrate CultivationPage to CultivationPanel"
```

---

### Task 13: 迁移 CraftingPanel（从 CraftingPage + UpgradePage）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/CraftingPanel.vue`
- Reference: `apps/taosim-ui/src/pages/CraftingPage.vue`
- Reference: `apps/taosim-ui/src/pages/UpgradePage.vue`

- [ ] **Step 1: 读取 CraftingPage.vue 和 UpgradePage.vue 完整内容**

- [ ] **Step 2: 写 CraftingPanel.vue**

合并炼丹/炼器 + 装备升品为一个 Tab，用内部 `subView: 'craft' | 'upgrade'` 切换。**必须完整搬运原 page 的炼制/升品调用逻辑**（AlchemyEngine/ForgeEngine/UpgradeEngine 的调用、AP 扣减、结果反馈）。

```vue
<!-- apps/taosim-ui/src/game/panels/CraftingPanel.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
// 按原 page 实际 import 的 engine 为准，例如：
// import { AlchemyEngine, ForgeEngine, UpgradeEngine } from '@taosim/engine';

const playerStore = usePlayerStore();
const subView = ref<'craft' | 'upgrade'>('craft');
const feedback = ref('');

// 从原 CraftingPage.vue 搬运所有炼丹/炼器函数
// 从原 UpgradePage.vue 搬运所有升品函数
// 去掉 router-link，去掉页面级守卫
</script>

<template>
  <div class="space-y-4">
    <div class="flex gap-2">
      <button
        class="px-3 py-1 rounded text-sm"
        :class="subView === 'craft' ? 'bg-amber-700' : 'bg-slate-700'"
        @click="subView = 'craft'"
      >炼丹炼器</button>
      <button
        class="px-3 py-1 rounded text-sm"
        :class="subView === 'upgrade' ? 'bg-amber-700' : 'bg-slate-700'"
        @click="subView = 'upgrade'"
      >装备升品</button>
    </div>

    <div v-if="subView === 'craft'" class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 font-semibold mb-2">百艺坊</h3>
      <!-- 从 CraftingPage.vue 完整搬运炼丹/炼器 UI 与调用 -->
      <p v-if="feedback" class="text-amber-400 text-sm mt-2">{{ feedback }}</p>
    </div>

    <div v-else class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 font-semibold mb-2">升品台</h3>
      <!-- 从 UpgradePage.vue 完整搬运升品 UI 与调用 -->
      <p v-if="feedback" class="text-amber-400 text-sm mt-2">{{ feedback }}</p>
    </div>
  </div>
</template>
```

> **强制要求：** 不能只留注释占位！必须把原 CraftingPage 的炼制按钮、配方列表、材料消耗检查、AP 扣减、AlchemyEngine/ForgeEngine 调用、结果反馈**完整搬入** `v-if="subView === 'craft'"` 分支；UpgradePage 的装备选择、品质升级链、UpgradeEngine.enhance 调用、结果反馈**完整搬入** `v-else` 分支。执行者在 Step 1 已经 Read 了原 page 源码，必须照抄其业务逻辑，不能简化。

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/game/panels/CraftingPanel.vue
git commit -m "feat(ui): migrate CraftingPage + UpgradePage to CraftingPanel"
```

---

### Task 14: 迁移 MarketPanel（从 MarketPage）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/MarketPanel.vue`
- Reference: `apps/taosim-ui/src/pages/MarketPage.vue`

- [ ] **Step 1: 读取 MarketPage.vue 完整内容**

- [ ] **Step 2: 写 MarketPanel.vue**

**必须完整搬运** MarketPage 的商品列表、刷新（MarketEngine.refreshMarket）、购买、灵石扣减、物品入库逻辑。删除页面级守卫和 router-link。

```vue
<!-- apps/taosim-ui/src/game/panels/MarketPanel.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { usePlayerStore } from '@/stores/player';
// 按原 MarketPage 实际 import 为准，例如：
// import { MarketEngine } from '@taosim/engine';
// import { NODE_MARKET_DONGHUANG } from '@/...';  // 原 page 的 mock 节点

const playerStore = usePlayerStore();
const feedback = ref('');

// 从原 MarketPage.vue 完整搬运：
// - market 商品列表的 ref
// - refreshMarket 函数
// - buy 函数（扣灵石、加物品）
// 去掉 router-link 和页面守卫
</script>

<template>
  <div class="space-y-4">
    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">坊市</h3>
      <!-- 从 MarketPage.vue 完整搬运商品列表、刷新按钮、购买按钮 -->
      <p v-if="feedback" class="text-amber-400 text-sm mt-2">{{ feedback }}</p>
    </div>
  </div>
</template>
```

> **强制要求：** 同 Task 13，必须完整搬运原 MarketPage 的 MarketEngine 调用、商品渲染、购买流程，不能只留占位。

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/game/panels/MarketPanel.vue
git commit -m "feat(ui): migrate MarketPage to MarketPanel"
```

---

### Task 15: 迁移 NpcPanel（从 NPCInteractionPage + NPCTradePage）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/NpcPanel.vue`
- Reference: `apps/taosim-ui/src/pages/NPCInteractionPage.vue`
- Reference: `apps/taosim-ui/src/pages/NPCTradePage.vue`

- [ ] **Step 1: 读取两个 NPC 页面完整内容**

- [ ] **Step 2: 写 NpcPanel.vue**

合并偶遇 + 交易，用 `subView: 'interact' | 'trade'` 切换。原 NPCTradePage 是从 NPCInteractionPage 点"交易"跳路由——改为内部 subView 切换。**必须完整搬运** NPCInteractionEngine（切磋/论道）和 NPCTradeEngine（refreshNPCOffer、买卖）的调用。

```vue
<!-- apps/taosim-ui/src/game/panels/NpcPanel.vue -->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
// 按原 page 实际 import 为准

const playerStore = usePlayerStore();
const subView = ref<'interact' | 'trade'>('interact');
const currentNPC = computed(() => playerStore.currentNPC);

// 从 NPCInteractionPage.vue 完整搬运切磋/论道函数
// 从 NPCTradePage.vue 完整搬运买卖函数
function goTrade() { subView.value = 'trade'; }
function backToInteract() { subView.value = 'interact'; }
</script>

<template>
  <div class="space-y-4">
    <div v-if="!currentNPC" class="p-4 bg-slate-800 rounded text-slate-400">
      暂无相遇之人。在大地图游历时可能偶遇修仙者。
    </div>

    <template v-else>
      <div v-if="subView === 'interact'" class="p-4 bg-slate-800 rounded">
        <h3 class="text-amber-300 text-lg font-semibold mb-2">{{ currentNPC.name }}</h3>
        <!-- 从 NPCInteractionPage.vue 完整搬运：NPC 信息、切磋/论道按钮和结果反馈 -->
        <div class="flex gap-2 mt-3">
          <button class="px-3 py-1 bg-slate-700 rounded text-sm">切磋</button>
          <button class="px-3 py-1 bg-slate-700 rounded text-sm">论道</button>
          <button class="px-3 py-1 bg-amber-700 rounded text-sm" @click="goTrade">交易</button>
        </div>
      </div>

      <div v-else class="p-4 bg-slate-800 rounded">
        <h3 class="text-amber-300 text-lg font-semibold mb-2">与 {{ currentNPC.name }} 交易</h3>
        <!-- 从 NPCTradePage.vue 完整搬运：报价列表、买入、卖出 -->
        <button class="mt-3 px-3 py-1 bg-slate-700 rounded text-sm" @click="backToInteract">返回</button>
      </div>
    </template>
  </div>
</template>
```

> **强制要求：** 必须完整搬运原两个 NPC 页面的引擎调用与状态更新逻辑。

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/game/panels/NpcPanel.vue
git commit -m "feat(ui): migrate NPC pages to NpcPanel"
```

---

### Task 16: 迁移 InventoryPanel（从 InventoryPage）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/InventoryPanel.vue`
- Reference: `apps/taosim-ui/src/pages/InventoryPage.vue`

- [ ] **Step 1: 读取 InventoryPage.vue 完整内容**

- [ ] **Step 2: 写 InventoryPanel.vue**

搬入装备槽展示 + 物品列表 + 装备/卸下逻辑（EquipmentManager 调用）。删除页面守卫和 router-link。

```vue
<!-- apps/taosim-ui/src/game/panels/InventoryPanel.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
// 按原 page 实际 import 为准，例如：
// import { EquipmentManager } from '@taosim/engine';

const playerStore = usePlayerStore();
const c = computed(() => playerStore.character);
// 从原 InventoryPage.vue 完整搬运 equip/unequip 函数
</script>

<template>
  <div v-if="c" class="space-y-4">
    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">装备槽</h3>
      <div class="grid grid-cols-3 gap-2 text-sm">
        <div>武器：{{ c.equipmentSlots.weapon?.name ?? '空' }}</div>
        <div>防具：{{ c.equipmentSlots.armor?.name ?? '空' }}</div>
        <div>法宝：{{ c.equipmentSlots.treasures.length }} 件</div>
      </div>
      <!-- 从原 InventoryPage 完整搬运装备/卸下按钮和操作 -->
    </div>

    <div class="p-4 bg-slate-800 rounded">
      <h3 class="text-amber-300 text-lg font-semibold mb-2">乾坤袋（{{ c.inventory.length }} 种）</h3>
      <div v-if="c.inventory.length === 0" class="text-slate-500 text-sm">空空如也</div>
      <ul v-else class="space-y-1 text-sm">
        <li v-for="(stack, idx) in c.inventory" :key="idx" class="flex justify-between">
          <span class="text-slate-300">{{ stack.item.name }}</span>
          <span class="text-slate-400">×{{ stack.count }}</span>
        </li>
      </ul>
      <!-- 从原 InventoryPage 完整搬运使用/装备物品的按钮 -->
    </div>
  </div>
</template>
```

> **强制要求：** 必须完整搬运原 InventoryPage 的 EquipmentManager 调用与装备/卸下流程。

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/game/panels/InventoryPanel.vue
git commit -m "feat(ui): migrate InventoryPage to InventoryPanel"
```

---

## Phase 10.3 — 初始状态修正

### Task 17: 改造 CreateCharacterPage 接入 gameFlow

**Files:**
- Modify: `apps/taosim-ui/src/pages/CreateCharacterPage.vue`

- [ ] **Step 1: 读取 CreateCharacterPage.vue 完整内容**

- [ ] **Step 2: 改造完成创角后的跳转**

在 `<script setup>` 顶部加 import 和初始化：

```typescript
import { useGameFlowStore } from '@/stores/game-flow';
const gameFlow = useGameFlowStore();
```

找到 confirm step 的"降临大千世界"处理函数（原本是 `router.push('/world')`），改为：

```typescript
// 原本：
// playerStore.setPlayer(character);
// appStore.initialize(character.id);
// router.push('/world');

// 改为：
playerStore.setPlayer(character);
appStore.initialize(character.id);
gameFlow.enterPlaying();
```

如果 `useRouter` 在此文件其他地方不再使用，删除其 import 和 `const router = useRouter()`。

- [ ] **Step 3: 改造 traits 传递（为 Task 18 准备）**

在 confirm step 构造 CharacterFactory.create 参数时，把 `innateTraits` 从中文名数组改为 trait **id 数组**：

```typescript
// 原本（示例，实际变量名以源码为准）：
// const params = {
//   innateTraits: selectedTraits.value.map(t => t.name),  // 中文名
//   ...
// };

// 改为：
const params = {
  innateTraits: selectedTraits.value.map(t => t.id),  // 英文 id，如 'TRAIT_SWORD_BONE'
  ...
};
```

> **关键背景：** `selectedTraits` 在 traits step 来自 `rollTraits(3)` 返回的 `Trait[]`，其 `.id` 是英文 id（如 `TRAIT_SWORD_BONE`）。原代码若传 `.name`（中文名），CharacterFactory 的旧 TRAIT_TEMPLATES 用中文名 key 才能查到；Task 18 会把 Factory 改为用 `getTraitById` 查 registry（英文 id），所以这里必须同步改为传 id。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/pages/CreateCharacterPage.vue
git commit -m "refactor(ui): wire CreateCharacterPage to gameFlow, pass trait ids"
```

---

### Task 18: CharacterFactory 接入 TRAIT_REGISTRY + 初始灵石

**Files:**
- Modify: `packages/engine/src/character/character-factory.ts`
- Modify/Create: `packages/engine/src/__tests__/character-factory.test.ts`

> **⚠️ 本 Task 改动 engine 包！** 改完后必须 rebuild dist，否则 UI 引用会报 "No matching export" 错。这是 Phase 7-9 一直踩的坑。

- [ ] **Step 1: 写失败测试（TDD）**

读取 `packages/engine/src/__tests__/character-factory.test.ts`（若存在），追加以下测试；若不存在则新建：

```typescript
import { describe, it, expect } from 'vitest';
import { CharacterFactory } from '../character/character-factory';
import { getTraitById } from '../data/trait-registry';

describe('CharacterFactory Phase 10 — registry 接入', () => {
  const baseParams = {
    name: '测试修士',
    gender: 'Male' as const,
    background: 'orphan' as const,
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    innateTraits: ['TRAIT_SWORD_BONE'],
    spiritRoot: { grade: 'Yellow' as const, elements: ['Earth' as const], isVariant: false },
    gameMode: { breakthrough: 'Simple' as const, saveMode: 'Free' as const },
  };

  it('用 TRAIT_REGISTRY 查词条，trait.id 与 registry 一致', () => {
    const c = CharacterFactory.create(baseParams);
    expect(c.traits.length).toBe(1);
    expect(c.traits[0]!.id).toBe('TRAIT_SWORD_BONE');
    const registryTrait = getTraitById('TRAIT_SWORD_BONE');
    expect(c.traits[0]!.effects).toEqual(registryTrait!.effects);
    expect(c.traits[0]!.quality).toEqual(registryTrait!.quality);
  });

  it('orphan 背景初始灵石 100', () => {
    const c = CharacterFactory.create(baseParams);
    expect(c.spiritStones).toBe(100);
  });

  it('small-clan 背景初始灵石 500', () => {
    const c = CharacterFactory.create({ ...baseParams, background: 'small-clan' });
    expect(c.spiritStones).toBe(500);
  });

  it('ancient-clan 背景初始灵石 2000', () => {
    const c = CharacterFactory.create({ ...baseParams, background: 'ancient-clan' });
    expect(c.spiritStones).toBe(2000);
  });

  it('未知的 trait id 被静默跳过（不抛错）', () => {
    const c = CharacterFactory.create({ ...baseParams, innateTraits: ['TRAIT_NONEXISTENT'] });
    expect(c.traits.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run packages/engine/src/__tests__/character-factory.test.ts`
Expected: FAIL（旧实现用 TRAIT_TEMPLATES 中文名查，`TRAIT_SWORD_BONE` 查不到；spiritStones 还是 0）

- [ ] **Step 3: 改造 character-factory.ts**

读取 `packages/taosim-engine/src/character/character-factory.ts`（路径以实际为准 `packages/engine/...`），做以下改动：

a) **删除** 整个 `TRAIT_TEMPLATES` 常量

b) **加 import**：

```typescript
import { getTraitById } from '../data/trait-registry.js';
```

c) **替换 traits 构造逻辑**：

```typescript
// 原本：
// const traits = params.innateTraits
//   .filter(name => TRAIT_TEMPLATES[name])
//   .map(name => { ... });

// 改为：
const traits = params.innateTraits
  .map(id => getTraitById(id))
  .filter((t): t is NonNullable<typeof t> => t !== undefined);
```

d) **加初始灵石映射**，在 return 对象前：

```typescript
const INITIAL_STONES: Record<BackgroundType, number> = {
  'orphan': 100,
  'small-clan': 500,
  'ancient-clan': 2000,
};
```

e) **在 return 对象里**把 `spiritStones: 0` 改为 `spiritStones: INITIAL_STONES[params.background]`

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run packages/engine/src/__tests__/character-factory.test.ts`
Expected: PASS（5 个新测试全过）

- [ ] **Step 5: 跑全量 engine 测试确保没破坏其他**

Run: `npx vitest run packages/engine`
Expected: 全部 PASS

> **注意：** 若有旧的 character-factory 测试用了中文名 trait（如 `'剑道奇才'`），这些测试会失败——把它们改为 registry 的英文 id（如 `'TRAIT_SWORD_BONE'` 对应"剑骨"，或用任意存在的 id）。如果旧测试用的是 TRAIT_TEMPLATES 里独有的中文名（如 `'万法归宗'`）在 registry 里没有对应项，则删除该断言或改用 registry 里存在的 id。

- [ ] **Step 6: 重建 engine dist（关键！）**

Run: `npm run build -w @taosim/engine`
Expected: 构建成功

- [ ] **Step 7: UI typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/character/character-factory.ts packages/engine/src/__tests__/character-factory.test.ts
git commit -m "feat(engine): CharacterFactory uses TRAIT_REGISTRY + background-based initial stones"
```

---

## Phase 10.4 — 收尾与验证

### Task 19: 删除旧 AppShell + 已迁移的 Page 文件

**Files:**
- Delete: `apps/taosim-ui/src/components/AppShell.vue`
- Delete: `apps/taosim-ui/src/pages/HomePage.vue`
- Delete: `apps/taosim-ui/src/pages/WorldPage.vue`
- Delete: `apps/taosim-ui/src/pages/CultivationPage.vue`
- Delete: `apps/taosim-ui/src/pages/CraftingPage.vue`
- Delete: `apps/taosim-ui/src/pages/UpgradePage.vue`
- Delete: `apps/taosim-ui/src/pages/MarketPage.vue`
- Delete: `apps/taosim-ui/src/pages/NPCInteractionPage.vue`
- Delete: `apps/taosim-ui/src/pages/NPCTradePage.vue`
- Delete: `apps/taosim-ui/src/pages/InventoryPage.vue`
- Delete: `apps/taosim-ui/src/pages/GameOverPage.vue`

> **保留：** `CreateCharacterPage.vue`（AppRoot 引用）、`BattlePage.vue` / `FactionPage.vue` / `OverworldPage.vue`（不在本 Phase scope，暂留为孤儿路由）

- [ ] **Step 1: 检查残留引用**

Run Grep（在整个 `apps/taosim-ui/src`）搜索：`AppShell`、`HomePage`、`WorldPage`、`CultivationPage`、`CraftingPage`、`UpgradePage`、`MarketPage`、`NPCInteractionPage`、`NPCTradePage`、`InventoryPage`、`GameOverPage`。

- [ ] **Step 2: 修复残留引用**

如果 BattlePage / FactionPage / OverworldPage / CreateCharacterPage / SaveLoadPanel 里 import 了被删文件，改为对应新组件或移除该 import / 跳转。特别注意：
- SaveLoadPanel 可能内部用 router（读档后跳转）——改为通过 emit 通知父组件
- 任何 `router.push('/world')` `router.push('/inventory')` 等跳已删路由的代码，改为 `uiStore.setTab('map')` 等

- [ ] **Step 3: 删除文件**

用 DeleteFile 工具删除上述 11 个文件。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck -w @taosim/taosim-ui`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add -A apps/taosim-ui/src
git commit -m "refactor(ui): remove legacy AppShell and migrated page files"
```

---

### Task 20: 清理 StatusBar 组件

**Files:**
- Maybe Delete: `apps/taosim-ui/src/components/StatusBar.vue`

- [ ] **Step 1: Grep StatusBar 引用**

如果整个 `apps/taosim-ui/src` 不再引用 StatusBar，则删除。如果 SaveLoadPanel 或其他保留的组件还用着，保留。

- [ ] **Step 2: Commit（如有删除）**

```bash
git add -A apps/taosim-ui/src
git commit -m "refactor(ui): remove unused StatusBar component"
```

---

### Task 21: 全量验证 + 体验走查

**Files:** 无修改，仅验证

- [ ] **Step 1: engine + UI 全量测试**

Run: `npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: typecheck 全工作区**

Run: `npm run typecheck`（根目录）
Expected: 通过

- [ ] **Step 3: 启动 dev server 完整走查**

Run: `npm run dev -w @taosim/taosim-ui`

**走查清单（对照 spec §7 验收标准）：**
- [ ] 打开页面 → MainTitleScreen（大千修仙界标题），**无顶部导航栏**
- [ ] 点"开始新游戏" → CreateCharacterPage，**无顶部导航栏**
- [ ] 完成 6 步创角 → 进入 GameScreen，**无"首页/创角"返回入口**
- [ ] 左侧角色状态栏在任何 Tab 下常驻可见（境界/HP/灵力/AP/灵石/寿元/灵根）
- [ ] 底部功能栏点击 → 主区域切换内容，**URL 不变**（无页面跳转感）
- [ ] 右侧事件日志实时反馈（推进时间后能看到事件）
- [ ] 创角后角色有初始灵石（orphan 100 / small-clan 500 / ancient-clan 2000）
- [ ] 创角选的词条生效（左侧"查看详情"能看到 trait，或者至少 character.traits 不为空）
- [ ] 点"推进 1 月"→ 角色年龄/修为增长，事件日志更新
- [ ] 反复"闭关 10 年"直到死亡 → 进入 GameOverScreen（不报错）
- [ ] GameOverScreen 点"返回首页" → 回到 MainTitleScreen（且 worldState 已清，可重新开档）
- [ ] 切到修炼 Tab，点"闭关 12 个月" → 修为增长
- [ ] 切到背包 Tab，能看到初始装备（若有）
- [ ] engine/contracts/persistence 包测试零回归

- [ ] **Step 4: StopCommand 停 dev server**

- [ ] **Step 5: 最终 Commit（如有零星修复）**

```bash
git add -A
git commit -m "chore(ui): phase 10 final polish based on playtest"
```

---

## Spec 覆盖对照（Self-Review）

| Spec 要求 | 对应 Task |
|-----------|----------|
| §2.1 单 GameScreen 布局 | Task 9 |
| §2.2 组件架构（AppShell 分支 → MainTitle/Create/GameScreen/GameOver） | Task 4-6, 9 |
| §2.3 game-flow + ui store | Task 1-2 |
| §2.4 路由简化 | Task 3 |
| §3.1 LeftSidebar | Task 9 |
| §3.2 TopBar（推进1月/闭关1年/闭关10年） | Task 9 |
| §3.3 BottomNav | Task 9 |
| §3.4 MainContent 6 Panels | Task 9-16 |
| §3.5 EventLog | Task 9 |
| §4.1 页面→面板迁移表 | Task 11-16 |
| §4.2 engine/contracts/persistence 零改动 | 约束 + 除 Task 18 外遵守 |
| §5.1 初始灵石（orphan100/small500/ancient2000） | Task 18 |
| §5.2 TRAIT_REGISTRY 接入 | Task 17-18 |
| §5.3 初始材料处理（方案 A：不补材料） | Task 18（只给灵石+武器，不给材料） |
| §7 验收标准 9 项 | Task 21 走查清单 |

**缺口说明：** spec §5.1 表格提到"灵草/铁矿石/阴露"等初始材料，§5.3 决策为方案 A（本次不补材料数据）。Task 18 只实现灵石和已有武器，inventory 保持为空。材料缺口作为独立后续工作项。

---

## 执行 Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-05-phase-10-ui-architecture-redesign.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - 每个 Task 派一个全新 subagent 执行，Task 间有 review 检查点，快速迭代，主上下文窗口保持干净

**2. Inline Execution** - 在当前会话按顺序执行，批量执行 + checkpoint review

**Which approach?**