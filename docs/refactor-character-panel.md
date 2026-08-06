# TaoSim 角色卡重构方案

## 一、目标

将散落在 4 个 tab（修炼/百艺/背包/角色弹窗）的角色信息合并为统一的「角色」tab，内部用子页签组织（参考鬼谷八荒角色界面），同时保留点击头像弹窗的快捷查看方式。全量补齐 i18n 中文映射。

---

## 二、导航结构变更

### 当前（6 tab）

```
大地图 | 修炼 | [百艺] | [坊市] | [人际] | 背包
```

### 改后（4 tab）

```
大地图 | 角色 | [坊市] | [人际]
```

- 坊市/人际保持条件显示不变
- 修炼/百艺/背包 合并进「角色」tab
- 左上角 TopBar 的头像点击仍然弹窗（精简版概览）

---

## 三、「角色」tab 内部结构

`CharacterPanel.vue` — 5 个子页签

```
概览 | 修炼 | 功法 | 百艺 | 背包
```

### 3.1 概览（OverviewTab.vue）

内容来自原 `CharacterDetailModal.vue`：

- 角色名、性别、境界、寿元、灵根、魂态
- 六维属性条（根骨/悟性/神识/身法/气运/仙姿）
- 天赋词条列表
- 游戏模式（铁人/自由）

### 3.2 修炼（CultivationTab.vue）

内容来自原 `CultivationPanel.vue`（去掉返回场所按钮逻辑，保留）：

- 修为进度条
- 修炼速度面板（悟性×灵根×灵气浓度）
- 闭关按钮（1月/3月/6月/1年/5年/10年）
- 境界圆满提升（小境界）
- 突破契机（大境界）
- 宗门贡献/晋升

### 3.3 功法（SkillsTab.vue）

新页面，展示角色技能 + 装备概览：

- **功法技能列表**：name + quality + type（主动/被动）
- **装备概览**：武器/防具/法宝（只读展示，穿戴在背包子页签操作）

### 3.4 百艺（CraftingTab.vue）

内容来自原 `CraftingPanel.vue`，**始终显示**（不再条件判断）：

- 顶部子切换：炼丹 / 炼器 / 升品
- **炼丹**：已解锁丹方列表（有则可制作，无则显示"尚未习得，可在坊市购买丹方"）
- **炼器**：已解锁锻造列表（同上）
- **升品**：物品升品界面
- 未解锁配方显示锁定状态 + 获取提示

### 3.5 背包（InventoryTab.vue）

内容来自原 `InventoryPanel.vue`：

- 装备穿戴区（武器/防具/法宝，可装备/卸下）
- 物品列表（按类型筛选：全部/丹药/装备/材料/秘籍/法宝）
- 点击物品显示详情 + 操作（使用/装备/丢弃）

---

## 四、文件改动清单

### 4.1 新建文件

| 文件 | 说明 |
|------|------|
| `apps/taosim-ui/src/game/panels/CharacterPanel.vue` | 角色 tab 主容器（子页签切换） |
| `apps/taosim-ui/src/game/panels/character/OverviewTab.vue` | 概览子页签 |
| `apps/taosim-ui/src/game/panels/character/CultivationTab.vue` | 修炼子页签 |
| `apps/taosim-ui/src/game/panels/character/SkillsTab.vue` | 功法子页签 |
| `apps/taosim-ui/src/game/panels/character/CraftingTab.vue` | 百艺子页签 |
| `apps/taosim-ui/src/game/panels/character/InventoryTab.vue` | 背包子页签 |

### 4.2 修改文件

| 文件 | 改动 |
|------|------|
| `apps/taosim-ui/src/stores/ui.ts` | `GameTab` 类型加 `'character'`，去掉 `'cult'` `'craft'` `'inv'` |
| `apps/taosim-ui/src/game/BottomNav.vue` | tab 列表改为 4 tab |
| `apps/taosim-ui/src/game/MainContent.vue` | `'character'` tab 渲染 `CharacterPanel`，去掉旧的 cult/craft/inv 分支 |
| `apps/taosim-ui/src/game/CharacterDetailModal.vue` | 精简为快速概览弹窗（只保留基础信息+六维+灵根，不重复技能/装备） |
| `apps/taosim-ui/src/utils/i18n-game.ts` | 补全所有 i18n 映射函数 |

