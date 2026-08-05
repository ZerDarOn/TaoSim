# Phase 6 — 交易/坊市系统 设计规格书

> **基准架构**: 《大千修仙界》架构设计规范 (v3.2 Final)
> **竞品参考**: 鬼谷八荒 (坊市 + 拍卖行)、修仙模拟器 (供需动态 + 多渠道交易)
> **创建时间**: 2026-08-05

---

## 1. 设计目标

构建修仙世界核心经济闭环：灵石产出 → 坊市购买 → NPC 交易 → 灵石回收。充分利用现有 Market 节点类型、NPC 好感度系统和 EconomyEngine，以最低成本实现完整交易体验，同时为后续供需动态系统留扩展接口。

## 2. 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 交易载体 | 坊市 + NPC 随身交易 | 复用 Market 节点 + getPriceMultiplier，拍卖行留 Phase 7 |
| 定价模型 | 混合模型 (基准价 + 多层修正) | 固定基准价可控，多层修正在不增加 WorldEngine 负担的前提下提供砍价维度 |
| 灵石货币 | Character.spiritStones 个人灵石 | 修仙硬通货，为拍卖行/俸禄/修炼加速留接口。以物易物留给后期 NPC AI 智能时自然浮现 |
| 坊市库存 | 限量 + 稀有品随机 | 限量造稀缺，luck 驱动稀有品刷新率，鼓励多点探索 |
| NPC 交易 | 预算制 + buyingInterest 过滤 | 防无限套现，类型强约束 |
| 品质系统 | quality? 可选字段 (方案 B) | 品质系统是独立大功能，不应被交易绑架。未填时乘 1.0 零改动成本 |
| 持久化 | NPCTradeOffer 纳入 SaveData | 防 S/L 刷物品/无限套现 |

## 3. 数据模型

### 3.1 Character 新增字段 ([contracts/src/character.ts](file:///d:/Code/ai/TaoSim/packages/contracts/src/character.ts))

```typescript
spiritStones: number;  // 玩家灵石数量
```

### 3.2 Item 补充字段 ([contracts/src/item.ts](file:///d:/Code/ai/TaoSim/packages/contracts/src/item.ts))

```typescript
export type ItemQuality = 'Common' | 'Rare' | 'Epic' | 'Legendary';

// Item 接口新增:
templateId?: string;  // 物品模板静态 ID (如 'MAT_SPIRIT_GRASS')，区别于动态实例 id
quality?: ItemQuality; // 可选品质，未填时默认为 Common(系数 1.0)
```

### 3.3 新建 contracts/src/market.ts

```typescript
export interface MarketItem {
  item: Item;
  count: number;             // 当前库存
  maxCount: number;          // 月度刷新上限
  basePrice: number;         // 基准售价（灵石）
}

export interface MarketInventory {
  nodeId: string;             // OverworldNode.id
  items: MarketItem[];
  buyPriceMultiplier: number;  // 收购折扣率 (如 0.7 = 七折)
  sellPriceMultiplier: number; // 出售溢价率 (如 1.2 = 加价 20%)
  lastRefreshMonth: number;   // 全局总月数
}

export interface NPCTradeOffer {
  npcId: string;
  selling: MarketItem[];       // NPC 出售 (3-5 件)
  buyingInterest: ItemType[];  // 强类型收购偏好
  budget: number;              // 本月剩余收购预算
  lastRefreshMonth: number;    // 上次刷新月份
  // 无静态 priceModifier — 交易时由 NPCInteractionEngine 实时计算
}
```

### 3.4 新建 contracts/src/item-template.ts

```typescript
export interface ItemTemplate {
  templateId: string;       // 静态模板 ID，如 'MAT_SPIRIT_GRASS'
  name: string;
  tier: number;
  type: ItemType;
  baseAttributes: AttributeMap;
  poisonValence?: number;
}
```

### 3.5 SaveData 扩展

