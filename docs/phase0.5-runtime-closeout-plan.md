# Phase 0.5：运行时接线与活世界收口方案

> 日期：2026-08-10  
> 状态：待实施  
> 上位方案：[Phase 0.5：活世界底座修复执行方案](phase0.5-living-world-execution-plan.md)  
> 目的：修正“模块已实现、测试已通过，但正式玩法没有使用”的假完成状态。

## 1. 结论

当前不能只处理“#7 Watchlist/UtilityAI”和“#8 临时 NPC fallback”。代码复核显示还存在两个必须一并收口的问题：

1. `WorldClockService` 通过 `(engine as any).state` 读取私有状态，破坏时间权威边界；
2. `tickNpcMind` 虽已在月度循环调用，却只更新 `mind.nextAction`，没有执行行动、提交差量或生成已结算事实。

因此，544 个测试全绿只能证明现有断言通过，不能证明 Phase 0.5 已形成真实玩法闭环。尤其 `phase0.5-p7-tianji-slice.test.ts` 直接实例化 `Watchlist`、直接调用 `tickNpcMind`，并不能证明 UI、存档或世界引擎已经接入这些能力。

本轮按 C0-C5 顺序执行。不得跳过质量门，不得并行创造第二套权威状态。

## 2. 已确认的代码事实

| 编号 | 事实 | 判定 |
|---|---|---|
| R-1 | `world-clock.ts` 使用 `(this.engine as any).state` | 真实缺陷，必须修复 |
| R-2 | `TimeAdvanceService` 的 World 分支已调用 `clock.stepMonth()` | 已接入，不回退 |
| R-3 | contracts 仍公开 `TimeFlowMode = 'World' \| 'Isolated'`，服务仍实现 Isolated 写年月 | 契约与“正式玩法唯一世界时间”冲突 |
| R-4 | `tickNpcMind` 在 `WorldEngine.step()` 中运行，但 `actionDescription` 被丢弃，行动没有统一 Resolver | 接线不完整，不得称为 NPC 自主行动已完成 |
| R-5 | `Watchlist` 只有模块测试/手工集成测试引用 | 运行时死代码 |
| R-6 | `EventLog.vue` 的“选中 NPC”只是临时 `ref`，没有关注/取消关注和存档恢复 | 运行时缺口 |
| R-7 | `BattleEngine.resolveAiTurn()` 仍直接调用固定优先级 `BattleAI.decide()` | UtilityAI 未成为正式 AI |
| R-8 | UtilityAI 用 `enemyHpPercent * 100` 反推目标血量 | 隐含“满血 100”假设，与统一派生数值冲突 |
| R-9 | `MapPanel.vue`、`hex-overworld-engine.ts`、旧 `overworld-engine.ts` 均仍可生成临时具名人物 | 可达缺陷，不是安全注释 |
| R-10 | `pickNearbyNpc` 无场所参数时从全世界前 20 个活动 NPC 中抽取 | 身份真实但空间不真实，不能称为 nearby |

## 3. 冻结的设计决策

1. `WorldState.elapsedMinutes` 是唯一权威时间；年月日时均为投影。
2. 正式玩法不存在“玩家时间前进、世界冻结”。闭关、修炼、等待均是可中断的世界快进。
3. `NpcRecord.mind` 表示意图和计划，不等于事实。只有 Resolver 成功结算并提交差量后，才能写入事实/事件。
4. 关注系统是玩家观察状态，不属于 NPC 属性，不改变 NPC 的概率、数值、死亡、机缘或调度精度。
5. 所有玩家可见的具名人物必须能通过稳定 id 追溯到 `WorldState.npcs` 或 `archivedNpcs`。
6. 没有合法世界实体时宁可不生成具名遭遇，也不得临时造人。妖兽生态另立后续任务，本轮不得用人形 `Character` 改名伪装。
7. UtilityAI 必须从引擎当前合法命令生成候选，评分器不得自己臆造不可执行动作。
8. 固定优先级 AI 只可作为异常降级，不能与 UtilityAI 同时作为两套正常决策链。

## 4. 实施顺序

### C0：纠正时间边界与测试口径

**目标**：先消除架构逃逸和误导性“集成测试”，建立可信基线。

任务：

1. 为 `WorldEngine` 增加最小公开只读时间 API，例如 `getElapsedMinutes()`；或提供原子化 `advanceElapsedMinutes()`。`WorldClockService` 只能调用公开 API，删除全部 `(engine as any).state`。
2. 保证跨月流程只有一个地方增加月份：子月时间累积、跨月 `step()`、最终绝对时间写回不得重复加月。
3. 将正式时间 API 收窄为 World-only。若预览/测试确需冻结世界，迁移到名称明确、不能写入正式存档的独立 Preview/Simulation API；不得继续让 `TimeAdvanceService.advance(..., 'Isolated')` 成为公开正式分支。
4. 修订 P7 测试：删除通过 `if (...) return` 的概率性跳过；固定 seed 和夹具必须保证断言真实执行。
5. 将测试分成“纯模块测试”“引擎集成测试”“生产入口测试”，禁止把直接 import 后手工调用称为 UI/运行时已接入。

