# Phase 10 — UI 架构重构：单界面多面板体系 设计规格

> **目标：** 将多页面路由架构重构为"单游戏界面 + 多面板切换"架构，对齐鬼谷八荒/论如何建立一个修仙门派的 UI 范式。创角后进入常驻游戏主界面，功能通过面板切换而非页面跳转。

---

## 1. 问题诊断

### 1.1 当前架构的根本问题

| 问题 | 现状 | 正确做法 |
|------|------|---------|
| **多页面路由** | 每个功能是独立路由（/world, /crafting, /market...），像网站导航 | 单一游戏界面，功能面板叠加切换 |
| **导航栏残留** | 创角后顶部还有"首页/创角"入口 | 创角后无返回，游戏界面是唯一的 |
| **状态不可见** | HP/灵力/灵石只在 WorldPage 局部显示 | 核心状态常驻侧边栏，任何操作都可见 |
| **无主舞台** | 没有一个"你在这里"的核心场景感 | 大地图/当前场景作为主交互区 |
| **跳转感** | 点功能 → 跳新页面 → 返回，割裂沉浸感 | 点功能 → 主区域切换内容，侧边栏不变 |

### 1.2 参考竞品的核心范式

**鬼谷八荒**：大地图 = 主界面。左下角角色头像 + 功能按钮圈。右侧任务追踪。底部时间控制。所有面板叠加在大地图上。

**论如何建立一个修仙门派**：三栏布局。左侧角色状态常驻，中间主交互区（场景/弟子/行动），右侧事件日志。底部功能切换栏。单界面不跳页。

**共同原则**：
1. 游戏中只有一个主界面
2. 角色状态永远可见
3. 功能切换 = 主区域内容替换，不是页面跳转
4. 事件日志/时间控制常驻

---

## 2. 架构设计

### 2.1 整体布局

```
游戏未开始
  └─ MainTitle（主菜单：新游戏 / 读档）

游戏中（GameScreen — 唯一的游戏界面）
  ┌──────────────────────────────────────────────────┐
  │              顶部条（时间 + 月份推进控制）           │
  ├──────────┬───────────────────────┬───────────────┤
  │          │                       │               │
  │ 左侧栏    │     主交互区           │   右侧栏       │
  │ 角色面板  │   (ActivePanel)       │  事件日志      │
  │          │                       │               │
  │ 境界     │  根据 activeTab 切换：  │  时间轴事件流  │
  │ HP/灵力  │  - map    大地图       │               │
  │ AP/灵石  │  - cult   修炼突破     │  奇遇/突破/   │
  │ 寿命     │  - craft  百艺炼制     │  死亡/奇遇    │
  │ 灵根     │  - market 坊市交易     │               │
  │ 天赋     │  - npc    人际交互     │               │
  │          │  - inv    背包装备     │               │
  │          │  - upgrade 升品        │               │
  │          │                       │               │
  ├──────────┴───────────────────────┴───────────────┤
  │           底部功能栏（Tab 切换主区域内容）            │
  └──────────────────────────────────────────────────┘
```

### 2.2 组件架构

```
AppShell.vue（根布局 — 创角前/后分支）
├─ MainTitleScreen.vue（创角前：主菜单）
├─ CreateCharacterPage.vue（phase='creating' 时渲染）
├─ GameScreen.vue（phase='playing' 时渲染：唯一游戏界面）
│  ├─ TopBar.vue（时间显示 + 推进控制 + 模式标识）
│  ├─ LeftSidebar.vue（角色状态常驻面板）
│  ├─ EventLog.vue（右侧事件日志）
│  ├─ BottomNav.vue（底部功能 Tab 切换栏）
│  └─ MainContent.vue（主交互区 — 根据 activeTab 动态渲染）
│      ├─ MapPanel.vue（大地图/当前场景）
│      ├─ CultivationPanel.vue（修炼突破）
│      ├─ CraftingPanel.vue（炼丹炼器 + 升品，子视图切换）
│      ├─ MarketPanel.vue（坊市交易）
│      ├─ NpcPanel.vue（NPC 交互 + 交易，子视图切换）
│      └─ InventoryPanel.vue（背包装备）
└─ GameOverScreen.vue（phase='gameover' 时渲染）
```

