# NPC 地图呈现与社交涌现 — 实施计划（第一阶段 + 第二阶段 P0）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通 NPC 空间链路（venue→hex），让 NPC 在地图上可见（聚合 + 附近精细标记），并接入氛围层人口与升格机制，最后补齐社交涌现 P0（兼容性基底 + 嫉妒追捧）。

**Architecture:** 引擎侧新增 `npc-spatial.ts`（空间换算/索引）、`population.ts`（氛围层计数与升格）、`affinity.ts`（兼容性纯函数）；扩展 `NpcRecord`（hexPos 等可选字段）与 `WorldState`（populationGrid 可选字段）；world-engine 月度 tick 集成 hexPos 维护、氛围层增长与升格；UI `MapPanel.vue` 增加 NPC 标记图层。全部新字段可选，旧存档兼容。

**Tech Stack:** TypeScript monorepo（packages/contracts + packages/engine vitest）、Vue 3 + Pinia（apps/taosim-ui）、SVG 渲染。

---

## 文件结构

**新建（engine）：**
- `packages/engine/src/overworld/npc-spatial.ts` — venue→hex 换算、空间索引、hexPos 维护纯函数
- `packages/engine/src/world/population.ts` — 氛围层初始化/增长/升格纯函数
- `packages/engine/src/world/affinity.ts` — 兼容性纯函数（第二阶段 P0）

**新建（contracts）：**
- `packages/contracts/src/population.ts` — HexPopulation / PopulationGrid 类型

**新建（tests）：**
- `packages/engine/src/__tests__/npc-spatial.test.ts`
- `packages/engine/src/__tests__/population.test.ts`
- `packages/engine/src/__tests__/affinity.test.ts`

**修改：**
- `packages/contracts/src/npc-record.ts` — NpcRecord 加 hexPos/moveState/affinityMatrixSeed
- `packages/contracts/src/world-state.ts` — WorldState 加 populationGrid
- `packages/contracts/src/index.ts` — 导出 population 类型
- `packages/engine/src/world/world-engine.ts` — tick 集成：hexPos 维护、氛围层增长、升格、（P0）嫉妒
- `packages/engine/src/world/world-social-rules.ts` — （P0）tryJealousy 扩展
- `packages/engine/src/overworld/hex-overworld-engine.ts` — 导出 findLandmarkPos 已存在，无需改
- `apps/taosim-ui/src/game/panels/MapPanel.vue` — NPC 标记图层

---

### Task 1: contracts 扩展（NpcRecord 位置/亲和字段 + WorldState populationGrid）

**Files:**
- Modify: `packages/contracts/src/npc-record.ts`
- Modify: `packages/contracts/src/world-state.ts`
- Create: `packages/contracts/src/population.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: 新建 `packages/contracts/src/population.ts`**

```ts
// ============================================================
// 氛围层人口（§spec 3.1：凡人/散修背景板计数，不进 WorldState.npcs）
// ============================================================

/** 单格人口计数（key: "q,r"） */
export interface HexPopulation {
  /** 凡人计数（背景板，无档案） */
  mortals: number;
  /** 炼气期散修计数（不进档案的背景板修士） */
  lowCultivators: number;
  /** 有灵根潜质的凡人占比 0~1（升格候选池） */
  spiritRootPotential: number;
}

export type PopulationGrid = Record<string, HexPopulation>;
```

- [ ] **Step 2: `packages/contracts/src/npc-record.ts` 在 `NpcRecord` 接口末尾（`lastUpdate` 行后）加可选字段**

```ts
  /** 当前 hex 坐标（地图呈现 §spec 3.2；resident=场所对应格，wandering=移动中坐标） */
  hexPos?: { q: number; r: number };
  /** 移动状态机（§spec 3.2.2）：驻留 / 游历 / 闭关 */
  moveState?: 'resident' | 'wandering' | 'secluded';
  /** 游历目标格（wandering 时；到达即归巢） */
  moveTarget?: { q: number; r: number };
  /** 闭关剩余月数（secluded 时递减） */
  secludeMonths?: number;
  /** 兼容性种子（§spec 3.3.1 道缘/魔缘基底；出生时生成 [0,1)） */
  affinityMatrixSeed?: number;
```

- [ ] **Step 3: `packages/contracts/src/world-state.ts` 在 `WorldState` 接口末尾（`nodeSpiritQi` 行后）加可选字段**

```ts
  /** 氛围层人口（§spec 3.1；key: "q,r"；可选以兼容旧存档） */
  populationGrid?: import('./population.js').PopulationGrid;
```

- [ ] **Step 4: `packages/contracts/src/index.ts` 导出 population 类型（若 index 是显式导出列表，追加一行）**

```ts
export type { HexPopulation, PopulationGrid } from './population.js';
```

- [ ] **Step 5: 运行 engine typecheck 确认无破坏**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx tsc --noEmit`
Expected: PASS（新字段全 optional，旧代码不受影响）

- [ ] **Step 6: Commit**

```bash
git add packages/contracts/src/npc-record.ts packages/contracts/src/world-state.ts packages/contracts/src/population.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): NpcRecord 空间/亲和字段 + WorldState 氛围层人口"
```

---

### Task 2: engine `npc-spatial.ts`（venue→hex 换算 + 空间索引 + hexPos 维护）

**Files:**
- Create: `packages/engine/src/overworld/npc-spatial.ts`
- Test: `packages/engine/src/__tests__/npc-spatial.test.ts`

