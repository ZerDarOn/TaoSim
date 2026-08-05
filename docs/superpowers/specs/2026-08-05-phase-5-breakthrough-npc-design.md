# Phase 5: 修仙进阶与 NPC 交互 — 设计文档

> 日期：2026-08-05 | 状态：Approved

## 目标

扩展突破系统到金丹、元婴两个层级，建立 NPC 交互系统（切磋/论道/交易 + 好感度），让大世界偶遇 NPC 不再只是看到名字。

## 模块一：突破层级 Tier 2-3

### 突破配置

在 contracts 中添加 Tier 2/3 的标准配置：

| Tier | 突破路径 | 修为需求 | 材料需求 | 基础成功率 | 寿元提升 | 其他效果 |
|------|----------|----------|----------|-----------|----------|----------|
| 1 | 炼气→筑基 | 1000 | 筑基丹 | 0.85 | 200 | canFly=true |
| 2 | 筑基→金丹 | 5000 | 金元丹 | 0.70 | 400 | HP×2, 灵力×1.5 |
| 3 | 金丹→元婴 | 20000 | 凝婴丹 | 0.55 | 800 | soulState→PrimordialSoul |

TribulationEngine 本身无需修改 — 通过 config 参数驱动。

### CultivationPage 改造

当前页面硬编码 Tier 1 配置。改为：
- 根据 `character.realm` 动态查询可用突破配置
- 如果在 `QiRefinement_9` → 显示筑基选项
- 如果在 `Foundation_3` → 显示金丹选项
- 如果在 `GoldenCore_3` → 显示元婴选项
- 否则显示"境界不满，继续修炼"

---

## 模块二：NPC 交互 + 好感度

### NPCGenerator

按节点 tier 生成匹配境界的 NPC：
- tier 1: QiRefinement_3~5
- tier 2: Foundation_1~2
- tier 3: Foundation_3~GoldenCore_1
- tier 4: GoldenCore_2~3
- tier 5: NascentSoul_1

### NPCInteractionEngine

```
interact(player, npc, action, params?) → InteractionResult
```

三种行动：

**切磋**
- 触发 Hex 战斗（返回战斗切入信号）
- 胜利：好感 +5，获得少量修为
- 失败：好感 +1（不打不相识）

**论道**
- 不切战斗，直接文本结算
- 双方悟性差影响收益：基础 + comprehension*10 exp
- NPC 好感 +3

**交易**
- 返回 NPC 可卖出物品列表 + 回收单价列表
- 价格受好感度调整：好感>0 优惠买入、溢价回收
- 交易完成好感 +1

### 好感度（利用已有 Character.relations 字段）

已有字段结构：
```typescript
relations: {
  targetId: string;
  favorability: number;
  hatred: number;
  jealousy: number;
  tags: string[];
}[]
```

使用 `favorability` 字段（-100 ~ 100）：
- 调整函数 `adjustFavorability(char, targetId, delta)`
- 交易价格计算 `priceMultiplier = 1 - favorability/200`（好感度 100 → 半价买入）

### NPCInteractionPage

旅行偶遇 NPC → 弹出交互面板：
- NPC 信息（名称、境界）
- 好感度条
- 4 个按钮：切磋/论道/交易/离开
- 操作结果反馈

### OverworldEngine 集成

旅行偶遇 NPC 时，将 NPC 数据存入全局状态（playerStore），OverworldPage 检测到后自动跳转 NPCInteractionPage。

---

## 文件清单

```
packages/contracts/src/
└── tribulation.ts                    # MODIFY: 导出标准突破配置

packages/engine/src/
├── interaction/
│   ├── npc-generator.ts             # NEW
│   └── npc-interaction-engine.ts    # NEW
├── index.ts                         # MODIFY

apps/taosim-ui/src/
├── pages/
│   ├── CultivationPage.vue          # MODIFY: 动态突破
│   └── NPCInteractionPage.vue       # NEW
├── stores/
│   └── player.ts                    # MODIFY: 存储当前 NPC
├── router/
│   └── routes.ts                    # MODIFY
```

## 测试计划：~13 个新测试

| 模块 | 测试数 |
|------|--------|
| Tribulation Tier 2 配置 (筑基→金丹) | 3 |
| Tribulation Tier 3 配置 (金丹→元婴) | 3 |
| NPCGenerator (按tier生成) | 3 |
| NPCInteractionEngine (切磋/论道/交易/好感) | 4 |

**目标：62 → ~75 个测试**
