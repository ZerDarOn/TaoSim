# Phase 0 Task 5：双战斗引擎收敛审计

> 审计日期：2026-08-10
> 归属：[统一修仙世界模拟架构方案](../systemic-cultivation-world-blueprint.md) Phase 0
> 方法：import 追溯 + 调用链追溯

## 关键结论先行

1. **UI 实际使用旧 `combat/CombatEngine`**（外壳），但伤害结算、技能射程、守卫配置全部借用 `battle/` 的纯函数（内核）——**混合链路**。
2. **新 `BattleEngine` 仅被测试实例化**，0 生产调用，且缺 UseSkill/Flee 命令，普攻硬编码 DamageSpec。
3. **旧 `DamagePipeline.calculate` 已事实废弃**，仅 `getRealmTier` 被 `flee.ts` 引用苟活。
4. **收敛建议**：以新 `BattleEngine` 为目标，但“补 UseSkill”必须包含完整原子解释、资源/冷却/目标校验和世界结果协议，不能只增加一个命令分支。

## A. 能力对照表

### A1. 命令类型

| 命令 | 旧 combat/ | 新 battle/ |
|------|-----------|-----------|
| Move | `[RT]` useCombat.ts:167 `movePlayer()` → combat-engine.ts:77 | `[TYPE]` battle.ts:62；`[RT]` battle-engine.ts:222 BFS 寻路 |
| BasicAttack | `[RT]` useCombat.ts:265（composable 层实现） | `[TYPE]` battle.ts:63；`[RT]` battle-engine.ts:296 |
| **UseSkill** | `[RT]` useCombat.ts:190 `attackTarget(skill)` | **❌ 缺失**（battle.ts:60-65 无 UseSkill 分支） |
| Guard | `[RT]` useCombat.ts:371 `defend()` | `[TYPE]` battle.ts:64；`[RT]` battle-engine.ts:338 |
| Flee | `[RT]` useCombat.ts:327 → battle/flee.ts:53 | **❌ 缺失**（BattleCommand 无 Flee） |
| EndTurn | `[RT]` useCombat.ts:403 → combat-engine.ts:48 | `[TYPE]` battle.ts:65；`[RT]` battle-engine.ts:349 |
| AdvanceTick | 旧由 UI setInterval 驱动 tickATB | `[TYPE]` battle.ts:61；`[RT]` battle-engine.ts:152 |

### A2. ATB 行动条

| 维度 | 旧 combat/ | 新 battle/ |
|------|-----------|-----------|
| 推进公式 | `[RT]` combat-engine.ts:40 `gauge += 10 + agility*2`（硬编码） | `[RT]` battle-engine.ts:162 `ATB_BASE_GAIN + agility*ATB_AGILITY_GAIN`（配置化，含 Slow ×0.5） |
| 就绪排序 | `[RT]` useCombat.ts:134 `ready[0]` FIFO | `[RT]` battle-engine.ts:187 gauge 降序 → agility 降序 → id 升序 |
| 封顶 | combat-engine.ts:40 `Math.min(100)` 封顶 | 不封顶（gauge 作排序键） |

### A3. 六边形移动

| 维度 | 旧 combat/ | 新 battle/ |
|------|-----------|-----------|
| 引擎寻路 | **无 BFS**，combat-engine.ts:77 直接写位置 | `[RT]` battle-engine.ts:271 BFS |
| UI 高亮 | `[RT]` hex-utils.ts:19 BFS（但实际移动只校验直线距离 useCombat.ts:171）⚠️**已有 bug** | 引擎内置，高亮一致 |
| canFly 跨水 | `[RT]` useCombat.ts:178 判 isWater | **❌ 缺失**（battle-engine.ts:250 一律拒绝 isWater） |
| 迷雾 | `[RT]` useCombat.ts:176 判 isRevealed | **❌ 缺失** |

### A4. 技能射程校验

共用 `skillRange()`（battle/skill-range.ts:8）。旧普攻硬编码 1（useCombat.ts:30），新引擎也硬编码 1（battle-engine.ts:312）。

### A5. 伤害结算

