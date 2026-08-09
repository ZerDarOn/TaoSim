// ============================================================
// 开局传奇 NPC 生成器 — 世界涌现叙事设计 §7.4 "世界背景先行"
//
// 开局预生成若干高潜质/高境界 NPC（含简化生平与宗门恩怨），
// 让世界一开局就有沉淀，玩家初入江湖即可感知大人物存在。
// 采用确定性模板（非随机），保证世界背景可复现、可测试。
// ============================================================

import type { NpcDestiny, NpcOrigin, NpcRecord, RealmFullPath, RelationEntry, SkillElement, SpiritRoot } from '@taosim/contracts';
import { resolvePersonalityId } from '../data/npc-personalities.js';
import { SKILL_REGISTRY } from '../data/skill-registry.js';
import { realmExpThreshold } from './world-tick-rules.js';

/** 世界纪元开局时间（元年正月，与 initGame 初始状态一致） */
const WORLD_START = { year: 1, month: 1 };

/** 大境界寿元上限（年）：给足余寿，避免传奇 NPC 开局即坐化 */
const MAX_LIFESPAN_BY_REALM: Record<string, number> = {
  QiRefinement: 100,
  Foundation: 150,
  GoldenCore: 200,
  NascentSoul: 300,
  SoulFormation: 500,
};

/** 高品功法池（Di/Tian，且无反噬/烧寿元副作用 — NPC 不承受代价） */
const ELITE_SKILLS = SKILL_REGISTRY.filter(
  (s) => (s.quality === 'Di' || s.quality === 'Tian') && !s.backfire && !s.cost.lifespanDays,
);

/** 传奇 NPC 模板（生平/关系手工设定，保证叙事质量） */
interface LegendaryNpcSeed {
  id: string;
  name: string;
  gender: NpcRecord['gender'];
  realm: RealmFullPath;
  destinyTier: NpcDestiny['tier'];
  luck: number;
  epithet?: string;
  origin: NpcOrigin;
  /** 当前年龄（岁） */
  age: number;
  spiritRoot: SpiritRoot;
  attributes: NpcRecord['attributes'];
  weaponElement?: SkillElement;
  locationId: string;
  summary: string;
  milestone: { year: number; month: number; title: string };
  /** 关系事件时间统一取种子生平节点时间（changedAt 由 toNpcRecord 补齐） */
  relations: Record<string, Omit<RelationEntry, 'changedAt'>>;
}

/** 开局传奇 NPC 名单（含宗门恩怨：师徒 / 论道结怨 / 承恩） */
const LEGENDARY_SEEDS: LegendaryNpcSeed[] = [
  {
    id: 'LEGEND_1',
    name: '玄都真人',
    gender: 'Male',
    realm: 'SoulFormation_1',
    destinyTier: 'legendary',
    luck: 95,
    epithet: '雷霆上人',
    origin: { type: '宗门' },
    age: 180,
    spiritRoot: { grade: 'Heaven', elements: ['Thunder'], isVariant: true },
    attributes: { physique: 22, comprehension: 30, perception: 28, agility: 20, luck: 26, charm: 24 },
    weaponElement: 'Thunder',
    locationId: 'VENUE_QINGYUN_HALL',
    summary: '化神期太上长老，曾于东海独斩妖潮，庇护一方百年安宁。',
    milestone: { year: -120, month: 4, title: '东海独斩妖潮' },
    relations: {
      LEGEND_3: { type: 'master-disciple', bond: 60, trust: 80, events: ['开山授艺，剑道传承'], direction: 'master' },
      LEGEND_5: { type: 'friend', bond: 40, trust: 50, events: ['慧眼识珠，多有照拂'] },
    },
  },
  {
    id: 'LEGEND_2',
    name: '妙音仙子',
    gender: 'Female',
    realm: 'NascentSoul_3',
    destinyTier: 'legendary',
    luck: 92,
    epithet: '云中仙',
    origin: { type: '世家' },
    age: 120,
    spiritRoot: { grade: 'Heaven', elements: ['Water'], isVariant: false },
    attributes: { physique: 18, comprehension: 32, perception: 30, agility: 24, luck: 22, charm: 34 },
    weaponElement: 'Water',
    locationId: 'VENUE_TIANJI_TAVERN',
    summary: '世家出身的元婴仙子，琴音动九天，往来皆名宿。',
    milestone: { year: -75, month: 9, title: '一朝顿悟证元婴' },
    relations: {
      LEGEND_4: { type: 'rival', bond: -30, trust: 10, events: ['百年前论道争锋，至今互不相让'] },
    },
  },
  {
    id: 'LEGEND_3',
    name: '苍梧剑尊',
    gender: 'Male',
    realm: 'GoldenCore_3',
    destinyTier: 'prodigy',
    luck: 88,
    epithet: '焚天剑客',
    origin: { type: '散修' },
    age: 90,
    spiritRoot: { grade: 'Earth', elements: ['Metal'], isVariant: false },
    attributes: { physique: 26, comprehension: 28, perception: 24, agility: 30, luck: 20, charm: 20 },
    weaponElement: 'Metal',
    locationId: 'VENUE_QINGYUN_HALL',
    summary: '散修出身的一代剑修，快剑无双，如今为宗门客卿长老。',
    milestone: { year: -30, month: 6, title: '剑开天门，横扫同辈' },
    relations: {
      LEGEND_1: { type: 'master-disciple', bond: 60, trust: 80, events: ['拜师玄都真人'], direction: 'disciple' },
    },
  },
  {
    id: 'LEGEND_4',
    name: '幽兰仙子',
    gender: 'Female',
    realm: 'GoldenCore_2',
    destinyTier: 'talented',
    luck: 82,
    epithet: '红尘客',
    origin: { type: '宗门' },
    age: 70,
    spiritRoot: { grade: 'Earth', elements: ['Wood'], isVariant: false },
    attributes: { physique: 20, comprehension: 30, perception: 26, agility: 22, luck: 24, charm: 28 },
    weaponElement: 'Wood',
    locationId: 'VENUE_QINGYUN_TRAINING',
    summary: '宗门丹道魁首，一手炼丹术名动州郡。',
    milestone: { year: -22, month: 11, title: '丹道大会夺魁' },
    relations: {
      LEGEND_2: { type: 'rival', bond: -30, trust: 10, events: ['百年前论道争锋，至今互不相让'] },
    },
  },
  {
    id: 'LEGEND_5',
    name: '凌霄子',
    gender: 'Male',
    realm: 'Foundation_3',
    destinyTier: 'prodigy',
    luck: 90,
    origin: { type: '遗孤' },
    age: 25,
    spiritRoot: { grade: 'Heaven', elements: ['Fire'], isVariant: true },
    attributes: { physique: 24, comprehension: 34, perception: 30, agility: 28, luck: 26, charm: 26 },
    weaponElement: 'Fire',
    locationId: 'VENUE_TIANJI_TAVERN',
    summary: '少年天骄，身世成谜，传闻其灵根与上古剑仙一脉相承。',
    milestone: { year: -4, month: 8, title: '天骄初现，越阶败敌' },
    relations: {
      LEGEND_1: { type: 'benefactor', bond: 45, trust: 60, events: ['幼年蒙玄都真人指点，铭感于心'] },
    },
  },
];

