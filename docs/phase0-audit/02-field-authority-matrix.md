# Phase 0 Task 2：字段权威矩阵审计

> 审计日期：2026-08-10
> 归属：[统一修仙世界模拟架构方案](../systemic-cultivation-world-blueprint.md) Phase 0
> 方法：按类型定义和转换器实现逐字段追溯，四档标注 [权威]/[投影]/[可重建]/[临时]

## A. NpcRecord 字段权威矩阵

类型定义：`packages/contracts/src/npc-record.ts:84-154`
权威持有层：`worldState.npcs[id]`（由 WorldEngine 写入，跨会话持久）
归档入口：`characterToNpcRecord()` at `npc-record-mapper.ts:22-73`
展开入口：`npcRecordToCharacter()` at `npc-record-mapper.ts:139-187`

| # | 字段 | 权威档 | 类型 | 投影来源 / 重建公式 | 写回权限 | 丢失后果 |
|---|------|--------|------|---------------------|----------|----------|
| A1 | `id` :85 | NpcRecord | **[权威]** | `NPC_<年>_<月>_<n>`（world-engine.ts:226-233） | 永不修改 | 实体永久丢失，relations 悬空 |
| A2 | `name` :86 | NpcRecord | **[权威]** | world-engine.ts:194 `usedNames` 去重 | 除名逻辑可改 | 取名去重失效 |
| A3 | `gender` :87 | NpcRecord | **[权威]** | 生成确定 | 永不修改 | 代际/道侣判定错乱 |
| A4 | `personalityId` :88 | NpcRecord | **[权威]** | 生成时 `resolvePersonalityId()` | 永不修改 | 自主行为决策树失效 |
| A5 | `origin` :89 | NpcRecord | **[权威]** | **归档硬编码 `{ type:'散修' }`**（mapper:53）⚠️F-9 | 生成时写入 | 世家/宗门/遗孤叙事丢失 |
| A6 | `destiny` :90 | NpcRecord | **[权威]** | **归档硬编码 `common/mortal`**（mapper:54）⚠️F-9；`luck` 从属性投影 | 事迹升级可改 | 天骄认定重置；气运因果链断 |
| A7 | `realm` :91 | NpcRecord | **[权威]** | world-engine `tryBreakthrough` | 突破可改 | 境界档位错乱 |
| A8 | `soulState` :92 | NpcRecord | **[权威]** | world-social-rules.ts:273 写入 | 死亡逻辑可改 | 活死状态不明 |
| A9 | `cultivation` :94 | NpcRecord | **[权威]** | world-tick-rules 月度增长 | tick 可改 | 突破判定无依据 |
| A10 | `locationId` :96 | NpcRecord | **[权威]**（但**归档丢弃**，mapper:58=undefined）⚠️F-9 | world-engine 云游写入 | 云游可改 | 社交配对失效（按地点配对） |
| A11 | `factionId` :98 | NpcRecord | **[权威]** | world-engine 入宗/逐出 | 宗门可改 | 宗门归属丢失 |
| A12 | `socialRank` :100 | NpcRecord | **[权威]** | `sectPowerDuel` 升降 | 夺位可改 | 宗门身份丢失 |
| A13 | `spiritRoot` :101 | NpcRecord | **[权威]** | 生成确定，永不修改 | 永不修改 | 五行/资质全错乱 |
| A14 | `attributes` :102-109 | NpcRecord | **[权威]** | 生成确定；奇遇可微调 | 奇遇可改 | 六维丢失→派生值失准 |
| A15 | `lifespan` :110 | NpcRecord | **[权威]** | age=`currentYear-birthYear`；maxLifespan 由境界表确定 | tick/重伤可改 | NPC 永生或早夭 |
| A16 | `skillIds` :111 | NpcRecord | **[权威]**（ID 列表） | 生成时 `pickEliteSkills` | 传承可改 | 展开时技能列表空 |
| A17 | `weaponElement` :112 | NpcRecord | **[权威]** | 生成确定 | 永不修改 | 五行相克失效 |
| A18 | `combatGear` :114 | NpcRecord | **[权威]**（汇总） | 归档时 `EquipmentManager.getCombatBonuses` 聚合（mapper:28-32） | 仅归档写入 | 展开后无装备 |
| A19 | `spiritStones` :116 | NpcRecord | **[权威]** | 经济逻辑写入 | 经济可改 | 经济链断 |
| A20 | `birthYear/Month` :119-120 | NpcRecord | **[权威]** | **归档覆盖为当前时间**（mapper:67-68）⚠️F-9 | 永不修改（归档会错覆盖） | 年龄彻底错乱 |
| A21 | `deathYear/Month/cause` :121-123 | NpcRecord | **[权威]** | 死亡时写入 | 死亡可改 | 墓地/遗府无依据 |
| A22 | `aspiration` :127 | NpcRecord | **[权威]** | `evolveAspiration` 经历塑形 | 动机可改 | 自主性退化为随机 |
| A23 | `spouseId` :129 | NpcRecord | **[权威]** | 求偶逻辑 | 道侣可改 | 道侣断裂 |
| A24 | `childrenIds/parentIds` :131-133 | NpcRecord | **[权威]** | 生育/传承逻辑 | 代际可改 | 传承链断 |
| A25 | `heritageLineId` :135 | NpcRecord | **[权威]** | 传道逻辑 | 传道可改 | 道统链断 |
| A26 | `childbearing` :137 | NpcRecord | **[权威]** | 生育逻辑 | 生育冷却可改 | 冷却丢失 |
| A27 | `relations` :139 | NpcRecord | **[权威]** | `applyRelation` 写入（含 bond/trust/events） | 社交可改 | 关系网/事件链断 |
| A28 | `biography` :140 | NpcRecord | **[权威]** | EventCollector 聚合；**归档硬编码空**（mapper:70）⚠️F-9 | 事件可追加 | 编年史数据断 |
| A29 | `lastUpdate` :141 | NpcRecord | **[权威]** | tick 更新 | tick 可改 | 新鲜度无依据 |
| A30 | `hexPos` :145 | NpcRecord | **[权威]** | `deriveNpcHexPos` | tick 更新 | 渲染位置丢失 |
| A31 | `moveState` :147 | NpcRecord | **[权威]** | 云游/闭关写入 | 状态机可改 | 移动状态丢失 |
| A32 | `moveTarget` :149 | NpcRecord | **[权威]** | 游历写入 | 游历可改 | 归巢目标丢失 |
| A33 | `secludeMonths` :151 | NpcRecord | **[权威]** | 闭关递减 | 闭关可改 | 出关时机不准 |
| A34 | `affinityMatrixSeed` :153 | NpcRecord | **[权威]** | 生成确定 `[0,1)` | 永不修改 | 道缘基底不可复现 |

