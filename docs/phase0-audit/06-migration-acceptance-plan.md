# Phase 0 Task 6：迁移与验收计划

> 审计日期：2026-08-10
> 归属：[统一修仙世界模拟架构方案](../systemic-cultivation-world-blueprint.md) Phase 0
> 综合：Task 1-5 全部审计发现
> 权限：本任务只做计划，不修改运行时代码

## 一、缺陷优先级（基于 Task 1-5 证据）

### P0：阻塞统一世界底座（必须最先修）

| 编号 | 缺陷 | 证据 | 阻塞什么 |
|------|------|------|----------|
| **F-4** | UI 战斗与世界 NPC 完全断流 | Task 1 §D8（MapPanel.vue:375 临时生成） | 玩家永远遇不到世界 NPC |
| **F-7** | 玩家与世界无稳定身份关联 | Task 1 §A2（玩家无 NpcRecord） | 关系网/社交/寻仇对玩家无效 |
| **F-6** | 战斗结果无差量回写 | Task 1 §D9 + Task 3 | 战斗不影响世界 |

### P1：结构性债务（Phase 1 必须处理）

| 编号 | 缺陷 | 证据 |
|------|------|------|
| **F-5** | BattleState/BattleUnit/BattleDelta 契约未用 | Task 1 + Task 5 |
| **F-8/F-9** | 转换器有损 | Task 2（relations/hatred/jealousy/trust/events 丢失） |
| **F-3** | graveyard 未实现（delete NPC 丢历史） | Task 4 |
| **BE-1** | 双引擎并存（旧外壳 + 新内核缝合） | Task 5 |

### P2：清理债务（Phase 2 可批量处理）

| 编号 | 缺陷 | 证据 |
|------|------|------|
| **F-1** | activeNPCs 死字段 | Task 4 |
| **F-2** | overworldMap 死字段 | Task 4 |
| **F-10** | factions 冗余 | Task 4 |
| **F-11** | marketInventories 死字段 | Task 4 |

## 二、实施依赖图

```
                    ┌──────────────────────────┐
                    │   S0: 存档清理 v3→v4     │
                    │   (删 4 个死字段)         │
                    │   [零风险, 独立]          │
                    └────────────┬─────────────┘
                                 │
                    ┌────────────▼─────────────┐
                    │   S1: 玩家稳定身份        │
                    │   (不预设 NpcRecord 方案)  │
                    │   [F-7]                   │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
    ┌─────────▼────────┐ ┌──────▼───────┐ ┌───────▼────────┐
    │ S2: expandForScene│ │ S3: 引擎补齐 │ │ S4: graveyard  │
    │ (NPC 进战斗)      │ │ (UseSkill等) │ │ (停止 delete)   │
    │ [F-4]             │ │ [F-5/BE-1]   │ │ [F-3]          │
    └─────────┬────────┘ └──────┬───────┘ └────────────────┘
              │                  │
              │         ┌────────▼────────┐
              │         │ S5: BattleDelta │
              │         │ (差量结算)       │
              │         │ [F-6]           │
              │         └────────┬────────┘
              │                  │
    ┌─────────▼──────────────────▼────────┐
    │   S6: UI 遭遇战接入世界 NPC          │
    │   (expandForScene + applyOutcome)    │
    │   [F-4 + F-6 联合]                   │
    └─────────────────────┬───────────────┘
                          │
    ┌─────────────────────▼───────────────┐
    │   S7: 引擎收敛（切换到 BattleEngine） │
    │   [F-5/BE-1 最终]                    │
    └─────────────────────┬───────────────┘
                          │
    ┌─────────────────────▼───────────────┐
    │   S8: 垂直切片（带世界回写的渡劫）    │
    └─────────────────────────────────────┘
```

## 三、各步骤详情

### S0：存档清理 v3→v4

| 维度 | 内容 |
|------|------|
| **目标** | 删除 activeNPCs/overworldMap/factions/marketInventories 四个死字段 |
| **依赖** | 无 |
| **风险** | 零（四个字段要么永远空，要么有 worldState 备份） |
| **测试对** | 现有 save-load.test.ts 全绿；新增 v3→v4 迁移测试 |
| **回滚点** | git commit（迁移函数可逆） |
| **工作量** | 改 save-system.ts 迁移链 + app.ts saveGame/loadGame |

### S1：玩家稳定身份

| 维度 | 内容 |
|------|------|
| **目标** | 让世界 NPC 能以稳定 ID 引用玩家（不预设必须建 NpcRecord） |
| **依赖** | 无 |
| **决策点** | 方案 A：玩家建 NpcRecord（简单但双份权威风险）；方案 B：玩家保持 Character 但世界引擎用稳定 playerId 引用（无双份但 relations 类型不统一）；方案 C：引入 EntityId 抽象层（NpcRecord 和 Character 都注册到统一 id 索引） |
| **推荐** | **方案 C**（不预设合并类型，但统一 id 查询） |
| **测试对** | NPC relations 能含 playerId；世界引擎能感知玩家存在 |
| **回滚点** | git commit |