- [ ] **Step 1: 写失败测试 `npc-spatial.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { NpcRecord } from '@taosim/contracts';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';
import { npcHexPos, npcSpatialIndex, deriveNpcHexPos } from '../overworld/npc-spatial.js';

const grid = generateWorldGrid('CONT_EAST');

function makeNpc(overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: 'NPC_1', name: '散修·甲', gender: 'Male', personalityId: 'neutral',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
    realm: 'QiRefinement_3', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 240 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [], birthYear: 1, birthMonth: 1,
    relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    ...overrides,
  };
}

describe('npcHexPos（venue→node→hex 换算）', () => {
  it('场所可换算到其节点对应 hex', () => {
    // VENUE_QINGYUN_HALL → NODE_SECT_QINGYUN (400,250) → 固定网格坐标
    const pos = npcHexPos('VENUE_QINGYUN_HALL', grid);
    expect(pos).not.toBeNull();
    const hex = grid.hexes.get(`${pos!.q},${pos!.r}`);
    expect(hex?.landmarkId).toBe('NODE_SECT_QINGYUN');
  });

  it('无场所返回 null', () => {
    expect(npcHexPos(undefined, grid)).toBeNull();
  });

  it('未知场所返回 null', () => {
    expect(npcHexPos('VENUE_NOT_EXIST', grid)).toBeNull();
  });
});

describe('npcSpatialIndex（同格聚合）', () => {
  it('同场所 NPC 落入同格索引', () => {
    const a = makeNpc({ id: 'NPC_A', locationId: 'VENUE_QINGYUN_HALL' });
    const b = makeNpc({ id: 'NPC_B', locationId: 'VENUE_QINGYUN_TRAINING' }); // 同节点不同场所
    const c = makeNpc({ id: 'NPC_C', locationId: 'VENUE_TIANJI_TAVERN' });
    const index = npcSpatialIndex({ A: a, B: b, C: c }, grid);
    // A、B 都在青云宗节点格
    const qingyunPos = npcHexPos('VENUE_QINGYUN_HALL', grid)!;
    const key = `${qingyunPos.q},${qingyunPos.r}`;
    const list = index.get(key);
    expect(list?.map(n => n.id).sort()).toEqual(['NPC_A', 'NPC_B']);
  });

  it('hexPos 优先于 locationId 换算（wandering 时位置独立）', () => {
    const npc = makeNpc({
      id: 'NPC_W', locationId: 'VENUE_QINGYUN_HALL',
      hexPos: { q: 5, r: 5 }, moveState: 'wandering',
    });
    const index = npcSpatialIndex({ W: npc }, grid);
    expect(index.get('5,5')?.length).toBe(1);
    expect(index.get(`${npcHexPos('VENUE_QINGYUN_HALL', grid)!.q},${npcHexPos('VENUE_QINGYUN_HALL', grid)!.r}`)).toBeUndefined();
  });

  it('陨落 NPC 不入索引', () => {
    const dead = makeNpc({ id: 'NPC_D', locationId: 'VENUE_QINGYUN_HALL', soulState: 'RemnantSoul' });
    const index = npcSpatialIndex({ D: dead }, grid);
    expect(index.size).toBe(0);
  });
});

describe('deriveNpcHexPos（月度维护：无 locationId 时向目标漂移）', () => {
  it('有 locationId：返回场所对应格', () => {
    const pos = deriveNpcHexPos({ q: 0, r: 0 }, 'VENUE_QINGYUN_HALL', undefined, grid);
    expect(grid.hexes.get(`${pos.q},${pos.r}`)?.landmarkId).toBe('NODE_SECT_QINGYUN');
  });

  it('wandering 且无目标：向 moveTarget 移动一步，到达后归巢', () => {
    // moveTarget 是玩家所在格
    const from = { q: 5, r: 5 };
    const pos = deriveNpcHexPos(from, undefined, { q: 6, r: 5 }, grid);
    expect(pos).toEqual({ q: 6, r: 5 }); // 一步到达
  });

  it('wandering 有目标但需多步：仅移动一步', () => {
    const from = { q: 3, r: 3 };
    const target = { q: 6, r: 3 };
    const pos = deriveNpcHexPos(from, undefined, target, grid);
    // 应移动 1 格（沿直线方向），不能一步跳 3 格
    const dist = (Math.abs(pos.q - from.q) + Math.abs(pos.r - from.r));
    expect(dist).toBeLessThanOrEqual(1);
    expect(pos).not.toEqual(target);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/npc-spatial.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `npc-spatial.ts`**

```ts
// ============================================================
// NPC 空间换算（§spec 3.2：venue→node→hex + 空间索引 + hexPos 维护）
// ============================================================

import type { NpcRecord } from '@taosim/contracts';
import { getVenue } from '../overworld/map-catalog.js';
import { findLandmarkPos, getHexNeighbors, type WorldHexGrid } from '../overworld/hex-overworld-engine.js';

/** venue id → hex 坐标（venue→node→坐标换算→grid 地标反查） */
export function npcHexPos(
  locationId: string | undefined,
  grid: WorldHexGrid,
): { q: number; r: number } | null {
  if (!locationId) return null;
  const venue = getVenue(locationId);
  if (!venue?.nodeId) return null;
  return findLandmarkPos(grid, venue.nodeId);
}

/** 同格空间索引（社交局部化/聚合标记的数据基础） */
export function npcSpatialIndex(
  npcs: Record<string, NpcRecord>,
  grid: WorldHexGrid,
): Map<string, NpcRecord[]> {
  const index = new Map<string, NpcRecord[]>();
  for (const npc of Object.values(npcs)) {
    if (npc.soulState !== 'Active') continue;
    const pos = npc.hexPos ?? npcHexPos(npc.locationId, grid);
    if (!pos) continue;
    const key = `${pos.q},${pos.r}`;
    const list = index.get(key) ?? [];
    list.push(npc);
    index.set(key, list);
  }
  return index;
}

/**
 * 月度 hexPos 维护（§spec 3.2.2）：
 * - resident/secluded：位置 = 场所对应格（locationId 优先）
 * - wandering：沿 moveTarget 方向移动 1 格；到达目标后返回场所（归巢）
 * 返回更新后的 hexPos 与 moveState（由调用方写回 NpcRecord）。
 */