### 4.3 可删除文件（内容迁移后）

| 文件 | 去向 |
|------|------|
| `CultivationPanel.vue` | → `CultivationTab.vue` |
| `CraftingPanel.vue` | → `CraftingTab.vue` |
| `InventoryPanel.vue` | → `InventoryTab.vue` |

> 注意：MapPanel/VenuePanel/MaketPanel/NpcPanel 中引用旧面板的逻辑需同步修改（如 `uiStore.setTab('cult')` → `uiStore.setTab('character')`）。

---

## 五、i18n 全量映射

在 `apps/taosim-ui/src/utils/i18n-game.ts` 中新增以下映射：

### 5.1 配方 ID → 中文名

```typescript
const RECIPE_NAME_MAP: Record<string, string> = {
  // 丹方
  RECIPE_QI_PILL: '聚气丹',
  RECIPE_BLOOD_PILL: '活血丹',
  RECIPE_CLEAR_SOUL_PILL: '清心丹',
  RECIPE_TONIFY_PILL: '培元丹',
  RECIPE_FOUNDATION_PILL: '筑基丹',
  RECIPE_ANTIDOTE_PILL: '解毒丹',
  RECIPE_QI_CONDENSE_PILL: '凝气丹',
  RECIPE_REVIVE_PILL: '回春丹',
  RECIPE_MERIDIAN_PILL: '护脉丹',
  RECIPE_LONGEVITY_PILL: '延寿丹',
  RECIPE_MARROW_WASH_PILL: '洗髓丹',
  RECIPE_BARRIER_PILL: '破障丹',
  RECIPE_BONE_FORGE_PILL: '锻骨丹',
  RECIPE_SPIRIT_LINK_PILL: '通灵丹',
  RECIPE_NINE_TURN_SOUL_PILL: '九转还魂丹',
  RECIPE_DRAGON_BODY_PILL: '龙血锻体丹',
  RECIPE_SKY_BREAK_PILL: '天元破境丹',
  RECIPE_CHAOS_NINE_TURN_PILL: '混沌九转丹',
  // 锻造
  RECIPE_IRON_SWORD: '青锋剑',
  RECIPE_SPIRIT_CLOTH: '灵草布衣',
  RECIPE_SPIRIT_SWORD: '灵蕴剑',
  RECIPE_SPIRIT_ARMOR: '灵甲',
  RECIPE_COLD_MOON_BLADE: '冷月玄刀',
  RECIPE_WIND_SPEAR: '破风枪',
  RECIPE_YIN_YANG_ROBE: '阴阳道袍',
  RECIPE_STAR_SWORD: '星辰剑',
  RECIPE_HEAVEN_GANG_SWORD: '天罡剑',
  RECIPE_XUAN_GUI_ARMOR: '玄龟宝甲',
  RECIPE_GOLD_SCALE_BOOTS: '金鳞灵靴',
  RECIPE_METEOR_BLADE: '陨星刀',
  RECIPE_MOUNTAIN_SEAL: '山河印',
  RECIPE_DRAGON_SCALE_ARMOR: '龙鳞战甲',
  RECIPE_STAR_PHOENIX_BLADE: '凤鸣星辰剑',
};
```

### 5.2 物品/材料 ID → 中文名

