# 战斗系统完善（Battle System v2）设计

> 日期：2026-08-06
> 状态：已批准（用户确认六个方向决策 + 功法五行交互修正版）

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

## 四、Contracts 扩展

```typescript
// packages/contracts/src/character.ts — Character 增加
statusEffects: BattleStatus[];        // 战斗中 buff/debuff/蓄力标记（战斗外为空数组）

// packages/contracts/src/skill.ts — Skill 增加
element?: SkillElement;               // 功法五行：Metal/Wood/Water/Fire/Earth/Thunder/Ice/Wind/Dark/Physical
tier?: number;                        // 功法阶位（用于等级压制判定，默认取 ItemTier 同规则）

// 新增 packages/contracts/src/battle.ts
type SkillElement = 'Metal' | 'Wood' | 'Water' | 'Fire' | 'Earth' | 'Thunder' | 'Ice' | 'Wind' | 'Dark' | 'Physical';
type SkillShape = 'Single' | 'Line' | 'AOE' | 'Cone' | 'Self' | 'Move';
type TargetFilter = 'Enemy' | 'Ally' | 'Self' | 'Any';

interface SkillSpec {                 // primitives 编译结果
  range: number;
  shape: SkillShape;
  target: TargetFilter;
  multiplier: number;                 // 伤害系数，默认 1.0
  baseDamage: number;                 // 附加固定伤害，默认 0
  heal: number;                       // 治疗量，默认 0
  element: SkillElement;              // 默认 Physical
  tier: number;                       // 功法阶位
  statusEffects: StatusEffectTemplate[];  // 附加状态
  atbCost: number;                    // 行动条消耗（TimeATB 原子）
  moveRange?: number;                 // Move 型技能移动距离
}

interface StatusEffectTemplate { id: string; type: StatusType; potency: number; duration: number; }

type StatusType =
  | 'Poison' | 'Burn' | 'Frost' | 'Stun' | 'Slow'        // 负面
  | 'ArmorBreak' | 'AtkUp' | 'DefUp' | 'SpeedUp'          // 增益减益
  | 'Charging' | 'Guarding' | 'Formation';                // 战斗状态标记

interface BattleStatus { id: string; type: StatusType; potency: number; remainingTurns: number; sourceId?: string; }

interface BattleUnit {
  characterId: string;
  team: 'Player' | 'Enemy';
  gauge: number;                     // ATB 0-100
  actionReady: boolean;
  charging?: { skillSpec: SkillSpec; turnsRemaining: number; chargeTurns: number };
  guarding?: boolean;                // 防御指令
}

interface BattleState {
  map: HexBattleMap;
  units: Record<string, BattleUnit>;
  characters: Record<string, Character>;   // 战斗中可变副本
  currentTurnId: string | null;
  turnLog: string[];
  phase: 'Idle' | 'PlayerTurn' | 'NpcTurn' | 'BattleEnd' | 'Looting';
  turnNumber: number;
  winner: 'Player' | 'Enemy' | null;
  lootPool: LootEntry[];
}

interface LootEntry {
  enemyId: string;
  enemyName: string;
  items: ItemStack[];                // 摸索后揭示
  spiritStones: number;              // 摸索后揭示
  revealed: boolean;                 // 已摸索
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
              ├─ 状态效果 tick（中毒掉血等）
              ├─ 冷却 -1
              └─ 蓄力进度 +1（蓄满自动释放）
一方全灭 → 胜负结算
  └─ 胜利：生成战利品池（lootPool）→ 进入 Looting 阶段（摸尸）
  └─ 失败：encounter → GameOver；duel → 保底 1 HP
```

## 六、功能模块详细设计

### 6.1 普攻兜底（修复"无法攻击"）

- 系统内置基础攻击动作，**不依赖技能列表**
- 属性：射程 1、系数 1.0、消耗 AP 1、无灵力消耗、无冷却
- 伤害 = 攻击力 − 防御（走 damage-calculator 全流程）
- NPC AI 无可用技能时自动普攻
- UI：SkillPanel 顶部固定"普攻"按钮（始终可用）

### 6.2 技能原子系统（SkillResolver）

把 `Skill.primitives`（AtomicNode）编译为 `SkillSpec`：

| 原子 category | params 键 | → SkillSpec 字段 |
|--------------|----------|-----------------|
| Geometry | type(Single/Line/AOE/Cone/Self/Move), range | shape, range, moveRange |
| Numeric | multiplier, baseDamage, heal, defenseBoost | multiplier, baseDamage, heal |
| StatusHook | status, duration, potency | statusEffects[] |
| TimeATB | atbCost | atbCost |
| TerrainMutate | (预留) | 地形改造，低优先级延后 |

