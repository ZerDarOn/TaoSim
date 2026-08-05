import type { Character, Gender, FactionRank, RealmFullPath, Item, Skill, SpiritRoot, GameMode } from '@taosim/contracts';
import { getTraitById } from '../data/trait-registry.js';

function generateId(): string {
  return `CHAR_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type ArrivalMode = 'birth' | 'transmigration';

type BackgroundType = 'orphan' | 'small-clan' | 'ancient-clan';

interface CreateCharacterParams {
  name: string;
  gender: Gender;
  background: BackgroundType;
  attributes: Record<string, number>;
  innateTraits: string[];
  spiritRoot?: SpiritRoot;
  gameMode?: GameMode;
  arrivalMode?: ArrivalMode;    // 降临方式，默认 'birth'
  startAge?: number;            // 穿越模式的起始年龄
}

// 背景 → 初始灵石映射（Phase 10 §5.1）
const INITIAL_STONES: Record<BackgroundType, number> = {
  'orphan': 100,
  'small-clan': 500,
  'ancient-clan': 2000,
};

const STARTER_WEAPON: Item = {
  id: 'ITEM_WOODEN_SWORD', name: '青木剑', tier: 1,
  type: 'Equipment', attributes: { attack: 5 },
};

const ANCIENT_WEAPON: Item = {
  id: 'ITEM_SPIRIT_SWORD', name: '灵蕴剑', tier: 2,
  type: 'Equipment', attributes: { attack: 15, critRate: 5 },
};

const STARTER_SKILL: Skill = {
  id: 'SKILL_BASIC_SLASH', name: '基础斩击',
  quality: 'Huang', type: 'Active',
  primitives: [
    { id: 'ATOM_001', category: 'Geometry', params: { type: 'Single', range: 1 }, costBudget: 10 },
    { id: 'ATOM_002', category: 'Numeric', params: { multiplier: 1.2 }, costBudget: 10 },
  ],
  cost: { ap: 1, spiritEnergy: 5 },
  cooldownTurns: 0,
};

export class CharacterFactory {
  static create(params: CreateCharacterParams): Character {
    const id = generateId();
    const realm: RealmFullPath = 'QiRefinement_1';
    const baseHp = 100;
    const arrivalMode = params.arrivalMode ?? 'birth';

    // 从 TRAIT_REGISTRY 查词条（Phase 10：统一到 registry 体系）
    const traits = params.innateTraits
      .map(id => getTraitById(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

    // 复制属性，穿越模式悟性 +5（两世为人加成）
    const attributes = { ...params.attributes } as Character['attributes'];
    if (arrivalMode === 'transmigration') {
      attributes.comprehension = (attributes.comprehension ?? 3) + 5;
    }

    // 降临方式决定年龄：诞生 → 6 岁开蒙；穿越 → startAge
    const age = arrivalMode === 'birth' ? 6 : (params.startAge ?? 20);

    const spiritRoot = params.spiritRoot ?? { grade: 'Yellow', elements: ['Earth'], isVariant: false };
    const gameMode = params.gameMode ?? { breakthrough: 'Simple', saveMode: 'Free' } as GameMode;

    // 穿越模式：白板开局（无灵石/装备/宗门/技能）
    if (arrivalMode === 'transmigration') {
      return {
        id, name: params.name, gender: params.gender, realm, soulState: 'Active',
        cultivation: { currentExp: 0, maxExp: 100 },
        lifespan: { age, maxLifespan: 100 },
        spiritEnergy: { current: 100, max: 100 },
        monthlyActionPoints: { current: 10, max: 10 },
        attributes,
        spiritRoot,
        gameMode,
        hp: baseHp, maxHp: baseHp, ap: 3, canFly: false,
        spiritStones: 0,
        inventory: [],
        equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
        skills: [], skillCooldowns: {}, traits,
        factionId: undefined, factionRank: undefined,
        relations: {}, wantedLevels: {},
        unlockedRecipes: ['RECIPE_QI_PILL'],
      };
    }

    // 诞生模式：按家世给资源
    let weapon: Item | undefined;
    let starterSkills: Skill[] = [];
    let factionId: string | undefined;
    let factionRank: FactionRank | undefined;

    if (params.background === 'ancient-clan') {
      weapon = ANCIENT_WEAPON;
      starterSkills = [{ ...STARTER_SKILL, name: '世家剑法', id: 'SKILL_CLAN_SWORD' }];
      factionId = 'FACTION_ANCIENT_CLAN';
      factionRank = 'Disciple';
    } else if (params.background === 'small-clan') {
      weapon = STARTER_WEAPON;
      factionId = 'FACTION_SMALL_CLAN';
      factionRank = 'Disciple';
    }

    return {
      id, name: params.name, gender: params.gender, realm, soulState: 'Active',
      cultivation: { currentExp: 0, maxExp: 100 },
      lifespan: { age, maxLifespan: 100 },
      spiritEnergy: { current: 100, max: 100 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes,
      spiritRoot,
      gameMode,
      hp: baseHp, maxHp: baseHp, ap: 3, canFly: false,
      spiritStones: INITIAL_STONES[params.background],
      inventory: [],
      equipmentSlots: { weapon, armor: undefined, treasures: [] },
      skills: starterSkills, skillCooldowns: {}, traits,
      factionId, factionRank, relations: {}, wantedLevels: {},
      unlockedRecipes: ['RECIPE_QI_PILL'],
    };
  }
}

// 降生故事（按家世）
export const BIRTH_STORIES: Record<BackgroundType, string[]> = {
  'orphan': [
    '你出生在东荒一户猎户之家，自幼与山林为伴，不知父母去向。',
    '六岁那年，一位云游道人路过茅屋，见你根骨不凡，叹道"此子与仙道有缘"，飘然而去。',
    '自此你心中种下一颗求道之种，等待有朝一日踏上修仙之路。',
  ],
  'small-clan': [
    '你降生于东荒修仙小族{家族名}，族中虽无惊天底蕴，却也有一口灵泉滋养族人。',
    '六岁开蒙之日，族中长老为你测灵根，虽非天纵之才，却也可踏上仙途。',
    '族中赐你一柄入门灵剑，望你光耀门楣。',
  ],
  'ancient-clan': [
    '你出身东荒修仙世家{家族名}，自幼锦衣玉食，灵药不断，族中长辈视你如珍宝。',
    '六岁测灵根时天降异象，紫气东来，长老断言你乃万年难遇的修炼奇才。',
    '族中立即将你立为嫡系继承人，倾尽资源栽培，望你他日飞升成仙。',
  ],
};

export const TRANSMIGRATION_STORY = '你本是另一个世界的灵魂，一朝身死，神魂却不灭。冥冥之中似乎有天意牵引，你的意识穿越无尽虚空，降临到这具躯体之中。两世为人的记忆让你心性远超常人，悟性自然非凡。只是这具躯体身无长物，一切都要从头开始……';
