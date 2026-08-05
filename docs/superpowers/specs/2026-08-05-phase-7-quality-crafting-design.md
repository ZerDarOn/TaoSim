# Phase 7 — 品质锻造与百艺深度 设计规格书

> **基准架构**: 《大千修仙界》架构设计规范 (v3.2 Final)
> **创建时间**: 2026-08-05

---

## 1. 设计目标

激活 `Item.quality` 字段，引入装备/丹药品质系统。三条路径并行：普通锻造（概率产出品质）、大师锻造（高投入保底高品质）、升品（已有装备消耗稀有材料提升品质）。配合丹药品质与丹毒机制，让坊市交易和百艺系统真正"活"起来，达到最低可玩。

## 2. 核心决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 品质影响 | C: 数值放大 + Legendary 特效 | Common/Rare/Epic 走倍率，Legendary 独享灵蕴特效 |
| 升品风险 | B: 修仙写实分级 | 低阶安全、高阶九死一生， Legendary 降品+碎裂风险 |
| 升品材料 | B: 按阶位匹配 | Tier 越高材料越稀有，跨大洲收集 |
| 丹药品质 | 做 + 丹毒机制 | 低品质有杂质打折+丹毒，避免数值崩塌 |
| 属性存储 | 永不覆写 | 最终属性永远 = template.base × qualityMultiplier，升品重新计算 |
| Tier 封顶 | Tier 1 最高 Rare | 凡铁难承仙纹 |

## 3. 品质锻造路径

### 3.1 三条路径

| 路径 | 入口 | 产出品质 | 成功率模型 | 失败代价 |
|------|------|---------|-----------|---------|
| 普通锻造 | `ForgeEngine.craft(recipe, luck)` | C60/R29/E10/L1 | 100% 必产出（roll 品质） | 无 |
| 大师锻造 | `ForgeEngine.craftMaster(recipe, mastery)` | R70/E25/L5 | 阶段1: 75%+mastery → 阶段2: 品质roll | 阶段1失败：材料+灵石全损 |
| 升品 | `UpgradeEngine.enhance(item, target)` | 按 UPGRADE_RULES | 按 tier+品质递减 | 按 failPenalty 分级 |

### 3.2 升品风险规则 (UPGRADE_RULES)

| Tier | 品阶跃迁 | 材料 | 灵石 | 成功率 | 失败惩罚 |
|------|---------|------|------|--------|---------|
| 1 | C→R | 铁矿石×3 | 200 | 80% | LossMaterialsOnly |
| 2 | C→R | 陨铁×2 + 灵玉×1 | 500 | 70% | LossMaterialsOnly |
| 2 | R→E | 龙血×1 + 星光粉×1 | 1000 | 50% | DurabilityLoss (-20) |
| 2 | E→L | 龙血×3 + 陨铁×5 | 5000 | 25% | QualityDegrade (降回 Rare) |
| 3 | C→R | 陨铁×3 + 龙血×1 | 1000 | 65% | LossMaterialsOnly |
| 3 | R→E | 龙血×2 + 天金砂×1 | 3000 | 45% | DurabilityLoss |
| 3 | E→L | 龙血×5 + 天金砂×3 | 10000 | 15% | QualityDegrade |

Tier 1 装备品质天花板 = Rare。

## 4. 品质对属性的影响

### 4.1 装备属性

```
最终属性 = floor(template.baseAttributes × qualityMultiplier)
qualityMultiplier: Common=1.0, Rare=1.5, Epic=2.5, Legendary=5.0
```

升品时重新从 template 计算，禁止二次叠乘。

### 4.2 Legendary 灵蕴特效

| 特效ID | 名称 | 效果 | 适用 |
|--------|------|------|------|
| SOUL_GUARD | 剑灵护体 | 致死时保留 1 HP（每场战斗 1 次） | 武器/防具 |
| BLOOD_THIRST | 嗜血 | 击杀回复最大 HP 15% | 武器 |
| MANA_SHIELD | 灵盾 | 每回合吸收 tier×10 伤害 | 防具 |
| QUICK_STRIKE | 疾风 | 首回合 AP+1 | 武器/法宝 |
| PHOENIX_REBIRTH | 涅槃 | 死亡后 30% HP 复活一次 | 防具 |
| VITALITY_SIPHON | 夺灵 | 攻击偷取伤害 10% 灵力 | 法宝 |

**触发规则**:
- 致死特效优先级: SOUL_GUARD → PHOENIX_REBIRTH，单次伤害不同时消耗
- 同名特效不叠加，仅生效一次

## 5. 丹药品质与丹毒

### 5.1 炼丹品质分布

成功炼制后按概率分配品质: Common(50%), Rare(30%), Epic(15%), Legendary(5%)

### 5.2 丹药效果表（含丹毒折损）

| 丹药 | Common | Rare(基准) | Epic | Legendary |
|------|--------|-----------|------|-----------|
| 聚气丹（灵力恢复 基准50） | 30 (60%) | 50 | 80 (160%) | 120 (240%) |
| 突破丹（渡劫加成 基准+10%） | +5% | +10% | +18% | +25% |
| 延寿丹（延寿年 基准50年） | +25年 | +50年 | +80年 | +120年 |

Common 品质因丹毒杂质折损至 50-60% 效果。

