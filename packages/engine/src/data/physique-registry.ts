// ============================================================
// 补充任务：体质抽选库（诞生模式/开局抽取用）
// 独立于灵根（spirit-root-table）与天赋词条（trait-registry）的
// 第三层先天设定：凡体 → 灵体 → 宝体 → 圣体 → 神体
// 参考鬼谷八荒的"体质/灵体"设定，每档含特殊效果
// ============================================================

import type { AttributeMap } from '@taosim/contracts';

// 体质品阶（由低到高）
export type PhysiqueGrade = 'Mortal' | 'Spirit' | 'Treasure' | 'Saint' | 'Divine';

export const PHYSIQUE_GRADE_NAME: Record<PhysiqueGrade, string> = {
  Mortal: '凡体',
  Spirit: '灵体',
  Treasure: '宝体',
  Saint: '圣体',
  Divine: '神体',
};

export interface Physique {
  id: string;              // 如 'PHYSIQUE_WOOD_SPIRIT'
  name: string;            // 如 '青木灵体'
  grade: PhysiqueGrade;
  description: string;     // 一句话叙事
  effects: AttributeMap;   // 属性加成
  weight: number;          // 抽选权重（越高越常见）
}

export const PHYSIQUE_REGISTRY: Physique[] = [
  // ==================== 凡体 Mortal（基础档）====================
  {
    id: 'PHYSIQUE_COMMON',
    name: '凡俗之躯',
    grade: 'Mortal',
    description: '与常人无异，无甚天赋异禀。然凡人亦有攀登大道之志，你自认比谁都耐得住寂寞。',
    effects: {},
    weight: 40,
  },
  {
    id: 'PHYSIQUE_BORN_STRONG',
    name: '天生神力',
    grade: 'Mortal',
    description: '力气远超同龄，拳脚可碎石裂碑。村中壮汉掰腕子，没一个能胜过你。',
    effects: { physique: 5, attack: 3 },
    weight: 25,
  },
  {
    id: 'PHYSIQUE_LIGHT_FOOT',
    name: '身轻如燕',
    grade: 'Mortal',
    description: '自幼身法灵活，翻墙上树如履平地，山间奔跑连猎犬都追不上你。',
    effects: { agility: 5 },
    weight: 25,
  },
  {
    id: 'PHYSIQUE_IRON_SKIN',
    name: '皮糙肉厚',
    grade: 'Mortal',
    description: '皮厚耐打，挨几下揍也只当挠痒。幼时打架，你是村中出了名的打不死。',
    effects: { physique: 8, defense: 3 },
    weight: 15,
  },

  // ==================== 灵体 Spirit（中坚档）====================
  {
    id: 'PHYSIQUE_WOOD_SPIRIT',
    name: '青木灵体',
    grade: 'Spirit',
    description: '身蕴木灵之气，生机盎然，伤口愈合极快，寻常瘴毒也近不了身。',
    effects: { spiritEnergyMax: 30, poisonResist: 10 },
    weight: 20,
  },
  {
    id: 'PHYSIQUE_FIRE_SPIRIT',
    name: '赤炎灵体',
    grade: 'Spirit',
    description: '火灵入体，性烈如火，攻伐凌厉。幼时打铁铺的老铁匠说你天生是玩火的料。',
    effects: { attack: 8, critRate: 3 },
    weight: 20,
  },
  {
    id: 'PHYSIQUE_WATER_SPIRIT',
    name: '玄水灵体',
    grade: 'Spirit',
    description: '水灵温养经脉，灵力绵长悠远，修炼起来不疾不徐，根基极为扎实。',
    effects: { spiritEnergyMax: 40, defense: 5 },
    weight: 20,
  },
  {
    id: 'PHYSIQUE_EARTH_SPIRIT',
    name: '厚土灵体',
    grade: 'Spirit',
    description: '土灵厚重，肉身坚实如磐石，站在大地之上，便觉有无穷的力量从脚下涌来。',
    effects: { physique: 10, defense: 8 },
    weight: 20,
  },
  {
    id: 'PHYSIQUE_ICE_SPIRIT',
    name: '寒冰灵体',
    grade: 'Spirit',
    description: '冰灵凝于丹田，出手自带三分寒意，性情也随之变得冷静克制。',
    effects: { critRate: 5, spiritEnergyMax: 20 },
    weight: 18,
  },

  // ==================== 宝体 Treasure（稀有档）====================
  {
    id: 'PHYSIQUE_IRON_BONE',
    name: '铁骨宝体',
    grade: 'Treasure',
    description: '骨骼如铁，受击不倒。幼时从山崖上摔下，旁人以为你必死无疑，你却拍拍土站了起来。',
    effects: { physique: 15, defense: 10 },
    weight: 10,
  },
  {
    id: 'PHYSIQUE_SWORD_SPIRIT',
    name: '通灵剑体',
    grade: 'Treasure',
    description: '天生与剑亲和，握剑时剑意自生。村中猎户削的木剑，到你手里竟隐隐有了锋芒。',
    effects: { attack: 12, critRate: 8 },
    weight: 10,
  },
  {
    id: 'PHYSIQUE_PHANTOM',
    name: '幻影宝体',
    grade: 'Treasure',
    description: '身形飘忽，神识敏锐，极难被锁定。你自幼便擅长躲猫猫，如今更是无人能捕捉你的踪迹。',
    effects: { agility: 12, perception: 8 },
    weight: 10,
  },
  {
    id: 'PHYSIQUE_PURE_HEART',
    name: '赤子宝体',
    grade: 'Treasure',
    description: '道心纯净无垢，悟性超凡。别人苦思数日难解的关窍，你往往一通百通。',
    effects: { comprehension: 12, luck: 5 },
    weight: 8,
  },

  // ==================== 圣体 Saint（顶级档）====================
  {
    id: 'PHYSIQUE_ANCIENT_SAINT',
    name: '荒古圣体',
    grade: 'Saint',
    description: '传说中的远古战体，肉身强横无匹，同境之中难逢敌手。觉醒之日，族老们看着你的目光都变了。',
    effects: { physique: 20, defense: 15, attack: 10 },
    weight: 5,
  },
  {
    id: 'PHYSIQUE_SWORD_SAINT',
    name: '剑圣之体',
    grade: 'Saint',
    description: '万剑臣服，生而为剑道之巅。你在山间随手折下的一根桃枝，都能在手中凝出三尺剑光。',
    effects: { attack: 25, critRate: 15 },
    weight: 4,
  },
  {
    id: 'PHYSIQUE_CHAOS_SAINT',
    name: '混沌圣体',
    grade: 'Saint',
    description: '混沌初开之气入体，万法皆可修，全属性精进如飞。此体质一出，注定震动一域。',
    effects: {
      physique: 10, comprehension: 10, perception: 10,
      agility: 10, luck: 10, charm: 10, spiritEnergyMax: 50,
    },
    weight: 2,
  },

  // ==================== 神体 Divine（传说档）====================
  {
    id: 'PHYSIQUE_SUPREME_DAO',
    name: '太虚神体',
    grade: 'Divine',
    description: '传说中最接近大道的体质，万法亲和，天地灵气自发亲近于你。此等体质，万年难出一个。',
    effects: {
      physique: 15, comprehension: 15, perception: 15,
      agility: 15, luck: 10, charm: 10,
      spiritEnergyMax: 100, attack: 10, defense: 10,
    },
    weight: 1.2,
  },
  {
    id: 'PHYSIQUE_CREATION',
    name: '造化神体',
    grade: 'Divine',
    description: '受天地造化钟爱的体质，气运滔天。凡你所至，机缘自生，仿佛整方天地都在为你铺路。',
    effects: {
      luck: 20, comprehension: 15, spiritEnergyMax: 80,
      physique: 8, perception: 8,
    },
    weight: 0.5,
  },
];

// ---- 查询与抽取函数 ----

/** 按 id 获取体质 */
export function getPhysiqueById(id: string): Physique | undefined {
  return PHYSIQUE_REGISTRY.find(p => p.id === id);
}

/** 按品阶获取体质池 */
export function getPhysiquesByGrade(grade: PhysiqueGrade): Physique[] {
  return PHYSIQUE_REGISTRY.filter(p => p.grade === grade);
}

/**
 * 按权重随机抽取一种体质（开局/诞生模式使用）
 * 引擎可传入自定义 rng 以便测试与确定性回放
 */
export function rollPhysique(rng: () => number = Math.random): Physique {
  const totalWeight = PHYSIQUE_REGISTRY.reduce((sum, p) => sum + p.weight, 0);
  let roll = rng() * totalWeight;
  for (const physique of PHYSIQUE_REGISTRY) {
    roll -= physique.weight;
    if (roll <= 0) return physique;
  }
  // 浮点误差兜底：返回最后一项
  return PHYSIQUE_REGISTRY[PHYSIQUE_REGISTRY.length - 1]!;
}