```typescript
const ITEM_ID_NAME_MAP: Record<string, string> = {
  // 材料
  MAT_SPIRIT_GRASS: '灵草',
  MAT_BLOOD_FLOWER: '血花',
  MAT_IRON_ORE: '铁矿石',
  MAT_YIN_DEW: '阴露',
  MAT_YANG_STONE: '阳石',
  MAT_JADE: '灵玉',
  MAT_SPIRIT_STONE: '灵石矿',
  MAT_DRAGON_BLOOD: '龙血',
  MAT_PHOENIX_FEATHER: '凤羽',
  MAT_METEORITE: '陨铁',
  MAT_STARLIGHT: '星光粉',
  MAT_MILLENNIUM_LINGZHI: '万年灵芝',
  MAT_SKY_GOLD_SAND: '天金砂',
  MAT_IMMORTAL_JADE: '仙灵玉髓',
  MAT_CHAOS_STONE: '混沌石',
  // 丹药
  MED_QI_PILL: '聚气丹',
  MED_FOUNDATION_PILL: '筑基丹',
  MED_LONGEVITY_PILL: '延寿丹',
  MED_NASCENT_SOUL_PILL: '凝婴丹',
  // 突破材料
  FoundationPill: '筑基丹',
  GoldenCorePill: '金元丹',
  NascentSoulPill: '凝婴丹',
  SoulFormationPill: '化神丹',
  // 装备
  EQ_SPIRIT_SWORD: '灵蕴剑',
  EQ_SPIRIT_ARMOR: '灵甲',
  EQ_STAR_SWORD: '星辰剑',
};
```

### 5.3 宗门 ID → 中文名

```typescript
const FACTION_NAME_MAP: Record<string, string> = {
  FACTION_QINGYUN_SECT: '青云宗',
  FACTION_TIANJIAN_SECT: '天剑宗',
  FACTION_ANCIENT_CLAN: '世家',
  FACTION_SMALL_CLAN: '小族',
};
```

### 5.4 新增导出函数

```typescript
export function formatRecipeName(id: string): string {
  return RECIPE_NAME_MAP[id] ?? id;
}

export function formatItemId(id: string): string {
  return ITEM_ID_NAME_MAP[id] ?? id;
}

export function formatFactionName(id?: string): string {
  if (!id) return '无';
  return FACTION_NAME_MAP[id] ?? id;
}
```

---

## 六、关键实现细节

### 6.1 GameTab 类型变更

```typescript
// stores/ui.ts
export type GameTab = 'map' | 'character' | 'market' | 'npc';
```

### 6.2 BottomNav 变更

```typescript
const visibleTabs = computed(() => {
  const tabs = [
    { key: 'map', label: '大地图' },
    { key: 'character', label: '角色' },
  ];
  // 坊市/人际条件不变
  return tabs;
});
```

### 6.3 CharacterPanel 子页签状态

```typescript
// CharacterPanel.vue
const activeSubTab = ref<'overview' | 'cultivation' | 'skills' | 'crafting' | 'inventory'>('overview');
```

支持外部跳转：MapPanel/VenuePanel/MarketPanel 中原来 `uiStore.setTab('cult')` 改为：

```typescript
uiStore.setTab('character');
// 可选：通过 query 参数指定子页签
```

### 6.4 百艺始终显示

```typescript
// CraftingTab.vue — 不再检查 hasRecipes/hasSkills
// 未解锁配方显示锁定状态
<div v-if="pillRecipes.length === 0" class="text-center text-slate-500 py-4">
  尚未习得任何丹方，可在坊市购买或探索获得
</div>
```

### 6.5 装备穿戴位置

装备穿戴（equip/unequip）操作保留在 `InventoryTab.vue` 中。`SkillsTab.vue` 只做只读展示。

---

## 七、注意事项

1. **不要改 engine 层**——本次重构纯 UI 层（stores + panels + utils）
2. **保留所有现有功能**——只是搬位置 + 加子页签 + 补 i18n，不删功能
3. **MapPanel 的返回场所按钮**——`backToVenue()` 中 `uiStore.setTab('map')` 不变
4. **VenuePanel 的跳转**——`enterVenue` 中 `uiStore.setTab('cult')` → `uiStore.setTab('character')`，`uiStore.setTab('market')` 不变
5. **铁人模式自动存档**——在 CultivationTab 中保留
6. **编译验证**——改完后执行 `npx vue-tsc --noEmit -p apps\taosim-ui\tsconfig.json`
7. **engine 需重新构建**——如果修改了 contracts，需 `npm run -w @taosim/engine build`
