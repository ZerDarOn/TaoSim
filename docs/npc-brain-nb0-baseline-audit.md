# NPC 大脑与真实战斗 NB0 基线审计

> 状态：NB0 与 G0 全绿门禁完成，待进入 NB1
> 日期：2026-08-31
> 上位方案：[NPC 大脑与真实战斗架构方案](npc-brain-and-combat-architecture.md)
> 范围：只审计、冻结与拆解；本阶段没有改变游戏行为

## 0. 结论

当前项目已经拥有可复用的世界档案、Mind 雏形、场景投影、新战斗引擎、原子技能解释器和差量回写器，但它们还没有形成一条唯一的生产管线。

真正阻碍“人物像活人、战斗前后连续”的问题有三项：

1. 同一个 NPC 同一个月可能同时受 `chooseBehavior`、Mind 和世界旧规则影响，没有唯一行动所有者；
2. 玩家战斗、NPC 寻仇、宗门夺位分别走旧 CombatEngine、新 BattleEngine 或 `runFeudDuel`，不存在同一套真实战斗规则；
3. 战斗结束不是跨玩家、NPC、时间与事实的原子提交，逃跑和失败等出口还会漏掉状态。

因此不能直接开始堆神经节点，也不能先调战斗 AI 权重。正确顺序仍是：先建立持续认知/身体契约，再引入只做影子计算的节点调度器，最后统一遭遇、战斗与结果提交。

## 1. 审计方法与证据规则

本轮不以“搜索无命中”等价“没有实现”。每项判断至少沿以下一条完整链路确认：

```text
类型定义
  → 创建/迁移
  → 正式调用者
  → 选择或校验
  → 状态写入者
  → 事实/日志
  → 存档或下一次重建
```

测试只证明被测试入口的行为，不自动证明 UI 正式入口已经使用该入口。文档中的“已实现”进一步区分为：

- **生产生效**：UI 或世界主循环默认调用；
- **灰度可达**：有运行时开关，但不是默认路径；
- **局部生效**：只在某条支路使用；
- **测试存在**：有单元测试，但未证明生产接线；
- **契约/死分支**：类型存在，当前选择器无法自然到达。

## 2. NPC 大脑真实调用图

### 2.1 月度生产链

```text
WorldEngine.step()
  → advanceCalendar / 环境与世界事件
  → 对每个 Active NpcRecord：
      1. evolveAspiration / rollInitialAspiration
      2. chooseBehavior(npc)                    旧动机选择器
      3. generateInitialMind（仅 mind 缺失时）
      4. tickNpcMind                            新 Mind 选择器
      5. resolveNpcMindAction                   仅支持 6 类动作
      6. 旧修炼/突破规则（部分用 mindHandled 防重）
      7. 旧奇遇规则（继续读取 chooseBehavior）
      8. 旧云游/拜访规则（与 Mind 拼接）
      9. commitMindAction + Mind 事件
  → 位置配对社交与被动寻仇
  → seekRevenge 主动寻仇
  → 求偶、子嗣、传承
  → 宗门晋升、让贤、夺位、师徒
  → 势力战争、经济、人口等
  → eventLog 持久化 normal+
```

关键证据位于：

- `packages/engine/src/world/world-engine.ts:424-631`：同一 NPC 月度内同时运行 `chooseBehavior`、Mind 解析和旧规则；
- `packages/engine/src/world/world-engine.ts:635-782`：寻仇、求偶、子嗣和传承在 Mind 提交之后独立运行；
- `packages/engine/src/world/world-engine.ts:878-940`：宗门夺位独立触发并独立斗法；
- `packages/engine/src/world/npc-mind.ts:302-465`：Mind 解析器只处理 6 类动作；
- `packages/engine/src/world/world-motivation.ts:121-141`：旧选择器仍是生产依赖。

### 2.2 当前动作权威矩阵

