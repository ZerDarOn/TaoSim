# Phase 9 — 创角系统完整化（灵根/天赋词条/模式选择）设计规格

> **目标：** 实现完整的创角流程闭环——灵根抽取（品级×五行+变异灵根）、扩展角色属性体系、天赋词条库（借鉴鬼谷八荒5品阶体系）、模式选择（铁人/自由、传统/简单突破）、天道点数经济做实。

---

## 1. 竞品研究摘要

### 鬼谷八荒
- **先天气运**：白/绿/蓝/紫(圣)/橙(仙)/红(神) 六品阶，每条气运含正负效果（如"聪明谢顶"悟性+30但魅力-500）
- **属性体系**：攻击/悟性/幸运/心情/精力/声望/魅力 + 功法资质（剑刀枪拳掌指）+ 灵根资质（金木水火土雷风）
- **词条示例**：武圣转世（攻击+10,悟性+20）、剑痴（剑法+30,熟练+50%）、天妒英才（悟性+30,寿命-20）
- **刷新策略**：创角时反复刷新气运栏，可锁定满意词条

### 凡人修仙传 / 修仙家族模拟器
- **灵根品级**：天灵根（单属性，修炼最快）> 变异灵根（雷/冰/风）> 真灵根（2-3属性）> 伪灵根（4-5属性，最慢）
- **修炼效率倍率**：天灵根×2.0, 真(双)灵根×1.0, 三灵根×0.6, 五灵根×0.2
- **功德点系统**：开局 10 点功德，不同灵根消耗不同功德

### 修仙百科 / 小说体系
- **变异灵根**：雷/冰/风/暗——由两种以上五行异变升华，威力强、速度快，地位仅次于天灵根
- **隐灵根**：周期性消失的灵根，极稀有
- **五行相生相克**：金生水/水生木/木生火/火生土/土生金；金克木/木克土/土克水/水克火/火克金

### 核心借鉴决策
1. **灵根**：品级×属性数量双维度 + 变异灵根独立路径（用户已确认"完整"方案）
2. **天赋词条**：借鉴鬼谷八荒 5 品阶 + 正负效果，建立可扩展词条库
3. **属性扩展**：加入魅力（影响社交）、精纯度修正机制
4. **天道点数**：借鉴功德点机制，做实经济系统

---

## 2. 数据模型设计

### 2.1 灵根系统（完整版：五行 + 变异）

```typescript
// contracts/character.ts 新增
export type SpiritRootGrade = 'Heaven' | 'Earth' | 'Profound' | 'Yellow'; // 天/地/玄/黄

// 五行 + 变异灵根
export type SpiritElementType =
  | 'Metal' | 'Wood' | 'Water' | 'Fire' | 'Earth'      // 五行：金木水火土
  | 'Thunder' | 'Ice' | 'Wind' | 'Dark';                // 变异：雷/冰/风/暗

export interface SpiritRoot {
  grade: SpiritRootGrade;
  elements: SpiritElementType[];   // 1-3 个；变异灵根只能是单属性
  isVariant: boolean;              // 是否为变异灵根（影响 roll 概率和倍率）
}

// Character 接口新增
spiritRoot: SpiritRoot;
```

**修炼效率倍率表**（engine/data/spirit-root-table.ts）：

| 品级 | 属性数量 | 效率倍率 | 说明 |
|------|---------|---------|------|
| 天 (Heaven) | 单 | ×2.0 | 上天宠儿，修炼极速 |
| 天 (Heaven) | 双 | ×1.6 | 天灵根双修仍极快 |
| 地 (Earth) | 单 | ×1.5 | 资质优异 |
| 地 (Earth) | 双 | ×1.2 | |
| 玄 (Profound) | 双 | ×1.0 | 中规中矩 |
| 玄 (Profound) | 三 | ×0.8 | |
| 黄 (Yellow) | 三 | ×0.6 | 资质平庸 |
| 黄 (Yellow) | 废(无) | ×0.3 | 隐藏档，特殊机缘可逆袭 |

