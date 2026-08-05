# Phase 11 — 可玩性填充 设计规格

> **目标：** 填充 Phase 10 UI 架构留下的空洞，让游戏从"能看"变成"能玩"。覆盖中文本地化、角色详情、大地图旅行、NPC 链路、创角降临方式、配方解锁六个方向。

---

## 1. 问题清单与解决方向

| # | 问题 | 根因 | 本 Phase 解决方案 |
|---|------|------|------------------|
| 1 | 全英文显示 | realm/quality/type 无中文映射 | 新建 i18n-game.ts 集中映射层 |
| 2 | 查看详情空按钮 | charDetailOpen 孤儿状态 | 新建 CharacterDetailModal |
| 3 | 没有大地图 | MapPanel 纯文字，OverworldPage 孤儿 | MapPanel 集成 PRESET_MAP 节点旅行 |
| 4 | NPC 都没有 | 生成链断裂，npc_meet 只产文字 | 引擎层生成 NPC 对象 + UI 层写入 currentNPC |
| 5 | 配方开局全公开 | 无解锁机制 | Recipe 加解锁字段，NPC/探索解锁 |
| 6 | 创角缺沉浸感 | 无降临方式选择 | 诞生（0 岁家世）+ 穿越（指定年龄白板） |

---

## 2. 中文本地化层

### 2.1 新建文件

`apps/taosim-ui/src/utils/i18n-game.ts`

### 2.2 映射表

```typescript
// RealmFullPath → 中文境界
const REALM_LABELS: Record<RealmFullPath, string> = {
  QiRefinement_1: '炼气期一层', QiRefinement_2: '炼气期二层', ...
  SoulFormation_1: '化神期一层',
};
export function formatRealm(r: RealmFullPath): string;

// ItemType → 中文
const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  Medicine: '丹药', Equipment: '装备', Talisman: '法宝',
  Material: '材料', Poison: '毒物', Formula: '秘籍',
};
export function formatItemType(t: ItemType): string;

// ItemQuality → 中文
const ITEM_QUALITY_LABELS: Record<ItemQuality, string> = {
  Common: '凡品', Rare: '灵品', Epic: '宝品', Legendary: '仙品',
};
export function formatQuality(q?: ItemQuality): string;

// Gender → 中文
export function formatGender(g: Gender): string;  // Male→男 Female→女

// SoulState → 中文
const SOUL_STATE_LABELS = {
  Active: '在世', PrimordialSoul: '元神', RemnantSoul: '残魂', Oblivion: '湮灭',
};
export function formatSoulState(s: SoulState): string;
```

### 2.3 应用范围

所有 Panel 组件中直接插值英文枚举的位置，替换为 `formatXxx()` 调用。涉及文件：
- LeftSidebar.vue（realm）
- MapPanel.vue（realm）
- CultivationPanel.vue（realm, toRealm, newRealm）
- InventoryPanel.vue（type, quality）
- CraftingPanel.vue（quality, type）
- MarketPanel.vue（type, quality）
- NpcPanel.vue（realm, gender, type, quality）
- GameOverScreen.vue（realm, soulState）

---

## 3. 角色详情弹窗

### 3.1 新建文件

`apps/taosim-ui/src/game/CharacterDetailModal.vue`

### 3.2 功能

- 在 GameScreen.vue 内以 `v-if="uiStore.charDetailOpen"` 渲染
- 全屏遮罩 + 居中卡片
- 展示内容：
  - 基础信息：道号、性别、境界、年龄/寿元、灵根（品级+元素+变异）、魂态
  - 六维属性：根骨/悟性/神识/身法/气运/仙姿（数值条）
  - 天赋词条：名称 + 品阶色 + 描述 + 效果
  - 技能列表：名称 + 品阶 + 类型
  - 装备概览：武器/防具/法宝
  - 人际关系：关系良好的 NPC 列表（如有）
- 关闭按钮调 `uiStore.closeCharDetail()`
- 点击遮罩也可关闭

---

## 4. 创角扩展——降临方式

### 4.1 设计

