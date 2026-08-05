// ============================================================
// Character 数据模型 — 架构规范 §21
// ============================================================

// ---- 基础枚举 ----
export type RealmType = 'LianQi' | 'ZhuJi' | 'JinDan' | 'YuanYing' | 'HuaShen';

export type RealmFullPath =
  | 'QiRefinement_1' | 'QiRefinement_2' | 'QiRefinement_3' | 'QiRefinement_4'
  | 'QiRefinement_5' | 'QiRefinement_6' | 'QiRefinement_7' | 'QiRefinement_8'
  | 'QiRefinement_9'
  | 'Foundation_1' | 'Foundation_2' | 'Foundation_3'
  | 'GoldenCore_1' | 'GoldenCore_2' | 'GoldenCore_3'
  | 'NascentSoul_1' | 'NascentSoul_2' | 'NascentSoul_3'
  | 'SoulFormation_1';

export type SoulState = 'Active' | 'PrimordialSoul' | 'RemnantSoul' | 'Oblivion';

export type Gender = 'Male' | 'Female' | 'Other';

export type FactionRank = 'Disciple' | 'Deacon' | 'Elder' | 'Leader';

// ---- 工具函数 ----
export function parseRealm(fullPath: RealmFullPath): { realmType: RealmType; subLevel: number } {
  const [realmStr, levelStr] = fullPath.split('_') as [string, string];
  const level = parseInt(levelStr, 10);
  const map: Record<string, RealmType> = {
    QiRefinement: 'LianQi',
    Foundation: 'ZhuJi',
    GoldenCore: 'JinDan',
    NascentSoul: 'YuanYing',
    SoulFormation: 'HuaShen',
  };
  return { realmType: map[realmStr]!, subLevel: level };
}

// ---- 角色关系 ----
export interface CharacterRelation {
  targetId: string;
  favorability: number;       // 好感度 (-100 ~ 100)
  hatred: number;             // 仇恨值 (0 ~ 100)
  jealousy: number;           // 嫉妒值 (0 ~ 100)
  tags: ('TaoistPartner' | 'Master' | 'Disciple' | 'Enemy' | 'Kinsman')[];
}

// ---- 角色主模型 ----
export interface Character {
  id: string;
  name: string;
  gender: Gender;
  realm: RealmFullPath;
  soulState: SoulState;

  // 成长与基础数值
  cultivation: {
    currentExp: number;
    maxExp: number;
  };
  lifespan: {
    age: number;
    maxLifespan: number;
  };
  spiritEnergy: {
    current: number;
    max: number;
  };
  monthlyActionPoints: {
    current: number;
    max: number;
  };

  // 基础属性
  attributes: {
    physique: number;        // 根骨
    comprehension: number;   // 悟性
    perception: number;      // 神识
    agility: number;         // 身法
    luck: number;            // 气运
  };

  // 战棋状态
  hp: number;
  maxHp: number;
  ap: number;                // Action Points
  canFly: boolean;           // 金丹期以上为 true

  // 物品与装备
  inventory: import('./item.js').ItemStack[];
  equipmentSlots: {
    weapon?: import('./item.js').Item;
    armor?: import('./item.js').Item;
    treasures: import('./item.js').Item[];
  };

  // 功法与势力羁绊
  skills: import('./skill.js').Skill[];
  skillCooldowns: Record<string, number>;       // skillId → 剩余冷却回合数
  traits: import('./trait.js').Trait[];
  factionId?: string;
  factionRank?: FactionRank;
  relations: Record<string, CharacterRelation>;
  spiritStones: number;
  wantedLevels: Record<string, number>;          // continentId → level (0~5)
}
