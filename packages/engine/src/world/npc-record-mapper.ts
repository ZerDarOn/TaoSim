// ============================================================
// NpcRecord ↔ Character 转换器 — 世界涌现叙事设计 §3.2 / §9 风险对策"两层结构"
//
// 世界状态只存精简 NpcRecord（体积可控），
// 需要完整 Character（战斗/交互）时按需展开（遭遇时）。
// ============================================================

import type { Character, CharacterRelation, Item, NpcRecord, RelationEntry } from '@taosim/contracts';
import { SKILL_REGISTRY } from '../data/skill-registry.js';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import { computeDerivedStats } from '../character/derived-stats.js';

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
  // 装备只沉淀"战斗加成"（武器/防具/法宝词条汇总），全量物品不入档（体积可控）
  const gear = EquipmentManager.getCombatBonuses(c);
  const combatGear =
    gear.attack > 0 || gear.defense > 0 || gear.critRate > 0
      ? { attack: gear.attack, defense: gear.defense, critRate: gear.critRate }
      : undefined;
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
    destiny: { tier: 'common', born: 'mortal', luck: c.attributes.luck, hidden: true },
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
    combatGear,
    spiritStones: c.spiritStones,
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

/**
 * 装备加成 → 合成兵刃/防具/法宝（§战斗：寻仇斗法真实战力）。
 * 档案只存加成汇总，展开时按需还原成可装备 Item（战斗结算只看加成数值）。
 */
function combatGearToItems(rec: NpcRecord): Character['equipmentSlots'] {
  const gear = rec.combatGear;
  const weapon: Item | undefined =
    gear && gear.attack > 0
      ? {
          id: `gear_${rec.id}_weapon`,
          name: '随身兵刃',
          tier: realmTier(rec.realm),
          type: 'Equipment',
          attributes: { attack: gear.attack },
          element: rec.weaponElement,
        }
      : undefined;
  const armor: Item | undefined =
    gear && gear.defense > 0
      ? {
          id: `gear_${rec.id}_armor`,
          name: '护身法衣',
          tier: realmTier(rec.realm),
          type: 'Equipment',
          attributes: { defense: gear.defense },
        }
      : undefined;
  const treasure: Item | undefined =
    gear && gear.critRate > 0
      ? {
          id: `gear_${rec.id}_treasure`,
          name: '随身法宝',
          tier: realmTier(rec.realm),
          type: 'Equipment',
          attributes: { critRate: gear.critRate },
        }
      : undefined;
  return { weapon, armor, treasures: treasure ? [treasure] : [] };
}

/** 展开：NpcRecord → 完整 Character（战斗/交互所需，按需调用） */
export function npcRecordToCharacter(rec: NpcRecord): Character {
  const tier = realmTier(rec.realm);
  // P2：使用统一派生属性计算（取代散落的魔法数字）
  const derived = computeDerivedStats({
    realm: rec.realm,
    attributes: rec.attributes,
    spiritRoot: rec.spiritRoot,
    age: rec.lifespan.age,
    maxLifespan: rec.lifespan.maxLifespan,
  });
  const maxHp = derived.maxHp;
  const maxSpiritEnergy = derived.maxSpiritEnergy;
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
    equipmentSlots: combatGearToItems(rec),
    skills,
    skillCooldowns: {},
    traits: [],
    factionId: rec.factionId,
    personalityId: rec.personalityId,
    relations,
    spiritStones: rec.spiritStones ?? 0,
    wantedLevels: {},
    unlockedRecipes: [],
  };
}