### 2.3 状态管理

```typescript
// stores/ui.ts — 新增 UI 状态 store
interface UIState {
  activeTab: GameTab;              // 当前激活的面板
  activePanelOverlay: boolean;     // 是否有叠加面板（如角色详情弹窗）
}

type GameTab = 'map' | 'cult' | 'craft' | 'market' | 'npc' | 'inv';

// stores/game-flow.ts — 游戏流程状态
interface GameFlowState {
  phase: 'title' | 'creating' | 'playing' | 'gameover';
  deathMessage: string | null;
}
```

### 2.4 路由简化

```
/ → 根据 gameFlow.phase 决定显示：
    - 'title'    → MainTitleScreen
    - 'creating' → CreateCharacterPage
    - 'playing'  → GameScreen
    - 'gameover' → GameOverScreen

不再有 /world /crafting /market 等独立路由！
全部由 GameScreen 内部的 activeTab 控制。
```

---

## 3. 详细面板设计

### 3.1 LeftSidebar（左侧角色状态栏）

常驻显示，任何 Tab 下都可见：

```
┌─────────────┐
│ [角色名]     │
│ 炼气期一层    │
│ ─────────── │
│ 气血 ████░░  │ 150/200
│ 灵力 ██████  │ 100/100
│ 行动 ■■□□□  │ 8/10
│ ─────────── │
│ 灵石：1,250  │
│ ─────────── │
│ 寿元：32/100 │
│ ⚠ 80% 预警  │
│ ─────────── │
│ 灵根：地灵根 │
│ 火（变异）   │
│ ─────────── │
│ [天赋] [详情] │ ← 点击弹出详细面板
└─────────────┘
```

### 3.2 TopBar（顶部时间控制）

```
┌──────────────────────────────────────────┐
│ 道历 3年 4月  │  [推进1月] [闭关1年] [闭关10年]  │  铁人模式 │
└──────────────────────────────────────────┘
```

> **实现说明：** “推进1月”调用 `PlayerLifecycleService.advanceTime(player, 1)`；
> “闭关 1 年/10 年”调用 `WorldEngine.fastForward(n)` —— 现有引擎已支持。
> 不是新增引擎能力，只是 `UX` 包装。

### 3.3 BottomNav（底部功能栏）

```
┌──────────────────────────────────────────────────────┐
│  [大地图]  [修炼]  [百艺]  [坊市]  [人际]  [背包]      │
└──────────────────────────────────────────────────────┘
当前激活的 Tab 高亮
```

### 3.4 MainContent（主交互区）

根据 activeTab 渲染对应面板。现有页面的核心逻辑迁移到 Panel 组件中，去掉 `<router-link>`，改为 emit/事件切换 Tab。

### 3.5 EventLog（右侧事件日志）

常驻显示世界事件、修炼反馈、突破结果等。时间轴倒序。

---

## 4. 迁移策略

### 4.1 现有页面 → 面板组件映射

| 现有页面 | 新面板组件 | 迁移说明 |
|---------|-----------|---------|
| WorldPage.vue | MapPanel.vue | 时间控制移到 TopBar，角色信息移到 LeftSidebar，事件移到 EventLog |
| CultivationPage.vue | CultivationPanel.vue | 去掉 router-link，突破结果 emit 到 EventLog |
| CraftingPage.vue | CraftingPanel.vue + UpgradePanel.vue | 合并炼制 + 升品为一个 Tab 的子视图 |
| MarketPage.vue | MarketPanel.vue | 同上 |
| NPCInteractionPage.vue + NPCTradePage.vue | NpcPanel.vue | 合并为一个 Tab，子视图切换 |
| InventoryPage.vue | InventoryPanel.vue | 同上 |
| HomePage.vue | MainTitleScreen.vue | 简化为纯主菜单 |
| GameOverPage.vue | GameOverScreen.vue | 由 gameFlow.phase 控制 |

