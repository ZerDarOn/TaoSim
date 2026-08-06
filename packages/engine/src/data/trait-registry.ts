// ============================================================
// 天赋词条库 — Phase 9 §2.4
// 借鉴鬼谷八荒先天气运体系，5 品阶 × 7 分类
// 可扩展：后续新增词条只需在此数组追加
// ============================================================

import type { Trait } from '@taosim/contracts';

export const TRAIT_REGISTRY: Trait[] = [
  // ===== Green（绿阶·基础）=====
  {
    id: 'TRAIT_MARTIAL_FAMILY',
    name: '武道世家',
    quality: 'Green',
    description: '自幼习武，根骨身法兼备，但不善读书。',
    effects: { physique: 3, agility: 3, comprehension: -3 },
  },
  {
    id: 'TRAIT_WATER_CHILD',
    name: '善水之人',
    quality: 'Green',
    description: '自幼亲水，水系亲和略高。',
    effects: { spiritEnergyMax: 10 },
  },
  {
    id: 'TRAIT_LEFT_HANDED',
    name: '左撇子',
    quality: 'Green',
    description: '左撇子，思维独特，悟性略高，但略显怪异。',
    effects: { comprehension: 10, charm: -30 },
  },
  {
    id: 'TRAIT_SIMPLETON',
    name: '憨人',
    quality: 'Green',
    description: '心思单纯，讨人喜欢，但不善悟道。',
    effects: { charm: 100, comprehension: -10 },
  },
  {
    id: 'TRAIT_BOAR_CHARGE',
    name: '猪突',
    quality: 'Green',
    description: '性格莽撞，攻击力略高，但防御较差。',
    effects: { attack: 3, defense: -2 },
  },

  // ===== Blue（蓝阶·优良）=====
  {
    id: 'TRAIT_BORN_WISDOM',
    name: '天生慧根',
    quality: 'Blue',
    description: '天生悟性出众，神识敏锐。',
    effects: { comprehension: 10, perception: 5 },
  },
  {
    id: 'TRAIT_GOOD_BONES',
    name: '天资根骨',
    quality: 'Blue',
    description: '根骨奇佳，万中无一的修炼苗子。',
    effects: { physique: 5, comprehension: 5, perception: 5, agility: 5, luck: 5, charm: 5 },
  },
  {
    id: 'TRAIT_BORN_SPIRIT_BODY',
    name: '天生灵体',
    quality: 'Blue',
    description: '天生灵力充沛，灵力上限大增。',
    effects: { spiritEnergyMax: 100 },
  },
  {
    id: 'TRAIT_FALLEN_NOBLE',
    name: '破落贵族',
    quality: 'Blue',
    description: '家道中落的贵族子弟，带着一笔积蓄和几分气度。',
    effects: { initialStones: 1000, charm: 50 },
  },
  {
    id: 'TRAIT_OPTIMIST',
    name: '乐天一派',
    quality: 'Blue',
    description: '乐天知命，福缘深厚，人见人爱。',
    effects: { luck: 15, charm: 20 },
  },
  {
    id: 'TRAIT_HANDSOME',
    name: '翩翩良人',
    quality: 'Blue',
    description: '容貌出众，气度不凡，行走修仙界颇得人缘。',
    effects: { charm: 100, defense: 2 },
  },

  // ===== Purple（紫阶·圣级）=====
  {
    id: 'TRAIT_SMART_BALD',
    name: '聪明谢顶',
    quality: 'Purple',
    description: '聪明绝顶——字面意义上的。悟性极高，但发量堪忧，仙姿大跌。',
    effects: { comprehension: 30, charm: -200 },
  },
  {
    id: 'TRAIT_WATER_SPIRIT_BODY',
    name: '水灵体',
    quality: 'Purple',
    description: '先天水灵凝聚，水系亲和极高。',
    effects: { spiritEnergyMax: 50, defense: 5 },
  },
  {
    id: 'TRAIT_DEEP_WISDOM',
    name: '智计过人',
    quality: 'Purple',
    description: '谋略深远，悟性远超常人。',
    effects: { comprehension: 25, perception: 10 },
  },

  // ===== Orange（橙阶·仙级）=====
  {
    id: 'TRAIT_MARTIAL_SAINT',
    name: '武圣转世',
    quality: 'Orange',
    description: '武圣转世，攻击根骨悟性全面卓越。',
    effects: { attack: 10, physique: 10, comprehension: 20 },
  },
  {
    id: 'TRAIT_SWORD_BONE',
    name: '剑骨',
    quality: 'Orange',
    description: '天生剑骨，剑道天才，攻击暴击俱佳。',
    effects: { attack: 15, critRate: 10 },
  },
  {
    id: 'TRAIT_POISON_BODY',
    name: '万毒侵体',
    quality: 'Orange',
    description: '百毒不侵之体，但体质略损。',
    effects: { poisonResist: 50, defense: -5 },
  },
  {
    id: 'TRAIT_LONGEVITY_HEIR',
    name: '寿星后代',
    quality: 'Orange',
    description: '寿星后裔，天生寿元绵长。',
    effects: { lifespanBonus: 50 },
  },
  {
    id: 'TRAIT_ROYAL_ORPHAN',
    name: '皇朝遗孤',
    quality: 'Orange',
    description: '覆灭皇朝的遗孤，身怀巨资，气度不凡。',
    effects: { initialStones: 5000, charm: 50 },
  },
  {
    id: 'TRAIT_GENUIS_UNFORTUNATE',
    name: '天妒英才',
    quality: 'Orange',
    description: '悟性绝顶，修为增长极快，但天妒其才，寿元有损。',
    effects: { comprehension: 20, lifespanBonus: -20 },
  },

  // ===== Red（红阶·神级）=====
  {
    id: 'TRAIT_INNATE_DAO_BODY',
    name: '先天道体',
    quality: 'Red',
    description: '传说中的先天道体，万中无一的修炼奇才，全属性大幅提升。',
    effects: { physique: 10, comprehension: 10, perception: 10, agility: 10, luck: 10, charm: 10, spiritEnergyMax: 100 },
  },
  {
    id: 'TRAIT_ELEMENTAL_POWER',
    name: '元素之力',
    quality: 'Red',
    description: '天生亲和万法，灵力澎湃。',
    effects: { spiritEnergyMax: 200, attack: 5 },
  },
  {
    id: 'TRAIT_DESTINED_LONGEVITY',
    name: '天命长寿',
    quality: 'Red',
    description: '天命所归，寿元极长，福缘深厚。',
    effects: { lifespanBonus: 100, luck: 10 },
  },
  {
    id: 'TRAIT_CHOSEN_ONE',
    name: '天命之子',
    quality: 'Red',
    description: '气运逆天，奇遇不断，行走修仙界如履平地。',
    effects: { luck: 30, charm: 50 },
  },

  // ===== 补充：Green（绿阶·基础）=====
  {
    id: 'TRAIT_SLEEPY_HEAD',
    name: '贪睡懒虫',
    quality: 'Green',
    description: '倒头便睡，灵力回复极快，可惜修炼上总是少了几分勤勉。',
    effects: { spiritEnergyMax: 15, comprehension: -5 },
  },
  {
    id: 'TRAIT_MISER',
    name: '守财奴',
    quality: 'Green',
    description: '精打细算，起步略有余财，只是为人吝啬，走到哪儿都不太讨喜。',
    effects: { initialStones: 300, charm: -50 },
  },

  // ===== 补充：Blue（蓝阶·优良）=====
  {
    id: 'TRAIT_ALCHEMY_SEED',
    name: '丹心妙手',
    quality: 'Blue',
    description: '天生丹道亲和，控火手感极佳，悟性与灵力俱为上乘。',
    effects: { comprehension: 8, spiritEnergyMax: 30 },
  },
  {
    id: 'TRAIT_UNYIELDING',
    name: '百折不挠',
    quality: 'Blue',
    description: '意志坚韧如铁，肉身高强度修炼下恢复极快，越挫越勇。',
    effects: { physique: 8, defense: 5 },
  },

  // ===== 补充：Purple（紫阶·圣级）=====
  {
    id: 'TRAIT_THUNDER_APTITUDE',
    name: '雷灵感应',
    quality: 'Purple',
    description: '天生亲近雷电，出手凌厉霸道，暴击惊人，只是脾性随之躁动。',
    effects: { attack: 10, critRate: 10, comprehension: -5 },
  },
  {
    id: 'TRAIT_SEVEN_ORIFICES',
    name: '七窍玲珑',
    quality: 'Purple',
    description: '心思通透，察言观色远胜常人，悟性过人，人缘亦佳。',
    effects: { perception: 15, comprehension: 5, charm: 30 },
  },

  // ===== 补充：Orange（橙阶·仙级）=====
  {
    id: 'TRAIT_REFINING_SAINT',
    name: '炼体狂魔',
    quality: 'Orange',
    description: '肉身千锤百炼，刀枪难伤，攻防兼备，同境之中难逢敌手。',
    effects: { physique: 15, defense: 10, attack: 8 },
  },
  {
    id: 'TRAIT_ALCHEMY_SAINT',
    name: '丹道奇才',
    quality: 'Orange',
    description: '天生丹道圣手，凡火中亦能炼出灵丹，福缘深厚，丹方屡有灵悟。',
    effects: { comprehension: 15, luck: 10, spiritEnergyMax: 30 },
  },

  // ===== 补充：Red（红阶·神级）=====
  {
    id: 'TRAIT_HEAVEN_EYE',
    name: '天眼通',
    quality: 'Red',
    description: '天生通晓天地，神识如渊如海，能窥破虚妄，洞见福祸。',
    effects: { perception: 30, luck: 15, comprehension: 10 },
  },
  {
    id: 'TRAIT_PHOENIX_REBIRTH',
    name: '涅槃不灭体',
    quality: 'Red',
    description: '身负上古凤凰涅槃之力，寿元绵长，生机不绝，浴火可获新生。',
    effects: { lifespanBonus: 80, physique: 12, spiritEnergyMax: 80 },
  },

  // ===== 补充：Green（绿阶·基础）=====
  {
    id: 'TRAIT_NIGHT_OWL',
    name: '夜猫子',
    quality: 'Green',
    description: '昼伏夜出，夜中精神格外抖擞，神识也较常人灵敏几分，只是白日里总有些没精打采。',
    effects: { perception: 6, comprehension: -3 },
  },
  {
    id: 'TRAIT_STUDIOUS',
    name: '手不释卷',
    quality: 'Green',
    description: '自幼嗜书如命，博闻强识，悟性略胜常人，只是久坐读书，身板不大结实。',
    effects: { comprehension: 6, physique: -2 },
  },
  {
    id: 'TRAIT_STUBBORN',
    name: '倔驴脾气',
    quality: 'Green',
    description: '认准的事九头牛都拉不回来，皮实耐揍，只是这倔劲儿也常惹人不快。',
    effects: { defense: 4, charm: -50 },
  },

  // ===== 补充：Blue（蓝阶·优良）=====
  {
    id: 'TRAIT_QUICK_WITTED',
    name: '急智过人',
    quality: 'Blue',
    description: '临危不乱，遇事转念极快，身法灵动，常能在险境中觅得一线生机。',
    effects: { agility: 8, perception: 5 },
  },
  {
    id: 'TRAIT_GOURMAND',
    name: '老饕',
    quality: 'Blue',
    description: '生于厨间，尝遍百味，连灵膳药膳的火候都颇有心得，人缘也因这一手好厨艺不差。',
    effects: { spiritEnergyMax: 20, charm: 20, luck: 5 },
  },
  {
    id: 'TRAIT_FOREST_CHILD',
    name: '山林之子',
    quality: 'Blue',
    description: '自幼在山野间长大，与草木鸟兽为伴，身轻如猿，福缘也格外眷顾山野之中。',
    effects: { agility: 10, luck: 5 },
  },

  // ===== 补充：Purple（紫阶·圣级）=====
  {
    id: 'TRAIT_MERCENARY',
    name: '佣兵出身',
    quality: 'Purple',
    description: '刀口舔血的营生干过多年，攻伐凌厉，皮糙肉厚，只是心性难免被磨得又冷又硬。',
    effects: { attack: 12, defense: 8, charm: -20 },
  },
  {
    id: 'TRAIT_MOON_GRACE',
    name: '月华洗炼',
    quality: 'Purple',
    description: '自幼便受月华青睐，夜间修炼事半功倍，身姿清冷，自带一股超凡气韵。',
    effects: { spiritEnergyMax: 40, luck: 10, charm: 30 },
  },

  // ===== 补充：Orange（橙阶·仙级）=====
  {
    id: 'TRAIT_HERBAL_SAINT',
    name: '药王传人',
    quality: 'Orange',
    description: '师承药王一脉，熟谙草木灵性，百毒难侵，炼药悟丹俱有独到之处。',
    effects: { poisonResist: 40, spiritEnergyMax: 40, comprehension: 10 },
  },
  {
    id: 'TRAIT_TALISMAN_SAINT',
    name: '符箓天才',
    quality: 'Orange',
    description: '于符箓一道天赋异禀，神识精纯，落笔成符，灵力损耗亦远低于同侪。',
    effects: { perception: 15, spiritEnergyMax: 50, comprehension: 10 },
  },

  // ===== 补充：Red（红阶·神级）=====
  {
    id: 'TRAIT_CHAOS_BODY',
    name: '混沌之体',
    quality: 'Red',
    description: '混沌本源之气入体，万法皆可修，全属性精进如飞，只是这般体质注定招来天妒。',
    effects: {
      physique: 8, comprehension: 8, perception: 8, agility: 8,
      luck: 8, charm: 8, spiritEnergyMax: 80,
    },
  },
  {
    id: 'TRAIT_EARTH_BLESSING',
    name: '厚土之佑',
    quality: 'Red',
    description: '得大地厚土庇佑，肉身坚不可摧，寿元绵长，立于大地之上便如永世不倒的雄山。',
    effects: { physique: 15, defense: 15, lifespanBonus: 40 },
  },
];

