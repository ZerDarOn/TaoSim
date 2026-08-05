# Phase 2: 活的修仙世界 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NPC 会战斗、世界会演化、进度可存档 — 让 MVP 闭环变成"活的游戏"

**Architecture:** 自顶向下：先让战棋有对手（NPC 行为树），再让世界按月推进（WorldEngine 月度 Tick），最后让存档落地（IndexedDB 持久化）。程序化战棋地图作为收官。每层独立可测。

**Tech Stack:** TypeScript + Vitest + IndexedDB API (native browser) + Vue 3

**当前基线:** MVP 0.1 闭环完整（创角→战棋→渡劫，23 tests）。WorldEngine 仅推进日历，CombatEngine 无 NPC 行动逻辑，无存档持久化，战棋地图为硬编码。

---

## 文件结构

```
packages/engine/src/
├── combat/
│   └── npc-ai.ts              # NEW: NPC 战斗行为树
├── world/
│   ├── world-engine.ts        # MODIFY: 补全月度 Tick
│   ├── npc-generator.ts       # NEW: NPC 随机生成器
│   └── map-generator.ts       # NEW: 程序化战棋地图
├── ai/
│   └── ai-service-facade.ts   # MODIFY: 接入降级模板（非 LLM）

packages/persistence/src/
├── indexeddb-adapter.ts       # NEW: IndexedDB 存储实现

apps/taosim-ui/src/
├── components/
│   ├── SaveLoadPanel.vue      # NEW: 存档 UI
│   └── EventLog.vue           # NEW: 世界事件日志
├── pages/
│   ├── WorldPage.vue          # MODIFY: 接入 WorldEngine
│   ├── BattlePage.vue         # MODIFY: 接入 NPC AI + 程序化地图
│   └── CultivationPage.vue    # MODIFY: 接入真实闭关
├── composables/
│   └── useWorld.ts            # NEW: 世界状态管理

packages/engine/src/__tests__/
├── npc-ai.test.ts             # NEW
├── world-engine.test.ts       # NEW
└── map-generator.test.ts      # NEW
```

---

### Phase A: NPC 敌人会战斗

#### Task A.1: NpcAI — 敌人行为树

**Files:**
- Create: `packages/engine/src/combat/npc-ai.ts`
- Create: `packages/engine/src/__tests__/npc-ai.test.ts`

**Architecture:** 行为树节点：选择技能（优先级最高+可用）→ 移动到攻击范围 → 攻击 → 结束回合。100% 代码逻辑，无 LLM 调用。

**Risk:** 无（纯函数，无副作用）

- [ ] **Step 1: 写失败测试**

```typescript
// packages/engine/src/__tests__/npc-ai.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { NpcAI } from '../combat/npc-ai.js';
import { CombatEngine } from '../combat/combat-engine.js';
import type { Character, HexBattleMap, Skill } from '@taosim/contracts';

function makeMap(): HexBattleMap {
  const tiles: Record<string, any> = {};
  for (let q = 0; q < 5; q++) {
    for (let r = 0; r < 5; r++) {
      tiles[`${q},${r}`] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  return { width: 5, height: 5, tiles };
}

function makeChar(id: string, overrides: Partial<Character> = {}): Character {
  return {
    id, name: id, gender: 'Male', realm: 'QiRefinement_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 100 },
    lifespan: { age: 20, maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 100, maxHp: 100, ap: 3, canFly: false,
    inventory: [],
    equipmentSlots: {
      weapon: { id: 'w1', name: '剑', tier: 1, type: 'Equipment', attributes: { attack: 15 } },
      armor: undefined, treasures: [],
    },
    skills: [
      { id: 's1', name: '斩击', quality: 'Huang', type: 'Active', primitives: [],
        cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 0 },
    ],
    skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

describe('NpcAI', () => {
  let map: HexBattleMap;
  let player: Character;
  let enemy: Character;
  let engine: CombatEngine;

  beforeEach(() => {
    map = makeMap();
    player = makeChar('PLAYER');
    enemy = makeChar('ENEMY');
    engine = new CombatEngine(map, [player, enemy]);
    engine.placeCharacter('PLAYER', 0, 0);
    engine.placeCharacter('ENEMY', 2, 2);
  });

  it('敌人有可用技能时输出攻击行动', () => {
    const action = NpcAI.decide(enemy, player, engine, { PLAYER: player, ENEMY: enemy });
    expect(action.type).toBe('attack');
    expect(action.skill).toBeDefined();
    expect(action.targetId).toBe('PLAYER');
  });

  it('距离过远时优先移动靠近', () => {
    engine.placeCharacter('ENEMY', 4, 4);
    const action = NpcAI.decide(enemy, player, engine, { PLAYER: player, ENEMY: enemy });
    // 距离为 hexDistance(4,4,0,0) = 4 > 技能射程1，需要移动
    expect(action.type).toBe('move');
    expect(action.toQ).toBeDefined();
    expect(action.toR).toBeDefined();
  });

  it('技能冷却中则跳过该技能', () => {
    const enemy2 = makeChar('E2', {
      skills: [
        { id: 's1', name: '斩击', quality: 'Huang', type: 'Active', primitives: [],
          cost: { ap: 1, spiritEnergy: 5 }, cooldownTurns: 2 },
      ],
      skillCooldowns: { s1: 3 },
      spiritEnergy: { current: 100, max: 100 },
    });
    const action = NpcAI.decide(enemy2, player, engine, { PLAYER: player, E2: enemy2 });
    // 冷却中，无可用技能 → 只能移动或跳过
    expect(action.type === 'move' || action.type === 'skip').toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

```bash
npm run test -w @taosim/engine -- src/__tests__/npc-ai.test.ts
```
Expected: FAIL

- [ ] **Step 3: 实现 NpcAI**

```typescript
// packages/engine/src/combat/npc-ai.ts
import type { Character, Skill } from '@taosim/contracts';
import { hexDistance } from '@taosim/contracts';
import type { CombatEngine } from './combat-engine.js';

