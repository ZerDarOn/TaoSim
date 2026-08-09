// ============================================================
// 需求状态机（世界涌现叙事设计 §4.13 自主性）— 纯函数，可测试、可复现
//
// 修仙人情化：NPC 不是由饥饿/幸福驱动的动物，而是由"缺口"驱动的修士——
// 寿元 / 仇恨 / 孤独 / 道途 / 传承压力 → 意向性行为（行为槽），
// 替代"每月对所有人机械掷骰"的被动涌现（对照 WorldBox 需求驱动）。
//
// 志向（aspiration）：由出生心性（personalityId）随机 + 经历塑形
// （复仇得手→转求道；寿元将尽→求寿/传道），不是出生定死的命运。
// 本模块只做"缺口计算 → 行为选择"，行为执行（寻仇斗法/结道侣/传道统）
// 由 WorldEngine 的行为槽执行（需全量 NPC 上下文，见 world-engine.step）。
// ============================================================

import type { NpcAspiration, NpcRecord } from '@taosim/contracts';
import type { Rng } from './world-tick-rules.js';

/** 月度主导行为（行为槽：动机缺口 → 意向性行为） */
export type MotivatedBehaviorType =
  | 'seclude'      // 闭关苦修：冲关/蓄力（求道者用功加倍，无事件噪音）
  | 'seekWonder'   // 访缘：主动寻觅机缘（求道破关 / 求寿延年）
  | 'revenge'      // 寻仇：挑战仇敌（深仇驱动；实力未足则苦修蓄势）
  | 'courtship'    // 求偶：寻觅道侣（孤独驱动 → 结道侣 → 双修 → 子嗣）
  | 'teach'        // 传道：收徒传道统（传承压力，寿元将尽者）
  | 'wander';      // 云游：闯荡四方（逍遥/扬名）

export interface MotivatedBehavior {
  type: MotivatedBehaviorType;
}

/** 缺口压力（0..1，越大越紧迫）——驱动行为的"缺口"，而非生理需求 */
export interface MotivationPressures {
  /** 寿元压力：年龄/寿元比（修仙与时间赛跑，最硬的约束） */
  longevity: number;
  /** 仇恨压力：最恨之敌的恨意（深仇驱动复仇） */
  grudge: number;
  /** 孤独压力：无道侣且年岁渐长（求缘） */
  loneliness: number;
  /** 道途压力：修为逼近/卡在境界瓶颈（求道者受困，需破关机缘） */
  dao: number;
  /** 传承压力：寿元将尽且无传人（道统传承） */
  succession: number;
}

/** 是否已有传人（拜入自己门下的弟子——师门师徒或道统传人均算） */
export function hasHeritageDisciple(npc: NpcRecord): boolean {
  return Object.values(npc.relations).some(
    (rel) => rel.type === 'master-disciple' && rel.direction === 'disciple',
  );
}

/** 计算缺口压力（纯函数，零 rng） */
export function motivationPressuresOf(npc: NpcRecord): MotivationPressures {
  const longevity = Math.min(1, npc.lifespan.age / npc.lifespan.maxLifespan);
  let grudge = 0;
  for (const rel of Object.values(npc.relations)) {
    if ((rel.type === 'enemy' || rel.type === 'rival') && rel.bond < 0) {
      grudge = Math.max(grudge, -rel.bond / 60); // bond -60 → 满压
    }
  }
  const loneliness = npc.spouseId !== undefined ? 0 : Math.min(1, Math.max(0, (npc.lifespan.age - 30) / 80));
  const dao = npc.cultivation.maxExp > 0
    ? Math.min(1, npc.cultivation.currentExp / npc.cultivation.maxExp)
    : 1;
  const succession = longevity > 0.85 && !hasHeritageDisciple(npc) ? (longevity - 0.85) / 0.15 : 0;
  return { longevity, grudge: Math.min(1, grudge), loneliness, dao, succession };
}