### S2：expandForScene

| 维度 | 内容 |
|------|------|
| **目标** | 包装 npcRecordToCharacter 为 expandForScene，增加 sceneType 参数 |
| **依赖** | S1（需要稳定 id） |
| **修改** | npc-record-mapper.ts 增加 sceneType；技能查不到时 warn |
| **测试对** | npc-record-mapper.test.ts 扩展；expandForScene 两次调用结果一致（INV-5.1） |
| **回滚点** | git commit |
| **注意** | 暴击/闪避等战斗数值在投影上校准——不在 NpcRecord 层校准 |

### S3：引擎补齐

| 维度 | 内容 |
|------|------|
| **目标** | 新 BattleEngine 补齐 UseSkill/Flee/普攻推导/AI/地形 |
| **依赖** | 无（可与 S2 并行） |
| **修改** | battle.ts 加 UseSkill/Flee 命令；battle-engine.ts 实现分支 + 改普攻 DamageSpec；battle-ai.ts 迁移 npc-ai 逻辑；dispatchMove 加 canFly |
| **测试对** | battle-engine.test.ts 扩展；UseSkill/Flee 单测；AI 决策回归测试 |
| **回滚点** | 每个子步骤一个 commit |
| **风险** | flee.ts 循环依赖需先处理（迁移 getRealmTier 到 battle/） |

### S4：graveyard 实现

| 维度 | 内容 |
|------|------|
| **目标** | world-engine 死亡时构造 GraveMarker；停止 delete NpcRecord |
| **依赖** | 无（可与 S2/S3 并行） |
| **决策点** | Oblivion NPC 保留在 state.npcs（soulState 过滤）还是分离到 state.historicalNpcs？ |
| **推荐** | **保留在 state.npcs**（简单，soulState !== 'Oblivion' 过滤即可；字典膨胀在 800 下限补充机制下可控） |
| **测试对** | world-engine 死亡测试：验证 graveyard push + NpcRecord 保留 + soulState=Oblivion |
| **回滚点** | git commit |

### S5：BattleDelta 差量结算

| 维度 | 内容 |
|------|------|
| **目标** | 战斗结束构造 OutcomeDelta + applyOutcome 回写 |
| **依赖** | S2（expandForScene）+ S3（UseSkill 命令） |
| **修改** | 新增 outcome-delta.ts（构造 Delta）；新增 apply-outcome.ts（回写 NpcRecord/Character） |
| **测试对** | applyOutcome 单测：只改差量字段，不覆盖叙事；INV-3.1~3.6 全部验证 |
| **回滚点** | git commit |
| **禁止** | characterToNpcRecord 整体覆盖（INV 禁止事项） |

### S6：UI 遭遇战接入

| 维度 | 内容 |
|------|------|
| **目标** | 替换 MapPanel/hex-overworld-engine 的临时 NPCGenerator.generate 为 worldState.npcs 真实 NPC |
| **依赖** | S2 + S5 |
| **修改** | MapPanel.vue:375 改为从 worldState.npcs 按 locationId 筛选附近 NPC → expandForScene；hex-overworld-engine.ts:292 同理 |
| **测试对** | UI 集成测试：遭遇世界 NPC → 战斗 → 回写 → 再遭遇（反映差量） |
| **回滚点** | git commit |
| **风险** | NPC 满血问题——每次遭遇 expandForScene 满血展开（设计意图，但需验证玩家体验） |

### S7：引擎收敛

| 维度 | 内容 |
|------|------|
| **目标** | useCombat 切换到 BattleEngine；删除旧 CombatEngine/DamagePipeline |
| **依赖** | S3（引擎补齐）+ S6（UI 已接世界 NPC） |
| **修改** | useCombat.ts 加 engineMode 门面；BattleOverlay 灰度切 v2；删除 combat/ 旧文件 |
| **测试对** | useCombat-basic-actions.test.ts 全绿；ATB 排序回归；移动 BFS 一致性 |
| **回滚点** | engineMode 开关（可随时切回 legacy） |
| **风险** | 移动校验收窄（旧直线 → 新 BFS）；ATB 排序变化 |

### S8：垂直切片——带世界回写的渡劫

| 维度 | 内容 |
|------|------|
| **目标** | 用渡劫验证统一底座（不是孤岛副本） |
| **依赖** | S1-S7 全部完成 |

## 四、渡劫切片验收清单

渡劫必须验证以下世界回写能力（每条都必须为 ✅ 才算切片成功）：

