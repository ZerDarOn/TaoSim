import type { NpcIdentityProfile, NpcRecord } from '@taosim/contracts';

const ORIGIN_CULTURE: Readonly<Record<NpcRecord['origin']['type'], string>> = {
  '散修': 'wandering-cultivator',
  '世家': 'cultivation-clan',
  '宗门': 'sect-cultivator',
  '遗孤': 'rootless-survivor',
};

/**
 * 旧世界只有人族社会语义，因此迁移时只补人族基线，不凭空随机伪造异族身份。
 * 后续种族出生器可以直接写入完整 profile，而不需要改动大脑装配契约。
 */
export function deriveLegacyNpcIdentity(npc: Readonly<NpcRecord>): NpcIdentityProfile {
  const lineageIds = npc.heritageLineId
    ? [`heritage:${npc.heritageLineId}`]
    : npc.parentIds?.length
      ? [`family:${[...npc.parentIds].sort().join('+')}`]
      : [];
  const originType = npc.origin?.type ?? '散修';
  const cultureIds = [
    ORIGIN_CULTURE[originType],
    ...(npc.factionId ? [`faction:${npc.factionId}`] : []),
  ];
  const socialIdentityIds = [
    ...(npc.factionId ? ['faction-member'] : ['independent-cultivator']),
    ...(npc.socialRank ? [`rank:${npc.socialRank}`] : []),
    ...(npc.socialRank === 'elder' || npc.socialRank === 'sectMaster' ? ['law_enforcer'] : []),
  ];
  return {
    bodySpeciesId: 'human',
    soulOriginSpeciesId: 'human',
    lineageIds,
    cultureIds: [...new Set(cultureIds)].sort(),
    socialIdentityIds: [...new Set(socialIdentityIds)].sort(),
  };
}

export function ensureNpcIdentity(npc: NpcRecord): NpcIdentityProfile {
  npc.identity ??= deriveLegacyNpcIdentity(npc);
  return npc.identity;
}

export interface EcologicalIdentityResult {
  profile: NpcIdentityProfile;
  habitatLocationId?: string;
}

/**
 * 新散修的少量异族来源于东荒真实生态位；旧人物不随机改种族。
 * 数值只塑造身体起点，社会态度仍由文化、制度、关系和经历节点共同决定。
 */
export function assignEcologicalNpcIdentity(
  npc: NpcRecord,
  rng: () => number,
): EcologicalIdentityResult {
  const roll = rng();
  if (roll < 0.04) {
    npc.attributes.agility = Math.min(100, npc.attributes.agility + 4);
    npc.attributes.charm = Math.min(100, npc.attributes.charm + 4);
    npc.lifespan.maxLifespan += 50;
    return {
      profile: {
        bodySpeciesId: 'fox-spirit', soulOriginSpeciesId: 'fox-spirit',
        lineageIds: ['lineage:qingqiu-diaspora'],
        cultureIds: ['fox-clan', 'east-wilderness'],
        socialIdentityIds: ['independent-cultivator', 'shape-shifter'],
      },
      habitatLocationId: 'NODE_WILD_NORTH',
    };
  }
  if (roll < 0.06) {
    npc.attributes.physique = Math.min(100, npc.attributes.physique + 5);
    npc.lifespan.maxLifespan += 100;
    return {
      profile: {
        bodySpeciesId: 'wood-spirit', soulOriginSpeciesId: 'wood-spirit',
        lineageIds: ['lineage:east-ancient-grove'],
        cultureIds: ['forest-spirit', 'east-wilderness'],
        socialIdentityIds: ['independent-cultivator', 'natural-spirit'],
      },
      habitatLocationId: 'NODE_WILD_EAST',
    };
  }
  return { profile: deriveLegacyNpcIdentity(npc) };
}

/** 子嗣继承肉身种族、双方祖源与家庭文化；不把混血压成固定敌对标签。 */
export function inheritNpcIdentity(
  parentA: Readonly<NpcRecord>,
  parentB: Readonly<NpcRecord>,
  rng: () => number,
): NpcIdentityProfile {
  const identityA = parentA.identity ?? deriveLegacyNpcIdentity(parentA);
  const identityB = parentB.identity ?? deriveLegacyNpcIdentity(parentB);
  const bodySpeciesId = identityA.bodySpeciesId === identityB.bodySpeciesId
    ? identityA.bodySpeciesId
    : rng() < 0.5 ? identityA.bodySpeciesId : identityB.bodySpeciesId;
  const familyLineageId = `family:${[parentA.id, parentB.id].sort().join('+')}`;
  return {
    bodySpeciesId,
    soulOriginSpeciesId: bodySpeciesId,
    lineageIds: [...new Set([
      ...identityA.lineageIds, ...identityB.lineageIds, familyLineageId,
    ])].sort(),
    cultureIds: [...new Set([
      ...identityA.cultureIds, ...identityB.cultureIds, 'cultivation-clan',
    ])].sort(),
    socialIdentityIds: ['clan-member', ...(parentA.factionId || parentB.factionId ? ['faction-member'] : [])],
  };
}
