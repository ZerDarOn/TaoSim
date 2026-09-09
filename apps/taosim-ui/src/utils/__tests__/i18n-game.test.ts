import { describe, it, expect } from 'vitest';
import {
  formatRealm,
  formatRealmType,
  formatItemType,
  formatQuality,
  formatGender,
  formatSoulState,
  formatSpiritRootGrade,
  formatSpiritElement,
  formatNodeType,
  formatFactionRank,
  formatRecipeName,
  formatItemId,
  formatItemName,
  formatSpecialEffect,
  formatTier,
  formatCraftingMessage,
} from '../i18n-game';

describe('formatRealm', () => {
  it('maps QiRefinement with chinese numerals', () => {
    expect(formatRealm('QiRefinement_1')).toBe('炼气期一层');
    expect(formatRealm('QiRefinement_9')).toBe('炼气期九层');
  });

  it('maps other realm prefixes', () => {
    expect(formatRealm('Foundation_1')).toBe('筑基期一层');
    expect(formatRealm('GoldenCore_1')).toBe('金丹期一层');
    expect(formatRealm('NascentSoul_1')).toBe('元婴期一层');
    expect(formatRealm('SoulFormation_1')).toBe('化神期一层');
  });

  it('maps multi-level sub levels', () => {
    expect(formatRealm('Foundation_3')).toBe('筑基期三层');
    expect(formatRealm('GoldenCore_2')).toBe('金丹期二层');
  });
});

describe('formatRealmType', () => {
  it('maps all realm types', () => {
    expect(formatRealmType('LianQi')).toBe('炼气');
    expect(formatRealmType('ZhuJi')).toBe('筑基');
    expect(formatRealmType('JinDan')).toBe('金丹');
    expect(formatRealmType('YuanYing')).toBe('元婴');
    expect(formatRealmType('HuaShen')).toBe('化神');
  });
});

describe('formatItemType', () => {
  it('maps item types to chinese', () => {
    expect(formatItemType('Medicine')).toBe('丹药');
    expect(formatItemType('Equipment')).toBe('装备');
    expect(formatItemType('Talisman')).toBe('法宝');
    expect(formatItemType('Material')).toBe('材料');
    expect(formatItemType('Poison')).toBe('毒物');
    expect(formatItemType('Formula')).toBe('秘籍');
  });
});

describe('formatQuality', () => {
  it('maps qualities to chinese', () => {
    expect(formatQuality('Common')).toBe('凡品');
    expect(formatQuality('Rare')).toBe('灵品');
    expect(formatQuality('Epic')).toBe('宝品');
    expect(formatQuality('Legendary')).toBe('仙品');
  });

  it('treats undefined as Common', () => {
    expect(formatQuality(undefined)).toBe('凡品');
  });
});

describe('formatGender', () => {
  it('maps genders', () => {
    expect(formatGender('Male')).toBe('男');
    expect(formatGender('Female')).toBe('女');
    expect(formatGender('Other')).toBe('其他');
  });
});

describe('formatSoulState', () => {
  it('maps soul states', () => {
    expect(formatSoulState('Active')).toBe('在世');
    expect(formatSoulState('PrimordialSoul')).toBe('元神');
    expect(formatSoulState('RemnantSoul')).toBe('残魂');
    expect(formatSoulState('Oblivion')).toBe('湮灭');
  });
});

describe('formatSpiritRootGrade', () => {
  it('maps grades to single char', () => {
    expect(formatSpiritRootGrade('Heaven')).toBe('天');
    expect(formatSpiritRootGrade('Earth')).toBe('地');
    expect(formatSpiritRootGrade('Profound')).toBe('玄');
    expect(formatSpiritRootGrade('Yellow')).toBe('黄');
  });
});

describe('formatSpiritElement', () => {
  it('maps five elements', () => {
    expect(formatSpiritElement('Metal')).toBe('金');
    expect(formatSpiritElement('Wood')).toBe('木');
    expect(formatSpiritElement('Water')).toBe('水');
    expect(formatSpiritElement('Fire')).toBe('火');
    expect(formatSpiritElement('Earth')).toBe('土');
  });

  it('maps variant elements', () => {
    expect(formatSpiritElement('Thunder')).toBe('雷');
    expect(formatSpiritElement('Ice')).toBe('冰');
    expect(formatSpiritElement('Wind')).toBe('风');
    expect(formatSpiritElement('Dark')).toBe('暗');
  });
});

describe('formatNodeType', () => {
  it('maps overworld node types to chinese', () => {
    expect(formatNodeType('City')).toBe('城镇');
    expect(formatNodeType('Sect')).toBe('宗门');
    expect(formatNodeType('Dungeon')).toBe('秘境');
    expect(formatNodeType('Market')).toBe('坊市');
    expect(formatNodeType('Wilderness')).toBe('荒野');
  });
});

describe('formatFactionRank', () => {
  it('maps faction ranks to chinese', () => {
    expect(formatFactionRank('Disciple')).toBe('弟子');
    expect(formatFactionRank('Deacon')).toBe('执事');
    expect(formatFactionRank('Elder')).toBe('长老');
    expect(formatFactionRank('Leader')).toBe('掌门');
  });

  it('treats undefined as no faction', () => {
    expect(formatFactionRank(undefined)).toBe('无');
  });
});

describe('百艺显示映射', () => {
  it('maps expanded recipes and forge products', () => {
    expect(formatRecipeName('RECIPE_GOLDEN_CORE_PILL')).toBe('金丹丹');
    expect(formatRecipeName('RECIPE_STAR_PHOENIX_BLADE')).toBe('凤鸣星辰剑');
    expect(formatItemId('ITEM_XUAN_GUI_ARMOR')).toBe('玄龟宝甲');
  });

  it('prefers template mapping and handles runtime item ids', () => {
    expect(formatItemName({ id: 'ITEM_STAR_SWORD_1730000000000', name: 'ITEM_STAR_SWORD_1730000000000' })).toBe('星辰剑');
    expect(formatItemName({ id: 'runtime-id', templateId: 'ITEM_SPIRIT_ARMOR', name: 'ITEM_SPIRIT_ARMOR' })).toBe('灵甲');
    expect(formatItemName({ id: 'runtime-pill', templateId: 'RECIPE_QI_PILL', name: 'RECIPE_QI_PILL' })).toBe('聚气丹');
    expect(formatItemName({ id: 'runtime-pill', templateId: 'RECIPE_QI_PILL', name: '毒聚气丹' })).toBe('毒聚气丹');
    expect(formatItemName({ id: 'runtime-id', name: '自定义宝物' })).toBe('自定义宝物');
  });

  it('maps legendary effects and engine result messages', () => {
    expect(formatSpecialEffect('SOUL_GUARD')).toBe('剑灵护体');
    expect(formatSpecialEffect(undefined)).toBe('无');
    expect(formatTier(3)).toBe('3阶');
    expect(formatCraftingMessage('升品成功！ITEM_STAR_SWORD 已升至 Legendary')).toBe('升品成功！星辰剑 已升至 仙品');
    expect(formatCraftingMessage('材料不足：MAT_SKY_GOLD_SAND')).toBe('材料不足：天金砂');
  });
});
