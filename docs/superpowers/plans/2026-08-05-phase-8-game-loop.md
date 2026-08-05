# Phase 8 — 游戏主循环整合与闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将孤岛式功能模块串联成完整可玩闭环 —— 时间推进联动角色老化/修为增长、接入死亡结局、导航整合、HUD 常驻、行动点消耗。

**Architecture:** engine 层新增 PlayerLifecycleService（玩家时间推进纯函数）；UI 层改造 useWorld（联动玩家状态）、AppShell（完整导航 + HUD）、新增 GameOverPage、StatusBar 组件；各功能页面接入 AP 消耗。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest (TDD)

---

## File Structure

| 文件 | 类型 | 职责 |
|------|------|------|
| `engine/src/lifecycle/player-lifecycle.ts` | 新建 | 玩家时间推进纯函数（老化+修为+寿命检查） |
| `engine/src/__tests__/player-lifecycle.test.ts` | 新建 | TDD 测试 |
| `engine/src/index.ts` | 修改 | 导出 PlayerLifecycleService |
| `apps/taosim-ui/src/composables/useWorld.ts` | 修改 | 联动玩家老化+修为+死亡检查 |
| `apps/taosim-ui/src/components/StatusBar.vue` | 新建 | HUD 常驻状态条 |
| `apps/taosim-ui/src/components/AppShell.vue` | 修改 | 完整导航 + 嵌入 StatusBar |
| `apps/taosim-ui/src/pages/GameOverPage.vue` | 新建 | 死亡结局页面 |
| `apps/taosim-ui/src/router/routes.ts` | 修改 | 加 /game-over 路由 + 删 /tribulation 死链 |
| `apps/taosim-ui/src/pages/WorldPage.vue` | 修改 | 删 /tribulation 死链 |
| `apps/taosim-ui/src/stores/player.ts` | 修改 | 加 consumeAp / monthlyRestoreAp |
| `apps/taosim-ui/src/pages/CraftingPage.vue` | 修改 | 炼制消耗 1 AP |
| `apps/taosim-ui/src/pages/UpgradePage.vue` | 修改 | 升品消耗 1 AP |

---

### Task 1: PlayerLifecycleService — 玩家时间推进纯函数 (TDD)

**Files:**
- Create: `packages/engine/src/lifecycle/player-lifecycle.ts`
- Create: `packages/engine/src/__tests__/player-lifecycle.test.ts`
- Modify: `packages/engine/src/index.ts`

**Domain Risks:** 原子性（老化+修为+寿命检查必须一体）、精度（age 用浮点数）

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/player-lifecycle.test.ts
import { describe, it, expect } from 'vitest';
import { PlayerLifecycleService } from '../lifecycle/player-lifecycle.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 18, maxLifespan: 100 },
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 100, maxHp: 100, ap: 3, canFly: false, spiritStones: 0,
    inventory: [], equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('PlayerLifecycleService', () => {
  it('advanceTime 推进 12 个月角色 age 增长 1 岁', () => {
    const player = makePlayer();
    const result = PlayerLifecycleService.advanceTime(player, 12);
    expect(result.updatedPlayer.lifespan.age).toBeCloseTo(19, 1);
  });

  it('advanceTime 修为按悟性增长', () => {
    const player = makePlayer({ attributes: { physique: 10, comprehension: 20, perception: 5, agility: 5, luck: 5 } });
    const result = PlayerLifecycleService.advanceTime(player, 12);
    // comprehension=20, 12 个月: 20 * 12 * 0.5 = 120
    expect(result.updatedPlayer.cultivation.currentExp).toBeGreaterThanOrEqual(100);
  });

  it('advanceTime 恢复灵力至满', () => {
    const player = makePlayer({ spiritEnergy: { current: 10, max: 100 } });
    const result = PlayerLifecycleService.advanceTime(player, 1);
    expect(result.updatedPlayer.spiritEnergy.current).toBe(100);
  });

  it('advanceTime 寿命未耗尽返回存活', () => {
    const player = makePlayer({ lifespan: { age: 50, maxLifespan: 100 } });
    const result = PlayerLifecycleService.advanceTime(player, 12);
    expect(result.died).toBe(false);
  });

  it('advanceTime 寿命耗尽标记死亡', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 } });
    const result = PlayerLifecycleService.advanceTime(player, 24); // +2 岁 → 101 > 100
    expect(result.died).toBe(true);
    expect(result.causeOfDeath).toContain('寿元');
  });

  it('advanceTime 死亡时更新 soulState', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 }, realm: 'QiRefinement_9' });
    const result = PlayerLifecycleService.advanceTime(player, 24);
    expect(result.updatedPlayer.soulState).not.toBe('Active');
  });

  it('advanceTime 金丹以上死亡为元神出窍', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 }, realm: 'GoldenCore_1' });
    const result = PlayerLifecycleService.advanceTime(player, 24);
    expect(result.updatedPlayer.soulState).toBe('PrimordialSoul');
  });

  it('advanceTime 金丹以下死亡为残魂', () => {
    const player = makePlayer({ lifespan: { age: 99, maxLifespan: 100 }, realm: 'Foundation_1' });
    const result = PlayerLifecycleService.advanceTime(player, 24);
    expect(result.updatedPlayer.soulState).toBe('RemnantSoul');
  });

  it('advanceTime 月度行动点恢复', () => {
    const player = makePlayer({ monthlyActionPoints: { current: 3, max: 10 } });
    const result = PlayerLifecycleService.advanceTime(player, 1);
    expect(result.updatedPlayer.monthlyActionPoints.current).toBe(10);
  });

  it('advanceTime 不修改原对象（不可变）', () => {
    const player = makePlayer();
    const originalAge = player.lifespan.age;
    PlayerLifecycleService.advanceTime(player, 12);
    expect(player.lifespan.age).toBe(originalAge);
  });
});
```

- [ ] **Step 2: 运行验证失败**
Run: `npx vitest run packages/engine/src/__tests__/player-lifecycle.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 PlayerLifecycleService**