**兜底规则**：无 Geometry → range 1 + Single；无 Numeric → multiplier 1.0；无 element 字段 → Physical；无 StatusHook → 无附加状态。保证任意 primitives 组合都能编译出可用 SkillSpec。

现有 30 个技能（[skill-registry.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/data/skill-registry.ts)）按名称补 `element`（引火诀=Fire、风刃术=Wind、碎石拳=Physical 等）。

### 6.3 状态效果系统（status-effect.ts）

- `BattleStatus` 挂在 `Character.statusEffects`，每回合 tick
- 常见效果：

| 状态 | 效果 | 结算时机 |
|------|------|---------|
| Poison 中毒 | 每回合扣 potency HP | 回合开始 |
| Burn 灼烧 | 每回合扣 potency HP | 回合开始 |
| Frost 冰冻 | 无法行动 1 回合 | 行动前 |
| Stun 眩晕 | 跳过 1 回合 | 行动前 |
| Slow 减速 | ATB 增长速度 ×0.5 | ATB tick |
| ArmorBreak 破甲 | 防御减半 | 受击时 |
| AtkUp / DefUp / SpeedUp | 对应属性 +potency% | 持续 |
| Guarding 防御 | 本回合减伤 50%，AP+1 | 行动时 |
| Charging 蓄力 | 蓄力中，ATB 暂停 | 蓄力结算 |

### 6.4 伤害计算扩展（damage-calculator.ts）

```
最终伤害 = max(0, (攻击力 − 防御力) × 技能系数 − 固定减伤)
          × 五行交互系数 × 境界壁垒 × 暴击(×1.5) × 防御指令(×0.5)
最终闪避判定：命中 = 1 − defender.agility / (attacker.agility + defender.agility) × 0.15
```

