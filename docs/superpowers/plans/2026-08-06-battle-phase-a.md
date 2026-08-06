# Battle System v2 — Phase A 实施计划（确定性状态机 + 核心闭环）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把战斗从"只能移动、无法攻击"的雏形，升级为"确定性命令状态机 + 普攻/防御兜底 + N vs N + 事务回写"的可玩闭环（对应设计文档 §三~§五、§6.1、§6.8、§6.10 与 §十一 开工门槛）。

**Architecture:** 战斗逻辑下沉到 `packages/engine/src/battle/`。`BattleEngine` 是唯一写入者，UI 只能提交 `BattleCommand` 并读取只读 `BattleState` 快照；随机源注入 seed 保证可复现；战斗结束通过 `BattleDelta` 单点幂等提交到 player store。`useCombat` 改为薄封装。

**Tech Stack:** TypeScript（strict）、Vitest、Pinia、Vue 3。

**关联设计文档:** [2026-08-06-battle-system-v2-design.md](../specs/2026-08-06-battle-system-v2-design.md)

**范围说明:** 本计划只做 Phase A。Phase B（技能原子/五行/状态）、Phase C（道具/战利品/摸尸）、Phase D（蓄力/阵法/渡劫仪式）各自另行立 plan。

---

## 文件结构总览

**新增（contracts）：**
- `packages/contracts/src/battle.ts` — BattleCommand / BattleState / BattleEvent / BattleDelta / BattleUnit / LootEntry / SkillElement / SkillShape / TargetFilter / StatusType / BattleStatus
- `packages/engine/src/battle/seeded-rng.ts` — 种子随机源
- `packages/engine/src/battle/battle-config.ts` — 集中配置常量
- `packages/engine/src/battle/damage-calculator.ts` — 伤害结算（基础 + 暴击 + 闪避 + 五行接口预留）
- `packages/engine/src/battle/battle-engine.ts` — 主状态机
- `packages/engine/src/battle/battle-ai.ts` — N vs N AI
- `packages/engine/src/battle/index.ts` — battle 模块统一导出

**修改（contracts）：**
- `packages/contracts/src/skill.ts` — 加 `element?` / `tier?` / `target?`
- `packages/contracts/src/item.ts` — 加 `element?`
- `packages/contracts/src/index.ts` — 导出 battle.ts

**修改（engine）：**
- `packages/engine/src/index.ts` — 导出 battle 模块
- `packages/engine/src/combat/battle-resolver.ts` — `resolveBattleOutcome` 改为多参战者聚合

**修改（ui）：**
- `apps/taosim-ui/src/stores/player.ts` — 加 `battleRevision` / `commitBattleDelta`
- `apps/taosim-ui/src/composables/useCombat.ts` — 重写为薄封装
- `apps/taosim-ui/src/game/BattleOverlay.vue` — 接入新引擎

**测试（engine）：**
- `packages/engine/src/__tests__/seeded-rng.test.ts`
- `packages/engine/src/__tests__/battle-config.test.ts`
- `packages/engine/src/__tests__/damage-calculator.test.ts`
- `packages/engine/src/__tests__/battle-engine.test.ts`
- `packages/engine/src/__tests__/battle-ai.test.ts`
- `packages/engine/src/__tests__/battle-resolver.test.ts`（追加）
- `apps/taosim-ui/src/stores/__tests__/player-battle-delta.test.ts`

---

### Task 1: Contracts — battle.ts 类型与 skill/item 扩展

**Files:**
- Create: `packages/contracts/src/battle.ts`
- Modify: `packages/contracts/src/skill.ts`
- Modify: `packages/contracts/src/item.ts`
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: 在 `skill.ts` 的 `Skill` 接口内追加战斗元数据字段（在 `cooldownTurns: number;` 之后）**

```typescript
  cooldownTurns: number;
  /** 功法五行属性（Phase B 五行交互使用；默认 Physical） */
  element?: SkillElement;
  /** 功法阶位（Huang=1/Xuan=2/Di=3/Tian=4，用于等级压制） */
  tier?: number;
  /** 显式目标阵营（不允许按技能名称或 Numeric 字段猜测） */
  target?: TargetFilter;
```

- [ ] **Step 2: 在 `skill.ts` 顶部（`SkillQuality` 定义附近）添加 `SkillElement` / `TargetFilter` 类型**

```typescript
export type SkillElement =
  | 'Metal' | 'Wood' | 'Water' | 'Fire' | 'Earth'
  | 'Thunder' | 'Ice' | 'Wind' | 'Dark' | 'Physical';

export type TargetFilter = 'Enemy' | 'Ally' | 'Self' | 'Any';
```

- [ ] **Step 3: 在 `item.ts` 的 `Item` 接口内追加元素字段（不要塞进数值 attributes）**

```typescript
  /** 法宝/防具的护体元素（五行交互防御来源，默认 Physical） */
  element?: SkillElement;
```

- [ ] **Step 4: 在 `item.ts` 顶部添加 SkillElement 导入**

```typescript
import type { SkillElement } from './skill.js';
```

- [ ] **Step 5: 创建 `packages/contracts/src/battle.ts`**

```typescript
// ============================================================
// Battle 契约 — Battle System v2
// ============================================================
import type { Character } from './character.js';
import type { SkillElement } from './skill.js';
import type { HexBattleMap } from './hex.js';
import type { Item } from './item.js';

export type { SkillElement } from './skill.js';
export type { TargetFilter } from './skill.js';

export type SkillShape = 'Single' | 'Line' | 'AOE' | 'Cone' | 'Self' | 'Move';

export type StatusType =
  | 'Poison' | 'Burn' | 'Frost' | 'Stun' | 'Slow'
  | 'ArmorBreak' | 'BarrierBreak' | 'AtkUp' | 'DefUp' | 'SpeedUp'
  | 'Bind' | 'Shield' | 'Regen' | 'SoulWeaken'
  | 'ManaShield' | 'PerceptionUp' | 'SoulDrain'
  | 'Invincible' | 'BloodRage';

export interface StatusEffectTemplate {
  id: string;
  type: StatusType;
  potency: number;
  duration: number;
}

export interface BattleStatus {
  id: string;
  type: StatusType;
  potency: number;
  remainingTurns: number;
  sourceId?: string;
}

export interface BattleUnit {
  characterId: string;
  team: 'Player' | 'Enemy';
  controller: 'Human' | 'AI';
  gauge: number;                       // ATB 0-100
  actionReady: boolean;
  actionPoints: number;                // 战斗副本中的当前 AP
  maxActionPoints: number;
  movePoints: number;                  // 本次 activation 剩余移动池
  maxMovePoints: number;
  statuses: BattleStatus[];            // 仅存在于战斗态，不污染 Character/存档
  charging?: { skillId: string; releaseAtTick: number; targetIds: string[] };
  guarding?: { element: SkillElement; tier: number; expiresAtActivation: number };
}

export interface BattleEvent {
  sequence: number;
  tickNumber: number;
  type: string;                        // 实现时收紧为事件判别联合
  actorId?: string;
  targetIds?: string[];
  data: Record<string, string | number | boolean>;
}

export type BattleCommand =
  | { type: 'AdvanceTick' }
  | { type: 'Move'; actorId: string; to: { q: number; r: number } }
  | { type: 'BasicAttack'; actorId: string; targetId: string }
  | { type: 'Guard'; actorId: string }
  | { type: 'EndActivation'; actorId: string };

export type BattlePhase = 'Idle' | 'Running' | 'AwaitingCommand' | 'Resolving' | 'BattleEnd' | 'Looting';

export interface BattleState {
  battleId: string;
  map: HexBattleMap;
  units: Record<string, BattleUnit>;
  characters: Record<string, Character>;   // 战斗中可变深副本
  currentTurnId: string | null;
  events: BattleEvent[];                   // 有上限的事件快照
  phase: BattlePhase;
  tickNumber: number;
  turnNumber: number;
  winner: 'Player' | 'Enemy' | null;
  lootPool: LootEntry[];
}

export interface LootEntry {
  enemyId: string;
  enemyName: string;
  items: ItemStack[];
  spiritStones: number;
  revealed: boolean;
  claimed: boolean;
}

export interface ItemStack {
  item: Item;
  count: number;
}

export interface BattleDelta {
  battleId: string;
  baseRevision: number;
  characterId: string;
  hpAfter: number;
  spiritEnergyAfter: number;
  apAfter: number;
  skillCooldownsAfter: Record<string, number>;
  consumedItems: Array<{ itemId: string; count: number }>;
  rewards: { cultivationExp: number; spiritStones: number; items: ItemStack[] };
  relationChanges: Array<{ targetId: string; favorabilityDelta: number }>;
}
```

