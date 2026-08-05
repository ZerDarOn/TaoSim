# Phase 5: 修仙进阶与 NPC 交互 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 突破金丹/元婴 + NPC 交互（切磋/论道/交易 + 好感度）

**Architecture:** 两个独立子系统。突破：contracts 添加 Tier 2/3 配置 → TribulationEngine 扩展 postBreakthrough 参数 → CultivationPage 动态突破选项。NPC 交互：NPCGenerator 生成 NPC → NPCInteractionEngine 处理切磋/论道/交易/好感度 → NPCInteractionPage UI。

**Tech Stack:** TypeScript + Vitest + Vue 3 + Pinia

**当前基线:** Phase 4 完成（62 tests）。TribulationEngine 已实现 config-driven 突破。Character.relations 字段已定义但从未使用。

---

## 文件结构

```
packages/contracts/src/
└── tribulation.ts                    # MODIFY: postBreakthrough + 标准配置

packages/engine/src/
├── tribulation/
│   └── tribulation-engine.ts        # MODIFY: 支持 postBreakthrough
├── interaction/
│   ├── npc-generator.ts             # NEW
│   └── npc-interaction-engine.ts    # NEW
├── index.ts                         # MODIFY

apps/taosim-ui/src/
├── pages/
│   ├── CultivationPage.vue          # MODIFY: 动态突破
│   └── NPCInteractionPage.vue       # NEW
├── stores/
│   └── player.ts                    # MODIFY: currentNPC
├── router/
│   └── routes.ts                    # MODIFY
```

---

### Task 1: 突破配置扩展 + TribulationEngine 支持 postBreakthrough

**Files:**
- Modify: `packages/contracts/src/tribulation.ts`
- Modify: `packages/engine/src/tribulation/tribulation-engine.ts`
- Modify: `packages/engine/src/__tests__/tribulation-engine.test.ts` — 新增 Tier 2/3 tests

- [ ] **Step 1: 扩展 contracts**

```typescript
// packages/contracts/src/tribulation.ts — 在 RealmBreakthroughConfig 末尾添加 postBreakthrough 字段：
export interface RealmBreakthroughConfig {
  fromRealm: string;
  toRealm: string;
  tier: 0 | 1 | 2 | 3;

  requirements: {
    expThreshold: number;
    requiredItems?: string[];
  };

  simpleModeSuccessRate: number;

  postBreakthrough?: {
    maxLifespan: number;
    hpMultiplier: number;
    spiritEnergyMultiplier: number;
    canFly?: boolean;
  };

  battleTribulation?: {
    totalTurns: number;
    primitivesPerTurn: Record<number, TribulationPrimitive[]>;
  };
}

// 在文件末尾添加标准配置：
export const BREAKTHROUGH_CONFIGS: RealmBreakthroughConfig[] = [
  {
    fromRealm: 'QiRefinement_9', toRealm: 'Foundation_1', tier: 1,
    requirements: { expThreshold: 1000, requiredItems: ['FoundationPill'] },
    simpleModeSuccessRate: 0.85,
    postBreakthrough: { maxLifespan: 200, hpMultiplier: 2, spiritEnergyMultiplier: 1.5, canFly: true },
  },
  {
    fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
    requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
    simpleModeSuccessRate: 0.70,
    postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
  },
  {
    fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
    requirements: { expThreshold: 20000, requiredItems: ['NascentSoulPill'] },
    simpleModeSuccessRate: 0.55,
    postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
  },
];
```

- [ ] **Step 2: 修改 TribulationEngine 支持 postBreakthrough**

