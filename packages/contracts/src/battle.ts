// ============================================================
// Battle 契约 — Battle System v2
// ============================================================
import type { Character } from './character.js';
import type { SkillElement } from './skill.js';
import type { HexBattleMap } from './hex.js';
import type { ItemStack } from './item.js';

export type { SkillElement } from './skill.js';
export type { TargetFilter } from './skill.js';

export type SkillShape = 'Single' | 'Line' | 'AOE' | 'Cone' | 'Self' | 'Move';

export type StatusType =
  | 'Poison' | 'Burn' | 'Frost' | 'Stun' | 'Slow'
  | 'ArmorBreak' | 'BarrierBreak' | 'AtkUp' | 'DefUp' | 'SpeedUp'
  | 'Bind' | 'Shield' | 'Regen' | 'SoulWeaken'
  | 'ManaShield' | 'PerceptionUp' | 'SoulDrain'
  | 'Invincible' | 'BloodRage'
  // —— S6 扩展：skill-registry 实际使用但旧契约未涵盖的状态 ——
  | 'Freeze' | 'Frozen' | 'Paralyze' | 'AttackUp' | 'PhysiqueUp' | 'ArmorPassive';

export interface StatusEffectTemplate {
  id: string;
  type: StatusType;
  potency: number;
  duration: number;
}

export interface BattleStatus {
  id: string;
  type: StatusType;
  potency: number;
  remainingTurns: number;
  sourceId?: string;
}

export interface BattleUnit {
  characterId: string;
  team: 'Player' | 'Enemy';
  controller: 'Human' | 'AI';
  gauge: number;                       // ATB 0-100
  actionReady: boolean;
  actionPoints: number;                // 战斗副本中的当前 AP
  maxActionPoints: number;
  movePoints: number;                  // 本次 activation 剩余移动池
  maxMovePoints: number;
  statuses: BattleStatus[];            // 仅存在于战斗态，不污染 Character/存档
  charging?: { skillId: string; releaseAtTick: number; targetIds: string[] };
  guarding?: { element: SkillElement; tier: number; expiresAtActivation: number };
}

export interface BattleEvent {
  sequence: number;
  tickNumber: number;
  type: string;                        // 实现时收紧为事件判别联合
  actorId?: string;
  targetIds?: string[];
  data: Record<string, string | number | boolean>;
}

export type BattleCommand =
  | { type: 'AdvanceTick' }
  | { type: 'Move'; actorId: string; to: { q: number; r: number } }
  | { type: 'BasicAttack'; actorId: string; targetId: string }
  | { type: 'UseSkill'; actorId: string; skillId: string; targetId: string }
  | { type: 'Guard'; actorId: string }
  | { type: 'Flee'; actorId: string }
  | { type: 'Surrender'; actorId: string }
  | { type: 'EndActivation'; actorId: string };

export type BattlePhase = 'Idle' | 'Running' | 'AwaitingCommand' | 'Resolving' | 'BattleEnd' | 'Looting';

/**
 * 战斗场景规则（S6）：把"战斗物理"与"UI 迷雾"分离。
 * - `allowWaterWalk`：场景允许步行过水（桥梁/冰面），否则只有 canFly 单位可越水
 * - `requireRevealed`：移动/施法目标格必须可见（战争迷雾场景），非迷雾战斗设 false
 * - `fleeEnabled`：场景是否允许逃跑（剧情战/渡劫可禁用）
 */
export interface BattleSceneConfig {
  allowWaterWalk?: boolean;
  requireRevealed?: boolean;
  fleeEnabled?: boolean;
  /** 是否允许投降；生死伏击可关闭，切磋通常开启。 */
  surrenderEnabled?: boolean;
}

/** 启动时的控制权分配；未指定时沿用 Player=Human、Enemy=AI。 */
export interface BattleStartOptions {
  controllers?: Record<string, 'Human' | 'AI'>;
  /** 场景先手差量；用于已由世界规则结算成功的伏击等，不代表自动命中或自动胜利。 */
  initialGaugeById?: Record<string, number>;
}