### 4.2 不改动的部分

- engine 包：完全不动（纯逻辑，与 UI 无关）
- contracts 包：完全不动
- persistence 包：完全不动
- 所有测试：不动（engine 层测试不受 UI 重构影响）

---

## 5. 初始游戏状态修正

创角后角色必须有一套能玩下去的初始状态（当前 inventory 为空、灵石为 0 是玩不了的根本原因之一）：

### 5.1 CharacterFactory 初始物品

| 家世 | 初始灵石 | 初始材料 | 初始装备 |
|------|---------|---------|---------|
| `orphan` | 100 | 灵草×3, 铁矿石×2 | 无 |
| `small-clan` | 500 | 灵草×5, 铁矿石×5, 阴露×2 | `ITEM_WOODEN_SWORD` |
| `ancient-clan` | 2000 | 灵草×10, 陨铁×3, 阴露×5, 阳石×5 | `ITEM_SPIRIT_SWORD` |

> **注：** 表格中的“灵草/铁矿石/阴露/陨铁/阳石”等材料当前数据表里暂无，这是真实缺口，需要补充。
> “青木剑”(`ITEM_WOODEN_SWORD`)和“灵蕴剑”(`ITEM_SPIRIT_SWORD`)在 CharacterFactory 里已存在。

### 5.2 TRAIT_REGISTRY 接入

CharacterFactory 从 TRAIT_REGISTRY 查词条（而非旧的 TRAIT_TEMPLATES），让创角选的词条真正生效。

### 5.3 初始材料的处理决策

§5.1 表格中的"灵草/铁矿石/阴露/陨铁/阳石"当前在 item 数据表中没有定义。两种处理方式：

- **方案 A（推荐）：** 本次只给初始灵石 + 已有的武器装备，inventory 暂时空或只放现有物品。材料数据表作为后续 Phase 补充，避免本次 scope 蔓延。
- **方案 B：** 本次顺带新建一个最小材料数据表（只含上述 5 种），让炼丹/炼器系统能跑通。

> **选择 A 的理由：** Phase 10 的核心是 UI 架构重构，不是数据建模扩展。先把架构走通，材料缺口是独立工作项。

---

## 6. 实施顺序

```
Phase 10.1: 基础架构
  → game-flow store + ui store
  → GameScreen.vue 骨架（TopBar + LeftSidebar + BottomNav + MainContent + EventLog）
  → 路由简化为单路由 + phase 分支

Phase 10.2: 面板迁移
  → WorldPage → MapPanel
  → CultivationPage → CultivationPanel
  → CraftingPage + UpgradePage → CraftingPanel
  → MarketPage → MarketPanel
  → NPC Pages → NpcPanel
  → InventoryPage → InventoryPanel

Phase 10.3: 初始状态修正
  → CharacterFactory 初始物品/灵石
  → TRAIT_REGISTRY 接入

Phase 10.4: 验证 + 体验打磨
  → 创角后体验流程走通
  → 全量测试
```

---

## 7. 验收标准

1. 创角后进入 GameScreen，无"首页/创角"入口
2. 左侧角色状态栏在任何 Tab 下常驻可见
3. 底部功能栏切换主区域内容，无页面跳转感
4. 右侧事件日志实时反馈操作结果
5. 创角后角色有初始灵石和材料，可立即炼丹/交易
6. 创角选的词条生效（从 TRAIT_REGISTRY 查）
7. 时间推进 → 角色老化 → 死亡 → GameOver 全程在 GameScreen 内完成
8. engine/contracts/persistence 包零改动
9. 全量测试通过