```typescript
// packages/engine/src/tribulation/tribulation-engine.ts
// 将 attempt 方法中成功后的硬编码数值改为读取 config.postBreakthrough：

    // 成功：境界提升
    c.realm = config.toRealm as RealmFullPath;
    c.cultivation.currentExp = 0;
    c.cultivation.maxExp = Math.floor(c.cultivation.maxExp * 3);

    if (config.postBreakthrough) {
      c.lifespan.maxLifespan = config.postBreakthrough.maxLifespan;
      c.maxHp = Math.floor(c.maxHp * config.postBreakthrough.hpMultiplier);
      c.spiritEnergy.max = Math.floor(c.spiritEnergy.max * config.postBreakthrough.spiritEnergyMultiplier);
      if (config.postBreakthrough.canFly !== undefined) {
        c.canFly = config.postBreakthrough.canFly;
      }
    } else {
      // 向后兼容：无 postBreakthrough 使用默认值
      c.lifespan.maxLifespan = 200;
      c.maxHp = Math.floor(c.maxHp * 2);
      c.spiritEnergy.max = Math.floor(c.spiritEnergy.max * 1.5);
      c.canFly = true;
    }

    c.hp = c.maxHp;
    c.spiritEnergy.current = c.spiritEnergy.max;
```

完整修改后的 `attempt` 方法成功部分：

```typescript
    // 成功率判定
    const physiqueBonus = c.attributes.physique / 100;
    const luckBonus = c.attributes.luck / 100;
    const successRate = Math.min(0.95, config.simpleModeSuccessRate + physiqueBonus + luckBonus);

    if (Math.random() > successRate) {
      c.hp = Math.max(1, c.hp - Math.floor(c.maxHp * 0.1));
      return { success: false, reason: '突破失败，气血受损', updatedCharacter: c };
    }

    c.realm = config.toRealm as RealmFullPath;
    c.cultivation.currentExp = 0;
    c.cultivation.maxExp = Math.floor(c.cultivation.maxExp * 3);

    if (config.postBreakthrough) {
      c.lifespan.maxLifespan = config.postBreakthrough.maxLifespan;
      c.maxHp = Math.floor(c.maxHp * config.postBreakthrough.hpMultiplier);
      c.spiritEnergy.max = Math.floor(c.spiritEnergy.max * config.postBreakthrough.spiritEnergyMultiplier);
      if (config.postBreakthrough.canFly !== undefined) {
        c.canFly = config.postBreakthrough.canFly;
      }
    } else {
      c.lifespan.maxLifespan = 200;
      c.maxHp = Math.floor(c.maxHp * 2);
      c.spiritEnergy.max = Math.floor(c.spiritEnergy.max * 1.5);
      c.canFly = true;
    }

    c.hp = c.maxHp;
    c.spiritEnergy.current = c.spiritEnergy.max;

    return {
      success: true,
      newRealm: config.toRealm as RealmFullPath,
      updatedCharacter: c,
    };
```

- [ ] **Step 3: 新增 Tier 2/3 测试**

在 `packages/engine/src/__tests__/tribulation-engine.test.ts` 末尾（最后的 `});` 前）添加：