/**
 * 原子解释器统一返回类型（S6）：五类 AtomicNode 的执行结果。
 * - `appliedTo`：实际被影响的单位 ID 列表（AOE 时多于一个）
 * - `mutatedTiles`：被改变的格子坐标（TerrainMutate 专用）
 * - `logs`：人类可读的执行日志（供事件流/BattleEvent）
 */
export interface AtomicResolution {
  appliedTo: string[];
  mutatedTiles: Array<{ q: number; r: number }>;
  logs: string[];
}

export interface BattleState {
  battleId: string;
  map: HexBattleMap;
  units: Record<string, BattleUnit>;
  characters: Record<string, Character>;   // 战斗中可变深副本
  currentTurnId: string | null;
  events: BattleEvent[];                   // 有上限的事件快照
  phase: BattlePhase;
  tickNumber: number;
  turnNumber: number;
  winner: 'Player' | 'Enemy' | null;
  lootPool: LootEntry[];
  /** 场景规则（S6）；undefined 时按旧默认：水域不可步行、不要求可见、允许逃跑 */
  sceneConfig?: BattleSceneConfig;
  /** 逃跑结果（S6）：玩家成功逃跑后置为 'Fled'，胜方仍为 null */
  fled?: boolean;
  /** 逃跑者；兼容旧 fled 布尔值，同时允许任意阵营逃跑。 */
  fledBy?: string;
  /** 投降者。 */
  surrenderedBy?: string;
  /** 战斗真正结束的原因；后台与 UI 共享。 */
  endReason?: 'elimination' | 'flee' | 'surrender';
}

export type NamedEncounterKind = 'duel' | 'deadly';
export type NamedBattleTermination = 'elimination' | 'flee' | 'surrender' | 'stalemate';

/** 可持久引用的具名遭遇上下文；不包含可重建的 Character 战斗副本。 */
export interface NamedEncounterContext {
  encounterId: string;
  kind: NamedEncounterKind;
  seed: number;
  locationId: string;
  startedAt: { year: number; month: number };
  sideAIds: string[];
  sideBIds: string[];
  maxTicks: number;
  /** 遭遇如何发生；仅保存已被世界规则确认的入口条件。 */
  approach?: 'open' | 'ambush';
  /** 伏击是否在入战前被目标察觉。 */
  ambushDetected?: boolean;
  /** 已结算的初始 ATB，保证遭遇上下文可重放。 */
  initialGaugeById?: Record<string, number>;
}

export interface NamedBattleParticipantResult {
  entityId: string;
  side: 'A' | 'B';
  hpAfter: number;
  maxHp: number;
  spiritEnergyAfter: number;
  result: 'active' | 'down' | 'fled' | 'surrendered';
}

/** 同一战斗内核在 UI 与后台均产出的结构化结果。 */
export interface NamedBattleResolution {
  encounterId: string;
  battleId: string;
  termination: NamedBattleTermination;
  winnerSide: 'A' | 'B' | null;
  participants: NamedBattleParticipantResult[];
  tickNumber: number;
  turnNumber: number;
  eventCount: number;
  reachedTickLimit: boolean;
}

export interface LootEntry {
  enemyId: string;
  enemyName: string;
  items: ItemStack[];
  spiritStones: number;
  revealed: boolean;
  claimed: boolean;
}

export interface BattleDelta {
  battleId: string;
  baseRevision: number;
  characterId: string;
  hpAfter: number;
  spiritEnergyAfter: number;
  apAfter: number;
  skillCooldownsAfter: Record<string, number>;
  consumedItems: Array<{ itemId: string; count: number }>;
  rewards: { cultivationExp: number; spiritStones: number; items: ItemStack[] };
  relationChanges: Array<{ targetId: string; favorabilityDelta: number }>;
}
