# Phase 0 Task 3：投影与差量不变量

> 审计日期：2026-08-10
> 归属：[统一修仙世界模拟架构方案](../systemic-cultivation-world-blueprint.md) Phase 0
> 依赖：[Task 1 数据流](01-entity-data-flow.md)、[Task 2 字段权威矩阵](02-field-authority-matrix.md)

## 目标

定义 NpcRecord ↔ Character ↔ BattleState 之间的三类操作的职责边界和必须保持的不变量：
- **展开**（Expand）：NpcRecord → 场景 Character（投影）
- **结算**（Outcome/Delta）：战斗结果 → 显式差量
- **提交**（Apply）：差量 → 回写权威 NpcRecord/Character（只改明确字段）

## 一、三类操作的职责边界

### 1.1 现状问题

当前 `characterToNpcRecord` 和 `npcRecordToCharacter` 是**双向整体转换**，不区分场景：

| 场景 | 当前做法 | 问题 |
|------|----------|------|
| 新 NPC 归档 | `characterToNpcRecord(newChar)` | ✅ 可接受（world-engine 二次覆盖 origin/destiny） |
| NPC 进入引擎内斗法 | `npcRecordToCharacter(rec)` | ⚠️ 可接受（低精度模拟，满血展开是设计意图） |
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
    └─ applyOutcome(record, outcomeDelta) → NpcRecord    [提交：只改差量字段]
           战斗/交互结束后，只回写明确变化的字段
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
| 派生值（hp/spiritEnergy/ap） | 公式重算，满值 | ✅ **战斗场景可接受**（战斗开始本应满状态） |
| 装备（equipmentSlots） | combatGear 合成占位 Item | ⚠️ **可接受但有损**（丢失非战斗维度） |
| 技能（skills） | skillIds → SKILL_REGISTRY 查回 | ✅ 正确（找不到静默丢弃需加警告） |
| 关系（relations） | RelationEntry → CharacterRelation | ⚠️ **有损**（丢失 trust/events/changedAt） |
| 空字段（inventory/traits/wantedLevels 等） | 硬编码空 | ✅ **场景投影不需要这些** |
| gameMode | 硬编码 Simple/Free | ✅ 场景投影不需要 |

**结论**：`npcRecordToCharacter` **基本可直接作为 expandForScene 使用**，但需做以下调整：

### 2.3 expandForScene 调整建议

| 调整项 | 原因 | 优先级 |
|--------|------|--------|
| 技能查不到时 `console.warn` | 静默丢失是调试黑洞 | P1 |
| 增加 `sceneType` 参数 | 战斗满血 / 交易需要 inventory / 对话需要 traits | P2 |
| relations 展开保留更多信息 | 当前 CharacterRelation 丢 trust/events | P2（需扩 CharacterRelation 类型） |
| 装备展开保留原始 Item（如果有） | combatGear 合成占位 Item 有损 | P2（需 NpcRecord 存更多装备信息） |

## 三、结算（OutcomeDelta）

### 3.1 当前缺失情况

| 路径 | 结算方式 | 问题 |
|------|----------|------|
| UI 玩家战斗 | `resolveBattleOutcome` 返回 BattleOutcome（平铺字段） | ⚠️ 有结算但无差量提交（散写 playerStore） |
| 引擎内斗法 | 直接 mutate NpcRecord（world-social-rules.ts:270-289） | ⚠️ 有效但无显式 Delta 对象 |
| UI 玩家 vs 世界 NPC | **不存在** | ❌ |

### 3.2 提议的 OutcomeDelta 结构

基于现有 `BattleDelta`（battle.ts:92-103）扩展，区分**玩家结算**和**NPC 结算**：

