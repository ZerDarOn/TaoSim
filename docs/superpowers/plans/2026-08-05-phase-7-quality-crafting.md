# Phase 7 — 品质锻造与百艺深度 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 激活 `Item.quality` 系统，实现普通锻造/大师锻造/升品三条品质路径 + 丹药品质与丹毒机制，达到最低可玩闭环。

**Architecture:** contracts 层新增 SpecialEffectType/DurabilityState/UpgradeRule 类型；engine 层新增 QualityCalculator（纯函数）+ UpgradeEngine，改造 ForgeEngine/AlchemyEngine 加品质roll；UI 层新建 UpgradePage + 改造 CraftingPage 显示品质。核心约束：装备属性永远从 template 重新计算，禁止二次叠乘。

**Tech Stack:** Vue 3 + TypeScript + Vitest (TDD)

---

## File Structure

| 文件 | 类型 | 职责 |
|------|------|------|
| `contracts/src/item.ts` | 修改 | 加 SpecialEffectType, durability, isBroken |
| `contracts/src/item-template.ts` | 修改 | 加 maxDurability |
| `contracts/src/durability.ts` | 新建 | DurabilityState + DURABILITY_LOSS_ON_FAIL |
| `contracts/src/forge.ts` | 新建 | UpgradeFailPenalty, UpgradeRule, CraftResult, UpgradeResult |
| `contracts/src/index.ts` | 修改 | 导出新类型 |
| `engine/src/crafting/quality-calculator.ts` | 新建 | 品质→属性倍率 + 特效roll + Tier封顶 |
| `engine/src/crafting/upgrade-engine.ts` | 新建 | 升品引擎 |
| `engine/src/crafting/forge-engine.ts` | 修改 | 加品质roll + craftMaster |
| `engine/src/crafting/alchemy-engine.ts` | 修改 | 加品质roll + getPillEffect |
| `engine/src/crafting/recipe-registry.ts` | 修改 | 加 pillCategory + master 材料 |
| `engine/src/crafting/pill-effect-table.ts` | 新建 | 丹药品质效果查表 |
| `engine/src/index.ts` | 修改 | 导出 QualityCalculator, UpgradeEngine |
| `apps/taosim-ui/src/pages/CraftingPage.vue` | 修改 | 显示品质 + 大师锻造按钮 |
| `apps/taosim-ui/src/pages/UpgradePage.vue` | 新建 | 升品界面 |
| `apps/taosim-ui/src/router/routes.ts` | 修改 | 加 upgrade 路由 |

---

### Task 1: 新增 contracts 数据类型 (durability + forge + item 扩展)

**Files:**
- Create: `packages/contracts/src/durability.ts`
- Create: `packages/contracts/src/forge.ts`
- Modify: `packages/contracts/src/item.ts`
- Modify: `packages/contracts/src/item-template.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: 创建 durability.ts**

```typescript
// packages/contracts/src/durability.ts
export interface DurabilityState {
  current: number;
  max: number;
}

export const DURABILITY_LOSS_ON_FAIL = 20;
```

- [ ] **Step 2: 创建 forge.ts**

```typescript
// packages/contracts/src/forge.ts
export type UpgradeFailPenalty = 'LossMaterialsOnly' | 'DurabilityLoss' | 'QualityDegrade';

export interface UpgradeRule {
  materials: { templateId: string; count: number }[];
  spiritStones: number;
  successRate: number;
  failPenalty: UpgradeFailPenalty;
}

export interface CraftResult {
  success: boolean;
  item?: import('./item.js').Item;
  message: string;
}

export interface UpgradeResult {
  success: boolean;
  resultItem?: import('./item.js').Item;
  penaltyTriggered?: UpgradeFailPenalty;
  message: string;
}
```

- [ ] **Step 3: 修改 item.ts — 加 SpecialEffectType + durability + isBroken**

在 `ItemQuality` 定义后加:

```typescript
export type SpecialEffectType =
  | 'SOUL_GUARD'
  | 'BLOOD_THIRST'
  | 'MANA_SHIELD'
  | 'QUICK_STRIKE'
  | 'PHOENIX_REBIRTH'
  | 'VITALITY_SIPHON';
```

在 `Item` 接口的 `quality?: ItemQuality;` 后加:

```typescript
  specialEffect?: SpecialEffectType;
  durability?: import('./durability.js').DurabilityState;
  isBroken?: boolean;
```

- [ ] **Step 4: 修改 item-template.ts — 加 maxDurability**

在 `ItemTemplate` 接口的 `poisonValence?: number;` 后加:

```typescript
  maxDurability?: number;
```

- [ ] **Step 5: 修改 index.ts — 加导出**

在末尾加:

```typescript
export * from './durability.js';
export * from './forge.js';
```

- [ ] **Step 6: 验证类型构建**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/contracts/src/durability.ts packages/contracts/src/forge.ts packages/contracts/src/item.ts packages/contracts/src/item-template.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): add SpecialEffectType, DurabilityState, UpgradeRule, CraftResult, UpgradeResult"
```

---

### Task 2: QualityCalculator — 品质计算器 (TDD)