| 动作 | Mind 能自然选择 | Mind 能结算 | 旧世界规则会执行 | 当前判决 |
|---|---:|---:|---:|---|
| cultivate | 是 | 是 | 是，带部分防重 | 混合所有权 |
| seclude | 是 | 是 | 是，折算为修炼倍率 | 混合所有权 |
| breakthrough | 是 | 是 | 是，带部分防重 | 混合所有权 |
| wander | 是 | 是 | 是，并追加拜访逻辑 | 拼接所有权 |
| courtship | 是 | 否 | 是，按 aspiration 独立执行 | Mind 只写意图文本 |
| challenge | 是 | 否 | 仅 seekRevenge 敌对链；seekFame 无对应提交 | 部分悬空 |
| teach | 是 | 否 | 是，按 aspiration 独立执行 | Mind 只写意图文本 |
| trade | 否 | 是 | 坊市另有独立系统 | Mind 解析分支不可达 |
| rest | 仅不可达的 protect_territory 目标 | 是 | 无统一恢复结算 | 基本不可达 |
| socialize | 否 | 否 | 随机配对社交独立执行 | 契约占位 |
| prepare | 否 | 否 | 无统一计划资源预留 | 契约占位 |

Mind 当前真正从“自然选择”走到“自身结算”的只有修炼、闭关、突破和云游四类。现有 P4 测试主要覆盖初始化与 `tickNpcMind` 的选择结果，没有覆盖 `WorldEngine → resolve → commit → save/reload` 的完整链。

### 2.3 Mind 契约的能力边界

当前 `MindState` 持久化：一个目标、五项需求、一个下一动作和少量执行进度。它尚不具备：

- 带来源、时间与可信度的个人知识；
- 情绪、长期压力、近期记忆和失败归因；
- 多步骤计划、备选方案、资源预留和截止时间；
- 对目标人物、物品、地点的稳定引用；
- 节点来源、候选分数、抑制原因与冷却；
- 对伤势、毒素、威胁、法律和目击者的持续认知。

`computeNeeds` 中 `safety` 固定为 0；`social` 和 `fame` 虽被计算，却不会作为通用效用竞争进入目标选择。除寿元危急覆盖外，目标基本仍由 aspiration 固定映射。

### 2.4 调度与性能基线

- 世界会补充到 800 个具名 `NpcRecord`；
- `WorldEngine.step` 对具名 NPC 至少有十处全量或近全量遍历，且核心人物循环按月运行；
- 当前没有基于事件唤醒、地点脏标记、计划到期或关注度的统一调度层；
- 已有 `populationGrid` 承担匿名凡人氛围层，但具名 NPC 仍基本同频演算；
- 现有 5 种子 × 50 年验证用时约 35.6 秒，产生 1,344,159 条当步事件，最终编年史仅保留约 19,544 条 normal+ 事件。

这不是立刻必须优化的性能事故，但证明 NB2 不能把每个神经节点追加成每 NPC 每月全表扫描。

## 3. 战斗真实调用图

### 3.1 玩家遭遇战

```text
MapPanel.acceptBattle
  → pickNearbyNpc(WorldState.npcs)
  → expandForScene(NpcRecord → Character)
  → uiStore.startBattle
  → BattleOverlay
      默认：useCombat + CombatEngine + NpcAI
      localStorage=v2：useBattleEngine + BattleEngine + BattleAI
  → resolveBattleOutcome
  → UI 直接修改 playerStore.character
  → 另建 WorldOutcome，仅 commit WorldState/NPC
```

事实：

- 遭遇对象已是稳定世界 NPC，不再生成临时敌人，这是正确底座；
- `BattleOverlay.vue:63-77` 仍默认 v1，v2 只是本地存储灰度路径；
- v2 适配器已经接入 UI，但通过类型断言伪装成 v1 接口；
- `BattleConfig` 没有携带 `BattleSceneConfig`，Overlay 也没有把场景逃跑/迷雾/水域规则传给 v2；
- 战斗本身没有权威耗时，产生的 `WorldOutcome` 没有 `timeElapsed`。