| 维度 | 旧 DamagePipeline | 新 calculateDamage |
|------|------------------|-------------------|
| 实际使用 | **零调用**（仅 getRealmTier 被 flee.ts 引用） | `[RT]` useCombat.ts:213,286,345 三处调用 |
| 五行克制 | damage-pipeline.ts:55 `1.0`（占位） | `[RT]` damage-calculator.ts:39 相克 1.3/被克 0.7/同源 0.85 |
| 暴击 | 不支持 | `[RT]` damage-calculator.ts:108（CRIT_MULTIPLIER 1.5） |
| 闪避 | 不支持 | `[RT]` damage-calculator.ts:95-104（钳制 [0,0.3]） |
| 境界壁垒 | 二元（全免/全伤） | 三档（gap≥2 全免；gap==1 且攻击力>护体*1.3 → 35%；否则全免） |

### A6. 守卫减伤

共用 `BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER=0.5`。旧在 useCombat.ts:60 applyHit，新在 battle-engine.ts:319-321。语义等价。

### A7. NPC AI

| 维度 | 旧 NpcAI | 新 BattleAI |
|------|---------|------------|
| 使用方 | `[RT]` useCombat.ts:388 | 仅 BattleEngine 内部（无生产调用） |
| 决策 | attack(带技能)+move(寻路贴进)+skip | basicAttack(血量最低)+guard（**无移动无技能无射程**） |
| 成熟度 | 可用 | `battle-ai.ts:16` 自评"Phase A 简化版" |

### A8. 战斗结果

| 维度 | 旧 BattleOutcome | 新 BattleDelta |
|------|-----------------|---------------|
| 使用方 | `[RT]` BattleOverlay.vue:112 | **无生产调用**（player.ts:111 commitBattleDelta 有实现有单测，但 BattleOverlay 不调） |
| 结构 | 平铺字段 | 结构化 + baseRevision 乐观锁 |

### A9. 死亡标记

两套都 `[RT]` 写 `soulState='RemnantSoul'`（旧 useCombat.ts:242；新 battle-engine.ts:330）。

## B. UI 实际调用链（混合链路确认）

```
BattleOverlay.vue
  ├─ useCombat(map, playerId, playerClone, [enemy])     [实例化旧 CombatEngine]
  │   └─ useCombat.ts:76  new CombatEngine(...)          [旧引擎]
  ├─ useBattleUI(combat, playerId)                        [引擎无关状态机]
  ├─ resolveBattleOutcome(player, [enemy], type)         [旧 combat/battle-resolver]
  └─ state.engine.placeCharacter(...)                    [旧 CombatEngine]

useCombat.ts (混合!)
  ├─ import { CombatEngine, NpcAI }                      [旧引擎]
  ├─ import { calculateDamage, skillToDamageSpec }       [新 battle/ 纯函数!]
  ├─ import { skillRange }                               [新!]
  ├─ import { BATTLE_CONFIG }                            [新!]
  ├─ import { attemptFlee }                              [新 battle/flee.ts!]
  ├─ :213  calculateDamage(...)                          [新函数结算]
  ├─ :198  skillRange(skill)                             [新函数射程]
  └─ :388  NpcAI.decide(...)                             [旧 AI]

useBattleUI.ts (混合!)
  ├─ import { skillRange } from '@taosim/engine'         [新]
  └─ import { ATTACK_RANGE } from './useCombat'          [旧常量]
```

**结论**：当前生产链路是 **"旧 CombatEngine 外壳 + 新 battle/ 纯函数内核"** 缝合体。`DamagePipeline.calculate` 已死亡，仅 `getRealmTier` 苟活。

## C. 新 BattleEngine 的成熟度

| 维度 | 状态 | 证据 |
|------|------|------|
| 命令完备性 | **缺 UseSkill/Flee**（5/7） | battle.ts:60-65 |
| 普攻 DamageSpec | **硬编码** Physical/tier 1 | battle-engine.ts:315（未调 skillToDamageSpec） |
| BattleAI | **Phase A 半成品** | battle-ai.ts:16 自评 |
| canFly/迷雾 | **缺失** | battle-engine.ts:250 |
| 生产实例化 | **0 处** | apps/ 无导入 |
| 测试覆盖 | 有 29 处实例化 | battle-engine.test.ts |
| 原子解释 | **仅射程/伤害辅助函数消费少量字段** | StatusHook/TimeATB/TerrainMutate 及 Numeric 其他参数没有统一执行语义 |

