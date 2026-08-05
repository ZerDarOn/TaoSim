import type { Character, Gender, FactionRank, RealmFullPath, Item, Skill } from '@taosim/contracts';

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
}

const TRAIT_TEMPLATES: Record<string, { effects: Record<string, number>; quality: string }> = {
  '剑道奇才': { effects: { attack: 5, comprehension: 2 }, quality: 'Red' },
  '重瞳': { effects: { perception: 3, luck: 2 }, quality: 'Red' },
  '先天道体': { effects: { physique: 2, comprehension: 2, spiritEnergyMax: 50 }, quality: 'Orange' },
  '天生神力': { effects: { attack: 8, physique: 3 }, quality: 'Orange' },
  '丹道天才': { effects: { comprehension: 3, luck: 1 }, quality: 'Purple' },
  '阵道奇才': { effects: { perception: 3 }, quality: 'Purple' },
  '天煞孤星': { effects: { attack: 5, luck: -3 }, quality: 'Red' },
  '五行灵体': { effects: { spiritEnergyMax: 100, comprehension: 1 }, quality: 'Orange' },
  '瞳术天才': { effects: { perception: 4, critRate: 5 }, quality: 'Purple' },
  '万法归宗': { effects: { comprehension: 4, spiritEnergyMax: 80 }, quality: 'Red' },
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

    const traits = params.innateTraits
      .filter(name => TRAIT_TEMPLATES[name])
      .map(name => {
        const tpl = TRAIT_TEMPLATES[name]!;
        return {
          id: `TRAIT_${name}`,
          name,
          quality: tpl.quality as Character['traits'][number]['quality'],
          description: `先天气运：${name}`,
          effects: tpl.effects,
        };
      });

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
      hp: baseHp, maxHp: baseHp, ap: 3, canFly: false,
      spiritStones: 0,
      inventory: [],
      equipmentSlots: { weapon, armor: undefined, treasures: [] },
      skills: starterSkills, skillCooldowns: {}, traits,
      factionId, factionRank, relations: {}, wantedLevels: {},
    };
  }
}
