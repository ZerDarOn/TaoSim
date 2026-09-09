# 动态空间世界 Phase 0 基线与兼容边界

> 审计时间：2026-09-04
> 对应方案：[动态空间与可观察世界完整重构方案](dynamic-spatial-world-implementation-plan.md)
> 状态：Phase 0–7 已完成代码与阶段门；未满足项见第 12 节。本文件只记录事实、兼容边界和回滚点，不改变正式运行行为。

## 1. 工作区基线

本轮开始时已存在且保留的修改：

- `apps/taosim-ui/src/game/panels/MapPanel.vue`
- `apps/taosim-ui/src/game/panels/character/CraftingTab.vue`
- `apps/taosim-ui/src/utils/i18n-game.ts`
- `apps/taosim-ui/src/utils/__tests__/i18n-game.test.ts`
- `packages/engine/src/index.ts`
- `packages/engine/src/overworld/hex-overworld-engine.ts`
- `docs/systemic-cultivation-world-blueprint.md`
- `packages/engine/src/__tests__/hex-overworld-engine.test.ts`
- `.commit_msg.txt`、`docs/dynamic-spatial-world-implementation-plan.md`、`docs/world-map-simulation-rethink.md`

这些修改不属于本次 Phase 0 迁移工作，后续阶段不得覆盖或回退。

基线检查（未修改正式行为前执行一次）：

| 检查 | 结果 |
|---|---|
| 四个 workspace 类型检查 | 通过 |
| UI 测试 | 7 个文件，66 通过，3 todo |
| contracts 测试 | 3 个文件，27 通过 |
| engine 测试 | 87 个文件，668 通过 |
| persistence 测试 | 3 个文件，42 通过 |
| 合计 | 100 个测试文件，803 个通过，3 个 todo |

## 2. 当前权威来源

| 领域 | 当前生产来源 | 已确认问题 | Phase 1/2 收敛目标 |
|---|---|---|---|
| 静态地图 | `PRESET_MAP`、`map-catalog`、`generateWorldGrid` | 节点图、场所目录、六边形网格分别承担空间职责；部分未开放大陆传送阵仍复用天机城节点 | `BaseMapDefinition` + 空间包含树/连接图只读适配 |
| 玩家位置 | `mapStore.state` 的 `activeContinentId`、`activeVenueId`、`hexPos`，另有 `playerStore.currentNodeId` | 两个 store 可表达互相不一致的位置；`PlayerMapState` 是 SavePayload 中的实际来源 | `Character.spatialAddress`/`travel` 为唯一正式位置，旧地图状态只做读取投影 |
| NPC 位置 | `worldState.npcs[id].locationId`、`hexPos`、`moveState`、`moveTarget` | `locationId` 仅能表达旧场所；月度维护和脑行动仍直接写旧字段 | `NpcRecord.spatialAddress`/`travel`；旧字段仅迁移读取和兼容投影 |
| 时间 | `WorldState.elapsedMinutes`；`currentYear/currentMonth` 由其投影，月度 `WorldEngine.step()` 维护 | `useWorld` 仍有非持久化 `worldDay`；`PlayerStore.advanceTime` 仍可绕过世界引擎 | 一个 `WorldClock`/调度入口，所有耗时通过世界时间提交 |
| 移动 | `overworld-engine` 节点边、`hex-overworld-engine` 六边形寻路、`travel-service` 传送分别计算 | 没有统一距离、速度、路线修订号和 ETA；六边形格不等于固定一天 | `Route` + `TravelState`，玩家/NPC 共用解析规则 |
| 动态空间 | 无 `WorldState` 动态空间快照；日历世界事件主要产生日志/乱世指数 | 秘境、灾害、结界没有可进入、可关闭、可回写对象 | `SpatialState` + `DynamicSpatialFeature` + 稀疏差量 |
| 事实 | `eventLog` 与部分 `facts` | 事件文本、结构化事实和地图变化还未统一原子提交 | Outcome 成功后生成 Fact，Narrative 只能投影事实 |
| 存档 | `SavePayload` schema v8：`worldState`、`player`、可选 `playerMapState` | 动态空间、路线和调度唤醒时间未持久化；旧占位字段仍可读但不再新写 | schema v9 起增加空间快照和实体空间状态，保留旧字段读取 |
| 战斗 | 现有 `BattleEngine`/UI 路径；当前修改已移除六边形随机临时 NPC 生成并接入部分世界 NPC Outcome 回写 | 玩家战斗仍需在后续阶段统一玩家/NPC/时间/事实的世界事务 | Phase 4/6 统一真实档案、战斗解析和原子回写 |

