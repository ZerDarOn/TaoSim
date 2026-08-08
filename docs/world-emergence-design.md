# 修仙世界涌现叙事设计方案（无 AI 优先）

> 状态：草案，待评审
> 日期：2026-08-08
> 目标读者：后续实现者（含 AI 助手）——本文档是"防遗忘"的权威依据

## 1. 背景与设计目标

TaoSim 是纯文字修仙开放世界。在接入 LLM 之前，我们参照 WorldBox（无 AI 规则驱动涌现）与矮人要塞（Fortress 沉浸 / Legends 上帝双视角），让**世界仅靠规则自动演化出"像小说一样"的故事**。

目标：

1. 无 AI 前提下，世界自动演化出连贯、可回溯的故事（NPC 崛起/陨落、恩怨情仇、传奇生平）
2. 玩家既是世界一员（沉浸视角），又可切上帝视角查看世界全局（编年史）
3. 日志真实性：事件必须引用真实实体（NPC/地点/物品），不允许凭空捏造
4. AI 是增强层，不是依赖：后续 LLM 读取日志做对话/叙事增强，不改世界事实

## 2. 核心概念

### 2.1 双视角（玩家感知模型）

| 视角 | 定义 | 可见范围 | 对应参照 |
|---|---|---|---|
| 沉浸视角 | 玩家是一个修士 | 亲身经历 + 周边传闻（信息不对称） | DF Fortress Mode |
| 上帝视角 | 世界编年史 | 全量事件，按年/月归档，重大事件提炼大事记 | DF Legends Mode |

数据只存一份全量事件流，视角 = 过滤规则（见 §6.3）。

### 2.2 涌现轨道（涌现的上限）

世界演化的"骨架"：每根轨道有明确阶段、跃迁门槛、跃迁代价。涌现故事 = 轨道交错。

| 轨道 | 阶段 | 跃迁 | 代价/张力 |
|---|---|---|---|
| 境界 | 炼气1-9→筑基→金丹→元婴→化神 | 突破（材料+资质+机缘） | 失败→重伤/寿元损耗 |
| 实力 | 功法/装备/法宝/斗法胜败 | 获得/被夺 | 生死、江湖地位 |
| 社会 | 散修→入宗→弟子→长老→宗主 | 声望/举荐 | 宗门恩怨、门户之见 |
| 关系 | 陌路→相识→好友/道侣/师徒→恩仇 | 事件沉淀，双向演化 | 背叛、复仇 |
| 世界 | 和平→乱世→大争→天道量劫 | 世界事件驱动 | 天灾、异宝出世 |
| 经济 | 灵石/资源积累 | 坊市/俸禄/机缘 | 破产、被劫 |
| 寿元 | 寿命硬约束 | 延寿/突破续命 | 与时间赛跑（修仙特色引擎） |

设计原则：**轨道交错产生故事**（突破缺资源→坊市→遇奇遇→结仇→寻仇→成名）。

### 2.3 规则交互

有趣来自系统之间咬合，不是事件数量。每个系统（突破/经济/关系/地图/奇遇）都改变世界状态，状态触发后续规则。

### 2.4 因果链

事件之间用 `relatedEventIds` 串联成"故事线"。例：突破失败 → 寿元迫近 → 寻机缘 → 破境 → 渡劫成功 → 名动一方。

### 2.5 叙事化（文字游戏的结构性优势）

- 事件描述 = 模板 + 真实实体变量（`{npc} 于 {location} 购得 {item}`）
- 传闻系统：重大事件按半径扩散成"江湖传闻"（沉浸视角的信息来源）
- 编年史/生平 = 日志的查询视图，不是预设

## 3. 数据模型

### 3.1 BigEventLog 扩展（contracts/event-log.ts）

```ts
interface BigEventLog {
  id: string;
  year: number;
  month: number;
  category: EventCategory;   // 现有 7 类 + 新增 crafting / breakthrough
  title: string;
  description: string;
  isMajorEvent: boolean;     // 兼容保留，逐步迁移到 severity
  involvedCharacterIds: string[];
  // ── 新增 ──
  locationId?: string;        // 真实地点引用
  severity: 'minor' | 'normal' | 'major' | 'epoch';
  visibility: 'local' | 'regional' | 'world';  // 传播半径 → 沉浸视角可见性
  source: 'engine' | 'player' | 'ai';
  narrative?: string;         // AI 文学化描述（增强层，不改事实）
  relatedEventIds?: string[]; // 因果链
}
```