### 3.2 NPC 对 NPC 与宗门夺位

```text
WorldEngine 社交/寻仇触发
  → tryFeud
  → npcRecordToCharacter
  → runFeudDuel（最多 60 回合，双方 multiplier=1 普攻）
  → 直接修改寿元、灵魂、灵石和关系

WorldEngine 宗门夺位触发
  → sectPowerDuel
  → 同一个 runFeudDuel
  → WorldEngine 直接修改宗门领导与成员身份
```

这里所谓“真实斗法”只复用了伤害计算器；它没有使用 BattleEngine 的地图、技能原子、状态、移动、逃跑、投降、目标选择或事件流。它是第三条战斗规则，不是新引擎的无 UI 运行模式。

### 3.3 新 BattleEngine 当前能力与缺口

已实现并有测试的能力包括：统一命令入口、ATB、移动、普攻、技能原子、状态、守卫、逃跑、事件流和多单位基础结构。

但生产收敛前存在以下机制缺口：

1. `getState()` 声称返回只读快照，实际返回内部可变引用；UI 镜像和测试钩子可越过 `dispatch` 改状态；
2. BattleAI 判断技能资源时读取 `Character.ap`，引擎真正扣除的是 `BattleUnit.actionPoints`；首次行动后候选可能仍被误判为合法；
3. AI 移动候选硬编码 3 格，只检查目标格，不复用引擎的移动点、BFS、雾、水域与占位合法性；
4. 技能候选对每个技能都枚举敌人目标，没有按 Self/Ally/Enemy 与原子结果生成权威候选；
5. 伤害估值另写简化公式，和真实原子解释结果可能相反；
6. 击杀估值把敌方 HP 百分比乘以固定 100，隐含所有目标最大 HP 为 100；
7. 命令失败后 AI 不会基于结构化失败原因重新规划，而是在有限循环后结束回合；
8. `BattleEngine` 启动时把一侧固定为 Human、另一侧固定为 AI，暂不能直接表达 NPC 对 NPC 的双 AI 场景。

现有“新旧引擎 parity”测试主要证明共享公式和若干能力存在，并未证明相同场景、命令轨迹与结果的端到端等价。

## 4. 战后状态与原子性审计

### 4.1 当前权威边界

| 状态 | 当前权威 | 场景投影 | 战后回写 |
|---|---|---|---|
| NPC 身份、出身、修为、资产摘要、关系 | `NpcRecord` | `expandForScene` | `EntityDelta` 部分字段 |
| NPC 长期伤势/毒素 | `WorldState.conditions` | battle 投影读取 | `EntityDelta` 追加 |
| 战斗瞬时 HP/灵力/状态 | Battle Character/Unit | 场景内 | 不应整体覆盖 NPC |
| 玩家完整状态 | `playerStore.character` | 克隆进战斗 | UI 直接赋值 |
| 世界事实 | `WorldState.facts` / `eventLog` | 不适用 | `commitOutcome` 仅提交 worldState |

NpcRecord 与 Character 的投影桥真实存在，并且场景投影已经避免整体回写；这一部分不需要重造。缺口在于“一个结算结果如何同时更新玩家、NPC、时间、资产和事实”。

### 4.2 当前非原子出口

- UI 先修改玩家 HP、修为和灵石，再调用只负责 `WorldState` 的 `commitOutcome`；若版本冲突，玩家变化不会回滚；
- 玩家胜利时才处理 NPC 差量；玩家失败但已经重伤敌人时，敌人的伤势被忽略；
- `resolveBattleOutcome` 以“敌人全部 HP≤0”定义胜利，所以胜利分支中的“敌人被击败但仍存活”实际上不可达；
- 逃跑成功或被追击后直接关闭 Overlay，没有调用统一结果结算，战斗副本中的玩家伤害可能丢失；
- 切磋好感只尝试更新玩家 Character 里的既有关系，不保证世界 NPC 的双向关系与事实一致；
- 战斗没有推进世界时间，无法与伏击、援军、巡逻、毒发和旁观者形成统一因果。