## 3. 兼容矩阵

迁移采取“新字段可选、旧字段只读、未知值报告”的策略。迁移器不得为了通过加载而创建正式假地点、假人物或假资产。

| 旧数据 | 新语义 | 迁移规则 | 兼容期写入边界 |
|---|---|---|---|
| `LocationRef.continentId/nodeId/venueId/hexPos` | `SpatialAddress` | `venueId` 先解析到真实 venue/site；`nodeId` 解析到真实空间节点；`hexPos` 保留为所属 LocalArea 的坐标。多个字段冲突时按 venue → node → hex 的优先级并记录警告 | Phase 1 只新增解析结果；不改变旧调用方 |
| `PlayerMapState` | 玩家 `Character.spatialAddress` 与 `travel` | 从大陆、场所、节点和 hex 生成地址；无法解析的旧大陆/节点进入迁移诊断，不生成替代地点 | Phase 1 旧状态仍供 UI 读取；Phase 2 后不作为正式移动写入口 |
| `NpcRecord.locationId/hexPos/moveState/moveTarget` | NPC `spatialAddress` 与 `travel` | 真实 venue 解析为 venue 地址；无 venue 但有 hex 的 NPC 解析为 LocalArea 坐标；有途中语义时生成未完成旅行草案；缺乏足够信息时保留旧字段并拒绝静默落点 | Phase 1 只读适配；Phase 2 后旧字段由新状态投影 |
| `PRESET_MAP` / `map-catalog` / 六边形网格 | `BaseMapDefinition` | 以现有真实目录为输入建立稳定节点、包含关系和基础连接；网格只作为坐标/表现适配，不再作为唯一领域地图 | 不删除旧目录，直到 Phase 7 清理门 |
| `currentYear/currentMonth/elapsedMinutes` | `WorldClock` | `elapsedMinutes` 继续作为存档时间权威；旧年月校验为投影值，不另行推进 | 禁止新代码直接写年月 |
| `eventLog` / `facts` | Fact Ledger + Narrative 投影 | 原有事件保留；新事实必须在 Outcome 成功后追加，旧事件不得反推未发生地图事实 | 旧事件查询继续可用 |
| `activeNPCs`、顶层 `factions`、`overworldMap`、`marketInventories`、`npcTradeOffers` | 已废弃/兼容读取字段 | 旧存档允许存在，迁移不依赖其伪权威内容；新存档不写入 | 只读，不恢复为正式权威 |
| `graveyard` | `worldState.archivedNpcs` 的查询投影 | 旧墓碑保留可读；后续从历史档案与事实重建，不能仅靠空数组覆盖历史 | 不由 UI 单独维护 |
| schema v1–v8 | 当前 schema v9（Phase 1） | 逐版本迁移；缺失动态空间字段按旧地图建立基础空间快照；无法解析的实体写入诊断并阻止进入正式移动 | 保留 v8 读取测试与 IndexedDB round-trip |

## 4. 正式路径中的临时/假数据标记

以下项目在迁移期明确标记，不得继续扩展为正式世界事实：

- `map-catalog.ts` 中未开放大陆传送阵复用 `NODE_CITY_TIANJI`：仅是旧 UI/门槛兼容占位；Phase 1 空间目录不得把它当作西漠、南疆或紫薇的真实节点。
- 旧六边形随机事件中的 NPC 生成已由现有工作区修改移除；没有真实世界档案 NPC 时必须保持空状态或环境发现，不得补临时人物。
- `BattleOverlay` 的战斗场景地图是战斗表现投影，不是可持久化的大世界地点；后续必须绑定真实场景地址并由 Outcome 回写。
- `FactionPage.vue` 的 `mockFaction` 不属于动态空间闭环，本轮不把它接入正式空间、库存或势力事实；后续若纳入正式路径必须先替换为权威档案。
- `Date.now()` 生成的会话 ID、存档 ID 和运行时物品 ID 是技术标识，不可作为地点、NPC、资产或事实来源。

