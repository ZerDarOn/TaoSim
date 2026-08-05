# Phase 4: 装备与大世界探索 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 装备系统（穿戴/卸下/战斗属性生效）+ 大世界探索（预设地图 + 旅行 + 奇遇 + NPC偶遇 + 程序化生成）

**Architecture:** 两个独立子系统。装备系统：EquipmentManager（穿戴/聚合属性）→ DamagePipeline 集成。大世界：preset-map（预设数据）→ OverworldMapGenerator（程序化）→ OverworldEngine（旅行逻辑 + 奇遇 + NPC偶遇）。两个模块通过 UI 页面分别交付，互不依赖。

**Tech Stack:** TypeScript + Vitest + Vue 3 + Pinia

**当前基线:** Phase 3 完成（48 tests）。`equipmentSlots` 字段已在 Character 上定义。`DamagePipeline` 已读取 weapon/armor 属性。`OverworldNode`/`OverworldMap`/`OverworldContinent` 类型已在 contracts 定义。

---

## 文件结构

```
packages/engine/src/
├── equipment/
│   └── equipment-manager.ts          # NEW
├── overworld/
│   ├── preset-map.ts                 # NEW
│   ├── overworld-map-generator.ts    # NEW
│   └── overworld-engine.ts           # NEW
├── combat/
│   └── damage-pipeline.ts            # MODIFY: 聚合装备加成
├── index.ts                          # MODIFY: 导出

apps/taosim-ui/src/
├── pages/
│   ├── InventoryPage.vue             # NEW
│   └── OverworldPage.vue             # NEW
├── router/
│   └── routes.ts                     # MODIFY

packages/engine/src/__tests__/
├── equipment-manager.test.ts         # NEW
├── overworld-map-generator.test.ts   # NEW
└── overworld-engine.test.ts          # NEW
```

---

### Task 1: EquipmentManager — 装备管理引擎

**Files:**
- Create: `packages/engine/src/equipment/equipment-manager.ts`
- Create: `packages/engine/src/__tests__/equipment-manager.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/equipment-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import type { Character, Item } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '修士', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    ...overrides,
  } as Character;
}

const sword: Item = {
  id: 'SWORD_1', name: '铁剑', tier: 1, type: 'Equipment',
  attributes: { attack: 12, critRate: 3 },
};

const armor: Item = {
  id: 'ARMOR_1', name: '布甲', tier: 1, type: 'Equipment',
  attributes: { defense: 8 },
};

const treasure: Item = {
  id: 'TREASURE_1', name: '护心镜', tier: 2, type: 'Equipment',
  attributes: { defense: 5, physique: 2 },
};

describe('EquipmentManager', () => {
  it('穿戴武器到空槽位', () => {
    const player = makePlayer({ inventory: [{ item: sword, count: 1 }] });
    const result = EquipmentManager.equip(player, sword);
    expect(result.success).toBe(true);
    expect(player.equipmentSlots.weapon).toBeDefined();
    expect(player.equipmentSlots.weapon!.id).toBe('SWORD_1');
    expect(player.inventory.length).toBe(0);
  });

  it('槽位已有装备时先卸下再穿戴', () => {
    const oldSword: Item = { ...sword, id: 'OLD_SWORD' };
    const player = makePlayer({
      equipmentSlots: { weapon: oldSword, armor: undefined, treasures: [] },
      inventory: [{ item: sword, count: 1 }],
    });
    const result = EquipmentManager.equip(player, sword);
    expect(result.success).toBe(true);
    expect(player.equipmentSlots.weapon!.id).toBe('SWORD_1');
    // 旧装备退回背包
    expect(player.inventory.find(s => s.item.id === 'OLD_SWORD')).toBeDefined();
  });

  it('卸下装备退回背包', () => {
    const player = makePlayer({
      equipmentSlots: { weapon: sword, armor: undefined, treasures: [] },
    });
    const result = EquipmentManager.unequip(player, 'weapon');
    expect(result.success).toBe(true);
    expect(player.equipmentSlots.weapon).toBeUndefined();
    expect(player.inventory.find(s => s.item.id === 'SWORD_1')!.count).toBe(1);
  });

  it('聚合所有装备属性加成', () => {
    const player = makePlayer({
      equipmentSlots: {
        weapon: sword,
        armor: armor,
        treasures: [treasure],
      },
    });
    const bonuses = EquipmentManager.getCombatBonuses(player);
    expect(bonuses.attack).toBe(12);
    expect(bonuses.defense).toBe(13); // 8 + 5
    expect(bonuses.critRate).toBe(3);
    expect(bonuses.physique).toBe(2);
  });
});
```

- [ ] **Step 2: 实现 EquipmentManager**