```typescript
/** 战斗结果的显式差量（从战斗场景向权威层提交） */
interface OutcomeDelta {
  battleId: string;                    // 幂等键
  baseRevision: number;                // 乐观锁

  // 参与者差量（按 characterId 索引）
  participantDeltas: Record<string, ParticipantDelta>;
}

interface ParticipantDelta {
  characterId: string;

  // 数值差量
  hpDelta?: number;                    // 负数=受伤（注意：NPC 的 hp 是临时的，这里用 lifespanDelta 表达重伤）
  spiritEnergyDelta?: number;
  spiritStonesDelta?: number;
  cultivationExpDelta?: number;

  // 状态变更
  soulStateChanged?: SoulState;        // 死亡/残魂/元神
  killed?: boolean;
  killedBy?: string;                   // 击杀者 characterId

  // 物品变更
  consumedItemIds?: string[];
  gainedItemIds?: string[];

  // 关系变化
  relationChanges?: Record<string, { bondDelta: number; reason: string }>;

  // NPC 专属：寿元差量（NPC 受伤以寿元扣减持久化）
  lifespanDelta?: number;

  // 玩家专属：AP/冷却差量
  apDelta?: number;
  skillCooldownsAfter?: Record<string, number>;
}
```

### 3.3 关键不变量

| 编号 | 不变量 | 理由 |
|------|--------|------|
| INV-3.1 | **NPC 不回写 hp/spiritEnergy/ap** | NpcRecord 无这些字段，NPC 受伤以 lifespanDelta 表达 |
| INV-3.2 | **NPC 死亡只改 soulState + 设 deathYear/cause** | 不删除 NpcRecord（与"事实账本不删历史"一致） |
| INV-3.3 | **玩家死亡改 soulState + 通知世界引擎** | 玩家 Character 有完整 hp，但死亡后的世界影响需走世界引擎 |
| INV-3.4 | **relationChanges 只增不减** | 关系事件是叙事资产，不因战斗覆盖（追加 bondDelta 而非覆盖） |
| INV-3.5 | **consumedItemIds 只扣不增** | 消耗品扣除，战利品另走 gainedItemIds |
| INV-3.6 | **gainedItemIds 对 NPC 仅记录（不真正入背包）** | NpcRecord 无 inventory，战利品只对玩家生效 |

## 四、提交（applyOutcome）

### 4.1 当前回写路径

| 路径 | 回写方式 | 判定 |
|------|----------|------|
| UI 玩家 → playerStore | `applyOutcome` 散写 hp/exp/spiritStones/relations | ⚠️ 有效但非原子 |
| 引擎斗法 → NpcRecord | 直接 mutate loser/winner | ⚠️ 有效但无显式 Delta |
| UI → NpcRecord | **不存在** | ❌ |

### 4.2 提议的 applyOutcome 签名

```typescript
/** 将战斗差量提交回权威层。只改明确字段，不做整体覆盖。 */
function applyOutcome(
  record: NpcRecord,
  delta: ParticipantDelta,
  worldContext: { currentYear: number; currentMonth: number }
): NpcRecord
```

### 4.3 applyOutcome 的字段映射

| Delta 字段 | NpcRecord 回写 | 注意事项 |
|------------|----------------|----------|
| lifespanDelta | `record.lifespan.maxLifespan += delta.lifespanDelta` | **不扣 hp**（NpcRecord 无 hp） |
| soulStateChanged | `record.soulState = delta.soulStateChanged` | 若死亡：设 deathYear/deathMonth/causeOfDeath |
| killed | `record.soulState = 'RemnantSoul'`（或 PrimordialSoul 看境界） | 不 delete |
| killedBy | `record.causeOfDeath = { type: 'feud', killerId: delta.killedBy }` | — |
| spiritStonesDelta | `record.spiritStones += delta.spiritStonesDelta` | 可为负（战败丢失） |
| cultivationExpDelta | `record.cultivation.currentExp += delta.cultivationExpDelta` | — |
| relationChanges | 追加到 `record.relations[id].bond += delta`，追加 events | **只追加不覆盖**（INV-3.4） |
| consumedItemIds | **对 NPC 不执行**（NpcRecord 无 inventory） | INV-3.6 |
| gainedItemIds | **对 NPC 不执行**（战利品只对玩家） | INV-3.6 |