## 5. Phase 0 退出门与回滚点

### 退出门检查

- 每一种当前玩家/NPC 位置来源已列出：通过。
- 地图、移动、时间、动态空间和存档的当前权威来源已列出：通过。
- schema v1–v8 的迁移入口已确认在 `SaveMigrationRunner`，不存在未解释的版本分支：通过。
- 现有工作区修改已登记，未覆盖或回退：通过。
- 核心架构假设检查：单机单权威世界、稀疏地图差量、IndexedDB 兼容和现有 NPC/战斗基础均成立；未发现需要重写总体方案的证据。

### 回滚点

Phase 1 的第一批改动只允许新增可选契约、迁移诊断、只读适配器和针对性测试；不切换 UI 或正式移动调用方。若契约验证或旧存档迁移失败，可移除新字段/适配器并恢复到本文件记录的 v8 基线，旧运行行为不需要回退。

## 6. Phase 1 质量门记录

Phase 1 已完成：

- contracts 新增 `SpatialNode`、`SpatialLink`、`SpatialAddress`、`TravelState`、`DynamicSpatialFeature`、`SpatialState` 及空间一致性检查器。
- `Character`、`NpcRecord` 和 `WorldState` 增加可选统一空间字段；`WorldOutcome.EntityDelta` 增加空间地址差量，旧 `LocationRef` 仍可读取。
- schema v8→v9 已接入；persistence 提供加载后适配回调，UI 读档使用 engine 的真实目录适配器。
- 旧 `PRESET_MAP`/`map-catalog` 被转换为一个有效包含树和道路连接图；未知地点引用返回不可解析，不创建正式替代点。
- 新游戏初始化和旧存档加载均能为玩家/NPC 补齐空间地址；旧字段仍保留，尚未成为新的正式移动写入口。

针对性门检：contracts 空间/迁移 21 通过；engine 空间目录、NPC 空间、WorldEngine 回归 41 通过；persistence 迁移/存储 42 通过；engine 构建、persistence 构建和 UI 类型检查通过。

退出标准：所有已覆盖的玩家与 NPC 位置可解析到同一空间树；旧字段没有被破坏；新空间字段未提前接管 UI 或移动。通过。

Phase 1 回滚点：删除/停用 v9 的 engine 适配器及可选空间字段后，旧 schema v8 读取和旧地图/移动调用链仍可运行；未改变旧位置字段的写入语义。

## 7. Phase 2 质量门记录

Phase 2 已完成：

- `ScheduledWake` 与稳定排序/幂等替换/到期提取契约已加入 `WorldState.scheduledWakes`。
- `spatial-travel.ts` 统一解析道路路线、距离、速度快照、ETA、检查点、路径修订和六边形局部距离；路径失效会中断旅行而不静默改点。
- `WorldClockService.advanceMinutes` 返回月度事件并在统一绝对时刻处理唤醒；`TimeAdvanceService.advanceMinutes` 让玩家生命、世界 NPC 和旅行共同推进，子月移动不再补成整月。
- `MapPanel`、`OverworldPage`、实时演算和月度按钮均进入统一分钟入口；删除 `playerStore.advanceTime`，`worldDay` 改为由绝对时间投影，UI 不再自行推进时间或把渲染位置直接写成抵达。
- NPC 云游由真实节点目标创建 `TravelState`；月度不再随机重新落脚，旧 `locationId/hexPos` 只作为兼容查询投影。旅行开始、途中、ETA 抵达均有针对性覆盖。

针对性门检：scheduler 契约 3 项、空间旅行 3 项、分钟旅行 1 项、NPC 连续旅行 1 项；P1 时间回归 14 项；WorldEngine/世界涌现/Brain 回归 52 项；contracts/engine 构建、engine 类型检查、UI 类型检查通过。

退出标准：玩家移动推进相同世界时间；具名 NPC 通过真实连续旅行出发、在途、抵达；旧随机落脚正式入口已关闭。通过。

