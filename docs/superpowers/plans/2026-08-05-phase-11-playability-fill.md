# Phase 11 — 可玩性填充 实施计划

> **Spec**: `docs/superpowers/specs/2026-08-05-phase-11-playability-fill.md`
> **目标**: 从"能看"变成"能玩"——中文本地化、角色详情、大地图旅行、NPC 链路、创角降临方式、配方解锁

---

## 实施约束（从代码研究确认）

| # | 约束 | 来源 |
|---|------|------|
| C1 | `TravelEvent` 当前定义在 `overworld-engine.ts` 内（非 contracts），需迁移到 contracts 跨层共享 | overworld-engine.ts L11-17 |
| C2 | `Character` 接口缺 `unlockedRecipes` 和 `arrivalMode` 字段 | character.ts L67-131 |
| C3 | `playerStore` 无 `currentNodeId`/`setCurrentNPC`/`addExp`/`addSpiritStones` | player.ts L1-65 |
| C4 | OverworldEngine `npc_meet` 分支只生成文字，不调 NPCGenerator | overworld-engine.ts L77-86 |
| C5 | RecipeRegistry 按 `name` 查询（非 id），`listPillRecipes()` 硬编码全量返回 | recipe-registry.ts L66-81 |
| C6 | NPCInteractionEngine.duel/discuss 直接修改 player.relations（副作用） | npc-interaction-engine.ts L12-35 |
| C7 | 测试文件 `makePlayer` 辅助缺 `charm`/`spiritRoot`/`gameMode`，接口扩展后需同步 | overworld-engine.test.ts L5-21 |

---

## Phase 11.1 — 显示层修补（可独立，无依赖）

### Task 1.1 | TDD pair — i18n-game.ts 中文本地化层
- **Input**: RealmFullPath / ItemType / ItemQuality / Gender / SoulState 枚举值
- **Output**: `formatRealm()` / `formatItemType()` / `formatQuality()` / `formatGender()` / `formatSoulState()` 纯函数
- **Risk**: 无（纯映射函数）
- **Rollback**: 删除 `apps/taosim-ui/src/utils/i18n-game.ts`
- **文件**:
  - 新建 `apps/taosim-ui/src/utils/i18n-game.ts`
  - 新建 `apps/taosim-ui/src/utils/__tests__/i18n-game.test.ts`

### Task 1.2 | 实现 i18n-game.ts
- 映射表参照 spec §2.2
- `formatRealm`: QiRefinement_1→'炼气期一层' ... SoulFormation_1→'化神期一层'
- `formatItemType`: Medicine→'丹药', Equipment→'装备', Talisman→'法宝', Material→'材料', Poison→'毒物', Formula→'秘籍'
- `formatQuality`: Common→'凡品', Rare→'灵品', Epic→'宝品', Legendary→'仙品'
- `formatGender`: Male→'男', Female→'女', Other→'其他'
- `formatSoulState`: Active→'在世', PrimordialSoul→'元神', RemnantSoul→'残魂', Oblivion→'湮灭'

### Task 1.3 | 所有 Panel 应用 formatXxx()
- **文件**（8 个）:
  - `LeftSidebar.vue` L30: `{{ c.realm }}` → `{{ formatRealm(c.realm) }}`
  - `MapPanel.vue`: realm 显示（此文件将被 Task 3.4 完全重写，这里只做 i18n 引入）
  - `CultivationPanel.vue`: realm/toRealm/newRealm
  - `InventoryPanel.vue` L104: `{{ stack.item.type }}` → `{{ formatItemType(stack.item.type) }}`
  - `CraftingPanel.vue`: quality/type 显示
  - `MarketPanel.vue`: type/quality
  - `NpcPanel.vue` L109: `{{ npc.realm }}` → `{{ formatRealm(npc.realm) }}`，L171: type/quality
  - `GameOverScreen.vue`: realm/soulState

### Task 1.4 | TDD pair — CharacterDetailModal 角色详情弹窗
- **Input**: `uiStore.charDetailOpen` + `playerStore.character`
- **Output**: 全屏遮罩 + 居中卡片，展示六维/天赋/灵根/技能/装备
- **Risk**: charDetailOpen 孤儿状态消费者补全
- **Rollback**: 删除 `CharacterDetailModal.vue`，移除 GameScreen 引用
- **文件**:
  - 新建 `apps/taosim-ui/src/game/CharacterDetailModal.vue`
  - 修改 `apps/taosim-ui/src/game/GameScreen.vue`：引入并 `v-if` 渲染

### Task 1.5 | 实现 CharacterDetailModal
- 展示内容：基础信息（道号/性别/境界/年龄寿元/灵根/魂态）
- 六维属性数值条（根骨/悟性/神识/身法/气运/仙姿）
- 天赋词条（名称+品阶色+描述）
- 技能列表（名称+品阶+类型）
- 装备概览（武器/防具/法宝）
- 关闭按钮 + 遮罩点击关闭

---

## Phase 11.2 — 核心可玩循环（依赖 engine 改动）

