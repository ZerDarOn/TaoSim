# Phase 3: 炼器炼丹 — 百艺与势力 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 玩家可以炼丹炼器，加入宗门并攀升地位 — 让修仙世界有"成长线"

**Architecture:** 两个独立子系统：炼丹炼器（纯引擎 + UI），宗门势力（引擎 FactionAI + WorldEngine 月度钩子）。炼丹基于阴阳平衡 + 毒性转化，炼器基于主材/辅材阶位组合。宗门 AI 按扩张倾向/好斗度自主行动。

**Tech Stack:** TypeScript + Vitest + Vue 3

**当前基线:** Phase 2 完成（31 tests）。WorldEngine 有 NPC 生老病死 + 人口平衡。`EconomyEngine` 有灵石公式但未接入。`Item.poisonValence` 字段已定义。`Faction`、`FactionRank` 类型已定义。

---

## 文件结构

```
packages/engine/src/
├── crafting/
│   ├── alchemy-engine.ts       # NEW: 炼丹引擎
│   ├── forge-engine.ts         # NEW: 炼器引擎
│   └── recipe-registry.ts      # NEW: 配方注册表
├── faction/
│   └── faction-engine.ts       # NEW: 宗门引擎
├── world/
│   └── world-engine.ts         # MODIFY: 接入宗门月度 Tick

apps/taosim-ui/src/
├── pages/
│   ├── CraftingPage.vue        # NEW: 百艺页面（炼丹+炼器）
│   └── FactionPage.vue         # NEW: 宗门页面
├── stores/
│   ├── player.ts               # MODIFY: 添加灵石字段
│   └── app.ts                  # MODIFY: 保存时含 factions
├── router/
│   └── routes.ts               # MODIFY: 新增路由

packages/engine/src/__tests__/
├── alchemy-engine.test.ts      # NEW
├── forge-engine.test.ts        # NEW
├── recipe-registry.test.ts     # NEW
└── faction-engine.test.ts      # NEW
```

---

### Phase A: 炼丹炼器

#### Task A.1: RecipeRegistry — 配方系统

**Files:**
- Create: `packages/engine/src/crafting/recipe-registry.ts`
- Create: `packages/engine/src/__tests__/recipe-registry.test.ts`

**Risk:** 无（纯数据 + 查询）

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/recipe-registry.test.ts
import { describe, it, expect } from 'vitest';
import { RecipeRegistry, PillRecipe, ForgeRecipe } from '../crafting/recipe-registry.js';