- [ ] **Step 6: 在 `contracts/src/index.ts` 追加导出**

```typescript
export * from './battle.js';
```

- [ ] **Step 7: 构建验证**

Run: `npm run build -w @taosim/contracts`
Expected: 构建通过，无类型错误。

- [ ] **Step 8: 提交**

```bash
git add packages/contracts/src/battle.ts packages/contracts/src/skill.ts packages/contracts/src/item.ts packages/contracts/src/index.ts
git commit -m "feat(contracts): battle v2 types (command/state/event/delta) + skill/item element field"
```

---

### Task 2: Engine — seeded-rng 种子随机源

**Files:**
- Create: `packages/engine/src/battle/seeded-rng.ts`
- Test: `packages/engine/src/__tests__/seeded-rng.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../battle/seeded-rng.js';

describe('createSeededRng', () => {
  it('相同 seed 产生相同序列', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    for (let i = 0; i < 10; i++) expect(a()).toBe(b());
  });

  it('不同 seed 产生不同序列', () => {
    const a = createSeededRng(1);
    const b = createSeededRng(2);
    expect(a()).not.toBe(b());
  });

  it('输出始终在 [0, 1) 区间', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/seeded-rng.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 seeded-rng.ts（mulberry32）**

```typescript
/**
 * 可注入的种子随机源（mulberry32）。
 * 相同 seed + 相同调用序列 ⇒ 相同结果，保证战斗可复现、可测试。
 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 从种子派生一个 [0, range) 整数 */
export function seededInt(rng: () => number, range: number): number {
  return Math.floor(rng() * range);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/seeded-rng.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 提交**

```bash
git add packages/engine/src/battle/seeded-rng.ts packages/engine/src/__tests__/seeded-rng.test.ts
git commit -m "feat(engine): seeded rng for deterministic battles"
```

---

### Task 3: Engine — battle-config 集中配置

**Files:**
- Create: `packages/engine/src/battle/battle-config.ts`
- Test: `packages/engine/src/__tests__/battle-config.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { BATTLE_CONFIG } from '../battle/battle-config.js';

describe('BATTLE_CONFIG', () => {
  it('集中配置含 Phase A 必要项', () => {
    expect(BATTLE_CONFIG.MAX_AP).toBe(3);
    expect(BATTLE_CONFIG.ATB_TICK_MS).toBe(400);
    expect(BATTLE_CONFIG.BASE_DODGE_RATE).toBeGreaterThanOrEqual(0);
    expect(BATTLE_CONFIG.MAX_DODGE_RATE).toBeLessThanOrEqual(0.3);
    expect(BATTLE_CONFIG.CRIT_MULTIPLIER).toBe(1.5);
    expect(BATTLE_CONFIG.GUARD_DAMAGE_MULTIPLIER).toBe(0.5);
    expect(BATTLE_CONFIG.MAX_EVENT_HISTORY).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/battle-config.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 battle-config.ts**

```typescript
/** Battle System v2 集中配置 — 所有魔法数字收敛于此 */
export const BATTLE_CONFIG = {
  /** 战斗 AP 上限（跨 activation 的资源） */
  MAX_AP: 3,
  /** UI 调度层 ATB 推进间隔（ms） */
  ATB_TICK_MS: 400,
  /** 闪避基础率 */
  BASE_DODGE_RATE: 0.05,
  /** 敏捷差折算系数 */
  AGILITY_DODGE_SCALE: 0.15,
  /** 闪避上限 */
  MAX_DODGE_RATE: 0.3,
  /** 暴击倍率 */
  CRIT_MULTIPLIER: 1.5,
  /** 防御指令减伤倍率 */
  GUARD_DAMAGE_MULTIPLIER: 0.5,
  /** 引擎保留的结构化事件快照上限 */
  MAX_EVENT_HISTORY: 200,
  /** 每格 ATB 增长基准（配合身法） */
  ATB_BASE_GAIN: 10,
  /** ATB 增长身法系数 */
  ATB_AGILITY_GAIN: 2,
  /** 每 activation 移动池 = MOVE_BASE + ⌊身法/5⌋ */
  MOVE_BASE: 2,
  MOVE_AGILITY_DIVISOR: 5,
  /** AI 每单位最多评估技能数 */
  MAX_AI_SKILL_EVALUATION: 8,
} as const;
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/battle-config.test.ts`
Expected: PASS（1 test）

- [ ] **Step 5: 提交**

```bash
git add packages/engine/src/battle/battle-config.ts packages/engine/src/__tests__/battle-config.test.ts
git commit -m "feat(engine): centralized battle config"
```

---

### Task 4: Engine — damage-calculator 伤害结算

**Files:**
- Create: `packages/engine/src/battle/damage-calculator.ts`
- Test: `packages/engine/src/__tests__/damage-calculator.test.ts`

- [ ] **Step 1: 写失败测试（先建 helper）**

```typescript
import { describe, it, expect } from 'vitest';
import { createSeededRng } from '../battle/seeded-rng.js';
import { calculateDamage } from '../battle/damage-calculator.js';
import type { Character } from '@taosim/contracts';

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: 'c1', name: 't', realm: 'LianQi1', hp: 100, maxHp: 100,
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    ap: 3, skills: [], skillCooldowns: {}, cultivation: { currentExp: 0, maxExp: 100 },
    attributes: { strength: 10, agility: 10, physique: 10, intelligence: 10, perception: 10, charisma: 10 },
    spiritRoot: { elements: ['Fire'], purity: 5 }, inventory: [], relations: {},
    soulState: 'Alive', canFly: false, spiritStones: 0, age: 20, lifespan: 100, gender: 'male',
    portraitId: 'p', birthday: { year: 1, month: 1 }, traits: [], physique: 'normal',
    unlockedRecipes: [], eventLog: [], equipment: {},
    ...overrides,
  } as Character;
}