### 3.2 NpcRecord（NPC 持久化档案，存于 WorldState.npcs）

```ts
interface NpcRecord {
  // 身份
  id: string;
  name: string;
  gender: 'Male' | 'Female';
  personalityId: string;
  origin: { type: '散修' | '世家' | '宗门' | '遗孤'; backgroundStoryId?: string };

  // 命格（气运之子）
  destiny: {
    tier: 'common' | 'talented' | 'prodigy' | 'legendary'; // 天骄≈prodigy，概率 ~0.3%
    luck: number;        // 加权奇遇/突破/死劫概率
    hidden: boolean;     // 前期不暴露，事件中逐渐显露
    epithet?: string;    // 江湖绰号（"云中仙"）
  };

  // 状态
  realm: RealmFullPath;
  soulState: SoulState;
  locationId?: string;
  factionId?: string;
  spiritRoot: SpiritRoot;
  attributes: { physique: number; comprehension: number; perception: number; agility: number; luck: number; charm: number };
  lifespan: { age: number; maxLifespan: number };
  skillIds: string[];

  // 出生与死亡（生平端点）
  birthYear: number;
  birthMonth: number;
  deathYear?: number;
  deathMonth?: number;
  causeOfDeath?: string;

  // 关系（事件沉淀型）
  relations: Record<string, RelationEntry>;

  // 生平（引擎聚合 + AI 增强）
  biography: {
    milestones: { eventId: string; year: number; month: number; title: string; realm: string }[];
    summary: string;    // 引擎一句话概览
    narrative?: string; // AI 文学化生平
  };

  lastUpdate: { year: number; month: number };
}

interface RelationEntry {
  type: 'master-disciple' | 'spouse' | 'dao-companion' | 'friend' | 'rival' | 'enemy' | 'clan' | 'benefactor' | 'debtor';
  bond: number;        // -100..100（爱恨）
  trust: number;       // 0..100
  events: string[];    // 关系事件链（结仇/报恩/倾心/背叛...）
  changedAt: { year: number; month: number };
}
```

### 3.3 世界状态扩展

```ts
interface WorldState {
  // ...现有字段
  npcs: Record<string, NpcRecord>;   // NPC 持久化档案
}
```

## 4. 月度 tick 规则集（无 AI 世界推进）

WorldEngine.step() 逐月执行（顺序固定，保证可复现）：

1. **修炼与突破**：每个 NPC 修为增长（灵根×悟性×季节）；境界跃迁判定——成功率 = 资质 × 资源 × 气运加权；失败→重伤/寿元损耗；成功且跨大境界→`major` 事件
2. **云游**：概率移动（目的地随机/投奔关系），更新 locationId
3. **社交相遇**：同地点 NPC 相遇→关系演化（初识/论道/交易/结仇）
4. **寻仇**：enemy 关系→概率触发斗法（胜负按实力轨道）
5. **奇遇**：气运加权触发（洞府/天材地宝/遗迹）；触发后状态变化（资源/实力/伤愈）
6. **坊市流动**：灵石交易、突破材料流转（与玩家经济同一套数据）
7. **寿元与坐化**：寿元尽→坐化（`major` 事件）→ 概率留下遗府（新奇遇源）
8. **传闻扩散**：`regional`/`world` 事件按半径向周边地区扩散
9. **人口补充**：NPC 低于阈值→`NPCGenerator.generate` 出世（复用 T3 成果）
10. **世界事件**：天灾/异宝出世/宗门大比/天道量劫倒计时

规则统一：**一切状态变化必须 emit 事件**（可测试约束）。

## 5. 事件日志架构

- **EventCollector**：engine 统一事件出口，`TimeAdvanceService.advance` 聚合世界事件 + 玩家生命周期事件 + 经济事件
- **UI 只导入展示**，不手拼事件文本
- **模板库**：`EventTemplates`（category/key/pattern/severity/visibility），变量绑定真实实体
- **编年史聚合服务**：按 (year, month) 分组；major/epoch 提炼"年度大事记"