Phase 2 回滚点：可以停止新增旅行计划并保留旧字段读取，但不回退已经写入的 `elapsedMinutes`、空间地址和旅行队列；不恢复旧的玩家隔离时间入口。

## 8. Phase 3 质量门记录

Phase 3 已完成：

- `applySpatialDelta` 在副本上应用节点、连接、特征和归档操作，校验版本、目标、端点和空间不变量后一次发布；失败不会污染源快照。
- `WorldOutcome.spatialDelta` 已接入原子提交器，空间差量与实体差量、事实和 `worldRevision` 共用提交边界；无效空间变化不会写入事实。
- 首批动态能力已实现：小型秘境入口创建 PocketRealm 根/内部场景/PortalLink，局部结界阻断连接，道路/地形灾害以范围特征阻断连接；结束时分别关闭入口或恢复受影响连接。
- 特征 `nextTransitionAtMinutes` 会进入唤醒队列；到期由世界引擎提交关闭差量并追加可追溯事实。空间修订号变化会使旧旅行检查点失效，避免穿过已关闭连接。
- 动态特征、差量和事实位于 `WorldState`，随 schema v9 空间快照保存并可通过现有迁移/读档路径恢复；未生成假地点或演示实体。

针对性门检：Phase 3 空间差量/秘境/结界/灾害/生命周期测试 4 项；空间旅行、WorldOutcome 回归与 engine 类型检查/构建通过。

退出标准：三类动态变化可原子创建、存档、到期、影响可达性并留下事实；失败无半提交。通过。

Phase 3 回滚点：停止产生新的动态差量；已有特征只能通过其生命周期关闭/冻结，不能直接删除节点、连接或历史事实。

## 9. Phase 4 质量门记录

Phase 4 已完成：

- NPC 感知索引加入空间节点和可见动态特征；只把当前包含路径/相邻连接及作用范围内的特征交给 NPC，远处或秘密特征不会因全局档案存在而泄露。
- 动态空间反应使用个人风险承受、好奇、身份职责和危险等级的确定性决策；谨慎与冒险人格面对同一真实秘境可分别选择避开/进入，进入仍由 PortalLink 与路线验证。
- 复仇追踪的正式地点移动改为 `TravelState`，直接能力调用也按同一绝对时间结算途中状态；旧的自定义未知地点只保留迁移/测试兼容分支，不成为正式空间目录。
- 具名 NPC 遭遇继续统一使用真实战斗解析器和 `WorldOutcome`；无人观看只跳过表现，不改变战斗、资产、伤势、地点和事实结果。既有伏击、守卫干预、目击认知和资产回写链保持通过。

针对性门检：NPC 空间感知/人格选择 2 项、感知回归 2 项、具名战斗 3 项、复仇伏击 7 项；engine 类型检查通过。

退出标准：不同性格/身份对同一秘境做出可解释差异；真实战斗前后人物、资产、地点和事实一致。通过。

Phase 4 回滚点：可关闭新增空间反应节点，使 NPC 回到已有心智节点；已创建的动态空间、旅行和战斗事实继续由权威快照保留。

## 10. Phase 5 质量门记录

Phase 5 已完成：

- `MapPanel` 继续作为中心工作区，保留 Cosmos/Continent/Region/Venue 面包屑和语义层级；左键只选择，右键或明确按钮才提出移动请求。
- 地图人物观察器支持当前大陆具名 NPC 搜索、选中、关注、位置/途中 ETA、当前意图和最近事实；点击标记不会切走地图，只有明确的互动按钮才进入 NPC 互动页。
- 权威 `spatialAddress`/`TravelState` 被投影为人物聚类、连续旅行路线和 ETA；动态空间特征按可见性和当前范围绘制，结界、灾害、秘境阶段和关闭后的遗迹效果均来自真实状态。
- 地图内时间线拆为附近动态与选中人物事实；既有事件侧栏继续提供沉浸、传闻和编年史视角。地图操作不再直接追加移动事实或伪造掉落物，移动掉落由 engine 的注册物品结算器处理。
- 传送也进入 `TravelState` 和统一分钟时钟，准备/启动成本不再由 UI 瞬移跳过。

