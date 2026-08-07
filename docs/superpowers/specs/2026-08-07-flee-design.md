# 逃跑 / 脱战（Flee）功能设计

日期：2026-08-07
状态：待评审

## 1. 背景与目标

当前战斗（旧 CombatEngine，经 `useCombat` 接入 `BattleOverlay.vue`）没有"脱战/逃跑"能力：遭遇战一旦开始只能打到底（胜或 GameOver）。本项目目标是：

- 战斗中提供"逃跑"命令，成功则脱战（离开战斗，不结算战利品、不 GameOver）
- 判定要真实：高阶对低阶碾压（大修对凡人不可能跑掉）；同阶若敌方选择追击则进入 DND d20 对抗检定；距离越远越难逃
- 逃跑可反复尝试（无次数上限），失败有代价：挨打（免费攻击）或更重的"被抓住"

范围：**1v1** 战斗（当前战斗均为单敌人），不做大场面/多敌追击。

## 2. 现状与关键约束

- 双引擎并存：新 `BattleEngine`（v2，`packages/engine/src/battle/battle-engine.ts`）已有实现与单测但 UI 未接入；UI 实际走旧 `CombatEngine`（`packages/engine/src/combat/combat-engine.ts`）经 `apps/taosim-ui/src/composables/useCombat.ts` 封装。
- `Character`（`packages/contracts/src/character.ts` L67-132）**无性格字段**。性格数据独立存在于 `packages/engine/src/data/npc-personalities.ts`（`NpcPersonality` 接口，10 个取值，含 `interactionModifiers`），目前仅 UI `NpcPanel.vue` L24-35 按 NPC id 哈希确定性分配并用于展示，不写入 Character、不参与战斗。
- `BattleConfig`（`apps/taosim-ui/src/stores/ui.ts` L11-16）＝ `{ enemy: Character; type: 'duel' | 'encounter'; title; description }`，enemy 为 `Character`，结构上无法携带性格。
- 回合归属：`useCombat` 封装 ATB 定时器（400ms/tick），`useBattleUI` watch `combat.state.currentTurn` 驱动玩家回合（phase → `command`）。命令入口为 `BattleCommandBar.vue`（attack/skill/defend/move/endTurn），直接命令仿 `defendCmd`（`useBattleUI.ts` L121-126）。
- 伤害结算：`packages/engine/src/combat/damage-pipeline.ts` / `damage-calculator.ts` 已有普攻/技能管线，敌方免费攻击可复用。
- 战斗地图为六边形（`HexBattleMap`，`packages/contracts/src/hex.ts`），有 `hexDistance(a, b)` 工具。

## 3. 设计

### 3.1 性格入数据模型

- `Character` 新增可选字段 `personalityId?: string`，取值为 `npc-personalities.ts` 的 `NpcPersonality.id`（如 `PERSONALITY_HOT_BLOODED`）。
- engine 新增 `resolvePersonalityId(characterId: string): string`（放 `packages/engine/src/data/npc-personalities.ts` 或独立工具文件）：将 `NpcPanel.vue` L24-35 现有的"按 id 哈希确定性选性格"逻辑下沉到 engine 并复用（同 id 恒定同性格）。
- `packages/engine/src/interaction/npc-generator.ts` 的 `NPCGenerator.generate` 生成 NPC 时自动赋值 `personalityId = resolvePersonalityId(id)`。
- 玩家角色无 `personalityId` 时按"中性"处理：追击意愿不加性格修正。

### 3.2 逃跑判定纯函数 `attemptFlee`

新文件 `packages/engine/src/battle/flee.ts`，导出纯函数（可注入 rng，便于测试）：

```ts
export type FleeResult = 'success' | 'escape-hit' | 'hit' | 'caught';

export interface FleeAttemptInput {
  playerRealm: RealmFullPath;          // 玩家境界
  enemyRealm: RealmFullPath;           // 敌方境界
  playerAgility: number;               // 玩家身法
  enemyAgility: number;                // 敌身法
  enemyPersonalityId?: string;         // 敌方性格（缺省=中性）
  battleType: 'duel' | 'encounter';
  distanceToEdge: number;              // 玩家当前位置到最近玩家侧边界 hex 格数
  rng: () => number;                   // [0,1) 随机源
}

export function attemptFlee(input: FleeAttemptInput): FleeResult;
```