质量门：

- 生产代码搜索不到 `(engine as any).state`；
- 任意正分钟序列与等价分块序列得到相同 `elapsedMinutes/currentYear/currentMonth`；
- 快进 12 月与逐月 12 次在同 seed 下权威状态等价；
- 正式 UI 和正式服务无法选择 Isolated；
- 所有测试都实际执行断言，不允许条件 return 假通过。

### C1：让 NPC Mind 从“想做”走到“做成”

**目标**：修复玩家快进后观察不到 NPC 后续行为的根因。

任务：

1. 扩展 `MindState` 的计划信息，至少包含行动开始时间、预定结算时间、目标实体/地点和状态；旧档提供确定性默认迁移。
2. 建立唯一 `resolveNpcAction(record, action, context)`：执行前置条件检查，返回结构化 Outcome/Delta/Fact，不直接写叙事字符串。
3. 复用现有修炼、突破、移动、交易、社交、寻仇等规则，把它们改造成 Mind 行动的候选或 Resolver；禁止在旧月度概率链和 Mind Resolver 中重复结算同一行为。
4. 结算顺序固定为 `Intent -> Validation -> Resolution -> Delta Commit -> Fact -> Narrative Projection`。
5. 行动失败也要有机器可读原因，并触发重新规划；不得把失败意图写成“已经发生”的日志。
6. 世界新闻只显示 major/epoch 或可观察异常；普通修炼、普通出生、普通走动只进入人物时间线或摘要，不刷全局日志。
7. 快进摘要统计目标变化、出发/抵达、交易、突破、受伤、死亡和关系变化；玩家相关重大事实可中断快进。

首批必须闭环的行动：`cultivate`、`seclude`、`breakthrough`、`wander/travel`、`trade`、`rest`。其余行动可继续使用现有规则，但必须明确标为未迁移，不能伪称已由 Mind 驱动。

质量门：

- 固定一个 NPC 快进 12 个月，至少能观察到“目标—行动—结算—状态变化”的连续链；
- 日志中的每个结果都能追溯到已提交差量；
- 同 seed 可重放；保存读档后计划和到期时间连续；
- 不能同时被旧随机规则和新 Resolver 重复增加修为、移动或交易。

### C2：接入可持久化 Watchlist 与日志分层

**目标**：让玩家真正“观察众生”，同时不赋予被关注者剧情保护。

任务：

1. 新增每存档独立的 `PlayerObservationState`，首版只含 `watchedNpcIds: string[]`；不要塞入 `Character` 或 `PlayerMapState`。
2. `SavePayload` 升级到 schema v6，新增可选 observation state；v5→v6 默认空关注列表，并补迁移往返测试。
3. 在 NPC 详情、聚落当前人物列表和编年史人物面板提供关注/取消关注；“当前选中”与“长期关注”必须是两个概念。
4. EventLog 正式调用相关性投影，输出三层：世界大事、本地消息/传闻、关注人物时间线。
5. 修正当前分类：普通 `normal` 事件不能无条件进入 world 层；local 必须结合玩家所在位置和知识边界。
6. 关注对象死亡或归档后仍可通过 `archivedNpcs` 和事实流查看，不自动从关注列表删除。
7. Watchlist 不得注入 `WorldEngine.step()`、RNG、战斗数值或行动评分。

质量门：

- UI 关注一个真实 NPC，推进时间后其已结算重要行为进入时间线；
- 保存、退出、读档后关注状态保持；
- 同 seed 下关注与不关注两次模拟的世界状态完全相同，仅投影结果不同；
- 普通出生和日常行为不再污染世界新闻。

### C3：让 UtilityAI 成为正式战斗 AI

**目标**：以合法候选 + 效用评分替换固定优先级决策。

任务：

1. 从 `BattleEngine` 当前状态生成合法候选：每个可释放技能×合法目标、普攻×合法目标、可达移动格、防御、允许时逃跑。
2. 候选生成复用引擎校验规则；不要复制一套射程/AP/灵力/冷却/地形判定。
3. 重做评分上下文，传入目标实际 `currentHp/maxHp`，删除 `enemyHpPercent * 100` 的满血 100 假设。
4. 首版评分至少覆盖预期伤害、击杀、资源成本、受击风险、距离和逃跑；控制/治疗/性格权重只有在数据真实可得时接入。
5. 同分使用稳定排序键；随机性必须来自注入 RNG，不得使用 `Math.random()`。
6. 返回决策诊断：候选、分项得分、淘汰原因、最终选择；默认关闭详细日志，测试/调试可开启。
7. `BattleEngine.resolveAiTurn()` 只调用新的正式决策入口；固定优先级链移到显式 fallback，并记录 fallback 原因。
8. AI 决策后命令若失败，不得静默结束；记录不变量错误并安全 Guard/EndActivation。