CreateCharacterPage 的 background 步骤改为"降临方式"步骤，两个选择：

**诞生**：
- 从 0 岁开始
- 选择家世：散修之家 / 修仙小族 / 修仙世家（保留现有三档）
- 不同家世生成降生故事文本（3-4 句叙事）
- 自动快速推进到 6 岁"开蒙"（修仙资质显现的年龄）
- 家世决定初始资源（灵石/装备/宗门关系）

**穿越**：
- 指定穿越年龄：16 / 20 / 25 / 30 四档
- 无家世加成，无初始装备/灵石/宗门
- 白板开局
- 有一段穿越描述文本
- 穿越者可能有额外特质补偿（如悟性微加成，体现"两世为人"）

### 4.2 CharacterFactory 扩展

```typescript
interface CreateCharacterParams {
  // ... 现有字段
  arrivalMode: 'birth' | 'transmigration';
  startAge?: number;  // 穿越模式用，诞生模式固定 6（开蒙后）
}

// 诞生模式：age = 6，按家世给资源
// 穿越模式：age = startAge，spiritStones = 0，inventory = []，无 faction，comprehension +5（两世为人加成）
```

### 4.3 降生故事文本

```typescript
const BIRTH_STORIES: Record<BackgroundType, string[]> = {
  'orphan': [
    '你出生在东荒一户猎户之家，自幼与山林为伴。',
    '六岁那年，一位云游道人路过，称你根骨不凡，收为记名弟子。',
  ],
  'small-clan': [
    '你降生于修仙小族{家族名}，族中灵气充沛。',
    '六岁开蒙时测得灵根，族中长老亲自指导修行。',
  ],
  'ancient-clan': [
    '你出身修仙世家{家族名}，自幼锦衣玉食，灵药不断。',
    '六岁测灵根时天降异象，被立为嫡系继承人。',
  ],
};
```

---

## 5. 大地图集成

### 5.1 MapPanel 改造

从纯文字面板改为节点旅行系统：

- 玩家有 `currentNodeId`（存入 playerStore 的 character 或独立 ref）
- 显示内容：
  - 当前节点：名称 + 类型图标 + 描述 + tier
  - 邻接节点列表（`getNeighbors(currentNodeId)`）：每个显示名称 + 距离 + 类型
  - 点击邻接节点 → 确认旅行 → 调用 `OverworldEngine.travel` → 消耗时间 → 返回事件
- 旅行结果展示在 EventLog + 如有 NPC 则弹出偶遇提示

### 5.2 玩家位置存储

playerStore 加 `currentNodeId: ref<string>` 和 `setCurrentNode(id)` action。

### 5.3 初始位置

| 降临方式 | 家世 | 初始节点 |
|---------|------|---------|
| 诞生 | orphan | NODE_WILDERNESS_LUXIA_S（落霞荒野南） |
| 诞生 | small-clan | NODE_SECT_QINGYUN（青云宗） |
| 诞生 | ancient-clan | NODE_CITY_TIANJI（天机城） |
| 穿越 | - | NODE_CITY_TIANJI（天机城，随机城镇） |

### 5.4 节点类型交互

旅行到不同类型节点时：
- **City（城镇）**：可访问坊市（切到 market tab）
- **Market（坊市）**：直接切到 market tab
- **Sect（宗门）**：显示宗门信息（暂不深入）
- **Dungeon（秘境）**：显示"危险区域"警告，暂不深入
- **Wilderness（荒野）**：旅行事件概率更高

---

## 6. NPC 链路打通

### 6.1 引擎层修改

**`packages/engine/src/overworld/overworld-engine.ts`**：
- `npc_meet` 事件分支改为：调用 `NPCGenerator.generate(toNode.tier)` 生成实际 Character
- TravelEvent 类型加 `npc?: Character` 字段
- 返回的事件携带生成的 NPC 对象

**`packages/contracts/src/overworld.ts`**：
- TravelEvent 接口加 `npc?: Character` 可选字段

### 6.2 UI 层