**变异灵根加成**（isVariant=true 时额外乘以变异系数）：
- 变异灵根固定为单属性，基础品级至少地阶
- 变异系数 ×1.3（雷/冰/风/暗 威力强大）
- 变异灵根 roll 概率极低（总 roll 中 8% 触发变异）

**roll 概率设计：**
- 首先判定是否变异：92% 普通 / 8% 变异
- 普通灵根品级 roll：天 5%, 地 15%, 玄 50%, 黄 30%
- 变异灵根品级 roll：天 20%, 地 40%, 玄 30%, 黄 10%（变异灵根品级偏高）
- 普通灵根数量：品级越高越倾向单灵根（天 70% 单 / 地 50% 单 / 玄 25% 单 / 黄 5% 单）
- 变异灵根元素：雷 35% / 冰 25% / 风 25% / 暗 15%

**最终修炼效率 = 品级倍率 × (变异? 1.3 : 1.0) × comprehension × COMPREHENSION_EXP_RATIO(0.5)**

### 2.2 角色属性体系扩展

当前 5 维属性：physique(根骨) / comprehension(悟性) / perception(神识) / agility(身法) / luck(气运)

**新增 1 维：**
- **charm（仙姿/魅力）**：影响 NPC 初次好感度、论道成功率、交易折扣

```typescript
// contracts/character.ts — attributes 扩展
attributes: {
  physique: number;        // 根骨（HP/防御成长）
  comprehension: number;   // 悟性（修为获取/功法参悟）
  perception: number;      // 神识（命中/暴击/感知）
  agility: number;         // 身法（闪避/先手）
  luck: number;            // 气运（奇遇/掉落/暴击）
  charm: number;           // 仙姿（社交/好感/交易）
};
```

**初始值规则：**
- 创角时每项基础值 5，可自由分配天道点数
- 各项范围：1-20（创角阶段），突破/事件可突破上限

**AttributeKey 同步扩展**（item.ts，让装备/词条也能加 charm）：
```typescript
export type AttributeKey =
  | 'physique' | 'comprehension' | 'perception' | 'agility' | 'luck' | 'charm'
  | 'attack' | 'defense' | 'critRate' | 'spiritEnergyMax' | 'poisonResist';
```

### 2.3 模式选择

```typescript
// contracts/character.ts 新增
export interface GameMode {
  breakthrough: 'Traditional' | 'Simple';  // 传统：渡劫需秘境材料 / 简单：纯修为+丹药
  saveMode: 'Ironman' | 'Free';            // 铁人：月度自动存档不可手动S/L / 自由：手动存读档
}

// Character 接口新增
gameMode: GameMode;
```

**实现约束：**
- **铁人模式**：SaveLoadPanel 禁用"保存"按钮，改为每月推进时自动存档到 localStorage
- **传统突破**：CultivationPage 突破时检查是否持有秘境材料
- **简单突破**：无额外材料需求，纯修为+丹药

### 2.4 天赋词条库

借鉴鬼谷八荒，扩展词条数据。沿用现有 `TraitQuality = Red | Orange | Purple | Blue | Green`。

**词条库**（engine/data/trait-registry.ts，可扩展的"库"）：