NB4 必须引入面向“玩家存档聚合 + WorldState”的上层场景事务；不能继续把 `WorldOutcome` 的名字当成已经实现跨存储原子性。

## 5. 发现清单与优先级

### P0：进入大脑实现前必须冻结

1. **NPC 行动双提交风险**：禁止新节点调度器与旧规则同时产生状态差量；影子模式只能记录建议。
2. **三条战斗规则**：禁止给旧 CombatEngine 和 `runFeudDuel` 新增玩法；所有新战斗能力只进入 BattleEngine。
3. **非原子战后提交**：禁止 UI 新增更多直接玩家/NPC 写回；必须收敛到场景结果事务。
4. **逃跑等终局漏结算**：胜、负、逃跑、投降、超时和中止都必须产生结构化终局结果。

### P1：NB1-NB4 内解决

1. Mind 动作大部分悬空或不可达；
2. 安全、知识、记忆、情绪、计划和失败归因缺失；
3. BattleEngine 内部状态可被外部直接修改；
4. BattleAI 候选合法性、资源权威和伤害估值与执行器分裂；
5. NPC 对 NPC 尚无同引擎 headless runner；
6. 具名 NPC 同频多轮全表扫描，未来节点扩展有性能风险。

### P2：可后置但必须记录

1. 旧测试夹具使用硬编码 100 HP，与当前 DerivedStats 语义不一致；
2. v2 日志仍直接显示内部事件 JSON，不是玩家可读战斗叙事；
3. 战斗 UI 仅显式处理一个敌人，虽然底层部分代码支持 N vs N；
4. 包体主块约 964 KB，需要在功能稳定后拆分。

## 6. 冻结红线

从 NB0 完成起，后续实现遵守：

1. 不新增随机事件模板来代替 NPC 行动；
2. 不新增第二个/第三个可提交世界状态的大脑入口；
3. 影子大脑不得扣资源、改位置、改关系或发事实；
4. 不让 AI 直接写世界状态或决定胜负；
5. 不用整体 `Character → NpcRecord` 覆盖战后 NPC；
6. 不给旧 CombatEngine、旧 NpcAI、`runFeudDuel` 增加新战斗特性；
7. 不用关注列表改变 NPC 成败概率；
8. 不让场景投影自动治愈长期伤势或清空身份历史；
9. 不允许同一资源被计划与即时行为重复消费；
10. 不把单元测试存在表述为生产入口已经接通。

## 7. 特性开关策略

后续只保留两个有明确生命周期的 typed runtime flag，不继续散落 localStorage 字符串：

| 开关 | 阶段 | 默认 | 允许行为 |
|---|---|---|---|
| `npcBrainV2Shadow` | NB2 | 开发/测试开，正式可开 | 计算候选与诊断，不提交 |
| `battleEngineV2` | NB4 | 先测试开，验收后正式开 | 决定 UI 适配器内核；切换不改变结果协议 |

`npcBrainV2Shadow` 通过差异报告验收后，切到单写模式并删除旧选择入口；`battleEngineV2` 成为正式默认且存档/回放通过后，删除 v1 开关和旧引擎。开关不是长期架构。

## 8. 实施前基线门禁

NB0 初次审计时的历史基线：

- `npm run build`：通过；主块 964.44 KB，有体积警告；
- `npm test`：共 726 项，725 通过、1 项稳定失败；失败为 `world-engine.test.ts:617` 宗门让贤预期新宗主但仍为旧宗主；
- `npm run check`：在 typecheck 阶段失败；`content-registry.test.ts` 的丹方、锻造方、技能旧夹具缺少新契约必填字段；
- 5 种子 × 50 年涌现验证：通过现有指标，用时约 35.6 秒，但指标只验证事件统计，不验证大脑因果质量。

进入 NB1 前先完成独立门禁 G0：