```typescript
export interface SaveData {
  // 原有字段...
  markets: Record<string, MarketInventory>;     // key: nodeId
  npcTradeOffers: Record<string, NPCTradeOffer>; // key: npcId
  currentMonth: number;                          // 全局月度时间
}
```

## 4. 核心引擎

### 4.1 MarketPricing — 价格计算器 (纯函数)

**职责**: 计算物品基准价、买入价、卖出价。不持有状态。

**价格公式**:

```
基准价 = tier × TYPE_BASE_PRICE[type] × QUALITY_MULTIPLIER[quality]
买入价 = 基准价 × sellPriceMultiplier × factionDiscount × favorabilityDiscount
卖出价 = 基准价 × buyPriceMultiplier × favorabilityBonus
        (上限保护: 不得超过玩家当前买入价的 80%)
```

**基础价格表** (TYPE_BASE_PRICE):
| ItemType | 系数 |
|----------|------|
| Material | 100 |
| Medicine | 300 |
| Equipment | 500 |
| Talisman | 400 |
| Formula | 200 |

**品质溢价** (QUALITY_MULTIPLIER):
| ItemQuality | 系数 |
|-------------|------|
| Common | 1.0 |
| Rare | 1.5 |
| Epic | 2.5 |
| Legendary | 5.0 |
| undefined (未激活) | 1.0 (fallback) |

**套利保护**: `卖出价 = min(卖出价, 买入价 × 0.8)`，杜绝 buy-low-sell-high 循环套灵石。

### 4.2 MarketEngine — 坊市引擎

**职责**: 坊市商品刷新、库存管理。不管 NPC 交易和 UI。

**刷新逻辑** (`refreshMarket`):

```
输入: node, currentMonth, playerLuck
  1. 品阶区间 clamp: minTier = max(1, node.tier-1), maxTier = min(9, node.tier+1)
  2. 普通区 (8-12 件): ItemFactory.generateRandomItem(Common)
  3. 稀有区 (1 件): 概率 = 0.1 × (1 + playerLuck/100)
  4. Inventory 写入, lastRefreshMonth = currentMonth
输出: MarketInventory
```

**Lazy Refresh**: 进入坊市时检查 `lastRefreshMonth < currentWorldMonth`，过期则自动刷新并覆写 `saveData.markets`。

### 4.3 NPCTradeEngine — NPC 随身交易

**职责**: NPC 随身物品生成、预算管理。

**刷新逻辑** (`refreshNPCOffer`):

```
输入: npc, currentMonth
  1. 预算: 炼气 200, 筑基 500, 金丹 1500, 元婴 5000
  2. selling: ItemFactory.generateNPCTradeItems(npc.realmTier, npc.professionPreferences, count=3-5)
  3. buyingInterest: 按 NPC 职业偏好确定 (炼丹师→Material, 炼器师→Material+Equipment)
  4. lastRefreshMonth = currentMonth
输出: NPCTradeOffer → 写入 saveData.npcTradeOffers
```

**NPC 职业 → 收购偏好映射**:
| 职业类型 | buyingInterest |
|---------|----------------|
| 炼丹师 | Material, Medicine |
| 炼器师 | Material, Equipment |
| 散修 | Material |
| 宗门长老 | Material, Medicine, Equipment, Talisman |

### 4.4 ItemFactory — 物品工厂

**职责**: 从模板库按条件生成 Item 实例。静态模板 ↔ 动态实例的桥梁。

**模板池** (静态 ItemTemplate[]):

```
Tier 1: 灵草, 血花, 铁矿石, 聚气丹
Tier 2: 阴露, 阳石, 灵玉, 灵石矿, 筑基丹, 灵蕴剑, 灵甲
Tier 3: 龙血, 凤羽, 陨铁, 星光粉, 延寿丹, 星辰剑
Tier 4: 万年灵芝, 天金砂, 凝婴丹
Tier 5: 仙灵玉髓, 混沌石
```

**三级 Fallback 生成链**:
```
1. 按 preferredType + tier 范围筛选
2. 若无结果 → 放弃类型偏好，仅按 tier 范围筛选
3. 若无结果 → 全库保底 (当模板库非空时不应发生)
```