**境界层差**（大境界序号：炼气 0 / 筑基 1 / 金丹 2 / 元婴 3 / 化神 4）。从 `RealmFullPath`（如 `QiRefinement_1`）提取：按前缀映射序号（`QiRefinement→0, Foundation→1, GoldenCore→2, NascentSoul→3, SoulFormation→4`，与 `i18n-game.ts` 的 `REALM_PREFIX_MAP` 对应），忽略层数后缀）：

```
RealmDiff = enemyRealmTier - playerRealmTier
```

**判定流程：**

1. **碾压（直接 caught）**：`RealmDiff >= 3` → 返回 `'caught'`，不掷骰。（大修对凡人不可能跑掉）
2. **追击意愿**（掷一次 rng）：
   ```
   P = 0.5
     + personalityMod       // 见 3.3
     + (battleType === 'encounter' ? +0.2 : -0.2)
     + (RealmDiff > 0 ? +0.1 * RealmDiff : -0.15 * (-RealmDiff))
   P = clamp(P, 0.05, 0.95)
   ```
   `rng() < P` → 敌方追击；否则返回 `'success'`（敌方放弃追击，直接脱战）。
3. **对抗检定**（双方各掷 d20）：
   ```
   playerRoll  = d20 + floor(playerAgility / 10) - distanceToEdge
   enemyRoll   = d20 + floor(enemyAgility / 10)  + (RealmDiff > 0 ? +2*RealmDiff : -2*(-RealmDiff))
   diff = playerRoll - enemyRoll
   ```
   - `diff >= 1` → `'success'`（顺利脱战）
   - `diff == 0` → `'escape-hit'`（平局，防守方优先：成功脱战但挨一下，见 §3.4）
   - `diff >= -4` → `'hit'`（没逃掉，挨打，战斗继续）
   - `diff <= -5` → `'caught'`（被抓住：挨打 + 本回合不能再逃）

### 3.3 性格 → 追击意愿修正（personalityMod）

| 档位 | 修正 | 性格 id |
|---|---|---|
| 高追击 | `+0.3` | `PERSONALITY_HOT_BLOODED` 热血豪迈、`PERSONALITY_SLY` 奸猾世故、`PERSONALITY_ARROGANT` 高傲冷峻、`PERSONALITY_ERRATIC` 疯癫无常、`PERSONALITY_CUNNING` 阴险狡诈 |
| 中 | `0` | `PERSONALITY_COLD` 冷漠疏离 |
| 低追击 | `-0.3` | `PERSONALITY_GENEROUS` 慷慨豪爽、`PERSONALITY_GENTLE` 温和宽厚、`PERSONALITY_RIGHTEOUS` 正直刚烈、`PERSONALITY_RECLUSIVE` 孤僻寡言 |

无 `personalityId`（中性）→ `0`。

### 3.4 结果语义

| 结果 | 含义 | 战斗层处理 |
|---|---|---|
| `success` | 成功脱战 | 记日志"成功逃离" → 关战斗（无战利品/好感度/经验、不 GameOver、不掉气血） |
| `escape-hit` | 平局，防守方优先：成功脱战但受一击 | 敌方立即结算一次免费攻击扣玩家 hp → 记日志 → 关战斗（同上；若玩家因此阵亡则先走正常结算） |
| `hit` | 没逃掉，挨打 | 敌方立即结算一次免费攻击 → 记日志"被追上，挨了一下" → 战斗继续，玩家回合保留 |
| `caught` | 被抓住 | 敌方立即结算一次免费攻击 → 记日志"被抓住了" → 战斗继续，**本回合不能再逃**（`canFlee=false`，下回合恢复） |