/** 心性 → 志向池（出生心性随机：第一顺位最贴合其性格，后位为性格另一面/意外） */
const PERSONALITY_ASPIRATION: Record<string, NpcAspiration[]> = {
  PERSONALITY_GENEROUS: ['seekPartner', 'seekFame', 'seekDao'],
  PERSONALITY_CUNNING: ['seekRevenge', 'seekFame', 'seekDao'],
  PERSONALITY_ARROGANT: ['seekFame', 'seekDao', 'seekRevenge'],
  PERSONALITY_GENTLE: ['seekPartner', 'seekDao', 'wander'],
  PERSONALITY_ERRATIC: ['wander', 'seekDao', 'seekLongevity'],
  PERSONALITY_COLD: ['seekDao', 'seekRevenge', 'wander'],
  PERSONALITY_HOT_BLOODED: ['seekFame', 'seekRevenge', 'seekPartner'],
  PERSONALITY_SLY: ['seekFame', 'seekPartner', 'seekRevenge'],
  PERSONALITY_RIGHTEOUS: ['seekRevenge', 'seekFame', 'seekDao'],
  PERSONALITY_RECLUSIVE: ['seekDao', 'seekRevenge', 'wander'],
};

/** 未知性格兜底池（中性：道途最重，逍遥次之） */
const DEFAULT_ASPIRATION_POOL: NpcAspiration[] = [
  'seekDao', 'wander', 'seekFame', 'seekPartner', 'seekRevenge', 'seekLongevity', 'seekSuccessor',
];

/** 初生志向：心性随机 + 寿元约束优先（寿元将尽者先求寿/传道，最硬约束优先） */
export function rollInitialAspiration(npc: NpcRecord, rng: Rng): NpcAspiration {
  const p = motivationPressuresOf(npc);
  if (p.longevity > 0.9) return 'seekSuccessor';
  if (p.longevity > 0.75) return 'seekLongevity';
  const pool = PERSONALITY_ASPIRATION[npc.personalityId] ?? DEFAULT_ASPIRATION_POOL;
  return pool[Math.floor(rng() * pool.length)] ?? 'seekDao';
}

/**
 * 志向塑形（每月演化，零 rng）：经历改变执念——
 * - 寿元将尽：先求寿（七成寿）→ 后传道（九成寿，最硬约束）
 * - 寻仇者：仇已淡/仇人已逝（无 enemy）→ 转求道
 * - 求缘者：已结道侣 → 转求道
 * - 传道者：已有传人 → 转求道（了却心愿）
 */
export function evolveAspiration(npc: NpcRecord): NpcAspiration {
  const p = motivationPressuresOf(npc);
  const current = npc.aspiration ?? 'seekDao';
  if (p.longevity > 0.9) return 'seekSuccessor';
  if (p.longevity > 0.75 && current !== 'seekSuccessor') return 'seekLongevity';
  switch (current) {
    case 'seekRevenge':
      return p.grudge <= 0 ? 'seekDao' : 'seekRevenge';
    case 'seekPartner':
      return npc.spouseId !== undefined ? 'seekDao' : 'seekPartner';
    case 'seekSuccessor':
      return hasHeritageDisciple(npc) ? 'seekDao' : 'seekSuccessor';
    default:
      return current;
  }
}

/** 行为选择（零 rng）：志向 × 缺口压力 → 本月主导行为槽 */
export function chooseBehavior(npc: NpcRecord): MotivatedBehavior {
  const p = motivationPressuresOf(npc);
  switch (npc.aspiration ?? 'seekDao') {
    case 'seekRevenge':
      // 深仇驱动：有仇可寻则出手（实力不足由引擎判定蓄势）；无仇则苦修蓄力
      return { type: p.grudge > 0 ? 'revenge' : 'seclude' };
    case 'seekPartner':
      return { type: 'courtship' };
    case 'seekSuccessor':
      return { type: 'teach' };
    case 'seekLongevity':
      return { type: 'seekWonder' }; // 访延寿机缘
    case 'seekFame':
      return { type: 'wander' };     // 闯荡江湖，行侠扬名
    case 'wander':
      return { type: 'wander' };
    case 'seekDao':
    default:
      // 求道者：修为逼近/卡关 → 访机缘破关；否则闭关苦修
      return { type: p.dao >= 0.8 ? 'seekWonder' : 'seclude' };
  }
}