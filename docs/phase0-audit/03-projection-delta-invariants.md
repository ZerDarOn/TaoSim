# Phase 0 Task 3：投影与差量不变量

> 审计日期：2026-08-10
> 归属：[统一修仙世界模拟架构方案](../systemic-cultivation-world-blueprint.md) Phase 0
> 依赖：[Task 1 数据流](01-entity-data-flow.md)、[Task 2 字段权威矩阵](02-field-authority-matrix.md)

## 目标

定义 NpcRecord ↔ Character ↔ BattleState 之间的三类操作的职责边界和必须保持的不变量：
- **展开**（Expand）：NpcRecord → 场景 Character（投影）
- **结算**（Outcome）：场景结果 → 包含全部参与者和副作用的显式世界结果
- **提交**（Commit）：一次校验并原子更新玩家、NPC、资产、时间、地点和事实

## 一、三类操作的职责边界

### 1.1 现状问题

当前 `characterToNpcRecord` 和 `npcRecordToCharacter` 是**双向整体转换**，不区分场景：

| 场景 | 当前做法 | 问题 |
|------|----------|------|
| 新 NPC 归档 | `characterToNpcRecord(newChar)` | ✅ 可接受（world-engine 二次覆盖 origin/destiny） |
| NPC 进入引擎内斗法 | `npcRecordToCharacter(rec)` | ⚠️ 当前低精度规则自洽，但不能直接扩展到连续遭遇；需叠加 PersistentCondition |
| NPC 进入玩家遭遇战 | 不存在（UI 临时生成 Character） | ❌ 断流（Task 1 F-4） |
| 战斗结果回写 | 不存在 | ❌ 完全缺失 |
| 战后整体归档 | `characterToNpcRecord(battleChar)` | ❌ **会覆盖出生/身世/位置/传记** |

### 1.2 提议的三操作分离

```
NpcRecord (权威)
    │
    ├─ expandForScene(record, sceneType) → Character     [投影：只读]
    │      战斗/交互/展示场景的临时 Character
    │
    ├─ [场景运行：Character 在场景内可变]
    │
    └─ commitWorldOutcome(context, worldOutcome)         [提交：跨实体原子事务]
           战斗/交互结束后，一次提交所有参与者和世界副作用
```

**禁止**：`characterToNpcRecord(expandedChar)` 作为战后回写路径。

## 二、展开（expandForScene）

### 2.1 语义

- **输入**：NpcRecord + 场景类型（battle/trade/dialog/display）
- **输出**：Character（临时投影）
- **性质**：纯函数，无副作用，不修改 NpcRecord
- **可重建性**：同一 NpcRecord + 同一场景类型 → 确定性输出（除 RNG 种子外）

### 2.2 当前 `npcRecordToCharacter` 的可用性评估

| 字段类别 | 当前行为 | 作为 expandForScene 的判定 |
|----------|----------|---------------------------|
| 基础属性（realm/attributes/spiritRoot） | 直接拷贝 | ✅ 正确 |
| 派生值（hp/spiritEnergy/ap） | 公式重算，满值 | ⚠️ 仅对无连续伤势的低精度引擎斗法可接受；玩家连续遭遇必须读取长期伤势/毒素等 `PersistentCondition` |
| 装备（equipmentSlots） | combatGear 合成占位 Item | ⚠️ **可接受但有损**（丢失非战斗维度） |
| 技能（skills） | skillIds → SKILL_REGISTRY 查回 | ✅ 正确（找不到静默丢弃需加警告） |
| 关系（relations） | RelationEntry → CharacterRelation | ⚠️ **有损**（丢失 trust/events/changedAt） |
| 空字段（inventory/traits/wantedLevels 等） | 硬编码空 | ⚠️ 不能统称“不需要”；battle/dialog/trade 所需字段不同，重要资产和社会状态不能凭空清零 |
| gameMode | 硬编码 Simple/Free | ✅ 场景投影不需要 |

**结论**：`npcRecordToCharacter` **基本可直接作为 expandForScene 使用**，但需做以下调整：

### 2.3 expandForScene 调整建议

| 调整项 | 原因 | 优先级 |
|--------|------|--------|
| 技能查不到时 `console.warn` | 静默丢失是调试黑洞 | P1 |
| 增加 `sceneType` 参数 | 战斗、交易、对话和展示所需字段不同 | P1 |
| relations 展开保留更多信息 | 当前 CharacterRelation 丢 trust/events | P2（需扩 CharacterRelation 类型） |
| 装备展开保留原始 Item（如果有） | combatGear 合成占位 Item 有损 | P2（需 NpcRecord 存更多装备信息） |
| 应用长期状态 `PersistentCondition` | 连续战斗、下毒、经脉损伤和恢复期必须跨场景存在 | P0（阻塞真实遭遇闭环） |
| 注入重要资产引用 | NPC 获得或失去法宝后必须改变真实所有权 | P0（阻塞战利品/经济闭环） |