1. 更新内容注册测试夹具，使 typecheck 恢复；
2. 固定或修正宗门让贤测试中的随机序列/规则，使全量测试稳定全绿；
3. 保留一条 800 具名 NPC 的月度/年度耗时基线；
4. 新增“一个 NPC 一个月最多一个主行动提交”的失败测试；
5. 新增玩家战斗胜/负/逃跑三出口的状态连续性失败测试，作为 NB4 靶标。

G0 只修门禁与测试确定性，不借机改变大脑或战斗设计。

### 8.1 G0 完成记录（2026-08-31）

- 内容注册测试夹具已改用当前 `PillRecipe`、`ForgeRecipe` 和 `Skill` 契约，不再用类型断言掩盖字段缺失；
- 宗门让贤失败已确认是测试随机序列耦合：Mind 接入改变了外围 rng 消费位置，让贤判定由测试假定的第 6 次调用变为第 5 次；现用高寿元掌门与恒定阈值同时抑制无关稀有事件并稳定命中让贤，不再依赖调用序号；
- 已加入可执行的 `it.fails` 结构靶标，证明当前求缘 NPC 同月仍会同时修炼并结成道侣；NB2 单写切换后应将其改为普通通过测试；
- 已登记玩家战斗胜利、失败、逃跑三类 SceneOutcome 接线 TODO；由于当前不存在统一场景事务 API，不对错误的低层函数伪造断言；
- 已增加 800 量级具名 NPC 性能基线。全量测试负载下样本为 848 份档案，单月约 18.8 ms，一年约 262.2 ms；宽松回归门分别为 1 秒和 10 秒；
- `npm run check` 全通过：728 项可执行测试通过，另有 3 项明确 TODO；
- `npm run build` 通过；主块仍为 964.44 KB，体积警告保留为 P2。

G0 已完成。下一实施阶段为 NB1，不再需要先处理历史门禁失败。

## 9. NB1-NB5 可执行微计划

### NB1：持续认知与身体契约

#### NB1.1 契约与权威

- 在 contracts 中新增版本化 `BrainProfile`、`BrainState`、`Belief`、`Memory`、`GoalRef`、`PlanState`、`ActionState`；
- `NpcRecord` 只保存稳定身份和上述长期状态；战斗 HP/临时状态仍留在场景；
- 明确 `WorldState.conditions` 是长期伤势/毒素权威，不在 Mind 再复制一份；
- 所有新增字段先可选，提供确定性默认构建器和保存迁移。

测试先行：旧存档迁移、存读档 round-trip、错误信念保留、长期伤势投影不被治愈、投影不改原档案。

#### NB1.2 兼容读取

- 从现有 personality、aspiration、relations、biography、conditions 初始化 Brain；
- 旧 `MindState` 只作为迁移来源，不成为第二权威；
- 增加状态不变量检查器，诊断悬空 NPC/地点/物品引用。

完成条件：同一 NPC 重启后目标、计划、记忆、错误信念和长期伤势完全连续。

### NB2：节点注册与单一决策调度

#### NB2.1 节点与候选协议

- 建立节点注册表、来源装配、硬前置、评分分解、冷却和抑制原因；
- 第一批只包装已经有真实执行器的 cultivate、seclude、breakthrough、wander；
- 使用稳定 seed 的小幅噪声，诊断轨迹记录每个分项，不写世界。

#### NB2.2 影子调度

- 在 WorldEngine 进入旧选择器之前运行 shadow scheduler；
- 只输出差异报告：旧行为、新候选、选择原因、耗时；
- 建立事件/到期唤醒索引，禁止每节点全表搜索世界。

#### NB2.3 单写切换

- 新增唯一 `ActionCommit` 入口；
- 逐动作把旧执行器挂到统一验证/结算，而不是重写数值规则；
- 单个动作验收后，删除对应旧选择分支；最后移除 `chooseBehavior` 的选择职责，可保留纯压力计算辅助。

完成条件：每 NPC 每月最多提交一个主行动；关闭节点只移除手段，不删除目标；同种子可回放。

