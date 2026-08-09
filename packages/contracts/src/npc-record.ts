// ============================================================
// NPC 持久化档案 — 世界涌现叙事设计 §3.2
//
// 世界 NPC 以"精简档案"形式存入 WorldState.npcs（跨推进/跨会话持久），
// 需要完整 Character（战斗/交互）时再按需展开。
// ============================================================

import type { RealmFullPath, SoulState, SpiritRoot, Gender } from './character.js';
import type { SkillElement } from './skill.js';

/** 命格层级：普通 / 英才 / 天骄 / 传奇（决定初始潜质，命运由事件写出） */
export type DestinyTier = 'common' | 'talented' | 'prodigy' | 'legendary';

/** 出身：影响初始事件与隐藏剧情（参考《了不起的修仙模拟器》） */
export interface NpcOrigin {
  type: '散修' | '世家' | '宗门' | '遗孤';
  backgroundStoryId?: string;
}

/** 命格（气运之子）：出生定潜质，不写死命运 */
export interface NpcDestiny {
  tier: DestinyTier;
  /** 加权奇遇/突破/死劫概率，0-100 */
  luck: number;
  /** 前期不暴露，事件中逐渐显露 */
  hidden: boolean;
  /** 江湖绰号（"云中仙"），major 事件积累后授予 */
  epithet?: string;
}

export type RelationType =
  | 'master-disciple' | 'spouse' | 'dao-companion' | 'friend'
  | 'rival' | 'enemy' | 'clan' | 'benefactor' | 'debtor';

/** 关系条目：事件沉淀型（由共同经历演化，非数值刷出） */
export interface RelationEntry {
  type: RelationType;
  /** -100..100（爱恨） */
  bond: number;
  /** 0..100 */
  trust: number;
  /** 关系事件链（结仇/报恩/倾心/背叛...） */
  events: string[];
  changedAt: { year: number; month: number };
  /** 师徒方向（仅 master-disciple 使用，归档时保留，展开时还原 tag） */
  direction?: 'master' | 'disciple';
}

/** 生平：引擎聚合关键节点 + 预留 AI 文学化增强 */
export interface NpcBiography {
  milestones: { eventId: string; year: number; month: number; title: string; realm: string }[];
  /** 引擎一句话概览 */
  summary: string;
  /** AI 文学化生平（增强层，不改事实） */
  narrative?: string;
}

export interface NpcRecord {
  id: string;
  name: string;
  gender: Gender;
  personalityId: string;
  origin: NpcOrigin;
  destiny: NpcDestiny;
  realm: RealmFullPath;
  soulState: SoulState;
  /** 修为进度（突破判定依据） */
  cultivation: { currentExp: number; maxExp: number };
  /** 当前所在地图节点 id（引用真实节点） */
  locationId?: string;
  factionId?: string;
  spiritRoot: SpiritRoot;
  attributes: {
    physique: number;
    comprehension: number;
    perception: number;
    agility: number;
    luck: number;
    charm: number;
  };
  lifespan: { age: number; maxLifespan: number };
  skillIds: string[];
  weaponElement?: SkillElement;
  /** 灵石积蓄（经济轨道 §2.2 / 坊市流动 §4.6；可选，老档案默认 0） */
  spiritStones?: number;

  // 出生与死亡（生平端点）
  birthYear: number;
  birthMonth: number;
  deathYear?: number;
  deathMonth?: number;
  causeOfDeath?: string;

  relations: Record<string, RelationEntry>;
  biography: NpcBiography;
  lastUpdate: { year: number; month: number };
}
