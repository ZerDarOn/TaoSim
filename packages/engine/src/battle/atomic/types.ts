// ============================================================
// 原子解释器共享类型（S6）
// 五类 AtomicNode 解释器共用：
//   - AtomicContext：引擎只读视图 + 本次施法上下文
//   - AtomicFailure：解释失败的结构化原因（非法组合/参数缺失）
//   - interpretAtomic：统一入口，按 category 分发
// ============================================================

import type { AtomicNode, Character, SkillElement } from '@taosim/contracts';
import type { BattleUnit, BattleStatus } from '@taosim/contracts';
import type { HexBattleMap } from '@taosim/contracts';

/**
 * 原子解释器上下文：五类解释器都从这里读"世界状态"。
 * - `actor` / `primaryTarget`：本次施法的发起者和主目标
 * - `map`：战场地图（AOE/寻路/TerrainMutate 需要）
 * - `units` / `characters`：战斗中的所有单位与角色（可变引用，解释器直接修改）
 * - `rng`：确定性随机源
 * - `turnNumber`：当前回合号（状态施加/过期判定使用）
 * - `element`：本次技能的元素（Numeric 元素交互需要）
 * - `tier`：本次技能的阶位
 */
export interface AtomicContext {
  actor: Character;
  actorUnit: BattleUnit;
  primaryTargetId: string;
  map: HexBattleMap;
  units: Record<string, BattleUnit>;
  characters: Record<string, Character>;
  rng: () => number;
  turnNumber: number;
  element: SkillElement;
  tier: number;
}

/** 原子解释失败：返回结构化原因，引擎不得产生部分写入 */
export interface AtomicFailure {
  reason: string;
  /** 触发失败的原子 ID（便于日志/事件流定位） */
  nodeId?: string;
}

/** 状态施加请求（StatusHook 解释器产出，由引擎统一应用） */
export interface StatusApplication {
  targetId: string;
  status: BattleStatus;
}

/** 数值修改请求（Numeric 解释器产出，由引擎统一应用以避免重复结算） */
export interface NumericApplication {
  targetId: string;
  hpDelta?: number;           // 正为伤害，负为治疗
  spiritEnergyDelta?: number;
  shieldGain?: number;        // Shield 状态的护盾值
}

/** ATB 修改请求（TimeATB 解释器产出） */
export interface AtbApplication {
  targetId: string;
  gaugeDelta?: number;        // 正为加速，负为减速
  extraActionPoints?: number; // 额外 AP（立即生效）
}

/**
 * 单个原子解释的完整结果：引擎把这些 application 收集起来统一应用。
 * 这样解释器本身不直接改单位状态，便于：
 *   1. 失败时整体回滚（任一原子失败 = 整个技能失败）
 *   2. 测试时只看输入输出，不需要读引擎内部状态
 *   3. 同类原子的多次应用可以合并
 */
export interface AtomicResult {
  /** 实际被影响的单位 ID（AOE 多于一个） */
  appliedTo: string[];
  /** 被改变的格子坐标（TerrainMutate 专用） */
  mutatedTiles: Array<{ q: number; r: number }>;
  /** 收集的各类 application */
  statusApps: StatusApplication[];
  numericApps: NumericApplication[];
  atbApps: AtbApplication[];
  /** 人类可读的执行日志 */
  logs: string[];
}

/** 解释失败时的返回；引擎应立即中止本次技能施放 */
export type AtomicOutcome = AtomicResult | AtomicFailure;

export function isAtomicFailure(o: AtomicOutcome): o is AtomicFailure {
  return (o as AtomicFailure).reason !== undefined;
}

/** 空结果（用于没有副作用的 category，如 Geometry 只收集目标） */
export function emptyResult(): AtomicResult {
  return {
    appliedTo: [],
    mutatedTiles: [],
    statusApps: [],
    numericApps: [],
    atbApps: [],
    logs: [],
  };
}