| 分类 | 示例 | 品阶 | 效果 |
|------|------|------|------|
| **悟性类** | 天生慧根 | Blue | comprehension+10, perception+5 |
| **悟性类** | 聪明谢顶 | Purple | comprehension+30, charm-200 |
| **悟性类** | 天妒英才 | Orange | comprehension+20, cultivation加成20%, lifespan-20 |
| **属性类** | 武道世家 | Green | physique+3, agility+3, comprehension-3 |
| **属性类** | 天资根骨 | Blue | 全属性+5, comprehension+10 |
| **属性类** | 武圣转世 | Orange | attack+10, physique+10, comprehension+20 |
| **灵根类** | 善水之人 | Green | Water+10 |
| **灵根类** | 水灵体 | Purple | Water+25 |
| **灵根类** | 元素之力 | Red | 全灵根+15 |
| **体质类** | 先天道体 | Red | maxHp+30%, spiritEnergyMax+30%, 全属性+5 |
| **体质类** | 剑骨 | Orange | attack+15, critRate+10 |
| **体质类** | 万毒侵体 | Orange | poisonResist+50, defense-5 |
| **寿命类** | 寿星后代 | Orange | maxLifespan+50 |
| **寿命类** | 天命长寿 | Red | maxLifespan+100, luck+10 |
| **经济类** | 皇朝遗孤 | Orange | initialStones+5000 |
| **经济类** | 破落贵族 | Blue | initialStones+1000, charm+50 |
| **气运类** | 天命之子 | Red | luck+30, 奇遇触发率提升 |
| **气运类** | 乐天一派 | Blue | luck+15, charm+20 |
| **魅力类** | 翩翩良人 | Blue | charm+100, defense+2 |
| **魅力类** | 憨人 | Green | charm+100, comprehension-10 |
| **负面/趣味** | 聪明谢顶 | Purple | comprehension+30, charm-300 |
| **负面/趣味** | 猪突 | Green | attack+3, defense-2 |
| **负面/趣味** | 左撇子 | Green | comprehension+10, charm-30 |

**初始词条库规模**：~25 条，覆盖 5 品阶 × 7 分类

**词条结构沿用现有 Trait**：
```typescript
{ id, name, quality, description, effects: AttributeMap }
```
effects 扩展可用 key（需同步扩展 AttributeKey）：
- `lifespanBonus`（寿元加成，词条应用时加到 maxLifespan）
- `initialStones`（初始灵石，仅创角时生效）

### 2.5 天道点数经济

```typescript
const INITIAL_HEAVEN_POINTS = 25;

// 消耗规则
家世：散修 0（返 5 点）/ 小族 5 / 世家 12
灵根 roll：首次免费，重 roll 每次 3 点
赌词条：刷新消耗 2 点，锁定消耗 3 点
属性分配：自由分配（6 项各基础 5，共 25 点自由分配到 6 维）
```

---

## 3. 创角 UI 流程（6 步）

```
Step 1: 模式选择（突破模式 + 存档模式）
Step 2: 家世 + 性别 + 姓名
Step 3: 属性分配（天道点数 → 根骨/悟性/神识/身法/气运/仙姿）
Step 4: 灵根抽取（roll 品级+属性，可能出变异灵根，可花点数重 roll）
Step 5: 天赋赌词条（roll 3 条，刷新/锁定，可花点数）
Step 6: 总览确认
```

---

## 4. 风险分析

### 核心不变量
- **存档兼容**：现有存档 Character 缺 spiritRoot/gameMode/charm 字段，加载时需补默认值
- **修炼公式不崩**：灵根倍率 × 变异系数 × 悟性系数，最大场景（天灵根+变异+悟性20）= 2.0×1.3×20×0.5=26 exp/月，100年=31200，不溢出
- **charm 字段全局同步**：Character.attributes + AttributeKey + 所有 makePlayer 测试辅助函数

### 原子性
- 创角确认时：家世+属性+灵根+词条 → Character 构建 + 初始背包+灵石 → 一体完成
- 模式选择一旦确认不可更改

### 信任边界
- 天道点数不可为负，所有消耗操作前校验余额
- 灵根 elements 数组长度 1-3，变异灵根固定长度 1
- 变异灵根元素只能是 Thunder/Ice/Wind/Dark

### 性能
- 词条库查询是静态数据 O(1)，roll 操作 O(1)

---

## 5. 验收标准

1. 创角 6 步全走通，每步天道点数正确消耗
2. 灵根抽取可 roll 出天/地/玄/黄品级 + 五行/变异属性
3. 变异灵根（雷/冰/风/暗）可被 roll 出，带变异标识和 ×1.3 倍率
4. 天赋词条库 ≥25 条，覆盖 5 品阶 × 7 分类，含正负效果
5. charm 属性在创角可分配，影响 NPC 交互初始好感
6. 铁人模式下 SaveLoadPanel 禁用手动保存，月度自动存档生效
7. 传统突破模式检查秘境材料，简单模式无要求
8. 全量测试 + 三项目 tsc 通过
9. 现有存档加载后可正常运行（字段补默认值）
