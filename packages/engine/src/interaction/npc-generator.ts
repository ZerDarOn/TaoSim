import type { Character, RealmFullPath, Skill, SkillQuality, SpiritRoot, SpiritRootGrade, Item } from '@taosim/contracts';
import { resolvePersonalityId } from '../data/npc-personalities.js';
import { SKILL_REGISTRY } from '../data/skill-registry.js';
import { ItemFactory } from '../market/item-factory.js';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const NAMES = ['玄明子', '妙音', '苍梧', '青羽', '无尘', '九渊', '白鹤', '紫电', '凌霄', '幽兰'];
const SURNAMES = ['云', '慕', '叶', '司', '顾', '温', '沈', '柳', '裴', '萧'];

const FIVE_ELEMENTS = ['Metal', 'Wood', 'Water', 'Fire', 'Earth'] as const;
const VARIANT_ELEMENTS = ['Thunder', 'Ice', 'Wind', 'Dark'] as const;

/** 灵根品级概率随境界提升（境界越高，出好灵根的概率越大） */
const GRADE_TABLE: Record<number, SpiritRootGrade[]> = {
  1: ['Yellow', 'Yellow', 'Yellow', 'Yellow', 'Yellow', 'Yellow', 'Yellow', 'Profound', 'Profound', 'Profound'],
  2: ['Yellow', 'Yellow', 'Yellow', 'Yellow', 'Yellow', 'Profound', 'Profound', 'Profound', 'Earth', 'Earth'],
  3: ['Yellow', 'Yellow', 'Yellow', 'Profound', 'Profound', 'Profound', 'Profound', 'Earth', 'Earth', 'Heaven'],
  4: ['Yellow', 'Profound', 'Profound', 'Profound', 'Earth', 'Earth', 'Earth', 'Earth', 'Heaven', 'Heaven'],
  5: ['Profound', 'Earth', 'Earth', 'Earth', 'Earth', 'Earth', 'Heaven', 'Heaven', 'Heaven', 'Heaven'],
};

/** 技能品质池随境界提升（境界越高，越可能掌握高阶功法） */
const SKILL_QUALITY_POOL: Record<number, SkillQuality[]> = {
  1: ['Huang', 'Huang', 'Huang', 'Xuan'],
  2: ['Huang', 'Huang', 'Xuan', 'Xuan'],
  3: ['Xuan', 'Xuan', 'Xuan', 'Di'],
  4: ['Di', 'Di', 'Di', 'Tian'],
  5: ['Di', 'Tian', 'Tian', 'Tian'],
};

/** 从注册表中按品质池挑技能；避开带反噬/烧寿元副作用的功法（NPC 不承受代价） */
function pickSkill(rand: () => number, qualityPool: SkillQuality[]): Skill | undefined {
  const pool = SKILL_REGISTRY.filter(
    (s) => qualityPool.includes(s.quality) && !s.backfire && !s.cost.lifespanDays,
  );
  if (pool.length === 0) return undefined;
  return pool[Math.floor(rand() * pool.length)];
}

export class NPCGenerator {
  static generate(tier: number, seed: number): Character {
    const rand = seededRandom(seed);
    const name = `${SURNAMES[Math.floor(rand() * SURNAMES.length)]}${NAMES[Math.floor(rand() * NAMES.length)]}`;

    const realmTier = tier === 1 ? 'QiRefinement' :
      tier === 2 ? 'Foundation' :
      tier >= 3 ? (rand() < 0.5 ? 'Foundation' : 'GoldenCore') : 'QiRefinement';

    // subLevel 按境界上限收敛：炼气 1..9，筑基/金丹 1..3（对齐 RealmFullPath 契约）
    const subLevel = 1 + Math.floor(rand() * (realmTier === 'QiRefinement' ? 9 : 3));

    // 属性随境界成长（同境界内仍有浮动）
    const attributes = {
      physique: 3 + tier + Math.floor(rand() * (8 + tier)),
      comprehension: 3 + tier + Math.floor(rand() * (8 + tier)),
      perception: 3 + tier + Math.floor(rand() * (8 + tier)),
      agility: 3 + tier + Math.floor(rand() * (8 + tier)),
      luck: 1 + Math.floor(rand() * (6 + tier)),
      charm: 3 + tier + Math.floor(rand() * (8 + tier)),
    };

    const baseHp = 100 + tier * 80 + attributes.physique * 5;

    // 灵根：品级随境界，五行 1-2 属，小概率变异（变异为单属性雷/冰/风/暗）
    const gradeTable = GRADE_TABLE[tier] ?? GRADE_TABLE[1] ?? [];
    const grade = gradeTable[Math.floor(rand() * 10)] ?? 'Yellow';
    const isVariant = rand() < 0.05;
    const elementCount = isVariant ? 1 : (rand() < 0.3 ? 2 : 1);
    const elementPool = isVariant ? VARIANT_ELEMENTS : FIVE_ELEMENTS;
    const elements = shuffle([...elementPool], rand).slice(0, Math.min(elementCount, elementPool.length)) as SpiritRoot['elements'];
    const spiritRoot: SpiritRoot = { grade, elements, isVariant };

    // 技能：按境界品质池挑 1-2 个（40% 概率带第二个）
    const qualityPool = SKILL_QUALITY_POOL[tier] ?? SKILL_QUALITY_POOL[1] ?? [];
    const skills: Skill[] = [];
    const firstSkill = pickSkill(rand, qualityPool);
    if (firstSkill) {
      skills.push(firstSkill);
      if (rand() < 0.4) {
        const second = pickSkill(rand, qualityPool);
        if (second && second.id !== firstSkill.id) skills.push(second);
      }
    }

    // 装备：tier≥2 概率携带五行元素武器（元素取灵根主属性，让克制生效）
    let weapon: Item | undefined;
    if (tier >= 2 && rand() < 0.4) {
      try {
        const item = ItemFactory.generateRandomItem({
          minTier: Math.max(1, tier - 1),
          maxTier: tier,
          preferredType: 'Equipment',
          rng: rand,
        });
        item.element = spiritRoot.elements[0] ?? 'Physical';
        weapon = item;
      } catch {
        weapon = undefined; // 模板库未加载时静默跳过装备
      }
    }

    return {
      id: `NPC_GEN_${seed}`,
      personalityId: resolvePersonalityId(`NPC_GEN_${seed}`),
      name,
      gender: rand() < 0.5 ? 'Male' : 'Female',
      realm: `${realmTier}_${subLevel}` as RealmFullPath,
      soulState: 'Active',
      cultivation: { currentExp: 0, maxExp: 500 * tier },
      lifespan: { age: 20 + Math.floor(rand() * 100), maxLifespan: 100 + tier * 100 },
      spiritEnergy: { current: 100 + tier * 50, max: 100 + tier * 50 },
      monthlyActionPoints: { current: 10, max: 10 },
      attributes,
      spiritRoot,
      gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
      hp: baseHp,
      maxHp: baseHp,
      ap: 3,
      canFly: tier >= 2,
      spiritStones: tier * 150 + Math.floor(rand() * 50),
      inventory: [],
      equipmentSlots: { weapon, armor: undefined, treasures: [] },
      skills,
      skillCooldowns: {},
      traits: [],
      relations: {},
      wantedLevels: {},
      unlockedRecipes: [],
    } as Character;
  }
}