阶段门检：UI 测试 7 个文件、66 项通过（3 todo）；地图观察投影/移动掉落测试 2 项；UI 类型检查通过；contracts/engine/persistence 迁移回归通过。退出标准“地图、NPC 观察器和时间线可同时使用；局部具名 NPC 可定位、选中、跟随和解释”通过。

Phase 5 回滚点：保留旧地图目录和 UI 层级适配，但不恢复旧的时间/位置写入口；观察器可以独立隐藏，权威空间与旅行状态继续作为唯一正式来源。

## 11. Phase 6 质量门记录

Phase 6 已完成：

- 新增 `triggerSecretRealmFromPressure`：真实节点灵气达到阈值后先提交“征兆”事实，下一次仍满足压力才原子创建入口、PocketRealm、内部 Scene 和 PortalLink；没有硬编码剧情结果或临时实体。
- 玩家与 NPC 进入均调用 `planSecretRealmEntry`，共享同一 PortalLink、路线修订、速度和 ETA 规则；至少两名具名 NPC 经同一入口到达内部场景并由真实具名战斗解析器结算。
- 秘境关闭由调度唤醒驱动：入口归档、内部节点归档、关闭事实和遗迹效果一并提交；内部 NPC/途中 NPC 通过实体差量回到真实锚点并清理旅行状态，避免悬空位置。
- 场景测试覆盖征兆→现世、玩家/NPC 共同进入、具名战斗伤势/死亡/资产/关系/事实回写、关闭与回置、读档重建，以及同种子正常分钟分块和月度快进的等价生命周期结果。

阶段门检：Phase 6 垂直切片 2 项、Phase 3 空间生命周期 4 项、Phase 4 NPC/战斗/伏击 15 项、contracts 存档迁移 18 项、persistence 存储迁移 42 项均通过；engine 与 UI 类型检查通过。退出标准 14 项逐项由切片覆盖，全部通过。

Phase 6 回滚点：停用秘境压力触发器即可阻止新增实例；已提交的 PocketRealm、关闭差量、人物回置和事实仍按权威状态读取，不删除历史。

## 12. Phase 7 质量门记录

Phase 7 已完成代码收敛与最终门检：

- 800/1500 具名 NPC 高倍快进夹具使用正式空间目录节点，覆盖一年、十年、唤醒队列、空间节点数和序列化存档体积；当前结果分别为 800：一年 774.0 ms、十年总计 8,800.2 ms、14.63 MiB；1500：一年 1,267.7 ms、十年总计 15,850.2 ms、22.42 MiB。1500 人口保持封顶，空间 37 节点、542 个唤醒，无无界增长或悬空位置证据。
- 调度队列改为稳定有序插入和二分到期提取；NPC Brain 能力提交改为目标字段副本；月度关系/传承和空间感知改用预计算索引；知识更新改为写时复制；路线解析增加按修订号/时间/端点失效的缓存。
- 通过调用图证明并删除旧独立 `OverworldEngine` 及其专属测试；保留旧 `locationId`、`hexPos` 和 v8 读取迁移作为兼容读取/投影，没有恢复第二套正式移动语义。
- 旧存档迁移、空间不变量、完整秘境切片、具名战斗真实结算、关闭回置、读档重建和 UI 观察路径均有回归覆盖；最终阶段不再添加天气、跨界、更多秘境、AI 对话或渡劫功能。

阶段门结果：正式位置/旅行权威来源唯一、旧存档可读、完整切片可重复；性能夹具守住 1500 人口与 30 MiB 有界存档门。旧 Phase 0.5 计划的更严格“1500 NPC 十年不超过 10 秒”目标未满足，当前 15.85 秒，记录为明确技术债，不改变总体架构。全仓库仍有少数 NB0 遗留 UI 战斗/事件直接写入路径，尚未达到“所有旧 UI 场景均通过场景事务”的更宽验收范围；本轮动态地图/空间移动路径已隔离这些写入口。

退出标准：动态空间方案的 Phase 7 范围通过；上述两项遗留约束已量化并列入最终未满足项，按授权在此停止，不继续扩展计划外功能。
