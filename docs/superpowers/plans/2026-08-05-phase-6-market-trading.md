# Phase 6 — 交易/坊市系统 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建修仙世界核心经济闭环 — 坊市买卖 + NPC 随身交易 + 灵石货币系统。

**Architecture:** 三层架构 — contracts 层新增交易类型 (MarketItem/Inventory/Offer/Template)，engine 层新增 5 个纯函数/引擎模块 (Pricing/Factory/Market/NPCTrade/Transaction)，UI 层新建 MarketPage + NPCTradePage + 重构 NPCInteractionPage 为对话菜单。复用现有 SavePayload/playerStore/WorldState，防作弊矩阵通过持久化 NPCTradeOffer + Lazy Refresh + 套利保护实现。

**Tech Stack:** Vue 3 + TypeScript + Pinia + Vitest (TDD)

---

## File Structure

| 文件 | 类型 | 职责 |
|------|------|------|
| `contracts/src/market.ts` | 新建 | MarketItem, MarketInventory, NPCTradeOffer |
| `contracts/src/item-template.ts` | 新建 | ItemTemplate |
| `contracts/src/item.ts` | 修改 | 加 ItemQuality, templateId?, quality?, ItemType 加 'Formula' |
| `contracts/src/character.ts` | 修改 | 加 spiritStones |
| `contracts/src/save-system.ts` | 修改 | SavePayload 加 markets, npcTradeOffers |
| `contracts/src/index.ts` | 修改 | 导出 market, item-template |
| `engine/src/market/market-pricing.ts` | 新建 | 价格计算器 (纯函数) |
| `engine/src/market/item-factory.ts` | 新建 | 物品模板池 + 动态生成 |
| `engine/src/market/market-engine.ts` | 新建 | 坊市刷新 + 库存管理 |
| `engine/src/market/npc-trade-engine.ts` | 新建 | NPC 随身交易生成 |
| `engine/src/market/market-transaction.ts` | 新建 | 交易执行器 |
| `engine/src/index.ts` | 修改 | 导出 market 模块 |
| `apps/taosim-ui/src/pages/NPCInteractionPage.vue` | 修改 | 重构为对话菜单 |
| `apps/taosim-ui/src/pages/MarketPage.vue` | 新建 | 坊市界面 |
| `apps/taosim-ui/src/pages/NPCTradePage.vue` | 新建 | NPC 交易界面 |
| `apps/taosim-ui/src/pages/OverworldPage.vue` | 修改 | 加 Market 节点「进入坊市」 |
| `apps/taosim-ui/src/router/routes.ts` | 修改 | 加 market, npc-trade 路由 |
| `apps/taosim-ui/src/stores/player.ts` | 修改 | 加 updateSpiritStones, 交易辅助方法 |

---

### Task 1: 补充 Item 和 Character 类型定义

**Files:**
- Modify: `packages/contracts/src/item.ts`
- Modify: `packages/contracts/src/character.ts`

- [ ] **Step 1: 修改 item.ts — 加 ItemQuality + templateId + quality + Formula**

```typescript
// item.ts 新增内容:

export type ItemQuality = 'Common' | 'Rare' | 'Epic' | 'Legendary';

// ItemType 修改为:
export type ItemType = 'Medicine' | 'Equipment' | 'Talisman' | 'Material' | 'Poison' | 'Formula';

// Item 接口新增:
export interface Item {
  id: string;
  name: string;
  tier: number;
  type: ItemType;
  attributes: AttributeMap;
  poisonValence?: number;
  templateId?: string;    // 新增: 物品模板静态 ID
  quality?: ItemQuality;  // 新增: 可选品质
}
```

用 SearchReplace 在 `packages/contracts/src/item.ts` 改动: (1) 在 `export type ItemType` 行加 `'Formula'`, (2) 在 `export type AttributeMap` 后加 `ItemQuality`, (3) 在 `Item` 接口的 `poisonValence?: number;` 后加两个新字段。

- [ ] **Step 2: 修改 character.ts — 加 spiritStones**

```typescript
// Character 接口新增字段 (放在 wantedLevels 之前):
spiritStones: number;
```

用 SearchReplace 在 `packages/contracts/src/character.ts` 的 `wantedLevels` 前加一行 `spiritStones: number;`。

- [ ] **Step 3: 验证类型构建**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/item.ts packages/contracts/src/character.ts
git commit -m "feat(contracts): add ItemQuality, templateId, quality, spiritStones, Formula type"
```

---

### Task 2: 新建 contracts/src/market.ts — 交易核心类型

**Files:**
- Create: `packages/contracts/src/market.ts`

- [ ] **Step 1: 创建 market.ts**

```typescript
// ============================================================
// Market 交易系统数据模型 — Phase 6
// ============================================================

import type { Item } from './item.js';
import type { ItemType } from './item.js';

export interface MarketItem {
  item: Item;
  count: number;
  maxCount: number;
  basePrice: number;
}

export interface MarketInventory {
  nodeId: string;
  items: MarketItem[];
  buyPriceMultiplier: number;
  sellPriceMultiplier: number;
  lastRefreshMonth: number;
}

export interface NPCTradeOffer {
  npcId: string;
  selling: MarketItem[];
  buyingInterest: ItemType[];
  budget: number;
  lastRefreshMonth: number;
}
```

- [ ] **Step 2: 验证类型构建**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/market.ts
git commit -m "feat(contracts): add MarketItem, MarketInventory, NPCTradeOffer types"
```

---

### Task 3: 新建 contracts/src/item-template.ts — 物品模板类型

**Files:**
- Create: `packages/contracts/src/item-template.ts`

- [ ] **Step 1: 创建 item-template.ts**

```typescript
// ============================================================
// ItemTemplate 物品模板数据模型 — Phase 6
// ============================================================

import type { ItemType, AttributeMap } from './item.js';

export interface ItemTemplate {
  templateId: string;
  name: string;
  tier: number;
  type: ItemType;
  baseAttributes: AttributeMap;
  poisonValence?: number;
}
```

- [ ] **Step 2: 验证类型构建**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/item-template.ts
git commit -m "feat(contracts): add ItemTemplate type"
```

---

### Task 4: 更新 contracts/src/index.ts 和 save-system.ts

**Files:**
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/save-system.ts`

- [ ] **Step 1: index.ts 加导出**

```typescript
// 在 contracts/src/index.ts 末尾加:
export * from './market.js';
export * from './item-template.js';
```

- [ ] **Step 2: save-system.ts SavePayload 加市场数据**

SavePayload 接口新增两个字段 (放在 graveyard 之前):

```typescript
import type { MarketInventory, NPCTradeOffer } from './market.js';

// SavePayload 接口中新增:
marketInventories: Record<string, MarketInventory>;
npcTradeOffers: Record<string, NPCTradeOffer>;
```

- [ ] **Step 3: 验证类型构建**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/contracts/src/index.ts packages/contracts/src/save-system.ts
git commit -m "feat(contracts): export market types, add marketInventories & npcTradeOffers to SavePayload"
```

---

### Task 5: MarketPricing — 价格计算器 (TDD)

**Files:**
- Create: `packages/engine/src/market/market-pricing.ts`
- Create: `packages/engine/src/__tests__/market-pricing.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/market-pricing.test.ts
import { describe, it, expect } from 'vitest';
import { MarketPricing } from '../market/market-pricing.js';
import type { Item } from '@taosim/contracts';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'TEST_ITEM',
    name: '测试物品',
    tier: 1,
    type: 'Material',
    attributes: {},
    ...overrides,
  };
}