**实例 ID**: `{templateId}_{timestamp}_{random}` — 保证同类物品在列表中有唯一 key。

### 4.5 MarketTransaction — 交易执行器

**职责**: 执行买入/卖出操作，更新灵石、库存、NPC 预算。所有交易操作的事务性入口。

```
买入(player, marketItem, quantity):
  1. 计算总价 = MarketPricing.calculateBuyPrice(...)
  2. 检查 player.spiritStones >= 总价
  3. 检查 marketItem.count >= quantity
  4. 扣灵石，扣库存，加背包
  5. 库存归零时从 MarketInventory 移除该条目

卖出(player, item, quantity, market/npc):
  1. 计算总价 = MarketPricing.calculateSellPrice(...)
  2. 如果是 NPC: 检查 npcOffer.budget >= 总价
  3. 扣背包 (含堆叠拆分逻辑)
  4. 加灵石，扣 NPC budget
  5. 坊市回购不加库存 (物品被坊市"吸收"，经济水池)
```

## 5. UI 设计

### 5.1 NPCInteractionPage — 重构为对话菜单

```
现状: [切磋] [论道] [离开]
重构为:
┌──────────────────────┐
│  NPC 头像 + 名字      │
│  好感度 ████░░░░ 60   │
│  "道友有何贵干？"      │
│                      │
│  [切磋]  [论道]       │
│  [交易]  [赠礼]       │
│  [离开]              │
└──────────────────────┘
```

- 「交易」仅在好感度 > -50 时可用
- 好感度 ≤ -50 时点击「交易」弹出拒绝对话

### 5.2 MarketPage — 坊市界面 (新建)

```
┌──────────────────────────┐
│  [坊市名称]  灵石: 1,200  │
│  下次刷新: 下月初         │
│──────────────────────────│
│  普通区                   │
│  ┌──────┬──────┬──────┐  │
│  │ 灵草  │ 血花  │ 铁矿石│  │
│  │ x10   │ x5    │ x15   │  │
│  │ 150灵 │ 100灵 │ 80灵  │  │
│  │ [买]  │ [买]  │ [买]  │  │
│  └──────┴──────┴──────┘  │
│──────────────────────────│
│  ⭐ 稀有区 (气运加成)      │
│  ┌──────┐                │
│  │ 筑基丹│                │
│  │ x1   │                │
│  │ 800灵│                │
│  │ [买] │                │
│  └──────┘                │
│──────────────────────────│
│  [卖出背包物品]           │
└──────────────────────────┘
```

- 批量买入: 点击「买」弹出 slider 选择数量
- 稀有品显示气运触发提示
- 卖出面板: 背包物品 + 预计回收价

### 5.3 NPCTradePage — NPC 交易界面 (新建)

```
┌──────────────────────────┐
│  [NPC名称] 灵石: 1,200   │
│  NPC 预算: 1,500         │
│──────────────────────────│
│  NPC 出售 (3-5件)        │
│  (同上网格布局)           │
│──────────────────────────│
│  背包 ★ 仅显示NPC感兴趣  │
│  ┌──────────────────┐    │
│  │ 灵草 x5  → 120灵  │    │
│  │ [卖出]           │    │
│  ├──────────────────┤    │
│  │ 铁矿石 x10 → 80灵  │   │
│  │ [卖出]           │    │
│  └──────────────────┘    │
│  (灰色: 装备·灵剑 — NPC不感兴趣)│
└──────────────────────────┘
```

- NPC 预算耗尽后，卖出按钮变灰 "对方灵石不足"
- 不支持物品类型: 灰色禁用 + tooltip 提示原因

### 5.4 OverworldPage — 增加坊市入口

- `v-if="currentNode.type === 'Market'"` 时渲染「进入坊市」按钮
- 非 Market 节点不显示

## 6. 持久化与防作弊

### 6.1 读写流程

```
加载存档 → 遍历 saveData.markets → Lazy Refresh Check → 渲染
交易操作 → 更新 player/JianShi/budget → 写入 saveData → IndexedDB 落盘
```