## B. Character 字段权威矩阵

类型定义：`packages/contracts/src/character.ts:78-146`
权威持有层因实体类型而异：玩家=`playerStore`；NPC 展开态=临时不持久化

| # | 字段 | 玩家权威 | NPC 权威 | 类型 | 投影来源 | 丢失后果 |
|---|------|----------|----------|------|----------|----------|
| B1-B6 | id/name/gender/realm/soulState/cultivation | playerStore | NpcRecord 同步 | **[权威]** | 双向同步 | 实体引用断 |
| B7 | `lifespan` | playerStore | NpcRecord | **[权威]** | 同步 | 永生/早夭 |
| B8 | `spiritEnergy` :current/max | playerStore **[权威]** | **[可重建]** 公式 `100+tier*50` | 展开满值 | NPC 残蓝不保留（设计意图） |
| B9 | `monthlyActionPoints` | playerStore **[权威]** | **[可重建]** 硬编码 `{3,3}` | NPC 每次展开 3 | 低精度模拟 |
| B10 | `attributes` | playerStore/NpcRecord | **[权威]** | 同步 | 派生值失准 |
| B11 | `spiritRoot` | playerStore/NpcRecord | **[权威]** | 同步 | 五行错乱 |
| B12 | `gameMode` | playerStore **[权威]** | **[可重建]** 硬编码 `Simple/Free` | NPC 无意义 | 玩家铁人模式失效 |
| B13 | `hp/maxHp` | playerStore **[权威]** | **NPC 无持久化权威** | 展开公式 `100+tier*80+physique*5` | **见问题 1** |
| B14 | `ap` | playerStore **[权威]** | **[可重建]** 硬编码 `2` | NPC 每次展开 2 | 低精度 |
| B15 | `canFly` | playerStore **[权威]** | **[可重建]** `tier>=3` 推导 | 跨阶层解锁 |
| B16 | `inventory` | playerStore **[权威]** | **[可重建]** 永远 `[]` | NPC 物品不持久化 | 见问题 5 |
| B17 | `equipmentSlots` | playerStore **[权威]** | **[可重建]** 合成占位 Item | 见问题 5 |
| B18 | `skills` (Skill[]) | playerStore **[权威]** | NpcRecord.skillIds **[权威]**（ID）；Character.skills **[投影]** | SKILL_REGISTRY 查回 | ID 找不到则静默丢弃 |
| B19 | `skillCooldowns` | playerStore **[权威]** | **[临时]** 永远 `{}` | NPC 不跨战斗保留冷却 |
| B20 | `traits` | playerStore **[权威]** | **[可重建]** 永远 `[]` | **词条加成失效** |
| B21 | `traitBonuses` | playerStore **[权威]** | **[无]** | NPC 无此字段 |
| B22 | `factionId` | playerStore/NpcRecord | **[权威]** | 同步 | 宗门丢失 |
| B23 | `factionRank` | playerStore **[权威]** | **[无对应]** NpcRecord 用 `socialRank`（枚举不同）⚠️类型不兼容 | 玩家与 NPC 宗门体系不对齐 |
| B24 | `personalityId` | playerStore/NpcRecord | **[权威]** | 同步 | 决策树失效 |
| B25 | `relations` | playerStore **[权威]** | NpcRecord.relations **[权威]**；CharacterRelation **[投影]** | **双向有损**（见问题 4） |
| B26 | `spiritStones` | playerStore/NpcRecord | **[权威]** | 同步 | 经济断 |
| B27 | `wantedLevels` | playerStore **[权威]** | **[可重建]** 永远 `{}` | NPC 通缉清零 |
| B28 | `unlockedRecipes` | playerStore **[权威]** | **[可重建]** 永远 `[]` | NPC 配方清零 |