- **暴击**：基于装备/词条聚合的 `critRate`（[EquipmentManager.getCombatBonuses](file:///d:/Code/ai/TaoSim/packages/engine/src/equipment/equipment-manager.ts) 已有）
- **闪避**：基于双方 agility，比例折算，上限 30%
- **境界壁垒**：保留现有逻辑（[damage-pipeline.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/combat/damage-pipeline.ts)），破罡状态穿透

### 6.5 功法五行交互（修正版，灵根不参与克制）

克制发生在**功法技能之间**，角色灵根只影响修炼/学习功法，不影响战斗克制：

| 交互 | 判定 | 系数 |
|------|------|------|
| 相克 | 攻击元素 克 防御护体元素（金→木→土→水→火→金） | ×1.3 |
| 被克 | 攻击元素 被 防御护体元素克 | ×0.7 |
| 同源抵消 | 攻击与防御同元素（火球 vs 水球同阶） | ×0.85（气化抵消） |
| 等级压制 | 攻击技能 tier − 防御技能 tier ≥ 2 | 无视相克直接压制 |
| 无属性 | 任一方为 Physical（拳脚/剑气/御剑） | ×1.0 不受五行影响 |

**防御方护体元素来源**（按优先级）：
1. 最近使用的防御型功法元素（Guarding 状态记录）
2. 当前装备法宝/防具的元素（装备 `attributes` 可含元素标记，扩展）
3. 默认 Physical

> 注：角色灵根（`spiritRoot.elements`）与功法的关系 = 修炼契合度（同属性功法修炼效率加成），属于修炼系统范畴，不在战斗克制中使用。变异灵根（雷/冰/风/暗）对特定属性有天然亲和，作为功法学习门槛而非战斗系数。

### 6.6 战斗内道具（combat-item.ts）

战斗动作栏新增"道具"入口，占用行动点（消耗 AP）：

| 类型 | 效果 | 消耗 |
|------|------|------|
| 丹药 Medicine | 回血/回灵力（按丹药 attributes） | AP 1，占用回合 |
| 符箓 Talisman | 当技能用（有射程/伤害/状态），一次性消耗 | AP 1 |
| 法宝主动技 | 装备法宝的主动效果（消耗灵力） | AP 1 + 灵力 |

- 道具使用走同一结算管线（damage-calculator / status-effect）
- 战斗中消耗的道具在战斗结束回写 store 时真正扣除

### 6.7 蓄力/仪式动作（charge-action.ts）

**蓄力技**：
- 选择蓄力 → 单位进入 `Charging` 状态（ATB 暂停增长）
- N 回合后自动释放高伤害技能（N 由技能规格/功法决定）
- 受击有概率打断（被打断则蓄力清空）
- UI：蓄力条显示剩余回合

**阵法布置**（仪式类动作）：
- 消耗回合 + 材料（可选），在站位产生持续场地效果（如增益光环/减伤结界）
- 布置后生效 N 回合
- Phase D 实现，最低可行版本：仅玩家可布置 1 种基础阵法

**渡劫仪式化**（扩展 [tribulation-engine.ts](file:///d:/Code/ai/TaoSim/packages/engine/src/tribulation/tribulation-engine.ts)）：
- 突破从纯概率改为多阶段仪式：聚气 → 劫雷判定（多轮，受根骨/丹药/法宝加成）→ 心魔关（可选，过则成功率提升）→ 结果
- 复用现有 `TribulationEngine` 的配置与结果结构，增加阶段状态机

### 6.8 N vs N（battle-ai.ts）

- `BattleEngine` 接受任意单位数组，按 `team` 分组
- 目标选择策略：
  - 优先攻击**威胁最高**（当前回合数内累计伤害最高）
  - 其次**血量最低**（补刀）
  - 其次**克制关系**（攻击元素克对方护体元素）
- 技能选择：可用技能中收益评分最高者（伤害预期 × 是否克制 − 灵力成本）
- 每回合可移动 + 攻击（移动池规则与玩家一致）
- 胜负判定：一方 `team` 全部阵亡

### 6.9 战利品 + 摸索尸体（loot-generator.ts）

**胜利后不自动掉落**，生成 `lootPool`：

- 每个阵亡敌人生成一个 `LootEntry`（尸体）
- 尸体内容按敌人 tier 的掉落表随机生成：丹药 / 材料 / 装备 / 灵石
- 掉率与数量随 tier 提升

**摸尸交互（双轨）**：
1. **结果界面摸尸（Phase C 主）**：战斗结果弹窗 → "摸索遗物"按钮 → 逐个 LootEntry 点击探索（revealed = true）→ 揭示物品 + 灵石，点击"拾取"入包
2. **地图尸体标记（Phase C 扩展/Phase D）**：战斗胜利后敌人尸体留在 Hex 格上（`HexTile` 增加 `corpse?: { enemyId, enemyName, lootId }`），玩家移动到该格可摸尸；尸体 N 月后消失（过期系统）

### 6.10 战斗回写修复（critical）

当前 [BattleOverlay.vue:102](file:///d:/Code/ai/TaoSim/apps/taosim-ui/src/game/BattleOverlay.vue#L102) `applyOutcome` 只回写 HP。修复后完整回写：

```
playerStore.character ← 战斗副本（合并）
  ├─ hp / spiritEnergy.current / ap
  ├─ 道具消耗（战斗中使用的丹药/符箓从 inventory 扣除）
  ├─ 技能冷却（skillCooldowns）
  ├─ 状态效果（statusEffects，战斗外清除）
  ├─ cultivation.currentExp（胜利加成）
  ├─ spiritStones（战利品）
  └─ relations（切磋好感度）
```

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
| **Phase A 核心闭环** | 普攻兜底 + N vs N + 战斗回写修复 + 胜负结算完善 | 无技能角色可攻击；多敌战斗可打；战斗消耗完整回写 |
| **Phase B 技能策略** | SkillResolver + 功法五行交互 + 状态效果 + 暴击/闪避/防御指令 | 技能间有差异；五行相克生效；中毒/眩晕等状态可触发 |
| **Phase C 收益循环** | 战斗内道具 + 战利品池 + 结果界面摸尸 | 战斗中可用丹药/符箓；胜利后摸尸得物品 |
| **Phase D 仪式感** | 蓄力技 + 阵法 + 渡劫仪式化 + 地图尸体标记 | 蓄力技可打断释放；渡劫多阶段；地图摸尸 |

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
- UI 层保持薄封装，不新增重型测试

## 十、风险与注意

1. **契约变更影响面**：Character 增 `statusEffects`、Skill 增 `element/tier` —— 所有构造 Character 的测试/工厂需补默认值（character-factory、npc-generator、测试 makeChar 等）
2. **回写一致性**：战斗副本与 store 的合并逻辑要严谨，避免道具双重扣除或丢失
3. **AI 性能**：N vs N 每回合收益评估需控制规模（每单位 ≤ 8 技能评估）
4. **五行交互平衡**：系数（1.3/0.7/0.85）为初值，后续按玩家反馈调参