## 6. 双视角实现

### 6.1 沉浸视角（玩家）

可见 = 玩家直接参与（involvedCharacterIds 含玩家）OR（事件 location 在玩家当前地域 OR visibility=regional/world 且影响力够大）。

信息不对称产出：传闻（他人故事以"听说"口吻出现）、神秘感、被卷入感。

### 6.2 上帝视角（编年史）

全量事件按年/月归档；NPC 生平（按 involvedCharacterIds 反查 + NpcRecord.biography）；按地点/人物/类别检索。

### 6.3 过滤规则

```ts
function visibleToPlayer(event: BigEventLog, player: Character): boolean {
  if (event.involvedCharacterIds.includes(player.id)) return true;
  if (event.visibility === 'world' && event.severity >= 'major') return true;
  if (event.visibility === 'regional' && event.severity >= 'normal') return true;
  if (event.locationId && isNearby(event.locationId, player.locationId)) return true;
  return false;
}
```

## 7. 传奇涌现机制

1. **出生定潜质**：destiny 概率掷出，命运不预设
2. **事件加权**：luck 影响奇遇/突破/死劫
3. **成名正反馈**：major 事件积累→声望→绰号→更多关注→更"传奇"
4. **世界背景先行**：开局预生成若干传奇 NPC 简化生平（含宗门恩怨），世界一开局就有沉淀

## 8. AI 增强层（预留）

- 日志序列化为 AI 上下文（时间线 + 实体引用）
- LLM 只增强：narrative（文学化描述）、对话生成、生平总结
- **世界事实由引擎保证，AI 不虚构 id/数值**

## 9. 实施路线（修订版）

| 阶段 | 内容 | 交付 | 退出标准 |
|---|---|---|---|
| 0 | NPC 档案持久化（契约+WorldEngine 恢复/写回+存档打通） | NPC 跨推进/跨会话不丢 | 推进→存档→读档 NPC 连续；事件引用真实实体 |
| 1a | 纯数值规则（突破/寿元/奇遇/云游/人口补充） | 世界数值自演化 | 可复现：同种子同结果（rng 注入） |
| 1b | 社交/关系演化 + 寻仇（轻量胜负判定） | NPC 关系网络 | 关系沉淀进 NpcRecord.relations |
| 2 | 事件出口（EventCollector）+ 模板库 + 传闻扩散 | 全系统事件化 | 一切状态变化必有事件（可测试约束） |
| 3 | 编年史/生平聚合 + 双视角 UI | 可读的故事 | 沉浸/上帝信息不对称 |
| 4 | AI 接口预留（上下文序列化） | 接 LLM 不重构 | 日志可序列化为 AI 上下文 |

每阶段：engine 测试（重点是可复现性）+ typecheck + 独立提交（可单独回退）。

## 10. 验收标准

- 推进 50 年，上帝视角编年史可读出连贯故事：
  "X 年，散修张三突破金丹，名动一方；X+3 年，张三与李四结仇；X+5 年，张三陨落于秘境"
- 沉浸视角与上帝视角信息不对称（玩家不知道的传闻逐渐"听说"）
- 同种子下世界演化完全可复现（测试可断言）
- 玩家行为与 NPC 世界事件相互可见（玩家参与的事件在编年史可查）

## 11. 实施风险与对策

| 风险 | 等级 | 对策 |
|---|---|---|
| 月度规则与战斗/经济系统咬合（寻仇→斗法） | 高 | 1b 用轻量胜负判定（实力对比+运气），不接完整 CombatEngine；后续可升级 |
| Math.random 确定性（同种子同结果） | 中 | tick 规则集从设计即注入 rng（createSeededRng），可复现测试断言 |
| 800 NPC 存档体积 | 中 | 两层结构：WorldState.npcs 存精简 NpcRecord，遭遇时展开完整 Character |
| 现有 world-engine 测试假设"空开局" | 中 | 阶段 0 重写为"持久化语义"测试（推进→重建引擎→NPC 仍在） |
| 规则风暴/叙事重复 | 低 | 模板库规模 + 变量组合 + 因果链；验收标准卡"连贯故事" |
| 存档 schema 演进 | 低 | SaveMigrationRunner 已存在，注册 v1→v2 迁移补 npcs 字段 |