export interface NpcAction {
  type: 'attack' | 'move' | 'skip';
  skill?: Skill;
  targetId?: string;
  toQ?: number;
  toR?: number;
}

export class NpcAI {
  /**
   * 行为树决策：选择技能 → 检查射程 → 移动或攻击。
   * @returns 单一行动：attack 或 move 或 skip
   */
  static decide(
    actor: Character,
    target: Character,
    engine: CombatEngine,
    characters: Record<string, Character>,
  ): NpcAction {
    // 1. 选择可用技能（冷却完毕 + 灵力足够 + AP 足够）
    const availableSkills = actor.skills.filter(s => {
      const cd = actor.skillCooldowns[s.id];
      if (cd && cd > 0) return false;
      if (actor.spiritEnergy.current < s.cost.spiritEnergy) return false;
      if (actor.ap < s.cost.ap) return false;
      return true;
    });

    const bestSkill = availableSkills[0] ?? null;
    const skillRange = 1; // 默认近战射程

    // 2. 获取位置
    const actorPos = engine.findCharacterPosition(actor.id);
    const targetPos = engine.findCharacterPosition(target.id);
    if (!actorPos) return { type: 'skip' };

    // 3. 判断是否在射程内
    let inRange = false;
    if (targetPos) {
      const dist = hexDistance(actorPos.q, actorPos.r, targetPos.q, targetPos.r);
      inRange = dist <= skillRange;
    }

    // 4. 攻击（在射程内且有技能）
    if (inRange && bestSkill) {
      return {
        type: 'attack',
        skill: bestSkill,
        targetId: target.id,
      };
    }

    // 5. 移动靠近（不在射程内）
    if (targetPos) {
      const movePos = NpcAI.findBestMoveToward(actorPos, targetPos, engine, characters, actor);
      if (movePos) {
        return { type: 'move', toQ: movePos.q, toR: movePos.r };
      }
    }

    return { type: 'skip' };
  }