```typescript
// packages/engine/src/equipment/equipment-manager.ts
import type { Character, Item } from '@taosim/contracts';

export interface EquipResult {
  success: boolean;
  reason?: string;
}

export interface CombatBonuses {
  attack: number;
  defense: number;
  critRate: number;
  physique: number;
  comprehension: number;
  perception: number;
  agility: number;
  luck: number;
}

type SlotKey = 'weapon' | 'armor';

export class EquipmentManager {
  static equip(character: Character, item: Item): EquipResult {
    if (item.type !== 'Equipment') return { success: false, reason: '非装备物品' };

    // 从背包移除
    const stackIdx = character.inventory.findIndex(s => s.item.id === item.id);
    if (stackIdx === -1) return { success: false, reason: '背包中无此物品' };
    const stack = character.inventory[stackIdx]!;
    if (stack.count <= 0) return { success: false, reason: '物品数量不足' };
    stack.count--;
    if (stack.count === 0) character.inventory.splice(stackIdx, 1);

    // 分配到槽位
    const slot = this.determineSlot(item);
    if (slot === 'treasures') {
      // 法宝：退旧装新
      const old = character.equipmentSlots.treasures.find(t => t.id === item.id);
      if (old) return { success: false, reason: '已装备该法宝' };
      if (character.equipmentSlots.treasures.length >= 3) {
        // 自动卸下第一个
        const removed = character.equipmentSlots.treasures.shift()!;
        this.addToInventory(character, removed);
      }
      character.equipmentSlots.treasures.push(item);
    } else {
      // 武器/防具：若槽位已有则先卸下
      const old = character.equipmentSlots[slot];
      if (old) {
        this.addToInventory(character, old);
      }
      character.equipmentSlots[slot] = item;
    }

    return { success: true };
  }

  static unequip(character: Character, slot: 'weapon' | 'armor' | 'treasures', itemId?: string): EquipResult {
    if (slot === 'treasures') {
      if (itemId) {
        const idx = character.equipmentSlots.treasures.findIndex(t => t.id === itemId);
        if (idx === -1) return { success: false, reason: '未装备该法宝' };
        const removed = character.equipmentSlots.treasures.splice(idx, 1)[0]!;
        this.addToInventory(character, removed);
      } else {
        return { success: false, reason: '请指定法宝 ID' };
      }
    } else {
      const item = character.equipmentSlots[slot];
      if (!item) return { success: false, reason: '该槽位为空' };
      character.equipmentSlots[slot] = undefined;
      this.addToInventory(character, item);
    }
    return { success: true };
  }

  static getCombatBonuses(character: Character): CombatBonuses {
    const bonuses: CombatBonuses = {
      attack: 0, defense: 0, critRate: 0,
      physique: 0, comprehension: 0, perception: 0, agility: 0, luck: 0,
    };

    const allEquipped: Item[] = [];
    if (character.equipmentSlots.weapon) allEquipped.push(character.equipmentSlots.weapon);
    if (character.equipmentSlots.armor) allEquipped.push(character.equipmentSlots.armor);
    allEquipped.push(...character.equipmentSlots.treasures);

    for (const item of allEquipped) {
      const attrs = item.attributes;
      if (attrs.attack) bonuses.attack += attrs.attack;
      if (attrs.defense) bonuses.defense += attrs.defense;
      if (attrs.critRate) bonuses.critRate += attrs.critRate;
      if (attrs.physique) bonuses.physique += attrs.physique;
      if (attrs.comprehension) bonuses.comprehension += attrs.comprehension;
      if (attrs.perception) bonuses.perception += attrs.perception;
      if (attrs.agility) bonuses.agility += attrs.agility;
      if (attrs.luck) bonuses.luck += attrs.luck;
    }

    return bonuses;
  }

  private static determineSlot(item: Item): SlotKey | 'treasures' {
    // 简单分类：有 attack 属性 → weapon，有 defense → armor，其余 → treasures
    if (item.attributes.attack && !item.attributes.defense) return 'weapon';
    if (item.attributes.defense && !item.attributes.attack) return 'armor';
    return 'treasures';
  }

  private static addToInventory(character: Character, item: Item): void {
    const existing = character.inventory.find(s => s.item.id === item.id);
    if (existing) {
      existing.count++;
    } else {
      character.inventory.push({ item, count: 1 });
    }
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/equipment-manager.test.ts
```
Expected: 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/equipment/ packages/engine/src/__tests__/equipment-manager.test.ts
git commit -m "feat(engine): add EquipmentManager — equip/unequip/combat bonuses"
```

---

### Task 2: DamagePipeline 集成装备加成

**Files:**
- Modify: `packages/engine/src/combat/damage-pipeline.ts`

- [ ] **Step 1: 修改 damage-pipeline.ts**

当前 `calculate` 方法直接读取 `equipmentSlots.weapon.attributes.attack` 和 `armor.attributes.defense`。改为从 EquipmentManager 聚合所有槽位（含 treasures）的加成：

```typescript
// packages/engine/src/combat/damage-pipeline.ts
// 在文件顶部添加 import:
import { EquipmentManager } from '../equipment/equipment-manager.js';

// calculate 方法中，替换 attackPower 和 flatReduction 的计算：
// 原代码：
//   const attackPower = attacker.equipmentSlots.weapon?.attributes.attack ?? 10;
//   const flatReduction = defender.equipmentSlots.armor?.attributes.defense ?? 0;
// 改为：
    const attackerBonuses = EquipmentManager.getCombatBonuses(attacker);
    const defenderBonuses = EquipmentManager.getCombatBonuses(defender);
    const attackPower = attackerBonuses.attack + 10; // 基础攻击 10 + 装备加成
    const flatReduction = defenderBonuses.defense;
```

完整修改后的 `calculate` 方法：

```typescript
  public static calculate(
    attacker: Character,
    defender: Character,
    skill: Skill,
    hasArmorBreak: boolean,
  ): DamageResult {
    // 装备加成聚合
    const attackerBonuses = EquipmentManager.getCombatBonuses(attacker);
    const defenderBonuses = EquipmentManager.getCombatBonuses(defender);
    const attackPower = attackerBonuses.attack + 10; // 基础攻击 10 + 装备加成
    const baseDefense = defender.attributes.physique * 0.5;

    // 境界壁垒检测
    const attackerRealmTier = this.getRealmTier(attacker.realm);
    const defenderRealmTier = this.getRealmTier(defender.realm);

    let barrierRate = 0;
    if (defenderRealmTier > attackerRealmTier && !hasArmorBreak) {
      barrierRate = 1.0;
    }

    const skillCoefficient = 1.0;
    const flatReduction = defenderBonuses.defense;

    let damage = (attackPower - baseDefense) * skillCoefficient - flatReduction;
    damage = Math.max(0, damage);
    damage = damage * (1 - barrierRate);

    const elementMultiplier = 1.0;
    damage = damage * elementMultiplier;

    let appliedBackfire: BackfireEffect | undefined;
    if (skill.backfire) {
      appliedBackfire = { ...skill.backfire };
    }

    return {
      finalDamage: Math.round(damage),
      blockedByBarrier: barrierRate >= 1.0,
      appliedBackfire,
    };
  }
