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

- SavePayload v3→v4：新存档停止写入该字段；旧 v3 多余字段可由结构化读取忽略
- 若注册 v3→v4 迁移，版本由 `SaveMigrationRunner` 更新 `payload.header.schemaVersion`，不得写根级 `payload.schemaVersion`
- 删除前必须新增真实的 v1/v2/v3→v4 迁移测试和新存档 round-trip 测试；当前仓库没有计划中声称的现成 save-load 测试

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
| 处置 | **从当前 SavePayload 删除无效占位字段**。未来地图至少保存 `mapSeed + 世界地形/场所变更差量`；仅保存 seed 无法恢复被战斗、灾变或建设改写的世界 |

### 2.5 迁移建议

- 新 v4 存档停止写入 `overworldMap: { continents: [] }`；旧字段可忽略
- 程序化地图引入时，在 WorldState 保存 `mapSeed`，并为非确定性地形/场所变化保存差量或权威状态

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

**问题**：完整人物档案（亲缘、关系、传记、身份等）随 delete 丢失。eventLog 与 heritageSites 可能保留部分死亡事实或遗府，不能支持完整人物追溯、墓碑 re-hydrate 和后续因果查询。

### 3.3 与方案的冲突

方案 §4.3 要求"事实账本不可删除历史"——实体可以退出活动世界，但人物历史不能被删除。当前 `delete this.state.npcs[id]` 直接违反此原则。

### 3.4 判决

| 维度 | 判定 |
|------|------|
| 根因 | **未实现功能**（GraveMarker 设计了但从未接入） |
| 权威性 | 无权威（死亡信息随 delete 丢失） |
| 恢复需求 | **需要**（编年史/传闻/遗府/夺舍都依赖死亡历史） |
| 处置 | **不把顶层 `graveyard` 继续当权威容器**。在 WorldState 建立历史实体档案；死亡时从活动 `npcs` 原子迁移到历史档案并生成死亡事实，GraveMarker 作为可重建查询投影 |

### 3.5 实现建议（不在本阶段执行，仅记录）

```
world-engine 死亡处理目标：
1. 在 WorldOutcome 中写入 soulState/deathYear/deathMonth/causeOfDeath 与死亡事实草案
2. 从 `worldState.npcs` 移除活动档案
3. 将完整 NpcRecord 写入 `worldState.archivedNpcs`（名称可在 ADR 中最终确定）
4. GraveMarker 从 archivedNpcs + Fact Ledger 投影；若为查询性能持久化，也只能是非权威索引
5. 活动人口补充只统计 `worldState.npcs`，历史人物不阻塞新生人口
```

**判决**：选择活动档案与历史档案分离。事实不可删除不等于死者永久占用活动字典；否则会导致字典膨胀，并使当前“低于 800 补人口”的逻辑把死者计入人口。

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
- MarketEngine.refreshMarket（market-engine.ts:6）内部直接使用 `Math.random()`；同节点同月份不能确定性重建

### 5.2 权威性分析

当前签名是 `refreshMarket(node, currentMonth, playerLuck)`，没有 seed 参数；内部物品数量、稀有物品和 ItemFactory 都使用随机数。现有测试还明确验证“同一节点两次刷新产生不同内容”。因此它不是可重建缓存。

当前 SavePayload 字段始终写 `{}`，所以它也没有承担真实库存权威。真实经济目标要求市场库存、物品来源和所有权进入世界状态，不能把随机刷新器称为权威来源。

### 5.3 判决

| 维度 | 判定 |
|------|------|
| 根因 | **未接入契约**（字段为空，运行时市场另用随机临时库存） |
| 权威性 | 当前不存在持久化权威 |
| 恢复需求 | 当前读档会随机重建并改变库存；这属于已知行为缺口，不是确定性恢复 |
| 处置 | v4 可删除这个无效顶层占位，但必须另立真实经济迁移任务：将市场库存/所有权纳入 WorldState；不得宣称删除后可无损重建同一市场 |

### 5.4 验证点

已确认当前使用 `Math.random()`。后续有两条合法路线：
- 真实库存：持久化库存、生产、购买和运输结果（符合总方案）；
- 过渡方案：注入并持久化 seed，使同一月份可重建，但仍不能替代真实所有权模型。

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
| `graveyard` | 未实现投影 | 完整权威应在 WorldState 历史档案 + Fact Ledger | **需要** | 顶层字段迁移/删除；实现历史档案，墓碑作为投影 | v4/后续状态迁移 |
| `factions` | 冗余投影 | 非权威（worldState 含） | 无 | **删除** | v4 |
| `marketInventories` | 未接入契约 | 当前无权威，运行时随机 | 当前无法恢复同一库存 | 删除无效占位；另建真实市场状态 | v4 |
| `npcTradeOffers` | 未实现功能 | 无 | 未知 | **延后** | 不变 |
| `playerMapState` | 正常字段 | **权威** | 需要 | **保留** | 不变 |

## 九、SavePayload v3→v4 迁移草案

```typescript
// save-system.ts 迁移函数
function migrateV3ToV4(payload: unknown): SavePayloadV4 {
  const parsed = validateSavePayloadV3(payload);
  const { activeNPCs, overworldMap, factions, marketInventories, graveyard, ...rest } = parsed;
  // 旧字段当前为空/冗余；历史人物与真实市场数据将在 WorldState 专用迁移中引入。
  return rest;
}
```

`SaveMigrationRunner` 会在迁移函数成功返回后更新 `payload.header.schemaVersion`。迁移函数不得写根级 `schemaVersion`。旧存档额外字段也可以选择只忽略、不物理删除；关键是新 v4 契约和写入路径不再制造伪权威字段。

**数据损失评估**：
- activeNPCs：无（永远空）
- overworldMap：无（永远空）
- factions：无（worldState.factions 有备份）
- marketInventories：旧字段永远空，所以删除占位本身不丢已有数据；但 MarketEngine **不可确定性重建同一库存**，当前市场跨读档变化仍是独立缺陷

**风险评估**：**低风险但非零风险**。必须覆盖 v1/v2/v3→v4 迁移链、旧字段容忍、新存档 round-trip、损坏存档验证，以及应用硬编码 schemaVersion 的同步修改。仓库当前没有可直接复用的 save-load/migration 测试，需先补测试再改契约。
