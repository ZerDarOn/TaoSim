# Phase 0 Task 4：运行时状态与存档边界判决

> 审计日期：2026-08-10
> 归属：[统一修仙世界模拟架构方案](../systemic-cultivation-world-blueprint.md) Phase 0
> 依赖：[Task 1 数据流](01-entity-data-flow.md)、[Task 2 字段权威矩阵](02-field-authority-matrix.md)
> 权限：本任务只做判决和建议，不修改 contracts/engine/UI

## 判决原则

对每个"死字段"分别回答：
1. **权威性**：该数据的真实权威在哪？（确定性生成 / 散落在其他字段 / 真正缺失）
2. **恢复需求**：读档后是否需要恢复？能否从确定性源重建？
3. **根因分类**：废弃契约 / 未实现功能 / 可重建缓存 / 待决策设计
4. **处置建议**：删除 / 迁移 / 保留改造 / 延后

**关键约束**：不能仅因"写空"就推导相同根因（本轮授权第 3 条）。

---

## 一、`activeNPCs: Record<string, Character>`

### 1.1 现状
- 定义：save-system.ts:40
- 写入：app.ts:91 永远 `{}`
- 读取：loadGame 不读（app.ts:104-122）
- 引擎引用：packages/engine/src 下零命中

### 1.2 权威性分析

**真实权威**：`worldState.npcs[id]`（NpcRecord 字典）。Character 展开态可以从 NpcRecord 按 `npcRecordToCharacter` 确定性重建。

**为什么不持久化展开态**：
- 展开态是**可重建缓存**——同 NpcRecord + 同公式 = 确定性输出
- Character 展开态包含大量 mutable 瞬态（hp/ap/skillCooldowns），持久化会与 NpcRecord 形成**双份权威**
- 1500 NPC 全量展开存档会导致存档体积膨胀几十倍

### 1.3 是否有不可重建的进行中状态？

| 进行中状态 | 当前是否有 | 建议归属 |
|------------|-----------|----------|
| 战斗进行中（ATB tick / 中毒 / 吟唱） | 当前战斗不跨存档（BattleOverlay 退出即弃） | `activeBattles` 场景快照（未来） |
| 未完成交易 | MarketTransaction 是同步的 | 不需要 |
| 场景内临时物品 | 无此机制 | — |

**结论**：当前没有"不可重建的进行中状态"需要持久化。

### 1.4 判决

| 维度 | 判定 |
|------|------|
| 根因 | **废弃契约**（早期设计预留的展开态缓存，后被 NpcRecord 持久化方案取代） |
| 权威性 | 非权威（worldState.npcs 是权威） |
| 恢复需求 | 无（可从 NpcRecord 重建） |
| 处置 | **删除字段**。未来若有跨存档场景（如战斗中断存档），应引入 `activeScenes` 类型，不复用此字段 |

### 1.5 迁移建议

- SavePayload v3→v4 迁移：删除 `activeNPCs` 字段
- 迁移函数：`delete payload.activeNPCs`（无数据损失）
- schemaVersion 3→4

---

## 二、`overworldMap: OverworldMap`

### 2.1 现状
- 定义：save-system.ts:42（类型 `OverworldMap` from overworld.ts:31）
- 写入：app.ts:93 永远 `{ continents: [] }`
- 读取：loadGame 不读
- 生产引用：`OverworldMap` 类型在 `overworld-engine.ts:25`、`preset-map.ts:19`、`overworld-map-generator.ts:20` 被使用

### 2.2 权威性分析

**OverworldMap 的数据来源**：
- `preset-map.ts:19` `PRESET_MAP` 是**静态常量**（硬编码的大陆/节点/连接）
- `overworld-map-generator.ts:20` `OverworldMapGenerator.generate(config)` 是**确定性生成器**（seeded）

**玩家的大世界位置**实际由 `playerMapState`（SavePayload:47）持有，包括 activeLayer/activeContinentId/activeVenueId/hexPos/exploredHexes。

### 2.3 是否需要持久化？