## 三、结算（WorldOutcome）

### 3.1 当前缺失情况

| 路径 | 结算方式 | 问题 |
|------|----------|------|
| UI 玩家战斗 | `resolveBattleOutcome` 返回 BattleOutcome（平铺字段） | ⚠️ 有结算但无差量提交（散写 playerStore） |
| 引擎内斗法 | 直接 mutate NpcRecord（world-social-rules.ts:270-289） | ⚠️ 有效但无显式 Delta 对象 |
| UI 玩家 vs 世界 NPC | **不存在** | ❌ |

### 3.2 两级结果结构

现有 `BattleDelta` 可以继续作为“战斗场景 → 玩家 store”的过渡适配器，但不能成为世界级提交协议。世界结算需要一次描述所有参与者、资产、时间、地点和事实的 `WorldOutcome`：

```typescript
/** 场景结算产生的世界级结果；自身不直接修改任何 store。 */
interface WorldOutcome {
  outcomeId: string;                   // 持久化幂等键
  source: { type: 'battle' | 'tribulation' | 'trade' | 'social'; sceneId: string };
  expectedWorldRevision: number;       // 世界事务版本，不是单个 Pinia store 的内存计数
  participantDeltas: Record<string, ParticipantDelta>;
  assetTransfers: AssetTransfer[];
  elapsedMinutes: number;
  locationMutations: LocationMutation[];
  factDrafts: FactDraft[];
}

interface ParticipantDelta {
  entityId: string;

  // 玩家可提交精确战斗值；NPC 通过长期状态表达跨场景后果
  hpAfter?: number;
  spiritEnergyDelta?: number;
  spiritStonesDelta?: number;
  cultivationExpDelta?: number;
  persistentConditionChanges?: PersistentConditionChange[];

  soulStateChanged?: SoulState;
  killed?: boolean;
  killedBy?: string;

  relationChanges?: Array<{
    targetId: string;
    bondDelta?: number;                // 可正可负
    trustDelta?: number;               // 可正可负
    event: RelationEventDraft;         // 历史只追加
  }>;
  lifespanDelta?: number;
  apDelta?: number;
  skillCooldownsAfter?: Record<string, number>;
}

interface AssetTransfer {
  assetId: string;
  fromOwnerId?: string;
  toOwnerId?: string;
  reason: 'loot' | 'consume' | 'trade' | 'drop' | 'destroy';
}
```

`WorldOutcome` 必须由一个世界提交器统一验证和提交。禁止分别先写 playerStore、再写 NpcRecord、最后补事实。

### 3.3 关键不变量

| 编号 | 不变量 | 理由 |
|------|--------|------|
| INV-3.1 | **NPC 不持久化战斗逐点 HP，但必须回写长期状态** | 用伤势、毒素、经脉损伤、恢复截止时间等表达跨场景后果；不能每次无条件满状态 |
| INV-3.2 | **死亡实体退出活动集合并进入历史档案** | 事实不可删除不等于死者永久留在 `state.npcs`；活动人口、历史档案和墓碑投影必须分离 |
| INV-3.3 | **所有参与者和世界副作用一次提交** | 玩家、NPC、资产、关系、时间、地点和事实必须全成功或全失败 |
| INV-3.4 | **关系数值可正可负，关系历史只追加** | `bond/trust` 可以下降；不可覆盖的是事件链和因果记录 |
| INV-3.5 | **重要资产转移守恒** | 每个重要物品同一时刻最多一个所有者；玩家和 NPC 都能获得、失去或销毁资产 |
| INV-3.6 | **幂等记录与世界版本必须持久化** | 重试、读档和重复 UI 回调不能重复奖励、死亡、突破或生成事实 |

## 四、提交（commitWorldOutcome）

### 4.1 当前回写路径

| 路径 | 回写方式 | 判定 |
|------|----------|------|
| UI 玩家 → playerStore | `applyOutcome` 散写 hp/exp/spiritStones/relations | ⚠️ 有效但非原子 |
| 引擎斗法 → NpcRecord | 直接 mutate loser/winner | ⚠️ 有效但无显式 Delta |
| UI → NpcRecord | **不存在** | ❌ |

### 4.2 提议的世界事务边界

```typescript
/** 验证全部前置条件，在副本上应用后一次替换权威状态。 */
function commitWorldOutcome(
  context: WorldCommitContext,
  outcome: WorldOutcome,
): WorldCommitResult
```

提交器至少执行：检查 `outcomeId` 是否已提交、校验世界版本与所有实体/资产引用、验证资源和所有权、在隔离副本应用全部变化、生成事实、推进时间，最后一次性发布新状态。任一步失败都不得修改玩家或世界。

### 4.3 WorldOutcome 的字段映射