### 5.3 丹药品质效果查询

```typescript
class AlchemyEngine {
  static getPillEffect(pill: Item): { effect: number; category: string }
}
```

按 `pill.attributes.pillCategory` 分派到不同效果表。

## 6. 数据模型变更

### 6.1 contracts/src/item.ts

```typescript
export type SpecialEffectType =
  | 'SOUL_GUARD' | 'BLOOD_THIRST' | 'MANA_SHIELD'
  | 'QUICK_STRIKE' | 'PHOENIX_REBIRTH' | 'VITALITY_SIPHON';

// Item 接口新增:
specialEffect?: SpecialEffectType;  // Legendary 灵蕴特效
durability?: DurabilityState;       // 耐久度（装备专用）
isBroken?: boolean;                 // 碎裂标记
```

### 6.2 contracts/src/durability.ts（新建）

```typescript
export interface DurabilityState {
  current: number;
  max: number;
}
export const DURABILITY_LOSS_ON_FAIL = 20;
```

### 6.3 contracts/src/forge.ts（新建）

```typescript
export type UpgradeFailPenalty = 'LossMaterialsOnly' | 'DurabilityLoss' | 'QualityDegrade';

export interface UpgradeRule {
  materials: { templateId: string; count: number }[];
  spiritStones: number;
  successRate: number;
  failPenalty: UpgradeFailPenalty;
}

export interface CraftResult {
  success: boolean;
  item?: Item;
  message: string;
}

export interface UpgradeResult {
  success: boolean;
  resultItem?: Item;
  penaltyTriggered?: UpgradeFailPenalty;
  message: string;
}
```

### 6.4 contracts/src/item-template.ts

```typescript
// ItemTemplate 新增:
maxDurability?: number;  // 默认 100
```

### 6.5 配方扩展

现有 `PillRecipe` 和 `ForgeRecipe` 不做破坏性改动，新增可选字段:
- `PillRecipe.pillCategory?: 'Restore' | 'Breakthrough' | 'Lifespan'`
- `ForgeRecipe.masterMaterials?: string[]`（大师锻造额外材料 templateId）
- `ForgeRecipe.masterSpiritStoneCost?: number`

## 7. 引擎模块

### 7.1 QualityCalculator（新建 纯函数）

```typescript
class QualityCalculator {
  static applyQuality(template: ItemTemplate, quality: ItemQuality): AttributeMap
  static rollSpecialEffect(): SpecialEffectType
  static getMaxQualityForTier(tier: number): ItemQuality  // Tier1=Rare, else Legendary
}
```

### 7.2 ForgeEngine（改造）

- `craft()`: 现有逻辑 + 品质 roll (C60/R29/E10/L1) + luck 微调
- `craftMaster()`: 两阶段判定，阶段1失败全损

### 7.3 AlchemyEngine（改造）

- `craftPill()`: 现有成功率 + 成功后品质 roll (C50/R30/E15/L5)
- `getPillEffect()`: 按品类查效果表

### 7.4 UpgradeEngine（新建）

```typescript
class UpgradeEngine {
  static enhance(item: Item, targetQuality: ItemQuality, player: Character): UpgradeResult
  static getUpgradeRule(tier: number, from: ItemQuality, to: ItemQuality): UpgradeRule | null
  static applyFailPenalty(item: Item, penalty: UpgradeFailPenalty): Item
}
```

## 8. UI 变更

| 页面 | 变更 |
|------|------|
| 锻造页 | 新增「大师锻造」按钮（需大师材料），品质结果显示 |
| 炼丹页 | 品质结果显示，丹毒提示 |
| 新建升品页 | 装备选择 + 目标品质 + 材料预览 + 风险提示 |
| 装备详情 | 显示品质、特效、耐久度 |

## 9. 测试范围

- `QualityCalculator`: 倍率计算、特效roll、Tier 封顶
- `ForgeEngine.craft`: 品质分布概率
- `ForgeEngine.craftMaster`: 两阶段判定
- `AlchemyEngine.craftPill`: 品质roll
- `AlchemyEngine.getPillEffect`: 丹毒折损、品类分派
- `UpgradeEngine.enhance`: 成功升品、分级失败惩罚、Tier天花板
- `UpgradeEngine.applyFailPenalty`: 耐久扣减、降品、碎裂

## 10. 模块文件清单

| 文件 | 类型 |
|------|------|
| `contracts/src/item.ts` | 修改 |
| `contracts/src/item-template.ts` | 修改 |
| `contracts/src/durability.ts` | 新建 |
| `contracts/src/forge.ts` | 新建 |
| `contracts/src/index.ts` | 修改 |
| `engine/src/crafting/quality-calculator.ts` | 新建 |
| `engine/src/crafting/forge-engine.ts` | 修改 |
| `engine/src/crafting/alchemy-engine.ts` | 修改 |
| `engine/src/crafting/recipe-registry.ts` | 修改 |
| `engine/src/crafting/upgrade-engine.ts` | 新建 |
| `engine/src/index.ts` | 修改 |
| `apps/taosim-ui/src/pages/ForgePage.vue` | 修改 |
| `apps/taosim-ui/src/pages/AlchemyPage.vue` | 修改 |
| `apps/taosim-ui/src/pages/UpgradePage.vue` | 新建 |