### 6.2 防作弊矩阵

| 攻击方式 | 防御 |
|---------|------|
| S/L 刷坊市稀有品 | Lazy refresh 检查 lastRefreshMonth，当月不重复刷新 |
| S/L 刷 NPC 物品 | NPCTradeOffer 持久化到 saveData，关闭重开不重置 |
| 无限套利 (买卖同一坊市) | 回购价 ≤ 买入价 × 0.8 |
| 给穷 NPC 倾泻垃圾套现 | NPC budget 上限，耗尽后不可再卖 |
| 仇恨 NPC 交易 | 好感 ≤ -50 拒绝进入交易页 |

## 7. 经济平衡指标

### 7.1 初期 (炼气期) 灵石流水 (月度)

| 项目 | 金额 | 方向 |
|------|------|------|
| 灵脉产出 (tier1 × 100) | +100 | 水源 |
| 坊市购材料 (3-5 次) | -200~-500 | 水池 |
| 向 NPC 卖材料 (2-3 次) | +150~+300 | 水源 |
| **净流入** | **± 0 附近** | — |

### 7.2 设计原则

- 微通缩倾向: 灵石产出略低于消耗，驱动玩家持续探索
- 首月新手体验: 初始灵石 500，足够买一套基础装备+材料
- 等比例增长: 境界提升 → 灵脉产出增加 → 消耗同步增加

## 8. 扩展预留

| 预留接口 | 目的 |
|---------|------|
| `Item.quality` 可选字段 | 后续物品品质系统激活 |
| `MarketPricing` 纯函数 | 未来可替换为供需动态模型 |
| `NPCTradeOffer.budget` 每月重置 | 可扩展为带利息的灵石银行系统 |
| `ItemFactory.rng?` 可选参数 | 可接入世界种子实现全平台 NPC 行为同步 |
| 拍卖行 Phase 7 | NPCTradeOffer 结构可直接承载竞价逻辑 |

## 9. 模块文件清单

| 文件 | 类型 | 职责 |
|------|------|------|
| `contracts/src/market.ts` | 新建 | MarketItem, MarketInventory, NPCTradeOffer |
| `contracts/src/item-template.ts` | 新建 | ItemTemplate |
| `contracts/src/item.ts` | 修改 | 加 ItemQuality, templateId?, quality? |
| `contracts/src/character.ts` | 修改 | 加 spiritStones |
| `engine/src/market/market-pricing.ts` | 新建 | 价格计算器 (纯函数) |
| `engine/src/market/market-engine.ts` | 新建 | 坊市刷新 + 库存管理 |
| `engine/src/market/npc-trade-engine.ts` | 新建 | NPC 随身交易生成 |
| `engine/src/market/item-factory.ts` | 新建 | 物品模板池 + 动态生成 |
| `engine/src/market/market-transaction.ts` | 新建 | 交易执行器 |
| `persistence/src/save-schema.ts` | 修改 | SaveData 加 markets, npcTradeOffers, currentMonth |
| `apps/taosim-ui/src/pages/MarketPage.vue` | 新建 | 坊市界面 |
| `apps/taosim-ui/src/pages/NPCTradePage.vue` | 新建 | NPC 交易界面 |
| `apps/taosim-ui/src/pages/NPCInteractionPage.vue` | 修改 | 重构为对话菜单 |
| `apps/taosim-ui/src/pages/OverworldPage.vue` | 修改 | 加 Market 节点入口 |

## 10. 测试范围

- `MarketPricing`: 基准价、买入价、卖出价、套利保护、quality fallback
- `MarketEngine`: 刷新去重、tier clamp、稀有概率
- `NPCTradeEngine`: 预算生成、物品数量、buyingInterest 过滤
- `ItemFactory`: 三级 fallback、实例 ID 唯一性、模板加载
- `MarketTransaction`: 买入/卖出事务、灵石原子性、NPC budget 耗尽
- 集成测试: NPCInteractionPage → NPCTradePage 完整交易流
