// ============================================================
// NpcRecord ↔ Character 转换器 — 世界涌现叙事设计 §3.2 / §9 风险对策"两层结构"
//
// 世界状态只存精简 NpcRecord（体积可控），
// 需要完整 Character（战斗/交互）时按需展开（遭遇时）。
// ============================================================

import type { Character, CharacterRelation, NpcRecord, RelationEntry } from '@taosim/contracts';
import { SKILL_REGISTRY } from '../data/skill-registry.js';

/** 按境界档位推导 tier（1-5），用于数值换算 */
export function realmTier(realm: string): number {
  if (realm.startsWith('SoulFormation')) return 5;
  if (realm.startsWith('NascentSoul')) return 4;
  if (realm.startsWith('GoldenCore')) return 3;
  if (realm.startsWith('Foundation')) return 2;
  return 1;
}

/** 归档：Character → 精简 NpcRecord（丢弃战斗态/库存等可再生成字段） */
export function characterToNpcRecord(
  c: Character,
  currentYear: number,
  currentMonth: number,
): NpcRecord {
  const relations: Record<string, RelationEntry> = {};
  for (const [targetId, rel] of Object.entries(c.relations ?? {})) {
    relations[targetId] = {
      type: relationTypeFromTags(rel.tags),
      bond: rel.favorability,
      trust: 50,
      events: [],
      changedAt: { year: currentYear, month: currentMonth },
      direction: rel.tags.includes('Master')
        ? 'master'
        : rel.tags.includes('Disciple')
          ? 'disciple'
          : undefined,
    };
  }
  return {
    id: c.id,
    name: c.name,
    gender: c.gender,
    personalityId: c.personalityId ?? 'neutral',
    origin: { type: '散修' },
    destiny: { tier: 'common', luck: c.attributes.luck, hidden: true },
    realm: c.realm,
    soulState: c.soulState,
    cultivation: { ...c.cultivation },
    locationId: undefined,
    factionId: c.factionId,
    spiritRoot: c.spiritRoot,
    attributes: { ...c.attributes },
    lifespan: { ...c.lifespan },
    skillIds: c.skills.map(s => s.id),
    weaponElement: c.equipmentSlots.weapon?.element,
    birthYear: currentYear,
    birthMonth: currentMonth,
    relations,
    biography: { milestones: [], summary: '' },
    lastUpdate: { year: currentYear, month: currentMonth },
  };
}

function relationTypeFromTags(tags: string[]): RelationEntry['type'] {
  if (tags.includes('TaoistPartner')) return 'dao-companion';
  if (tags.includes('Master') || tags.includes('Disciple')) return 'master-disciple';
  if (tags.includes('Enemy')) return 'enemy';
  if (tags.includes('Kinsman')) return 'clan';
  return 'friend';
}

function relationTagsFromType(type: RelationEntry['type'], direction?: 'master' | 'disciple'): CharacterRelation['tags'] {
  switch (type) {
    case 'dao-companion':
      return ['TaoistPartner'];
    case 'master-disciple':
      return direction === 'disciple' ? ['Disciple'] : ['Master'];
    case 'enemy':
      return ['Enemy'];
    case 'clan':
      return ['Kinsman'];
    default:
      return [];
  }
}

/** 展开：NpcRecord → 完整 Character（战斗/交互所需，按需调用） */
export function npcRecordToCharacter(rec: NpcRecord): Character {
  const tier = realmTier(rec.realm);
  const maxHp = 100 + tier * 80 + rec.attributes.physique * 5;
  const maxSpiritEnergy = 100 + tier * 50;
  const skills = rec.skillIds
    .map(id => SKILL_REGISTRY.find(s => s.id === id))
    .filter((s): s is NonNullable<typeof s> => s !== undefined);

  const relations: Record<string, CharacterRelation> = {};
  for (const [targetId, entry] of Object.entries(rec.relations)) {
    relations[targetId] = {
      targetId,
      favorability: entry.bond,
      hatred: entry.bond < 0 ? -entry.bond : 0,
      jealousy: 0,
      tags: relationTagsFromType(entry.type, entry.direction),
    };
  }

  return {
    id: rec.id,
    name: rec.name,
    gender: rec.gender,
    realm: rec.realm,
    soulState: rec.soulState,
    cultivation: { ...rec.cultivation },
    lifespan: { ...rec.lifespan },
    spiritEnergy: { current: maxSpiritEnergy, max: maxSpiritEnergy },
    monthlyActionPoints: { current: 3, max: 3 },
    attributes: { ...rec.attributes },
    spiritRoot: rec.spiritRoot,
    gameMode: { breakthrough: 'Simple', saveMode: 'Free' },
    hp: maxHp,
    maxHp,
    ap: 2,
    canFly: tier >= 3,
    inventory: [],
    equipmentSlots: { weapon: undefined, armor: undefined, treasures: [] },
    skills,
    skillCooldowns: {},
    traits: [],
    factionId: rec.factionId,
    personalityId: rec.personalityId,
    relations,
    spiritStones: 0,
    wantedLevels: {},
    unlockedRecipes: [],
  };
}
