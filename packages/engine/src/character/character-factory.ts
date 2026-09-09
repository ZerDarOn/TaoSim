import type { Character, Gender, RealmFullPath, SpiritRoot, GameMode, TraitCombatBonuses } from '@taosim/contracts';
import type { AttributeKey } from '@taosim/contracts';
import { getTraitById } from '../data/trait-registry.js';
import { computeDerivedStats } from './derived-stats.js';

function generateId(): string {
  return `CHAR_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type ArrivalMode = 'birth' | 'transmigration' | 'god';

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

// 家世只提供凡人尺度的随身资财；功法、宗门身份与法宝必须在世界中真实取得。
const INITIAL_STONES: Record<BackgroundType, number> = {
  'orphan': 0,
  'small-clan': 20,
  'ancient-clan': 100,
};

/** 六维属性键（词条 effects 中直接写入 attributes 的键） */
type AttributeSix = 'physique' | 'comprehension' | 'perception' | 'agility' | 'luck' | 'charm';
function isAttributeSix(k: AttributeKey): k is AttributeSix {
  return k === 'physique' || k === 'comprehension' || k === 'perception' || k === 'agility' || k === 'luck' || k === 'charm';
}

/**
 * 应用先天气运词条效果（trait.effects）。
 * 此前词条只挂载列表、效果全部悬空；此处补齐：
 *  - 六维属性 → attributes
 *  - spiritEnergyMax / initialStones / lifespanBonus → 对应字段
 *  - attack / defense / critRate / poisonResist → 聚合到 traitBonuses（供装备系统合并）
 */
function applyTraitEffects(c: Character): void {
  const bonuses: TraitCombatBonuses = { attack: 0, defense: 0, critRate: 0, poisonResist: 0 };
  for (const trait of c.traits) {
    const effects = trait.effects;
    for (const key of Object.keys(effects) as AttributeKey[]) {
      const v = effects[key] ?? 0;
      if (v === 0) continue;
      if (isAttributeSix(key)) {
        c.attributes[key] = Math.max(1, (c.attributes[key] ?? 0) + v);
      } else {
        switch (key) {
          case 'spiritEnergyMax':
            if (c.realm !== 'Mortal') c.spiritEnergy.max = Math.max(1, c.spiritEnergy.max + v);
            break;
          case 'initialStones': c.spiritStones = Math.max(0, c.spiritStones + v); break;
          case 'lifespanBonus': c.lifespan.maxLifespan = Math.max(1, c.lifespan.maxLifespan + v); break;
          case 'attack': bonuses.attack += v; break;
          case 'defense': bonuses.defense += v; break;
          case 'critRate': bonuses.critRate += v; break;
          case 'poisonResist': bonuses.poisonResist += v; break;
        }
      }
    }
  }
  if (bonuses.attack !== 0 || bonuses.defense !== 0 || bonuses.critRate !== 0 || bonuses.poisonResist !== 0) {
    c.traitBonuses = bonuses;
  }
  c.spiritEnergy.current = c.spiritEnergy.max;
}

export class CharacterFactory {
  static create(params: CreateCharacterParams): Character {
    const id = generateId();
    // 三种入口都先是凡人/观察者；引气入体必须由后续世界行为达成。
    const realm: RealmFullPath = 'Mortal';
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

    // 降生从 0 岁进入前史并由 PlayerEntryService 同期演化至开蒙；穿越保留选定年龄。
    const age = arrivalMode === 'transmigration' ? (params.startAge ?? 20) : 0;

    const spiritRoot = params.spiritRoot ?? { grade: 'Yellow', elements: ['Earth'], isVariant: false };
    const gameMode = params.gameMode ?? { breakthrough: 'Simple', saveMode: 'Free' } as GameMode;

    // P2：统一派生属性（取代硬编码 baseHp=100, spiritEnergy=100）
    const derived = computeDerivedStats({
      realm,
      attributes,
      spiritRoot,
      age,
      maxLifespan: 100,
    });

    const character: Character = {
      id, name: params.name, gender: params.gender, realm, soulState: 'Active',
      cultivation: { currentExp: 0, maxExp: 100 },
      lifespan: { age, maxLifespan: 100 },
      spiritEnergy: { current: 0, max: 0 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes,
      spiritRoot,
      gameMode,
      hp: derived.maxHp, maxHp: derived.maxHp, ap: 3, canFly: false,
      spiritStones: arrivalMode === 'birth' ? INITIAL_STONES[params.background] : 0,
      inventory: [],
      equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
      skills: [], skillCooldowns: {}, traits,
      factionId: undefined, factionRank: undefined, relations: {}, wantedLevels: {},
      unlockedRecipes: ['RECIPE_QI_PILL'],
    };
    applyTraitEffects(character);
    // 凡人即便有潜在灵性词条，也没有可调用灵力；觉醒应由后续境界变化统一重算。
    character.spiritEnergy = { current: 0, max: 0 };
    // 穿越与上帝观察不因词条获得凭空物资；降生资财由家世来源解释。
    if (arrivalMode !== 'birth') character.spiritStones = 0;
    return character;
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