/** 按 id 确定性挑选 n 门高品功法（同 id 同技能，可复现） */
function pickEliteSkills(id: string, count: number): string[] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const start = ((h % ELITE_SKILLS.length) + ELITE_SKILLS.length) % ELITE_SKILLS.length;
  const out: string[] = [];
  for (let i = 0; i < count && out.length < ELITE_SKILLS.length; i++) {
    const skill = ELITE_SKILLS[(start + i) % ELITE_SKILLS.length]!;
    if (!out.includes(skill.id)) out.push(skill.id);
  }
  return out;
}

/** 模板 → NpcRecord（补齐出生/修为/寿元/生平等派生字段） */
function toNpcRecord(seed: LegendaryNpcSeed): NpcRecord {
  const majorRealm = seed.realm.split('_')[0]!;
  const maxExp = realmExpThreshold(seed.realm);
  // 修为 60%~70% 阈值：有进取空间，但不至于开局数月即突破
  const currentExp = Math.round(maxExp * 0.65);
  return {
    id: seed.id,
    name: seed.name,
    gender: seed.gender,
    personalityId: resolvePersonalityId(seed.id),
    origin: seed.origin,
    destiny: { tier: seed.destinyTier, luck: seed.luck, hidden: false, epithet: seed.epithet },
    realm: seed.realm,
    soulState: 'Active',
    cultivation: { currentExp, maxExp },
    locationId: seed.locationId,
    spiritRoot: seed.spiritRoot,
    attributes: { ...seed.attributes },
    lifespan: { age: seed.age, maxLifespan: MAX_LIFESPAN_BY_REALM[majorRealm]! },
    skillIds: pickEliteSkills(seed.id, 3),
    weaponElement: seed.weaponElement,
    // 元年正月开局：出生年 = 1 - 年龄，月份取 1，保证 age 与 birthYear 自洽
    birthYear: WORLD_START.year - Math.round(seed.age),
    birthMonth: 1,
    // 关系事件时间：统一取生平节点时间（历史上早已结下的关系）
    relations: Object.fromEntries(
      Object.entries(seed.relations).map(([targetId, rel]) => [
        targetId,
        { ...rel, changedAt: { year: seed.milestone.year, month: seed.milestone.month } },
      ]),
    ),
    biography: {
      milestones: [{ eventId: `${seed.id}_M1`, year: seed.milestone.year, month: seed.milestone.month, title: seed.milestone.title, realm: seed.realm }],
      summary: seed.summary,
    },
    lastUpdate: { year: WORLD_START.year, month: WORLD_START.month },
  };
}

/** 生成开局传奇 NPC 档案列表（确定性模板，可复现、可测试） */
export function generateLegendaryNpcs(): NpcRecord[] {
  return LEGENDARY_SEEDS.map(toNpcRecord);
}