```typescript
// packages/engine/src/lifecycle/player-lifecycle.ts
import type { Character, SoulState } from '@taosim/contracts';

export interface AdvanceTimeResult {
  updatedPlayer: Character;
  died: boolean;
  causeOfDeath?: string;
}

// 悟性系数: 每点悟性每月产出 0.5 修为
const COMPREHENSION_EXP_RATIO = 0.5;

function getRealmTier(realm: string): number {
  if (realm.startsWith('SoulFormation')) return 5;
  if (realm.startsWith('NascentSoul')) return 4;
  if (realm.startsWith('GoldenCore')) return 3;
  if (realm.startsWith('Foundation')) return 2;
  return 1;
}

export class PlayerLifecycleService {
  /**
   * 推进玩家时间 N 个月。
   * 原子性：老化 + 修为增长 + 灵力恢复 + AP 恢复 + 寿命检查 一体完成。
   * 不可变：返回新对象，不修改入参。
   */
  static advanceTime(player: Character, months: number): AdvanceTimeResult {
    const updated: Character = structuredClone(player);

    // 1. 老化 (age 按月累加)
    updated.lifespan.age += months / 12;

    // 2. 修为自然增长 (悟性驱动)
    const expGain = Math.floor(updated.attributes.comprehension * months * COMPREHENSION_EXP_RATIO);
    updated.cultivation.currentExp += expGain;

    // 3. 灵力恢复至满
    updated.spiritEnergy.current = updated.spiritEnergy.max;

    // 4. 行动点恢复 (每月恢复 max)
    updated.monthlyActionPoints.current = updated.monthlyActionPoints.max;

    // 5. 寿命检查
    if (updated.lifespan.age >= updated.lifespan.maxLifespan) {
      const tier = getRealmTier(updated.realm);
      const newSoulState: SoulState = tier >= 3 ? 'PrimordialSoul' : 'RemnantSoul';
      updated.soulState = newSoulState;
      return {
        updatedPlayer: updated,
        died: true,
        causeOfDeath: `寿元耗尽（享年 ${Math.floor(updated.lifespan.age)} 岁）`,
      };
    }

    return { updatedPlayer: updated, died: false };
  }
}
```

- [ ] **Step 4: 运行验证通过**
Run: `npx vitest run packages/engine/src/__tests__/player-lifecycle.test.ts`
Expected: 10/10 PASS

- [ ] **Step 5: 导出 + 类型检查**
在 `packages/engine/src/index.ts` 末尾 Lifecycle 块加：
```typescript
export { PlayerLifecycleService } from './lifecycle/player-lifecycle.js';
```
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json` → PASS

- [ ] **Step 6: Commit**
```bash
git add packages/engine/src/lifecycle/player-lifecycle.ts packages/engine/src/__tests__/player-lifecycle.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add PlayerLifecycleService — time advancement with aging, exp gain, death check"
```

---

### Task 2: 改造 useWorld — 联动玩家状态

**Files:**
- Modify: `apps/taosim-ui/src/composables/useWorld.ts`

**Risk:** 副作用 — 修改 playerStore，可能触发 GameOver 跳转

- [ ] **Step 1: 改造 useWorld**

读取现有文件，用以下完整内容替换：

```typescript
// apps/taosim-ui/src/composables/useWorld.ts
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { WorldEngine, PlayerLifecycleService } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import type { BigEventLog } from '@taosim/contracts';

