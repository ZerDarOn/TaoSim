// ============================================================
// NPC 持久化档案 — 世界涌现叙事设计 §3.2
//
// 世界 NPC 以"精简档案"形式存入 WorldState.npcs（跨推进/跨会话持久），
// 需要完整 Character（战斗/交互）时再按需展开。
// ============================================================

import type { RealmFullPath, SoulState, SpiritRoot, Gender } from './character.js';
import type { SkillElement } from './skill.js';

/** 先天出身（因）：决定出生起点——只塑造面板与初始条件，不提供任何概率加成（机制特权禁止） */
export type BornOrigin = 'mortal' | 'fortune' | 'reincarnated' | 'inherited';

/** 事迹认定层级（果）：天骄/传奇是"做到之后"被世界记下的标签，出生一律 common */
export type DestinyTier = 'common' | 'talented' | 'prodigy' | 'legendary';

/** 出身：影响初始事件与隐藏剧情（参考《了不起的修仙模拟器》） */
export interface NpcOrigin {
  type: '散修' | '世家' | '宗门' | '遗孤';
  backgroundStoryId?: string;
}

/** 命格：先天出身（因，塑造起点）+ 事迹认定（果，由做到的事升级）——因果不倒置 */
export interface NpcDestiny {
  /**
   * 事迹认定层级（果）：出生一律 common；由 major 事迹累计升级
   * （英才→天骄→传奇），升级伴随 npc.legend 事件——"先做到，后成名"。
   */
  tier: DestinyTier;
  /**
   * 先天出身（因）：气运之子 / 大能转世 / 逆天传承 / 平凡。
   * 只影响出生时的面板属性与初始条件（luck、悟性、灵石、功法），
   * 之后的世界演化完全由面板与世界经历驱动——无任何机制概率特权。
   */
  born: BornOrigin;
  /** 加权奇遇/突破/死劫概率，0-100（面板因果：气运高者事顺） */
  luck: number;
  /** 前期不暴露，事件中逐渐显露 */
  hidden: boolean;
  /** 江湖绰号（"云中仙"），major 事件积累后授予 */
  epithet?: string;
}

export type RelationType =
  | 'master-disciple' | 'spouse' | 'dao-companion' | 'friend'
  | 'rival' | 'enemy' | 'clan' | 'benefactor' | 'debtor';

/**
 * 道途志向（动机）：驱动 NPC 自主行为的"缺口"——由出生心性随机 + 经历塑形
 * （复仇得手→志向转迁；寿元将尽→转求寿/传道），不是出生定死的命运。
 */
export type NpcAspiration =
  | 'seekDao'         // 求道：追求更高境界（闭关/论道/访机缘）
  | 'seekFame'        // 求名：追求声望（行侠/大比/挑战强者）
  | 'seekLongevity'   // 求寿：延寿机缘
  | 'seekRevenge'     // 寻仇：深仇驱动（苦修变强后复仇）
  | 'seekPartner'     // 求缘：寻觅道侣（结道侣 → 双修 → 子嗣）
  | 'seekSuccessor'   // 传道：寿元将尽，寻传承（收徒传道统）
  | 'wander';         // 逍遥：云游四方（无特定志向）

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
  /** 所属宗门 id（引用 Faction） */
  factionId?: string;
  /** 宗门内身份（社会轨道 §2.2：入宗→弟子→长老→宗主；可选，散修无） */
  socialRank?: 'disciple' | 'elder' | 'sectMaster';
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
  /** 装备战斗加成（武器/防具/法宝词条汇总，§战斗：寻仇斗法真实战力基准；可选，无装备默认无） */
  combatGear?: { attack: number; defense: number; critRate: number };
  /** 灵石积蓄（经济轨道 §2.2 / 坊市流动 §4.6；可选，老档案默认 0） */
  spiritStones?: number;

  // 出生与死亡（生平端点）
  birthYear: number;
  birthMonth: number;
  deathYear?: number;
  deathMonth?: number;
  causeOfDeath?: string;

  // ── 自主性（§4.13 需求状态机：行为由缺口驱动，非每月纯概率）──
  /** 道途志向：出生心性随机 + 经历塑形，驱动本月行为 */
  aspiration?: NpcAspiration;
  /** 道侣 id（结为道侣 → 双修 → 子嗣） */
  spouseId?: string;
  /** 子嗣 id（代际链：传承替代繁殖——修仙者以血脉/道统延续） */
  childrenIds?: string[];
  /** 父母 id（代际溯源） */
  parentIds?: string[];
  /** 道统 id（跨世代传承：师祖→师→徒，寿元将尽者传道统） */
  heritageLineId?: string;
  /** 生育冷却（防逐年生育刷屏） */
  childbearing?: { lastChildYear: number };

  relations: Record<string, RelationEntry>;
  biography: NpcBiography;
  lastUpdate: { year: number; month: number };

  // ── 空间与亲和（NPC 地图呈现设计 §spec 3.2/3.3.1）──
  /** 当前 hex 坐标（地图呈现；resident=场所对应格，wandering=移动中坐标） */
  hexPos?: { q: number; r: number };
  /** 移动状态机：驻留 / 游历 / 闭关 */
  moveState?: 'resident' | 'wandering' | 'secluded';
  /** 游历目标格（wandering 时；到达即归巢） */
  moveTarget?: { q: number; r: number };
  /** 闭关剩余月数（secluded 时递减，归零出关） */
  secludeMonths?: number;
  /** 兼容性种子（道缘/魔缘基底；出生时生成 [0,1)，与任意 NPC 的兼容性确定可算） */
  affinityMatrixSeed?: number;
}
