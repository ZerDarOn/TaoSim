import type { Character, Gender, FactionRank, RealmFullPath, Item, Skill, SpiritRoot, GameMode } from '@taosim/contracts';
import { getTraitById } from '../data/trait-registry.js';

function generateId(): string {
  return `CHAR_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type BackgroundType = 'orphan' | 'small-clan' | 'ancient-clan';

interface CreateCharacterParams {
  name: string;
  gender: Gender;
  background: BackgroundType;
  attributes: Record<string, number>;
  innateTraits: string[];
  spiritRoot?: SpiritRoot;
  gameMode?: GameMode;
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

    // 从 TRAIT_REGISTRY 查词条（Phase 10：统一到 registry 体系）
    const traits = params.innateTraits
      .map(id => getTraitById(id))
      .filter((t): t is NonNullable<typeof t> => t !== undefined);

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
      lifespan: { age: 18, maxLifespan: 100 },
      spiritEnergy: { current: 100, max: 100 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes: { ...params.attributes } as Character['attributes'],
      spiritRoot: params.spiritRoot ?? { grade: 'Yellow', elements: ['Earth'], isVariant: false },
      gameMode: params.gameMode ?? { breakthrough: 'Simple', saveMode: 'Free' },
      hp: baseHp, maxHp: baseHp, ap: 3, canFly: false,
      spiritStones: INITIAL_STONES[params.background],
      inventory: [],
      equipmentSlots: { weapon, armor: undefined, treasures: [] },
      skills: starterSkills, skillCooldowns: {}, traits,
      factionId, factionRank, relations: {}, wantedLevels: {},
    };
  }
}
