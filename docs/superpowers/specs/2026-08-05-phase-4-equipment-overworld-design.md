# Phase 4: 装备与大世界探索 — 设计文档

> 日期：2026-08-05 | 状态：Approved

## 目标

让 Phase 3 炼制的装备真正可用（穿戴/卸下/战斗属性生效），同时把游戏舞台从单张 Hex 地图扩展为可旅行的大世界。

## 模块一：装备系统

### EquipmentManager（引擎层）

**职责：** 管理角色的装备穿戴、卸下、槽位限制、战斗属性聚合。

```
equip(character, item) → EquipResult
  - 判断 item.type === 'Equipment'
  - 按装备类型分配到对应槽位（weapon / armor / treasures[]）
  - treasures 至多 3 个
  - 从 inventory 移除，放入 equipmentSlots
  - 若槽位已有装备 → 先卸下旧装备

unequip(character, slot) → EquipResult
  - 从 equipmentSlots 移除
  - 装回 inventory

getCombatBonuses(character) → CombatBonuses { attack, defense, critRate, ... }
  - 聚合所有已装备槽位的属性
```

### 战斗集成

在 `DamagePipeline` 或 `CombatEngine` 中，攻击/防御计算时调用 `EquipmentManager.getCombatBonuses()` 叠加装备属性。

### InventoryPage UI

- **背包列表：** 展示所有 ItemStack（图标/名称/数量/类型）
- **装备面板：** 当前装备槽位可视化（武器 1、防具 1、法宝×3）
- **交互：** 点击背包物品 → 若为装备 → 穿戴；点击已装备 → 卸下
- **空状态：** 无物品时显示提示

---

## 模块二：大世界探索

### 预设地图数据（preset-map.ts）

1 个大陆 "东荒"，共 12 个节点：

| 节点 | 类型 | Tier | 连接至 |
|------|------|------|--------|
| 青云宗 | Sect | 2 | 落霞荒野东、天机城 |
| 天机城 | City | 3 | 青云宗、坊市、黑风洞 |
| 坊市 | Market | 2 | 天机城、落霞荒野南 |
| 黑风洞 | Dungeon | 3 | 天机城 |
| 落霞荒野东 | Wilderness | 1 | 青云宗、落霞荒野北 |
| 落霞荒野北 | Wilderness | 2 | 落霞荒野东、灵脉矿洞 |
| 落霞荒野南 | Wilderness | 2 | 坊市、灵脉矿洞 |
| 灵脉矿洞 | Dungeon | 2 | 落霞荒野北、落霞荒野南、天剑宗 |
| 天剑宗 | Sect | 2 | 灵脉矿洞 |
| 幽冥沼泽 | Wilderness | 3 | 天剑宗、黑风洞 |
| 陨星谷 | Dungeon | 4 | 幽冥沼泽 |
| 荒古战场 | Dungeon | 5 | 陨星谷 |

默认出生点：青云宗。

### OverworldEngine（引擎层）

```
travel(player, fromNodeId, toNodeId, overworldMap) → TravelResult
  - 校验相邻性（edge 存在）
  - 消耗 distanceDays 天（WorldEngine.fastForward）
  - 途中判定奇遇（概率 ~30%）：
    - 获得材料（按节点 tier）
    - 触发战斗（切入 Hex 战棋，生成匹配敌人）
  - NPC 偶遇（按玩家宗门/境界生成 NPC，概率 ~15%）
  - 返回事件列表 + 当前节点位置
```

### OverworldMapGenerator（程序化生成）

种子驱动的节点图生成：
- 节点数量、类型分布、连接密度参数化
- 类似 Phase 2 `MapGenerator` 的风格
- 用于非预设地图或 MOD 扩展

### NPC 偶遇（简化版）

偶遇时生成匹配当前节点 tier 的 NPC（散修/宗门弟子），触发简单对话：
- "切磋" → 切入战斗
- "论道" → 提升少量经验
- 离开

### OverworldPage UI

- 节点图渲染（CSS 定位 + SVG 连线）
- 当前所在节点高亮
- 相邻节点可点击 → 显示旅行信息（距离天数、预计风险）
- 旅行结果事件弹窗
- 可随时从节点切入 Hex 战斗（如秘境/野地战斗）

---

## 文件清单

```
packages/engine/src/
├── equipment/
│   └── equipment-manager.ts          # NEW
├── overworld/
│   ├── overworld-engine.ts           # NEW
│   ├── overworld-map-generator.ts    # NEW
│   └── preset-map.ts                 # NEW
├── combat/
│   └── damage-pipeline.ts            # MODIFY: 装备加成

apps/taosim-ui/src/
├── pages/
│   ├── InventoryPage.vue             # NEW
│   └── OverworldPage.vue             # NEW
├── router/
│   └── routes.ts                     # MODIFY: 新增路由

packages/engine/src/__tests__/
├── equipment-manager.test.ts         # NEW
├── overworld-engine.test.ts          # NEW
└── overworld-map-generator.test.ts   # NEW

packages/engine/src/index.ts          # MODIFY: 导出新模块
```

## 测试计划：~14 个新测试

| 模块 | 测试数 |
|------|--------|
| EquipmentManager | 4 (equip/unequip/slot limit/bonuses) |
| OverworldEngine | 5 (travel/success/encounter/no-route/npc-meetup) |
| OverworldMapGenerator | 5 (generate/nodes/edges/seed-determinism/cluster) |

**目标：48 → ~62 个测试**