## C. BattleUnit & BattleState 字段权威矩阵

类型定义：`packages/contracts/src/battle.ts:36-49`（BattleUnit）、`:69-81`（BattleState）
权威持有层：`BattleEngine.state`，**战斗期间唯一写入者**，**不持久化**（battle.ts:46 注释）

### BattleUnit（全 [临时]）

| 字段 | 类型 | 说明 |
|------|------|------|
| characterId/team/controller | **[临时]** | start() 时确定，战斗内不修改 |
| gauge/actionReady | **[临时]** | ATB 推进（不封顶，溢出值作排序键） |
| actionPoints/maxActionPoints | **[临时]** | activation 重置，BasicAttack -1，Guard +1 |
| movePoints/maxMovePoints | **[临时]** | agility 推导，Move 消耗 |
| statuses | **[临时]** | 中毒/灼烧/眩晕，**明确不回写** Character/存档 |
| charging | **[临时]** | 蓄力技能，被攻击可打断 |
| guarding | **[临时]** | 减伤 50%，`expiresAtActivation` 过期 |

### BattleState（全 [临时]）

| 字段 | 类型 | 说明 |
|------|------|------|
| battleId/map/units/characters | **[临时]** | structuredClone 深拷贝，战斗结束废弃 |
| currentTurnId/events/phase | **[临时]** | dispatch 驱动 |
| tickNumber/turnNumber | **[临时]** | 全局时钟 + activation 计数 |
| winner/lootPool | **[临时]** | 结算后生成 |

### BattleDelta（[临时→投影提交]）

| 字段 | 类型 | 说明 |
|------|------|------|
| battleId/baseRevision | **[临时]** | 幂等键 + 乐观锁 |
| hpAfter/spiritEnergyAfter/apAfter | **[投影]** | 回写 Character |
| skillCooldownsAfter/consumedItems | **[投影]** | 回写 Character |
| rewards/relationChanges | **[投影]** | 奖励 + 关系变化 |

> ⚠️ **契约定义完整但 UI 未接入**（Task 1 F-6 确认）

## D. SavePayload 字段权威矩阵