export function deriveNpcHexPos(
  current: { q: number; r: number } | undefined,
  locationId: string | undefined,
  moveTarget: { q: number; r: number } | undefined,
  grid: WorldHexGrid,
): { hexPos: { q: number; r: number }; moveState: 'resident' | 'wandering'; reached: boolean } {
  // 有场所 → 锚定场所格（wandering 归巢 / resident 驻留）
  if (locationId) {
    const home = npcHexPos(locationId, grid);
    if (home) return { hexPos: home, moveState: 'resident', reached: true };
  }
  // 无场所（云游/游历中）：向目标移动
  if (!current) return { hexPos: { q: 10, r: 10 }, moveState: 'wandering', reached: false };
  if (moveTarget) {
    const neighbors = getHexNeighbors(current.q, current.r);
    // 选最接近目标的相邻格
    let best = neighbors[0]!;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const n of neighbors) {
      const hex = grid.hexes.get(`${n.q},${n.r}`);
      if (!hex || hex.terrain === 'void') continue;
      const d = Math.abs(n.q - moveTarget.q) + Math.abs(n.r - moveTarget.r);
      if (d < bestDist) { bestDist = d; best = n; }
    }
    if (bestDist === 0) return { hexPos: moveTarget, moveState: 'resident', reached: true };
    return { hexPos: best, moveState: 'wandering', reached: false };
  }
  // 无目标：原地驻留
  return { hexPos: current, moveState: 'wandering', reached: false };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/npc-spatial.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/overworld/npc-spatial.ts packages/engine/src/__tests__/npc-spatial.test.ts
git commit -m "feat(engine): NPC 空间换算 npc-spatial（venue→hex + 索引 + 移动维护）"
```

---

### Task 3: engine `population.ts`（氛围层初始化 + 月度增长 + 升格候选）

**Files:**
- Create: `packages/engine/src/world/population.ts`
- Test: `packages/engine/src/__tests__/population.test.ts`

- [ ] **Step 1: 写失败测试 `population.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { PopulationGrid } from '@taosim/contracts';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';
import {
  initializePopulationGrid,
  tickPopulation,
  applyAscension,
} from '../world/population.js';

function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++] ?? 0.5;
}

const grid = generateWorldGrid('CONT_EAST');

describe('initializePopulationGrid', () => {
  it('城镇/灵脉格凡人更多，虚空/水域无凡人', () => {
    const pop = initializePopulationGrid(grid);
    // 天机城（NODE_CITY_TIANJI）对应格应为城镇
    let townKey = '';
    for (const hex of grid.hexes.values()) {
      if (hex.landmarkId === 'NODE_CITY_TIANJI') { townKey = `${hex.q},${hex.r}`; break; }
    }
    expect(townKey).not.toBe('');
    expect(pop[townKey]!.mortals).toBeGreaterThan(500);
    // 虚空格无人口
    for (const hex of grid.hexes.values()) {
      if (hex.terrain === 'void') expect(pop[`${hex.q},${hex.r}`]).toBeUndefined();
    }
  });
});

describe('tickPopulation（月度自然增长 + 降格）', () => {
  it('增长并产生升格候选（返回可升格凡人数量）', () => {
    const pop = initializePopulationGrid(grid);
    const before = Object.values(pop).reduce((s, p) => s + p.mortals, 0);
    const result = tickPopulation(pop, seqRng([0.5]), { ascensionChance: 0.01 });
    const after = Object.values(pop).reduce((s, p) => s + p.mortals, 0);
    expect(after).toBeGreaterThan(before); // 自然增长
    expect(result.ascensionCandidates).toBeGreaterThan(0); // 有候选
  });

  it('零增长配置时不产生候选', () => {
    const pop = initializePopulationGrid(grid);
    const result = tickPopulation(pop, seqRng([0.0]), { ascensionChance: 0 });
    expect(result.ascensionCandidates).toBe(0);
  });
});