**MapPanel.vue**：
- 旅行后检查 events 数组，找到带 `npc` 的事件
- 弹出偶遇提示卡片："偶遇修士 {name}（{realm}），是否上前搭话？"
- 选"是" → `playerStore.setCurrentNPC(npc)` + `uiStore.setTab('npc')`
- 选"否" → 忽略，NPC 消失

**playerStore**：
- 加 `setCurrentNPC(npc: Character)` action（替代直接赋值）

### 6.3 NPC 生成参数

NPCGenerator.generate 按 `toNode.tier` 决定 NPC 强度：
- tier 1 节点：炼气期 NPC
- tier 2 节点：炼气~筑基 NPC
- tier 3 节点：筑基~金丹 NPC

---

## 7. 配方解锁系统

### 7.1 引擎层修改

**`packages/contracts/src/forge.ts`**（或 recipe 相关类型文件）：
- PillRecipe / ForgeRecipe 加 `unlockedByDefault?: boolean`（默认 false）

**`packages/engine/src/crafting/recipe-registry.ts`**：
- 新增 `getUnlockedRecipes(unlockedIds: string[]): { pills: PillRecipe[]; forges: ForgeRecipe[] }`
- 聚气丹（最基础）设 `unlockedByDefault: true`，其他默认锁

**`packages/contracts/src/character.ts`**：
- Character 加 `unlockedRecipes: string[]` 字段（默认 `['RECIPE_QI_PILL']`）

### 7.2 解锁途径

| 途径 | 机制 | 实现 |
|------|------|------|
| NPC 论道 | 论道成功后 20% 概率授予随机配方 | NPCInteractionEngine.discuss 返回值加 `unlockedRecipe?: string` |
| NPC 切磋 | 切磋胜利后 10% 概率授予 | NPCInteractionEngine.duel 返回值加 `unlockedRecipe?: string` |
| 坊市购买 | 秘籍类物品使用后解锁 | InventoryPanel 使用 Formula 物品时调 `character.unlockedRecipes.push(...)` |
| 探索秘境 | 特定节点旅行事件 | OverworldEngine 旅行事件加 `recipe_find` 类型 |

### 7.3 CraftingPanel 改造

- 只显示已解锁配方（`getUnlockedRecipes(character.unlockedRecipes)`）
- 未解锁配方显示"???" + "需从 NPC 处习得"提示，不可点击
- 炼制成功后无特殊变化

---

## 8. 实施顺序

```
Phase 11.1: 显示层修补（可独立，无依赖）
  → i18n-game.ts 中文本地化
  → CharacterDetailModal 角色详情弹窗
  → 所有 Panel 应用 formatXxx()

Phase 11.2: 核心可玩循环（依赖 engine 改动）
  → playerStore 加 currentNodeId/setCurrentNPC
  → OverworldEngine 改造（npc_meet 生成 NPC）
  → MapPanel 集成节点旅行
  → NPC 偶遇提示卡片

Phase 11.3: 系统扩展（依赖 11.2 的 NPC 链路）
  → CreateCharacterPage 降临方式扩展
  → CharacterFactory birth/transmigration 支持
  → Recipe 解锁系统
  → NPC 论道/切磋授予配方

Phase 11.4: 验证 + 打磨
  → 全流程走查
  → 测试补充
```

**可并行**：11.1 和 11.3 的创角部分无依赖，可并行分给不同 subagent。11.2 是核心，必须先于 11.3 的配方部分完成。

---

## 9. 验收标准

1. 游戏中所有英文枚举（realm/quality/type/gender/soulState）显示为中文
2. 点"查看详情"弹出角色完整信息弹窗
3. 创角可选"诞生"（0 岁家世）或"穿越"（指定年龄白板）
4. 大地图 tab 显示节点列表，可点击旅行到邻接节点
5. 旅行中有概率偶遇 NPC，偶遇后可切到 NPC 面板交互（切磋/论道/交易）
6. 百艺 tab 只显示已解锁配方（默认仅聚气丹），未解锁显示"???"
7. NPC 论道/切磋后有概率解锁新配方
8. engine/contracts 改动有测试覆盖
9. 全量测试通过 + typecheck 通过