// ---- 查询函数 ----

/** 按品阶获取词条池 */
export function getTraitsByQuality(quality: Trait['quality']): Trait[] {
  return TRAIT_REGISTRY.filter(t => t.quality === quality);
}

/** 按 id 获取单个词条 */
export function getTraitById(id: string): Trait | undefined {
  return TRAIT_REGISTRY.find(t => t.id === id);
}

/** 随机 roll N 条不同品阶的词条（赌词条用） */
export function rollTraits(count: number, rng: () => number = Math.random): Trait[] {
  // 品阶概率：Green 40%, Blue 30%, Purple 18%, Orange 10%, Red 2%
  const qualityTable: Array<{ quality: Trait['quality']; weight: number }> = [
    { quality: 'Green', weight: 40 },
    { quality: 'Blue', weight: 30 },
    { quality: 'Purple', weight: 18 },
    { quality: 'Orange', weight: 10 },
    { quality: 'Red', weight: 2 },
  ];

  const result: Trait[] = [];
  const used = new Set<string>();

  for (let i = 0; i < count; i++) {
    const pool = qualityTable;
    const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
    let roll = rng() * totalWeight;
    let chosenQuality: Trait['quality'] = 'Green';
    for (const entry of pool) {
      roll -= entry.weight;
      if (roll <= 0) {
        chosenQuality = entry.quality;
        break;
      }
    }

    const available = getTraitsByQuality(chosenQuality).filter(t => !used.has(t.id));
    if (available.length === 0) {
      // 该品阶已用完，降级取 Green
      const fallback = getTraitsByQuality('Green').filter(t => !used.has(t.id));
      if (fallback.length === 0) continue;
      const pick = fallback[Math.floor(rng() * fallback.length)]!;
      used.add(pick.id);
      result.push(pick);
    } else {
      const pick = available[Math.floor(rng() * available.length)]!;
      used.add(pick.id);
      result.push(pick);
    }
  }

  return result;
}