### NB3：知识、计划、时间与预留

#### NB3.1 感知与信念

- 从在场人物、地点、事实和消息生成有限感知；
- 信念保存来源、观察时间、可信度和可能过期标志；
- NPC 决策只读信念视图，不读全知 WorldState 查询。

#### NB3.2 计划状态机

- 支持调查、购物、旅行、跟踪四类多步骤计划；
- 每步有前置、耗时、预留、成功/失败和重规划原因；
- 所有时间经唯一世界时钟，旅行与等待不再产生孤立时间。

#### NB3.3 资源预留

- 为唯一物品、交易报价、地点容量和行动时间窗建立 reservation；
- 提交时做版本校验，失败释放预留并形成记忆/事实；
- 存档恢复时验证并清理过期预留。

完成条件：消息可真实过期、物品不会双卖、计划失败会改变下一次选择。

### NB4：具名遭遇与同一战斗内核

#### NB4.1 收紧 BattleEngine 边界

- `getState` 改为不可变快照或只读视图；测试激活通过专用命令/fixture，不直接改内部状态；
- 引擎提供权威合法命令/候选接口，UI 和 AI 都只消费该接口；
- AI 读取 `BattleUnit.actionPoints/movePoints`，伤害估值复用原子 dry-run 或统一 evaluator；
- Self/Ally/Enemy、路径、水域、迷雾、冷却和资源合法性只实现一次。

#### NB4.2 统一 UI 正式入口

- 为 v1/v2 提取真实共享 adapter 接口，删除类型伪装；
- 将 BattleSceneConfig 纳入 BattleConfig 并完整下传；
- v2 先在测试和开发默认，完成回归后成为正式默认；
- 旧引擎冻结一个短迁移窗口后删除。

#### NB4.3 Headless 具名战斗

- BattleEngine 参与者显式携带 team/controller，支持 AI vs AI；
- 新增无计时器 headless runner，以命令/事件循环推进同一引擎；
- `tryFeud` 和 `sectPowerDuel` 只负责生成 Encounter，不再自行算胜负；
- 相同 seed、初始状态和策略在 UI/无 UI 下产出相同事件与终局。

#### NB4.4 场景事务

- 建立面向 `{ player, worldState }` 存档聚合的 SceneOutcome 提交器；
- 先校验版本、资产与引用，再一次性应用玩家差量、NPC 差量、时间和事实；
- 胜、负、逃跑、投降、超时和中止都必须产生终局；
- NPC 仅回写伤势、毒素、资产、关系、位置、灵魂与记忆差量，禁止整体覆盖。

完成条件：版本冲突时双方都不变化；逃跑伤害不丢；玩家失败后敌方伤势仍连续；后台与前台一致。

### NB5：调查—偷袭垂直切片

#### NB5.1 可组合能力

- 调查目标与路线情报；
- 购买/制作一次性手段；
- 跟踪、伏击点预留和等待；
- 察觉检定决定先手、距离和可用准备，不直接决定胜负；
- 战斗内允许撤退、追击和第三方介入；
- 战后生成伤势、资产、目击、关系、消息、记忆和时间差量。

#### NB5.2 验收矩阵

至少覆盖：目标改道、假消息、消息过期、物品被买走、守卫在场、偷袭成功、偷袭失败、双方逃跑、玩家不在场的 NPC 对 NPC、存档后继续追仇。

禁止为该切片写“固定剧情事件”；删除场景编排后，各能力仍必须可被其他目标和计划组合。

## 10. NB0 完成判决

NB0 已完成其授权范围：真实调用图、状态权威、性能与测试基线、冻结红线、特性开关策略和 NB1-NB5 微任务均已明确。

G0 已使仓库回到可信全绿基线。下一步按 NB1 → NB2 shadow → NB3 → NB4 → NB5 顺序逐阶段提交；每阶段通过质量门后再删除对应旧路径，避免把两套大脑和三套战斗永久留在项目里。