| 编号 | 验收项 | 证据要求 |
|------|--------|----------|
| V-1 | 渡劫者满足突破条件时触发（修为达标 + 资源消耗） | NpcRecord.cultivation.currentExp ≥ 阈值 |
| V-2 | 渡劫地点是**当地地形投影**（不是脱离世界的副本） | BattleState.map 从 worldState 的 venue/hex 投影 |
| V-3 | 周围 NPC 能**获知渡劫**（观劫/护法/趁火打劫） | worldState.npcs 的 relations/events 追加渡劫事件 |
| V-4 | 天雷对**地形造成真实破坏**（改写 HexTile） | venue/hex 的 terrain 变更持久化到 worldState |
| V-5 | 渡劫**耗时推进世界**（不是冻结时间） | currentYear/Month 在渡劫后推进 |
| V-6 | 渡劫成功/失败的**伤势回写**（寿元/境界/soulState） | applyOutcome 写 NpcRecord.lifespan/realm/soulState |
| V-7 | 渡劫死亡生成**墓碑记录**（GraveMarker） | graveyard.push + NpcRecord 不 delete |
| V-8 | 渡劫结果产生**真实历史**（编年史事件） | worldState.eventLog 追加 |
| V-9 | **NPC 渡劫与玩家渡劫使用同一套系统** | 同一 tribulation-engine + 同一 BattleEngine |
| V-10 | 不同种族/修炼道路**有不同劫难**（至少配置层支持） | TribulationConfig 有 race/path 分支（可延后填充内容） |

## 五、测试对矩阵

每个步骤必须搭配的测试：

| 步骤 | 单测 | 集成测试 | 回归测试 |
|------|------|----------|----------|
| S0 | save-migration.test.ts（v3→v4） | save-load round-trip | 现有全部测试 |
| S1 | world-engine 玩家引用测试 | NPC→玩家 relations | — |
| S2 | expandForScene.test.ts（确定性） | NPC 展开完整生命周期 | npc-record-mapper.test.ts |
| S3 | battle-engine UseSkill/Flee 测试 | AI 决策回归 | battle-engine.test.ts |
| S4 | graveyard-push.test.ts | 死亡→墓碑→编年史 | world-engine 死亡测试 |
| S5 | apply-outcome.test.ts（INV-3.1~3.6） | 战斗→Delta→回写→再展开 | useCombat-basic-actions |
| S6 | — | 遭遇世界 NPC→战斗→回写 E2E | MapPanel 渲染 |
| S7 | — | ATB/移动/攻击全链路 | useBattleUI.test.ts |
| S8 | — | 渡劫 10 项验收清单 | — |

## 六、回滚策略

| 步骤 | 回滚机制 |
|------|----------|
| S0 | 迁移函数可逆（v4→v3 反序列化忽略新字段） |
| S1-S2 | git revert（不影响已有存档） |
| S3 | engineMode='legacy' 开关 |
| S4 | 删除 GraveMarker push 逻辑（回到 delete 行为） |
| S5 | OutcomeDelta 构造是新增路径，旧 applyOutcome 保留 |
| S6 | feature flag：遭遇战用世界 NPC 还是临时生成 |
| S7 | engineMode 开关（最终安全网） |
| S8 | 渡劫是新增功能，不影响现有突破路径 |

## 七、工作量估算（相对值，非时间）

| 步骤 | 复杂度 | 风险 | 阻塞性 |
|------|--------|------|--------|
| S0 | 低 | 零 | 独立 |
| S1 | 中 | 中（设计决策） | 阻塞 S2/S6 |
| S2 | 低 | 低 | 阻塞 S5/S6 |
| S3 | 高 | 中（能力补齐量大） | 阻塞 S5/S7 |
| S4 | 低 | 低 | 独立 |
| S5 | 中 | 中（不变量多） | 阻塞 S6/S8 |
| S6 | 中 | 高（UI 改动大） | 阻塞 S8 |
| S7 | 高 | 高（切换引擎） | 阻塞 S8 |
| S8 | 高 | 高（验收清单多） | — |

## 八、与方案 Phase 的映射

| 审计步骤 | 方案 Phase |
|----------|-----------|
| S0 | Phase 0（本阶段） |
| S1-S2 | Phase 1（统一实体身份） |
| S3-S5 | Phase 2（战斗引擎收敛 + 差量结算） |
| S4 | Phase 1（事实账本） |
| S6-S7 | Phase 2-3（遭遇战接入 + 引擎切换） |
| S8 | Phase 3（垂直切片验证） |

---

## 审计完成声明

Phase 0 Task 1-6 全部完成。本阶段只读取证和编写审计文档，未修改任何运行时代码（contracts/engine/UI/存档迁移）。

**提交清单**：
1. [01-entity-data-flow.md](01-entity-data-flow.md) — 数据流与调用图
2. [02-field-authority-matrix.md](02-field-authority-matrix.md) — 字段权威矩阵
3. [03-projection-delta-invariants.md](03-projection-delta-invariants.md) — 投影与差量不变量
4. [04-runtime-storage-boundary.md](04-runtime-storage-boundary.md) — 存档边界判决
5. [05-battle-engine-convergence.md](05-battle-engine-convergence.md) — 双引擎收敛审计
6. [06-migration-acceptance-plan.md](06-migration-acceptance-plan.md) — 迁移与验收计划（本文档）

**等待用户评审**。不自动进入 Phase 1 实现。