| Outcome 内容 | 权威层回写 | 注意事项 |
|------------|----------------|----------|
| participantDeltas | 玩家 Character、NPC 档案或历史档案 | 由实体目录解析权威持有者；不整体转换覆盖 |
| persistentConditionChanges | NPC 长期状态 | 低精度表现伤势、毒素和恢复；场景展开时应用 |
| soulState/killedBy | 生命周期 + 死亡事实 | `causeOfDeath` 当前是 string；结构化击杀者进入 Fact，不能写入不兼容对象 |
| relationChanges | 共享社交状态 | 数值增减，事件链追加；双方变化必须在同一事务中提交 |
| assetTransfers | 资产/所有权账本 | NPC 与玩家同样参与；普通物品可聚合，重要资产必须稳定实例化 |
| elapsedMinutes | 权威时钟 | 与结果一起提交，不能战斗成功而时间未推进 |
| locationMutations | 空间/地形权威状态 | V1 可为空；有变化时与事实一并提交 |
| factDrafts | Fact Ledger | 只能在状态提交成功后获得正式事实 ID |

### 4.4 禁止事项

| 禁止 | 原因 |
|------|------|
| `characterToNpcRecord(battleChar)` 整体覆盖 | 会覆盖 origin/destiny/locationId/biography/birthYear（Task 2 F-9） |
| 直接设 `record.hp = ...` | NpcRecord 无 hp 字段 |
| `delete record.relations[id]` | 关系网是叙事资产 |
| 战后 `record.spiritEnergy.current = ...` | NpcRecord 无 spiritEnergy 字段 |
| 分别调用玩家提交和 NPC 提交 | 会产生半提交、重复奖励或事实与状态不一致 |
| NPC 战利品只记日志不改变所有权 | 违反真实所有权和经济闭环 |

## 五、场景生命周期不变量

### 5.1 战斗场景完整生命周期

```
1. worldState.npcs[id] 存在（NpcRecord）
2. expandForScene(record, 'battle') → battleChar（Character 投影）
3. battleChar 进入 BattleState.characters（深拷贝）
4. 战斗运行（BattleEngine dispatch，battleChar 可变）
5. 战斗结束 → 构造 WorldOutcome（包含全部参与者与副作用）
6. commitWorldOutcome 先完整验证，再原子提交玩家、NPC、资产、时间和事实
7. 现有 commitBattleDelta 仅作为迁移期玩家适配器，不能单独代表世界事务
8. BattleState 废弃，battleChar 丢弃
9. record 保持为唯一权威，下次展开反映最新状态
```

### 5.2 必须保持的不变量

| 编号 | 不变量 | 当前是否满足 |
|------|--------|-------------|
| INV-5.1 | **同一 NpcRecord 展开两次（中间无世界提交），结果确定性一致** | ✅ 当前 mapper 基本满足；未来需包含稳定场景种子与长期状态 |
| INV-5.2 | **提交后再展开，投影反映长期状态和资产变化** | ❌ 当前无 PersistentCondition/资产投影 |
| INV-5.3 | **BattleState 不持久化** | ✅ 满足（战斗结束废弃） |
| INV-5.4 | **死亡实体从活动集合迁入历史档案，事实与关键引用保留** | ❌ 当前 world-engine.ts:1097-1100 直接删除且无完整历史档案 |
| INV-5.5 | **expandForScene 不修改 NpcRecord** | ✅ 满足（npcRecordToCharacter 是纯函数） |
| INV-5.6 | **WorldOutcome 是持久化幂等、跨实体的原子提交** | ❌ 当前只有玩家 store 的内存级 commitBattleDelta |

## 六、与 ADR 的对照

| ADR | Task 3 的对应结论 |
|-----|-----------------|
| ADR-6（权威/投影分离） | expandForScene = 投影；NpcRecord = 权威；BattleState = 临时 |
| ADR-7（差量结算） | WorldOutcome + commitWorldOutcome，禁止整体回写和逐实体半提交 |
| ADR-9（战斗引擎收敛） | BattleEngine 负责场景状态与命令；战斗结束统一转换为 WorldOutcome，不让 BattleDelta 成为第二套世界协议 |

## 七、迁移优先级

| 步骤 | 任务 | 依赖 | 阻塞性 |
|------|------|------|--------|
| S1 | 冻结实体目录、共享社交状态、PersistentCondition、资产和历史档案契约 | 无 | **阻塞所有投影与提交** |
| S2 | 实现 `expandForScene`（按场景投影长期状态与资产） | S1 | **阻塞 UI 遭遇战接入** |
| S3 | 实现 WorldOutcome + commitWorldOutcome（持久化幂等、跨实体原子提交） | S1 | **阻塞世界回写** |
| S4 | 让现有战斗链产生 WorldOutcome，并接入真实世界 NPC | S2, S3 | **尽早修复 F-4，不等待新引擎完成** |
| S5 | 补齐并迁移新 BattleEngine；结果继续使用同一 WorldOutcome | S3, Task 5 修订版 | 阻塞最终引擎收敛 |
| S6 | 死亡实体从活动集合原子迁入历史档案并生成事实/墓碑投影 | S1, S3 | 阻塞生命周期闭环 |