```typescript
  // ---- Tier 2: 筑基 → 金丹 ----
  it('Tier2 筑基突破到金丹', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      realm: 'Foundation_3',
      cultivation: { currentExp: 6000, maxExp: 6000 },
      lifespan: { age: 50, maxLifespan: 200 },
      hp: 600, maxHp: 600,
      inventory: [{ item: { id: 'GoldenCorePill', name: '金元丹', tier: 3, type: 'Medicine', attributes: {} }, count: 1 }],
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100 },
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.70,
      postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
    });
    expect(result.success).toBe(true);
    expect(result.updatedCharacter?.realm).toBe('GoldenCore_1');
    expect(result.updatedCharacter?.lifespan.maxLifespan).toBe(400);
  });

  it('Tier2 修为不足无法突破', () => {
    const c = makeChar({
      realm: 'Foundation_3',
      cultivation: { currentExp: 3000, maxExp: 6000 },
      inventory: [{ item: { id: 'GoldenCorePill', name: '金元丹', tier: 3, type: 'Medicine', attributes: {} }, count: 1 }],
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.70,
      postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
    });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('修为不足');
  });

  it('Tier2 缺少金元丹无法突破', () => {
    const c = makeChar({
      realm: 'Foundation_3',
      cultivation: { currentExp: 6000, maxExp: 6000 },
      inventory: [],
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.70,
      postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
    });
    expect(result.success).toBe(false);
    expect(result.reason).toContain('缺少');
  });

  // ---- Tier 3: 金丹 → 元婴 ----
  it('Tier3 金丹突破到元婴', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const c = makeChar({
      realm: 'GoldenCore_3',
      cultivation: { currentExp: 25000, maxExp: 25000 },
      lifespan: { age: 200, maxLifespan: 400 },
      hp: 1200, maxHp: 1200,
      inventory: [{ item: { id: 'NascentSoulPill', name: '凝婴丹', tier: 4, type: 'Medicine', attributes: {} }, count: 1 }],
      attributes: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 100 },
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
      requirements: { expThreshold: 20000, requiredItems: ['NascentSoulPill'] },
      simpleModeSuccessRate: 0.55,
      postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
    });
    expect(result.success).toBe(true);
    expect(result.updatedCharacter?.realm).toBe('NascentSoul_1');
    expect(result.updatedCharacter?.lifespan.maxLifespan).toBe(800);
  });

  it('Tier3 成功率较低（基础 55%）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    const c = makeChar({
      realm: 'GoldenCore_3',
      cultivation: { currentExp: 25000, maxExp: 25000 },
      hp: 1200, maxHp: 1200,
      inventory: [{ item: { id: 'NascentSoulPill', name: '凝婴丹', tier: 4, type: 'Medicine', attributes: {} }, count: 1 }],
      attributes: { physique: 1, comprehension: 1, perception: 1, agility: 1, luck: 1 },
    });
    const result = TribulationEngine.attempt(c, {
      fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
      requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
      simpleModeSuccessRate: 0.55,
      postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
    });
    expect(result.success).toBe(false);
  });
```

- [ ] **Step 4: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/tribulation-engine.test.ts
```
Expected: 6 old + 5 new = 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src/tribulation.ts packages/engine/src/tribulation/tribulation-engine.ts packages/engine/src/__tests__/tribulation-engine.test.ts
git commit -m "feat(engine): extend tribulation to Tier 2 (GoldenCore) and Tier 3 (NascentSoul)"
```

---

### Task 2: CultivationPage 动态突破选项

**Files:**
- Modify: `apps/taosim-ui/src/pages/CultivationPage.vue`

- [ ] **Step 1: 改造 CultivationPage**

当前页面硬编码 Tier 1 配置。改为根据角色境界动态展示：

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { useWorld } from '@/composables/useWorld';
import { TribulationEngine } from '@taosim/engine';
import type { RealmBreakthroughConfig } from '@taosim/contracts';

const playerStore = usePlayerStore();
const world = useWorld();
const resultMessage = ref<string | null>(null);

// 标准突破配置
const allConfigs: RealmBreakthroughConfig[] = [
  {
    fromRealm: 'QiRefinement_9', toRealm: 'Foundation_1', tier: 1,
    requirements: { expThreshold: 1000, requiredItems: ['FoundationPill'] },
    simpleModeSuccessRate: 0.85,
    postBreakthrough: { maxLifespan: 200, hpMultiplier: 2, spiritEnergyMultiplier: 1.5, canFly: true },
  },
  {
    fromRealm: 'Foundation_3', toRealm: 'GoldenCore_1', tier: 2,
    requirements: { expThreshold: 5000, requiredItems: ['GoldenCorePill'] },
    simpleModeSuccessRate: 0.70,
    postBreakthrough: { maxLifespan: 400, hpMultiplier: 2, spiritEnergyMultiplier: 1.5 },
  },
  {
    fromRealm: 'GoldenCore_3', toRealm: 'NascentSoul_1', tier: 3,
    requirements: { expThreshold: 20000, requiredItems: ['NascentSoulPill'] },
    simpleModeSuccessRate: 0.55,
    postBreakthrough: { maxLifespan: 800, hpMultiplier: 2, spiritEnergyMultiplier: 2 },
  },
];