```

- [ ] **Step 2: 运行现有测试确认不破坏**

```bash
npm run test -w @taosim/engine -- src/__tests__/damage-pipeline.test.ts
```
Expected: 6 tests still PASS

- [ ] **Step 3: Commit**

```bash
git add packages/engine/src/combat/damage-pipeline.ts
git commit -m "feat(engine): integrate EquipmentManager bonuses into DamagePipeline"
```

---

### Task 3: InventoryPage — 背包与装备 UI

**Files:**
- Create: `apps/taosim-ui/src/pages/InventoryPage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts`
- Modify: `packages/engine/src/index.ts` — 导出 EquipmentManager

- [ ] **Step 1: 更新 engine 导出**

```typescript
// packages/engine/src/index.ts — 添加：
export { EquipmentManager } from './equipment/equipment-manager.js';
```

- [ ] **Step 2: 创建 InventoryPage**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { EquipmentManager } from '@taosim/engine';
import type { Item, AttributeKey } from '@taosim/contracts';

const playerStore = usePlayerStore();
const message = ref<string | null>(null);

const character = computed(() => playerStore.character);

const inventoryItems = computed(() => character.value?.inventory ?? []);

const equipmentDisplay = computed(() => {
  if (!character.value) return null;
  const c = character.value;
  return {
    weapon: c.equipmentSlots.weapon?.name ?? '空',
    armor: c.equipmentSlots.armor?.name ?? '空',
    treasures: c.equipmentSlots.treasures.map(t => t.name),
  };
});

function handleEquip(item: Item) {
  if (!character.value) return;
  const r = EquipmentManager.equip(character.value, item);
  message.value = r.success ? `装备了 ${item.name}` : r.reason ?? '失败';
}

function handleUnequipWeapon() {
  if (!character.value) return;
  const r = EquipmentManager.unequip(character.value, 'weapon');
  message.value = r.success ? '卸下武器' : r.reason ?? '失败';
}

function handleUnequipArmor() {
  if (!character.value) return;
  const r = EquipmentManager.unequip(character.value, 'armor');
  message.value = r.success ? '卸下防具' : r.reason ?? '失败';
}

function handleUnequipTreasure(itemId: string) {
  if (!character.value) return;
  const r = EquipmentManager.unequip(character.value, 'treasures', itemId);
  message.value = r.success ? '卸下法宝' : r.reason ?? '失败';
}

const attrLabels: Record<string, string> = {
  attack: '攻击', defense: '防御', critRate: '暴击',
  physique: '根骨', comprehension: '悟性', perception: '神识',
  agility: '身法', luck: '气运',
};

function formatAttrs(attrs: Record<string, number>): string {
  return Object.entries(attrs)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${attrLabels[k] ?? k}+${v}`)
    .join(' ');
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">乾坤袋</h1>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <!-- 装备面板 -->
    <div class="bg-surface rounded-lg border border-line p-4 space-y-2">
      <h2 class="text-sm font-semibold text-ink-soft mb-2">当前装备</h2>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="flex justify-between">
          <span class="text-muted">武器</span>
          <span class="font-semibold">{{ equipmentDisplay?.weapon }}</span>
          <button v-if="character?.equipmentSlots.weapon" @click="handleUnequipWeapon"
            class="text-xs text-danger ml-2">卸下</button>
        </div>
        <div class="flex justify-between">
          <span class="text-muted">防具</span>
          <span class="font-semibold">{{ equipmentDisplay?.armor }}</span>
          <button v-if="character?.equipmentSlots.armor" @click="handleUnequipArmor"
            class="text-xs text-danger ml-2">卸下</button>
        </div>
      </div>
      <div v-if="equipmentDisplay?.treasures.length" class="text-sm">
        <span class="text-muted">法宝：</span>
        <span v-for="t in character?.equipmentSlots.treasures" :key="t.id"
          class="inline-flex items-center gap-1 mr-3">
          <span class="font-semibold">{{ t.name }}</span>
          <button @click="handleUnequipTreasure(t.id)" class="text-xs text-danger">卸下</button>
        </span>
      </div>
    </div>

    <!-- 背包列表 -->
    <div class="space-y-2">
      <h2 class="text-sm font-semibold text-ink-soft">物品 ({{ inventoryItems.length }})</h2>
      <div v-if="inventoryItems.length === 0" class="text-sm text-muted p-4 text-center">空空如也</div>
      <div v-for="stack in inventoryItems" :key="stack.item.id"
        class="bg-surface rounded-lg border border-line p-3 flex items-center justify-between">
        <div>
          <div class="text-sm font-semibold">{{ stack.item.name }}
            <span class="text-xs text-muted">x{{ stack.count }}</span>
          </div>
          <div class="text-xs text-ink-soft">
            {{ stack.item.type }} · {{ stack.item.tier }}阶
            <span v-if="Object.keys(stack.item.attributes).length">
              · {{ formatAttrs(stack.item.attributes) }}
            </span>
          </div>
        </div>
        <button v-if="stack.item.type === 'Equipment'" @click="handleEquip(stack.item)"
          class="px-2 py-1 bg-jade text-white rounded text-xs">装备</button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 添加路由**