**判定**：有良好单测的骨架，功能不完备，"可单测但不可上线"。

## D. 收敛建议

### D1. 目标引擎

**新 `battle/BattleEngine`** 作为唯一状态写入者。

### D2. 理由

1. **架构正确**：确定性状态机 + dispatch 命令模式 + 结构化错误 + 事件流（battle-engine.ts:8-12 注释"唯一写入者"）
2. **内核已胜出**：calculateDamage 已经比 DamagePipeline 更强，且生产链路已用它
3. **UI 可通过适配层迁移**：useBattleUI 可以保留部分接口，但旧 `CombatState` 与新 `BattleState` 的 ATB、移动、单位和事件语义不同，迁移成本应按中高风险估算，而不是假设为低
4. **扩展支持**：BattleDelta 带 baseRevision 乐观锁

### D3. 迁移顺序

| 阶段 | 任务 | 依据 |
|------|------|------|
| P0 冻结 | 标记 DamagePipeline.calculate 为 @deprecated，建立旧/新同场景行为基线 | 0 生产调用但仍需回归基线 |
| P1 世界结果协议 | 战斗结束统一产出 WorldOutcome，并接入跨实体原子提交 | 必须先于 UI 切换，避免结果双轨 |
| P2 补命令与原子解释 | 增加 UseSkill/Flee；实现 Geometry/Numeric/StatusHook/TimeATB/TerrainMutate、消耗、冷却和目标校验 | 不能把“有命令”误当“能执行技能” |
| P3 补普攻推导 | battle-engine.ts:315 使用统一普攻 Skill/DamageSpec | C2 缺口 |
| P4 补 AI | npc-ai.ts 能力迁移进 battle-ai.ts | UI 切换前必须完成 |
| P5 补场景移动 | 明确 canFly、迷雾与地形通行规则由场景配置注入 | 避免把 UI 可见性硬编码为战斗物理规则 |
| P6 适配与对照 | 适配旧 UI 状态接口；同 seed/同命令运行旧新结果对照测试 | 验证 ATB、移动、伤害、逃跑、AI 与结算 |
| P7 灰度切换 | BattleOverlay 使用新引擎，保留 legacy 回滚开关 | 此时不得删除旧引擎 |
| P8 验收稳定 | 全量回归、E2E、性能与错误观测通过，经过约定稳定期 | 删除旧引擎的前置门槛 |
| P9 独立清理 | 删除旧 CombatEngine/DamagePipeline 与临时适配分支 | 单独提交，可独立回滚 |

### D4. 适配层策略

在 useCombat.ts 或新的战斗会话门面中保持 UI 需要的稳定接口，但不保证 `useBattleUI` 零修改。适配层负责把新 BattleState/Event 映射为 UI 视图；权威状态仍只能由 BattleEngine 写入。`engineMode` 仅用于灰度和回滚，设置明确删除条件，不能长期成为第三套战斗语义。

### D5. 风险点

| 风险 | 缓解 |
|------|------|
| 移动校验语义差异（旧只校验直线，新 BFS）→ 可达范围收窄 | 标注为"寻路修复"或临时放宽 |
| ATB 排序行为变化（FIFO → gauge 降序） | 设计修正，需回归测试 |
| NPC AI 降级（若 P3 未完成） | **P3 必须在 P6 前完成** |
| flee.ts 循环依赖 damage-pipeline | P7 前迁移 getRealmTier 到 battle/ |
| BattleDelta vs BattleOutcome 双轨 | UI 切换前统一为 WorldOutcome；旧类型仅留适配器 |
| 原子配置有数据无解释器 | 为每类 AtomicNode 建立执行语义、非法组合验证和回归场景，不只测试 UseSkill 分支 |
| seeded RNG 确定性 | 当前不支持战斗中存档时由会话持有 seed；未来支持活动战斗快照时再持久化 RNG 状态/命令序列 |
| legacy 过早删除 | 新引擎验收与稳定期结束后单独删除，回滚开关存在期间不得删除旧实现 |
