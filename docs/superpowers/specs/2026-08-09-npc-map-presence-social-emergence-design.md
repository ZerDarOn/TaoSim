# NPC 地图呈现与社交涌现系统设计

日期：2026-08-09
状态：待评审

## 1. 背景与目标

### 1.1 问题

当前世界涌现模拟器存在两个核心缺口（设计文档 `docs/world-emergence-design.md` §1.1.2 G5 已诊断）：

1. **NPC 在地图上零呈现**：`MapPanel.vue` 只渲染玩家（黄圆 + "我"字），`WorldState.npcs` 的世界 NPC 无空间标记。地图遭遇用 `NPCGenerator.generate(tier, Date.now())` 临时生成，**不在世界档案中**——等于存在两套互不相干的 NPC 种群。
2. **社交系统不完整**：已有 `socialEncounter`（初识/结仇/论道）和 `tryFeud`（寻仇斗法），但缺少 RimWorld 级社交涌现的关键层（兼容性基底、嫉妒追捧、情绪级联），无法产生"天才遭妒→恩怨链"这类修仙核心叙事。

### 1.2 目标

- **地图呈现**：NPC 在地图上可见，全图可定位，双层呈现（聚合标记 + 细划标记），规模可达档案层 1w + 氛围层百万级计数
- **空间打通**：NPC 位置与 hex 网格建立映射，NPC 状态机移动（驻留↔游历↔闭关）
- **三层人口**：氛围层（凡人/散修计数）→ 档案层（有名有姓修士）→ 精英层（传奇/大能），含升格/降格通道
- **社交涌现**：补齐兼容性（道缘）、嫉妒追捧、心境情绪、日常互动细化、流言级联五层

### 1.3 非目标

- 不做像素小人/精灵动画（现有 SVG 渲染基础上增量）
- 不做实时寻路（月度 tick 离散位置更新）
- 不做多人联机

## 2. 现状与关键约束

### 2.1 地图渲染

- `MapPanel.vue` 用 **SVG** 渲染（Region 层六边形 + Cosmos/Continent 层圆节点），非 canvas
- `HEX_SIZE = 18`、`SVG_W = 760`、`SVG_H = 620`（L144-146），20×20 网格
- 玩家位置：黄圆（`r=7`）+ "我"字（L661-665），来源 `mapStore.hexPos`

### 2.2 空间体系（三套坐标，链路半通）

```
玩家：hexPos (q,r) ←→ currentNodeId（地标）←→ activeVenueId（场所）
NPC ：locationId（venue id，如 VENUE_QINGYUN_HALL）
```

NPC 虽只有 venue id，但换算链路存在：
- `VENUE_CATALOG` 每个场所挂 `nodeId`
- `PRESET_MAP` 节点有 `coordinates {x,y}`
- `nodeToGrid`（hex-overworld-engine.ts L79-84）做坐标→hex 换算
- `findLandmarkPos`（L373-378）反向查

### 2.3 NPC 数据结构

- `NpcRecord`（contracts/npc-record.ts L84-142）位置字段仅 `locationId?: string`（L96，注释写"地图节点 id"但实际存 venue id）和 `factionId?: string`（L98）
- **无 hexPos / continentId 字段**
- `relations: Record<string, RelationEntry>` 已有 bond/trust 双数值 + type（friend/enemy/spouse/rival）+ events

### 2.4 社交系统现状

- `socialEncounter`（world-social-rules.ts）：初识/结仇/论道，bond 增减、关系类型切换
- `tryFeud`（world-social-rules.ts）：仇敌斗法，面板结算
- `seekPartner`（world-motivation.ts）：求偶→道侣→子嗣
- **缺少**：兼容性基底、嫉妒/追捧、心境情绪、日常互动细化、流言级联

### 2.5 性能基准

- 现有引擎实测：50 年 × 数百 NPC，月 tick 毫秒级（world-emergence-validation.test.ts 验证）
- 目标：档案层 1w NPC，月 tick < 100ms

## 3. 设计

### 3.1 三层人口模型

```
氛围层（凡人 + 低阶散修，按格/节点聚合计数）
   │ 灵根筛选 / 宗门收徒 / 自发觉醒 / 玩家干预
   ▼ 升格
档案层（有名有姓修士，WorldState.npcs，1w 级）
   │ 修炼突破（金字塔漏斗）
   ▼
精英层（传奇/大能，深度模拟，数十~数百）
```

#### 3.1.1 氛围层：PopulationGrid

独立数据结构，**不进 `WorldState.npcs`**：