export function useWorld() {
  const appStore = useAppStore();
  const playerStore = usePlayerStore();
  const router = useRouter();
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

      // 联动玩家时间
      const playerResult = PlayerLifecycleService.advanceTime(playerStore.character, batch);
      playerStore.character = playerResult.updatedPlayer;
      if (playerResult.died) {
        died = true;
        state.deathMessage = playerResult.causeOfDeath ?? '寿元耗尽';
        state.advancing = false;
        router.push('/game-over');
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
    if (result.died) {
      state.deathMessage = result.causeOfDeath ?? '寿元耗尽';
      router.push('/game-over');
    }
  }

  return { state, advanceMonth, fastForward };
}
```

- [ ] **Step 2: vue-tsc 验证**
Run: `npx vue-tsc --noEmit --project apps/taosim-ui` → PASS

- [ ] **Step 3: Commit**
```bash
git add apps/taosim-ui/src/composables/useWorld.ts
git commit -m "feat(ui): useWorld integrates PlayerLifecycleService — aging, exp, death check on time advance"
```

---

### Task 3: GameOverPage + 路由清理

**Files:**
- Create: `apps/taosim-ui/src/pages/GameOverPage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts`
- Modify: `apps/taosim-ui/src/pages/WorldPage.vue`

- [ ] **Step 1: 创建 GameOverPage.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';

const router = useRouter();
const playerStore = usePlayerStore();

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

function returnHome() {
  playerStore.reset();
  router.push('/');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-16 text-center space-y-8">
    <div class="space-y-4">
      <h1 class="text-4xl font-display text-danger font-bold">道消身殒</h1>
      <div v-if="epitaph" class="bg-surface rounded-lg border border-line p-6 max-w-md mx-auto space-y-3 text-left">
        <div class="text-center pb-3 border-b border-line">
          <div class="text-2xl font-display text-ink">{{ epitaph.name }}</div>
          <div class="text-sm text-muted mt-1">道号 · {{ epitaph.realm }}</div>
        </div>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span class="text-muted">享年：</span>
            <span class="font-semibold text-ink">{{ epitaph.age }} 岁</span>
          </div>
          <div>
            <span class="text-muted">寿数：</span>
            <span class="text-ink">{{ epitaph.maxLifespan }} 年</span>
          </div>
        </div>
        <div class="text-sm pt-3 border-t border-line">
          <span class="text-muted">结局：</span>
          <span v-if="epitaph.soulState === 'PrimordialSoul'" class="text-gold">元神出窍，神魂不灭</span>
          <span v-else-if="epitaph.soulState === 'RemnantSoul'" class="text-ink-soft">残魂消散，归于天地</span>
          <span v-else class="text-danger">{{ epitaph.soulState }}</span>
        </div>
      </div>
      <p v-else class="text-muted">无一生纪要可查</p>
    </div>

    <div class="space-y-3">
      <p class="text-sm text-ink-soft">大道五十，天衍四九。仙途漫漫，来世再续。</p>
      <button @click="returnHome"
        class="px-6 py-3 bg-jade text-white rounded-md font-semibold hover:bg-opacity-90 transition">
        返回首页，重新开始
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 路由加 /game-over，删 /tribulation 死链**

在 routes.ts 的 `/market` 或 `/upgrade` 之后加：
```typescript
  {
    path: '/game-over',
    name: 'game-over',
    component: () => import('../pages/GameOverPage.vue'),
    meta: { title: '道消身殒' },
  },
```

- [ ] **Step 3: 删 WorldPage 中的 /tribulation 死链**

在 WorldPage.vue 模板中，把：
```html
      <router-link to="/tribulation" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        渡劫突破
      </router-link>
```
替换为：
```html
      <router-link to="/crafting" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        百艺坊
      </router-link>
      <router-link to="/inventory" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        行囊
      </router-link>
