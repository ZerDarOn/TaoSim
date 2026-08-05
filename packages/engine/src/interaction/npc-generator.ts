import type { Character } from '@taosim/contracts';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const NAMES = ['玄明子', '妙音', '苍梧', '青羽', '无尘', '九渊', '白鹤', '紫电', '凌霄', '幽兰'];
const SURNAMES = ['云', '慕', '叶', '司', '顾', '温', '沈', '柳', '裴', '萧'];

export class NPCGenerator {
  static generate(tier: number, seed: number): Character {
    const rand = seededRandom(seed);
    const name = `${SURNAMES[Math.floor(rand() * SURNAMES.length)]}${NAMES[Math.floor(rand() * NAMES.length)]}`;

    const realmTier = tier === 1 ? 'QiRefinement' :
      tier === 2 ? 'Foundation' :
      tier >= 3 ? (rand() < 0.5 ? 'Foundation' : 'GoldenCore') : 'QiRefinement';

    const subLevel = 1 + Math.floor(rand() * 5);

    const attributes = {
      physique: 3 + Math.floor(rand() * 12),
      comprehension: 3 + Math.floor(rand() * 12),
      perception: 3 + Math.floor(rand() * 12),
      agility: 3 + Math.floor(rand() * 12),
      luck: 1 + Math.floor(rand() * 10),
      charm: 3 + Math.floor(rand() * 12),
    };

    const baseHp = 100 + tier * 80 + attributes.physique * 5;

    return {
      id: `NPC_GEN_${seed}`,
      name,
      gender: rand() < 0.5 ? 'Male' : 'Female',
      realm: `${realmTier}_${subLevel}` as any,
      soulState: 'Active',
      cultivation: { currentExp: 0, maxExp: 500 * tier },
      lifespan: { age: 20 + Math.floor(rand() * 100), maxLifespan: 100 + tier * 100 },
      spiritEnergy: { current: 100, max: 100 + tier * 50 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes,
      spiritRoot: { grade: 'Yellow', elements: ['Earth'], isVariant: false },
      gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
      hp: baseHp,
      maxHp: baseHp,
      ap: 3,
      canFly: tier >= 2,
      spiritStones: 0,
      inventory: [],
      equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
      skills: [],
      skillCooldowns: {},
      traits: [],
      relations: {},
      wantedLevels: {},
      unlockedRecipes: [],
    } as Character;
  }
}