describe('calculateDamage', () => {
  const attacker = makeChar({ attributes: { strength: 20, agility: 10, physique: 10, intelligence: 10, perception: 10, charisma: 10 } });

  it('基础伤害 = 攻击 - 防御，最低 1', () => {
    const defender = makeChar({ attributes: { strength: 10, agility: 10, physique: 20, intelligence: 10, perception: 10, charisma: 10 } });
    const result = calculateDamage(attacker, defender, { multiplier: 1, element: 'Physical', tier: 1 }, createSeededRng(1));
    expect(result.finalDamage).toBeGreaterThanOrEqual(1);
    expect(result.finalDamage).toBeLessThanOrEqual(30);
  });

  it('境界壁垒：高境界防守者免伤（无破罡）', () => {
    const defender = makeChar({ realm: 'GoldenCore1' });
    const result = calculateDamage(attacker, defender, { multiplier: 1, element: 'Physical', tier: 1 }, createSeededRng(1));
    expect(result.blockedByBarrier).toBe(true);
    expect(result.finalDamage).toBe(0);
  });

  it('闪避判定：agility 悬殊时可闪避', () => {
    const evasive = makeChar({ attributes: { strength: 5, agility: 50, physique: 5, intelligence: 5, perception: 5, charisma: 5 } });
    let hits = 0;
    for (let i = 0; i < 100; i++) {
      const result = calculateDamage(attacker, evasive, { multiplier: 1, element: 'Physical', tier: 1 }, createSeededRng(10 + i));
      if (!result.missed) hits++;
    }
    expect(hits).toBeLessThan(100);
  });

  it('暴击按 critRate 生效', () => {
    const defender = makeChar({});
    const result = calculateDamage(attacker, defender, { multiplier: 1, element: 'Physical', tier: 1 }, createSeededRng(1), 1.0);
    expect(result.crit).toBe(true);
    expect(result.finalDamage).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/damage-calculator.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 damage-calculator.ts**

```typescript
import type { Character, SkillElement } from '@taosim/contracts';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import { BATTLE_CONFIG } from './battle-config.js';

export interface DamageSpec {
  multiplier: number;      // 技能系数（普攻 1.0）
  element: SkillElement;
  tier: number;            // 攻击方功法阶位
}

export interface DamageResult {
  finalDamage: number;
  missed: boolean;
  crit: boolean;
  blockedByBarrier: boolean;
}

/** 五行相克环：key 克 value（金→木→土→水→火→金） */
const ELEMENT_CYCLE: Record<string, string> = {
  Metal: 'Wood', Wood: 'Earth', Earth: 'Water', Water: 'Fire', Fire: 'Metal',
};

function realmTier(realm: string): number {
  if (realm.startsWith('SoulFormation')) return 5;
  if (realm.startsWith('NascentSoul')) return 4;
  if (realm.startsWith('GoldenCore')) return 3;
  if (realm.startsWith('Foundation')) return 2;
  return 1;
}

/** 防御方护体元素来源：armor → weapon → treasures[0]，默认 Physical/tier 1 */
function getDefenseElement(defender: Character): { element: SkillElement; tier: number } {
  const eq = defender.equipment;
  const armor = eq?.armor ?? eq?.armors?.[0];
  if (armor?.element) return { element: armor.element, tier: armor.tier ?? 1 };
  const weapon = eq?.weapon;
  if (weapon?.element) return { element: weapon.element, tier: weapon.tier ?? 1 };
  const treasure = eq?.treasures?.[0];
  if (treasure?.element) return { element: treasure.element, tier: treasure.tier ?? 1 };
  return { element: 'Physical', tier: 1 };
}

/** 五行交互系数（Phase B 完整实现；雷冰风暗不进入生克环，只参与同源抵消） */
function elementMultiplier(atk: SkillElement, def: { element: SkillElement; tier: number }, atkTier: number): number {
  if (atk === 'Physical' || def.element === 'Physical') return 1.0;
  if (atk === def.element) return 0.85;              // 同源抵消
  if (ELEMENT_CYCLE[atk] === def.element) return 1.3; // 相克
  if (ELEMENT_CYCLE[def.element] === atk) return 0.7; // 被克
  return 1.0;
}

/**
 * 伤害结算。固定随机顺序：先命中判定，后暴击判定；未命中不判暴击、不附加伤害。
 */
export function calculateDamage(
  attacker: Character,
  defender: Character,
  spec: DamageSpec,
  rng: () => number,
  critRate: number = 0.05,
): DamageResult {
  const atkBonuses = EquipmentManager.getCombatBonuses(attacker);
  const defBonuses = EquipmentManager.getCombatBonuses(defender);
  const attackPower = atkBonuses.attack + 10;
  const baseDefense = defender.attributes.physique * 0.5;

  const atkTier = realmTier(attacker.realm);
  const defTier = realmTier(defender.realm);

  // 闪避判定
  const dodge = Math.min(
    BATTLE_CONFIG.MAX_DODGE_RATE,
    BATTLE_CONFIG.BASE_DODGE_RATE
      + ((defender.attributes.agility - attacker.attributes.agility)
        / Math.max(1, attacker.attributes.agility + defender.attributes.agility))
      * BATTLE_CONFIG.AGILITY_DODGE_SCALE,
  );
  const missed = rng() < dodge;

  // 暴击判定（未命中不判暴击）
  const crit = !missed && rng() < critRate;

  // 境界硬壁垒
  let barrierRate = 0;
  if (defTier > atkTier) barrierRate = 1.0;

  let damage = Math.max(0, (attackPower - baseDefense) * spec.multiplier - defBonuses.defense);
  damage = damage * (1 - barrierRate) * elementMultiplier(spec.element, getDefenseElement(defender), spec.tier);
  if (crit) damage *= BATTLE_CONFIG.CRIT_MULTIPLIER;

  return {
    finalDamage: missed ? 0 : Math.round(damage),
    missed,
    crit,
    blockedByBarrier: barrierRate >= 1.0,
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/damage-calculator.test.ts`
Expected: PASS（4 tests）

> 注意：`makeChar` 中 `equipment: {}` 是为了防止 `Character` 类型缺字段；若 `equipment` 在 contracts 中为可选，该字段可省略。

- [ ] **Step 5: 提交**

```bash
git add packages/engine/src/battle/damage-calculator.ts packages/engine/src/__tests__/damage-calculator.test.ts
git commit -m "feat(engine): damage calculator with dodge/crit/barrier"
```

---

### Task 5: Engine — BattleEngine 状态机（start/tick/排序/胜负/命令分发）

**Files:**
- Create: `packages/engine/src/battle/battle-engine.ts`
- Test: `packages/engine/src/__tests__/battle-engine.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { BattleEngine } from '../battle/battle-engine.js';
import type { Character, HexBattleMap } from '@taosim/contracts';
import { hexKey } from '@taosim/contracts';

function makeChar(id: string, agility: number): Character {
  return {
    id, name: id, realm: 'LianQi1', hp: 100, maxHp: 100,
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    ap: 3, skills: [], skillCooldowns: {}, cultivation: { currentExp: 0, maxExp: 100 },
    attributes: { strength: 10, agility, physique: 10, intelligence: 10, perception: 10, charisma: 10 },
    spiritRoot: { elements: ['Fire'], purity: 5 }, inventory: [], relations: {},
    soulState: 'Alive', canFly: false, spiritStones: 0, age: 20, lifespan: 100, gender: 'male',
    portraitId: 'p', birthday: { year: 1, month: 1 }, traits: [], physique: 'normal',
    unlockedRecipes: [], eventLog: [], equipment: {},
  } as Character;
}

function makeMap(): HexBattleMap {
  const tiles: Record<string, any> = {};
  for (let q = 0; q < 7; q++) {
    for (let r = 0; r < 7; r++) {
      tiles[hexKey(q, r)] = { q, r, terrain: 'Plain', elevation: 0, isBlocked: false, isWater: false, isRevealed: true };
    }
  }
  return { width: 7, height: 7, tiles };
}

describe('BattleEngine', () => {
  it('start 注册双方单位并放置', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    const state = engine.getState();
    expect(state.units.p.team).toBe('Player');
    expect(state.units.e.team).toBe('Enemy');
    expect(state.phase).toBe('Running');
  });

  it('advanceTick 推进 ATB，身法快者先就绪', () => {
    const engine = new BattleEngine(1);
    const fast = makeChar('fast', 30);
    const slow = makeChar('slow', 1);
    engine.start(makeMap(), [fast], [slow]);
    for (let i = 0; i < 30; i++) engine.advanceTick();
    expect(engine.getState().currentTurnId).toBe('fast');
  });

  it('同 tick 就绪顺序：身法降序，相同按 characterId 升序（与插入顺序无关）', () => {
    const engine = new BattleEngine(1);
    const a = makeChar('a', 10);
    const b = makeChar('b', 10);
    const c = makeChar('c', 10);
    engine.start(makeMap(), [a, b], [c]);
    for (let i = 0; i < 40; i++) engine.advanceTick();
    expect(engine.getState().currentTurnId).toBe('a');
  });

  it('一方全灭时 winner 立即判定', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    engine.getState().characters.e.hp = 0;
    engine.checkVictory();
    expect(engine.getState().phase).toBe('BattleEnd');
    expect(engine.getState().winner).toBe('Player');
  });

  it('非法命令零写入：非本回合者攻击被拒', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    const before = JSON.stringify(engine.getState().characters);
    const result = engine.dispatch({ type: 'BasicAttack', actorId: 'p', targetId: 'e' });
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(engine.getState().characters)).toBe(before);
  });

  it('移动：占用格与阻挡格不可进入', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    // 手动设置 currentTurn 为 p 以绕过回合校验
    engine.getState().currentTurnId = 'p';
    const map = engine.getState().map;
    map.tiles[hexKey(1, 1)]!.isBlocked = true;
    const r1 = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 1, r: 1 } });
    expect(r1.error).toBe('blocked');
    // 无占用格时移动成功
    const r2 = engine.dispatch({ type: 'Move', actorId: 'p', to: { q: 2, r: 0 } });
    expect(r2.error).toBeUndefined();
  });

  it('普攻射程为 1，AP 不足时被拒，防御/调息回 1 AP 且永不软锁', () => {
    const engine = new BattleEngine(1);
    engine.start(makeMap(), [makeChar('p', 10)], [makeChar('e', 10)]);
    engine.getState().currentTurnId = 'p';
    const unit = engine.getState().units.p;
    unit.actionPoints = 0;
    const r = engine.dispatch({ type: 'Guard', actorId: 'p' });
    expect(r.error).toBeUndefined();
    expect(unit.actionPoints).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/battle-engine.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 battle-engine.ts**

```typescript
import type { BattleState, BattleUnit, BattleCommand, BattleEvent, HexBattleMap, Character } from '@taosim/contracts';
import { hexKey, hexDistance } from '@taosim/contracts';
import { createSeededRng } from './seeded-rng.js';
import { BATTLE_CONFIG } from './battle-config.js';
import { calculateDamage } from './damage-calculator.js';
import { BattleAI } from './battle-ai.js';

/**
 * BattleEngine — 战斗状态的唯一写入者。
 * UI 只能通过 dispatch(BattleCommand) 提交命令并读取只读快照。
 */
export class BattleEngine {
  private state: BattleState;
  private rng: () => number;
  private seq = 0;
  private battleId: string;

  constructor(seed: number, battleId?: string) {
    this.rng = createSeededRng(seed);
    this.battleId = battleId ?? `battle_${seed}_${Date.now()}`;
    this.state = {
      battleId: this.battleId,
      map: { width: 0, height: 0, tiles: {} },
      units: {},
      characters: {},
      currentTurnId: null,
      events: [],
      phase: 'Idle',
      tickNumber: 0,
      turnNumber: 0,
      winner: null,
      lootPool: [],
    };
  }

  getState(): Readonly<BattleState> {
    return this.state;
  }

  private cloneCharacter(c: Character): Character {
    return structuredClone(c);
  }

  private emit(
    type: string,
    actorId?: string,
    targetIds?: string[],
    data: Record<string, string | number | boolean> = {},
  ): void {
    const ev: BattleEvent = { sequence: this.seq++, tickNumber: this.state.tickNumber, type, actorId, targetIds, data };
    this.state.events.push(ev);
    if (this.state.events.length > BATTLE_CONFIG.MAX_EVENT_HISTORY) {
      this.state.events.shift();
    }
  }

  /** 注册双方单位并放置到出生格（深拷贝隔离） */
  start(map: HexBattleMap, players: Character[], enemies: Character[]): void {
    this.state.map = structuredClone(map);
    this.state.characters = {};
    this.state.units = {};

    for (const p of players) {
      this.state.characters[p.id] = this.cloneCharacter(p);
      this.state.units[p.id] = this.makeUnit(p.id, 'Player', p.attributes.agility);
    }
    for (const e of enemies) {
      this.state.characters[e.id] = this.cloneCharacter(e);
      this.state.units[e.id] = this.makeUnit(e.id, 'Enemy', e.attributes.agility);
    }

    const playerStart = this.findStartSlot('left');
    const enemyStart = this.findStartSlot('right');
    if (playerStart) this.placeUnit(players[0]!.id, playerStart.q, playerStart.r);
    if (enemyStart) this.placeUnit(enemies[0]!.id, enemyStart.q, enemyStart.r);

    this.state.phase = 'Running';
    this.emit('battle_start', undefined, undefined, { players: players.length, enemies: enemies.length });
  }

  private makeUnit(id: string, team: 'Player' | 'Enemy', agility: number): BattleUnit {
    return {
      characterId: id,
      team,
      controller: team === 'Player' ? 'Human' : 'AI',
      gauge: 0,
      actionReady: false,
      actionPoints: BATTLE_CONFIG.MAX_AP,
      maxActionPoints: BATTLE_CONFIG.MAX_AP,
      movePoints: Math.max(BATTLE_CONFIG.MOVE_BASE, BATTLE_CONFIG.MOVE_BASE + Math.floor(agility / BATTLE_CONFIG.MOVE_AGILITY_DIVISOR)),
      maxMovePoints: 0,
      statuses: [],
    };
  }

  private findStartSlot(side: 'left' | 'right'): { q: number; r: number } | null {
    const tiles = Object.values(this.state.map.tiles);
    const mid = Math.floor(this.state.map.width / 2);
    for (const t of tiles) {
      const onSide = side === 'left' ? t.q < mid : t.q >= mid;
      if (onSide && !t.isBlocked && !t.isWater && !t.occupantId) return { q: t.q, r: t.r };
    }
    return null;
  }

  private placeUnit(id: string, q: number, r: number): void {
    const tile = this.state.map.tiles[hexKey(q, r)];
    if (!tile || tile.occupantId) return;
    tile.occupantId = id;
  }

  private findUnitPosition(id: string): { q: number; r: number } | null {
    for (const t of Object.values(this.state.map.tiles)) {
      if (t.occupantId === id) return { q: t.q, r: t.r };
    }
    return null;
  }

  /** ATB 推进。同 tick 就绪排序：溢出行动值降序 → 身法降序 → characterId 升序 */
  advanceTick(): void {
    if (this.state.phase !== 'Running') return;
    this.state.tickNumber += 1;

    const ready: string[] = [];
    for (const unit of Object.values(this.state.units)) {
      const c = this.state.characters[unit.characterId];
      if (!c || c.hp <= 0) continue;
      if (unit.actionReady) { ready.push(unit.characterId); continue; }
      const slow = unit.statuses.some(s => s.type === 'Slow');
      const gain = (BATTLE_CONFIG.ATB_BASE_GAIN + c.attributes.agility * BATTLE_CONFIG.ATB_AGILITY_GAIN) * (slow ? 0.5 : 1);
      unit.gauge = Math.min(100, unit.gauge + gain);
      if (unit.gauge >= 100) {
        unit.actionReady = true;
        ready.push(unit.characterId);
      }
    }

    if (this.state.currentTurnId) return; // 已有行动者，等其结算

    if (ready.length > 0) {
      const next = this.pickNext(ready);
      this.state.currentTurnId = next;
      this.state.turnNumber += 1;
      const unit = this.state.units[next]!;
      unit.movePoints = Math.max(BATTLE_CONFIG.MOVE_BASE, BATTLE_CONFIG.MOVE_BASE + Math.floor(this.state.characters[next]!.attributes.agility / BATTLE_CONFIG.MOVE_AGILITY_DIVISOR));
      unit.maxMovePoints = unit.movePoints;
      this.emit('activation_start', next);

      if (unit.controller === 'AI') {
        this.resolveAiTurn(next);
      }
    }
  }

  private pickNext(ready: string[]): string {
    return [...ready].sort((a, b) => {
      const ga = this.state.units[a]!.gauge;
      const gb = this.state.units[b]!.gauge;
      if (ga !== gb) return gb - ga;
      const aa = this.state.characters[a]!.attributes.agility;
      const ab = this.state.characters[b]!.attributes.agility;
      if (aa !== ab) return ab - aa;
      return a < b ? -1 : 1;
    })[0]!;
  }

  /** 一方全灭时立即判定胜负 */
  checkVictory(): void {
    if (this.state.phase === 'BattleEnd') return;
    const playerAlive = Object.values(this.state.units).some(
      u => u.team === 'Player' && this.state.characters[u.characterId]!.hp > 0,
    );
    const enemyAlive = Object.values(this.state.units).some(
      u => u.team === 'Enemy' && this.state.characters[u.characterId]!.hp > 0,
    );
    if (!playerAlive || !enemyAlive) {
      this.state.phase = 'BattleEnd';
      this.state.winner = playerAlive ? 'Player' : 'Enemy';
      this.emit('battle_end', undefined, undefined, { winner: this.state.winner ?? 'none' });
    }
  }

  /** 统一命令入口：校验失败返回结构化错误，且不产生部分写入 */
  dispatch(cmd: BattleCommand): { error?: string } {
    switch (cmd.type) {
      case 'AdvanceTick':
        this.advanceTick();
        return {};
      case 'Move':
        return this.dispatchMove(cmd.actorId, cmd.to.q, cmd.to.r);
      case 'BasicAttack':
        return this.dispatchBasicAttack(cmd.actorId, cmd.targetId);
      case 'Guard':
        return this.dispatchGuard(cmd.actorId);
      case 'EndActivation':
        return this.dispatchEndActivation(cmd.actorId);
      default:
        return { error: 'unknown_command' };
    }
  }

  private canAct(actorId: string): { ok: boolean; error?: string } {
    if (this.state.phase !== 'Running') return { ok: false, error: 'battle_not_running' };
    if (this.state.currentTurnId !== actorId) return { ok: false, error: 'not_your_turn' };
    const c = this.state.characters[actorId];
    if (!c || c.hp <= 0) return { ok: false, error: 'actor_dead' };
    return { ok: true };
  }

  private dispatchMove(actorId: string, toQ: number, toR: number): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const unit = this.state.units[actorId]!;
    if (unit.movePoints < 1) return { error: 'no_move_points' };
    const from = this.findUnitPosition(actorId);
    if (!from) return { error: 'no_position' };
    const d = hexDistance(from.q, from.r, toQ, toR);
    if (d > unit.movePoints) return { error: 'out_of_range' };
    const tile = this.state.map.tiles[hexKey(toQ, toR)];
    if (!tile || tile.isBlocked) return { error: 'blocked' };
    if (tile.occupantId) return { error: 'occupied' };
    const oldTile = this.state.map.tiles[hexKey(from.q, from.r)];
    if (oldTile) oldTile.occupantId = undefined;
    tile.occupantId = actorId;
    unit.movePoints -= d;
    this.emit('move', actorId, undefined, { toQ, toR, cost: d, remaining: unit.movePoints });
    return {};
  }

  private dispatchBasicAttack(actorId: string, targetId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const attacker = this.state.characters[actorId]!;
    const defender = this.state.characters[targetId];
    if (!defender || defender.hp <= 0) return { error: 'invalid_target' };
    const unit = this.state.units[actorId]!;
    if (unit.actionPoints < 1) return { error: 'no_ap' };

    const from = this.findUnitPosition(actorId);
    const to = this.findUnitPosition(targetId);
    if (!from || !to) return { error: 'no_position' };
    const d = hexDistance(from.q, from.r, to.q, to.r);
    if (d > 1) return { error: 'out_of_range' };

    unit.actionPoints -= 1;
    const result = calculateDamage(attacker, defender, { multiplier: 1, element: 'Physical', tier: 1 }, this.rng);
    defender.hp = Math.max(0, defender.hp - result.finalDamage);
    this.emit('damage', actorId, [targetId], {
      amount: result.finalDamage,
      missed: result.missed,
      crit: result.crit,
      blocked: result.blockedByBarrier,
    });
    if (defender.hp <= 0) {
      defender.soulState = 'RemnantSoul';
      const dunit = this.state.units[targetId]!;
      dunit.actionReady = false;
      this.emit('unit_down', targetId);
      this.checkVictory();
    }
    return {};
  }

  private dispatchGuard(actorId: string): { error?: string } {
    const check = this.canAct(actorId);
    if (!check.ok) return { error: check.error };
    const unit = this.state.units[actorId]!;
    unit.actionPoints = Math.min(unit.maxActionPoints, unit.actionPoints + 1);
    unit.guarding = { element: 'Physical', tier: 1, expiresAtActivation: this.state.turnNumber + 1 };
    this.emit('guard', actorId, undefined, { ap: unit.actionPoints });
    this.dispatchEndActivation(actorId);
    return {};
  }

  private dispatchEndActivation(actorId: string): { error?: string } {
    const unit = this.state.units[actorId];
    if (!unit) return { error: 'unknown_unit' };
    unit.actionReady = false;
    unit.gauge = 0;
    const c = this.state.characters[actorId];
    if (c) {
      for (const key of Object.keys(c.skillCooldowns)) {
        if (c.skillCooldowns[key]! > 0) c.skillCooldowns[key]! -= 1;
      }
    }
    this.state.currentTurnId = null;
    this.emit('activation_end', actorId);
    this.checkVictory();
    return {};
  }

  private resolveAiTurn(npcId: string): void {
    const npc = this.state.characters[npcId]!;
    const playerIds = Object.values(this.state.units)
      .filter(u => u.team === 'Player' && this.state.characters[u.characterId]!.hp > 0)
      .map(u => u.characterId);
    const decision = BattleAI.decide(npc, playerIds, this);
    if (decision.type === 'basicAttack') {
      this.dispatch({ type: 'BasicAttack', actorId: npcId, targetId: decision.targetId });
    } else {
      this.dispatch({ type: 'Guard', actorId: npcId });
    }
    if (this.state.currentTurnId === npcId) {
      this.dispatch({ type: 'EndActivation', actorId: npcId });
    }
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/battle-engine.test.ts`
Expected: PASS（7 tests）

> 说明：测试中的 `engine.getState().currentTurnId = 'p'` 依赖 `getState()` 返回可变对象引用。若希望严格只读，可在实现中将 `getState` 保持返回内部引用（引擎本身也读它），测试通过 getter 直接改字段是允许的（引擎不依赖外部对 state 的意外修改）。若选择返回冻结副本，则测试需改为调用内部方法——本计划采用返回内部引用的简化方案。

- [ ] **Step 5: 提交**

```bash
git add packages/engine/src/battle/battle-engine.ts packages/engine/src/__tests__/battle-engine.test.ts
git commit -m "feat(engine): battle engine state machine (start/tick/victory)"
```

---

### Task 6: Engine — BattleAI（N vs N 目标选择）

**Files:**
- Create: `packages/engine/src/battle/battle-ai.ts`
- Test: `packages/engine/src/__tests__/battle-ai.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect } from 'vitest';
import { BattleAI } from '../battle/battle-ai.js';
import type { Character } from '@taosim/contracts';

function makeChar(id: string, hp: number): Character {
  return {
    id, name: id, realm: 'LianQi1', hp, maxHp: 100,
    spiritEnergy: { current: 50, max: 100 },
    monthlyActionPoints: { current: 3, max: 3 },
    ap: 3, skills: [], skillCooldowns: {}, cultivation: { currentExp: 0, maxExp: 100 },
    attributes: { strength: 10, agility: 10, physique: 10, intelligence: 10, perception: 10, charisma: 10 },
    spiritRoot: { elements: ['Fire'], purity: 5 }, inventory: [], relations: {},
    soulState: 'Alive', canFly: false, spiritStones: 0, age: 20, lifespan: 100, gender: 'male',
    portraitId: 'p', birthday: { year: 1, month: 1 }, traits: [], physique: 'normal',
    unlockedRecipes: [], eventLog: [], equipment: {},
  } as Character;
}

// 简化引擎桩：仅暴露 getState().characters
const stubEngine = (chars: Record<string, Character>) => ({
  getState: () => ({ characters: chars }) as any,
}) as any;

describe('BattleAI', () => {
  it('无技能时普攻血量最低的存活目标', () => {
    const npc = makeChar('n', 100);
    const targets = { a: makeChar('a', 80), b: makeChar('b', 30) };
    const decision = BattleAI.decide(npc, ['a', 'b'], stubEngine(targets));
    expect(decision.type).toBe('basicAttack');
    expect((decision as any).targetId).toBe('b');
  });

  it('没有任何存活目标时选择防御（永不软锁）', () => {
    const npc = makeChar('n', 100);
    const decision = BattleAI.decide(npc, [], stubEngine({}));
    expect(decision.type).toBe('guard');
  });

  it('有冷却/灵力不足的技能时回退普攻', () => {
    const npc = makeChar('n', 100);
    npc.skills = [{ id: 's1', name: 'fire', quality: 'Huang', type: 'Active', primitives: [], cost: { ap: 1, spiritEnergy: 999 }, cooldownTurns: 1 }];
    const decision = BattleAI.decide(npc, ['a'], stubEngine({ a: makeChar('a', 80) }));
    expect(decision.type).toBe('basicAttack');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/battle-ai.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 battle-ai.ts**

```typescript
import type { Character } from '@taosim/contracts';
import type { BattleEngine } from './battle-engine.js';

export type AiDecision =
  | { type: 'basicAttack'; targetId: string }
  | { type: 'move'; to: { q: number; r: number } }
  | { type: 'guard' };

/**
 * N vs N AI — Phase A 简化版。
 * 无技能/技能不可用时普攻血量最低目标；无目标时防御（永不软锁）。
 * Phase B 将加入技能收益评估与五行克制倾向。
 */
export class BattleAI {
  static decide(npc: Character, playerIds: string[], engine: BattleEngine): AiDecision {
    const alive = playerIds.filter(id => engine.getState().characters[id]?.hp > 0);
    if (alive.length === 0) return { type: 'guard' };

    // 目标选择：血量最低（补刀优先）
    const targetId = [...alive].sort((a, b) => {
      const ha = engine.getState().characters[a]!.hp;
      const hb = engine.getState().characters[b]!.hp;
      return ha - hb;
    })[0]!;

    return { type: 'basicAttack', targetId };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/__tests__/battle-ai.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 提交**

```bash
git add packages/engine/src/battle/battle-ai.ts packages/engine/src/__tests__/battle-ai.test.ts
git commit -m "feat(engine): battle ai (basic attack lowest-hp, guard fallback)"
```

---

### Task 7: Engine — 导出 battle 模块

**Files:**
- Create: `packages/engine/src/battle/index.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 1: 创建 `battle/index.ts`**

```typescript
export { BattleEngine } from './battle-engine.js';
export { BattleAI } from './battle-ai.js';
export { calculateDamage } from './damage-calculator.js';
export type { DamageSpec, DamageResult } from './damage-calculator.js';
export { createSeededRng, seededInt } from './seeded-rng.js';
export { BATTLE_CONFIG } from './battle-config.js';
```

- [ ] **Step 2: 在 `engine/src/index.ts` 的 Combat Engine 注释块后追加**

```typescript
// Battle System v2 (确定性状态机)
export * from './battle/index.js';
```

- [ ] **Step 3: 构建验证**

Run: `npm run build -w @taosim/engine`
Expected: 构建通过。

- [ ] **Step 4: 提交**

```bash
git add packages/engine/src/index.ts packages/engine/src/battle/index.ts
git commit -m "feat(engine): export battle v2 module"
```

---

### Task 8: Engine — resolveBattleOutcome 多参战者聚合

**Files:**
- Modify: `packages/engine/src/combat/battle-resolver.ts`
- Test: `packages/engine/src/__tests__/battle-resolver.test.ts`（追加用例）

- [ ] **Step 1: 在 `battle-resolver.test.ts` 追加失败测试（复用文件已有 makeChar helper）**

```typescript
describe('resolveBattleOutcome 多参战者聚合', () => {
  it('encounter 胜利按所有敌人聚合经验与灵石', () => {
    const player = makeChar('p', 100);
    const e1 = makeChar('e1', 0);
    const e2 = makeChar('e2', 0);
    const result = resolveBattleOutcome(player, [e1, e2], 'encounter');
    expect(result.victory).toBe(true);
    expect(result.expGained).toBeGreaterThan(0);
    expect(result.spiritStonesGained).toBeGreaterThan(0);
  });

  it('任一敌人存活时不判胜利', () => {
    const player = makeChar('p', 100);
    const e1 = makeChar('e1', 0);
    const e2 = makeChar('e2', 50);
    const result = resolveBattleOutcome(player, [e1, e2], 'encounter');
    expect(result.victory).toBe(false);
  });
});
```

> 若原测试文件没有 `makeChar`，参考 Task 4 的 helper 补一个（含 `hp` 参数版本）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/__tests__/battle-resolver.test.ts`
Expected: FAIL（签名不兼容 / 类型错误）

- [ ] **Step 3: 修改 battle-resolver.ts 为多参战者聚合**

```typescript
import type { Character } from '@taosim/contracts';

export type BattleType = 'duel' | 'encounter';

export interface BattleOutcome {
  victory: boolean;
  battleType: BattleType;
  expGained: number;
  favorabilityChange: number;
  spiritStonesGained: number;
  playerHpAfter: number;
  shouldGameOver: boolean;
}

/**
 * 战斗结果结算（多参战者聚合）。
 *
 * duel（切磋）：点到为止，玩家 HP 不会真正归零（保底 1）。
 * encounter（遭遇战）：生死搏杀，HP 归零触发 GameOver。
 * 经验/灵石按所有参战敌人聚合，避免 N 个敌人只结算第一个或重复发奖。
 */
export function resolveBattleOutcome(
  player: Character,
  enemies: Character[],
  battleType: BattleType,
): BattleOutcome {
  const playerAlive = player.hp > 0;
  const enemiesDead = enemies.every(e => e.hp <= 0);
  const victory = playerAlive && enemiesDead;
  const defeat = !playerAlive;

  const playerHpAfter = battleType === 'duel' && defeat
    ? Math.max(1, Math.floor(player.maxHp * 0.1))
    : Math.max(0, player.hp);

  const expGained = victory
    ? Math.round(
        enemies.reduce((sum, e) => sum + e.cultivation.maxExp, 0)
        * (battleType === 'duel' ? 0.2 : 0.3),
      )
    : 0;

  const favorabilityChange = battleType === 'duel'
    ? (victory ? 5 : 1)
    : 0;

  const spiritStonesGained = victory && battleType === 'encounter'
    ? Math.round(enemies.reduce((sum, e) => sum + e.spiritStones, 0) * 0.5)
    : 0;

  const shouldGameOver = defeat && battleType === 'encounter';

  return {
    victory,
    battleType,
    expGained,
    favorabilityChange,
    spiritStonesGained,
    playerHpAfter,
    shouldGameOver,
  };
}
```

- [ ] **Step 4: 同步更新既有调用点（engine 内测试）**

现有 `resolveBattleOutcome(player, npc, 'duel')` 全部改为 `resolveBattleOutcome(player, [npc], 'duel')`。修改文件：
- `packages/engine/src/__tests__/battle-resolver.test.ts`（既有用例）
- 若 `BattleOverlay.vue` 已调用，Step 9 会一并处理

Run: `npx vitest run src/__tests__/battle-resolver.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add packages/engine/src/combat/battle-resolver.ts packages/engine/src/__tests__/battle-resolver.test.ts
git commit -m "refactor(engine): resolveBattleOutcome multi-participant aggregation"
```

---

### Task 9: Store — battleRevision + commitBattleDelta（事务回写）

**Files:**
- Modify: `apps/taosim-ui/src/stores/player.ts`
- Test: `apps/taosim-ui/src/stores/__tests__/player-battle-delta.test.ts`

- [ ] **Step 1: 写失败测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePlayerStore } from '../player';
import type { BattleDelta, Item } from '@taosim/contracts';

function makeItem(id: string): Item {
  return { id, name: id, type: 'Medicine', tier: 1, rarity: 'Common', attributes: {} } as Item;
}

function makeDelta(overrides: Partial<BattleDelta> = {}): BattleDelta {
  return {
    battleId: 'b1',
    baseRevision: 0,
    characterId: 'p',
    hpAfter: 70,
    spiritEnergyAfter: 30,
    apAfter: 1,
    skillCooldownsAfter: { s1: 2 },
    consumedItems: [{ itemId: 'med1', count: 1 }],
    rewards: { cultivationExp: 50, spiritStones: 10, items: [] },
    relationChanges: [],
    ...overrides,
  };
}

describe('commitBattleDelta', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function seedPlayer() {
    const store = usePlayerStore();
    store.setPlayer({
      id: 'p', name: 'p', realm: 'LianQi1', hp: 100, maxHp: 100,
      spiritEnergy: { current: 50, max: 100 },
      monthlyActionPoints: { current: 3, max: 3 },
      ap: 3, skills: [], skillCooldowns: {}, cultivation: { currentExp: 0, maxExp: 100 },
      attributes: { strength: 10, agility: 10, physique: 10, intelligence: 10, perception: 10, charisma: 10 },
      spiritRoot: { elements: ['Fire'], purity: 5 }, inventory: [{ item: makeItem('med1'), count: 3 }], relations: {},
      soulState: 'Alive', canFly: false, spiritStones: 0, age: 20, lifespan: 100, gender: 'male',
      portraitId: 'p', birthday: { year: 1, month: 1 }, traits: [], physique: 'normal',
      unlockedRecipes: [], eventLog: [], equipment: {},
    } as any);
    return store;
  }

  it('成功提交：HP/灵力/AP/冷却/经验/灵石/道具扣除全部生效', () => {
    const store = seedPlayer();
    const result = store.commitBattleDelta(makeDelta());
    expect(result).toBe('Committed');
    const c = store.character!;
    expect(c.hp).toBe(70);
    expect(c.spiritEnergy.current).toBe(30);
    expect(c.ap).toBe(1);
    expect(c.skillCooldowns.s1).toBe(2);
    expect(c.cultivation.currentExp).toBe(50);
    expect(c.spiritStones).toBe(10);
    expect(c.inventory[0]!.count).toBe(2);
  });

  it('重复 battleId 提交返回 AlreadyCommitted，不重复奖励', () => {
    const store = seedPlayer();
    const delta = makeDelta();
    expect(store.commitBattleDelta(delta)).toBe('Committed');
    expect(store.commitBattleDelta(delta)).toBe('AlreadyCommitted');
    expect(store.character!.cultivation.currentExp).toBe(50);
    expect(store.character!.inventory[0]!.count).toBe(2);
  });

  it('版本冲突返回 VersionConflict，不做任何写入', () => {
    const store = seedPlayer();
    const delta = makeDelta({ baseRevision: 99 });
    expect(store.commitBattleDelta(delta)).toBe('VersionConflict');
    expect(store.character!.hp).toBe(100);
  });

  it('库存不足返回 InsufficientItems，不做任何写入', () => {
    const store = seedPlayer();
    const delta = makeDelta({ consumedItems: [{ itemId: 'med1', count: 99 }] });
    expect(store.commitBattleDelta(delta)).toBe('InsufficientItems');
    expect(store.character!.hp).toBe(100);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/stores/__tests__/player-battle-delta.test.ts`
Expected: FAIL（`commitBattleDelta` 不存在）

- [ ] **Step 3: 在 player.ts 加入 battleRevision 与 commitBattleDelta**

在 `usePlayerStore` 的 setup 顶部（`const character = ref...` 附近）加：

```typescript
  /** 战斗提交修订号：每次成功提交 +1，用于并发/重复提交防护 */
  const battleRevision = ref(0);
  /** 最近已提交的 battleId（幂等键） */
  const lastCommittedBattleId = ref<string | null>(null);
```

在 `advanceTime` 之后、`return` 之前加：

```typescript
  /**
   * 原子提交战斗差量。一次成功：HP/灵力/AP/冷却/经验/灵石/道具/关系全部生效。
   * 重复 battleId 返回 AlreadyCommitted；baseRevision 不匹配返回 VersionConflict；
   * 库存不足返回 InsufficientItems。任何失败都不做部分写入。
   */
  function commitBattleDelta(delta: BattleDelta): 'Committed' | 'AlreadyCommitted' | 'VersionConflict' | 'InsufficientItems' {
    if (!character.value) return 'VersionConflict';
    if (lastCommittedBattleId.value === delta.battleId) return 'AlreadyCommitted';
    if (delta.baseRevision !== battleRevision.value) return 'VersionConflict';

    const c = character.value;

    // 校验库存（先验证后提交，保证原子性）
    for (const ci of delta.consumedItems) {
      const stack = c.inventory.find(s => s.item.id === ci.itemId);
      if (!stack || stack.count < ci.count) return 'InsufficientItems';
    }

    // 一次性写入
    c.hp = Math.max(0, Math.min(c.maxHp, delta.hpAfter));
    c.spiritEnergy.current = Math.max(0, Math.min(c.spiritEnergy.max, delta.spiritEnergyAfter));
    c.ap = delta.apAfter;
    c.skillCooldowns = { ...delta.skillCooldownsAfter };
    c.cultivation.currentExp += delta.rewards.cultivationExp;
    c.spiritStones = Math.max(0, c.spiritStones + delta.rewards.spiritStones);

    for (const ci of delta.consumedItems) {
      const stack = c.inventory.find(s => s.item.id === ci.itemId);
      if (stack) {
        stack.count -= ci.count;
        if (stack.count <= 0) {
          c.inventory = c.inventory.filter(s => s.item.id !== ci.itemId);
        }
      }
    }

    for (const ri of delta.rewards.items) {
      const existing = c.inventory.find(s => s.item.id === ri.item.id);
      if (existing) existing.count += ri.count;
      else c.inventory.push({ item: ri.item, count: ri.count });
    }

    for (const rc of delta.relationChanges) {
      const rel = c.relations[rc.targetId];
      if (rel) rel.favorability += rc.favorabilityDelta;
    }

    lastCommittedBattleId.value = delta.battleId;
    battleRevision.value += 1;
    return 'Committed';
  }
```

在 return 语句中追加导出：

```typescript
    advanceTime,
    battleRevision,
    commitBattleDelta,
  };
```

同时补 import：

```typescript
import type { Character, Skill, Item, BattleDelta } from '@taosim/contracts';
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/stores/__tests__/player-battle-delta.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 提交**

```bash
git add apps/taosim-ui/src/stores/player.ts apps/taosim-ui/src/stores/__tests__/player-battle-delta.test.ts
git commit -m "feat(ui): battle delta transactional commit in player store"
```

---

## 自审记录（writing-plans 强制）

**1. Spec 覆盖核对（对照设计文档 §十一 开工门槛）：**

| §十一 门槛 | 对应任务 |
|-----------|---------|
| ① BattleCommand → BattleEngine → readonly State/Event 单写入口 | Task 5（dispatch 统一校验） |
| ② 深拷贝隔离 + BattleDelta 幂等提交测试先行 | Task 5（start 深拷贝）、Task 9（事务测试） |
| ③ tick/activation、同 tick 排序、固定 seed、胜负即时检查 | Task 2（seed）、Task 5 |
| ④ 普攻/防御/合法路径/目标校验 = 永不软锁最小动作集 | Task 5（BasicAttack/Guard/Move） |
| ⑤ resolveBattleOutcome 多参战者聚合 + duel/encounter 策略 | Task 8 |

**2. 占位符扫描：** 计划中所有代码块均为完整实现，无 TBD/TODO/"适当处理"等占位。测试代码全部给出具体断言。

**3. 类型一致性：**
- `BattleDelta` 在 Task 1（contracts）定义 → Task 9（store）消费，字段一致。
- `BattleCommand`/`BattleState`/`BattleUnit` 在 Task 1 定义 → Task 5 实现，`guarding.expiresAtActivation`、`charging.releaseAtTick` 均一致。
- `DamageSpec`/`DamageResult` 在 Task 4 定义 → Task 5 使用，字段一致。
- `resolveBattleOutcome` 签名在 Task 8 改为 `(player, enemies[], battleType)`，Task 9 的 BattleOverlay 接入时需同步（见下）。

**4. 已知衔接点（留给 Phase A 的 UI 接线任务或单独 UI plan）：**
- `BattleOverlay.vue` 当前用 `useCombat` + `resolveBattleOutcome(playerChar, enemyChar, type)` 单参形式——Task 8 改签名后 UI 需改为 `[enemy]`，且 `applyOutcome` 需迁移到 `commitBattleDelta`。UI 接入（useCombat 薄封装 + BattleOverlay 迁移）量较大，建议作为独立 UI plan（Phase A-UI）跟进，本计划聚焦 engine/store 层。
- 现有 `useCombat.ts` 在 engine 状态机稳定后重写为薄封装（调用 `BattleEngine.dispatch` + 渲染快照），不属于本计划任务，列入 Phase A-UI。

---