```

- [ ] **Step 4: vue-tsc 验证**
Run: `npx vue-tsc --noEmit --project apps/taosim-ui` → PASS

- [ ] **Step 5: Commit**
```bash
git add apps/taosim-ui/src/pages/GameOverPage.vue apps/taosim-ui/src/router/routes.ts apps/taosim-ui/src/pages/WorldPage.vue
git commit -m "feat(ui): add GameOverPage, fix dead /tribulation link, world nav to crafting/inventory"
```

---

### Task 4: HUD StatusBar 组件

**Files:**
- Create: `apps/taosim-ui/src/components/StatusBar.vue`

- [ ] **Step 1: 创建 StatusBar.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { usePlayerStore } from '@/stores/player';

const playerStore = usePlayerStore();

const status = computed(() => {
  const c = playerStore.character;
  if (!c) return null;
  const lifespanPct = (c.lifespan.age / c.lifespan.maxLifespan) * 100;
  return {
    realm: c.realm,
    hp: c.hp,
    maxHp: c.maxHp,
    spiritEnergy: c.spiritEnergy.current,
    spiritEnergyMax: c.spiritEnergy.max,
    ap: c.monthlyActionPoints.current,
    apMax: c.monthlyActionPoints.max,
    spiritStones: c.spiritStones ?? 0,
    age: Math.floor(c.lifespan.age),
    maxLifespan: c.lifespan.maxLifespan,
    lifespanPct,
    lifespanWarning: lifespanPct >= 80,
  };
});
</script>

<template>
  <div v-if="status" class="bg-surface border-b border-line px-6 py-2">
    <div class="max-w-content mx-auto flex items-center gap-4 text-xs">
      <!-- 境界 -->
      <span class="font-semibold text-jade">{{ status.realm }}</span>

      <span class="text-line">|</span>

      <!-- HP -->
      <span class="flex items-center gap-1">
        <span class="text-muted">气血</span>
        <span class="text-danger font-semibold">{{ status.hp }}</span>
        <span class="text-muted">/{{ status.maxHp }}</span>
      </span>

      <!-- 灵力 -->
      <span class="flex items-center gap-1">
        <span class="text-muted">灵力</span>
        <span class="text-jade font-semibold">{{ status.spiritEnergy }}</span>
        <span class="text-muted">/{{ status.spiritEnergyMax }}</span>
      </span>

      <!-- AP -->
      <span class="flex items-center gap-1">
        <span class="text-muted">行动</span>
        <span class="text-gold font-semibold">{{ status.ap }}</span>
        <span class="text-muted">/{{ status.apMax }}</span>
      </span>

      <!-- 灵石 -->
      <span class="flex items-center gap-1">
        <span class="text-muted">灵石</span>
        <span class="text-ink font-semibold">{{ status.spiritStones }}</span>
      </span>

      <span class="text-line">|</span>

      <!-- 寿命 -->
      <span class="flex items-center gap-1" :class="status.lifespanWarning ? 'text-danger' : 'text-ink-soft'">
        <span class="text-muted">寿</span>
        <span class="font-semibold">{{ status.age }}</span>
        <span class="text-muted">/{{ status.maxLifespan }}年</span>
        <span v-if="status.lifespanWarning" class="text-danger animate-pulse">⚠</span>
      </span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**
```bash
git add apps/taosim-ui/src/components/StatusBar.vue
git commit -m "feat(ui): add StatusBar HUD — realm/hp/spirit/ap/stones/lifespan always visible"
```

---

### Task 5: AppShell 导航整合 + 嵌入 HUD

**Files:**
- Modify: `apps/taosim-ui/src/components/AppShell.vue`

- [ ] **Step 1: 重写 AppShell.vue**

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';
import StatusBar from './StatusBar.vue';

const router = useRouter();
const appStore = useAppStore();
const playerStore = usePlayerStore();

const navGroups = [
  {
    label: '修仙',
    items: [
      { path: '/world', label: '大世界' },
      { path: '/cultivation', label: '修炼' },
      { path: '/battle', label: '战棋' },
    ],
  },
  {
    label: '百艺',
    items: [
      { path: '/crafting', label: '炼丹炼器' },
      { path: '/upgrade', label: '装备升品' },
    ],
  },
  {
    label: '社交',
    items: [
      { path: '/market', label: '坊市' },
      { path: '/npc-interaction', label: '偶遇' },
      { path: '/npc-trade', label: '交易' },
    ],
  },
  {
    label: '行囊',
    items: [
      { path: '/inventory', label: '背包' },
      { path: '/overworld', label: '大地图' },
      { path: '/faction', label: '宗门' },
    ],
  },
];
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- 顶部导航 -->
    <header class="bg-surface border-b border-line shadow-surface">
      <div class="px-6 py-3 flex items-center justify-between">
        <router-link to="/" class="text-xl font-display text-jade font-bold tracking-wide">
          大千修仙界
        </router-link>

        <!-- 完整导航 -->
        <nav v-if="playerStore.isCreated" class="flex gap-6 text-sm text-ink-soft">
          <div v-for="group in navGroups" :key="group.label" class="flex items-center gap-2">
            <span class="text-[10px] text-muted uppercase tracking-wider">{{ group.label }}</span>
            <router-link
              v-for="item in group.items"
              :key="item.path"
              :to="item.path"
              class="hover:text-jade transition-colors"
              active-class="text-jade font-semibold"
            >{{ item.label }}</router-link>
          </div>
        </nav>

        <!-- 未创角时只显示首页/创角 -->
        <nav v-else class="flex gap-4 text-sm text-ink-soft">
          <router-link to="/" class="hover:text-jade transition-colors" active-class="text-jade font-semibold">首页</router-link>
          <router-link to="/create-character" class="hover:text-jade transition-colors" active-class="text-jade font-semibold">创角</router-link>
        </nav>

        <div class="text-xs text-muted">
          道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
        </div>
      </div>

      <!-- HUD 状态条（仅角色已创建时） -->
      <StatusBar v-if="playerStore.isCreated" />
    </header>

    <!-- 主内容区 -->
    <main class="flex-1">
      <slot />
    </main>
  </div>
</template>
```