质量门：

- 基准场景覆盖补刀、远程技能、资源不足、接近目标、危险时防御/逃跑；
- 不同最大气血尺度下击杀判断正确；
- 同状态同 seed 决策一致；
- 生产调用图能从 `BattleEngine.resolveAiTurn()` 追到候选生成和 `selectBestAction()`。

### C4：彻底移除临时具名实体与伪 nearby

**目标**：任何遭遇都来自同一个世界，而不是 UI 临时生成。

任务：

1. 将旅行事件中的人物载荷改为稳定引用，例如 `npcId/entityRef`；UI 展示时再从 EntityDirectory 查询投影。
2. `pickNearbyNpc` 必须按当前位置的 venue/node/hex 查询，不得在无位置条件时退化为“全世界前 20 人随机抽取”。
3. 从 `MapPanel.vue`、`hex-overworld-engine.ts`、旧 `overworld-engine.ts` 删除 `NPCGenerator.generate()` 遭遇路径及相关 import。
4. 无合法候选时返回明确的 `no_encounter`/环境事件，或重新抽取非人物事件；不得生成具名修士，也不得把随机 Character 改名成妖兽。
5. 若旧 `OverworldEngine` 已不被生产调用，先用调用图和测试证明，再标记 deprecated；本轮不做未经证明的大删除。
6. 战斗结束继续使用既有 `commitOutcome` 差量回写，并验证再次遭遇同一 NPC 时伤势、关系、资产和历史连续。

质量门：

- 三个生产模块中不存在遭遇用途的 `NPCGenerator.generate()`；
- 任一 `npc_meet`/具名敌人都能由 id 在活动或归档实体目录中解析；
- 空世界移动不会凭空造人；
- 同一 NPC 遭遇→战斗→回写→存档→读档→再次遭遇保持连续。

### C5：真实垂直切片与最终质量门

**目标**：证明玩家实际入口使用了以上能力，而不是仅证明模块能被 import。

必须新增一条从正式入口驱动的天机城验收：

1. 新建世界并进入天机城；
2. 当前人物列表只显示真实在场 NPC；
3. 关注其中一人并保存；
4. 世界快进若干月，该 NPC 形成并执行至少一个可结算行动；
5. 其时间线出现结算事实，世界新闻不被普通日常刷屏；
6. 与真实 NPC 发生战斗，AI 至少一次通过 UtilityAI 选择行为；
7. 战斗结果差量回写；
8. 读档后时间、关注、NPC 计划、位置、伤势和历史连续；
9. 空候选场景不生成临时人物。

测试层级：

- 纯函数单元测试：时间投影、候选评分、事件相关性；
- 引擎集成测试：Mind 结算、UtilityAI 调用、遭遇引用、差量回写；
- UI/生产入口测试：关注交互、日志视图、存读档、真实遭遇；
- 架构防回归测试：禁止生产遭遇模块引用临时 NPC 生成器，禁止正式时间 API 暴露 Isolated。

最终必须执行并报告：

```text
npm run typecheck
npm test
npm run build
```

除“总测试数”外，报告必须逐条列出 C0-C5 的验收证据和具体生产调用链。测试全绿但某条生产链未接入，仍判定未完成。

## 5. 范围边界

本轮不实现：

- LLM 对话或 AI 叙事；
- 完整妖兽生态与种族内容；
- 渡劫 V2、夺舍、兽潮；
- 删除 legacy 战斗引擎；
- 关注人物专属剧情或概率加成；
- 为了日志好看而先生成叙事、后补状态。

## 6. 执行授权与停机条件

可一次性授权内置 AI 执行 C0-C5，但授权仅限本方案范围。以下情况必须停下汇报，不得自行扩权：

1. 需要改变冻结的产品决策；
2. 需要删除尚有生产调用的 legacy 模块；
3. 需要引入新的实体权威或第二套时间；
4. 旧存档无法无损迁移；
5. 必须实现完整妖兽/种族系统才能继续；
6. 发现现有用户修改与任务文件重叠且无法安全保留。

实施者完成后不得只汇报“测试全绿”，必须提供：修改文件、生产调用链、迁移版本、逐项验收结果、尚未完成项和试玩复现步骤。