| # | 字段 | 类型 | 填充状态 | 说明 |
|---|------|------|----------|------|
| D1 | `header` | **[权威]** | ✅ 完整 | saveId/schemaVersion/timestamp |
| D2 | `worldState` | **[权威]** | ✅ 完整 | **NpcRecord 字典在此**（npcs 字段） |
| D3 | `player` | **[权威]** | ✅ 完整 | 玩家 Character 全字段 |
| D4 | `activeNPCs` | **[死字段]** | ❌ `{}` | 永远空（Task 4 判决） |
| D5 | `factions` | **[冗余投影]** | ⚠️ 与 worldState 重复 | 双份权威风险 |
| D6 | `overworldMap` | **[死字段]** | ❌ `{continents:[]}` | 地图确定性生成，需判决（Task 4） |
| D7 | `graveyard` | **[死字段]** | ❌ `[]` | 死亡信息散在 NpcRecord（Task 4） |
| D8 | `marketInventories` | **[死字段]** | ❌ `{}` | MarketEngine 确定性刷新 |
| D9 | `npcTradeOffers` | **[死字段]** | ❌ `{}` | 不持久化 |
| D10 | `playerMapState` | **[权威]** | ✅ 完整 | mapStore 独立持有（activeLayer/hexPos/exploredHexes） |

---

## 五个特别问题的答案

### 问题 1：HP 的权威在哪？

**NPC 当前血量无持久化权威。** NpcRecord 无 hp 字段。展开时 `npcRecordToCharacter` 按公式 `100+tier*80+physique*5` 重算并设满血（mapper:141,171-172）。

**引擎内斗法满血展开是设计意图**——NPC 受伤以"寿元扣减"持久化（world-social-rules.ts:279 `loser.lifespan.maxLifespan -= injuryYears`），而非残血。

**风险**：UI 遭遇战如果复用展开器，NPC 每次满血（当前 UI 走的是临时生成 Character，连展开都没用——见 Task 1 F-4）。

### 问题 2：位置的权威在哪？

**三套独立位置体系：**

| 实体 | 位置字段 | 权威档 |
|------|----------|--------|
| 世界 NPC | `NpcRecord.locationId`（venue id）+ `NpcRecord.hexPos`（q,r） | worldState.npcs |
| 玩家 | `PlayerMapState.hexPos` + `activeContinentId/VenueId` | mapStore（SavePayload.playerMapState） |
| Character | **无位置字段** | — |

**关键断裂**：`characterToNpcRecord` 归档时 locationId 永远 undefined（mapper:58）。Character 无位置字段意味着战斗/交互场景无法从 Character 反推位置。

### 问题 3：skills 的权威在哪？

**权威是 `NpcRecord.skillIds`（string[]），不是 `Character.skills`（Skill[]）。**

展开时从 `SKILL_REGISTRY` 按 ID 查回（mapper:143-145），找不到的 `.filter()` 静默丢弃。

**玩家与 NPC 路径不一致**：玩家 `Character.skills` 直接持久化完整 Skill[]（SavePayload.player），NPC 只存 ID 列表。

### 问题 4：relations 的权威在哪？双向转换损失？

**权威是 `NpcRecord.relations: Record<string, RelationEntry>`。**

| 维度 | RelationEntry (NpcRecord) | CharacterRelation (Character) | C→N 损失 | N→C 损失 |
|------|--------------------------|-------------------------------|----------|----------|
| 关系类型 | 9 种 RelationType | 5 种 tags | rival/benefactor/debtor/spouse 降级为 friend | 无 |
| 好感 | bond | favorability | 无损 | 无损 |
| 仇恨 | **无字段** | hatred | **丢失** | 从负 bond 单向推导 |
| 嫉妒 | **无字段** | jealousy | **丢失** | 恒 0 |
| 信任 | trust | **无字段** | 恒 50 覆盖 | **丢失** |
| 事件链 | events[] | **无字段** | 恒 [] 清空 | **丢失**（叙事资产） |
| 变更时间 | changedAt | **无字段** | 恒当前时间 | **丢失** |

### 问题 5：equipmentSlots 的权威在哪？

| 实体 | 权威档 | 信息量 |
|------|--------|--------|
| 玩家 | `Character.equipmentSlots`（完整 Item 对象） | 全维度 |
| NPC | `NpcRecord.combatGear`（attack/defense/critRate 三维汇总） | **仅三维** |

展开时 `combatGearToItems` 合成占位 Item（id: `gear_<npcId>_weapon`），**丢失**：其余属性维度、原始 Item id/name/tier/特殊词条、treasures 数组退化为单元素。