- [ ] **Step 2: vue-tsc 验证**
Run: `npx vue-tsc --noEmit --project apps/taosim-ui` → PASS

- [ ] **Step 3: Commit**
```bash
git add apps/taosim-ui/src/components/AppShell.vue
git commit -m "feat(ui): AppShell full navigation groups + embedded StatusBar HUD"
```

---

### Task 6: 行动点消耗 + player store 扩展

**Files:**
- Modify: `apps/taosim-ui/src/stores/player.ts`
- Modify: `apps/taosim-ui/src/pages/CraftingPage.vue`
- Modify: `apps/taosim-ui/src/pages/UpgradePage.vue`

- [ ] **Step 1: player store 加 consumeAp / restoreAp**

在 usePlayerStore 的 return 之前加：
```typescript
  function consumeAp(amount: number = 1): boolean {
    if (!character.value) return false;
    if (character.value.monthlyActionPoints.current < amount) return false;
    character.value.monthlyActionPoints.current -= amount;
    return true;
  }
```
并在 return 对象中加 `consumeAp`。

- [ ] **Step 2: CraftingPage 炼制消耗 AP**

在 craftPill / forgeEquipment / forgeMaster 函数开头加：
```typescript
  if (!playerStore.consumeAp(1)) {
    result.value = '行动点不足（次月恢复）';
    return;
  }
```

- [ ] **Step 3: UpgradePage 升品消耗 AP**

在 handleUpgrade 函数开头（target 检查之后）加：
```typescript
  if (!playerStore.consumeAp(1)) {
    message.value = '行动点不足（次月恢复）';
    return;
  }
```

- [ ] **Step 4: vue-tsc 验证**
Run: `npx vue-tsc --noEmit --project apps/taosim-ui` → PASS

- [ ] **Step 5: Commit**
```bash
git add apps/taosim-ui/src/stores/player.ts apps/taosim-ui/src/pages/CraftingPage.vue apps/taosim-ui/src/pages/UpgradePage.vue
git commit -m "feat(ui): consume 1 AP on craft/forge/upgrade; player store consumeAp helper"
```

---

### Task 7: 最终全量验证

- [ ] **Step 1: 全量测试**
Run: `npx vitest run`
Expected: ALL PASS (146 existing + 10 new = 156+ tests)

- [ ] **Step 2: 全量类型检查**
Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: ALL PASS

- [ ] **Step 3: Commit spec + plan**
```bash
git add docs/superpowers/specs/2026-08-05-phase-8-game-loop-design.md docs/superpowers/plans/2026-08-05-phase-8-game-loop.md
git commit -m "docs: add Phase 8 game loop integration spec and implementation plan"
```

---

## Build Order

```
Task 1 (PlayerLifecycleService TDD)
  → Task 2 (useWorld 联动玩家状态)
  → Task 3 (GameOverPage + 路由清理)  ← 可与 Task 2 并行
  → Task 4 (StatusBar HUD)             ← 可与 Task 3 并行
  → Task 5 (AppShell 导航整合)
  → Task 6 (行动点消耗)
  → Task 7 (最终验证)
```

**Total tasks:** 7
**New tests:** ~10