```ts
// packages/contracts/src/population.ts（新文件）
export interface HexPopulation {
  mortals: number;        // 凡人计数
  lowCultivators: number; // 炼气期散修计数（不进档案的背景板）
  spiritRootPotential: number; // 有灵根潜质的凡人占比（0~1）
}

export type PopulationGrid = Record<string, HexPopulation>; // key: "q,r"
```

- 存储于 `WorldState.populationGrid?: PopulationGrid`
- 月度 tick 更新：凡人自然增长 + 灵根筛选产生升格候选
- 渲染：上帝视角聚合标记读取此表

#### 3.1.2 升格机制（氛围层→档案层）

每月度 tick，按以下概率触发升格：

| 触发条件 | 基础概率 | 修正 |
|---|---|---|
| 有灵根潜质的凡人 | 0.001/月 | × 灵根品质系数（天灵根×10，地灵根×5，人灵根×1） |
| 宗门驻地格的凡人 | 0.01/月 | × 宗门规模系数（宗门弟子越多，收徒越频繁） |
| 玩家干预（收徒/点化） | 1.0 | 直接送入档案 |

> 注：氛围层凡人是"背景板计数"，不是档案层 NPC。宗门收徒是从氛围层凡人中选灵根好的升格为档案 NPC，不涉及已有档案 NPC。

升格时：
1. 从氛围层扣减计数（`mortals--`）
2. 生成完整 `NpcRecord` 进 `WorldState.npcs`
3. 赋初始 `locationId`（升格所在场所）、`realm = 'QiRefinement_1'`
4. 生成兼容性基底（见 §3.3.1）

#### 3.1.3 降格/清理

- 档案 NPC 陨落且无传奇事迹 → 超过宽限期（`OBLIVION_GRACE_YEARS`）从档案除名（已有机制）
- 不回退到氛围层（陨落就是陨落，不复活为计数）

### 3.2 空间打通与移动模型

#### 3.2.1 位置字段扩展

`NpcRecord` 新增：

```ts
// contracts/npc-record.ts 扩展
hexPos?: { q: number; r: number };     // 当前 hex 坐标（驻留/游历时）
moveState?: 'resident' | 'wandering' | 'secluded'; // 移动状态机
moveTarget?: { q: number; r: number };  // 游历目标（wandering 时）
secludeMonths?: number;                 // 闭关剩余月数（secluded 时）
```

- `resident`：驻留（在场所/宗门/城市），hexPos = 场所对应 hex
- `wandering`：游历（沿节点图移动），每月 hexPos 向 moveTarget 移动一步
- `secluded`：闭关（不动，出关时修为增长），secludeMonths 递减

#### 3.2.2 移动状态机转换

```
                    ┌─ 月度 tick 概率触发 ──→ wandering
                    │                         │
resident ───────────┤                         │ 到达目标 / 月度概率归巢
                    │                         ▼
                    └─ 修炼瓶颈触发 ──→ secluded ──→ resident
                                               (secludeMonths 归零)
```

转换概率（性格 + 志向驱动）：
- `resident → wandering`：每月 0.05（`aspiration = 'wander'` 时 ×3，性格好斗×2）
- `wandering → resident`：到达目标 或 每月 0.2 归巢
- `resident → secluded`：修为满 80% 且 `aspiration = 'seekDao'` 时每月 0.1
- `secluded → resident`：`secludeMonths` 归零（初始 12-36 月，悟性越高越短）

#### 3.2.3 venue→hex 换算层

新增 `packages/engine/src/overworld/npc-spatial.ts`：

```ts
/** NPC locationId（venue）→ hex 坐标 */
export function npcHexPos(locationId: string, grid: WorldHexGrid): { q: number; r: number } | null {
  const venue = getVenue(locationId);
  if (!venue?.nodeId) return null;
  return findLandmarkPos(grid, venue.nodeId);
}

/** 聚合同格 NPC（用于档案层聚合标记 + 社交局部化） */
export function npcSpatialIndex(npcs: Record<string, NpcRecord>, grid: WorldHexGrid): Map<string, string[]>;
```

### 3.3 社交涌现五层

#### 3.3.1 P0：兼容性基底（道缘/魔缘）

`NpcRecord` 新增：

```ts
affinityMatrixSeed?: number; // 出生时随机生成 [0,1)，用于确定性计算与任意 NPC 的兼容性
```

兼容性计算（纯函数，不存全表）：