```typescript
// apps/taosim-ui/src/router/routes.ts — 在 routes 数组末尾（] 前）添加：
  {
    path: '/inventory',
    name: 'inventory',
    component: () => import('../pages/InventoryPage.vue'),
    meta: { title: '背包' },
  },
```

- [ ] **Step 4: Typecheck**

```bash
npm run build -w @taosim/engine ; npm run typecheck -w @taosim/taosim-ui
```

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/pages/InventoryPage.vue apps/taosim-ui/src/router/routes.ts packages/engine/src/index.ts
git commit -m "feat(ui): add InventoryPage — equipment equip/unequip + item list"
```

---

### Task 4: PresetMap — 预设大世界地图

**Files:**
- Create: `packages/engine/src/overworld/preset-map.ts`

- [ ] **Step 1: 创建预设地图数据**

```typescript
// packages/engine/src/overworld/preset-map.ts
import type { OverworldMap, OverworldNode, OverworldContinent } from '@taosim/contracts';

function makeNode(
  id: string, name: string, type: OverworldNode['type'], tier: number,
  x: number, y: number, travelCostDays: number,
  baseTerrain: 'Forest' | 'Swamp' | 'Volcano' | 'Cave' | 'Snow' = 'Forest',
): OverworldNode {
  return {
    id, name, continentId: 'CONT_EAST', coordinates: { x, y },
    type, tier, travelCostDays,
    battleMapConfig: {
      baseTerrain,
      clusterDensity: 0.4 + tier * 0.1,
      hazardProbability: 0.1 + tier * 0.05,
    },
  };
}

export const PRESET_MAP: OverworldMap = {
  continents: [
    {
      id: 'CONT_EAST',
      name: '东荒',
      nodes: {
        'NODE_SECT_QINGYUN': makeNode('NODE_SECT_QINGYUN', '青云宗', 'Sect', 2, 400, 250, 0),
        'NODE_CITY_TIANJI': makeNode('NODE_CITY_TIANJI', '天机城', 'City', 3, 550, 200, 3),
        'NODE_MARKET': makeNode('NODE_MARKET', '坊市', 'Market', 2, 650, 350, 2),
        'NODE_DUNGEON_HEIFENG': makeNode('NODE_DUNGEON_HEIFENG', '黑风洞', 'Dungeon', 3, 700, 150, 4, 'Cave'),
        'NODE_WILD_EAST': makeNode('NODE_WILD_EAST', '落霞荒野东', 'Wilderness', 1, 500, 350, 2, 'Swamp'),
        'NODE_WILD_NORTH': makeNode('NODE_WILD_NORTH', '落霞荒野北', 'Wilderness', 2, 350, 150, 2),
        'NODE_WILD_SOUTH': makeNode('NODE_WILD_SOUTH', '落霞荒野南', 'Wilderness', 2, 350, 450, 3, 'Swamp'),
        'NODE_DUNGEON_MINE': makeNode('NODE_DUNGEON_MINE', '灵脉矿洞', 'Dungeon', 2, 200, 300, 3, 'Cave'),
        'NODE_SECT_TIANJIAN': makeNode('NODE_SECT_TIANJIAN', '天剑宗', 'Sect', 2, 80, 300, 3),
        'NODE_WILD_SWAMP': makeNode('NODE_WILD_SWAMP', '幽冥沼泽', 'Wilderness', 3, 80, 450, 4, 'Swamp'),
        'NODE_DUNGEON_STAR': makeNode('NODE_DUNGEON_STAR', '陨星谷', 'Dungeon', 4, 200, 550, 5, 'Volcano'),
        'NODE_DUNGEON_ANCIENT': makeNode('NODE_DUNGEON_ANCIENT', '荒古战场', 'Dungeon', 5, 350, 600, 6, 'Volcano'),
      },
      edges: [
        { fromNodeId: 'NODE_SECT_QINGYUN', toNodeId: 'NODE_WILD_EAST', distanceDays: 2 },
        { fromNodeId: 'NODE_SECT_QINGYUN', toNodeId: 'NODE_CITY_TIANJI', distanceDays: 3 },
        { fromNodeId: 'NODE_CITY_TIANJI', toNodeId: 'NODE_MARKET', distanceDays: 2 },
        { fromNodeId: 'NODE_CITY_TIANJI', toNodeId: 'NODE_DUNGEON_HEIFENG', distanceDays: 3 },
        { fromNodeId: 'NODE_MARKET', toNodeId: 'NODE_WILD_SOUTH', distanceDays: 2 },
        { fromNodeId: 'NODE_WILD_EAST', toNodeId: 'NODE_WILD_NORTH', distanceDays: 2 },
        { fromNodeId: 'NODE_WILD_NORTH', toNodeId: 'NODE_DUNGEON_MINE', distanceDays: 2 },
        { fromNodeId: 'NODE_WILD_SOUTH', toNodeId: 'NODE_DUNGEON_MINE', distanceDays: 2 },
        { fromNodeId: 'NODE_DUNGEON_MINE', toNodeId: 'NODE_SECT_TIANJIAN', distanceDays: 2 },
        { fromNodeId: 'NODE_SECT_TIANJIAN', toNodeId: 'NODE_WILD_SWAMP', distanceDays: 3 },
        { fromNodeId: 'NODE_DUNGEON_HEIFENG', toNodeId: 'NODE_WILD_SWAMP', distanceDays: 4 },
        { fromNodeId: 'NODE_WILD_SWAMP', toNodeId: 'NODE_DUNGEON_STAR', distanceDays: 3 },
        { fromNodeId: 'NODE_DUNGEON_STAR', toNodeId: 'NODE_DUNGEON_ANCIENT', distanceDays: 4 },
      ],
    },
  ],
};