| 数据 | 确定性？ | 需持久化？ |
|------|---------|-----------|
| 大陆/节点拓扑（PRESET_MAP） | ✅ 静态常量 | ❌ 不需要（代码内嵌） |
| 随机生成的地图 | ✅ seeded（同 seed 同结果） | ⚠️ 需持久化 seed（当前 seed 硬编码在 generator config） |
| 玩家已探索区域 | 否 | ✅ 已在 playerMapState.exploredHexes |

### 2.4 判决

| 维度 | 判定 |
|------|------|
| 根因 | **废弃契约 + 部分迁移**（原设计想存大世界拓扑，后被"静态 PRESET_MAP + playerMapState"方案取代） |
| 权威性 | 非权威（PRESET_MAP 是权威；playerMapState 持有玩家状态） |
| 恢复需求 | 无（PRESET_MAP 代码内嵌；playerMapState 独立持久化） |
| 处置 | **删除字段**。未来若引入程序化生成的大陆，应存 `mapSeed` 而非完整地图 |

### 2.5 迁移建议

- SavePayload v3→v4 迁移：删除 `overworldMap` 字段
- 迁移函数：`delete payload.overworldMap`
- 若未来引入随机大陆，新增 `mapSeed: number` 字段

---

## 三、`graveyard: GraveMarker[]`

### 3.1 现状
- 定义：save-system.ts:26-34（GraveMarker 接口）+ :45（SavePayload 字段）
- 写入：app.ts:94 永远 `[]`
- 读取：loadGame 不读
- 死亡处理：world-engine.ts:1097-1100 `delete this.state.npcs[id]`（直接删除，不生成 GraveMarker）

### 3.2 权威性分析

**死亡 NPC 的信息实际在哪？**

world-engine.ts 的死亡处理（宽限期 → Oblivion）：
- 设 `record.soulState = 'Oblivion'`（world-engine.ts:1082）
- 设 `record.deathYear` / `record.deathMonth`（world-engine.ts:1089-1090）
- **然后 delete record**（world-engine.ts:1097-1100 `delete this.state.npcs[id]`）

**问题**：死亡信息（deathYear/causeOfDeath/soulState=Oblivion）被写入后立即随 delete 丢失。

### 3.3 与方案的冲突

方案 §4.3 要求"事实账本不可删除历史"——实体可以退出活动世界，但人物历史不能被删除。当前 `delete this.state.npcs[id]` 直接违反此原则。

### 3.4 判决

| 维度 | 判定 |
|------|------|
| 根因 | **未实现功能**（GraveMarker 设计了但从未接入） |
| 权威性 | 无权威（死亡信息随 delete 丢失） |
| 恢复需求 | **需要**（编年史/传闻/遗府/夺舍都依赖死亡历史） |
| 处置 | **保留字段 + 实现功能**。在 world-engine 死亡处理时构造 GraveMarker 并 push，停止 delete |

### 3.5 实现建议（不在本阶段执行，仅记录）

```
world-engine 死亡处理改为：
1. record.soulState = 'Oblivion'
2. record.deathYear/Month = 当前
3. graveyard.push({ id, name, realm, deathYear, deathMonth, causeOfDeath, factionId, locationId })
4. record 保留在 state.npcs（标记 Oblivion，不参与 tick）
   或移入独立的 state.historicalNpcs（减少活跃字典体积）
```

**决策点**：Oblivion 的 NPC 是保留在 `state.npcs`（soulState 过滤）还是分离到 `state.historicalNpcs`？前者简单但字典膨胀，后者干净但需改数据结构。**延后到 Phase 1 决策**。

---

## 四、`factions: Record<string, Faction>`

### 4.1 现状
- 定义：save-system.ts:41
- 写入：app.ts:92 `toPlain(this.currentWorldState.factions ?? {})`
- 读取：loadGame 不直接读（经 worldState.factions 间接恢复）

### 4.2 判决

| 维度 | 判定 |
|------|------|
| 根因 | **冗余投影**（从 worldState.factions 二次投影） |
| 权威性 | 非权威（worldState.factions 是权威） |
| 处置 | **删除字段**（冗余，worldState 已含） |

