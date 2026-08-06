# 战斗系统完善（Battle System v2）设计

> 日期：2026-08-06
> 状态：评审通过（已纳入确定性状态机、战斗事务回写、统一时序等修订）

## 一、背景与目标

当前战斗系统（[useCombat.ts](file:///d:/Code/ai/TaoSim/apps/taosim-ui/src/composables/useCombat.ts) + [BattleOverlay.vue](file:///d:/Code/ai/TaoSim/apps/taosim-ui/src/game/BattleOverlay.vue) + [combat-engine.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/combat/combat-engine.ts)）具备 ATB 战棋雏形，但存在关键缺陷：

| 缺陷 | 现状 |
|------|------|
| **无法攻击** | 攻击完全依赖技能列表；无初始技能的角色（孤儿/小家族出生）攻击列表为空，只能移动 |
| **技能系统空壳** | `Skill.primitives` 原子节点已定义但 `DamagePipeline` 中 `skillCoefficient = 1.0` 恒值，技能间无差异 |
| **无战斗内道具** | 丹药/符箓/法宝只能战斗外用，战斗内无道具按钮 |
| **无蓄力/仪式** | 无蓄力技、无阵法、渡劫纯概率结算 |
| **仅 1v1** | BattleOverlay 只传 1 个敌人，AI 只打玩家 |
| **无战利品** | 战斗只给 exp/灵石，无物品掉落 |
| **回写不完整** | 战斗结束只回写 HP，灵力/道具消耗/状态/冷却丢失 |
| **无五行交互** | 克制系数恒 1.0 |

**目标**：把战斗从"能跑"完善为"能打、有策略、有收益、有仪式感"的可玩系统。

## 二、已确认的设计决策

1. **战斗模式**：深化现有 ATB + Hex 战棋（不改为实时/指令回合）
2. **技能系统**：完整实现 `primitives` 原子系统（SkillResolver 编译）
3. **道具装备**：战斗内可用（丹药/符箓/法宝主动技）
4. **仪式类**：渡劫仪式化 + 战斗蓄力技（蓄力/额外时间准备的动作，含技能功法、激活道具等）
5. **多单位**：支持 N vs N（更真实）
6. **战利品**：不自动掉落，采用"摸索尸体"机制（真实感）
7. **架构**：战斗逻辑下沉 engine 层，UI 只渲染和转发输入
8. **五行交互（修正版）**：克制发生在功法技能之间，灵根只影响修炼不参与战斗克制

## 三、总体架构：逻辑下沉 engine

新增 `packages/engine/src/battle/` 模块：

```
packages/engine/src/battle/
├── battle-engine.ts        # 主状态机：单位注册 / ATB / 回合流转 / 胜负判定
├── skill-resolver.ts       # Skill.primitives → SkillSpec（射程/范围/系数/元素/状态）
├── damage-calculator.ts    # 伤害结算：暴击/闪避/五行交互/防御指令/境界壁垒
├── status-effect.ts        # 状态效果系统（中毒/灼烧/冰冻/眩晕/减速/破甲/buff）
├── combat-item.ts          # 战斗内道具：丹药/符箓/法宝主动技
├── charge-action.ts        # 蓄力/仪式动作（蓄力技、阵法布置）
├── loot-generator.ts       # 战利品池生成 + 摸尸
├── battle-ai.ts            # N vs N AI：目标选择/技能收益评估/移动/道具/防御
└── battle-state.ts         # BattleState 快照（供 UI 渲染）
```

**分层职责**：
- `contracts`：类型契约（BattleState、SkillSpec、StatusEffect、LootEntry 等）
- `engine/battle`：纯 TS 逻辑，无 Vue 依赖，可单测
- `apps/taosim-ui`：`useCombat` 改为薄封装（调用 BattleEngine + 维护响应式镜像），`BattleOverlay.vue` 只做渲染和输入转发

**与旧代码关系**：
- `CombatEngine`（ATB/移动/放置）继续保留或并入 `battle-engine`（决策：保留 `CombatEngine` 的地图/移动职责，`BattleEngine` 组合它）
- `DamagePipeline` 保留接口，`damage-calculator` 提供新实现；逐步迁移调用方

**引擎边界与调用协议**：
- `BattleEngine` 是战斗状态的唯一写入者。UI 只能提交 `BattleCommand`（移动、普攻、施法、防御、使用道具、结束行动）并读取只读 `BattleState` 快照，不得直接修改角色、地图或 ATB。
- `BattleEngine.dispatch(command)` 必须统一校验：战斗阶段、行动者/控制权、存活状态、AP/灵力/冷却、目标阵营、射程、路径和落点占用；非法命令返回结构化错误且不产生部分写入。
- 400ms 定时器只属于 UI 调度层；它调用确定性的 `BattleEngine.advanceTick()`。引擎内部不得依赖 `setInterval`、Vue 或墙上时间。
- 暴击、闪避、打断和掉落全部通过可注入的有种子随机源；相同初始快照 + seed + 命令序列必须得到相同结果，便于测试、复现和存档排错。
- 同一 tick 多单位就绪时，按“溢出行动值降序 → 身法降序 → characterId 升序”确定行动顺序，禁止依赖数组插入顺序。
- 引擎输出结构化 `BattleEvent[]`（伤害、状态变化、资源消耗、阵亡、胜负等），UI 日志由事件格式化，不把中文日志文本作为业务状态。

**核心不变量**：
1. 阵亡单位不能行动、被治疗规则允许外不能重新入队，也不能占用后续行动权；每次结算后都立即检查胜负。
2. 任一资源不得变为负数；一次命令要么完整成功，要么状态完全不变。
3. 一个格子最多一个存活单位；移动必须有合法可达路径，不能只用 Hex 直线距离绕过阻挡。
4. 战斗外角色与背包在战斗期间不被战斗副本隐式修改；结算提交最多执行一次。
5. 战斗不能因 AP/技能耗尽而软锁：防御/调息始终可用并回复 1 AP（不超过上限），NPC 无合法攻击时使用该动作。

## 四、Contracts 扩展

```typescript
// packages/contracts/src/skill.ts — Skill 增加
element?: SkillElement;               // 功法五行：Metal/Wood/Water/Fire/Earth/Thunder/Ice/Wind/Dark/Physical
tier?: number;                        // 功法阶位；旧数据按 Huang=1/Xuan=2/Di=3/Tian=4 迁移
target?: TargetFilter;                // 显式目标阵营；不能按技能名称或 Numeric 字段猜测

// packages/contracts/src/item.ts — Item 增加（不要塞入只允许数值的 attributes）
element?: SkillElement;               // 法宝/防具的护体元素；默认 Physical

// 新增 packages/contracts/src/battle.ts
type SkillElement = 'Metal' | 'Wood' | 'Water' | 'Fire' | 'Earth' | 'Thunder' | 'Ice' | 'Wind' | 'Dark' | 'Physical';
type SkillShape = 'Single' | 'Line' | 'AOE' | 'Cone' | 'Self' | 'Move';
type TargetFilter = 'Enemy' | 'Ally' | 'Self' | 'Any';

interface SkillSpec {                 // primitives 编译结果
  range: number;
  shape: SkillShape;
  radius?: number;                     // AOE 半径
  target: TargetFilter;
  multiplier: number;                 // 伤害系数，默认 1.0
  baseDamage: number;                 // 附加固定伤害，默认 0
  healMultiplier: number;             // 治疗系数，默认 0
  defenseBoost: number;               // 防御增益
  maxHpBoost: number;                 // 最大生命增益
  shieldValue: number;                // 固定护盾
  damageAbsorb: number;               // 固定吸收
  element: SkillElement;              // 默认 Physical
  tier: number;                       // 功法阶位
  statusEffects: StatusEffectTemplate[];  // 附加状态
  atbCost: number;                    // 行动条消耗（TimeATB 原子）
  moveRange?: number;                 // Move 型技能移动距离
}

interface StatusEffectTemplate { id: string; type: StatusType; potency: number; duration: number; }

type StatusType =
  | 'Poison' | 'Burn' | 'Frost' | 'Stun' | 'Slow'        // 负面
  | 'ArmorBreak' | 'BarrierBreak' | 'AtkUp' | 'DefUp' | 'SpeedUp'
  | 'Bind' | 'Shield' | 'Regen' | 'SoulWeaken'
  | 'ManaShield' | 'PerceptionUp' | 'SoulDrain'
  | 'Invincible' | 'BloodRage';

interface BattleStatus { id: string; type: StatusType; potency: number; remainingTurns: number; sourceId?: string; }

interface BattleUnit {
  characterId: string;
  team: 'Player' | 'Enemy';
  controller: 'Human' | 'AI';         // 阵营与控制方式分离；玩家友军可由 AI 控制
  gauge: number;                     // ATB 0-100
  actionReady: boolean;
  actionPoints: number;              // 战斗副本中的当前 AP
  maxActionPoints: number;
  statuses: BattleStatus[];          // 仅存在于战斗态，不污染 Character/存档契约
  charging?: { skillId: string; releaseAtTick: number; targetIds: string[] };
  guarding?: { element: SkillElement; tier: number; expiresAtActivation: number };
}

interface BattleState {
  map: HexBattleMap;
  units: Record<string, BattleUnit>;
  characters: Record<string, Character>;   // 战斗中可变副本
  currentTurnId: string | null;
  events: BattleEvent[];               // 有上限的结构化事件快照
  phase: 'Idle' | 'Running' | 'AwaitingCommand' | 'Resolving' | 'BattleEnd' | 'Looting';
  tickNumber: number;                  // 全局 ATB tick，蓄力等墙钟无关进度的基准
  turnNumber: number;
  winner: 'Player' | 'Enemy' | null;
  lootPool: LootEntry[];
}

interface BattleEvent {
  sequence: number;
  tickNumber: number;
  type: string;                        // 实现时收紧为事件判别联合
  actorId?: string;
  targetIds?: string[];
  data: Record<string, string | number | boolean>;
}

type BattleCommand =
  | { type: 'AdvanceTick' }
  | { type: 'Move'; actorId: string; to: { q: number; r: number } }
  | { type: 'BasicAttack'; actorId: string; targetId: string }
  | { type: 'UseSkill'; actorId: string; skillId: string; targetIds: string[] }
  | { type: 'Guard'; actorId: string }
  | { type: 'UseItem'; actorId: string; itemId: string; targetIds: string[] }
  | { type: 'EndActivation'; actorId: string };

interface BattleDelta {                // 战斗结束后提交给 store 的显式差量
  battleId: string;
  baseRevision: number;                // 战斗开始时的 player store 修订号
  characterId: string;
  hpAfter: number;
  spiritEnergyAfter: number;
  apAfter: number;
  skillCooldownsAfter: Record<string, number>;
  consumedItems: Array<{ itemId: string; count: number }>;
  rewards: { cultivationExp: number; spiritStones: number; items: ItemStack[] };
  relationChanges: Array<{ targetId: string; favorabilityDelta: number }>;
}

interface LootEntry {
  enemyId: string;
  enemyName: string;
  items: ItemStack[];                // 摸索后揭示
  spiritStones: number;              // 摸索后揭示
  revealed: boolean;                 // 已摸索
  claimed: boolean;                  // 已原子拾取
}
```

## 五、核心战斗循环（N vs N）

```
BattleEngine.start()
  └─ 注册双方单位（任意数量），放置到地图初始位置
      ATB tick（400ms）
        └─ 单位行动条蓄满 → 获得回合
            ├─ 玩家回合：移动（移动池）→ 选择动作 → 选目标 → 结算
            └─ NPC 回合：BattleAI 决策 → 执行
            回合结束
              ├─ 该行动者的状态持续时间结算
              └─ 该行动者的冷却 -1
        └─ 每个全局 ATB tick 检查蓄力 releaseAtTick（到点自动释放）
一方全灭 → 胜负结算
  └─ 胜利：生成战利品池（lootPool）→ 进入 Looting 阶段（摸尸）
  └─ 失败：encounter → GameOver；duel → 保底 1 HP
```

**统一时序定义**：
- `tick`：一次全局 ATB 推进，由 `tickNumber` 计数；Slow 和蓄力使用该时钟。
- `activation`：某个单位获得行动权到提交主动作/结束行动；`turnNumber` 每次 activation +1。文档后续提到“回合”默认均指 activation。
- AP 是跨 activation 的战斗资源：`maxActionPoints = BATTLE_MAX_AP`（首版 3，集中配置），动作扣减，防御/调息回复 1；战斗开始时当前 AP 从角色值 clamp 到 `[0, BATTLE_MAX_AP]`。
- 状态在**状态持有者 activation 开始**触发（DOT、眩晕等），在其 activation 结束扣减持续时间；其他单位行动不会缩短该状态。
- 冷却仅在技能持有者 activation 结束时递减；刚施放技能的本次 activation 不立即递减。
- 任意结算导致阵亡后，立即移除其行动就绪状态并检查胜负；DOT 杀死最后单位时不得再进入动作选择。
- 蓄力用 `releaseAtTick`，蓄力期间该单位不增长 ATB，但全局 tick 继续推进；这样 N vs N 下不会因“谁的回合”产生歧义。

## 六、功能模块详细设计

### 6.1 普攻兜底（修复"无法攻击"）

- 系统内置基础攻击动作，**不依赖技能列表**
- 属性：射程 1、系数 1.0、消耗 AP 1、无灵力消耗、无冷却
- 伤害 = 攻击力 − 防御（走 damage-calculator 全流程）
- NPC AI 无可用技能时自动普攻
- UI：SkillPanel 顶部固定"普攻"按钮（始终可见；仅在 AP≥1、存在合法目标时可执行）
- 若 AP 不足或没有合法攻击，玩家/NPC 均可使用“防御/调息”：结束本次 activation、进入 Guarding，并回复 1 AP，避免战斗软锁

### 6.2 技能原子系统（SkillResolver）

把 `Skill.primitives`（AtomicNode）编译为 `SkillSpec`：

| 原子 category | params 键 | → SkillSpec 字段 |
|--------------|----------|-----------------|
| Geometry | type(Single/Line/AOE/Cone/Self/Move), range, radius | shape, range, radius, moveRange |
| Numeric | multiplier, baseDamage, heal, defenseBoost, maxHpBoost, shieldValue, damageAbsorb | 对应同名规范字段；`heal` 迁移为 `healMultiplier` |
| StatusHook | status, duration, potency | statusEffects[] |
| TimeATB | atbCost | atbCost |
| TerrainMutate | (预留) | 地形改造，低优先级延后 |

**兜底规则**：无 Geometry → range 1 + Single；无 Numeric → multiplier 1.0；无 element 字段 → Physical；无 StatusHook → 无附加状态。保证任意 primitives 组合都能编译出可用 SkillSpec。

“兜底”只适用于**字段缺省**，不接受非法数据。Resolver 必须对未知 category/type、NaN/Infinity、负数射程/耗费/持续时间、重复的唯一原子以及超出预算的组合返回诊断错误；多 Numeric/StatusHook 的合并顺序固定并写入测试。所有系数、上限和默认值集中为具名配置，避免散落魔法数字。

现有 30 个技能（[skill-registry.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/data/skill-registry.ts)）逐条补 `element`、`tier`、`target`，不得仅按名称在运行时猜测（引火诀=Fire、风刃术=Wind、碎石拳=Physical 等）。

**现有原子兼容表（必须随 Phase B 一次迁移）**：
- 别名归一：`Freeze/Frozen → Frost`、`Paralyze → Stun`、`AttackUp → AtkUp`。
- 保留的规范状态：`Bind/Shield/Regen/SoulWeaken/ManaShield/PerceptionUp/SoulDrain/Invincible/BloodRage`；每个状态在实现前补齐具体数值语义与叠加策略。
- `ArmorPassive`、`PhysiqueUp` 的 `duration: 0` 表示常驻被动，不得编译成“0 回合状态”；它们进入被动属性聚合路径，而非战斗临时状态列表。
- 当前 `Numeric` 还包含 `maxHpBoost/shieldValue/damageAbsorb`，`Geometry` 还包含 `radius`，均必须保留；未知键直接报诊断，禁止静默丢弃。
- 现有 StatusHook 没有 `potency` 时，从具名 `STATUS_DEFAULTS` 取该状态默认值并在测试中固定；找不到默认值则编译失败，禁止默认为 0 后悄悄失效。
- `Skill.type === 'Passive'` 不生成可点击战斗动作，只生成被动 modifier；Active 技能才编译为可调度的 `SkillSpec`。

### 6.3 状态效果系统（status-effect.ts）

- `BattleStatus` 挂在 `BattleUnit.statuses`，不写入长期 `Character` 或存档；按上文统一 activation 时序结算
- 每种状态必须声明叠加策略：`RefreshDuration`、`AddPotency`、`ReplaceIfStronger` 或 `Independent`；Phase B 默认 Poison/Burn 独立来源叠加，控制类只刷新持续时间且不叠加控制次数
- 常见效果：

| 状态 | 效果 | 结算时机 |
|------|------|---------|
| Poison 中毒 | 每次自身 activation 扣 potency HP | 自身 activation 开始 |
| Burn 灼烧 | 每次自身 activation 扣 potency HP | 自身 activation 开始 |
| Frost 冰冻 | 本次 activation 无法移动 | 自身 activation 开始 |
| Stun 眩晕 | 跳过本次 activation | 自身 activation 开始 |
| Slow 减速 | ATB 增长速度 ×0.5 | ATB tick |
| ArmorBreak 破甲 | 防御减半 | 受击时 |
| BarrierBreak 破罡 | 穿透境界硬壁垒，不同时承担破甲效果 | 伤害结算时 |
| AtkUp / DefUp / SpeedUp | 对应属性 +potency% | 持续 |
| Guarding 防御 | 至下次自身 activation 开始前减伤 50%，AP+1 | 提交防御动作时 |
| Charging 蓄力 | 蓄力中，ATB 暂停 | 每个全局 tick 检查 |

### 6.4 伤害计算扩展（damage-calculator.ts）

```
基础伤害 = max(1, (攻击力 − 防御力) × 技能系数 + 技能固定伤害 − 固定减伤)
最终伤害 = round(基础伤害
          × 五行交互系数 × 境界壁垒 × 暴击(×1.5) × 防御指令(×0.5)
)
闪避率 = clamp(BASE_DODGE_RATE
          + (defender.agility − attacker.agility) / max(1, attacker.agility + defender.agility)
          × AGILITY_DODGE_SCALE,
          0, MAX_DODGE_RATE=0.30)
命中率 = 1 − 闪避率
```

- **暴击**：基于装备/词条聚合的 `critRate`（[EquipmentManager.getCombatBonuses](file:///d:/Code/ai/TaoSim/packages/engine/src/equipment/equipment-manager.ts) 已有）
- **闪避**：基于双方 agility 差值折算，上限 30%；`BASE_DODGE_RATE` 与 `AGILITY_DODGE_SCALE` 为集中配置
- **境界壁垒**：保留现有逻辑（[damage-pipeline.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/combat/damage-pipeline.ts)），仅 `BarrierBreak`（破罡）穿透；`ArmorBreak`（破甲）只降低普通防御，二者不得混用
- **随机顺序**：先判定命中，再判定暴击；未命中不得附加伤害型状态。所有小数只在最终伤害处统一取整

### 6.5 功法五行交互（修正版，灵根不参与克制）

克制发生在**功法技能之间**，角色灵根只影响修炼/学习功法，不影响战斗克制：

| 交互 | 判定 | 系数 |
|------|------|------|
| 相克 | 攻击元素 克 防御护体元素（金→木→土→水→火→金） | ×1.3 |
| 被克 | 攻击元素 被 防御护体元素克 | ×0.7 |
| 同源抵消 | 攻击与防御同元素（火系 vs 火系） | ×0.85（同源抵消） |
| 攻方阶位压制 | 攻击技能 tier − 防御来源 tier ≥ 2 | 忽略元素关系，×1.15 |
| 守方阶位压制 | 攻击技能 tier − 防御来源 tier ≤ -2 | 忽略元素关系，×0.85 |
| 无属性 | 任一方为 Physical（拳脚/剑气/御剑） | ×1.0 不受五行影响 |

**防御方护体元素来源**（按优先级）：
1. 最近使用的防御型功法元素（Guarding 状态记录）
2. 当前装备法宝/防具的 `element`（若多个来源，按 armor → weapon → treasures[0] 固定优先级）
3. 默认 Physical

防御来源必须同时给出 `{ element, tier }`；装备取自身 `tier`，默认 Physical/tier 1。雷、冰、风、暗在 v2 首版不进入五行生克环，只参与同源抵消；它们与其他元素相遇时系数为 1.0。阶位压制的 1.15/0.85 与五行系数一样集中配置，后续可调参。

> 注：角色灵根（`spiritRoot.elements`）与功法的关系 = 修炼契合度（同属性功法修炼效率加成），属于修炼系统范畴，不在战斗克制中使用。变异灵根（雷/冰/风/暗）对特定属性有天然亲和，作为功法学习门槛而非战斗系数。

### 6.6 战斗内道具（combat-item.ts）

战斗动作栏新增"道具"入口，占用行动点（消耗 AP）：

| 类型 | 效果 | 消耗 |
|------|------|------|
| 丹药 Medicine | 回血/回灵力（按丹药 attributes） | AP 1，占用回合 |
| 符箓 Talisman | 当技能用（有射程/伤害/状态），一次性消耗 | AP 1 |
| 法宝主动技 | 装备法宝的主动效果（消耗灵力） | AP 1 + 灵力 |

- 道具使用走同一结算管线（damage-calculator / status-effect）
- 使用成功时立即写入战斗内 `consumedItems` 账本，并以“初始库存 − 已预留消耗”校验剩余数量，防止同一件道具重复使用；战斗结束只把账本一次性提交到 store
- 非法命令不记账；正常退出/取消战斗丢弃账本，已产生正式胜负结果后按结算策略提交，不能靠重复点击结果按钮二次扣除

### 6.7 蓄力/仪式动作（charge-action.ts）

**蓄力技**：
- 选择蓄力 → 单位进入 `Charging` 状态（ATB 暂停增长）
- 记录 `releaseAtTick = currentTick + chargeTicks`，到点自动释放高伤害技能（`chargeTicks` 由技能规格/功法决定）
- 受击按可配置概率打断（使用战斗 seed 的随机源）；被打断时清空蓄力并产生结构化事件
- 目标在释放前阵亡/离开合法范围时，按技能配置执行“重新选取合法目标”或“释放失败”，不得默认命中失效目标
- UI：蓄力条显示剩余 tick 与预计秒数

**阵法布置**（仪式类动作）：
- 消耗回合 + 材料（可选），在站位产生持续场地效果（如增益光环/减伤结界）
- 布置后生效 N 回合
- Phase D 实现，最低可行版本：仅玩家可布置 1 种基础阵法

**渡劫仪式化**（扩展 [tribulation-engine.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/tribulation/tribulation-engine.ts)）：
- 突破从纯概率改为多阶段仪式：聚气 → 劫雷判定（多轮，受根骨/丹药/法宝加成）→ 心魔关（可选，过则成功率提升）→ 结果
- 复用现有 `TribulationEngine` 的配置与结果结构，增加阶段状态机

### 6.8 N vs N（battle-ai.ts）

- `BattleEngine` 接受任意单位数组，按 `team` 分组
- `team` 与 `controller` 分离：Player 阵营可包含 AI 友军；Phase A 人类只控制主角，其余单位由 AI 控制
- 启动前校验单位 ID 唯一、双方至少一名存活单位、出生格合法且不重叠；地图容量不足时启动失败，不做部分放置
- 目标选择策略：
  - 优先攻击**威胁最高**（当前回合数内累计伤害最高）
  - 其次**血量最低**（补刀）
  - 其次**克制关系**（攻击元素克对方护体元素）
- 技能选择：可用技能中收益评分最高者（伤害预期 × 是否克制 − 灵力成本）
- 每回合可移动 + 攻击（移动池规则与玩家一致）
- 胜负判定：一方 `team` 全部阵亡
- `resolveBattleOutcome` 改为接收完整参战者与阵亡集合，不再只接收单个 enemy；经验、灵石、掉落和切磋好感按 `BattleRewardPolicy` 聚合，避免 N 个敌人只结算第一个或重复发奖

### 6.9 战利品 + 摸索尸体（loot-generator.ts）

**胜利后不自动掉落**，生成 `lootPool`：

- 每个阵亡敌人生成一个 `LootEntry`（尸体）
- 尸体内容按敌人 tier 的掉落表随机生成：丹药 / 材料 / 装备 / 灵石
- 掉率与数量随 tier 提升
- 战利品在胜负确定时按 battle seed 派生的 loot seed 一次生成；读档/重复打开弹窗不得重掷

**摸尸交互（双轨）**：
1. **结果界面摸尸（Phase C 主）**：战斗结果弹窗 → "摸索遗物"按钮 → 逐个 LootEntry 点击探索（revealed = true）→ 揭示物品 + 灵石，点击"拾取"入包
2. **地图尸体标记（Phase C 扩展/Phase D）**：战斗胜利后敌人尸体留在 Hex 格上（`HexTile` 增加 `corpse?: { enemyId, enemyName, lootId }`），玩家移动到该格可摸尸；尸体 N 月后消失（过期系统）

“拾取”必须幂等：`LootEntry` 增加 `claimed: boolean`，同一 lootId 只能提交一次；物品与灵石在 claimed 成功时一起进入 `BattleDelta.rewards`。Phase C 主路径未完成拾取就关闭结果页时，需二次确认放弃，不能静默丢失或自动发放。

### 6.10 战斗回写修复（critical）

当前 [BattleOverlay.vue:102](file:///d:/Code/ai/TaoSim/apps/taosim-ui/src/game/BattleOverlay.vue#L102) `applyOutcome` 只回写 HP，且现有 `playerClone` 只是浅拷贝，`spiritEnergy`、`inventory`、`cultivation` 等嵌套对象仍与 store 共享引用。Phase A 必须先修复隔离，再做回写。

**事务边界**：
1. `BattleEngine.start` 对参战角色与地图创建真正的深副本（使用项目约定的显式 clone/`structuredClone`，不可只展开一层），并保存不可变的 start snapshot。
2. 战斗期间只修改引擎内部副本，同时累计资源消耗与奖励账本；store 保持不变。
3. 胜负/摸尸完成后，引擎生成一个带唯一 `battleId` 和 `baseRevision` 的 `BattleDelta`。player store 维护单调递增的 `battleRevision`；store action `commitBattleDelta(delta)` 校验两者匹配，并在一次同步事务中提交后递增 revision。
4. store 记录最近已提交 `battleId`（或等价幂等键）；重复提交直接返回 `AlreadyCommitted`，不得重复奖励、扣道具或改关系。
5. 若版本冲突或库存不足，整次提交失败并保留可诊断错误，不允许只写 HP、没扣道具的半提交。正常取消战斗则丢弃副本和账本。

提交字段如下：

```
playerStore.commitBattleDelta(delta)
  ├─ hp / spiritEnergy.current / ap
  ├─ 道具消耗（战斗中使用的丹药/符箓从 inventory 扣除）
  ├─ 技能冷却（skillCooldowns）
  ├─ cultivation.currentExp（胜利加成）
  ├─ spiritStones / items（已拾取战利品）
  └─ relations（切磋好感度）
```

`BattleStatus`、ATB、位置、蓄力、Guarding 等临时态永不回写长期角色。遭遇战失败是否仍提交灵力/AP/道具消耗遵循同一 battleType 策略并写成测试；默认 encounter 提交，duel 仅提交 HP 保底与关系变化、回滚消耗品和灵力。

## 七、UI 改造

BattleOverlay / SkillPanel / 新增组件：

| 组件 | 变更 |
|------|------|
| SkillPanel | 顶部固定普攻按钮；技能卡片显示射程/范围/元素/冷却/灵力消耗 |
| 道具面板（新增） | 战斗内可用丹药/符箓/法宝列表 |
| 蓄力条（新增） | 单位蓄力进度显示 |
| 状态图标（新增） | 单位身上的 buff/debuff 图标 |
| 目标高亮 | 选择技能/道具后高亮可攻击范围（HexCanvas 支持） |
| 摸尸界面（新增） | 战斗结果后的遗物探索弹窗 |
| ATBBar | 显示行动值 + 就绪 + 蓄力状态 |
| 多敌 | 敌人列表/点击选择目标 |

## 八、实施阶段（每阶段独立可交付）

| 阶段 | 内容 | 验收标准 |
|------|------|---------|
| **Phase A 核心闭环** | 确定性命令状态机 + 普攻/防御兜底 + N vs N + 事务回写 + 胜负结算 | 无技能角色不会软锁；至少 2v2 可完整打完；非法命令零写入；相同 seed 可复现；delta 只提交一次 |
| **Phase B 技能策略** | SkillResolver + 功法五行交互 + 状态效果 + 暴击/闪避/防御指令 | 技能间有差异；五行相克生效；中毒/眩晕等状态可触发 |
| **Phase C 收益循环** | 战斗内道具 + 战利品池 + 结果界面摸尸 | 战斗中可用丹药/符箓；胜利后摸尸得物品 |
| **Phase D 仪式感** | 蓄力技 + 阵法 + 渡劫仪式化 + 地图尸体标记 | 蓄力技可打断释放；渡劫多阶段；地图摸尸 |

Phase D 是一个产品阶段、不是一个原子开发任务；详细计划必须再拆为 D1 战斗蓄力/阵法、D2 渡劫状态机、D3 地图尸体持久化，分别验收和回滚，避免跨三个状态机一次上线。

## 九、测试策略

- **engine/battle 纯 TS 可单测**（延续项目 28 个测试文件的风格）
  - skill-resolver.test.ts：原子编译 + 兜底规则
  - damage-calculator.test.ts：暴击/闪避/五行交互系数/境界壁垒
  - status-effect.test.ts：状态 tick / 清除 / 叠加
  - combat-item.test.ts：丹药回复/符箓伤害/消耗扣除
  - charge-action.test.ts：蓄力释放/打断
  - loot-generator.test.ts：掉落表/掉率/tier 曲线
  - battle-ai.test.ts：目标选择/技能收益
  - battle-engine.test.ts：N vs N 回合流转/胜负判定
- 增加 `battle-transaction.test.ts`：深拷贝隔离、成功提交、重复 battleId、版本冲突、库存不足、取消回滚
- 增加基于固定 seed 的场景测试：相同 seed/命令序列结果一致，不同插入顺序的同 tick 就绪顺序一致
- 增加不变量/边界测试：非法命令零写入、资源不为负、阻挡路径不可穿越、DOT 杀死最后单位立即结算、AP=0 可通过防御恢复
- UI 层不承担规则测试，但至少保留一条 BattleOverlay 集成/组件测试，验证“提交命令 → 渲染快照 → 结算只 commit 一次”，防止薄封装接线回归

## 十、风险与注意

1. **契约变更影响面**：Skill 增可选 `element/tier`、Item 增可选 `element`，Battle 契约为新增；战斗临时状态不进入 Character，避免所有角色工厂和旧存档被迫迁移
2. **回写一致性**：浅拷贝、重复提交、版本冲突和库存预留是最高风险，必须由 `BattleDelta + battleId` 的单一 store action 解决，禁止 UI 手工逐字段合并
3. **时序一致性**：所有持续效果必须明确使用 tick 或 owner activation；新增状态/蓄力若没有时钟声明，不得合入
4. **AI 性能**：N vs N 每回合收益评估需控制规模（每单位 ≤ 8 技能评估），并限制候选移动格；预期最大参战规模需在 Phase A 计划中明确
5. **五行交互平衡**：系数（1.3/0.7/0.85/1.15）为初值，均从配置读取，后续按玩家反馈调参
6. **可观测性**：引擎保留最近固定上限的结构化事件；命令拒绝、结算提交失败、重复提交和胜负转移必须有可检索日志，日志不得包含整份角色/背包快照

## 十一、Phase A 开工门槛（评审结论）

在 writing-plans 拆分 Phase A 时，以下内容必须作为首批任务和验收项，不能留到 Phase B/C：

1. 建立 `BattleCommand → BattleEngine → readonly BattleState/BattleEvent` 单写入口，并把 UI 直接改角色/地图的路径收口。
2. 先写深拷贝隔离与 `BattleDelta` 幂等提交测试，再迁移 `applyOutcome`；这是 Phase A 的原子性边界。
3. 固化 tick/activation、同 tick 排序、固定 seed 随机源和胜负即时检查，再扩展 N vs N；否则后续状态与蓄力会二次返工。
4. 普攻、防御/调息、合法路径/目标校验组成“永不软锁”的最小动作集。
5. `resolveBattleOutcome` 改为多参战者聚合接口，并为 duel/encounter 分别写资源提交策略测试。

满足以上条件后，本设计可进入 Phase A 详细实施计划，无需再调整总体方向。
