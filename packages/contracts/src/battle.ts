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
  | 'Invincible' | 'BloodRage';

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
  | { type: 'Guard'; actorId: string }
  | { type: 'EndActivation'; actorId: string };

export type BattlePhase = 'Idle' | 'Running' | 'AwaitingCommand' | 'Resolving' | 'BattleEnd' | 'Looting';

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