```ts
// packages/engine/src/world/affinity.ts（新文件）
export function affinity(a: NpcRecord, b: NpcRecord): number {
  // 用两个 seed 确定性生成 [-1, 1] 的兼容性值
  // 正值=道缘（天生同道），负值=魔缘（天生相克）
  // simpleHash：复用 seeded-rng.ts 的确定性 hash 思路（输入→[0,1)）
  const hash = simpleHash(`${a.affinityMatrixSeed}|${b.affinityMatrixSeed}`);
  return (hash - 0.5) * 2; // [0,1) → [-1,1)
}

// simpleHash 实现（放在同文件，避免循环依赖）
function simpleHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000; // [0,1)
}
```

- 社交基底 opinion = `affinity * 15`（道缘 +15 起步，魔缘 -15 起步）
- **不可修改**（命运感），但可被后天事件覆盖

#### 3.3.2 P0：嫉妒追捧

资质悬殊时触发 opinion 偏移。每月度 tick，同场所/同格 NPC 之间：

```ts
// world-social-rules.ts 扩展
function tryJealousy(adjas: NpcRecord[], target: NpcRecord, rng: () => number): void {
  const targetGrade = spiritRootGrade(target); // 天/地/玄/黄
  for (const other of adjas) {
    if (spiritRootGrade(other) >= targetGrade) continue; // 同级或更高不嫉妒
    if (other.personalityId !== 'jealous' && rng() > 0.02) continue; // 非嫉妒性格低概率
    // 嫉妒触发：other 对 target opinion -10~-20
    adjustRelation(other, target.id, { bondDelta: -15, event: '心生嫉妒' });
  }
}
```

- 天灵根/仙姿 → 追捧（opinion +10）+ 嫉妒（性格"嫉妒"者 opinion -15）
- 追捧对所有同级或低级生效；嫉妒只对性格匹配者生效

#### 3.3.3 P1：心境情绪

`NpcRecord` 新增：

```ts
mood?: number; // 心境值 [0, 100]，默认 50（平静）
```

心境影响因素：
- 社交正事件（论道/赠丹/援手）：+5~+15
- 社交负事件（侮辱/嫉妒/寻仇落败）：-10~-20
- 突破成功：+20；突破失败/走火：-30
- 闭关出关：+10
- 境界压制（被高阶欺辱）：-15

低心境后果（mood < 30）：
- 概率触发负向行为（挑衅/叛出宗门/走火入魔）
- 修炼效率下降

#### 3.3.4 P1：日常互动细化

扩展 `socialEncounter` 的互动类型：

| 互动 | 触发条件 | opinion 效果 |
|---|---|---|
| 闲聊 | 同场所默认 | +2/+3 |
| 讥讽 | opinion < 0 或性格"刻薄" | -8，可能触发斗法 |
| 切磋 | 同境界+关系≥friend | +5，双方获经验 |
| 赠丹 | 关系≥friend + 有丹药 | +15 |
| 论道（已有） | 悟性悬殊 | +经验 |

#### 3.3.5 P2：流言级联

opinion 恶化到阈值（bond < -40）时，NPC 在场所内散播流言：

```ts
function spreadRumor(hater: NpcRecord, target: NpcRecord, sameLocationNpcs: NpcRecord[]): void {
  for (const listener of sameLocationNpcs) {
    if (listener.id === target.id || listener.id === hater.id) continue;
    // 流言：listener 对 target opinion -3~-5（小幅，但累积）
    adjustRelation(listener, target.id, { bondDelta: -4, event: `听闻${hater.name}非议` });
  }
}
```

### 3.4 地图呈现（双层）

#### 3.4.1 上帝视角：聚合标记

- 低缩放级别：每格显示**人数/热点**（氛围层计数 + 档案层人数合计）
- 颜色编码：凡人灰、散修青、修士蓝、高阶金、传奇紫
- 缩放下钻：放大到一定级别，聚合标记细化为**档案层单个 NPC 标记**
- 性能保护：单屏标记 > 500 时自动降级回聚合

#### 3.4.2 沉浸视角：附近精细标记

- 玩家所在格 + 邻近 1 格的档案 NPC 显示为**人形符号 + 姓名标签**
- 距离 > 1 格的 NPC 不可见（修仙的神秘感）
- 符号样式：按境界分色（炼气青、筑基蓝、金丹金、元婴紫）
- 点击标记 → 弹出 NPC 简介卡（名称/境界/关系/传闻），可选"搭话"进入社交

#### 3.4.3 渲染实现

- 复用 `MapPanel.vue` SVG 渲染，新增 NPC 标记图层（`<g class="npc-layer">`）
- 聚合标记：`<circle r="人数缩放" fill="境界色" />` + `<text>人数</text>`
- 精细标记：`<path d="人形SVG路径" />` + `<text>姓名</text>`
- 缩放监听：watch `mapStore.zoom`，切换聚合/精细

### 3.5 空间局部化（性能保障）

社交/寻仇等 O(n²) 操作限制为**同格内**：