### Task 2.1 | contracts 扩展 — TravelEvent 迁移 + Character 字段
- **Input**: 当前 engine 内的 TravelEvent 定义
- **Output**: TravelEvent 迁移到 `packages/contracts/src/overworld.ts`，加 `npc?: Character` 字段
- **Risk**: ⚠️ 跨层迁移，C1 约束
- **Rollback**: 恢复 engine 内 TravelEvent 定义
- **文件**:
  - `packages/contracts/src/overworld.ts`：加 TravelEvent 接口
  - `packages/contracts/src/character.ts` L131：加 `unlockedRecipes: string[]` 字段
  - `packages/engine/src/overworld/overworld-engine.ts`：删除内部 TravelEvent，改 import contracts

### Task 2.2 | TDD pair — OverworldEngine npc_meet 生成实际 NPC
- **Input**: character, fromNodeId, toNodeId, map
- **Output**: npc_meet 事件携带 `npc: Character` 对象
- **Risk**: C4 约束，NPCGenerator.generate(tier, seed) 调用
- **Rollback**: 恢复文字-only npc_meet 分支
- **文件**:
  - 新建/更新 `packages/engine/src/__tests__/overworld-engine-npc.test.ts`
  - 修改 `packages/engine/src/overworld/overworld-engine.ts` L77-86

### Task 2.3 | 实现 OverworldEngine npc_meet 改造
- L77-86 分支改为：
  ```typescript
  import { NPCGenerator } from '../interaction/npc-generator.js';
  // ...
  const npc = NPCGenerator.generate(toNode.tier, Date.now() + Math.floor(Math.random() * 100000));
  events.push({
    type: 'npc_meet',
    title: '偶遇修士',
    description: `在${toNode.name}附近遇到了${npc.name}`,
    nodeId: toNodeId,
    npc,
  });
  ```

### Task 2.4 | playerStore 扩展 — 位置 + NPC + 经验 + 灵石
- **Input**: nodeId/npc/exp/stones
- **Output**: `currentNodeId` ref + `setCurrentNode`/`setCurrentNPC`/`addExp`/`addSpiritStones`/`unlockRecipe` actions
- **Risk**: C3 约束
- **Rollback**: 移除新增的 ref 和 actions
- **文件**: `apps/taosim-ui/src/stores/player.ts`

### Task 2.5 | 修复测试 mock — makePlayer 同步 Character 新字段
- **Input**: Character 接口新增 `unlockedRecipes`
- **Output**: 所有测试文件的 makePlayer 辅助补齐 `unlockedRecipes: []`、`charm`、`spiritRoot`、`gameMode`
- **Risk**: ⚠️ C7 约束，27 个测试文件可能受影响
- **Rollback**: git checkout 测试文件
- **文件**: 扫描 `packages/engine/src/__tests__/*.test.ts` 中所有 makePlayer/makeCharacter 辅助

### Task 2.6 | MapPanel 重写 — 节点旅行系统
- **Input**: playerStore.currentNodeId + PRESET_MAP + OverworldEngine.travel
- **Output**: 当前节点卡片 + 邻接节点列表 + 旅行交互 + 事件展示 + NPC 偶遇提示
- **Risk**: 核心可玩入口
- **Rollback**: 恢复纯文字 MapPanel
- **文件**: `apps/taosim-ui/src/game/panels/MapPanel.vue`（完全重写）
- **参考**: `apps/taosim-ui/src/pages/OverworldPage.vue`（孤儿页面，有完整旅行逻辑）

### Task 2.7 | NPC 偶遇提示卡片 + 切到 NPC 面板
- **Input**: TravelEvent 中带 npc 的事件
- **Output**: MapPanel 内偶遇提示卡片，选"是"→ setCurrentNPC + setTab('npc')
- **文件**: `apps/taosim-ui/src/game/panels/MapPanel.vue`（集成到 Task 2.6）

### Task 2.8 | GameScreen 推进时间集成旅行天数
- **Input**: 旅行结果 daysPassed
- **Output**: 旅行后推进角色年龄
- **文件**: `apps/taosim-ui/src/game/panels/MapPanel.vue`（旅行成功后调 appStore 推进时间）

---

## Phase 11.3 — 系统扩展（依赖 11.2 的 NPC 链路）

### Task 3.1 | contracts 扩展 — Recipe 加 unlockedByDefault
- **Input**: PillRecipe / ForgeRecipe 接口
- **Output**: 加 `unlockedByDefault?: boolean` 字段
- **Risk**: C5 约束
- **文件**:
  - `packages/engine/src/crafting/recipe-registry.ts` L1-24：PillRecipe/ForgeRecipe 加字段
  - 聚气丹（RECIPE_QI_PILL）设 `unlockedByDefault: true`

### Task 3.2 | TDD pair — RecipeRegistry.getUnlockedRecipes
- **Input**: unlockedIds: string[]
- **Output**: `{ pills: PillRecipe[]; forges: ForgeRecipe[] }`（含 unlockedByDefault + unlockedIds 匹配）
- **Risk**: C5 约束（name vs id）
- **Rollback**: 移除 getUnlockedRecipes 方法
- **文件**:
  - 更新 `packages/engine/src/__tests__/recipe-registry.test.ts`
  - 修改 `packages/engine/src/crafting/recipe-registry.ts`