/** 获取节点相邻列表 */
export function getNeighbors(nodeId: string): string[] {
  const continent = PRESET_MAP.continents[0]!;
  const neighbors: string[] = [];
  for (const e of continent.edges) {
    if (e.fromNodeId === nodeId) neighbors.push(e.toNodeId);
    if (e.toNodeId === nodeId) neighbors.push(e.fromNodeId);
  }
  return neighbors;
}

/** 获取两节点间的边信息（含距离天数） */
export function getEdge(fromId: string, toId: string): { fromNodeId: string; toNodeId: string; distanceDays: number } | null {
  const continent = PRESET_MAP.continents[0]!;
  return continent.edges.find(
    e => (e.fromNodeId === fromId && e.toNodeId === toId) || (e.fromNodeId === toId && e.toNodeId === fromId),
  ) ?? null;
}
```

- [ ] **Step 2: 无测试（纯数据文件），直接 Commit**

```bash
git add packages/engine/src/overworld/preset-map.ts
git commit -m "feat(engine): add preset overworld map — 12 nodes on East Waste continent"
```

---

### Task 5: OverworldMapGenerator — 程序化地图生成

**Files:**
- Create: `packages/engine/src/overworld/overworld-map-generator.ts`
- Create: `packages/engine/src/__tests__/overworld-map-generator.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/overworld-map-generator.test.ts
import { describe, it, expect } from 'vitest';
import { OverworldMapGenerator } from '../overworld/overworld-map-generator.js';