  /**
   * 贪心寻路：在合法移动范围内，选择离目标最近的格子。
   */
  private static findBestMoveToward(
    from: { q: number; r: number },
    to: { q: number; r: number },
    engine: CombatEngine,
    characters: Record<string, Character>,
    actor: Character,
  ): { q: number; r: number } | null {
    const MAX_MOVE = 3;
    let best: { q: number; r: number } | null = null;
    let bestDist = Infinity;

    for (let dq = -MAX_MOVE; dq <= MAX_MOVE; dq++) {
      for (let dr = -MAX_MOVE; dr <= MAX_MOVE; dr++) {
        const q = from.q + dq;
        const r = from.r + dr;
        const dist = hexDistance(from.q, from.r, q, r);
        if (dist > MAX_MOVE) continue;

        const map = engine.getMap();
        const tile = map.tiles[`${q},${r}`];
        if (!tile || tile.isBlocked) continue;
        // 水域检查：不能飞就不能进
        if (tile.isWater && !actor.canFly) continue;
        // 已被占据
        if (tile.occupantId && tile.occupantId !== actor.id) continue;

        const d = hexDistance(q, r, to.q, to.r);
        if (d < bestDist) {
          bestDist = d;
          best = { q, r };
        }
      }
    }
    return best;
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
npm run test -w @taosim/engine -- src/__tests__/npc-ai.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 5: 更新 engine 导出索引**

```typescript
// packages/engine/src/index.ts — 添加：
export { NpcAI } from './combat/npc-ai.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/combat/npc-ai.ts packages/engine/src/__tests__/npc-ai.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): add NpcAI behavior tree for enemy combat AI"
```

---

#### Task A.2: 接入 BattlePage — NPC 自动行动

**Files:**
- Modify: `apps/taosim-ui/src/composables/useCombat.ts`
- Modify: `apps/taosim-ui/src/pages/BattlePage.vue`

- [ ] **Step 1: 在 useCombat 中添加 NPC turn 处理**

在 `useCombat.ts` 的 `tick()` 函数之后添加：

```typescript
import { NpcAI } from '@taosim/engine';

// 在 useCombat 函数内部添加：
async function executeNpcTurn(npcId: string) {
  const npc = state.characters[npcId];
  const playerId = Object.keys(state.characters).find(id => id !== npcId)!;
  const player = state.characters[playerId];
  if (!npc || !player || !state.engine) return;

  // 短暂延迟让玩家看到 NPC 思考
  await new Promise(r => setTimeout(r, 500));

  const action = NpcAI.decide(npc, player, state.engine, state.characters);

  if (action.type === 'attack' && action.targetId && action.skill) {
    state.selectedSkill = action.skill;
    attackTarget(action.targetId);
  } else if (action.type === 'move' && action.toQ !== undefined && action.toR !== undefined) {
    state.engine.moveCharacter(npcId, action.toQ, action.toR);
    state.log.push(`${npc.name} 移动到 (${action.toQ}, ${action.toR})`);
    endTurn();
  } else {
    endTurn();
  }
}
```

修改 `tick()` 函数末尾，非玩家回合自动触发 NPC：

```typescript
function tick() {
  state.engine!.tickATB(state.characters);
  const ready = state.engine!.getReadyUnits();
  if (ready.length > 0) {
    const unit = ready[0]!;
    state.currentTurn = unit.characterId;
    // 非玩家自动行动
    if (unit.characterId !== playerId) {
      executeNpcTurn(unit.characterId);
    }
  }
}
```

注意：`useCombat` 需要接收 `playerId` 参数来区分玩家和 NPC。修改函数签名：

```typescript
export function useCombat(map: HexBattleMap, playerId: string, player: Character, enemies: Character[]) {
```

- [ ] **Step 2: 修改 BattlePage 调用签名**

在 `BattlePage.vue` 中更新 `useCombat` 调用：

```typescript
// 从：
const { state, tick, movePlayer, selectSkill, attackTarget, endTurn } = useCombat(testMap, player, [enemy]);
// 改为：
const { state, tick, movePlayer, selectSkill, attackTarget, endTurn } = useCombat(testMap, player.id, player, [enemy]);
```

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck -w @taosim/taosim-ui
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/taosim-ui/src/composables/useCombat.ts apps/taosim-ui/src/pages/BattlePage.vue
git commit -m "feat(ui): wire NpcAI into BattlePage — enemies fight back"
```

---

### Phase B: 存档持久化（IndexedDB）

#### Task B.1: IndexedDBStorageAdapter

**Files:**
- Create: `packages/persistence/src/indexeddb-adapter.ts`

- [ ] **Step 1: 实现 IndexedDB 适配器**

```typescript
// packages/persistence/src/indexeddb-adapter.ts
import type { SavePayload, SaveHeader } from '@taosim/contracts';
import type { IStorageAdapter } from './storage-adapter.js';

const DB_NAME = 'taosim_saves';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

export class IndexedDBStorageAdapter implements IStorageAdapter {
  private db: IDBDatabase | null = null;

  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'header.saveId' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => reject(request.error);
    });
  }

  async save(payload: SavePayload): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async load(saveId: string): Promise<SavePayload | null> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(saveId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  async listHeaders(): Promise<SaveHeader[]> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const payloads = request.result as SavePayload[];
        resolve(payloads.map(p => p.header));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteSave(saveId: string): Promise<void> {
    if (!this.db) throw new Error('IndexedDB not initialized');
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(saveId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
```

- [ ] **Step 2: 导出适配器**

```typescript
// packages/persistence/src/index.ts — 添加：
export { IndexedDBStorageAdapter } from './indexeddb-adapter.js';
```

- [ ] **Step 3: 运行 typecheck**

```bash
npm run typecheck -w @taosim/persistence
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/indexeddb-adapter.ts packages/persistence/src/index.ts
git commit -m "feat(persistence): add IndexedDBStorageAdapter for browser saves"
```

---

#### Task B.2: SaveLoadPanel — 存档 UI

**Files:**
- Create: `apps/taosim-ui/src/components/SaveLoadPanel.vue`
- Modify: `apps/taosim-ui/src/stores/app.ts` — 添加存档方法

- [ ] **Step 1: 在 AppStore 中添加存档方法**

```typescript
// apps/taosim-ui/src/stores/app.ts
import { IndexedDBStorageAdapter } from '@taosim/persistence';
import type { SavePayload, SaveHeader, Character, WorldState } from '@taosim/contracts';
import { usePlayerStore } from './player';

let storage: IndexedDBStorageAdapter | null = null;

async function getStorage(): Promise<IndexedDBStorageAdapter> {
  if (!storage) {
    storage = new IndexedDBStorageAdapter();
    await storage.initialize();
  }
  return storage;
}

// 在 actions 中添加：
async saveGame() {
  const playerStore = usePlayerStore();
  const player = playerStore.character;
  if (!player || !this.currentWorldState) return;

  const adapter = await getStorage();
  const payload: SavePayload = {
    header: {
      saveId: `save_${Date.now()}`,
      schemaVersion: 1,
      gameVersion: '0.1.0',
      timestamp: Date.now(),
      playTimeMonths: 0,
      playerSummary: {
        name: player.name,
        realm: player.realm,
        portraitId: 'default',
      },
    },
    worldState: this.currentWorldState,
    player,
    activeNPCs: {},
    factions: {},
    overworldMap: { continents: [] },
    graveyard: [],
  };
  await adapter.save(payload);
  this.saveHeaders = await adapter.listHeaders();
},

async loadGame(saveId: string) {
  const adapter = await getStorage();
  const payload = await adapter.load(saveId);
  if (!payload) return;

  const playerStore = usePlayerStore();
  playerStore.setPlayer(payload.player);
  this.currentWorldState = payload.worldState;
  this.isInitialized = true;
},

async loadSaveHeaders() {
  const adapter = await getStorage();
  this.saveHeaders = await adapter.listHeaders();
},

async deleteSave(saveId: string) {
  const adapter = await getStorage();
  await adapter.deleteSave(saveId);
  this.saveHeaders = await adapter.listHeaders();
},
```

- [ ] **Step 2: 创建 SaveLoadPanel 组件**

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';

const router = useRouter();
const appStore = useAppStore();
const playerStore = usePlayerStore();

const saving = ref(false);
const loading = ref(false);

onMounted(async () => {
  await appStore.loadSaveHeaders();
});

async function handleSave() {
  saving.value = true;
  try {
    await appStore.saveGame();
  } finally {
    saving.value = false;
  }
}

async function handleLoad(saveId: string) {
  loading.value = true;
  try {
    await appStore.loadGame(saveId);
    router.push('/world');
  } finally {
    loading.value = false;
  }
}

async function handleDelete(saveId: string) {
  await appStore.deleteSave(saveId);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN');
}
</script>

<template>
  <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
    <div class="flex justify-between items-center">
      <h3 class="text-sm font-semibold text-ink-soft">存档管理</h3>
      <button
        @click="handleSave"
        :disabled="saving || !playerStore.isCreated"
        class="px-3 py-1 bg-jade text-white rounded text-xs font-semibold disabled:opacity-50"
      >
        {{ saving ? '保存中...' : '保存当前进度' }}
      </button>
    </div>

    <div v-if="appStore.saveHeaders.length === 0" class="text-xs text-muted">尚无存档</div>

    <div
      v-for="header in appStore.saveHeaders"
      :key="header.saveId"
      class="flex items-center justify-between p-2 rounded bg-surface-muted"
    >
      <div class="text-xs space-y-0.5">
        <div class="font-semibold">{{ header.playerSummary.name }} — {{ header.playerSummary.realm }}</div>
        <div class="text-muted">{{ formatTime(header.timestamp) }}</div>
      </div>
      <div class="flex gap-2">
        <button
          @click="handleLoad(header.saveId)"
          :disabled="loading"
          class="px-2 py-1 bg-gold text-white rounded text-[10px] font-semibold"
        >
          加载
        </button>
        <button
          @click="handleDelete(header.saveId)"
          class="px-2 py-1 border border-danger text-danger rounded text-[10px]"
        >
          删除
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 将 SaveLoadPanel 加入 HomePage**

在 `HomePage.vue` 的 `"继续游戏"` 按钮下方添加：

```html
<div class="max-w-md mx-auto pt-6">
  <SaveLoadPanel />
</div>
```

并导入：
```typescript
import SaveLoadPanel from '@/components/SaveLoadPanel.vue';
```

- [ ] **Step 4: 运行 typecheck**

```bash
npm run typecheck -w @taosim/taosim-ui
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/components/SaveLoadPanel.vue apps/taosim-ui/src/stores/app.ts apps/taosim-ui/src/pages/HomePage.vue
git commit -m "feat(ui): add SaveLoadPanel + IndexedDB persistence integration"
```

---

### Phase C: 世界月度演化

#### Task C.1: WorldEngine 补全 — 月度 Tick

**Files:**
- Modify: `packages/engine/src/world/world-engine.ts`
- Create: `packages/engine/src/__tests__/world-engine.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/world-engine.test.ts
import { describe, it, expect } from 'vitest';
import { WorldEngine } from '../world/world-engine.js';
import type { WorldState } from '@taosim/contracts';

describe('WorldEngine', () => {
  it('月度推进更新日历', () => {
    const engine = new WorldEngine({
      currentYear: 1, currentMonth: 12,
      catastropheCountdownMonths: 600,
      activeContinentIds: [],
      globalFlags: {},
    });
    engine.step();
    const state = engine.getState();
    expect(state.currentYear).toBe(2);
    expect(state.currentMonth).toBe(1);
  });

  it('量劫倒计时递减', () => {
    const engine = new WorldEngine({
      currentYear: 1, currentMonth: 1,
      catastropheCountdownMonths: 10,
      activeContinentIds: [],
      globalFlags: {},
    });
    engine.step();
    expect(engine.getState().catastropheCountdownMonths).toBe(9);
  });

  it('fastForward 正确推进 N 个月', () => {
    const engine = new WorldEngine({
      currentYear: 1, currentMonth: 1,
      catastropheCountdownMonths: 600,
      activeContinentIds: [],
      globalFlags: {},
    });
    const result = engine.fastForward(24);
    expect(result.progress).toBe(1.0);
    expect(engine.getState().currentYear).toBe(3);
    expect(engine.getState().currentMonth).toBe(1);
  });

  it('月度 Tick 产出生老病死事件', () => {
    const engine = new WorldEngine({
      currentYear: 1, currentMonth: 1,
      catastropheCountdownMonths: 600,
      activeContinentIds: [],
      globalFlags: {},
    });
    const result = engine.step();
    // step() 现在返回 MonthlyTickResult 含 events
    expect(result).toBeDefined();
    expect(result.events).toBeDefined();
  });
});
```

- [ ] **Step 2: 补全 WorldEngine**

在现有 `step()` 方法中，日历推进后添加 NPC 月度逻辑：

```typescript
import { LifecycleManager } from '../lifecycle/lifecycle-manager.js';
import type { Character } from '@taosim/contracts';

// WorldEngine 中添加属性
private activeNPCs: Map<string, Character> = new Map();

// 修改 step() 方法：
public step(): MonthlyTickResult {
  this.advanceCalendar();

  const events: BigEventLog[] = [];
  let npcPopulationChanged = false;

  // 1. NPC 寿元检查
  for (const [id, npc] of this.activeNPCs) {
    const lifespanResult = LifecycleManager.checkLifespan(npc);
    if (lifespanResult.willDie) {
      const deathResult = LifecycleManager.handleDeath(npc, '寿元耗尽');
      npcPopulationChanged = true;
      events.push({
        id: `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        year: this.state.currentYear,
        month: this.state.currentMonth,
        isMajorEvent: false,
        title: `${npc.name} 坐化`,
        description: `${npc.name} 寿元耗尽，${deathResult.newSoulState === 'PrimordialSoul' ? '元神出窍' : '残魂消散'}`,
        involvedCharacterIds: [id],
      });
    } else {
      // 活着的 NPC：年龄+1
      npc.lifespan.age += 1 / 12;
    }
  }

  // 2. 清理已湮灭的 NPC
  for (const [id, npc] of this.activeNPCs) {
    if (npc.soulState === 'Oblivion') {
      this.activeNPCs.delete(id);
      npcPopulationChanged = true;
    }
  }

  // 3. NPC 人口补充（低于 800 则生成散修）
  if (this.activeNPCs.size < 800) {
    const count = Math.min(10, 800 - this.activeNPCs.size);
    for (let i = 0; i < count; i++) {
      const npc = this.generateWildCultivator();
      this.activeNPCs.set(npc.id, npc);
      npcPopulationChanged = true;
    }
  }

  return { updatedState: this.getState(), events, npcPopulationChanged };
}
```

添加 NPC 生成器方法：

```typescript
private npcCounter = 0;

private generateWildCultivator(): Character {
  const id = `NPC_${this.state.currentYear}_${this.state.currentMonth}_${++this.npcCounter}`;
  const realms: string[] = [
    'QiRefinement_1', 'QiRefinement_3', 'QiRefinement_5', 'QiRefinement_7', 'QiRefinement_9',
    'Foundation_1',
  ];
  const names = ['散修·李四', '散修·王五', '散修·赵六', '散修·陈七', '散修·刘八'];
  const realm = realms[Math.floor(Math.random() * realms.length)]!;

  return {
    id, name: names[Math.floor(Math.random() * names.length)]!,
    gender: 'Male',
    realm: realm as any,
    soulState: 'Active',
    cultivation: { currentExp: Math.floor(Math.random() * 500), maxExp: 500 },
    lifespan: { age: 20 + Math.floor(Math.random() * 60), maxLifespan: 100 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: {
      physique: 1 + Math.floor(Math.random() * 10),
      comprehension: 1 + Math.floor(Math.random() * 10),
      perception: 1 + Math.floor(Math.random() * 10),
      agility: 1 + Math.floor(Math.random() * 10),
      luck: 1 + Math.floor(Math.random() * 10),
    },
    hp: 100, maxHp: 100, ap: 3, canFly: realm.startsWith('Foundation'),
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [],
    skillCooldowns: {},
    traits: [],
    relations: {},
    wantedLevels: {},
  };
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/world-engine.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/world/world-engine.ts packages/engine/src/__tests__/world-engine.test.ts
git commit -m "feat(engine): full WorldEngine monthly tick — NPC lifespan, population, events"
```

---

#### Task C.2: WorldPage — 世界界面

**Files:**
- Modify: `apps/taosim-ui/src/pages/WorldPage.vue`
- Create: `apps/taosim-ui/src/composables/useWorld.ts`
- Modify: `apps/taosim-ui/src/pages/CultivationPage.vue`

- [ ] **Step 1: 创建 useWorld composable**

```typescript
// apps/taosim-ui/src/composables/useWorld.ts
import { reactive } from 'vue';
import { WorldEngine } from '@taosim/engine';
import { useAppStore } from '@/stores/app';
import type { BigEventLog } from '@taosim/contracts';

export function useWorld() {
  const appStore = useAppStore();
  const state = reactive({
    recentEvents: [] as BigEventLog[],
    advancing: false,
  });

  function advanceMonth() {
    if (!appStore.currentWorldState) return;
    const engine = new WorldEngine(appStore.currentWorldState);
    const result = engine.step();
    appStore.currentWorldState = result.updatedState;
    state.recentEvents = [result.events[0], ...state.recentEvents].slice(0, 50);
  }

  async function fastForward(months: number) {
    if (!appStore.currentWorldState) return;
    state.advancing = true;
    const engine = new WorldEngine(appStore.currentWorldState);

    // 分批推进，避免 UI 冻结
    const batchSize = 12;
    for (let i = 0; i < months; i += batchSize) {
      const batch = Math.min(batchSize, months - i);
      const result = engine.fastForward(batch);
      appStore.currentWorldState = result.updatedState;
      state.recentEvents = [...result.events, ...state.recentEvents].slice(0, 50);
      await new Promise(r => setTimeout(r, 50));
    }
    state.advancing = false;
  }

  return { state, advanceMonth, fastForward };
}
```

- [ ] **Step 2: 替换 WorldPage**

```vue
<script setup lang="ts">
import { useWorld } from '@/composables/useWorld';
import { useAppStore } from '@/stores/app';
import { usePlayerStore } from '@/stores/player';

const appStore = useAppStore();
const playerStore = usePlayerStore();
const { state, advanceMonth, fastForward } = useWorld();
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-display text-ink">大世界</h1>
      <div class="text-sm text-ink-soft">
        道历 {{ appStore.gameYear }} 年 {{ appStore.gameMonth }} 月
      </div>
    </div>

    <!-- 角色信息 -->
    <div class="bg-surface rounded-lg border border-line p-4 grid grid-cols-3 gap-4 text-sm">
      <div>
        <span class="text-muted">境界：</span>
        <span class="font-semibold text-jade">{{ playerStore.character?.realm }}</span>
      </div>
      <div>
        <span class="text-muted">寿元：</span>
        <span>{{ playerStore.character?.lifespan.age }}/{{ playerStore.character?.lifespan.maxLifespan }} 年</span>
      </div>
      <div>
        <span class="text-muted">灵力：</span>
        <span>{{ playerStore.character?.spiritEnergy.current }}/{{ playerStore.character?.spiritEnergy.max }}</span>
      </div>
    </div>

    <!-- 时间控制 -->
    <div class="bg-surface rounded-lg border border-line p-4 space-y-3">
      <h3 class="text-sm font-semibold text-ink-soft">时间推进</h3>
      <div class="flex gap-3">
        <button @click="advanceMonth" :disabled="state.advancing"
          class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold disabled:opacity-50">
          推进 1 个月
        </button>
        <button @click="fastForward(12)" :disabled="state.advancing"
          class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold disabled:opacity-50">
          闭关 1 年
        </button>
        <button @click="fastForward(120)" :disabled="state.advancing"
          class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold disabled:opacity-50">
          闭关 10 年
        </button>
      </div>
      <div v-if="state.advancing" class="text-sm text-muted">闭关中...</div>
    </div>

    <!-- 世界事件 -->
    <div class="bg-surface rounded-lg border border-line p-4">
      <h3 class="text-sm font-semibold text-ink-soft mb-3">世界事件</h3>
      <div v-if="state.recentEvents.length === 0" class="text-sm text-muted">
        时光静好，无事发生
      </div>
      <div v-else class="space-y-2 max-h-64 overflow-y-auto">
        <div
          v-for="event in state.recentEvents"
          :key="event.id"
          :class="['p-2 rounded text-sm', event.isMajorEvent ? 'bg-gold-soft' : 'bg-surface-muted']"
        >
          <span class="font-semibold">道历 {{ event.year }}/{{ event.month }}</span>
          — {{ event.title }}：{{ event.description }}
        </div>
      </div>
    </div>

    <!-- 导航 -->
    <div class="flex gap-3">
      <router-link to="/cultivation" class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold">
        闭关修炼
      </router-link>
      <router-link to="/battle" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        战棋测试
      </router-link>
      <router-link to="/tribulation" class="px-4 py-2 border border-line rounded-md text-sm text-ink-soft">
        渡劫突破
      </router-link>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 将 CultivationPage 接入真实闭关**

修改 `CultivationPage.vue`，用 `useWorld().fastForward` 替换 `setTimeout` mock。

- [ ] **Step 4: 运行 typecheck**

```bash
npm run typecheck -w @taosim/taosim-ui
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/pages/WorldPage.vue apps/taosim-ui/src/composables/useWorld.ts apps/taosim-ui/src/pages/CultivationPage.vue
git commit -m "feat(ui): WorldPage with time advance + event log + cultivation wired"
```

---

### Phase D: 程序化战棋地图

#### Task D.1: MapGenerator — 三层聚类地图生成

**Files:**
- Create: `packages/engine/src/world/map-generator.ts`
- Create: `packages/engine/src/__tests__/map-generator.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/map-generator.test.ts
import { describe, it, expect } from 'vitest';
import { MapGenerator } from '../world/map-generator.js';
import type { OverworldNode } from '@taosim/contracts';

describe('MapGenerator', () => {
  const nodeConfig: OverworldNode = {
    id: 'forest_cave',
    name: '密林洞窟',
    continentId: 'c1',
    coordinates: { x: 0, y: 0 },
    type: 'Dungeon',
    tier: 2,
    travelCostDays: 3,
    battleMapConfig: {
      baseTerrain: 'Forest',
      clusterDensity: 0.6,
      hazardProbability: 0.1,
    },
  };

  it('生成 7x7 地图，中心为平地', () => {
    const map = MapGenerator.generate(nodeConfig, { width: 7, height: 7 });
    expect(map.width).toBe(7);
    expect(map.height).toBe(7);
    // 中心 3,3 应为空地平地区域
    const center = map.tiles['3,3'];
    expect(center).toBeDefined();
    expect(center!.isBlocked).toBe(false);
  });

  it('障碍物数量受 hazardProbability 控制', () => {
    const safeConfig = { ...nodeConfig, battleMapConfig: { ...nodeConfig.battleMapConfig, hazardProbability: 0 } };
    const safeMap = MapGenerator.generate(safeConfig, { width: 7, height: 7 });
    const obstacles = Object.values(safeMap.tiles).filter(t => t.isBlocked);
    expect(obstacles.length).toBe(0);

    const dangerConfig = { ...nodeConfig, battleMapConfig: { ...nodeConfig.battleMapConfig, hazardProbability: 0.5 } };
    const dangerMap = MapGenerator.generate(dangerConfig, { width: 7, height: 7 });
    const dangerObstacles = Object.values(dangerMap.tiles).filter(t => t.isBlocked);
    expect(dangerObstacles.length).toBeGreaterThan(0);
  });

  it('生成的地图尺寸正确', () => {
    const map = MapGenerator.generate(nodeConfig, { width: 5, height: 5 });
    const tileCount = Object.keys(map.tiles).length;
    expect(tileCount).toBe(25);
  });
});
```

- [ ] **Step 2: 实现 MapGenerator**

```typescript
// packages/engine/src/world/map-generator.ts
import type { HexBattleMap, OverworldNode, TerrainType } from '@taosim/contracts';

interface MapSize {
  width: number;
  height: number;
}

export class MapGenerator {
  /**
   * 根据大地图节点配置生成 Hex 战棋地图。
   * 三层聚类：
   *   1. 中心留空（交战区）
   *   2. 根据 clusterDensity 散布主地形
   *   3. 根据 hazardProbability 散布障碍物/水域
   */
  static generate(node: OverworldNode, size: MapSize = { width: 7, height: 7 }): HexBattleMap {
    const { baseTerrain, clusterDensity, hazardProbability } = node.battleMapConfig;
    const tiles: Record<string, any> = {};

    const centerQ = Math.floor(size.width / 2);
    const centerR = Math.floor(size.height / 2);
    const clearRadius = 2; // 中心交战区半径

    for (let q = 0; q < size.width; q++) {
      for (let r = 0; r < size.height; r++) {
        const dq = q - centerQ;
        const dr = r - centerR;
        const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr));

        let terrain: TerrainType = 'Plain';
        let isBlocked = false;
        let isWater = false;

        // 第 1 层：中心保持空地
        if (dist > clearRadius) {
          // 第 2 层：主地形散布
          const terrainRoll = Math.random();
          if (terrainRoll < clusterDensity) {
            terrain = baseTerrain;
          } else {
            // 次级地形
            terrain = MapGenerator.pickSecondaryTerrain(baseTerrain);
          }

          // 第 3 层：障碍物
          const hazardRoll = Math.random();
          if (hazardRoll < hazardProbability) {
            if (baseTerrain === 'DeepWater' || baseTerrain === 'Swamp') {
              isWater = true;
            } else {
              isBlocked = true;
              terrain = 'Obstacle';
            }
          }
        }

        if (terrain === 'DeepWater') isWater = true;

        tiles[`${q},${r}`] = {
          q, r,
          terrain,
          elevation: 0,
          isBlocked,
          isWater,
          isRevealed: true,
        };
      }
    }

    return { width: size.width, height: size.height, tiles };
  }

  private static pickSecondaryTerrain(base: TerrainType): TerrainType {
    const pools: Record<TerrainType, TerrainType[]> = {
      Plain: ['Plain', 'Forest', 'Plain'],
      Forest: ['Forest', 'Plain', 'Swamp'],
      DeepWater: ['DeepWater', 'DeepWater', 'Plain'],
      Swamp: ['Swamp', 'Forest', 'DeepWater'],
      Lava: ['Lava', 'Obstacle', 'Plain'],
      Obstacle: ['Obstacle', 'Plain', 'Plain'],
      Void: ['Void', 'Void', 'Void'],
    };
    const pool = pools[base] ?? ['Plain', 'Forest', 'Plain'];
    return pool[Math.floor(Math.random() * pool.length)]!;
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/map-generator.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 4: 在 BattlePage 中使用 MapGenerator 替代硬编码地图**

修改 `BattlePage.vue` 中的 `buildTestMap()` 调用为：

```typescript
import { MapGenerator } from '@taosim/engine';

const testMap = MapGenerator.generate({
  id: 'forest_cave',
  name: '密林洞窟',
  continentId: 'c1',
  coordinates: { x: 0, y: 0 },
  type: 'Dungeon',
  tier: 2,
  travelCostDays: 3,
  battleMapConfig: {
    baseTerrain: 'Forest',
    clusterDensity: 0.6,
    hazardProbability: 0.1,
  },
});
```

- [ ] **Step 5: 更新 engine 导出索引**

```typescript
// packages/engine/src/index.ts — 添加：
export { MapGenerator } from './world/map-generator.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/engine/src/world/map-generator.ts packages/engine/src/__tests__/map-generator.test.ts packages/engine/src/index.ts apps/taosim-ui/src/pages/BattlePage.vue
git commit -m "feat(engine): add MapGenerator — procedural hex map + integrate into BattlePage"
```

---

### Phase E: 集成验证

#### Task E.1: 全量测试 + 推送

- [ ] **Step 1: 运行全量检查**

```bash
npm run check
```
Expected: typecheck 全通过，所有测试 PASS（目标：当前 23 个 + 新增 10 个 = 33 个）

- [ ] **Step 2: Commit & Push**

```bash
git add -A
git commit -m "chore: Phase 2 integrated — NPC AI + save/load + world evolution + procedural maps"
git push
```

---

## 总览

| Phase | 任务数 | 新增文件 | 修改文件 | 新测试 | 核心交付 |
|-------|--------|----------|----------|--------|----------|
| A (NPC AI) | 2 | 2 | 3 | npc-ai (3 tests) | 敌人会回合制战斗 |
| B (存档) | 2 | 2 | 2 | — | IndexedDB 存档/读档 |
| C (世界演化) | 2 | 2 | 3 | world-engine (4 tests) | 月度 Tick + 世界界面 |
| D (程序化地图) | 1 | 2 | 2 | map-generator (3 tests) | 动态生成 Hex 地形 |
| E (集成) | 1 | 0 | 0 | — | 全量验证 + push |
| **合计** | **8** | **8** | **10** | **10 tests** | **四大系统** |

**可并行：** Phase A (NPC AI) 与 Phase B (存档) 可同时开发。