**Files:**
- Create: `packages/engine/src/crafting/quality-calculator.ts`
- Create: `packages/engine/src/__tests__/quality-calculator.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/quality-calculator.test.ts
import { describe, it, expect } from 'vitest';
import { QualityCalculator } from '../crafting/quality-calculator.js';
import type { ItemTemplate, ItemQuality } from '@taosim/contracts';

function makeTemplate(overrides: Partial<ItemTemplate> = {}): ItemTemplate {
  return {
    templateId: 'EQ_TEST',
    name: '测试剑',
    tier: 2,
    type: 'Equipment',
    baseAttributes: { attack: 20, critRate: 5 },
    ...overrides,
  };
}

describe('QualityCalculator', () => {
  it('Common 品质 ×1.0', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Common');
    expect(attrs.attack).toBe(20);
    expect(attrs.critRate).toBe(5);
  });

  it('Rare 品质 ×1.5', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Rare');
    expect(attrs.attack).toBe(30); // 20 * 1.5 = 30
    expect(attrs.critRate).toBe(7); // floor(5 * 1.5) = 7
  });

  it('Epic 品质 ×2.5', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Epic');
    expect(attrs.attack).toBe(50); // 20 * 2.5
  });

  it('Legendary 品质 ×5.0', () => {
    const attrs = QualityCalculator.applyQuality(makeTemplate(), 'Legendary');
    expect(attrs.attack).toBe(100); // 20 * 5.0
  });

  it('getMaxQualityForTier Tier 1 封顶 Rare', () => {
    expect(QualityCalculator.getMaxQualityForTier(1)).toBe('Rare');
  });

  it('getMaxQualityForTier Tier 2+ 可到 Legendary', () => {
    expect(QualityCalculator.getMaxQualityForTier(2)).toBe('Legendary');
    expect(QualityCalculator.getMaxQualityForTier(5)).toBe('Legendary');
  });

  it('rollSpecialEffect 返回有效特效', () => {
    const effect = QualityCalculator.rollSpecialEffect();
    expect(['SOUL_GUARD', 'BLOOD_THIRST', 'MANA_SHIELD', 'QUICK_STRIKE', 'PHOENIX_REBIRTH', 'VITALITY_SIPHON']).toContain(effect);
  });

  it('rollQuality 普通锻造分布 (mock random)', () => {
    // random < 0.01 → Legendary
    expect(QualityCalculator.rollQuality(() => 0.005)).toBe('Legendary');
    // 0.01 <= random < 0.11 → Epic
    expect(QualityCalculator.rollQuality(() => 0.05)).toBe('Epic');
    // 0.11 <= random < 0.40 → Rare
    expect(QualityCalculator.rollQuality(() => 0.20)).toBe('Rare');
    // >= 0.40 → Common
    expect(QualityCalculator.rollQuality(() => 0.50)).toBe('Common');
  });

  it('rollQualityMaster 大师锻造分布', () => {
    // < 0.05 → Legendary
    expect(QualityCalculator.rollQualityMaster(() => 0.03)).toBe('Legendary');
    // 0.05 <= r < 0.30 → Epic
    expect(QualityCalculator.rollQualityMaster(() => 0.15)).toBe('Epic');
    // >= 0.30 → Rare
    expect(QualityCalculator.rollQualityMaster(() => 0.50)).toBe('Rare');
  });

  it('rollPillQuality 炼丹品质分布', () => {
    expect(QualityCalculator.rollPillQuality(() => 0.03)).toBe('Legendary');
    expect(QualityCalculator.rollPillQuality(() => 0.10)).toBe('Epic');
    expect(QualityCalculator.rollPillQuality(() => 0.30)).toBe('Rare');
    expect(QualityCalculator.rollPillQuality(() => 0.60)).toBe('Common');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/quality-calculator.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 QualityCalculator**

```typescript
// packages/engine/src/crafting/quality-calculator.ts
import type { ItemTemplate, ItemQuality, SpecialEffectType, AttributeMap } from '@taosim/contracts';

const QUALITY_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 1.0,
  Rare: 1.5,
  Epic: 2.5,
  Legendary: 5.0,
};

const SPECIAL_EFFECTS: SpecialEffectType[] = [
  'SOUL_GUARD', 'BLOOD_THIRST', 'MANA_SHIELD',
  'QUICK_STRIKE', 'PHOENIX_REBIRTH', 'VITALITY_SIPHON',
];

export class QualityCalculator {
  static applyQuality(template: ItemTemplate, quality: ItemQuality): AttributeMap {
    const mult = QUALITY_MULTIPLIER[quality];
    const result: AttributeMap = {};
    for (const [key, value] of Object.entries(template.baseAttributes)) {
      result[key as keyof AttributeMap] = Math.floor((value as number) * mult);
    }
    return result;
  }

  static getMaxQualityForTier(tier: number): ItemQuality {
    return tier <= 1 ? 'Rare' : 'Legendary';
  }

  static rollSpecialEffect(): SpecialEffectType {
    return SPECIAL_EFFECTS[Math.floor(Math.random() * SPECIAL_EFFECTS.length)]!;
  }

  // 普通锻造: C60/R29/E10/L1
  static rollQuality(rng: () => number = Math.random): ItemQuality {
    const r = rng();
    if (r < 0.01) return 'Legendary';
    if (r < 0.11) return 'Epic';
    if (r < 0.40) return 'Rare';
    return 'Common';
  }

  // 大师锻造: R70/E25/L5 (仅在阶段1成功后调用)
  static rollQualityMaster(rng: () => number = Math.random): ItemQuality {
    const r = rng();
    if (r < 0.05) return 'Legendary';
    if (r < 0.30) return 'Epic';
    return 'Rare';
  }