### Task 3.3 | 实现 RecipeRegistry.getUnlockedRecipes
```typescript
static getUnlockedRecipes(unlockedIds: string[]): { pills: PillRecipe[]; forges: ForgeRecipe[] } {
  return {
    pills: PILL_RECIPES.filter(r => r.unlockedByDefault || unlockedIds.includes(r.id)),
    forges: FORGE_RECIPES.filter(r => r.unlockedByDefault || unlockedIds.includes(r.id)),
  };
}
```

### Task 3.4 | CraftingPanel 配方解锁过滤
- **Input**: character.unlockedRecipes
- **Output**: 只显示已解锁配方，未解锁显示"???"不可点击
- **文件**: `apps/taosim-ui/src/game/panels/CraftingPanel.vue` L16-17 改用 getUnlockedRecipes

### Task 3.5 | TDD pair — NPCInteractionEngine 授予配方
- **Input**: duel(player, npc, playerWin) / discuss(player, npc)
- **Output**: InteractionResult 加 `unlockedRecipe?: string`
- **Risk**: C6 约束（副作用）
- **文件**:
  - 更新 `packages/engine/src/__tests__/npc-interaction-engine.test.ts`
  - 修改 `packages/engine/src/interaction/npc-interaction-engine.ts`

### Task 3.6 | 实现 NPCInteractionEngine 配方授予
- InteractionResult 加 `unlockedRecipe?: string`
- discuss: 20% 概率从锁定配方池随机选一个返回 id
- duel(playerWin=true): 10% 概率授予
- 锁定配方池 = 所有 unlockedByDefault !== true 的配方 id

### Task 3.7 | NpcPanel 接入配方解锁
- **Input**: InteractionResult.unlockedRecipe
- **Output**: 论道/切磋后若有解锁，提示 + 调 playerStore.unlockRecipe
- **文件**: `apps/taosim-ui/src/game/panels/NpcPanel.vue` L46-52

### Task 3.8 | CharacterFactory 扩展 — 降临方式
- **Input**: CreateCharacterParams 加 `arrivalMode`/`startAge`
- **Output**: 诞生模式 age=6 + 家世资源；穿越模式 age=startAge + 白板 + comprehension+5
- **Risk**: 创角入口变更
- **Rollback**: 恢复原有 create 逻辑
- **文件**:
  - `packages/engine/src/character/character-factory.ts`
  - 更新 `packages/engine/src/__tests__/character-factory.test.ts`

### Task 3.9 | 实现降临方式 + 降生故事
- 诞生模式：lifespan.age = 6，按 background 给资源（保留现有逻辑）
- 穿越模式：lifespan.age = startAge，spiritStones=0，inventory=[]，无 faction，comprehension+5
- 默认 unlockedRecipes = ['RECIPE_QI_PILL']
- 新增 BIRTH_STORIES 映射（spec §4.3）

### Task 3.10 | CreateCharacterPage 降临方式 UI
- **Input**: 用户选择诞生/穿越
- **Output**: background 步骤改为"降临方式"选择
- **文件**: `apps/taosim-ui/src/pages/CreateCharacterPage.vue`
- 诞生：显示家世选择 + 降生故事预览
- 穿越：显示年龄选择（16/20/25/30）+ 穿越描述
- confirmCreate 传 arrivalMode 和 startAge

### Task 3.11 | 初始位置映射
- **Input**: arrivalMode + background
- **Output**: playerStore.setCurrentNode(初始节点)
- **文件**: `apps/taosim-ui/src/pages/CreateCharacterPage.vue` confirmCreate 后
- 映射表（spec §5.3）:
  - 诞生 orphan → NODE_WILD_SOUTH
  - 诞生 small-clan → NODE_SECT_QINGYUN
  - 诞生 ancient-clan → NODE_CITY_TIANJI
  - 穿越 → NODE_CITY_TIANJI

---

## Phase 11.4 — 验证 + 打磨

### Task 4.1 | 全量 typecheck
- `pnpm -r typecheck`
- 修复所有 TS 错误（重点：测试 mock 补全）

### Task 4.2 | 全量测试
- `pnpm -r test`
- 修复所有失败用例

### Task 4.3 | 全流程走查
- 创角（诞生 + 穿越）→ 大地图旅行 → NPC 偶遇 → 切磋/论道 → 配方解锁 → 炼制
- 验收标准对照 spec §9

---

## 并行策略

```
Phase 11.1（Task 1.1-1.5）───┐
                              ├── 可同时进行（无依赖）
Phase 11.3 创角部分（Task 3.8-3.11）─┘

Phase 11.2（Task 2.1-2.8）─── 必须先完成（核心循环）

Phase 11.3 配方部分（Task 3.1-3.7）─── 依赖 11.2 的 NPC 链路
```

**建议分工**:
- Subagent A: Phase 11.1 全部（i18n + 详情弹窗）
- Subagent B: Phase 11.2 全部（engine + playerStore + MapPanel）+ Task 2.5 测试修复
- 主线程: Phase 11.3（创角 + 配方解锁，依赖 11.2）
- 最后: Phase 11.4 验证