```ts
// 每月度 tick
const spatialIndex = npcSpatialIndex(state.npcs, grid); // Map<"q,r", npcId[]>
for (const [hexKey, npcIds] of spatialIndex) {
  if (npcIds.length < 2) continue;
  // 只在同格 NPC 之间做社交配对（samplePairs 已有）
  const pairs = samplePairs(npcIds, rng, Math.floor(npcIds.length / 2));
  for (const [aId, bId] of pairs) socialEncounter(npcs[aId], npcs[bId], now, rng);
}
```

- 同格人数 > 50 时采样配对（不全配），避免极端聚集
- 宗门/城市聚集场所的采样策略可在后续优化

## 4. 分阶段实施（每阶段可回退）

### 第一阶段：空间链路 + 呈现原型（验证地图）

**范围**：
- `NpcRecord` 加 hexPos/moveState 字段
- `npc-spatial.ts` 换算层
- `MapPanel.vue` NPC 标记图层（聚合 + 附近精细）
- 禁用 `Date.now()` 临时生成，遭遇从世界档案取

**验证标准**：
- 地图上能看到 NPC 分布，缩放流畅
- 玩家移动时邻近格 NPC 标记出现/消失
- 遭遇的 NPC 在世界档案中可查

**回退**：只影响呈现层，回退后地图恢复只显示玩家

### 第二阶段：社交增量（验证涌现）

**范围**：
- P0 兼容性（affinityMatrixSeed + affinity 纯函数）
- P0 嫉妒追捧（tryJealousy）
- 升格机制（氛围层→档案层）

**验证标准**：
- 世界跑 50 年，天才 NPC（天灵根）是否自然产生恩怨链
- 档案层人口稳定在目标规模（不爆炸不枯竭）

**回退**：关掉嫉妒/兼容性（配置开关），社交退化回现状

### 第三阶段：按需扩展

**范围**：
- P1 心境情绪（mood 字段 + 影响）
- P1 日常互动细化
- P2 流言级联

**验证标准**：每层加完跑一次 5 种子质量评估（world-emergence-validation）

**回退**：每层独立可关

## 5. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 社交 O(n²) 在 1w 档案 NPC 时局部化失效 | 中 | 月 tick 卡顿 | 空间局部化 + 同格采样配对；压测 |
| 金字塔漏斗升格概率失衡 | 高 | 修士太多/太少 | 配置驱动概率，边跑边调 |
| 心境情绪系统过度设计 | 中 | 做 P1 发现有些层没必要 | 分阶段，每阶段可停 |
| SVG 标记 > 500 卡顿 | 中 | 上帝视角卡 | 自动降级回聚合 |
| 兼容性纯函数不够随机 | 低 | 社交基底有规律 | 用更好的 hash 函数 |

## 6. 配置开关（所有新机制可独立启停）

```ts
// packages/engine/src/world/world-config.ts（新文件或扩展）
export interface WorldEmergenceConfig {
  populationGridEnabled: boolean;    // 氛围层
  ascensionEnabled: boolean;         // 升格机制
  affinityEnabled: boolean;          // 兼容性
  jealousyEnabled: boolean;          // 嫉妒追捧
  moodEnabled: boolean;              // 心境情绪
  rumorCascadeEnabled: boolean;      // 流言级联
  spatialOptimization: boolean;      // 空间局部化社交
}
```

默认全开，调试/回退时可按层关闭。

## 7. 测试策略

### 7.1 单元测试

- `npc-spatial.test.ts`：venue→hex 换算、空间索引
- `affinity.test.ts`：兼容性纯函数（确定性、范围）
- `population-grid.test.ts`：氛围层增减、升格触发
- `jealousy.test.ts`：嫉妒触发条件、opinion 偏移

### 7.2 集成测试

- 扩展 `world-engine.test.ts`：NPC 有 hexPos、移动状态机转换
- 扩展 `world-social-rules.test.ts`：兼容性影响社交基底、嫉妒触发

### 7.3 涌现质量验证

- 扩展 `world-emergence-validation.test.ts`：
  - 档案层人口规模达标（目标 1w 级）
  - 天才 NPC 产生恩怨链的数量
  - 月 tick 性能 < 100ms

## 8. 后续优化空间

- 氛围层可升级为"轻量 NPC"（有灵根/年龄，无社交）
- 兼容性可扩展为"道侣兼容性"（影响 seekPartner 成功率）
- 心境可接入"心魔"机制（低心境长期累积→走火入魔）
- 流言可按"传闻可见性"扩散（已有 chronicle 系统）
- 移动状态机可扩展"护送""追杀"等临时状态