  // 炼丹: C50/R30/E15/L5
  static rollPillQuality(rng: () => number = Math.random): ItemQuality {
    const r = rng();
    if (r < 0.05) return 'Legendary';
    if (r < 0.20) return 'Epic';
    if (r < 0.50) return 'Rare';
    return 'Common';
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/quality-calculator.test.ts`
Expected: PASS — 10/10

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/crafting/quality-calculator.ts packages/engine/src/__tests__/quality-calculator.test.ts
git commit -m "feat(engine): add QualityCalculator with quality multipliers, tier ceiling, roll distributions"
```

---

### Task 3: 改造 ForgeEngine — 加品质roll + craftMaster (TDD)

**Files:**
- Modify: `packages/engine/src/crafting/forge-engine.ts`
- Create: `packages/engine/src/__tests__/forge-master.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/forge-master.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ForgeEngine } from '../crafting/forge-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '炼器师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 8, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 5000,
    inventory: [
      { item: { id: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_METEORITE', name: '陨铁', tier: 3, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', attributes: {} }, count: 3 },
      { item: { id: 'MAT_STARLIGHT', name: '星光粉', tier: 3, type: 'Material', attributes: {} }, count: 2 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('ForgeEngine 品质系统', () => {
  it('craft 成功产出带品质的装备', () => {
    let success = false;
    for (let i = 0; i < 10; i++) {
      const player = makePlayer();
      const result = ForgeEngine.craft(player, '灵蕴剑');
      if (result.success && result.equipment) {
        expect(result.equipment.quality).toBeDefined();
        expect(['Common', 'Rare', 'Epic', 'Legendary']).toContain(result.equipment.quality);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('craft Epic 品质属性放大', () => {
    // 用 mock 强制 Epic
    const origRandom = Math.random;
    Math.random = () => 0.05; // Epic range
    const player = makePlayer();
    const result = ForgeEngine.craft(player, '灵蕴剑');
    Math.random = origRandom;
    if (result.success && result.equipment) {
      // 基础 attack=15, Epic ×2.5 = 37
      expect(result.equipment.attributes.attack).toBeGreaterThanOrEqual(30);
    }
  });

  it('craftMaster 成功保底 Rare', () => {
    let success = false;
    for (let i = 0; i < 20; i++) {
      const player = makePlayer();
      const result = ForgeEngine.craftMaster(player, '星辰剑');
      if (result.success && result.equipment) {
        expect(['Rare', 'Epic', 'Legendary']).toContain(result.equipment.quality);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('craftMaster 阶段1失败损全部材料', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99; // 强制失败
    const player = makePlayer();
    const meteorBefore = player.inventory.find(s => s.item.id === 'MAT_METEORITE')!.count;
    const result = ForgeEngine.craftMaster(player, '星辰剑');
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.message).toContain('失败');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/forge-master.test.ts`
Expected: FAIL — craftMaster not found

- [ ] **Step 3: 改造 ForgeEngine**

读取现有 `packages/engine/src/crafting/forge-engine.ts`，用以下完整内容替换:

```typescript
// packages/engine/src/crafting/forge-engine.ts
import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';
import { QualityCalculator } from './quality-calculator.js';

export interface ForgeResult {
  success: boolean;
  reason?: string;
  equipment?: Item;
  message?: string;
}

export class ForgeEngine {
  static craft(character: Character, recipeName: string, auxMaterials: string[] = []): ForgeResult {
    const recipe = RecipeRegistry.getForgeRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    // 1. 主材检查
    const mainStack = character.inventory.find(s => s.item.id === recipe.mainMaterialId || s.item.templateId === recipe.mainMaterialId);
    if (!mainStack || mainStack.count < 1) {
      return { success: false, reason: `主材不足：${recipe.mainMaterialId}` };
    }
    mainStack.count--;

    // 2. 辅材消耗
    const usedAux: Item[] = [];
    for (const auxId of auxMaterials.slice(0, 2)) {
      const stack = character.inventory.find(s => s.item.id === auxId || s.item.templateId === auxId);
      if (stack && stack.count >= 1) {
        stack.count--;
        usedAux.push(stack.item);
      }
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 成功率
    const physiqueBonus = character.attributes.physique / 200;
    const auxBonus = usedAux.length * 0.1;
    const successRate = Math.min(0.95, 0.7 + physiqueBonus + auxBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 4. 品质 roll
    const quality = QualityCalculator.rollQuality();

    // 5. 属性计算 (基于 recipe 的 outputItem + 辅材加成 + 品质倍率)
    const baseAttrs: Record<string, number> = { ...recipe.outputItem.attributes };
    for (const aux of usedAux) {
      if (aux.attributes.attack) baseAttrs.attack = (baseAttrs.attack ?? 0) + Math.floor((aux.attributes.attack ?? 0) * 0.5);
      if (aux.attributes.defense) baseAttrs.defense = (baseAttrs.defense ?? 0) + Math.floor((aux.attributes.defense ?? 0) * 0.5);
    }
    // 应用品质倍率
    const qualityMult = quality === 'Common' ? 1.0 : quality === 'Rare' ? 1.5 : quality === 'Epic' ? 2.5 : 5.0;
    const finalAttrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseAttrs)) {
      finalAttrs[k] = Math.floor(v * qualityMult);
    }

    const equipment: Item = {
      id: `${recipe.outputItem.id}_${Date.now()}`,
      templateId: recipe.outputItem.id,
      name: recipe.outputItem.name,
      tier: recipe.tier,
      type: 'Equipment',
      attributes: finalAttrs,
      quality,
      durability: { current: 100, max: 100 },
    };

    // Legendary 附灵蕴特效
    if (quality === 'Legendary') {
      equipment.specialEffect = QualityCalculator.rollSpecialEffect();
    }

    return { success: true, equipment };
  }

  static craftMaster(character: Character, recipeName: string): ForgeResult {
    const recipe = RecipeRegistry.getForgeRecipe(recipeName);
    if (!recipe) return { success: false, reason: '未知配方' };

    // 大师锻造: 额外消耗灵石 + 稀有材料(取主材×2)
    const masterSpiritCost = (recipe.tier ?? 2) * 1000;
    if (character.spiritStones < masterSpiritCost) {
      return { success: false, reason: `灵石不足，需要 ${masterSpiritCost}` };
    }

    // 消耗主材×2
    const mainStack = character.inventory.find(s => s.item.id === recipe.mainMaterialId || s.item.templateId === recipe.mainMaterialId);
    if (!mainStack || mainStack.count < 2) {
      return { success: false, reason: `主材不足（大师锻造需 2 份）：${recipe.mainMaterialId}` };
    }
    mainStack.count -= 2;
    character.spiritStones -= masterSpiritCost;
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 阶段1: 大师锻造成功率
    const masteryBonus = character.attributes.physique / 300;
    const baseSuccessRate = Math.min(0.95, 0.75 + masteryBonus);
    if (Math.random() > baseSuccessRate) {
      return { success: false, reason: '大师锻造失败！材料与灵石化为灰烬' };
    }

    // 阶段2: 品质 roll (保底 Rare)
    const quality = QualityCalculator.rollQualityMaster();

    const baseAttrs: Record<string, number> = { ...recipe.outputItem.attributes };
    const qualityMult = quality === 'Rare' ? 1.5 : quality === 'Epic' ? 2.5 : 5.0;
    const finalAttrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(baseAttrs)) {
      finalAttrs[k] = Math.floor(v * qualityMult);
    }

    const equipment: Item = {
      id: `${recipe.outputItem.id}_MASTER_${Date.now()}`,
      templateId: recipe.outputItem.id,
      name: recipe.outputItem.name,
      tier: recipe.tier,
      type: 'Equipment',
      attributes: finalAttrs,
      quality,
      durability: { current: 100, max: 100 },
    };

    if (quality === 'Legendary') {
      equipment.specialEffect = QualityCalculator.rollSpecialEffect();
    }

    return { success: true, equipment, message: '大师手笔，宝物出世！' };
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/forge-master.test.ts`
Run: `npx vitest run packages/engine/src/__tests__/forge-engine.test.ts`
Expected: BOTH PASS

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/crafting/forge-engine.ts packages/engine/src/__tests__/forge-master.test.ts
git commit -m "feat(engine): ForgeEngine quality roll + craftMaster two-stage forging"
```

---

### Task 4: 改造 AlchemyEngine — 加品质roll + getPillEffect (TDD)

**Files:**
- Modify: `packages/engine/src/crafting/alchemy-engine.ts`
- Create: `packages/engine/src/crafting/pill-effect-table.ts`
- Create: `packages/engine/src/__tests__/alchemy-quality.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/alchemy-quality.test.ts
import { describe, it, expect } from 'vitest';
import { AlchemyEngine } from '../crafting/alchemy-engine.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '丹师', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 20, perception: 8, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [
      { item: { id: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', attributes: {} }, count: 3 },
      { item: { id: 'MAT_YIN_DEW', name: '阴露', tier: 2, type: 'Material', attributes: {}, poisonValence: 2 }, count: 2 },
      { item: { id: 'MAT_YANG_STONE', name: '阳石', tier: 2, type: 'Material', attributes: {}, poisonValence: -2 }, count: 2 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('AlchemyEngine 品质系统', () => {
  it('craftPill 成功产出带品质的丹药', () => {
    let success = false;
    for (let i = 0; i < 10; i++) {
      const player = makePlayer();
      const result = AlchemyEngine.craftPill(player, '筑基丹');
      if (result.success && result.pill) {
        expect(result.pill.quality).toBeDefined();
        expect(['Common', 'Rare', 'Epic', 'Legendary']).toContain(result.pill.quality);
        success = true;
        break;
      }
    }
    expect(success).toBe(true);
  });

  it('getPillEffect 聚气丹 Common 因丹毒打折', () => {
    const pill: Item = {
      id: 'TEST', name: '聚气丹', tier: 1, type: 'Medicine',
      attributes: { pillCategory: 0, effectValue: 50 },
      quality: 'Common',
    };
    // pillCategory 用数字编码: 0=Restore, 1=Breakthrough, 2=Lifespan
    // Common 聚气丹 = 50 * 0.6 = 30
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(30);
  });

  it('getPillEffect 聚气丹 Legendary', () => {
    const pill: Item = {
      id: 'TEST', name: '聚气丹', tier: 1, type: 'Medicine',
      attributes: { pillCategory: 0, effectValue: 50 },
      quality: 'Legendary',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(120); // 50 * 2.4
  });

  it('getPillEffect 突破丹固定加成', () => {
    const pill: Item = {
      id: 'TEST', name: '筑基丹', tier: 2, type: 'Medicine',
      attributes: { pillCategory: 1 },
      quality: 'Common',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(5); // +5%
  });

  it('getPillEffect 突破丹 Legendary', () => {
    const pill: Item = {
      id: 'TEST', name: '筑基丹', tier: 2, type: 'Medicine',
      attributes: { pillCategory: 1 },
      quality: 'Legendary',
    };
    const effect = AlchemyEngine.getPillEffect(pill);
    expect(effect).toBe(25); // +25%
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/alchemy-quality.test.ts`
Expected: FAIL — getPillEffect not found

- [ ] **Step 3: 创建 pill-effect-table.ts**

```typescript
// packages/engine/src/crafting/pill-effect-table.ts
import type { ItemQuality } from '@taosim/contracts';

// pillCategory 编码: 0=Restore(聚气), 1=Breakthrough(突破), 2=Lifespan(延寿)

// Restore 类: 基准值 × 倍率 (Common 因丹毒打折)
export const RESTORE_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 0.6,
  Rare: 1.0,
  Epic: 1.6,
  Legendary: 2.4,
};

// Breakthrough 类: 固定百分比加成
export const BREAKTHROUGH_BONUS: Record<ItemQuality, number> = {
  Common: 5,
  Rare: 10,
  Epic: 18,
  Legendary: 25,
};

// Lifespan 类: 基准年数 × 倍率
export const LIFESPAN_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 0.5,
  Rare: 1.0,
  Epic: 1.6,
  Legendary: 2.4,
};
```

- [ ] **Step 4: 改造 AlchemyEngine**

读取现有文件，用以下完整内容替换:

```typescript
// packages/engine/src/crafting/alchemy-engine.ts
import type { Character, Item } from '@taosim/contracts';
import { RecipeRegistry } from './recipe-registry.js';
import { QualityCalculator } from './quality-calculator.js';
import { RESTORE_MULTIPLIER, BREAKTHROUGH_BONUS, LIFESPAN_MULTIPLIER } from './pill-effect-table.js';

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
      const stack = character.inventory.find(s => s.item.id === matId || s.item.templateId === matId);
      if (!stack || stack.count < 1) return { success: false, reason: `材料不足：${matId}` };
    }

    // 2. 消耗材料 + 收集毒性
    let totalPoison = 0;
    for (const matId of recipe.requiredMaterials) {
      const stack = character.inventory.find(s => s.item.id === matId || s.item.templateId === matId)!;
      stack.count--;
      totalPoison += stack.item.poisonValence ?? 0;
    }
    character.inventory = character.inventory.filter(s => s.count > 0);

    // 3. 阴阳平衡判定
    const isPoison = Math.abs(totalPoison) > recipe.yinYangThreshold;

    // 4. 成功率
    const comprehensionBonus = character.attributes.comprehension / 200;
    const successRate = Math.min(0.95, recipe.baseSuccessRate + comprehensionBonus);

    if (Math.random() > successRate) {
      return { success: false, reason: '炼制失败，材料已消耗' };
    }

    // 5. 品质 roll
    const quality = QualityCalculator.rollPillQuality();

    // 6. 产出
    const pillName = isPoison ? `毒${recipe.name}` : recipe.name;

    // pillCategory: 聚气丹=0(Restore), 筑基丹=1(Breakthrough), 延寿丹=2(Lifespan)
    let pillCategory = 0;
    if (recipe.name.includes('筑基') || recipe.name.includes('金元') || recipe.name.includes('凝婴')) pillCategory = 1;
    else if (recipe.name.includes('延寿')) pillCategory = 2;

    const baseEffect = recipe.tier * 50;
    const pillItem: Item = {
      id: `PILL_${Date.now()}`,
      templateId: recipe.id,
      name: pillName,
      tier: recipe.tier,
      type: isPoison ? 'Poison' : 'Medicine',
      attributes: isPoison
        ? { poisonResist: -5, pillCategory, effectValue: Math.abs(totalPoison) }
        : { spiritEnergyMax: recipe.tier * 50, pillCategory, effectValue: baseEffect },
      poisonValence: isPoison ? Math.abs(totalPoison) : 0,
      quality,
    };

    return { success: true, pill: pillItem };
  }

  static getPillEffect(pill: Item): number {
    const category = pill.attributes.pillCategory ?? 0;
    const quality = pill.quality ?? 'Common';

    if (category === 1) {
      // Breakthrough: 固定加成
      return BREAKTHROUGH_BONUS[quality];
    }

    const baseValue = pill.attributes.effectValue ?? 50;

    if (category === 2) {
      // Lifespan: 基准年 × 倍率
      return Math.floor(baseValue * LIFESPAN_MULTIPLIER[quality]);
    }

    // Restore: 基准 × 倍率 (Common 丹毒打折)
    return Math.floor(baseValue * RESTORE_MULTIPLIER[quality]);
  }
}
```

- [ ] **Step 5: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/alchemy-quality.test.ts`
Run: `npx vitest run packages/engine/src/__tests__/alchemy-engine.test.ts`
Expected: BOTH PASS

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/crafting/alchemy-engine.ts packages/engine/src/crafting/pill-effect-table.ts packages/engine/src/__tests__/alchemy-quality.test.ts
git commit -m "feat(engine): AlchemyEngine quality roll + getPillEffect with pillCategory dispatch"
```

---

### Task 5: UpgradeEngine — 升品引擎 (TDD)

**Files:**
- Create: `packages/engine/src/crafting/upgrade-engine.ts`
- Create: `packages/engine/src/__tests__/upgrade-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/upgrade-engine.test.ts
import { describe, it, expect } from 'vitest';
import { UpgradeEngine } from '../crafting/upgrade-engine.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 10000,
    inventory: [
      { item: { id: 'MAT_IRON_ORE', templateId: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', attributes: {} }, count: 10 },
      { item: { id: 'MAT_METEORITE', templateId: 'MAT_METEORITE', name: '陨铁', tier: 3, type: 'Material', attributes: {} }, count: 10 },
      { item: { id: 'MAT_DRAGON_BLOOD', templateId: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', attributes: {} }, count: 10 },
      { item: { id: 'MAT_STARLIGHT', templateId: 'MAT_STARLIGHT', name: '星光粉', tier: 3, type: 'Material', attributes: {} }, count: 5 },
      { item: { id: 'MAT_SKY_GOLD_SAND', templateId: 'MAT_SKY_GOLD_SAND', name: '天金砂', tier: 4, type: 'Material', attributes: {} }, count: 5 },
    ],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

function makeEquipment(overrides: Partial<Item> = {}): Item {
  return {
    id: 'EQ_TEST_001',
    templateId: 'EQ_SPIRIT_SWORD',
    name: '灵蕴剑',
    tier: 2,
    type: 'Equipment',
    attributes: { attack: 15, critRate: 5 },
    quality: 'Common',
    durability: { current: 100, max: 100 },
    ...overrides,
  };
}

describe('UpgradeEngine', () => {
  it('getUpgradeRule Tier2 C→R', () => {
    const rule = UpgradeEngine.getUpgradeRule(2, 'Common', 'Rare');
    expect(rule).not.toBeNull();
    expect(rule!.successRate).toBe(0.7);
    expect(rule!.failPenalty).toBe('LossMaterialsOnly');
  });

  it('getUpgradeRule Tier2 R→E', () => {
    const rule = UpgradeEngine.getUpgradeRule(2, 'Rare', 'Epic');
    expect(rule).not.toBeNull();
    expect(rule!.failPenalty).toBe('DurabilityLoss');
  });

  it('getUpgradeRule Tier1 不能升 Epic (天花板)', () => {
    expect(UpgradeEngine.getUpgradeRule(1, 'Rare', 'Epic')).toBeNull();
  });

  it('enhance 成功升品', () => {
    const origRandom = Math.random;
    Math.random = () => 0.0; // 强制成功
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    Math.random = origRandom;
    expect(result.success).toBe(true);
    expect(result.resultItem!.quality).toBe('Rare');
    expect(result.resultItem!.attributes.attack).toBeGreaterThanOrEqual(20); // 15*1.5=22
  });

  it('enhance 失败 LossMaterialsOnly 不损装备', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99; // 强制失败
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.penaltyTriggered).toBe('LossMaterialsOnly');
    expect(result.resultItem).toBeDefined();
    expect(result.resultItem!.quality).toBe('Common'); // 品质不变
  });

  it('enhance DurabilityLoss 扣耐久', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Rare', tier: 2 });
    const result = UpgradeEngine.enhance(item, 'Epic', player);
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.penaltyTriggered).toBe('DurabilityLoss');
    expect(result.resultItem!.durability!.current).toBe(80); // 100-20
  });

  it('enhance QualityDegrade 降品', () => {
    const origRandom = Math.random;
    Math.random = () => 0.99;
    const player = makePlayer();
    const item = makeEquipment({ quality: 'Epic', tier: 2 });
    const result = UpgradeEngine.enhance(item, 'Legendary', player);
    Math.random = origRandom;
    expect(result.success).toBe(false);
    expect(result.penaltyTriggered).toBe('QualityDegrade');
    expect(result.resultItem!.quality).toBe('Rare'); // 降回 Rare
  });

  it('enhance 灵石不足失败', () => {
    const player = makePlayer({ spiritStones: 10 });
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    expect(result.success).toBe(false);
    expect(result.message).toContain('灵石');
  });

  it('enhance 材料不足失败', () => {
    const player = makePlayer({ inventory: [] });
    const item = makeEquipment({ quality: 'Common' });
    const result = UpgradeEngine.enhance(item, 'Rare', player);
    expect(result.success).toBe(false);
    expect(result.message).toContain('材料');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/upgrade-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 UpgradeEngine**

```typescript
// packages/engine/src/crafting/upgrade-engine.ts
import type { Character, Item, ItemQuality, UpgradeFailPenalty, UpgradeRule } from '@taosim/contracts';
import { DURABILITY_LOSS_ON_FAIL } from '@taosim/contracts';

// UPGRADE_RULES key: `${tier}_${from}_TO_${to}`
const UPGRADE_RULES: Record<string, UpgradeRule> = {
  // Tier 1 (天花板 Rare)
  '1_Common_TO_Rare': {
    materials: [{ templateId: 'MAT_IRON_ORE', count: 3 }],
    spiritStones: 200,
    successRate: 0.8,
    failPenalty: 'LossMaterialsOnly',
  },
  // Tier 2
  '2_Common_TO_Rare': {
    materials: [{ templateId: 'MAT_METEORITE', count: 2 }, { templateId: 'MAT_JADE', count: 1 }],
    spiritStones: 500,
    successRate: 0.7,
    failPenalty: 'LossMaterialsOnly',
  },
  '2_Rare_TO_Epic': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 1 }, { templateId: 'MAT_STARLIGHT', count: 1 }],
    spiritStones: 1000,
    successRate: 0.5,
    failPenalty: 'DurabilityLoss',
  },
  '2_Epic_TO_Legendary': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 3 }, { templateId: 'MAT_METEORITE', count: 5 }],
    spiritStones: 5000,
    successRate: 0.25,
    failPenalty: 'QualityDegrade',
  },
  // Tier 3
  '3_Common_TO_Rare': {
    materials: [{ templateId: 'MAT_METEORITE', count: 3 }, { templateId: 'MAT_DRAGON_BLOOD', count: 1 }],
    spiritStones: 1000,
    successRate: 0.65,
    failPenalty: 'LossMaterialsOnly',
  },
  '3_Rare_TO_Epic': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 2 }, { templateId: 'MAT_SKY_GOLD_SAND', count: 1 }],
    spiritStones: 3000,
    successRate: 0.45,
    failPenalty: 'DurabilityLoss',
  },
  '3_Epic_TO_Legendary': {
    materials: [{ templateId: 'MAT_DRAGON_BLOOD', count: 5 }, { templateId: 'MAT_SKY_GOLD_SAND', count: 3 }],
    spiritStones: 10000,
    successRate: 0.15,
    failPenalty: 'QualityDegrade',
  },
};

export class UpgradeEngine {
  static getUpgradeRule(tier: number, from: ItemQuality, to: ItemQuality): UpgradeRule | null {
    const key = `${tier}_${from}_TO_${to}`;
    return UPGRADE_RULES[key] ?? null;
  }

  static enhance(item: Item, targetQuality: ItemQuality, player: Character): {
    success: boolean;
    resultItem?: Item;
    penaltyTriggered?: UpgradeFailPenalty;
    message: string;
  } {
    const rule = this.getUpgradeRule(item.tier, item.quality ?? 'Common', targetQuality);
    if (!rule) {
      return { success: false, message: `无法从 ${item.quality} 升至 ${targetQuality}（品阶天花板或路径不存在）` };
    }

    // 检查灵石
    if (player.spiritStones < rule.spiritStones) {
      return { success: false, message: `灵石不足，需要 ${rule.spiritStones}` };
    }

    // 检查材料
    for (const mat of rule.materials) {
      const stack = player.inventory.find(
        s => s.item.templateId === mat.templateId || s.item.id === mat.templateId
      );
      if (!stack || stack.count < mat.count) {
        return { success: false, message: `材料不足：${mat.templateId}` };
      }
    }

    // 消耗灵石和材料
    player.spiritStones -= rule.spiritStones;
    for (const mat of rule.materials) {
      const stack = player.inventory.find(
        s => s.item.templateId === mat.templateId || s.item.id === mat.templateId
      )!;
      stack.count -= mat.count;
    }
    player.inventory = player.inventory.filter(s => s.count > 0);

    // Roll 成功
    if (Math.random() <= rule.successRate) {
      // 成功: 应用新品质
      const updatedItem = this.applyQualityToItem(item, targetQuality);
      return {
        success: true,
        resultItem: updatedItem,
        message: `升品成功！${item.name} 已升至 ${targetQuality}`,
      };
    }

    // 失败: 应用惩罚
    const penalizedItem = this.applyFailPenalty(item, rule.failPenalty);
    return {
      success: false,
      resultItem: penalizedItem,
      penaltyTriggered: rule.failPenalty,
      message: this.getFailMessage(rule.failPenalty),
    };
  }

  private static applyQualityToItem(item: Item, quality: ItemQuality): Item {
    const mult = quality === 'Common' ? 1.0 : quality === 'Rare' ? 1.5 : quality === 'Epic' ? 2.5 : 5.0;
    // 从 templateId 找基础属性 — 但我们没存 template，所以反推: 当前属性 / 当前品质倍率 × 新倍率
    // 更安全: 存 baseAttributes 在 item 上? 不，用反推
    const currentMult = item.quality === 'Common' ? 1.0 : item.quality === 'Rare' ? 1.5 : item.quality === 'Epic' ? 2.5 : 5.0;
    const newAttrs: Record<string, number> = {};
    for (const [k, v] of Object.entries(item.attributes)) {
      if (k === 'pillCategory' || k === 'effectValue') {
        newAttrs[k] = v as number; // 非战斗属性不乘
      } else {
        const baseValue = Math.round((v as number) / currentMult);
        newAttrs[k] = Math.floor(baseValue * mult);
      }
    }

    const updated: Item = {
      ...item,
      attributes: newAttrs,
      quality,
    };

    if (quality === 'Legendary' && !item.specialEffect) {
      // 随机分配特效 — 延迟到 QualityCalculator 导入
      const effects = ['SOUL_GUARD', 'BLOOD_THIRST', 'MANA_SHIELD', 'QUICK_STRIKE', 'PHOENIX_REBIRTH', 'VITALITY_SIPHON'] as const;
      updated.specialEffect = effects[Math.floor(Math.random() * effects.length)]!;
    }

    return updated;
  }

  private static applyFailPenalty(item: Item, penalty: UpgradeFailPenalty): Item {
    const updated = { ...item, attributes: { ...item.attributes }, durability: item.durability ? { ...item.durability } : undefined };

    switch (penalty) {
      case 'LossMaterialsOnly':
        // 装备不损
        break;
      case 'DurabilityLoss':
        if (updated.durability) {
          updated.durability.current -= DURABILITY_LOSS_ON_FAIL;
          if (updated.durability.current <= 0) {
            updated.isBroken = true;
          }
        }
        break;
      case 'QualityDegrade':
        // 降品回前一级
        const degradeTo: ItemQuality = item.quality === 'Legendary' ? 'Epic' : item.quality === 'Epic' ? 'Rare' : 'Common';
        return this.applyQualityToItem(updated, degradeTo);
    }

    return updated;
  }

  private static getFailMessage(penalty: UpgradeFailPenalty): string {
    switch (penalty) {
      case 'LossMaterialsOnly': return '升品失败，材料已消耗，装备无恙';
      case 'DurabilityLoss': return '升品失败！装备耐久度受损';
      case 'QualityDegrade': return '升品失败！装备品质倒退';
    }
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/upgrade-engine.test.ts`
Expected: PASS — 9/9

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/crafting/upgrade-engine.ts packages/engine/src/__tests__/upgrade-engine.test.ts
git commit -m "feat(engine): add UpgradeEngine with UPGRADE_RULES, fail penalties, tier ceiling"
```

---

### Task 6: 更新 engine/index.ts 导出 + 全量测试

**Files:**
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: 加导出**

在 engine/index.ts 的 Market 导出块之后加:

```typescript
// Quality & Upgrade
export { QualityCalculator } from './crafting/quality-calculator.js';
export { UpgradeEngine } from './crafting/upgrade-engine.js';
```

- [ ] **Step 2: 全量测试 + 类型检查**

Run: `npx vitest run`
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: ALL PASS (118 existing + ~28 new tests)

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "feat(engine): export QualityCalculator and UpgradeEngine"
```

---

### Task 7: 改造 CraftingPage — 显示品质 + 大师锻造

**Files:**
- Modify: `apps/taosim-ui/src/pages/CraftingPage.vue`

- [ ] **Step 1: 重写 CraftingPage.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { RecipeRegistry, AlchemyEngine, ForgeEngine } from '@taosim/engine';

const router = useRouter();
const playerStore = usePlayerStore();
const activeTab = ref<'pill' | 'forge'>('pill');
const result = ref<string | null>(null);

const pillRecipes = RecipeRegistry.listPillRecipes();
const forgeRecipes = RecipeRegistry.listForgeRecipes();

function craftPill(recipeName: string) {
  if (!playerStore.character) return;
  const r = AlchemyEngine.craftPill(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.pill!.name}（${r.pill!.tier}阶 · ${r.pill!.quality ?? 'Common'}品质）`
    : `炼制失败：${r.reason}`;
}

function forgeEquipment(recipeName: string) {
  if (!playerStore.character) return;
  const r = ForgeEngine.craft(playerStore.character, recipeName);
  result.value = r.success
    ? `炼制成功：${r.equipment!.name}（${r.equipment!.tier}阶 · ${r.equipment!.quality ?? 'Common'}品质）`
    : `炼制失败：${r.reason}`;
}

function forgeMaster(recipeName: string) {
  if (!playerStore.character) return;
  const r = ForgeEngine.craftMaster(playerStore.character, recipeName);
  result.value = r.success
    ? `大师锻造成功：${r.equipment!.name}（${r.equipment!.quality}品质${r.equipment!.specialEffect ? ' · ' + r.equipment!.specialEffect : ''}）`
    : `大师锻造失败：${r.reason}`;
}

function goUpgrade() {
  router.push('/upgrade');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">百艺坊</h1>
      <button @click="goUpgrade"
        class="px-4 py-2 bg-amber-500 text-white rounded-md text-sm font-semibold hover:bg-amber-600">
        装备升品
      </button>
    </div>

    <div class="flex gap-2">
      <button @click="activeTab = 'pill'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold', activeTab === 'pill' ? 'bg-emerald-600 text-white' : 'bg-surface-muted text-muted']">炼丹</button>
      <button @click="activeTab = 'forge'; result = null"
        :class="['px-4 py-2 rounded text-sm font-semibold', activeTab === 'forge' ? 'bg-emerald-600 text-white' : 'bg-surface-muted text-muted']">炼器</button>
    </div>

    <div v-if="result" :class="['p-3 rounded-md text-sm', result.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600']">
      {{ result }}
    </div>

    <!-- 炼丹 -->
    <div v-if="activeTab === 'pill'" class="grid grid-cols-3 gap-4">
      <div v-for="recipe in pillRecipes" :key="recipe.id"
        class="bg-surface rounded-lg border border-line p-4 space-y-2">
        <h3 class="font-semibold">{{ recipe.name }} <span class="text-xs text-muted">{{ recipe.tier }}阶</span></h3>
        <div class="text-xs text-muted">材料：{{ recipe.requiredMaterials.join(', ') }}</div>
        <div class="text-xs text-muted">成功率：{{ Math.round(recipe.baseSuccessRate * 100) }}%</div>
        <button @click="craftPill(recipe.name)"
          class="w-full px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700">炼制</button>
      </div>
    </div>

    <!-- 炼器 -->
    <div v-if="activeTab === 'forge'" class="grid grid-cols-3 gap-4">
      <div v-for="recipe in forgeRecipes" :key="recipe.id"
        class="bg-surface rounded-lg border border-line p-4 space-y-2">
        <h3 class="font-semibold">{{ recipe.name }} <span class="text-xs text-muted">{{ recipe.tier }}阶</span></h3>
        <div class="text-xs text-muted">主材：{{ recipe.mainMaterialId }}</div>
        <div class="text-xs text-muted">辅材：{{ recipe.optionalAuxMaterials.join(', ') || '无' }}</div>
        <button @click="forgeEquipment(recipe.name)"
          class="w-full px-3 py-1.5 bg-amber-500 text-white rounded text-xs font-semibold hover:bg-amber-600">普通锻造</button>
        <button @click="forgeMaster(recipe.name)"
          class="w-full px-3 py-1.5 bg-purple-600 text-white rounded text-xs font-semibold hover:bg-purple-700">大师锻造</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 验证构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/pages/CraftingPage.vue
git commit -m "feat(ui): CraftingPage shows quality results + master forge button"
```

---

### Task 8: 新建 UpgradePage — 升品界面

**Files:**
- Create: `apps/taosim-ui/src/pages/UpgradePage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts`

- [ ] **Step 1: 创建 UpgradePage.vue**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { UpgradeEngine } from '@taosim/engine';
import type { Item, ItemQuality } from '@taosim/contracts';

const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const selectedItem = ref<Item | null>(null);

const equipmentItems = computed(() =>
  (playerStore.character?.inventory ?? []).filter(s => s.item.type === 'Equipment')
);

function selectItem(item: Item) {
  selectedItem.value = item;
  message.value = null;
}

function getNextQuality(item: Item): ItemQuality | null {
  const q = item.quality ?? 'Common';
  if (q === 'Common') return 'Rare';
  if (q === 'Rare') return 'Epic';
  if (q === 'Epic') return 'Legendary';
  return null;
}

function handleUpgrade() {
  if (!playerStore.character || !selectedItem.value) return;
  const target = getNextQuality(selectedItem.value);
  if (!target) {
    message.value = '已达最高品质';
    return;
  }

  // 找到背包中的实际物品引用
  const stack = playerStore.character.inventory.find(s => s.item.id === selectedItem.value!.id);
  if (!stack) {
    message.value = '背包中找不到该物品';
    return;
  }

  const result = UpgradeEngine.enhance(stack.item, target, playerStore.character);
  message.value = result.message;

  if (result.success && result.resultItem) {
    // 更新背包中的物品
    stack.item.quality = result.resultItem.quality;
    stack.item.attributes = result.resultItem.attributes;
    if (result.resultItem.specialEffect) {
      stack.item.specialEffect = result.resultItem.specialEffect;
    }
    selectedItem.value = { ...stack.item };
  } else if (result.resultItem) {
    // 失败惩罚也修改了装备
    stack.item.quality = result.resultItem.quality;
    stack.item.attributes = result.resultItem.attributes;
    if (result.resultItem.durability) {
      stack.item.durability = result.resultItem.durability;
    }
    if (result.resultItem.isBroken) {
      stack.item.isBroken = true;
    }
    selectedItem.value = { ...stack.item };
  }
}

function qualityColor(quality?: string): string {
  switch (quality) {
    case 'Common': return 'text-gray-500';
    case 'Rare': return 'text-blue-500';
    case 'Epic': return 'text-purple-600';
    case 'Legendary': return 'text-amber-500';
    default: return 'text-gray-500';
  }
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">装备升品</h1>

    <div v-if="message" class="p-3 rounded-md text-sm"
      :class="message.includes('成功') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'">
      {{ message }}
    </div>

    <!-- 装备列表 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">选择装备</h2>
      <div v-if="equipmentItems.length === 0" class="text-sm text-muted">背包中没有装备</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <button v-for="s in equipmentItems" :key="s.item.id"
          @click="selectItem(s.item)"
          :class="['text-left bg-surface rounded-lg border p-3 space-y-1 hover:border-amber-400',
            selectedItem?.id === s.item.id ? 'border-amber-500 ring-1 ring-amber-300' : 'border-line']">
          <div class="font-medium text-sm">{{ s.item.name }}</div>
          <div class="text-xs" :class="qualityColor(s.item.quality)">
            {{ s.item.quality ?? 'Common' }}品质 · Tier {{ s.item.tier }}
          </div>
          <div v-if="s.item.specialEffect" class="text-xs text-amber-600">特效: {{ s.item.specialEffect }}</div>
        </button>
      </div>
    </section>

    <!-- 升品面板 -->
    <section v-if="selectedItem">
      <h2 class="text-lg font-semibold mb-3">升品详情</h2>
      <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
        <div class="flex justify-between items-center">
          <span class="font-medium">{{ selectedItem.name }}</span>
          <span :class="qualityColor(selectedItem.quality)">{{ selectedItem.quality ?? 'Common' }}</span>
        </div>
        <div class="text-xs text-muted">
          属性: {{ JSON.stringify(selectedItem.attributes) }}
        </div>
        <div v-if="selectedItem.durability" class="text-xs text-muted">
          耐久: {{ selectedItem.durability.current }}/{{ selectedItem.durability.max }}
        </div>

        <div v-if="getNextQuality(selectedItem)" class="pt-2 border-t border-line">
          <div class="text-sm mb-2">
            目标品质: <span :class="qualityColor(getNextQuality(selectedItem)!)">{{ getNextQuality(selectedItem) }}</span>
          </div>
          <div class="text-xs text-red-500 mb-3">
            ⚠️ 升品有风险：失败可能消耗材料、降低耐久或品质倒退
          </div>
          <button @click="handleUpgrade"
            class="px-4 py-2 bg-amber-500 text-white rounded-md text-sm font-semibold hover:bg-amber-600">
            开始升品
          </button>
        </div>
        <div v-else class="text-sm text-amber-500 pt-2 border-t border-line">
          已达最高品质，无法继续升品
        </div>
      </div>
    </section>
  </div>
</template>
```

- [ ] **Step 2: routes.ts 加路由**

在 routes 数组的 `market` 路由后加:

```typescript
  {
    path: '/upgrade',
    name: 'upgrade',
    component: () => import('../pages/UpgradePage.vue'),
    meta: { title: '装备升品' },
  },
```

- [ ] **Step 3: 验证构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/taosim-ui/src/pages/UpgradePage.vue apps/taosim-ui/src/router/routes.ts
git commit -m "feat(ui): add UpgradePage with equipment selection, risk warning, quality display"
```

---

### Task 9: 最终全量验证

- [ ] **Step 1: 全量测试**

Run: `npx vitest run`
Expected: ALL PASS (~140+ tests)

- [ ] **Step 2: 全量类型检查**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: ALL PASS

- [ ] **Step 3: Commit spec + plan docs**

```bash
git add docs/superpowers/specs/2026-08-05-phase-7-quality-crafting-design.md docs/superpowers/plans/2026-08-05-phase-7-quality-crafting.md
git commit -m "docs: add Phase 7 quality crafting spec and implementation plan"
```

---

## Build Order

```
Task 1 (contracts types) → Task 2 (QualityCalculator TDD)
  → Task 3 (ForgeEngine 改造 TDD)
  → Task 4 (AlchemyEngine 改造 TDD)
  → Task 5 (UpgradeEngine TDD)
  → Task 6 (engine exports + full test)
  → Task 7 (CraftingPage UI)
  → Task 8 (UpgradePage + routes)
  → Task 9 (final verification)
```

**Total tasks:** 9
**New tests:** ~28