describe('RecipeRegistry', () => {
  it('根据丹药名称查询配方', () => {
    const recipe = RecipeRegistry.getPillRecipe('筑基丹');
    expect(recipe).toBeDefined();
    expect(recipe!.name).toBe('筑基丹');
    expect(recipe!.requiredMaterials.length).toBeGreaterThan(0);
    expect(recipe!.tier).toBe(2);
  });

  it('未知道丹药返回 null', () => {
    expect(RecipeRegistry.getPillRecipe('不存在的丹药')).toBeNull();
  });

  it('根据法宝名称查询炼器配方', () => {
    const recipe = RecipeRegistry.getForgeRecipe('灵蕴剑');
    expect(recipe).toBeDefined();
    expect(recipe!.name).toBe('灵蕴剑');
    expect(recipe!.tier).toBe(2);
  });

  it('列出所有已注册的丹药配方', () => {
    const all = RecipeRegistry.listPillRecipes();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: 实现 RecipeRegistry**

```typescript
// packages/engine/src/crafting/recipe-registry.ts
export interface PillRecipe {
  type: 'pill';
  id: string;
  name: string;
  tier: number;
  requiredMaterials: string[];       // item IDs
  yinYangThreshold: number;          // 阴阳平衡安全区间上限
  baseSuccessRate: number;
}

export interface ForgeRecipe {
  type: 'forge';
  id: string;
  name: string;
  tier: number;
  mainMaterialId: string;            // 主材 item ID
  optionalAuxMaterials: string[];    // 辅材 item IDs（至多 2 种）
  outputItem: {
    id: string;
    name: string;
    type: 'Equipment';
    attributes: Record<string, number>;
  };
}

const PILL_RECIPES: PillRecipe[] = [
  {
    type: 'pill', id: 'RECIPE_FOUNDATION_PILL', name: '筑基丹', tier: 2,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_YIN_DEW', 'MAT_YANG_STONE'],
    yinYangThreshold: 0.5, baseSuccessRate: 0.7,
  },
  {
    type: 'pill', id: 'RECIPE_QI_PILL', name: '聚气丹', tier: 1,
    requiredMaterials: ['MAT_SPIRIT_GRASS', 'MAT_BLOOD_FLOWER'],
    yinYangThreshold: 0.6, baseSuccessRate: 0.9,
  },
  {
    type: 'pill', id: 'RECIPE_LONGEVITY_PILL', name: '延寿丹', tier: 3,
    requiredMaterials: ['MAT_YIN_DEW', 'MAT_YANG_STONE', 'MAT_DRAGON_BLOOD', 'MAT_PHOENIX_FEATHER'],
    yinYangThreshold: 0.4, baseSuccessRate: 0.4,
  },
];

const FORGE_RECIPES: ForgeRecipe[] = [
  {
    type: 'forge', id: 'RECIPE_SPIRIT_SWORD', name: '灵蕴剑', tier: 2,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: ['MAT_SPIRIT_STONE'],
    outputItem: { id: 'ITEM_SPIRIT_SWORD', name: '灵蕴剑', type: 'Equipment', attributes: { attack: 15, critRate: 5 } },
  },
  {
    type: 'forge', id: 'RECIPE_SPIRIT_ARMOR', name: '灵甲', tier: 2,
    mainMaterialId: 'MAT_IRON_ORE',
    optionalAuxMaterials: ['MAT_JADE'],
    outputItem: { id: 'ITEM_SPIRIT_ARMOR', name: '灵甲', type: 'Equipment', attributes: { defense: 10, physique: 2 } },
  },
  {
    type: 'forge', id: 'RECIPE_STAR_SWORD', name: '星辰剑', tier: 3,
    mainMaterialId: 'MAT_METEORITE',
    optionalAuxMaterials: ['MAT_SPIRIT_STONE', 'MAT_STARLIGHT'],
    outputItem: { id: 'ITEM_STAR_SWORD', name: '星辰剑', type: 'Equipment', attributes: { attack: 30, critRate: 10, agility: 3 } },
  },
];

export class RecipeRegistry {
  static getPillRecipe(name: string): PillRecipe | null {
    return PILL_RECIPES.find(r => r.name === name) ?? null;
  }

  static getForgeRecipe(name: string): ForgeRecipe | null {
    return FORGE_RECIPES.find(r => r.name === name) ?? null;
  }

  static listPillRecipes(): PillRecipe[] {
    return [...PILL_RECIPES];
  }

  static listForgeRecipes(): ForgeRecipe[] {
    return [...FORGE_RECIPES];
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/recipe-registry.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/crafting/recipe-registry.ts packages/engine/src/__tests__/recipe-registry.test.ts
git commit -m "feat(engine): add RecipeRegistry — pill & forge recipe lookup"
```

---

#### Task A.2: AlchemyEngine — 炼丹引擎（阴阳平衡 + 毒性转化）

**Files:**
- Create: `packages/engine/src/crafting/alchemy-engine.ts`
- Create: `packages/engine/src/__tests__/alchemy-engine.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/alchemy-engine.test.ts
import { describe, it, expect } from 'vitest';
import { AlchemyEngine } from '../crafting/alchemy-engine.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'PLAYER', name: '丹师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 10, perception: 8, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    inventory: [
      { item: { id: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', attributes: {}, poisonValence: 0 }, count: 3 },
      { item: { id: 'MAT_YIN_DEW', name: '阴露', tier: 1, type: 'Material', attributes: {}, poisonValence: 2 }, count: 2 },
      { item: { id: 'MAT_YANG_STONE', name: '阳石', tier: 1, type: 'Material', attributes: {}, poisonValence: -2 }, count: 2 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('AlchemyEngine', () => {
  it('材料足够时成功炼制筑基丹', () => {
    const player = makePlayer();
    const result = AlchemyEngine.craftPill(player, '筑基丹');
    expect(result.success).toBe(true);
    expect(result.pill).toBeDefined();
    expect(result.pill!.name).toBe('筑基丹');
    // 消耗了 3 种材料（灵草、阴露、阳石各 1 个）
    const grass = player.inventory.find(s => s.item.id === 'MAT_SPIRIT_GRASS');
    expect(grass!.count).toBe(2); // 3 - 1
  });

  it('材料不足时炼制失败', () => {
    const player = makePlayer({ inventory: [] });
    const result = AlchemyEngine.craftPill(player, '筑基丹');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('材料不足');
  });

  it('高毒性材料导致毒丹转化', () => {
    const player = makePlayer({
      inventory: [
        { item: { id: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', attributes: {}, poisonValence: 0 }, count: 3 },
        { item: { id: 'MAT_YIN_DEW', name: '阴露', tier: 1, type: 'Material', attributes: {}, poisonValence: 10 }, count: 2 },
        { item: { id: 'MAT_YANG_STONE', name: '阳石', tier: 1, type: 'Material', attributes: {}, poisonValence: -1 }, count: 2 },
      ],
    });
    const result = AlchemyEngine.craftPill(player, '筑基丹');
    expect(result.success).toBe(true);
    expect(result.pill).toBeDefined();
    expect(result.pill!.name).toContain('毒');
  });

  it('悟性影响成功率', () => {
    const genius = makePlayer({ attributes: { physique: 5, comprehension: 100, perception: 8, agility: 5, luck: 5 } });
    // 高悟性几乎必定成功
    let successes = 0;
    for (let i = 0; i < 20; i++) {
      const player = makePlayer({ ...genius, inventory: [...genius.inventory.map(s => ({ ...s }))] });
      if (AlchemyEngine.craftPill(player, '筑基丹').success) successes++;
    }
    expect(successes).toBeGreaterThanOrEqual(15);
  });
});
```

- [ ] **Step 2: 实现 AlchemyEngine**

```typescript
// packages/engine/src/crafting/alchemy-engine.ts
import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';

export interface CraftResult {
  success: boolean;
  reason?: string;
  pill?: Item;
}

export class AlchemyEngine {
  static craftPill(character: Character, recipeName: string): CraftResult {
    const recipe = RecipeRegistry.getPillRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    // 1. 材料检查
    for (const matId of recipe.requiredMaterials) {
      const stack = character.inventory.find(s => s.item.id === matId);
      if (!stack || stack.count < 1) return { success: false, reason: `材料不足：${matId}` };
    }

    // 2. 消耗材料 + 收集毒性
    let totalPoison = 0;
    const consumed: { id: string; poison: number }[] = [];
    for (const matId of recipe.requiredMaterials) {
      const stack = character.inventory.find(s => s.item.id === matId)!;
      stack.count--;
      const poison = stack.item.poisonValence ?? 0;
      totalPoison += poison;
      consumed.push({ id: matId, poison });
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 阴阳平衡判定（|totalPoison| > yinYangThreshold → 毒丹）
    const isPoison = Math.abs(totalPoison) > recipe.yinYangThreshold;

    // 4. 成功率：基础成功率 × (1 + 悟性/200)
    const comprehensionBonus = character.attributes.comprehension / 200;
    const successRate = Math.min(0.95, recipe.baseSuccessRate + comprehensionBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 5. 产出
    const pillName = isPoison ? `毒${recipe.name}` : recipe.name;
    const pillItem: Item = {
      id: `PILL_${Date.now()}`,
      name: pillName,
      tier: recipe.tier,
      type: isPoison ? 'Poison' : 'Medicine',
      attributes: isPoison ? { poisonResist: -5 } : { spiritEnergyMax: recipe.tier * 50 },
      poisonValence: isPoison ? Math.abs(totalPoison) : 0,
    };

    return { success: true, pill: pillItem };
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/alchemy-engine.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/crafting/alchemy-engine.ts packages/engine/src/__tests__/alchemy-engine.test.ts
git commit -m "feat(engine): add AlchemyEngine — yin-yang balance + poison conversion"
```

---

#### Task A.3: ForgeEngine — 炼器引擎

**Files:**
- Create: `packages/engine/src/crafting/forge-engine.ts`
- Create: `packages/engine/src/__tests__/forge-engine.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/forge-engine.test.ts
import { describe, it, expect } from 'vitest';
import { ForgeEngine } from '../crafting/forge-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P', name: '铸剑师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    inventory: [
      { item: { id: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', attributes: {} }, count: 2 },
      { item: { id: 'MAT_SPIRIT_STONE', name: '灵石', tier: 2, type: 'Material', attributes: {} }, count: 3 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('ForgeEngine', () => {
  it('主材足够时成功炼制法宝', () => {
    const player = makePlayer();
    const result = ForgeEngine.craft(player, '灵蕴剑');
    expect(result.success).toBe(true);
    expect(result.equipment).toBeDefined();
    expect(result.equipment!.name).toBe('灵蕴剑');
    expect(result.equipment!.tier).toBe(2);
  });

  it('主材不足时炼制失败', () => {
    const player = makePlayer({ inventory: [] });
    const result = ForgeEngine.craft(player, '灵蕴剑');
    expect(result.success).toBe(false);
    expect(result.reason).toContain('主材');
  });

  it('加入辅材提升属性', () => {
    const player = makePlayer();
    const result = ForgeEngine.craft(player, '灵蕴剑', ['MAT_SPIRIT_STONE']);
    expect(result.success).toBe(true);
    // 加入灵石辅材后，critRate 应提升
    expect(result.equipment!.attributes.critRate!).toBeGreaterThanOrEqual(5);
  });

  it('根骨影响炼制成功率', () => {
    let successes = 0;
    for (let i = 0; i < 20; i++) {
      const player = makePlayer({ attributes: { physique: 100, comprehension: 5, perception: 5, agility: 5, luck: 5 } });
      if (ForgeEngine.craft(player, '灵蕴剑').success) successes++;
    }
    expect(successes).toBeGreaterThanOrEqual(18);
  });
});
```

- [ ] **Step 2: 实现 ForgeEngine**

```typescript
// packages/engine/src/crafting/forge-engine.ts
import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';

export interface ForgeResult {
  success: boolean;
  reason?: string;
  equipment?: Item;
}

export class ForgeEngine {
  static craft(character: Character, recipeName: string, auxMaterials: string[] = []): ForgeResult {
    const recipe = RecipeRegistry.getForgeRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    // 1. 主材检查
    const mainStack = character.inventory.find(s => s.item.id === recipe.mainMaterialId);
    if (!mainStack || mainStack.count < 1) {
      return { success: false, reason: `主材不足：${recipe.mainMaterialId}` };
    }
    mainStack.count--;

    // 2. 辅材检查与消耗
    const usedAux: Item[] = [];
    for (const auxId of auxMaterials.slice(0, 2)) {
      const stack = character.inventory.find(s => s.item.id === auxId);
      if (stack && stack.count >= 1) {
        stack.count--;
        usedAux.push(stack.item);
      }
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 成功率：基础 0.7 × (1 + 根骨/200) + 辅材加成
    const physiqueBonus = character.attributes.physique / 200;
    const auxBonus = usedAux.length * 0.1;
    const successRate = Math.min(0.95, 0.7 + physiqueBonus + auxBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 4. 产出（辅材提升属性）
    const attributes = { ...recipe.outputItem.attributes };
    for (const aux of usedAux) {
      if (aux.attributes.attack) attributes.attack = (attributes.attack ?? 0) + Math.floor(aux.attributes.attack * 0.5);
      if (aux.attributes.defense) attributes.defense = (attributes.defense ?? 0) + Math.floor(aux.attributes.defense * 0.5);
      if (aux.attributes.critRate) attributes.critRate = (attributes.critRate ?? 0) + Math.floor(aux.attributes.critRate * 0.3);
    }

    const equipment: Item = {
      id: `${recipe.outputItem.id}_${Date.now()}`,
      name: recipe.outputItem.name,
      tier: recipe.tier,
      type: 'Equipment',
      attributes,
    };

    return { success: true, equipment };
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/forge-engine.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/crafting/forge-engine.ts packages/engine/src/__tests__/forge-engine.test.ts
git commit -m "feat(engine): add ForgeEngine — main/aux material forging"
```

---

#### Task A.4: CraftingPage — 百艺 UI

**Files:**
- Create: `apps/taosim-ui/src/pages/CraftingPage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts`
- Modify: `packages/engine/src/index.ts` — 导出 crafting 模块

- [ ] **Step 1: 更新 engine 导出**

```typescript
// packages/engine/src/index.ts — 添加：
export { RecipeRegistry } from './crafting/recipe-registry.js';
export { AlchemyEngine } from './crafting/alchemy-engine.js';
export { ForgeEngine } from './crafting/forge-engine.js';
```

- [ ] **Step 2: 创建 CraftingPage**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { RecipeRegistry, AlchemyEngine, ForgeEngine } from '@taosim/engine';

const playerStore = usePlayerStore();
const activeTab = ref<'pill' | 'forge'>('pill');
const result = ref<string | null>(null);

const pillRecipes = RecipeRegistry.listPillRecipes();
const forgeRecipes = RecipeRegistry.listForgeRecipes();

function craftPill(recipeName: string) {
  if (!playerStore.character) return;
  const r = AlchemyEngine.craftPill(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.pill!.name}（${r.pill!.tier} 阶）`
    : `炼制失败：${r.reason}`;
}

function forgeEquipment(recipeName: string) {
  if (!playerStore.character) return;
  const r = ForgeEngine.craft(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.equipment!.name}（${r.equipment!.tier} 阶，属性 ${JSON.stringify(r.equipment!.attributes)}）`
    : `炼制失败：${r.reason}`;
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">百艺坊</h1>

    <!-- Tab 切换 -->
    <div class="flex gap-2">
      <button @click="activeTab = 'pill'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold', activeTab === 'pill' ? 'bg-jade text-white' : 'bg-surface-muted text-ink-soft']">炼丹</button>
      <button @click="activeTab = 'forge'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold', activeTab === 'forge' ? 'bg-jade text-white' : 'bg-surface-muted text-ink-soft']">炼器</button>
    </div>

    <!-- 结果提示 -->
    <div v-if="result" :class="['p-3 rounded-md text-sm', result.includes('成功') ? 'bg-jade-soft text-jade' : 'bg-red-50 text-danger']">
      {{ result }}
    </div>

    <!-- 炼丹 -->
    <div v-if="activeTab === 'pill'" class="grid grid-cols-3 gap-4">
      <div v-for="recipe in pillRecipes" :key="recipe.id"
        class="bg-surface rounded-lg border border-line p-4 space-y-2">
        <h3 class="font-semibold">{{ recipe.name }} <span class="text-xs text-muted">{{ recipe.tier }}阶</span></h3>
        <div class="text-xs text-ink-soft">材料：{{ recipe.requiredMaterials.join(', ') }}</div>
        <div class="text-xs text-muted">成功率：{{ Math.round(recipe.baseSuccessRate * 100) }}%</div>
        <button @click="craftPill(recipe.name)"
          class="w-full px-3 py-1.5 bg-jade text-white rounded text-xs font-semibold">炼制</button>
      </div>
    </div>

    <!-- 炼器 -->
    <div v-if="activeTab === 'forge'" class="grid grid-cols-3 gap-4">
      <div v-for="recipe in forgeRecipes" :key="recipe.id"
        class="bg-surface rounded-lg border border-line p-4 space-y-2">
        <h3 class="font-semibold">{{ recipe.name }} <span class="text-xs text-muted">{{ recipe.tier }}阶</span></h3>
        <div class="text-xs text-ink-soft">主材：{{ recipe.mainMaterialId }}</div>
        <div class="text-xs text-muted">辅材：{{ recipe.optionalAuxMaterials.join(', ') || '无' }}</div>
        <button @click="forgeEquipment(recipe.name)"
          class="w-full px-3 py-1.5 bg-gold text-white rounded text-xs font-semibold">炼制</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 添加路由**

```typescript
// apps/taosim-ui/src/router/routes.ts — 添加：
{
  path: '/crafting',
  name: 'crafting',
  component: () => import('../pages/CraftingPage.vue'),
  meta: { title: '百艺' },
},
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck -w @taosim/taosim-ui
```

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/pages/CraftingPage.vue apps/taosim-ui/src/router/routes.ts packages/engine/src/index.ts
git commit -m "feat(ui): add CraftingPage — pill alchemy + equipment forge"
```

---

### Phase B: 宗门势力

#### Task B.1: FactionEngine — 加入/贡献/晋升

**Files:**
- Create: `packages/engine/src/faction/faction-engine.ts`
- Create: `packages/engine/src/__tests__/faction-engine.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/faction-engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { FactionEngine } from '../faction/faction-engine.js';
import type { Faction, Character } from '@taosim/contracts';

function makeFaction(overrides: Partial<Faction> = {}): Faction {
  return {
    id: 'FACT_TEST', name: '青云宗', alignment: 'Righteous',
    leaderId: 'NPC_LEADER', members: ['NPC_LEADER'], territories: ['NODE_SECT'],
    spiritVeinLevel: 2, treasurySpiritStones: 5000,
    diplomacy: {}, aiPolicy: { expansionism: 0.3, aggression: 0.2 },
    ...overrides,
  };
}

function makeChar(id: string, overrides: Partial<Character> = {}): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_5', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 25, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 150, maxHp: 150, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('FactionEngine', () => {
  it('散修可加入宗门成为弟子', () => {
    const faction = makeFaction();
    const player = makeChar('P');
    const result = FactionEngine.joinFaction(player, faction);
    expect(result.success).toBe(true);
    expect(player.factionId).toBe('FACT_TEST');
    expect(player.factionRank).toBe('Disciple');
  });

  it('已有宗门的角色无法加入另一宗门', () => {
    const faction = makeFaction();
    const player = makeChar('P', { factionId: 'OTHER_FACTION' });
    const result = FactionEngine.joinFaction(player, faction);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('已有');
  });

  it('贡献灵石可提升宗门贡献度', () => {
    const faction = makeFaction({ treasurySpiritStones: 1000 });
    const result = FactionEngine.contribute(faction, 500);
    expect(result.success).toBe(true);
    expect(faction.treasurySpiritStones).toBe(1500);
  });

  it('贡献度达标可晋升执事', () => {
    const player = makeChar('P', { factionId: 'FACT_TEST', factionRank: 'Disciple' });
    const result = FactionEngine.promote(player, 1000);
    expect(result.success).toBe(true);
    expect(player.factionRank).toBe('Deacon');
  });

  it('贡献度不足晋升失败', () => {
    const player = makeChar('P', { factionId: 'FACT_TEST', factionRank: 'Disciple' });
    const result = FactionEngine.promote(player, 100);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: 实现 FactionEngine**

```typescript
// packages/engine/src/faction/faction-engine.ts
import type { Character, Faction, FactionRank } from '@taosim/contracts';

interface ActionResult {
  success: boolean;
  reason?: string;
}

const RANK_THRESHOLDS: Record<FactionRank, number> = {
  Disciple: 0,
  Deacon: 500,
  Elder: 2000,
  Leader: 5000,
};

const RANK_ORDER: FactionRank[] = ['Disciple', 'Deacon', 'Elder', 'Leader'];

export class FactionEngine {
  static joinFaction(character: Character, faction: Faction): ActionResult {
    if (character.factionId) return { success: false, reason: '已有宗门归属' };
    character.factionId = faction.id;
    character.factionRank = 'Disciple';
    faction.members.push(character.id);
    return { success: true };
  }

  static leaveFaction(character: Character, faction: Faction): ActionResult {
    if (!character.factionId || character.factionId !== faction.id) {
      return { success: false, reason: '非本宗门成员' };
    }
    character.factionId = undefined;
    character.factionRank = undefined;
    faction.members = faction.members.filter(id => id !== character.id);
    // 背叛会导致通缉
    character.wantedLevels[faction.id] = (character.wantedLevels[faction.id] ?? 0) + 3;
    return { success: true };
  }

  static contribute(faction: Faction, amount: number): ActionResult {
    if (amount <= 0) return { success: false, reason: '无效贡献' };
    faction.treasurySpiritStones += amount;
    return { success: true };
  }

  static promote(character: Character, contribution: number): ActionResult {
    if (!character.factionRank) return { success: false, reason: '非宗门成员' };

    const currentIdx = RANK_ORDER.indexOf(character.factionRank);
    if (currentIdx === -1 || currentIdx >= RANK_ORDER.length - 1) {
      return { success: false, reason: '已是最高阶位' };
    }

    const nextRank = RANK_ORDER[currentIdx + 1]!;
    const threshold = RANK_THRESHOLDS[nextRank]!;

    if (contribution < threshold) {
      return { success: false, reason: `贡献度不足（需 ${threshold}）` };
    }

    character.factionRank = nextRank;
    return { success: true };
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/faction-engine.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 4: 更新 engine 索引并 Commit**

```bash
# 添加导出后：
git add packages/engine/src/faction/ packages/engine/src/__tests__/faction-engine.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add FactionEngine — join/contribute/promote/leave"
```

---

#### Task B.2: 宗门月度 AI + WorldEngine 集成

**Files:**
- Modify: `packages/engine/src/world/world-engine.ts` — 添加宗门 Tick
- Modify: `packages/engine/src/index.ts` — 导出

- [ ] **Step 1: 在 WorldEngine 中添加宗门月度逻辑**

在 WorldEngine 中添加属性：

```typescript
private factions: Map<string, Faction> = new Map();
```

在 `step()` 方法中 NPC 人口检查之后添加：

```typescript
// 4. 宗门月度维护
for (const [, faction] of this.factions) {
  const maintenance = EconomyEngine.spiritVeinMaintenanceCost(faction.spiritVeinLevel);
  faction.treasurySpiritStones -= maintenance;
  if (faction.treasurySpiritStones < 0) {
    faction.treasurySpiritStones = 0;
    // 灵石枯竭降级灵脉
    if (faction.spiritVeinLevel > 1) {
      faction.spiritVeinLevel--;
      events.push({
        id: this.generateEventId(),
        year: this.state.currentYear, month: this.state.currentMonth,
        isMajorEvent: true,
        title: `${faction.name} 灵脉降级`,
        description: `${faction.name} 灵石耗尽，灵脉降至 ${faction.spiritVeinLevel} 阶`,
        involvedCharacterIds: [],
      });
    }
  }
}
```

- [ ] **Step 2: 运行测试确认不破坏现有**

```bash
npm run test -w @taosim/engine -- src/__tests__/world-engine.test.ts
```
Expected: 5 tests still PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/world/world-engine.ts
git commit -m "feat(engine): integrate faction monthly maintenance into WorldEngine"
```

---

#### Task B.3: FactionPage UI

**Files:**
- Create: `apps/taosim-ui/src/pages/FactionPage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts`

- [ ] **Step 1: 创建 FactionPage**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { FactionEngine } from '@taosim/engine';
import type { Faction } from '@taosim/contracts';

const playerStore = usePlayerStore();
const result = ref<string | null>(null);
const contribution = ref(100);

// Mock 宗门数据（后续从 WorldEngine 读取）
const mockFaction: Faction = {
  id: 'FACT_TEST', name: '青云宗', alignment: 'Righteous',
  leaderId: 'NPC_LEADER', members: [], territories: [],
  spiritVeinLevel: 2, treasurySpiritStones: 5000,
  diplomacy: {},
  aiPolicy: { expansionism: 0.3, aggression: 0.2 },
};

function handleJoin() {
  if (!playerStore.character) return;
  const r = FactionEngine.joinFaction(playerStore.character, mockFaction);
  result.value = r.success ? '成功加入青云宗！' : r.reason ?? '失败';
}

function handleLeave() {
  if (!playerStore.character) return;
  const r = FactionEngine.leaveFaction(playerStore.character, mockFaction);
  result.value = r.success ? '已退出宗门' : r.reason ?? '失败';
}

function handleContribute() {
  const r = FactionEngine.contribute(mockFaction, contribution.value);
  result.value = r.success ? `贡献 ${contribution.value} 灵石成功` : r.reason ?? '失败';
}

function handlePromote() {
  if (!playerStore.character) return;
  // simplified: pass mock contribution
  const r = FactionEngine.promote(playerStore.character, contribution.value);
  result.value = r.success ? `晋升成功：${playerStore.character.factionRank}` : r.reason ?? '失败';
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">宗门 — {{ playerStore.character?.factionId ? mockFaction.name : '无归属' }}</h1>

    <div class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div><span class="text-muted">灵脉阶位：</span>{{ mockFaction.spiritVeinLevel }} 阶</div>
      <div><span class="text-muted">金库：</span>{{ mockFaction.treasurySpiritStones }} 灵石</div>
      <div><span class="text-muted">成员数：</span>{{ mockFaction.members.length }}</div>
      <div v-if="playerStore.character?.factionRank">
        <span class="text-muted">我的阶位：</span>
        <span class="font-semibold text-jade">{{ playerStore.character.factionRank }}</span>
      </div>
    </div>

    <div v-if="result" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ result }}</div>

    <div class="flex gap-3">
      <button v-if="!playerStore.character?.factionId" @click="handleJoin"
        class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold">加入青云宗</button>
      <button v-if="playerStore.character?.factionId" @click="handleLeave"
        class="px-4 py-2 border border-danger text-danger rounded-md text-sm">退出宗门</button>
    </div>

    <div v-if="playerStore.character?.factionId" class="bg-surface rounded-lg border border-line p-4 space-y-3">
      <h3 class="text-sm font-semibold">宗门贡献</h3>
      <div class="flex gap-2 items-center">
        <input v-model.number="contribution" type="number" min="1"
          class="w-24 px-3 py-1 border border-line rounded text-sm" />
        <button @click="handleContribute" class="px-3 py-1 bg-gold text-white rounded text-xs">贡献灵石</button>
        <button @click="handlePromote" class="px-3 py-1 border border-line rounded text-xs">申请晋升</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 添加路由**

```typescript
// apps/taosim-ui/src/router/routes.ts — 添加：
{
  path: '/faction',
  name: 'faction',
  component: () => import('../pages/FactionPage.vue'),
  meta: { title: '宗门' },
},
```

- [ ] **Step 3: Typecheck & Commit**

```bash
npm run typecheck -w @taosim/taosim-ui
```

```bash
git add apps/taosim-ui/src/pages/FactionPage.vue apps/taosim-ui/src/router/routes.ts
git commit -m "feat(ui): add FactionPage — join/contribute/promote faction"
```

---

### Phase C: 集成验证

#### Task C.1: 全量测试 + 推送

- [ ] **Step 1: 运行全量检查**

```bash
npm run check
```
Expected: typecheck 全通过，所有测试 PASS（目标：31 + 17 = 48 个）

- [ ] **Step 2: Commit & Push**

```bash
git add -A
git commit -m "chore: Phase 3 integrated — crafting + faction systems"
git push
```

---

## 总览

| Phase | 任务数 | 新增文件 | 修改文件 | 新测试 | 核心交付 |
|-------|--------|----------|----------|--------|----------|
| A (炼丹炼器) | 4 | 5 | 2 | 12 tests | AlchemyEngine + ForgeEngine + CraftingPage |
| B (宗门势力) | 3 | 2 | 3 | 5 tests | FactionEngine + 月度维护 + FactionPage |
| C (集成) | 1 | 0 | 0 | — | 全量验证 + push |
| **合计** | **8** | **7** | **5** | **17 tests** | **两大玩法系统** |

**可并行：** Phase A (炼丹炼器) 与 Phase B (宗门) 完全独立，可同时开发。