const availableConfig = computed<RealmBreakthroughConfig | null>(() => {
  if (!playerStore.character) return null;
  const currentRealm = playerStore.character.realm;
  return allConfigs.find(c => c.fromRealm === currentRealm) ?? null;
});

async function attemptBreakthrough() {
  if (!playerStore.character || !availableConfig.value) return;
  const result = TribulationEngine.attempt(playerStore.character, availableConfig.value);
  if (result.success && result.updatedCharacter) {
    playerStore.character = result.updatedCharacter;
    resultMessage.value = `突破成功！已踏入 ${result.newRealm}`;
  } else {
    resultMessage.value = result.reason ?? '突破失败';
    if (result.updatedCharacter) {
      playerStore.character = result.updatedCharacter;
    }
  }
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">闭关修炼</h1>

    <div v-if="playerStore.character" class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div><span class="text-muted">当前境界：</span><span class="font-semibold text-jade">{{ playerStore.character.realm }}</span></div>
      <div><span class="text-muted">修为：</span>{{ playerStore.character.cultivation.currentExp }} / {{ playerStore.character.cultivation.maxExp }}</div>
      <div><span class="text-muted">寿元：</span>{{ playerStore.character.lifespan.age }} / {{ playerStore.character.lifespan.maxLifespan }}</div>
    </div>

    <!-- 时间快进 -->
    <button @click="world.fastForward(12)"
      class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold">
      闭关修行 12 个月
    </button>

    <div v-if="resultMessage" :class="['p-3 rounded-md text-sm', resultMessage.includes('成功') ? 'bg-jade-soft text-jade' : 'bg-red-50 text-danger']">
      {{ resultMessage }}
    </div>

    <!-- 动态突破选项 -->
    <div v-if="availableConfig" class="bg-surface rounded-lg border border-gold p-4 space-y-2">
      <h3 class="text-sm font-semibold text-gold">可突破</h3>
      <div class="text-xs text-ink-soft">
        目标：{{ availableConfig.toRealm }} ·
        需修为 {{ availableConfig.requirements.expThreshold }} ·
        需材料 {{ availableConfig.requirements.requiredItems?.join(', ') ?? '无' }}
      </div>
      <button @click="attemptBreakthrough"
        class="px-4 py-2 bg-gold text-white rounded-md text-sm font-semibold">
        冲击 {{ availableConfig.toRealm }}
      </button>
    </div>
    <div v-else class="text-sm text-muted p-4 bg-surface rounded-lg border border-line">
      境界已满或需继续修炼至突破点
    </div>
  </div>
</template>
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck -w @taosim/taosim-ui
```

- [ ] **Step 3: Commit**

```bash
git add apps/taosim-ui/src/pages/CultivationPage.vue
git commit -m "feat(ui): dynamic breakthrough options on CultivationPage — Tier 1-3"
```

---

### Task 3: NPCGenerator — NPC 生成引擎

**Files:**
- Create: `packages/engine/src/interaction/npc-generator.ts`
- Create: `packages/engine/src/__tests__/npc-generator.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/npc-generator.test.ts
import { describe, it, expect } from 'vitest';
import { NPCGenerator } from '../interaction/npc-generator.js';

describe('NPCGenerator', () => {
  it('tier 1 生成炼气境 NPC', () => {
    const npc = NPCGenerator.generate(1, 42);
    expect(npc.realm).toMatch(/^QiRefinement/);
  });

  it('tier 3 生成筑基或金丹 NPC', () => {
    const npc = NPCGenerator.generate(3, 123);
    const realm = npc.realm;
    expect(realm.startsWith('Foundation') || realm.startsWith('GoldenCore')).toBe(true);
  });

  it('相同 seed 生成相同 NPC', () => {
    const a = NPCGenerator.generate(2, 999);
    const b = NPCGenerator.generate(2, 999);
    expect(a.name).toBe(b.name);
    expect(a.realm).toBe(b.realm);
  });
});
```

- [ ] **Step 2: 实现 NPCGenerator**

```typescript
// packages/engine/src/interaction/npc-generator.ts
import type { Character } from '@taosim/contracts';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const NAMES = ['玄明子', '妙音', '苍梧', '青羽', '无尘', '九渊', '白鹤', '紫电', '凌霄', '幽兰'];
const SURNAMES = ['云', '慕', '叶', '司', '顾', '温', '沈', '柳', '裴', '萧'];

export class NPCGenerator {
  static generate(tier: number, seed: number): Character {
    const rand = seededRandom(seed);
    const name = `${SURNAMES[Math.floor(rand() * SURNAMES.length)]}${NAMES[Math.floor(rand() * NAMES.length)]}`;

    const realmTier = tier === 1 ? 'QiRefinement' :
      tier === 2 ? 'Foundation' :
      tier >= 3 ? (rand() < 0.5 ? 'Foundation' : 'GoldenCore') : 'QiRefinement';

    const subLevel = 1 + Math.floor(rand() * 5); // 1-5

    const attributes = {
      physique: 3 + Math.floor(rand() * 12),
      comprehension: 3 + Math.floor(rand() * 12),
      perception: 3 + Math.floor(rand() * 12),
      agility: 3 + Math.floor(rand() * 12),
      luck: 1 + Math.floor(rand() * 10),
    };

    const baseHp = 100 + tier * 80 + attributes.physique * 5;

    return {
      id: `NPC_GEN_${seed}`,
      name,
      gender: rand() < 0.5 ? 'Male' : 'Female',
      realm: `${realmTier}_${subLevel}` as any, // 运行时由 config 校验
      soulState: 'Active',
      cultivation: { currentExp: 0, maxExp: 500 * tier },
      lifespan: { age: 20 + Math.floor(rand() * 100), maxLifespan: 100 + tier * 100 },
      spiritEnergy: { current: 100, max: 100 + tier * 50 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes,
      hp: baseHp,
      maxHp: baseHp,
      ap: 3,
      canFly: tier >= 2,
      inventory: [],
      equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
      skills: [],
      skillCooldowns: {},
      traits: [],
      relations: [],
      wantedLevels: {},
    } as Character;
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/npc-generator.test.ts
```
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/interaction/ packages/engine/src/__tests__/npc-generator.test.ts
git commit -m "feat(engine): add NPCGenerator — tier-based NPC creation"
```

---

### Task 4: NPCInteractionEngine — 切磋/论道/交易 + 好感度

**Files:**
- Create: `packages/engine/src/interaction/npc-interaction-engine.ts`
- Create: `packages/engine/src/__tests__/npc-interaction-engine.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/npc-interaction-engine.test.ts
import { describe, it, expect } from 'vitest';
import { NPCInteractionEngine } from '../interaction/npc-interaction-engine.js';
import type { Character } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 1000, maxExp: 2000 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 10, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: [], wantedLevels: {},
    ...overrides,
  } as Character;
}

function makeNPC(id: string, overrides: Partial<Character> = {}): Character {
  return makePlayer({ id, name: 'NPC', ...overrides });
}

describe('NPCInteractionEngine', () => {
  it('论道根据悟性获得修为', () => {
    const player = makePlayer();
    const npc = makeNPC('N1');
    const result = NPCInteractionEngine.discuss(player, npc);
    expect(result.expGained).toBeGreaterThan(0);
    expect(result.favorabilityChange).toBe(3);
  });

  it('切磋成功增加好感度', () => {
    const player = makePlayer();
    const npc = makeNPC('N2');
    const result = NPCInteractionEngine.duel(player, npc, true);
    expect(result.favorabilityChange).toBe(5);
    expect(result.triggerBattle).toBe(true);
  });

  it('交易受好感度影响价格', () => {
    const player = makePlayer({
      relations: [{ targetId: 'N3', favorability: 100, hatred: 0, jealousy: 0, tags: [] }],
    });
    const mult = NPCInteractionEngine.getPriceMultiplier(player, 'N3');
    // 100 好感 → 50% 价格 (1 - 100/200 = 0.5)
    expect(mult).toBe(0.5);
  });

  it('无好感度时价格为 100%', () => {
    const player = makePlayer();
    const mult = NPCInteractionEngine.getPriceMultiplier(player, 'N_UNKNOWN');
    expect(mult).toBe(1.0);
  });
});
```

- [ ] **Step 2: 实现 NPCInteractionEngine**

```typescript
// packages/engine/src/interaction/npc-interaction-engine.ts
import type { Character } from '@taosim/contracts';

export interface InteractionResult {
  triggerBattle: boolean;
  expGained: number;
  favorabilityChange: number;
  message: string;
  battleEnemy?: Character;
}

export class NPCInteractionEngine {
  static duel(player: Character, npc: Character, playerWin: boolean): InteractionResult {
    const favChange = playerWin ? 5 : 1;
    this.adjustFavorability(player, npc.id, favChange);
    return {
      triggerBattle: true,
      expGained: playerWin ? npc.cultivation.maxExp * 0.2 : 0,
      favorabilityChange: favChange,
      message: playerWin ? '切磋胜利！' : '技不如人…',
      battleEnemy: npc,
    };
  }

  static discuss(player: Character, npc: Character): InteractionResult {
    const comprehensionDiff = player.attributes.comprehension - npc.attributes.comprehension;
    const baseExp = 100 + Math.max(0, comprehensionDiff) * 20;
    const expGained = Math.round(baseExp);
    this.adjustFavorability(player, npc.id, 3);
    return {
      triggerBattle: false,
      expGained,
      favorabilityChange: 3,
      message: `论道有所领悟，获得 ${expGained} 修为`,
    };
  }

  static getPriceMultiplier(player: Character, npcId: string): number {
    const relation = player.relations.find(r => r.targetId === npcId);
    if (!relation) return 1.0;
    const mult = 1.0 - relation.favorability / 200;
    return Math.max(0.3, Math.min(1.5, mult));
  }

  static adjustFavorability(player: Character, npcId: string, delta: number): void {
    let relation = player.relations.find(r => r.targetId === npcId);
    if (!relation) {
      relation = { targetId: npcId, favorability: 0, hatred: 0, jealousy: 0, tags: [] };
      player.relations.push(relation);
    }
    relation.favorability = Math.max(-100, Math.min(100, relation.favorability + delta));
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/npc-interaction-engine.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/interaction/npc-interaction-engine.ts packages/engine/src/__tests__/npc-interaction-engine.test.ts
git commit -m "feat(engine): add NPCInteractionEngine — duel/discuss/trade favorability"
```

---

### Task 5: NPCInteractionPage UI + 集成

**Files:**
- Create: `apps/taosim-ui/src/pages/NPCInteractionPage.vue`
- Modify: `apps/taosim-ui/src/stores/player.ts` — 添加 `currentNPC` 状态
- Modify: `apps/taosim-ui/src/router/routes.ts`
- Modify: `packages/engine/src/index.ts` — 导出 interaction 模块

- [ ] **Step 1: Update engine index**

```typescript
// packages/engine/src/index.ts — 添加：
export { NPCGenerator } from './interaction/npc-generator.js';
export { NPCInteractionEngine } from './interaction/npc-interaction-engine.js';
```

- [ ] **Step 2: 更新 playerStore 添加 currentNPC**

在 `apps/taosim-ui/src/stores/player.ts` 的 store 定义中添加：

```typescript
  const currentNPC = ref<Character | null>(null);
```

并在 return 中导出 `currentNPC`。

- [ ] **Step 3: 创建 NPCInteractionPage**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { usePlayerStore } from '@/stores/player';
import { NPCInteractionEngine } from '@taosim/engine';

const router = useRouter();
const playerStore = usePlayerStore();
const message = ref<string | null>(null);
const interactionDone = ref(false);

const npc = computed(() => playerStore.currentNPC);

const favorability = computed(() => {
  if (!playerStore.character || !npc.value) return 0;
  const rel = playerStore.character.relations.find(r => r.targetId === npc.value!.id);
  return rel?.favorability ?? 0;
});

function handleDuel() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.duel(playerStore.character, npc.value, true);
  message.value = result.message;
  interactionDone.value = true;
}

function handleDiscuss() {
  if (!playerStore.character || !npc.value) return;
  const result = NPCInteractionEngine.discuss(playerStore.character, npc.value);
  playerStore.character.cultivation.currentExp += result.expGained;
  message.value = result.message;
  interactionDone.value = true;
}

function handleLeave() {
  playerStore.currentNPC = null;
  router.push('/overworld');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">偶遇修士</h1>

    <div v-if="npc" class="bg-surface rounded-lg border border-line p-4 space-y-2 text-sm">
      <div class="font-semibold text-lg">{{ npc.name }}</div>
      <div class="text-muted">{{ npc.realm }} · {{ npc.gender === 'Male' ? '男' : '女' }}</div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted">好感度</span>
        <div class="flex-1 bg-surface-muted h-2 rounded-full max-w-[120px]">
          <div class="h-2 rounded-full transition-all"
            :class="favorability >= 0 ? 'bg-jade' : 'bg-danger'"
            :style="{ width: Math.abs(favorability) + '%' }"></div>
        </div>
        <span class="text-xs font-mono">{{ favorability }}</span>
      </div>
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <div v-if="!interactionDone" class="flex gap-3">
      <button @click="handleDuel"
        class="px-4 py-2 bg-jade text-white rounded-md text-sm font-semibold">切磋</button>
      <button @click="handleDiscuss"
        class="px-4 py-2 border border-line rounded-md text-sm">论道</button>
      <button @click="handleLeave"
        class="px-4 py-2 border border-line rounded-md text-sm text-muted">离开</button>
    </div>
    <div v-else class="pt-4">
      <button @click="handleLeave"
        class="px-4 py-2 bg-surface-muted rounded-md text-sm">返回大世界</button>
    </div>
  </div>
</template>
```

- [ ] **Step 4: 添加路由**

```typescript
// apps/taosim-ui/src/router/routes.ts — 在 routes 数组末尾（] 前）添加：
  {
    path: '/npc-interaction',
    name: 'npc-interaction',
    component: () => import('../pages/NPCInteractionPage.vue'),
    meta: { title: '偶遇' },
  },
```

- [ ] **Step 5: Typecheck**

```bash
npm run build -w @taosim/engine ; npm run typecheck -w @taosim/taosim-ui
```

- [ ] **Step 6: Commit**

```bash
git add apps/taosim-ui/src/pages/NPCInteractionPage.vue apps/taosim-ui/src/stores/player.ts apps/taosim-ui/src/router/routes.ts packages/engine/src/index.ts
git commit -m "feat(ui): add NPCInteractionPage — duel/discuss/favorability"
```

---

### Task 6: 全量验证

- [ ] **Step 1: Run full check**

```bash
npm run check
```
Expected: typecheck 全通过，62 + 12 = ~74 tests PASS

- [ ] **Step 2: Commit docs**

```bash
git add docs/superpowers/specs/2026-08-05-phase-5-breakthrough-npc-design.md docs/superpowers/plans/2026-08-05-phase-5-breakthrough-npc.md
git commit -m "docs: Phase 5 plan — breakthrough tiers + NPC interaction"
```

---

## 总览

| Task | 模块 | 新增文件 | 修改文件 | 新测试 |
|------|------|----------|----------|--------|
| 1 | 突破配置 + Tier 2/3 | 0 | 3 | +5 |
| 2 | CultivationPage 改造 | 0 | 1 | — |
| 3 | NPCGenerator | 2 | 0 | +3 |
| 4 | NPCInteractionEngine | 2 | 0 | +4 |
| 5 | NPCInteractionPage UI | 1 | 3 | — |
| 6 | 全量验证 | 0 | 0 | — |
| **合计** | | **5** | **7** | **+12 tests** |

**可并行：** Task 1-2（突破）与 Task 3-5（NPC 交互）完全独立。

**目标：62 → 74 个测试**