---

## 五、`marketInventories: Record<string, MarketInventory>`

### 5.1 现状
- 定义：save-system.ts:43
- 写入：app.ts:95 永远 `{}`
- 读取：loadGame 不读
- MarketEngine.refreshMarket（market-engine.ts:10）每月确定性刷新库存

### 5.2 权威性分析

MarketInventory 由 `MarketEngine.refreshMarket(node, npcRecords, currentMonth, seed)` 按月确定性生成。同 seed + 同 npcRecords + 同 month = 同结果。

### 5.3 判决

| 维度 | 判定 |
|------|------|
| 根因 | **可重建缓存**（原设计想持久化坊市库存，后被确定性刷新取代） |
| 权威性 | 非权威（MarketEngine 确定性生成是权威） |
| 恢复需求 | 无（读档后按 currentMonth 重新 refresh 即可） |
| 处置 | **删除字段**。需确认 refreshMarket 的 seed 是否持久化（若 seed 随机则需存 seed） |

### 5.4 验证点

需确认 `MarketEngine.refreshMarket` 的 seed 来源：
- 若 seed = 确定性函数（如 `hash(nodeId, currentMonth)`）→ 完全可重建，删字段安全
- 若 seed = 随机 → 需额外持久化 seed

---

## 六、`npcTradeOffers: Record<string, NPCTradeOffer>`

### 6.1 现状
- 定义：save-system.ts:45
- 写入：app.ts:96 永远 `{}`
- 读取：loadGame 不读

### 6.2 判决

| 维度 | 判定 |
|------|------|
| 根因 | **未实现功能**（NPC 交易报价设计了但未接入） |
| 处置 | **延后**。等 NPC 交易系统实现时再决定持久化策略 |

---

## 七、`playerMapState: PlayerMapState | undefined`

### 7.1 现状
- 定义：save-system.ts:47
- 写入：app.ts:98 `toPlain(mapStore.state)`
- 读取：app.ts:118-120 `if (payload.playerMapState) mapStore.hydrateFromSave(...)`

### 7.2 判决

| 维度 | 判定 |
|------|------|
| 根因 | **正常字段**（Phase-save-fix 新增，工作正常） |
| 权威性 | 权威（玩家地图状态唯一持久化点） |
| 处置 | **保留** |

---

## 八、总判决表

| 字段 | 根因分类 | 权威性 | 恢复需求 | 处置 | schemaVersion |
|------|----------|--------|----------|------|---------------|
| `activeNPCs` | 废弃契约 | 非权威（可重建） | 无 | **删除** | v4 |
| `overworldMap` | 废弃契约 + 部分迁移 | 非权威（PRESET_MAP） | 无 | **删除** | v4 |
| `graveyard` | 未实现功能 | 无权威（delete 丢失） | **需要** | **保留 + 实现** | 不变 |
| `factions` | 冗余投影 | 非权威（worldState 含） | 无 | **删除** | v4 |
| `marketInventories` | 可重建缓存 | 非权威（确定性刷新） | 无（需验证 seed） | **删除** | v4 |
| `npcTradeOffers` | 未实现功能 | 无 | 未知 | **延后** | 不变 |
| `playerMapState` | 正常字段 | **权威** | 需要 | **保留** | 不变 |

## 九、SavePayload v3→v4 迁移草案

```typescript
// save-system.ts 迁移函数
function migrateV3ToV4(payload: any): any {
  const { activeNPCs, overworldMap, factions, marketInventories, ...rest } = payload;
  // 删除 4 个废弃/冗余字段
  // 保留 graveyard（待实现）、npcTradeOffers（待实现）、playerMapState（正常）
  return {
    ...rest,
    schemaVersion: 4,
  };
}
```

**数据损失评估**：
- activeNPCs：无（永远空）
- overworldMap：无（永远空）
- factions：无（worldState.factions 有备份）
- marketInventories：无（永远空，MarketEngine 可重建）

**风险评估**：**零风险**——四个被删字段要么永远空，要么有 worldState 备份。