describe('OverworldMapGenerator', () => {
  it('生成指定节点数量的大陆', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 8, seed: 42 });
    expect(map.continents).toHaveLength(1);
    const continent = map.continents[0]!;
    const nodeIds = Object.keys(continent.nodes);
    expect(nodeIds.length).toBeGreaterThanOrEqual(6);
    expect(nodeIds.length).toBeLessThanOrEqual(12);
  });

  it('节点包含不同类型', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 10, seed: 123 });
    const continent = map.continents[0]!;
    const types = new Set(Object.values(continent.nodes).map(n => n.type));
    // 至少有 2 种以上节点类型
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it('边连接相邻节点', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 8, seed: 99 });
    const continent = map.continents[0]!;
    expect(continent.edges.length).toBeGreaterThan(0);
    // 每条边引用存在的节点
    for (const e of continent.edges) {
      expect(continent.nodes[e.fromNodeId]).toBeDefined();
      expect(continent.nodes[e.toNodeId]).toBeDefined();
      expect(e.distanceDays).toBeGreaterThan(0);
    }
  });

  it('相同种子产生相同地图', () => {
    const a = OverworldMapGenerator.generate({ nodeCount: 8, seed: 777 });
    const b = OverworldMapGenerator.generate({ nodeCount: 8, seed: 777 });
    const nodesA = Object.keys(a.continents[0]!.nodes).sort();
    const nodesB = Object.keys(b.continents[0]!.nodes).sort();
    expect(nodesA).toEqual(nodesB);
  });

  it('生成的地图有起始节点（Sect 类型）', () => {
    const map = OverworldMapGenerator.generate({ nodeCount: 10, seed: 555 });
    const continent = map.continents[0]!;
    const sects = Object.values(continent.nodes).filter(n => n.type === 'Sect');
    expect(sects.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: 实现 OverworldMapGenerator**

```typescript
// packages/engine/src/overworld/overworld-map-generator.ts
import type { OverworldMap, OverworldNode, OverworldContinent, TerrainType } from '@taosim/contracts';

export interface GeneratorConfig {
  nodeCount: number;
  seed: number;
}

// 简易种子随机数
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const NODE_TYPES: OverworldNode['type'][] = ['Wilderness', 'Wilderness', 'Wilderness', 'Dungeon', 'Dungeon', 'Market', 'City', 'Sect'];
const TERRAINS: TerrainType[] = ['Forest', 'Swamp', 'Volcano', 'Cave', 'Snow'];

export class OverworldMapGenerator {
  static generate(config: GeneratorConfig): OverworldMap {
    const rand = seededRandom(config.seed);
    const count = Math.max(6, Math.min(16, config.nodeCount));

    const nodes: Record<string, OverworldNode> = {};
    const edges: { fromNodeId: string; toNodeId: string; distanceDays: number }[] = [];
    const nodeList: OverworldNode[] = [];

    // 1. 生成节点（环形布局 + 随机扰动）
    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / count + (rand() - 0.5) * 0.4;
      const radius = 200 + rand() * 150;
      const x = 400 + Math.cos(angle) * radius;
      const y = 300 + Math.sin(angle) * radius;

      const type = NODE_TYPES[i % NODE_TYPES.length]!;
      const tier = type === 'Dungeon' ? 2 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 3);
      const terrain = TERRAINS[Math.floor(rand() * TERRAINS.length)]!;

      const node: OverworldNode = {
        id: `GEN_NODE_${i}`,
        name: `${type}_${i + 1}`,
        continentId: 'CONT_GEN',
        coordinates: { x: Math.round(x), y: Math.round(y) },
        type,
        tier,
        travelCostDays: 1 + Math.floor(rand() * 4),
        battleMapConfig: {
          baseTerrain: terrain,
          clusterDensity: 0.3 + rand() * 0.4,
          hazardProbability: 0.1 + rand() * 0.3,
        },
      };

      nodes[node.id] = node;
      nodeList.push(node);
    }

    // 2. 连接相邻节点（环形 + 随机额外连接）
    for (let i = 0; i < count; i++) {
      const from = nodeList[i]!;
      const to = nodeList[(i + 1) % count]!;
      edges.push({
        fromNodeId: from.id,
        toNodeId: to.id,
        distanceDays: 1 + Math.floor(rand() * 4),
      });

      // 30% 概率额外连接到更远的节点
      if (rand() < 0.3 && count > 4) {
        const extraIdx = (i + 2 + Math.floor(rand() * (count - 3))) % count;
        if (extraIdx !== i && extraIdx !== (i + 1) % count) {
          edges.push({
            fromNodeId: from.id,
            toNodeId: nodeList[extraIdx]!.id,
            distanceDays: 2 + Math.floor(rand() * 5),
          });
        }
      }
    }

    const continent: OverworldContinent = {
      id: 'CONT_GEN',
      name: '随机大陆',
      nodes,
      edges,
    };

    return { continents: [continent] };
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/overworld-map-generator.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/overworld/overworld-map-generator.ts packages/engine/src/__tests__/overworld-map-generator.test.ts
git commit -m "feat(engine): add OverworldMapGenerator — seed-driven procedural node graph"
```

---

### Task 6: OverworldEngine — 旅行引擎 + 奇遇 + NPC 偶遇

**Files:**
- Create: `packages/engine/src/overworld/overworld-engine.ts`
- Create: `packages/engine/src/__tests__/overworld-engine.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/engine/src/__tests__/overworld-engine.test.ts
import { describe, it, expect } from 'vitest';
import { OverworldEngine, TravelResult } from '../overworld/overworld-engine.js';
import type { Character, OverworldMap } from '@taosim/contracts';

function makePlayer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'P1', name: '旅行者', gender: 'Male', realm: 'Foundation_1', soulState: 'Active',
    cultivation: { currentExp: 0, maxExp: 500 },
    lifespan: { age: 30, maxLifespan: 200 },
    spiritEnergy: { current: 100, max: 100 },
    monthlyActionPoints: { current: 10, max: 10 },
    attributes: { physique: 10, comprehension: 5, perception: 5, agility: 5, luck: 5 },
    hp: 200, maxHp: 200, ap: 3, canFly: true,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills: [], skillCooldowns: {}, traits: [], relations: {}, wantedLevels: {},
    factionId: undefined, factionRank: undefined,
    ...overrides,
  } as Character;
}

const testMap: OverworldMap = {
  continents: [{
    id: 'C1', name: '测试大陆',
    nodes: {
      'N1': {
        id: 'N1', name: '起点', continentId: 'C1', coordinates: { x: 100, y: 100 },
        type: 'Sect', tier: 1, travelCostDays: 0,
        battleMapConfig: { baseTerrain: 'Forest', clusterDensity: 0.5, hazardProbability: 0.1 },
      },
      'N2': {
        id: 'N2', name: '终点', continentId: 'C1', coordinates: { x: 300, y: 100 },
        type: 'Wilderness', tier: 2, travelCostDays: 0,
        battleMapConfig: { baseTerrain: 'Swamp', clusterDensity: 0.5, hazardProbability: 0.2 },
      },
      'N3': {
        id: 'N3', name: '孤岛', continentId: 'C1', coordinates: { x: 500, y: 500 },
        type: 'Dungeon', tier: 5, travelCostDays: 0,
        battleMapConfig: { baseTerrain: 'Cave', clusterDensity: 0.8, hazardProbability: 0.5 },
      },
    },
    edges: [
      { fromNodeId: 'N1', toNodeId: 'N2', distanceDays: 3 },
    ],
  }],
};

describe('OverworldEngine', () => {
  it('相邻节点间可旅行', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N2', testMap);
    expect(result.success).toBe(true);
    expect(result.currentNodeId).toBe('N2');
    expect(result.daysPassed).toBe(3);
  });

  it('非相邻节点不可直接旅行', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N3', testMap);
    expect(result.success).toBe(false);
    expect(result.reason).toContain('不相邻');
  });

  it('旅行可能触发奇遇事件', () => {
    const player = makePlayer({ attributes: { ...makePlayer().attributes, luck: 99 } });
    let hadEncounter = false;
    for (let i = 0; i < 30; i++) {
      const p = makePlayer();
      const result = OverworldEngine.travel(p, 'N1', 'N2', testMap);
      if (result.events.length > 0) hadEncounter = true;
    }
    expect(hadEncounter).toBe(true);
  });

  it('起点终点相同时不消耗天数', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N1', testMap);
    expect(result.success).toBe(true);
    expect(result.daysPassed).toBe(0);
  });

  it('旅行消耗天数', () => {
    const player = makePlayer();
    const result = OverworldEngine.travel(player, 'N1', 'N2', testMap);
    expect(result.success).toBe(true);
    expect(result.daysPassed).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 实现 OverworldEngine**

```typescript
// packages/engine/src/overworld/overworld-engine.ts
import type { Character, OverworldMap, Item, BigEventLog } from '@taosim/contracts';

export interface TravelResult {
  success: boolean;
  reason?: string;
  currentNodeId?: string;
  daysPassed: number;
  events: TravelEvent[];
}

export interface TravelEvent {
  type: 'encounter' | 'battle' | 'npc_meet' | 'material_found';
  title: string;
  description: string;
  nodeId?: string;
  materials?: { itemId: string; itemName: string }[];
}

const MATERIAL_POOL: Record<number, { id: string; name: string }[]> = {
  1: [{ id: 'MAT_SPIRIT_GRASS', name: '灵草' }, { id: 'MAT_IRON_ORE', name: '铁矿石' }],
  2: [{ id: 'MAT_YIN_DEW', name: '阴露' }, { id: 'MAT_YANG_STONE', name: '阳石' }, { id: 'MAT_BLOOD_FLOWER', name: '血花' }],
  3: [{ id: 'MAT_SPIRIT_STONE', name: '灵石矿' }, { id: 'MAT_JADE', name: '灵玉' }],
  4: [{ id: 'MAT_METEORITE', name: '陨铁' }, { id: 'MAT_DRAGON_BLOOD', name: '龙血' }],
  5: [{ id: 'MAT_STARLIGHT', name: '星光碎片' }, { id: 'MAT_PHOENIX_FEATHER', name: '凤羽' }],
};

export class OverworldEngine {
  static travel(
    character: Character,
    fromNodeId: string,
    toNodeId: string,
    map: OverworldMap,
  ): TravelResult {
    const continent = map.continents[0];
    if (!continent) return { success: false, reason: '大陆不存在', daysPassed: 0, events: [] };

    const fromNode = continent.nodes[fromNodeId];
    const toNode = continent.nodes[toNodeId];
    if (!fromNode || !toNode) return { success: false, reason: '节点不存在', daysPassed: 0, events: [] };

    // 同节点
    if (fromNodeId === toNodeId) {
      return { success: true, currentNodeId: toNodeId, daysPassed: 0, events: [] };
    }

    // 校验相邻
    const edge = continent.edges.find(
      e => (e.fromNodeId === fromNodeId && e.toNodeId === toNodeId) ||
           (e.fromNodeId === toNodeId && e.toNodeId === fromNodeId),
    );
    if (!edge) return { success: false, reason: '节点不相邻，不可直接旅行', daysPassed: 0, events: [] };

    const daysPassed = edge.distanceDays;
    const events: TravelEvent[] = [];

    // 奇遇判定（~30% 基础概率 + 气运加成）
    const luckBonus = character.attributes.luck / 200;
    const encounterChance = 0.3 + luckBonus;

    if (Math.random() < encounterChance) {
      const roll = Math.random();

      if (roll < 0.4) {
        // 获得材料
        const pool = MATERIAL_POOL[toNode.tier] ?? MATERIAL_POOL[1]!;
        const mat = pool[Math.floor(Math.random() * pool.length)]!;
        events.push({
          type: 'material_found',
          title: '发现材料',
          description: `旅行途中发现 ${mat.name}`,
          nodeId: toNodeId,
          materials: [{ itemId: mat.id, itemName: mat.name }],
        });
      } else if (roll < 0.7) {
        // 触发战斗
        events.push({
          type: 'battle',
          title: '遭遇敌人',
          description: `在${toNode.name}附近遭遇妖兽！`,
          nodeId: toNodeId,
        });
      } else {
        // NPC 偶遇
        const npcNames = ['云游散修', '外出历练的弟子', '神秘商人'];
        const npcName = npcNames[Math.floor(Math.random() * npcNames.length)]!;
        events.push({
          type: 'npc_meet',
          title: '偶遇修士',
          description: `在${toNode.name}附近遇到了${npcName}`,
          nodeId: toNodeId,
        });
      }
    }

    return { success: true, currentNodeId: toNodeId, daysPassed, events };
  }
}
```

- [ ] **Step 3: 运行测试**

```bash
npm run test -w @taosim/engine -- src/__tests__/overworld-engine.test.ts
```
Expected: 5 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/overworld/overworld-engine.ts packages/engine/src/__tests__/overworld-engine.test.ts
git commit -m "feat(engine): add OverworldEngine — travel + encounters + NPC meetups"
```

---

### Task 7: OverworldPage UI + 引擎导出

**Files:**
- Create: `apps/taosim-ui/src/pages/OverworldPage.vue`
- Modify: `apps/taosim-ui/src/router/routes.ts`
- Modify: `packages/engine/src/index.ts` — 导出 overworld 模块

- [ ] **Step 1: 更新 engine 导出**

```typescript
// packages/engine/src/index.ts — 添加：
export { OverworldEngine } from './overworld/overworld-engine.js';
export { OverworldMapGenerator } from './overworld/overworld-map-generator.js';
export { PRESET_MAP, getNeighbors, getEdge } from './overworld/preset-map.js';
```

- [ ] **Step 2: 创建 OverworldPage**

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePlayerStore } from '@/stores/player';
import { OverworldEngine, PRESET_MAP, getNeighbors, getEdge } from '@taosim/engine';
import type { OverworldNode, TravelEvent } from '@taosim/contracts';

const playerStore = usePlayerStore();
const currentNodeId = ref('NODE_SECT_QINGYUN');
const message = ref<string | null>(null);
const travelEvents = ref<{ type: string; title: string; description: string }[]>([]);
const daysPassed = ref(0);

const continent = computed(() => PRESET_MAP.continents[0]!);

const currentNode = computed<OverworldNode | undefined>(() =>
  continent.value?.nodes[currentNodeId.value],
);

const neighborIds = computed(() => getNeighbors(currentNodeId.value));

const neighborNodes = computed(() =>
  neighborIds.value.map(id => continent.value?.nodes[id]).filter(Boolean) as OverworldNode[],
);

function handleTravel(targetNodeId: string) {
  if (!playerStore.character) return;
  const edge = getEdge(currentNodeId.value, targetNodeId);
  const distance = edge?.distanceDays ?? '?';

  const result = OverworldEngine.travel(
    playerStore.character,
    currentNodeId.value,
    targetNodeId,
    PRESET_MAP,
  );

  if (result.success) {
    currentNodeId.value = result.currentNodeId ?? currentNodeId.value;
    daysPassed.value = result.daysPassed;
    travelEvents.value = result.events;
    message.value = `抵达 ${continent.value?.nodes[targetNodeId]?.name}（耗时 ${distance} 天）`;
  } else {
    message.value = result.reason ?? '旅行失败';
  }
}

function goToNode(nodeId: string) {
  currentNodeId.value = nodeId;
  message.value = null;
  travelEvents.value = [];
}
</script>

<template>
  <div class="max-w-content mx-auto px-6 py-8 space-y-6">
    <h1 class="text-2xl font-display text-ink">大世界 — {{ continent?.name }}</h1>

    <!-- 当前位置 -->
    <div class="bg-surface rounded-lg border border-line p-4 text-sm">
      <span class="text-muted">当前位置：</span>
      <span class="font-semibold text-jade">{{ currentNode?.name ?? '未知' }}</span>
      <span class="text-xs text-muted ml-2">（{{ currentNode?.type }} · {{ currentNode?.tier }}阶）</span>
    </div>

    <div v-if="message" class="p-3 rounded-md text-sm bg-jade-soft text-jade">{{ message }}</div>

    <!-- 旅行事件 -->
    <div v-if="travelEvents.length > 0" class="space-y-2">
      <h3 class="text-sm font-semibold text-ink-soft">途中事件</h3>
      <div v-for="(evt, i) in travelEvents" :key="i"
        class="bg-surface rounded-lg border border-line p-3 text-sm">
        <span class="font-semibold">{{ evt.title }}</span>
        <span class="text-ink-soft ml-2">{{ evt.description }}</span>
      </div>
    </div>

    <!-- 相邻节点 -->
    <div>
      <h3 class="text-sm font-semibold text-ink-soft mb-2">可前往</h3>
      <div class="grid grid-cols-2 gap-3">
        <button v-for="node in neighborNodes" :key="node.id"
          @click="handleTravel(node.id)"
          class="bg-surface rounded-lg border border-line p-3 text-left hover:border-jade transition text-sm">
          <div class="font-semibold">{{ node.name }}</div>
          <div class="text-xs text-muted">
            {{ node.type }} · {{ node.tier }}阶 ·
            {{ getEdge(currentNodeId, node.id)?.distanceDays ?? '?' }} 天
          </div>
        </button>
      </div>
      <div v-if="neighborNodes.length === 0" class="text-sm text-muted p-2">无相邻节点</div>
    </div>

    <!-- 地图节点一览 -->
    <div>
      <h3 class="text-sm font-semibold text-ink-soft mb-2">大陆节点一览</h3>
      <div class="grid grid-cols-4 gap-2 text-xs">
        <button v-for="(node, id) in continent?.nodes" :key="id"
          @click="goToNode(id as string)"
          :class="[
            'p-2 rounded border text-left',
            id === currentNodeId ? 'border-jade bg-jade-soft' : 'border-line bg-surface',
          ]">
          <div class="font-semibold">{{ node.name }}</div>
          <div class="text-muted">{{ node.type }} · {{ node.tier }}阶</div>
        </button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: 添加路由**

```typescript
// apps/taosim-ui/src/router/routes.ts — 在 routes 数组末尾（] 前）添加：
  {
    path: '/overworld',
    name: 'overworld',
    component: () => import('../pages/OverworldPage.vue'),
    meta: { title: '大世界' },
  },
```

- [ ] **Step 4: Typecheck**

```bash
npm run build -w @taosim/engine ; npm run typecheck -w @taosim/taosim-ui
```

- [ ] **Step 5: Commit**

```bash
git add apps/taosim-ui/src/pages/OverworldPage.vue apps/taosim-ui/src/router/routes.ts packages/engine/src/index.ts
git commit -m "feat(ui): add OverworldPage — node travel + encounters + map view"
```

---

### Task 8: 全量验证 + 推送

- [ ] **Step 1: 运行全量检查**

```bash
npm run check
```
Expected: typecheck 全通过，48 + 14 = ~62 tests PASS

- [ ] **Step 2: Commit plan & push**

```bash
git add docs/superpowers/specs/2026-08-05-phase-4-equipment-overworld-design.md docs/superpowers/plans/2026-08-05-phase-4-equipment-overworld.md
git commit -m "docs: Phase 4 plan — equipment & overworld exploration"
```

---

## 总览

| Task | 模块 | 新增文件 | 修改文件 | 新测试 |
|------|------|----------|----------|--------|
| 1 | EquipmentManager | 2 | 0 | 4 |
| 2 | DamagePipeline 集成 | 0 | 1 | — |
| 3 | InventoryPage UI | 1 | 2 | — |
| 4 | PresetMap | 1 | 0 | — |
| 5 | OverworldMapGenerator | 2 | 0 | 5 |
| 6 | OverworldEngine | 2 | 0 | 5 |
| 7 | OverworldPage UI | 1 | 2 | — |
| 8 | 全量验证 | 0 | 0 | — |
| **合计** | | **9** | **5** | **14 tests** |

**可并行：** Task 1-3（装备系统）与 Task 4-7（大世界）完全独立，可同时开发。

**目标：48 → 62 个测试**