免费攻击：复用现有普攻管线（`DamagePipeline.calculate` + `BASIC_ATTACK_SKILL`，与 `useCombat.basicAttack` 一致，无暴击），**不消耗敌方 AP/回合**。

**逃跑命令不消耗玩家回合**：失败后玩家回 `command` 态可继续行动（攻击/移动/结束回合）；`caught` 仅锁逃跑按钮至下回合。成功/escape-hit 才结束战斗。

### 3.5 UI 接线

- `apps/taosim-ui/src/components/BattleCommandBar.vue`：
  - 新增"逃跑"按钮（command 态可见，`isIdle` 时启用），`defineEmits` 增加 `flee: []`
  - 新增 prop `canFlee?: boolean`（默认 true）；`caught` 后本回合按钮禁用（置灰）
- `apps/taosim-ui/src/composables/useBattleUI.ts`：
  - 新增 `fleeCmd(battleType: 'duel' | 'encounter'): FleeResult`（仿 `defendCmd`，`command → executing` → 调 `combat.flee(battleType)` → 回 `command`（失败时）或回 `idle`（成功脱战时由外层关闭战斗，phase 交由 watch 复位））
  - 新增 `canFlee: Ref<boolean>`（默认 true），`caught` 时置 false，`watch(currentTurn)` 轮到玩家（`currentTurn === playerId`）时恢复 true
- `apps/taosim-ui/src/game/BattleOverlay.vue`：
  - 模板 `@flee="onFlee"`
  - `onFlee()`：`const r = ui.fleeCmd(battleConfig.value.type)`；`r === 'success'` → 直接 `closeBattle()`；`r === 'escape-hit'` → `later` 后先 `checkBattleEnd()`（防一击致死漏结算）再 `closeBattle()`；`hit/caught` → `later(checkBattleEnd, 100)`（若免费攻击致死则正常结算），战斗继续
  - 战斗日志（"成功逃离 / 被追上 / 被抓住了"等）在 `useCombat.flee` 内 push

### 3.6 测试

- `packages/engine/src/battle/__tests__/flee.test.ts`：
  - 碾压：`RealmDiff >= 3` → 恒 `caught`（多组 rng 值验证不掷骰）
  - 追击意愿：性格高档/低档/中性、encounter/duel、正向/逆向境界差修正；概率 clamp 到 [0.05, 0.95]
  - 对抗分档：固定 rng 构造 `diff>=1 / ==0 / -4..-1 / <=-5` 四档结果
  - 距离修正：`distanceToEdge` 越大越难逃（同 rng 下结果单调变差）
- `resolvePersonalityId` 确定性测试（同 id 恒同性格）
- UI 侧（如有现成测试基建）：`useBattleUI.fleeCmd` 状态流转、`canFlee` 复位

## 4. 明确不做（YAGNI）

- 多敌人 / 大场面追击（保持 1v1）
- 逃跑成功后的再遭遇（如被追到相邻格二次开战）
- 性格对 v2 `BattleEngine` AI 决策（`battle-ai.ts`）的全面接入——本次仅追击意愿使用性格
- 逃跑消耗 AP 或次数上限（可无限尝试，靠失败代价自平衡）
- `BattleEngine`（v2）数据源替换（Phase B 另行处理）；逃跑纯函数 `attemptFlee` 与引擎无关，v2 接入后可复用

## 5. 边界与歧义裁定

- 平局（`diff == 0`）按**防守方优先**裁定为"成功脱战但挨一下"（`escape-hit`），不给完全成功，也不判失败。
- 追击概率叠加修正后钳制在 [0.05, 0.95]，保留 5% 极小变数；碾压（`RealmDiff >= 3`）不掷骰直接 caught，优先级最高。
- 逆向境界差（玩家境界高于敌方）：追击意愿每低 1 阶 −0.15、敌方检定每低 1 阶 −2，高境界玩家想走，低境界敌人天然不敢强追。
- `distanceToEdge` 无出口概念：以"最近玩家侧边界格"为撤退目标；若玩家已位于边界格则 `distanceToEdge = 0`（距离修正不再加分，也不为负）。