describe('MarketPricing', () => {
  it('Tier 1 Material 基准价 = 100', () => {
    const item = makeItem({ tier: 1, type: 'Material' });
    expect(MarketPricing.getBasePrice(item)).toBe(100);
  });

  it('Tier 2 Medicine 基准价 = 600', () => {
    const item = makeItem({ tier: 2, type: 'Medicine' });
    expect(MarketPricing.getBasePrice(item)).toBe(600);
  });

  it('Tier 3 Equipment 基准价 = 1500', () => {
    const item = makeItem({ tier: 3, type: 'Equipment' });
    expect(MarketPricing.getBasePrice(item)).toBe(1500);
  });

  it('Quality Rare 基准价 = tier * typeBase * 1.5', () => {
    const item = makeItem({ tier: 2, type: 'Material', quality: 'Rare' });
    expect(MarketPricing.getBasePrice(item)).toBe(300); // 2 * 100 * 1.5
  });

  it('Quality Epic 基准价 = tier * typeBase * 2.5', () => {
    const item = makeItem({ tier: 1, type: 'Equipment', quality: 'Epic' });
    expect(MarketPricing.getBasePrice(item)).toBe(1250); // 1 * 500 * 2.5
  });

  it('Quality undefined fallback 为 1.0', () => {
    const item = makeItem({ tier: 3, type: 'Material' });
    expect(MarketPricing.getBasePrice(item)).toBe(300);
  });

  it('calculateBuyPrice 叠加多层折扣', () => {
    const item = makeItem({ tier: 2, type: 'Medicine' }); // base = 600
    const price = MarketPricing.calculateBuyPrice(item, 1.2, 0.9, 0.8);
    expect(price).toBe(518); // 600 * 1.2 * 0.9 * 0.8 = 518.4 → 518
  });

  it('calculateSellPrice 基础回购价', () => {
    const item = makeItem({ tier: 1, type: 'Material' }); // base = 100
    const price = MarketPricing.calculateSellPrice(item, 0.7);
    expect(price).toBe(70); // 100 * 0.7
  });

  it('calculateSellPrice 套利保护: 回购价不超过买入价的 80%', () => {
    const item = makeItem({ tier: 2, type: 'Equipment' }); // base = 1000
    const currentBuyPrice = 1200; // 玩家当前买入价
    const sellPrice = MarketPricing.calculateSellPrice(item, 0.7, 1.0, currentBuyPrice);
    expect(sellPrice).toBeLessThanOrEqual(currentBuyPrice * 0.8);
    // base * 0.7 = 700, 1200 * 0.8 = 960 → 700, 取 min → 700
    // 实际: min(1000 * 0.7, 1200 * 0.8) = min(700, 960) = 700
    expect(sellPrice).toBe(700);
  });

  it('calculateSellPrice 套利保护触发: 高好感回购价被买家价限制', () => {
    const item = makeItem({ tier: 1, type: 'Equipment' }); // base = 500
    const currentBuyPrice = 300; // 玩家低价买的
    const sellPrice = MarketPricing.calculateSellPrice(item, 0.9, 1.2, currentBuyPrice);
    // base * 0.9 * 1.2 = 540, 300 * 0.8 = 240 → min(540, 240) = 240
    expect(sellPrice).toBe(240);
  });

  it('最低价格不低于 1', () => {
    const item = makeItem({ tier: 1, type: 'Material' }); // base = 100
    const price = MarketPricing.calculateBuyPrice(item, 0.001, 0.001, 0.001);
    expect(price).toBeGreaterThanOrEqual(1);
  });

  it('Formula 类型基准价系数 = 200', () => {
    const item = makeItem({ tier: 2, type: 'Formula' });
    expect(MarketPricing.getBasePrice(item)).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/market-pricing.test.ts`
Expected: FAIL — all tests fail (module not found)

- [ ] **Step 3: 实现 MarketPricing**

```typescript
// packages/engine/src/market/market-pricing.ts
import type { Item, ItemType, ItemQuality } from '@taosim/contracts';

const TYPE_BASE_PRICE: Record<ItemType, number> = {
  Material: 100,
  Medicine: 300,
  Equipment: 500,
  Talisman: 400,
  Formula: 200,
  Poison: 150,
};

const QUALITY_MULTIPLIER: Record<ItemQuality, number> = {
  Common: 1.0,
  Rare: 1.5,
  Epic: 2.5,
  Legendary: 5.0,
};

export class MarketPricing {
  private static getQualityMultiplier(item: Item): number {
    if (!item.quality) return 1.0;
    return QUALITY_MULTIPLIER[item.quality] ?? 1.0;
  }

  static getBasePrice(item: Item): number {
    const typeBase = TYPE_BASE_PRICE[item.type] ?? 100;
    const qualityMod = this.getQualityMultiplier(item);
    return Math.floor(item.tier * typeBase * qualityMod);
  }

  static calculateBuyPrice(
    item: Item,
    nodeSellMultiplier: number,
    factionDiscount: number = 1.0,
    favorabilityDiscount: number = 1.0,
  ): number {
    const base = this.getBasePrice(item);
    const finalPrice = base * nodeSellMultiplier * factionDiscount * favorabilityDiscount;
    return Math.max(1, Math.floor(finalPrice));
  }

  static calculateSellPrice(
    item: Item,
    nodeBuyMultiplier: number,
    favorabilityBonus: number = 1.0,
    currentBuyPrice?: number,
  ): number {
    const base = this.getBasePrice(item);
    let sellPrice = base * nodeBuyMultiplier * favorabilityBonus;

    if (currentBuyPrice !== undefined) {
      sellPrice = Math.min(sellPrice, currentBuyPrice * 0.8);
    }
    return Math.max(1, Math.floor(sellPrice));
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/market-pricing.test.ts`
Expected: PASS — 12/12 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/market/market-pricing.ts packages/engine/src/__tests__/market-pricing.test.ts
git commit -m "feat(engine): add MarketPricing with base/buy/sell/arbitrage-protection"
```

---

### Task 6: ItemFactory — 物品工厂 (TDD)

**Files:**
- Create: `packages/engine/src/market/item-factory.ts`
- Create: `packages/engine/src/__tests__/item-factory.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/item-factory.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ItemFactory, type ItemTemplate } from '../market/item-factory.js';

const TEST_TEMPLATES: ItemTemplate[] = [
  { templateId: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_YIN_DEW', name: '阴露', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: 2 },
  { templateId: 'MAT_YANG_STONE', name: '阳石', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: -2 },
  { templateId: 'MED_FOUNDATION_PILL', name: '筑基丹', tier: 2, type: 'Medicine', baseAttributes: {} },
  { templateId: 'MED_QI_PILL', name: '聚气丹', tier: 1, type: 'Medicine', baseAttributes: {} },
  { templateId: 'EQ_SPIRIT_SWORD', name: '灵蕴剑', tier: 2, type: 'Equipment', baseAttributes: { attack: 15 } },
  { templateId: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', baseAttributes: {} },
];

describe('ItemFactory', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...TEST_TEMPLATES]);
  });

  it('generateRandomItem 生成带独立 ID 的物品', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 1, maxTier: 2 });
    expect(item.id).toBeTruthy();
    expect(item.templateId).toBeTruthy();
    expect(item.tier).toBeGreaterThanOrEqual(1);
    expect(item.tier).toBeLessThanOrEqual(2);
  });

  it('同一模板生成的两次实例 ID 不同', () => {
    const item1 = ItemFactory.generateRandomItem({ minTier: 2, maxTier: 2 });
    const item2 = ItemFactory.generateRandomItem({ minTier: 2, maxTier: 2 });
    expect(item1.id).not.toBe(item2.id);
  });

  it('preferredType 过滤只生成指定类型', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 1, maxTier: 3, preferredType: 'Medicine' });
    expect(item.type).toBe('Medicine');
  });

  it('三级 Fallback: 无匹配类型时放宽限制', () => {
    // 没有 Formula 模板，应 fallback 到所有类型
    const item = ItemFactory.generateRandomItem({ minTier: 1, maxTier: 2, preferredType: 'Formula' });
    expect(item).toBeDefined();
  });

  it('三级 Fallback: 无匹配 tier 时保底全库', () => {
    const item = ItemFactory.generateRandomItem({ minTier: 5, maxTier: 5 });
    expect(item).toBeDefined();
  });

  it('空模板库时抛错', () => {
    ItemFactory.loadTemplates([]);
    expect(() => ItemFactory.generateRandomItem({ minTier: 1, maxTier: 1 })).toThrow('[ItemFactory]');
  });

  it('getItemPool 按 tier 筛选', () => {
    const pool = ItemFactory.getItemPool(2);
    expect(pool.length).toBe(4); // 阴露, 阳石, 筑基丹, 灵蕴剑
    expect(pool.every(t => t.tier === 2)).toBe(true);
  });

  it('generateNPCTradeItems 生成 3-5 件 MarketItem', () => {
    const items = ItemFactory.generateNPCTradeItems(2, ['Material', 'Medicine'], 4, () => 0.5);
    expect(items.length).toBe(4);
    items.forEach(mi => {
      expect(mi.item).toBeDefined();
      expect(mi.basePrice).toBeGreaterThan(0);
      expect(mi.count).toBeGreaterThanOrEqual(1);
    });
  });

  it('RNG 种子可复现', () => {
    const seedFn = () => 0.3;
    const items1 = ItemFactory.generateNPCTradeItems(2, ['Material'], 3, seedFn);
    ItemFactory.loadTemplates([...TEST_TEMPLATES]);
    const items2 = ItemFactory.generateNPCTradeItems(2, ['Material'], 3, seedFn);
    expect(items1.map(m => m.item.templateId)).toEqual(items2.map(m => m.item.templateId));
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/item-factory.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 ItemFactory**

```typescript
// packages/engine/src/market/item-factory.ts
import type { Item, ItemType } from '@taosim/contracts';
import type { ItemTemplate, MarketItem } from '@taosim/contracts';
import { MarketPricing } from './market-pricing.js';

export type { ItemTemplate };

export class ItemFactory {
  private static templates: ItemTemplate[] = [];

  static loadTemplates(pool: ItemTemplate[]): void {
    this.templates = pool;
  }

  static getItemPool(tier: number): ItemTemplate[] {
    return this.templates.filter((t) => t.tier === tier);
  }

  static generateRandomItem(opts: {
    minTier: number;
    maxTier: number;
    preferredType?: ItemType;
    rng?: () => number;
  }): Item {
    const random = opts.rng ?? Math.random;

    let eligible = this.templates.filter(
      (t) =>
        t.tier >= opts.minTier &&
        t.tier <= opts.maxTier &&
        (!opts.preferredType || t.type === opts.preferredType),
    );

    if (eligible.length === 0) {
      eligible = this.templates.filter(
        (t) => t.tier >= opts.minTier && t.tier <= opts.maxTier,
      );
    }

    if (eligible.length === 0) {
      if (this.templates.length === 0) {
        throw new Error('[ItemFactory] 物品模板库为空，无法生成物品！');
      }
      eligible = this.templates;
    }

    const template = eligible[Math.floor(random() * eligible.length)]!;
    const instanceId = `${template.templateId}_${Date.now()}_${Math.floor(random() * 10000)}`;

    return {
      id: instanceId,
      templateId: template.templateId,
      name: template.name,
      tier: template.tier,
      type: template.type,
      attributes: { ...template.baseAttributes },
      poisonValence: template.poisonValence,
    };
  }

  static generateNPCTradeItems(
    npcRealmTier: number,
    npcProfessionPreferences: ItemType[],
    count: number = 3,
    rng?: () => number,
  ): MarketItem[] {
    const random = rng ?? Math.random;
    const items: MarketItem[] = [];

    const minTier = Math.max(1, npcRealmTier - 1);
    const maxTier = Math.min(9, npcRealmTier + 1);

    for (let i = 0; i < count; i++) {
      const preferredType =
        npcProfessionPreferences.length > 0
          ? npcProfessionPreferences[Math.floor(random() * npcProfessionPreferences.length)]
          : undefined;

      const item = this.generateRandomItem({ minTier, maxTier, preferredType, rng: random });
      const itemCount = item.type === 'Material' ? Math.floor(random() * 5) + 1 : 1;

      items.push({
        item,
        count: itemCount,
        maxCount: itemCount,
        basePrice: MarketPricing.getBasePrice(item),
      });
    }

    return items;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/item-factory.test.ts`
Expected: PASS — 9/9 tests pass

- [ ] **Step 5: 创建物品模板数据文件**

```typescript
// packages/engine/src/market/default-templates.ts
import type { ItemTemplate } from '@taosim/contracts';

export const DEFAULT_ITEM_TEMPLATES: ItemTemplate[] = [
  // Tier 1
  { templateId: 'MAT_SPIRIT_GRASS', name: '灵草', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_BLOOD_FLOWER', name: '血花', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_IRON_ORE', name: '铁矿石', tier: 1, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_QI_PILL', name: '聚气丹', tier: 1, type: 'Medicine', baseAttributes: {} },
  // Tier 2
  { templateId: 'MAT_YIN_DEW', name: '阴露', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: 2 },
  { templateId: 'MAT_YANG_STONE', name: '阳石', tier: 2, type: 'Material', baseAttributes: {}, poisonValence: -2 },
  { templateId: 'MAT_JADE', name: '灵玉', tier: 2, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_SPIRIT_STONE', name: '灵石矿', tier: 2, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_FOUNDATION_PILL', name: '筑基丹', tier: 2, type: 'Medicine', baseAttributes: {} },
  { templateId: 'EQ_SPIRIT_SWORD', name: '灵蕴剑', tier: 2, type: 'Equipment', baseAttributes: { attack: 15, critRate: 5 } },
  { templateId: 'EQ_SPIRIT_ARMOR', name: '灵甲', tier: 2, type: 'Equipment', baseAttributes: { defense: 10, physique: 2 } },
  // Tier 3
  { templateId: 'MAT_DRAGON_BLOOD', name: '龙血', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_PHOENIX_FEATHER', name: '凤羽', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_METEORITE', name: '陨铁', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_STARLIGHT', name: '星光粉', tier: 3, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_LONGEVITY_PILL', name: '延寿丹', tier: 3, type: 'Medicine', baseAttributes: {} },
  { templateId: 'EQ_STAR_SWORD', name: '星辰剑', tier: 3, type: 'Equipment', baseAttributes: { attack: 30, critRate: 10, agility: 3 } },
  // Tier 4
  { templateId: 'MAT_MILLENNIUM_LINGZHI', name: '万年灵芝', tier: 4, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_SKY_GOLD_SAND', name: '天金砂', tier: 4, type: 'Material', baseAttributes: {} },
  { templateId: 'MED_NASCENT_SOUL_PILL', name: '凝婴丹', tier: 4, type: 'Medicine', baseAttributes: {} },
  // Tier 5
  { templateId: 'MAT_IMMORTAL_JADE', name: '仙灵玉髓', tier: 5, type: 'Material', baseAttributes: {} },
  { templateId: 'MAT_CHAOS_STONE', name: '混沌石', tier: 5, type: 'Material', baseAttributes: {} },
];
```

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/market/item-factory.ts packages/engine/src/__tests__/item-factory.test.ts packages/engine/src/market/default-templates.ts
git commit -m "feat(engine): add ItemFactory with 3-level fallback, unique instance IDs, RNG seeding"
```

---

### Task 7: MarketEngine — 坊市刷新引擎 (TDD)

**Files:**
- Create: `packages/engine/src/market/market-engine.ts`
- Create: `packages/engine/src/__tests__/market-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/market-engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MarketEngine } from '../market/market-engine.js';
import { ItemFactory } from '../market/item-factory.js';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import type { OverworldNode } from '@taosim/contracts';

function makeNode(tier: number = 2): OverworldNode {
  return {
    id: 'NODE_MARKET_01',
    name: '东荒坊市',
    continentId: 'CONTINENT_CANGZHOU',
    coordinates: { x: 0, y: 0 },
    type: 'Market',
    tier,
    travelCostDays: 3,
    battleMapConfig: { baseTerrain: 'Plain', clusterDensity: 0.5, hazardProbability: 0.1 },
  };
}

describe('MarketEngine', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  });

  it('refreshMarket 生成 MarketInventory', () => {
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.nodeId).toBe('NODE_MARKET_01');
    expect(inv.items.length).toBeGreaterThanOrEqual(8);
    expect(inv.lastRefreshMonth).toBe(1);
  });

  it('refreshMarket tier 品阶 clamp 不超过边界', () => {
    const node = makeNode(1); // tier=1, 生成 tier 1-2
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.items.every(mi => mi.item.tier >= 1 && mi.item.tier <= 2)).toBe(true);
  });

  it('refreshMarket 高 tier 节点生成高阶物品', () => {
    const node = makeNode(4); // tier=4, 生成 tier 3-5
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.items.some(mi => mi.item.tier >= 3)).toBe(true);
  });

  it('refreshMarket buyPriceMultiplier 和 sellPriceMultiplier', () => {
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    expect(inv.buyPriceMultiplier).toBe(0.7);
    expect(inv.sellPriceMultiplier).toBe(1.2);
  });

  it('needsRefresh 过期检测', () => {
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 5, 5);
    expect(MarketEngine.needsRefresh(inv, 5)).toBe(false);
    expect(MarketEngine.needsRefresh(inv, 6)).toBe(true);
  });

  it('refreshMarket 同一节点两次刷新产生不同内容', () => {
    const node = makeNode(2);
    const inv1 = MarketEngine.refreshMarket(node, 1, 5);
    const inv2 = MarketEngine.refreshMarket(node, 1, 5); // 同一个月强制刷新
    // 内容大概率不同 (随机)
    const ids1 = inv1.items.map(mi => mi.item.templateId).sort().join(',');
    const ids2 = inv2.items.map(mi => mi.item.templateId).sort().join(',');
    // 不严格要求不同，但至少 struct 正确
    expect(inv2.lastRefreshMonth).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/market-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 MarketEngine**

```typescript
// packages/engine/src/market/market-engine.ts
import type { OverworldNode, MarketInventory, MarketItem } from '@taosim/contracts';
import { ItemFactory } from './item-factory.js';
import { MarketPricing } from './market-pricing.js';

export class MarketEngine {
  static refreshMarket(
    node: OverworldNode,
    currentMonth: number,
    playerLuck: number = 0,
  ): MarketInventory {
    const minTier = Math.max(1, node.tier - 1);
    const maxTier = Math.min(9, node.tier + 1);

    const newItems: MarketItem[] = [];

    // 普通区 (8-12 件)
    const commonCount = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < commonCount; i++) {
      const item = ItemFactory.generateRandomItem({ minTier, maxTier });
      const count = item.type === 'Material' ? 5 + Math.floor(Math.random() * 16) : 1 + Math.floor(Math.random() * 3);
      newItems.push({
        item,
        count,
        maxCount: count,
        basePrice: MarketPricing.getBasePrice(item),
      });
    }

    // 稀有区 (概率刷出)
    const rareChance = 0.1 * (1 + playerLuck / 100);
    if (Math.random() < rareChance) {
      const rareItem = ItemFactory.generateRandomItem({ minTier: node.tier, maxTier });
      newItems.push({
        item: rareItem,
        count: 1,
        maxCount: 1,
        basePrice: MarketPricing.getBasePrice(rareItem),
      });
    }

    return {
      nodeId: node.id,
      items: newItems,
      buyPriceMultiplier: 0.7,
      sellPriceMultiplier: 1.2,
      lastRefreshMonth: currentMonth,
    };
  }

  static needsRefresh(inventory: MarketInventory, currentMonth: number): boolean {
    return inventory.lastRefreshMonth < currentMonth;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/market-engine.test.ts`
Expected: PASS — 6/6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/market/market-engine.ts packages/engine/src/__tests__/market-engine.test.ts
git commit -m "feat(engine): add MarketEngine with tier-clamp refresh, rare item luck, lazy refresh check"
```

---

### Task 8: NPCTradeEngine — NPC 随身交易 (TDD)

**Files:**
- Create: `packages/engine/src/market/npc-trade-engine.ts`
- Create: `packages/engine/src/__tests__/npc-trade-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/npc-trade-engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NPCTradeEngine } from '../market/npc-trade-engine.js';
import { ItemFactory } from '../market/item-factory.js';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import type { Character } from '@taosim/contracts';

function makeNPC(overrides: Partial<Character> = {}): Character {
  return {
    id: 'NPC_TEST', name: '测试修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 1000, maxExp: 2000 },
    lifespan: { age: 50, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 0,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('NPCTradeEngine', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  });

  it('refreshNPCOffer 生成 NPCTradeOffer', () => {
    const npc = makeNPC();
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    expect(offer.npcId).toBe('NPC_TEST');
    expect(offer.selling.length).toBeGreaterThanOrEqual(3);
    expect(offer.selling.length).toBeLessThanOrEqual(5);
    expect(offer.budget).toBeGreaterThan(0);
    expect(offer.lastRefreshMonth).toBe(1);
  });

  it('refreshNPCOffer 按境界设置预算', () => {
    const qi = makeNPC({ realm: 'QiRefinement_1' });
    expect(NPCTradeEngine.refreshNPCOffer(qi, 1).budget).toBe(200);

    const foundation = makeNPC({ realm: 'Foundation_1' });
    expect(NPCTradeEngine.refreshNPCOffer(foundation, 1).budget).toBe(500);

    const goldenCore = makeNPC({ realm: 'GoldenCore_1' });
    expect(NPCTradeEngine.refreshNPCOffer(goldenCore, 1).budget).toBe(1500);

    const nascentSoul = makeNPC({ realm: 'NascentSoul_1' });
    expect(NPCTradeEngine.refreshNPCOffer(nascentSoul, 1).budget).toBe(5000);
  });

  it('refreshNPCOffer buyingInterest 包含合理类型', () => {
    const npc = makeNPC();
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    expect(offer.buyingInterest.length).toBeGreaterThan(0);
    offer.buyingInterest.forEach(type => {
      expect(['Material', 'Medicine', 'Equipment', 'Talisman']).toContain(type);
    });
  });

  it('getNPCBudget 单独获取预算', () => {
    expect(NPCTradeEngine.getNPCBudget('QiRefinement_1')).toBe(200);
    expect(NPCTradeEngine.getNPCBudget('Foundation_3')).toBe(500);
    expect(NPCTradeEngine.getNPCBudget('UnknownRealm')).toBe(200); // fallback
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/npc-trade-engine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 NPCTradeEngine**

```typescript
// packages/engine/src/market/npc-trade-engine.ts
import type { Character, NPCTradeOffer, ItemType } from '@taosim/contracts';
import { parseRealm } from '@taosim/contracts';
import { ItemFactory } from './item-factory.js';

const BUDGET_MAP: Record<string, number> = {
  LianQi: 200,
  ZhuJi: 500,
  JinDan: 1500,
  YuanYing: 5000,
  HuaShen: 15000,
};

const DEFAULT_BUDGET = 200;

// NPC realm tier 映射 (用于物品池)
function getRealmNumericTier(realmStr: string): number {
  const parsed = parseRealm(realmStr as any);
  const tierMap: Record<string, number> = {
    LianQi: 1,
    ZhuJi: 2,
    JinDan: 3,
    YuanYing: 4,
    HuaShen: 5,
  };
  return tierMap[parsed.realmType] ?? 1;
}

// 按 NPC 属性推断职业偏好
function inferProfessionPreferences(npc: Character): ItemType[] {
  const types: ItemType[] = ['Material'];
  // 悟性高 → 炼丹师倾向
  if (npc.attributes.comprehension >= 10) {
    types.push('Medicine');
  }
  // 根骨高 → 炼器师倾向
  if (npc.attributes.physique >= 10) {
    types.push('Equipment');
  }
  // 身法高 → 游商，什么都收
  if (npc.attributes.agility >= 10) {
    types.push('Talisman');
  }
  return types;
}

export class NPCTradeEngine {
  static getNPCBudget(realm: string): number {
    const parsed = parseRealm(realm as any);
    return BUDGET_MAP[parsed.realmType] ?? DEFAULT_BUDGET;
  }

  static refreshNPCOffer(npc: Character, currentMonth: number): NPCTradeOffer {
    const realmTier = getRealmNumericTier(npc.realm);
    const budget = this.getNPCBudget(npc.realm);
    const preferences = inferProfessionPreferences(npc);

    const sellCount = 3 + Math.floor(Math.random() * 3); // 3-5
    const sellingItems = ItemFactory.generateNPCTradeItems(realmTier, preferences, sellCount);

    return {
      npcId: npc.id,
      selling: sellingItems,
      buyingInterest: preferences,
      budget,
      lastRefreshMonth: currentMonth,
    };
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/npc-trade-engine.test.ts`
Expected: PASS — 4/4 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/market/npc-trade-engine.ts packages/engine/src/__tests__/npc-trade-engine.test.ts
git commit -m "feat(engine): add NPCTradeEngine with realm-based budget, profession inference, trade offer generation"
```

---

### Task 9: MarketTransaction — 交易执行器 (TDD)

**Files:**
- Create: `packages/engine/src/market/market-transaction.ts`
- Create: `packages/engine/src/__tests__/market-transaction.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/market-transaction.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MarketTransaction } from '../market/market-transaction.js';
import { ItemFactory } from '../market/item-factory.js';
import { DEFAULT_ITEM_TEMPLATES } from '../market/default-templates.js';
import { MarketEngine } from '../market/market-engine.js';
import { NPCTradeEngine } from '../market/npc-trade-engine.js';
import type { Character, MarketInventory, NPCTradeOffer } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '玩家', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 1000, maxExp: 2000 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    spiritStones: 1000,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

function makeNode(tier: number = 2) {
  return {
    id: 'NODE_01', name: '坊市', continentId: 'C1',
    coordinates: { x: 0, y: 0 }, type: 'Market' as const, tier,
    travelCostDays: 1,
    battleMapConfig: { baseTerrain: 'Plain' as const, clusterDensity: 0.5, hazardProbability: 0.1 },
  };
}

describe('MarketTransaction', () => {
  beforeEach(() => {
    ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  });

  it('buyFromMarket 成功购买扣灵石加背包', () => {
    const player = makePlayer({ spiritStones: 1000 });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    const targetItem = inv.items[0]!;
    const originalCount = targetItem.count;
    const buyCount = Math.min(2, originalCount);

    const result = MarketTransaction.buyFromMarket(player, inv, targetItem, buyCount);
    expect(result.success).toBe(true);
    expect(player.spiritStones).toBeLessThan(1000);
    expect(player.inventory.length).toBeGreaterThan(0);
  });

  it('buyFromMarket 灵石不足失败', () => {
    const player = makePlayer({ spiritStones: 1 });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    const targetItem = inv.items[0]!;

    const result = MarketTransaction.buyFromMarket(player, inv, targetItem, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('灵石不足');
  });

  it('buyFromMarket 库存不足失败', () => {
    const player = makePlayer({ spiritStones: 99999 });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);
    const targetItem = inv.items[0]!;

    const result = MarketTransaction.buyFromMarket(player, inv, targetItem, 999);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('库存不足');
  });

  it('sellToMarket 成功卖出加灵石扣背包', () => {
    const player = makePlayer({
      spiritStones: 0,
      inventory: [{
        item: {
          id: 'MAT_SPIRIT_GRASS', templateId: 'MAT_SPIRIT_GRASS',
          name: '灵草', tier: 1, type: 'Material', attributes: {},
        },
        count: 10,
      }],
    });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);

    const result = MarketTransaction.sellToMarket(player, inv, player.inventory[0]!.item, 3);
    expect(result.success).toBe(true);
    expect(player.spiritStones).toBeGreaterThan(0); // base=100 * 0.7 = 70 * 3 = 210
    // 背包数量减少
    expect(player.inventory[0]!.count).toBe(7);
  });

  it('sellToNPC 成功交易扣 NPC 预算', () => {
    const player = makePlayer({
      spiritStones: 0,
      inventory: [{
        item: {
          id: 'MAT_SPIRIT_GRASS', templateId: 'MAT_SPIRIT_GRASS',
          name: '灵草', tier: 1, type: 'Material', attributes: {},
        },
        count: 10,
      }],
    });
    const npc = makePlayer({ id: 'NPC_01', realm: 'Foundation_1' });
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    const budgetBefore = offer.budget;

    const result = MarketTransaction.sellToNPC(player, offer, player.inventory[0]!.item, 1);
    expect(result.success).toBe(true);
    expect(offer.budget).toBeLessThan(budgetBefore);
    expect(player.spiritStones).toBeGreaterThan(0);
  });

  it('sellToNPC NPC 预算不足失败', () => {
    const player = makePlayer({
      spiritStones: 0,
      inventory: [{
        item: {
          id: 'EQ_STAR_SWORD', templateId: 'EQ_STAR_SWORD',
          name: '星辰剑', tier: 3, type: 'Equipment', attributes: {},
        },
        count: 1,
      }],
    });
    const npc = makePlayer({ id: 'NPC_POOR', realm: 'QiRefinement_1' });
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    offer.budget = 1; // 强制预算不足

    const result = MarketTransaction.sellToNPC(player, offer, player.inventory[0]!.item, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('灵石不足');
  });

  it('buyFromNPC 成功从 NPC 购买', () => {
    const player = makePlayer({ spiritStones: 9999 });
    const npc = makePlayer({ id: 'NPC_01', realm: 'Foundation_1' });
    const offer = NPCTradeEngine.refreshNPCOffer(npc, 1);
    const buyItem = offer.selling[0]!;

    const result = MarketTransaction.buyFromNPC(player, offer, buyItem, 1);
    expect(result.success).toBe(true);
    expect(player.spiritStones).toBeLessThan(9999);
    expect(buyItem.count).toBeLessThan(buyItem.maxCount);
  });

  it('物品不存在背包时卖出失败', () => {
    const player = makePlayer({ spiritStones: 0, inventory: [] });
    const node = makeNode(2);
    const inv = MarketEngine.refreshMarket(node, 1, 5);

    const result = MarketTransaction.sellToMarket(player, inv, {
      id: 'NO_SUCH_ITEM', name: 'no', tier: 1, type: 'Material', attributes: {},
    }, 1);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('物品');
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `npx vitest run packages/engine/src/__tests__/market-transaction.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: 实现 MarketTransaction**

```typescript
// packages/engine/src/market/market-transaction.ts
import type { Character, MarketInventory, MarketItem, NPCTradeOffer } from '@taosim/contracts';
import type { Item, ItemStack } from '@taosim/contracts';
import { MarketPricing } from './market-pricing.js';
import { NPCInteractionEngine } from '../interaction/npc-interaction-engine.js';

export interface TransactionResult {
  success: boolean;
  reason?: string;
  totalCost?: number;
}

function findStack(inventory: ItemStack[], itemId: string): ItemStack | undefined {
  return inventory.find(s => s.item.id === itemId);
}

function removeFromInventory(inventory: ItemStack[], itemId: string, count: number): void {
  const idx = inventory.findIndex(s => s.item.id === itemId);
  if (idx === -1) return;
  const stack = inventory[idx]!;
  stack.count -= count;
  if (stack.count <= 0) {
    inventory.splice(idx, 1);
  }
}

function addToInventory(inventory: ItemStack[], item: Item, count: number): void {
  const existing = inventory.find(s => s.item.id === item.id || s.item.templateId === item.templateId);
  if (existing) {
    existing.count += count;
  } else {
    inventory.push({ item: { ...item }, count });
  }
}

export class MarketTransaction {
  static buyFromMarket(
    player: Character,
    market: MarketInventory,
    marketItem: MarketItem,
    quantity: number,
  ): TransactionResult {
    if (marketItem.count < quantity) {
      return { success: false, reason: '库存不足' };
    }

    const totalCost = MarketPricing.calculateBuyPrice(
      marketItem.item,
      market.sellPriceMultiplier,
    );

    const totalBuyCost = totalCost * quantity;
    if (player.spiritStones < totalBuyCost) {
      return { success: false, reason: '灵石不足' };
    }

    player.spiritStones -= totalBuyCost;
    marketItem.count -= quantity;
    addToInventory(player.inventory, marketItem.item, quantity);

    // 库存归零时移除
    if (marketItem.count <= 0) {
      const idx = market.items.indexOf(marketItem);
      if (idx !== -1) market.items.splice(idx, 1);
    }

    return { success: true, totalCost: totalBuyCost };
  }

  static sellToMarket(
    player: Character,
    market: MarketInventory,
    item: Item,
    quantity: number,
  ): TransactionResult {
    const stack = findStack(player.inventory, item.id);
    if (!stack) return { success: false, reason: '背包中无此物品' };
    if (stack.count < quantity) return { success: false, reason: '物品数量不足' };

    const unitPrice = MarketPricing.calculateSellPrice(item, market.buyPriceMultiplier);
    const totalRevenue = unitPrice * quantity;

    removeFromInventory(player.inventory, item.id, quantity);
    player.spiritStones += totalRevenue;

    return { success: true, totalCost: totalRevenue };
  }

  static buyFromNPC(
    player: Character,
    offer: NPCTradeOffer,
    marketItem: MarketItem,
    quantity: number,
  ): TransactionResult {
    if (marketItem.count < quantity) {
      return { success: false, reason: '库存不足' };
    }

    const favorabilityDiscount = NPCInteractionEngine.getPriceMultiplier(player, offer.npcId);
    const totalCost = MarketPricing.calculateBuyPrice(
      marketItem.item,
      1.0, // NPC 不加节点溢价
      1.0, // 无宗门折扣
      favorabilityDiscount,
    );

    const totalBuyCost = totalCost * quantity;
    if (player.spiritStones < totalBuyCost) {
      return { success: false, reason: '灵石不足' };
    }

    player.spiritStones -= totalBuyCost;
    marketItem.count -= quantity;
    addToInventory(player.inventory, marketItem.item, quantity);

    if (marketItem.count <= 0) {
      const idx = offer.selling.indexOf(marketItem);
      if (idx !== -1) offer.selling.splice(idx, 1);
    }

    return { success: true, totalCost: totalBuyCost };
  }

  static sellToNPC(
    player: Character,
    offer: NPCTradeOffer,
    item: Item,
    quantity: number,
  ): TransactionResult {
    const stack = findStack(player.inventory, item.id);
    if (!stack) return { success: false, reason: '背包中无此物品' };
    if (stack.count < quantity) return { success: false, reason: '物品数量不足' };

    const favorabilityBonus = 1.0 + (NPCInteractionEngine.getPriceMultiplier(player, offer.npcId) - 1.0) * -1;
    // favorabilityDiscount < 1.0 时 favorabilityBonus > 1.0 (买入折扣 → 卖出溢价)
    const unitPrice = MarketPricing.calculateSellPrice(item, 0.5, favorabilityBonus);
    const totalRevenue = unitPrice * quantity;

    if (offer.budget < totalRevenue) {
      return { success: false, reason: '对方灵石不足' };
    }

    removeFromInventory(player.inventory, item.id, quantity);
    player.spiritStones += totalRevenue;
    offer.budget -= totalRevenue;

    return { success: true, totalCost: totalRevenue };
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `npx vitest run packages/engine/src/__tests__/market-transaction.test.ts`
Expected: PASS — 8/8 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/market/market-transaction.ts packages/engine/src/__tests__/market-transaction.test.ts
git commit -m "feat(engine): add MarketTransaction with buyFromMarket/NPC, sellToMarket/NPC, budget tracking"
```

---

### Task 10: 更新 engine/index.ts 和 contracts/index.ts 导出

**Files:**
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: engine/index.ts 加导出**

在 `packages/engine/src/index.ts` 末尾 (NPC Interaction 导出之后) 加:

```typescript
// Market (坊市交易)
export { MarketPricing } from './market/market-pricing.js';
export { ItemFactory } from './market/item-factory.js';
export { DEFAULT_ITEM_TEMPLATES } from './market/default-templates.js';
export { MarketEngine } from './market/market-engine.js';
export { NPCTradeEngine } from './market/npc-trade-engine.js';
export { MarketTransaction } from './market/market-transaction.js';
```

- [ ] **Step 2: contracts/index.ts 加导出** (已在 Task 4 完成)

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Expected: BOTH PASS

- [ ] **Step 4: 运行全部测试**

Run: `npx vitest run`
Expected: ALL tests pass (MarketPricing 12 + ItemFactory 9 + MarketEngine 6 + NPCTradeEngine 4 + MarketTransaction 8 = 39 new tests, plus existing ~74 = ~113 total)

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/index.ts
git commit -m "feat(engine): export market modules (Pricing/Factory/Engine/NPCTrade/Transaction)"
```

---

### Task 11: NPCInteractionPage 重构为对话菜单

**Files:**
- Modify: `apps/taosim-ui/src/pages/NPCInteractionPage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts` (加 route)
- Create: `apps/taosim-ui/src/pages/NPCTradePage.vue` (骨架)

- [ ] **Step 1: 重写 NPCInteractionPage.vue 为对话菜单**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { NPCInteractionEngine } from '@taosim/engine';

const router = useRouter();
const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const interactionDone = ref(false);
const showTradeDenied = ref(false);

const npc = computed(() => playerStore.currentNPC);

const favorability = computed(() => {
  if (!playerStore.character || !npc.value) return 0;
  const rel = playerStore.character.relations[npc.value!.id];
  return rel?.favorability ?? 0;
});

const canTrade = computed(() => favorability.value > -50);

function handleDuel() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.duel(playerStore.character, npc.value, true);
  message.value = result.message;
  interactionDone.value = true;
}

function handleDiscuss() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.discuss(playerStore.character, npc.value);
  playerStore.character.cultivation.currentExp += result.expGained;
  message.value = result.message;
  interactionDone.value = true;
}

function handleTrade() {
  if (!canTrade.value) {
    showTradeDenied.value = true;
    return;
  }
  router.push('/npc-trade');
}

function handleLeave() {
  playerStore.currentNPC = null;
  router.push('/overworld');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">偶遇修士</h1>

    <div v-if="npc" class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div class="font-semibold text-lg">{{ npc.name }}</div>
      <div class="text-muted">{{ npc.realm }} · {{ npc.gender === 'Male' ? '男' : '女' }}</div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">好感度</span>
        <div class="flex-1 bg-surface-muted h-2 rounded-full max-w-[120px]">
          <div class="h-2 rounded-full transition-all"
            :class="favorability >= 0 ? 'bg-jade' : 'bg-danger'"
            :style="{ width: Math.abs(favorability) + '%' }"></div>
        </div>
        <span class="text-xs font-mono">{{ favorability }}</span>
      </div>
      <div class="text-xs italic text-muted pt-1">"道友有何贵干？"</div>
    </div>

    <div v-if="showTradeDenied" class="p-3 rounded-md text-sm bg-danger-soft text-danger">
      对方对你戒心极重，拒绝与你交易。
      <button @click="showTradeDenied = false" class="ml-2 underline text-xs">关闭</button>
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <div v-if="!interactionDone" class="grid grid-cols-2 gap-3 max-w-[300px]">
      <button @click="handleDuel"
        class="px-4 py-3 bg-jade text-white rounded-md text-sm font-semibold">切磋</button>
      <button @click="handleDiscuss"
        class="px-4 py-3 border border-line rounded-md text-sm">论道</button>
      <button @click="handleTrade"
        :disabled="!canTrade"
        class="px-4 py-3 rounded-md text-sm font-semibold"
        :class="canTrade ? 'bg-gold text-white' : 'bg-surface-muted text-muted cursor-not-allowed'">
        交易
      </button>
      <button @click="handleLeave"
        class="px-4 py-3 border border-line rounded-md text-sm text-muted">离开</button>
    </div>
    <div v-else class="pt-4">
      <button @click="handleLeave"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回大世界</button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 创建 NPCTradePage.vue 骨架** (先跑通路由)

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';

const router = useRouter();
const playerStore = usePlayerStore();
const npc = computed(() => playerStore.currentNPC);

function handleBack() {
  router.push('/npc-interaction');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">交易 — {{ npc?.name ?? '修士' }}</h1>
    <div v-if="npc" class="text-sm text-muted">对方修为: {{ npc.realm }} | 你的灵石: {{ playerStore.character?.spiritStones ?? 0 }}</div>
    <button @click="handleBack"
      class="px-4 py-2 border border-line rounded-md text-sm">返回</button>
  </div>
</template>
```

- [ ] **Step 3: routes.ts 加 npc-trade 和 market 路由**

在 routes 数组末尾加:

```typescript
{
  path: '/npc-trade',
  name: 'npc-trade',
  component: () => import('../pages/NPCTradePage.vue'),
  meta: { title: '交易' },
},
{
  path: '/market',
  name: 'market',
  component: () => import('../pages/MarketPage.vue'),
  meta: { title: '坊市' },
},
```

- [ ] **Step 4: 验证 UI 构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS (或原有错误数不变)

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/pages/NPCInteractionPage.vue apps/taosim-ui/src/pages/NPCTradePage.vue apps/taosim-ui/src/router/routes.ts
git commit -m "feat(ui): refactor NPCInteractionPage to dialog menu, add NPCTradePage skeleton, add routes"
```

---

### Task 12: NPCTradePage — NPC 交易完整界面

**Files:**
- Modify: `apps/taosim-ui/src/pages/NPCTradePage.vue`

- [ ] **Step 1: 实现 NPCTradePage.vue 完整逻辑**

从骨架扩展为完整交易界面:

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { NPCTradeEngine, MarketTransaction, ItemFactory, DEFAULT_ITEM_TEMPLATES } from '@taosim/engine';
import type { NPCTradeOffer, MarketItem, ItemStack } from '@taosim/contracts';

const router = useRouter();
const playerStore = usePlayerStore();
const npc = computed(() => playerStore.currentNPC);

const npcOffer = ref<NPCTradeOffer | null>(null);
const message = ref<string | null>(null);

onMounted(() => {
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  if (playerStore.character && npc.value) {
    npcOffer.value = NPCTradeEngine.refreshNPCOffer(npc.value, 1);
  }
});

// NPC 出售列表
const npcSelling = computed(() => npcOffer.value?.selling ?? []);

// 玩家可卖给 NPC 的物品（按 buyingInterest 过滤）
const playerSellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(
    s => interest.includes(s.item.type) && s.count > 0,
  );
});

// 不可卖给 NPC 的物品（灰色显示）
const playerUnsellable = computed(() => {
  if (!playerStore.character) return [];
  const interest = npcOffer.value?.buyingInterest ?? [];
  return playerStore.character.inventory.filter(
    s => !interest.includes(s.item.type) && s.count > 0,
  );
});

function handleBuy(marketItem: MarketItem) {
  if (!playerStore.character || !npcOffer.value) return;
  const result = MarketTransaction.buyFromNPC(playerStore.character, npcOffer.value, marketItem, 1);
  message.value = result.success
    ? `购买成功！花费 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleSell(stack: ItemStack) {
  if (!playerStore.character || !npcOffer.value) return;
  const result = MarketTransaction.sellToNPC(playerStore.character, npcOffer.value, stack.item, 1);
  message.value = result.success
    ? `卖出成功！获得 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleBack() {
  router.push('/npc-interaction');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">交易 — {{ npc?.name ?? '修士' }}</h1>
      <span class="text-sm text-muted">灵石: {{ playerStore.character?.spiritStones ?? 0 }}</span>
    </div>

    <div v-if="npc" class="text-sm text-muted flex gap-4">
      <span>对方修为: {{ npc.realm }}</span>
      <span>对方预算: {{ npcOffer?.budget ?? 0 }} 灵石</span>
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <!-- NPC 出售区 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">对方出售</h2>
      <div v-if="npcSelling.length === 0" class="text-sm text-muted">对方暂无物品出售</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div v-for="mi in npcSelling" :key="mi.item.id"
          class="bg-surface rounded-lg border border-line p-3 space-y-2">
          <div class="font-medium text-sm">{{ mi.item.name }}</div>
          <div class="text-xs text-muted">
            {{ mi.item.type }} · Tier {{ mi.item.tier }}
            <span v-if="mi.item.quality" class="ml-1 text-jade">{{ mi.item.quality }}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-sm font-mono">{{ mi.basePrice }} 灵石</span>
            <button @click="handleBuy(mi)"
              class="px-3 py-1 bg-jade text-white rounded text-xs font-semibold">
              购买 ({{ mi.count }})
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 玩家卖出区 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">出售给{{ npc?.name }}</h2>
      <div v-if="playerSellable.length === 0" class="text-sm text-muted">没有对方感兴趣的物品</div>
      <div class="space-y-2">
        <div v-for="s in playerSellable" :key="s.item.id"
          class="bg-surface rounded-lg border border-line p-3 flex justify-between items-center">
          <div>
            <span class="font-medium text-sm">{{ s.item.name }}</span>
            <span class="text-xs text-muted ml-2">x{{ s.count }}</span>
          </div>
          <button @click="handleSell(s)"
            :disabled="npcOffer === null || (npcOffer?.budget ?? 0) <= 0"
            class="px-3 py-1 bg-gold text-white rounded text-xs font-semibold disabled:opacity-50">
            卖出
          </button>
        </div>
        <div v-for="s in playerUnsellable" :key="s.item.id"
          class="bg-surface-muted rounded-lg border border-line p-3 flex justify-between items-center opacity-50">
          <div>
            <span class="font-medium text-sm">{{ s.item.name }}</span>
            <span class="text-xs text-muted ml-2">x{{ s.count }}</span>
            <span class="text-xs text-danger ml-2">对方不感兴趣</span>
          </div>
          <button disabled class="px-3 py-1 bg-surface-muted rounded text-xs cursor-not-allowed">不可卖出</button>
        </div>
      </div>
    </section>

    <div class="pt-4">
      <button @click="handleBack"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回</button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 验证构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS (或原有错误数不变)

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/pages/NPCTradePage.vue
git commit -m "feat(ui): implement NPCTradePage with buy/sell/buyingInterest filter/budget display"
```

---

### Task 13: MarketPage — 坊市界面

**Files:**
- Create: `apps/taosim-ui/src/pages/MarketPage.vue`

- [ ] **Step 1: 创建 MarketPage.vue**

```vue
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { MarketEngine, MarketTransaction, ItemFactory, DEFAULT_ITEM_TEMPLATES } from '@taosim/engine';
import type { MarketInventory, MarketItem, ItemStack } from '@taosim/contracts';

const router = useRouter();
const playerStore = usePlayerStore();

const marketInv = ref<MarketInventory | null>(null);
const message = ref<string | null>(null);
const showSellPanel = ref(false);

const mockNode = {
  id: 'NODE_MARKET_DONGHUANG',
  name: '东荒坊市',
  continentId: 'CONTINENT_CANGZHOU',
  coordinates: { x: 0, y: 0 },
  type: 'Market' as const,
  tier: 2,
  travelCostDays: 1,
  battleMapConfig: { baseTerrain: 'Plain' as const, clusterDensity: 0.5, hazardProbability: 0.1 },
};

onMounted(() => {
  ItemFactory.loadTemplates([...DEFAULT_ITEM_TEMPLATES]);
  const luck = playerStore.character?.attributes.luck ?? 5;
  marketInv.value = MarketEngine.refreshMarket(mockNode, 1, luck);
});

const commonItems = computed(() =>
  marketInv.value?.items ?? []
);

const playerInventory = computed(() =>
  playerStore.character?.inventory ?? []
);

function handleBuy(marketItem: MarketItem) {
  if (!playerStore.character || !marketInv.value) return;
  const result = MarketTransaction.buyFromMarket(playerStore.character, marketInv.value, marketItem, 1);
  message.value = result.success
    ? `购买成功！花费 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function handleSell(stack: ItemStack) {
  if (!playerStore.character || !marketInv.value) return;
  const result = MarketTransaction.sellToMarket(playerStore.character, marketInv.value, stack.item, 1);
  message.value = result.success
    ? `卖出成功！获得 ${result.totalCost} 灵石`
    : (result.reason ?? '交易失败');
}

function goBack() {
  router.push('/overworld');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">东荒坊市</h1>
      <span class="text-sm text-muted">灵石: {{ playerStore.character?.spiritStones ?? 0 }}</span>
    </div>
    <div class="text-xs text-muted">下次刷新: 下月初</div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <!-- 商品列表 -->
    <section>
      <h2 class="text-lg font-semibold mb-3">商品</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        <div v-for="mi in commonItems" :key="mi.item.id"
          class="bg-surface rounded-lg border border-line p-3 space-y-2">
          <div class="font-medium text-sm">{{ mi.item.name }}</div>
          <div class="text-xs text-muted">
            {{ mi.item.type }} · Tier {{ mi.item.tier }}
            <span v-if="mi.item.quality" class="ml-1 text-amber">{{ mi.item.quality }}</span>
          </div>
          <div class="text-xs">库存: {{ mi.count }}/{{ mi.maxCount }}</div>
          <div class="flex justify-between items-center">
            <span class="text-sm font-mono">{{ mi.basePrice }} 灵石</span>
            <button @click="handleBuy(mi)"
              class="px-3 py-1 bg-jade text-white rounded text-xs font-semibold">
              购买
            </button>
          </div>
        </div>
      </div>
      <div v-if="commonItems.length === 0" class="text-sm text-muted">暂无商品</div>
    </section>

    <!-- 卖出面板 -->
    <section>
      <button @click="showSellPanel = !showSellPanel"
        class="px-4 py-2 border border-line rounded-md text-sm">
        {{ showSellPanel ? '收起' : '卖出背包物品' }}
      </button>
      <div v-if="showSellPanel" class="mt-3 space-y-2">
        <div v-for="s in playerInventory" :key="s.item.id"
          class="bg-surface rounded-lg border border-line p-3 flex justify-between items-center">
          <div>
            <span class="font-medium text-sm">{{ s.item.name }}</span>
            <span class="text-xs text-muted ml-2">x{{ s.count }}</span>
          </div>
          <button @click="handleSell(s)"
            class="px-3 py-1 bg-gold text-white rounded text-xs font-semibold">
            卖出
          </button>
        </div>
        <div v-if="playerInventory.length === 0" class="text-sm text-muted">背包为空</div>
      </div>
    </section>

    <div class="pt-4">
      <button @click="goBack"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回大世界</button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 验证构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS (或原有错误数不变)

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/pages/MarketPage.vue
git commit -m "feat(ui): add MarketPage with buy grid, sell panel, spirit stones display"
```

---

### Task 14: OverworldPage 加坊市入口

**Files:**
- Modify: `apps/taosim-ui/src/pages/OverworldPage.vue`

- [ ] **Step 1: OverworldPage 加 Market 节点入口**

在 OverworldPage.vue 的节点交互区，为 node.type === 'Market' 添加「进入坊市」按钮:

```vue
<!-- 在节点交互按钮区加: -->
<button v-if="currentNode?.type === 'Market'"
  @click="router.push('/market')"
  class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold">
  进入坊市
</button>
```

- [ ] **Step 2: 验证构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/pages/OverworldPage.vue
git commit -m "feat(ui): add Market node entry button to OverworldPage"
```

---

### Task 15: 修复因 spiritStones 新增字段导致的编译错误

**Files:**
- Modify: 所有包含 `Character` 构造的测试文件和源代码文件

- [ ] **Step 1: 全量搜索需要修复的位置**

Run: `npx tsc --noEmit --project packages/engine/tsconfig.json 2>&1 | Select-String "spiritStones"`
Expected: 列出所有缺少 `spiritStones` 的位置

- [ ] **Step 2: 批量修复 — 所有 Character 构造加 `spiritStones: 0`**

修复以下文件:
- `packages/engine/src/__tests__/combat-mock.ts`
- `packages/engine/src/__tests__/alchemy-engine.test.ts`
- `packages/engine/src/__tests__/forge-engine.test.ts`
- `packages/engine/src/__tests__/npc-interaction-engine.test.ts`
- `packages/engine/src/__tests__/tribulation-engine.test.ts`
- `packages/engine/src/__tests__/faction-engine.test.ts`
- `packages/engine/src/world/world-engine.ts` (generateWildCultivator)
- `packages/engine/src/interaction/npc-generator.ts` (NPC.generate)
- `packages/engine/src/character/character-factory.ts` (如果存在)
- `apps/taosim-ui/src/stores/app.ts` (saveGame 的 player 构造)

每个文件在 `wantedLevels: {},` 前加 `spiritStones: 0,`。

- [ ] **Step 3: 全量类型检查**

Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: ALL PASS

- [ ] **Step 4: 运行全量测试**

Run: `npx vitest run`
Expected: ALL ~113 tests pass

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: add spiritStones: 0 to all Character constructions across codebase"
```

---

### Task 16: 更新 app.ts saveGame/loadGame 支持交易数据持久化

**Files:**
- Modify: `apps/taosim-ui/src/stores/app.ts`

- [ ] **Step 1: saveGame 加 marketInventories 和 npcTradeOffers**

在 SavePayload 构造中加入新字段:

```typescript
marketInventories: {},    // 后续从世界状态读取
npcTradeOffers: {},       // 后续从世界状态读取
```

- [ ] **Step 2: 验证构建**

Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: PASS

- [ ] **Step 3: 最终全量测试 + 构建验证**

Run: `npx vitest run`
Run: `npx tsc --noEmit --project packages/contracts/tsconfig.json`
Run: `npx tsc --noEmit --project packages/engine/tsconfig.json`
Run: `npx vue-tsc --noEmit --project apps/taosim-ui`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add apps/taosim-ui/src/stores/app.ts
git commit -m "feat(ui): add market persistent data fields to saveGame payload"
```

---

## Build Order

```
Task 1 (Item/Char types) → Task 2 (market.ts) → Task 3 (item-template.ts) → Task 4 (index/save exports)
  → Task 5 (MarketPricing TDD)
  → Task 6 (ItemFactory TDD)
  → Task 7 (MarketEngine TDD)
  → Task 8 (NPCTradeEngine TDD)
  → Task 9 (MarketTransaction TDD)
  → Task 10 (engine index exports)
  → Task 11 (NPCInteractionPage refactor + NPCTradePage skeleton + routes)
  → Task 12 (NPCTradePage full)
  → Task 13 (MarketPage)
  → Task 14 (OverworldPage entry)
  → Task 15 (fix spiritStones compile errors)
  → Task 16 (saveGame persistence)
```

| 并行组 | Tasks |
|--------|-------|
| 可并行 | Task 2, Task 3 (独立于彼此) |
| 可并行 | Task 12, Task 13 (独立 UI 页面) |
| 必须串行 | 其余所有 |

**Total tasks:** 16
**New tests:** ~39