describe('applyAscension（升格：扣计数 + 生成档案 NPC 数据）', () => {
  it('升格后凡人计数减一且产出候选信息', () => {
    const pop = initializePopulationGrid(grid);
    let townKey = '';
    for (const hex of grid.hexes.values()) {
      if (hex.landmarkId === 'NODE_CITY_TIANJI') { townKey = `${hex.q},${hex.r}`; break; }
    }
    const before = pop[townKey]!.mortals;
    const result = applyAscension(pop, townKey);
    expect(result).not.toBeNull();
    expect(pop[townKey]!.mortals).toBe(before - 1);
    expect(result!.hexKey).toBe(townKey);
  });

  it('凡人不足时不升格', () => {
    const pop: PopulationGrid = { '0,0': { mortals: 0, lowCultivators: 0, spiritRootPotential: 0.03 } };
    expect(applyAscension(pop, '0,0')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/population.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `population.ts`**

```ts
// ============================================================
// 氛围层人口（§spec 3.1/3.1.2）：凡人/散修背景板计数 + 升格候选
// ============================================================

import type { HexPopulation, PopulationGrid } from '@taosim/contracts';
import type { WorldHexGrid } from '../overworld/hex-overworld-engine.js';

/** 城镇/灵脉基准人口 */
const TOWN_MORTALS = 1200;
const SPIRIT_VEIN_MORTALS = 800;
const WILD_MORTALS = 200;
const TOWN_LOW_CULTIVATORS = 30;
const SPIRIT_VEIN_LOW_CULTIVATORS = 15;
const WILD_LOW_CULTIVATORS = 3;

function simpleRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** 初始化：按地形分布人口（虚空/水域无人口） */
export function initializePopulationGrid(grid: WorldHexGrid): PopulationGrid {
  const pop: PopulationGrid = {};
  const rng = simpleRng(7);
  for (const hex of grid.hexes.values()) {
    if (hex.terrain === 'void' || hex.terrain === 'water') continue;
    const isTown = hex.terrain === 'town';
    const isVein = hex.terrain === 'spirit_vein';
    pop[`${hex.q},${hex.r}`] = {
      mortals: (isTown ? TOWN_MORTALS : isVein ? SPIRIT_VEIN_MORTALS : WILD_MORTALS)
        + Math.floor(rng() * 400),
      lowCultivators: isTown ? TOWN_LOW_CULTIVATORS : isVein ? SPIRIT_VEIN_LOW_CULTIVATORS : WILD_LOW_CULTIVATORS,
      spiritRootPotential: 0.03,
    };
  }
  return pop;
}

export interface PopulationTickResult {
  /** 本月可升格候选数（由调用方逐个 applyAscension 升格为档案 NPC） */
  ascensionCandidates: number;
}

export interface PopulationTickOptions {
  /** 凡人自然月增长率（基数比例） */
  growthRate?: number;
  /** 升格概率基数（每月每格） */
  ascensionChance?: number;
}

/**
 * 月度推进：凡人自然增长 + 计算升格候选。
 * 消耗 rng：每格 1 次（升格判定）。
 */
export function tickPopulation(
  pop: PopulationGrid,
  rng: () => number,
  opts: PopulationTickOptions = {},
): PopulationTickResult {
  const growthRate = opts.growthRate ?? 0.002;
  const ascensionChance = opts.ascensionChance ?? 0.001;
  let ascensionCandidates = 0;
  for (const [key, cell] of Object.entries(pop)) {
    // 自然增长（凡人 + 低阶散修；上限防溢出）
    cell.mortals = Math.min(10000, Math.floor(cell.mortals * (1 + growthRate)) + 1);
    // 升格候选：有灵根潜质的凡人 × 概率
    const candidates = Math.floor(cell.mortals * cell.spiritRootPotential * ascensionChance);
    ascensionCandidates += candidates;
    // 每格一次 rng 消耗（保持 rng 序列稳定，供测试注入）
    rng();
  }
  return { ascensionCandidates };
}

/** 升格：从该格扣 1 名凡人，返回候选信息（调用方负责生成 NpcRecord 进档案） */
export function applyAscension(
  pop: PopulationGrid,
  hexKey: string,
): { hexKey: string; q: number; r: number } | null {
  const cell = pop[hexKey];
  if (!cell || cell.mortals < 1) return null;
  cell.mortals--;
  const [q, r] = hexKey.split(',').map(Number);
  return { hexKey, q: q!, r: r! };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/population.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/world/population.ts packages/engine/src/__tests__/population.test.ts
git commit -m "feat(engine): 氛围层人口 population（初始化/增长/升格候选）"
```

---

### Task 4: world-engine 集成（hexPos 维护 + 氛围层增长 + 升格 + NPC 初始 hexPos）

**Files:**
- Modify: `packages/engine/src/world/world-engine.ts`
- Test: `packages/engine/src/__tests__/world-engine.test.ts`

- [ ] **Step 1: 读 world-engine.ts 构造函数区（约 L1-60）与 spawnNpc（约 L1180-1240），确认注入点**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx grep -n "constructor" src/world/world-engine.ts`
Expected: 找到构造函数签名与字段

- [ ] **Step 2: 写失败测试（追加到 `world-engine.test.ts` 的 `describe('WorldEngine')` 内）**

```ts
  it('NPC 拥有 hexPos 且随移动状态更新（空间链路 §spec 3.2）', () => {
    const npc = makeNpc({
      id: 'NPC_SPATIAL_1',
      locationId: 'VENUE_QINGYUN_HALL',
      realm: 'QiRefinement_9',
      cultivation: { currentExp: 80, maxExp: 80 },
    });
    const engine = new WorldEngine({ ...baseState, npcs: { [npc.id]: npc } }, { rng: seqRng([0.5]) });
    // 第一月：resident → hexPos = 青云宗节点格
    engine.step();
    const after = engine.getState().npcs[npc.id]!;
    expect(after.hexPos).toBeDefined();
    // 有场所的 NPC 应锚定场所对应 hex（青云宗）
    const grid = generateWorldGrid('CONT_EAST');
    const home = findLandmarkPos(grid, 'NODE_SECT_QINGYUN');
    expect(after.hexPos).toEqual(home);
    expect(after.moveState).toBe('resident');
  });

  it('氛围层初始化且月度增长（populationGrid 存在且凡人计数上升）', () => {
    const engine = new WorldEngine({ ...baseState }, { rng: seqRng([0.5]) });
    engine.step();
    const pop = engine.getState().populationGrid;
    expect(pop).toBeDefined();
    const mortalsBefore = Object.values(pop!).reduce((s, p) => s + p.mortals, 0);
    engine.step();
    const mortalsAfter = Object.values(engine.getState().populationGrid!).reduce((s, p) => s + p.mortals, 0);
    expect(mortalsAfter).toBeGreaterThan(mortalsBefore);
  });

  it('升格候选产生新档案 NPC（凡人升阶 §spec 3.1.2）', () => {
    // 高升格概率 + 大人口 → 必产生升格
    const engine = new WorldEngine(
      { ...baseState },
      { rng: seqRng([0.5]) },
    );
    // 预置大人口氛围层，逼出升格
    const grid = generateWorldGrid('CONT_EAST');
    const pop = initializePopulationGrid(grid);
    for (const cell of Object.values(pop)) cell.mortals = 10000; // 全员满额
    engine.getState().populationGrid = pop;
    // 内部以 ascensionChance=0.001 计算：10000 × 0.03 × 0.001 ≈ 0.3/格 × ~380 格 ≈ 大量候选
    engine.fastForward(2);
    const npcCount = Object.values(engine.getState().npcs).filter(n => n.soulState === 'Active').length;
    expect(npcCount).toBeGreaterThan(0);
  });
```

> 注意：测试引用的 `generateWorldGrid`、`findLandmarkPos`、`initializePopulationGrid` 需在文件顶部 import。

- [ ] **Step 3: 运行测试确认失败**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/world-engine.test.ts`
Expected: FAIL（hexPos undefined / populationGrid undefined）

- [ ] **Step 4: 实现集成**

在 `world-engine.ts` 顶部 import 区追加：

```ts
import { deriveNpcHexPos, npcHexPos } from '../overworld/npc-spatial.js';
import { applyAscension, initializePopulationGrid, tickPopulation } from '../world/population.js';
import { generateWorldGrid } from '../overworld/hex-overworld-engine.js';
```

在 `step()` 的"云游回归"块（约 L240-245）**之后**插入"空间与氛围层"块：

```ts
    // 空间与氛围层（§spec 3.2/3.1）：hexPos 维护 + 人口增长 + 升格
    this.maintainNpcPositions();
    this.tickAtmosphere();
```

新增两个私有方法（放在 `pickVenueId` 附近）：

```ts
  /** 网格缓存（按大陆 id，与 UI 同构） */
  private gridCache = new Map<string, ReturnType<typeof generateWorldGrid>>();

  private gridOf(continentId: string): ReturnType<typeof generateWorldGrid> {
    let g = this.gridCache.get(continentId);
    if (!g) {
      g = generateWorldGrid(continentId);
      this.gridCache.set(continentId, g);
    }
    return g;
  }

  /** 月度 hexPos 维护：所有 Active NPC 锚定/漂移位置（§spec 3.2.2） */
  private maintainNpcPositions(): void {
    const continentId = this.state.activeContinentIds[0] ?? 'CONT_EAST';
    const grid = this.gridOf(continentId);
    for (const npc of Object.values(this.state.npcs)) {
      if (npc.soulState !== 'Active') continue;
      if (npc.moveState === 'secluded') {
        npc.secludeMonths = (npc.secludeMonths ?? 12) - 1;
        if (npc.secludeMonths <= 0) {
          npc.moveState = 'resident';
          npc.secludeMonths = undefined;
        }
        if (!npc.hexPos) npc.hexPos = npcHexPos(npc.locationId, grid) ?? { q: 10, r: 10 };
        continue;
      }
      const result = deriveNpcHexPos(npc.hexPos, npc.locationId, npc.moveTarget, grid);
      npc.hexPos = result.hexPos;
      npc.moveState = result.moveState;
      if (result.reached) npc.moveTarget = undefined;
      if (!npc.moveTarget && npc.moveState === 'wandering') {
        // 无目标云游：随机漂移 1 格（复用 npc.locationId 为空的情形）
        if (npc.locationId === undefined) npc.moveTarget = this.randomTargetNear(npc.hexPos);
      }
    }
  }

  /** 云游中 NPC 随机选 2-4 格外的目标（wandering 有方向感） */
  private randomTargetNear(pos: { q: number; r: number }): { q: number; r: number } {
    const q = pos.q + Math.floor(this.rng() * 5) - 2;
    const r = pos.r + Math.floor(this.rng() * 5) - 2;
    return { q, r };
  }

  /** 月度氛围层：人口增长 + 升格候选 → 档案 NPC（§spec 3.1.2） */
  private tickAtmosphere(): void {
    const continentId = this.state.activeContinentIds[0] ?? 'CONT_EAST';
    const grid = this.gridOf(continentId);
    if (!this.state.populationGrid || Object.keys(this.state.populationGrid).length === 0) {
      this.state.populationGrid = initializePopulationGrid(grid);
    }
    const pop = this.state.populationGrid;
    const result = tickPopulation(pop, this.rng, { ascensionChance: 0.001 });
    // 升格：为每个候选生成档案 NPC（复用 spawnNpc 的生成逻辑）
    const candidates = Math.min(result.ascensionCandidates, 8); // 月度上限防爆
    for (let i = 0; i < candidates; i++) {
      const keys = Object.keys(pop);
      if (keys.length === 0) break;
      const key = keys[Math.floor(this.rng() * keys.length)]!;
      const asc = applyAscension(pop, key);
      if (!asc) continue;
      const record = this.createNpcRecord(); // 复用现有生成（含名字/出身/地点）
      // 升格者从凡人而来：落脚于升格格对应场所（若无场所则散修）
      const hex = grid.hexes.get(asc.hexKey);
      if (hex?.landmarkId) {
        const venues = getVenuesByNode(hex.landmarkId);
        if (venues.length > 0) record.locationId = venues[Math.floor(this.rng() * venues.length)]!.id;
      } else {
        record.locationId = this.pickVenueId();
      }
      record.hexPos = { q: asc.q, r: asc.r };
      record.moveState = 'resident';
      record.aspiration = 'seekDao';
      this.state.npcs[record.id] = record;
    }
  }
```

在 `createNpcRecord`（现有生成函数，约 L1200）末尾（`return record;` 前）补初始 hexPos 与亲和种子：

```ts
    // 空间与亲和种子（§spec 3.2/3.3.1）：出生即定
    record.hexPos = npcHexPos(record.locationId, this.gridOf(this.state.activeContinentIds[0] ?? 'CONT_EAST'));
    record.moveState = 'resident';
    record.affinityMatrixSeed = this.rng();
```

- [ ] **Step 5: 处理类型与 import（getVenuesByNode 已从 map-catalog 导入则无需改；如未导入则加入 import）**

- [ ] **Step 6: 运行全部 engine 测试，修复既有测试受影响处**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npm test`
Expected: 全绿（若个别测试因 rng 序列/事件流变化失败，按"只改受影响断言"原则修复）

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/world/world-engine.ts packages/engine/src/__tests__/world-engine.test.ts
git commit -m "feat(engine): 世界 tick 集成 NPC 空间维护 + 氛围层升格"
```

---

### Task 5: UI `MapPanel.vue` NPC 标记图层（聚合 + 附近精细）

**Files:**
- Modify: `apps/taosim-ui/src/game/panels/MapPanel.vue`

- [ ] **Step 1: 读取 MapPanel.vue 顶部 script 区（imports/computed）确认接入点**

Run: `cd d:\Code\ai\TaoSim\apps\taosim-ui && npx vue-tsc -p tsconfig.app.json --noEmit`
Expected: 当前 PASS

- [ ] **Step 2: script 区新增 NPC 标记逻辑**

在 `allHexes` computed 之后追加：

```ts
// ---- NPC 呈现（§spec 3.4：聚合 + 附近精细）----
import { npcSpatialIndex } from '@taosim/engine/src/overworld/npc-spatial.js';

// 世界 NPC（Active）按格索引
const npcByHex = computed(() => {
  const npcs = appStore.currentWorldState?.npcs ?? {};
  return npcSpatialIndex(npcs, worldGrid.value);
});

// 上帝视角：每格聚合计数（人数 + 境界色）
const npcAggregates = computed(() => {
  const out: Array<{ q: number; r: number; count: number; color: string }> = [];
  for (const [key, list] of npcByHex.value) {
    const [q, r] = key.split(',').map(Number);
    // 境界色：炼气青 / 筑基蓝 / 金丹金 / 元婴紫
    let color = '#22d3ee';
    for (const n of list) {
      if (n.realm.startsWith('NascentSoul')) color = '#a78bfa';
      else if (n.realm.startsWith('GoldenCore')) color = '#fbbf24';
      else if (n.realm.startsWith('Foundation')) color = '#60a5fa';
    }
    out.push({ q: q!, r: r!, count: list.length, color });
  }
  return out;
});

// 沉浸视角：玩家所在格 + 邻格 NPC 精细标记
const nearbyNpcs = computed(() => {
  const pos = playerHexPos.value;
  const around = [{ q: pos.q, r: pos.r }, ...getHexNeighbors(pos.q, pos.r)];
  const out: Array<{ q: number; r: number; npc: import('@taosim/contracts').NpcRecord }> = [];
  for (const p of around) {
    const list = npcByHex.value.get(`${p.q},${p.r}`) ?? [];
    for (const n of list) out.push({ q: p.q, r: p.r, npc: n });
  }
  return out;
});

function realmColor(realm: string): string {
  if (realm.startsWith('NascentSoul')) return '#a78bfa';
  if (realm.startsWith('GoldenCore')) return '#fbbf24';
  if (realm.startsWith('Foundation')) return '#60a5fa';
  return '#22d3ee';
}
```

> 若 `@taosim/engine` 未在 UI 的 tsconfig paths 中暴露子路径，改为从已暴露入口导入或改为在 UI 侧复制最小换算函数（读 venue 目录不可行）——**优先方案**：检查 `apps/taosim-ui/package.json` 是否依赖 `@taosim/engine`；若 UI 仅依赖 contracts，则在 `MapPanel.vue` 内联实现同格换算（遍历 npcs，用 `hexPos ?? 通过 nodeId 换算`）。**决策点见 Step 4。**

- [ ] **Step 3: 模板新增 NPC 图层（插在玩家标记 `</g>` 之后、`</svg>` 之前）**

```html
            <!-- NPC 聚合标记（上帝视角：人数） -->
            <g v-for="agg in npcAggregates" :key="`npcagg-${agg.q}-${agg.r}`"
              :transform="`translate(${hexToPixel(agg.q, agg.r).x}, ${hexToPixel(agg.q, agg.r).y})`"
              class="pointer-events-none select-none">
              <circle :r="4 + Math.min(agg.count, 8)" :fill="agg.color" fill-opacity="0.55"
                :stroke="agg.color" stroke-width="1" />
              <text y="3" text-anchor="middle" fill="#fff" font-size="6" font-weight="bold"
                v-if="agg.count > 1">{{ agg.count }}</text>
            </g>

            <!-- NPC 精细标记（沉浸视角：玩家附近，人形 + 姓名） -->
            <g v-for="near in nearbyNpcs" :key="`npcnear-${near.q}-${near.r}-${near.npc.id}`"
              :transform="`translate(${hexToPixel(near.q, near.r).x}, ${hexToPixel(near.q, near.r).y})`"
              class="pointer-events-none select-none">
              <circle r="5" :fill="realmColor(near.npc.realm)" stroke="#0f172a" stroke-width="1" />
              <text y="13" text-anchor="middle" :fill="realmColor(near.npc.realm)" font-size="6"
                font-weight="bold">{{ near.npc.name }}</text>
            </g>
```

- [ ] **Step 4: 确认 `@taosim/engine` 是否可被 UI 导入（若不行为 fallback）**

Run: `cd d:\Code\ai\TaoSim && npx grep -n '"@taosim/engine"' apps/taosim-ui/package.json packages/engine/package.json`
- 若 UI 已依赖 engine：保持 Step 2 的 import 路径，跳 Step 5。
- 若仅依赖 contracts：改为在 `MapPanel.vue` 内联 `npcSpatialIndex` 简化版（仅按 `hexPos` 聚合；无 hexPos 的 NPC 用本地 `getVenueOf` 从 engine 导出不可行时，仅呈现有 hexPos 的 NPC——升级后 NPC 才有 hexPos）。**此时修改 Step 2 代码为内联实现。**

内联 fallback 实现（替换 Step 2 的 import + npcByHex）：

```ts
// ---- NPC 呈现（§spec 3.4）----
// 内联同格索引：仅按 NpcRecord.hexPos 聚合（引擎已维护；旧 NPC 无 hexPos 不呈现）
const npcByHex = computed(() => {
  const npcs = appStore.currentWorldState?.npcs ?? {};
  const index = new Map<string, Array<import('@taosim/contracts').NpcRecord>>();
  for (const n of Object.values(npcs)) {
    if (n.soulState !== 'Active' || !n.hexPos) continue;
    const key = `${n.hexPos.q},${n.hexPos.r}`;
    const list = index.get(key) ?? [];
    list.push(n);
    index.set(key, list);
  }
  return index;
});
```

（npcAggregates / nearbyNpcs / realmColor 不变，无需 engine import。）

- [ ] **Step 5: 运行 UI typecheck**

Run: `cd d:\Code\ai\TaoSim\apps\taosim-ui && npm run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/taosim-ui/src/game/panels/MapPanel.vue
git commit -m "feat(ui): MapPanel NPC 标记图层（聚合 + 附近精细）"
```

---

### Task 6: 全量验证（第一阶段）

**Files:** 无

- [ ] **Step 1: 引擎全量测试**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npm test`
Expected: 全绿（375 + 新增 npc-spatial/population/world-engine 用例）

- [ ] **Step 2: 引擎 typecheck + UI typecheck**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx tsc --noEmit` 和 `cd d:\Code\ai\TaoSim\apps\taosim-ui && npm run typecheck`
Expected: 双 PASS

- [ ] **Step 3: 汇报第一阶段成果**

---

### Task 7: engine `affinity.ts`（兼容性纯函数，第二阶段 P0）

**Files:**
- Create: `packages/engine/src/world/affinity.ts`
- Test: `packages/engine/src/__tests__/affinity.test.ts`

- [ ] **Step 1: 写失败测试 `affinity.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import type { NpcRecord } from '@taosim/contracts';
import { affinity } from '../world/affinity.js';

function makeNpc(seed: number, overrides: Partial<NpcRecord> = {}): NpcRecord {
  return {
    id: `NPC_${seed}`, name: '散修', gender: 'Male', personalityId: 'neutral',
    origin: { type: '散修' }, destiny: { tier: 'common', born: 'mortal', luck: 50, hidden: false },
    realm: 'QiRefinement_3', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 240 },
    spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
    lifespan: { age: 30, maxLifespan: 100 },
    skillIds: [], birthYear: 1, birthMonth: 1,
    relations: {}, biography: { milestones: [], summary: '' },
    lastUpdate: { year: 1, month: 1 },
    affinityMatrixSeed: seed,
    ...overrides,
  };
}

describe('affinity（兼容性基底 §spec 3.3.1）', () => {
  it('确定性：同对 NPC 多次计算一致', () => {
    const a = makeNpc(0.123);
    const b = makeNpc(0.456);
    expect(affinity(a, b)).toBe(affinity(a, b));
  });

  it('对称性：affinity(a,b) === affinity(b,a)', () => {
    const a = makeNpc(0.123);
    const b = makeNpc(0.456);
    expect(affinity(a, b)).toBe(affinity(b, a));
  });

  it('值域在 [-1, 1]', () => {
    for (let i = 1; i <= 50; i++) {
      const a = makeNpc(i / 100);
      const b = makeNpc((i * 7) / 100);
      const v = affinity(a, b);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('不同种子对分布不集中于 0（有差异）', () => {
    const a = makeNpc(0.1);
    const b = makeNpc(0.2);
    const c = makeNpc(0.3);
    const vals = new Set([affinity(a, b), affinity(a, c), affinity(b, c)]);
    expect(vals.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/affinity.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `affinity.ts`**

```ts
// ============================================================
// 兼容性基底（§spec 3.3.1 道缘/魔缘）：出生时生成 seed，
// 与任意 NPC 的兼容性由 seed 确定性计算（命运感，不可修改）
// ============================================================

import type { NpcRecord } from '@taosim/contracts';

function simpleHash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000; // [0,1)
}

/** 兼容性 [-1,1]：正值=道缘（天生同道），负值=魔缘（天生相克）；对称且确定 */
export function affinity(a: NpcRecord, b: NpcRecord): number {
  const sa = a.affinityMatrixSeed ?? 0.5;
  const sb = b.affinityMatrixSeed ?? 0.5;
  const key = sa < sb ? `${sa}|${sb}` : `${sb}|${sa}`;
  return (simpleHash(key) - 0.5) * 2;
}

/** 社交基底 opinion 偏移：affinity × 15（道缘 +15 起步，魔缘 -15 起步） */
export function affinityOpinionOffset(a: NpcRecord, b: NpcRecord): number {
  return Math.round(affinity(a, b) * 15);
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/affinity.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/world/affinity.ts packages/engine/src/__tests__/affinity.test.ts
git commit -m "feat(engine): 兼容性基底 affinity（道缘/魔缘确定性）"
```

---

### Task 8: 嫉妒追捧 + 兼容性社交基底（第二阶段 P0）

**Files:**
- Modify: `packages/engine/src/world/world-social-rules.ts`
- Modify: `packages/engine/src/world/world-engine.ts`
- Test: `packages/engine/src/__tests__/world-social-rules.test.ts`

- [ ] **Step 1: 写失败测试（追加到 `world-social-rules.test.ts`）**

```ts
import { tryJealousy } from '../world/world-social-rules.js';
// （文件顶部 import 追加）

  it('嫉妒追捧：天才（天灵根）被平庸同门嫉妒（bond 下降），同级不嫉妒', () => {
    const genius = makeNpc({ id: 'NPC_G', realm: 'QiRefinement_3', spiritRoot: { grade: 'Heaven', elements: ['Fire'], isVariant: false } });
    const jealous = makeNpc({ id: 'NPC_J', realm: 'QiRefinement_3', personalityId: 'jealous' });
    const normal = makeNpc({ id: 'NPC_N', realm: 'QiRefinement_3' });
    tryJealousy([jealous, normal], genius, seqRng([0.0, 0.0]));
    // 嫉妒者 bond 下降（>0 表示有嫉妒事件）
    const relJ = jealous.relations['NPC_G'];
    expect(relJ).toBeDefined();
    expect(relJ!.bond).toBeLessThan(0);
    expect(relJ!.events).toContain('心生嫉妒');
    // 非嫉妒性格者不主动嫉妒（rng 0.0 也应低于性格门槛 → 无关系）
    const relN = normal.relations['NPC_G'];
    expect(relN).toBeUndefined();
  });

  it('平庸者不嫉妒同级或更高资质者', () => {
    const normal = makeNpc({ id: 'NPC_N', realm: 'QiRefinement_3' });
    const fellowNormal = makeNpc({ id: 'NPC_F', realm: 'QiRefinement_3' });
    tryJealousy([normal], fellowNormal, seqRng([0.0]));
    expect(normal.relations['NPC_F']).toBeUndefined();
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/world-social-rules.test.ts`
Expected: FAIL（tryJealousy 不存在）

- [ ] **Step 3: 实现 `tryJealousy`（追加到 world-social-rules.ts）**

```ts
/** 灵根资质权重（天>地>玄>黄；神品最高） */
function rootGradeWeight(grade: SpiritRoot['grade']): number {
  switch (grade) {
    case 'Heaven': return 4;
    case 'Earth': return 3;
    case 'Mysterious': return 2;
    case 'Yellow': return 1;
    default: return 0;
  }
}

/**
 * 嫉妒追捧（§spec 3.3.2）：同场所 NPC 对高资质者产生 opinion 偏移。
 * - 追捧：所有资质低于目标者 opinion +8（敬仰）
 * - 嫉妒：性格 jealous 者额外 opinion -15（树大招风）
 * 消耗 rng：每名旁观者 1 次。
 */
export function tryJealousy(
  bystanders: NpcRecord[],
  target: NpcRecord,
  now: GameTime,
  rng: Rng,
): void {
  const targetW = rootGradeWeight(target.spiritRoot.grade);
  if (targetW < 2) return; // 黄级及以下不引人注目
  for (const other of bystanders) {
    if (other.id === target.id || other.soulState !== 'Active') continue;
    if (rootGradeWeight(other.spiritRoot.grade) >= targetW) continue; // 同级/更高不嫉妒
    if (other.personalityId === 'jealous' && rng() < 0.5) {
      applyRelation(other, target.id, 'rival', -15, '心生嫉妒', now);
      applyRelation(target, other.id, 'rival', -5, '察觉敌意', now);
    } else if (rng() < 0.05) {
      // 少量敬仰（防止所有低资质都沉默）
      applyRelation(other, target.id, 'friend', 8, '心生敬仰', now);
    }
  }
}
```

> 注：`SpiritRoot['grade']` 需确认 contracts 中 grade 的确切联合类型（Heaven/Earth/Mysterious/Yellow 或中文）。**Step 3 前先 grep spirit-root 定义。**

- [ ] **Step 4: 将 `tryJealousy` 接入 world-engine 月度 tick（空间索引段）**

在 `maintainNpcPositions()` 调用后、`tickAtmosphere()` 前插入：

```ts
    // 嫉妒追捧（§spec 3.3.2）：同格高资质者招致嫉妒/敬仰
    this.tickJealousy();
```

新增方法：

```ts
  /** 嫉妒追捧：按格索引，同格低资质者对高资质者产生 opinion 偏移（空间局部化 §spec 3.5） */
  private tickJealousy(): void {
    const continentId = this.state.activeContinentIds[0] ?? 'CONT_EAST';
    const grid = this.gridOf(continentId);
    const now = { year: this.state.currentYear, month: this.state.currentMonth };
    const index = npcSpatialIndex(this.state.npcs, grid);
    for (const list of index.values()) {
      if (list.length < 2) continue;
      // 选资质最高者作为目标（若有）
      let genius: NpcRecord | null = null;
      for (const n of list) {
        if (!genius || rootGradeW(n.spiritRoot.grade) > rootGradeW(genius.spiritRoot.grade)) genius = n;
      }
      if (!genius) continue;
      tryJealousy(list, genius, now, this.rng);
    }
  }
```

（`rootGradeW` 若未导出，则从 world-social-rules 导出或内联等价函数。）

- [ ] **Step 5: 兼容性基底接入社交（socialEncounter 初始 bond 叠加）**

在 `socialEncounter` 的 `meet` 分支（L105-112），把 bond 计算改为叠加兼容性基底：

```ts
  if (roll < 0.55) {
    const base = 5 + Math.floor(rng() * 11); // 5..15
    const bond = Math.max(-20, base + affinityOpinionOffset(a, b));
    applyRelation(a, b.id, bond > 0 ? 'friend' : 'rival', bond, '初识', now);
    applyRelation(b, a.id, bond > 0 ? 'friend' : 'rival', bond, '初识', now);
    return {
      kind: 'meet', templateKey: 'social.meet', bondDelta: bond, major: false,
    };
  }
```

并在文件顶部 import `affinityOpinionOffset`：

```ts
import { affinityOpinionOffset } from './affinity.js';
```

> 注意：此改动会改变既有测试的 bond 断言（同面板 NPC 兼容性基底可能为负）。**先跑全量看失败面，再决定是修正断言还是用 `affinityMatrixSeed` 等值保证中性。**

- [ ] **Step 6: 运行全部 engine 测试，修复受影响断言**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npm test`
Expected: 全绿（按"只改受影响断言"原则修复）

- [ ] **Step 7: Commit**

```bash
git add packages/engine/src/world/world-social-rules.ts packages/engine/src/world/world-engine.ts packages/engine/src/__tests__/world-social-rules.test.ts
git commit -m "feat(engine): 嫉妒追捧 + 兼容性社交基底（社交涌现 P0）"
```

---

### Task 9: 全量验证（第二阶段 P0）

**Files:** 无

- [ ] **Step 1: 引擎全量测试 + typecheck + UI typecheck**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npm test && npx tsc --noEmit` 与 `cd d:\Code\ai\TaoSim\apps\taosim-ui && npm run typecheck`
Expected: 全绿

- [ ] **Step 2: 涌现质量评估（确认世界 50 年仍稳定，无爆炸）**

Run: `cd d:\Code\ai\TaoSim\packages\engine && npx vitest run src/__tests__/world-emergence-validation.test.ts`
Expected: PASS（5 种子 × 13 项指标达标）

- [ ] **Step 3: 汇报全部成果**