### 4.4 禁止事项

| 禁止 | 原因 |
|------|------|
| `characterToNpcRecord(battleChar)` 整体覆盖 | 会覆盖 origin/destiny/locationId/biography/birthYear（Task 2 F-9） |
| 直接设 `record.hp = ...` | NpcRecord 无 hp 字段 |
| `delete record.relations[id]` | 关系网是叙事资产 |
| 战后 `record.spiritEnergy.current = ...` | NpcRecord 无 spiritEnergy 字段 |

## 五、场景生命周期不变量

### 5.1 战斗场景完整生命周期

```
1. worldState.npcs[id] 存在（NpcRecord）
2. expandForScene(record, 'battle') → battleChar（Character 投影）
3. battleChar 进入 BattleState.characters（深拷贝）
4. 战斗运行（BattleEngine dispatch，battleChar 可变）
5. 战斗结束 → 构造 OutcomeDelta
6. applyOutcome(record, delta) → 更新 NpcRecord（只改差量字段）
7. applyOutcome 对玩家走 commitBattleDelta（player.ts:111）
8. BattleState 废弃，battleChar 丢弃
9. record 保持为唯一权威，下次展开反映最新状态
```

### 5.2 必须保持的不变量

| 编号 | 不变量 | 当前是否满足 |
|------|--------|-------------|
| INV-5.1 | **同一 NpcRecord 展开两次（中间无 applyOutcome），结果确定性一致** | ✅ 满足（npcRecordToCharacter 是纯函数） |
| INV-5.2 | **applyOutcome 后再展开，投影反映差量** | ⚠️ 部分满足（lifespanDelta 能反映，但 hpDelta 不能——NpcRecord 无 hp） |
| INV-5.3 | **BattleState 不持久化** | ✅ 满足（战斗结束废弃） |
| INV-5.4 | **NpcRecord 永不被 delete（只改 soulState）** | ❌ 当前 world-engine.ts:1097-1100 会 delete（与方案"事实账本"冲突） |
| INV-5.5 | **expandForScene 不修改 NpcRecord** | ✅ 满足（npcRecordToCharacter 是纯函数） |
| INV-5.6 | **applyOutcome 是原子性差量提交，不做整体覆盖** | ❌ 当前无 applyOutcome（整体覆盖会丢叙事字段） |

## 六、与 ADR 的对照

| ADR | Task 3 的对应结论 |
|-----|-----------------|
| ADR-6（权威/投影分离） | expandForScene = 投影；NpcRecord = 权威；BattleState = 临时 |
| ADR-7（差量结算） | OutcomeDelta + applyOutcome，禁止整体回写 |
| ADR-9（战斗引擎收敛） | BattleDelta 结构已定义，Task 5 确认收敛目标为 BattleEngine |

## 七、迁移优先级

| 步骤 | 任务 | 依赖 | 阻塞性 |
|------|------|------|--------|
| S1 | 实现 `expandForScene`（包装现有 npcRecordToCharacter + sceneType 参数） | 无 | **阻塞 UI 遭遇战接入** |
| S2 | 实现 `applyOutcome`（NpcRecord 差量回写） | S1 | **阻塞世界回写** |
| S3 | 实现 `OutcomeDelta` 构造（从 BattleState 生成） | Task 5 P1（UseSkill 命令） | 阻塞差量结算 |
| S4 | UI 遭遇战接入 S1（替换 NPCGenerator.generate） | S1 | **阻塞 F-4 修复** |
| S5 | UI 战斗结果接入 S2（替换散写） | S2, S3 | 阻塞完整生命周期 |
| S6 | 停止 world-engine.ts delete NPC（改 soulState=Oblivion） | 无 | 阻塞 INV-5.4 |
