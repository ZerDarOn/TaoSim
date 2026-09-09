// ============================================================
// 可持久化世界相遇 — 途中接触不是 UI 弹窗，而是世界状态
// ============================================================

/** 首个垂直切片只实现道路上的真实具名 NPC 接触。 */
export type WorldEncounterKind = 'road_contact';
export type WorldEncounterStatus = 'awaiting_decision' | 'active' | 'resolved' | 'cancelled';
export type RoadEncounterIntent = 'greet' | 'challenge' | 'ambush';
export type PlayerEncounterChoice = 'talk' | 'avoid' | 'fight';

export interface WorldEncounterLocation {
  /** 两名旅行者共同经过的权威空间连接。 */
  linkId: string;
  /** 相遇点在连接规范方向上的进度，范围 0..1。 */
  progress: number;
  /** 供日志和场景定位使用的邻近节点。 */
  nodeId: string;
}

export interface ActiveWorldEncounter {
  encounterId: string;
  kind: WorldEncounterKind;
  status: WorldEncounterStatus;
  source: 'npc_intent';
  intent: RoadEncounterIntent;
  initiatorNpcId: string;
  playerId: string;
  participantIds: string[];
  occursAtMinutes: number;
  location: WorldEncounterLocation;
  /** 相遇创建时冻结的旅行代次，用于阻止旧选择误操作重规划后的行程。 */
  travelGenerations: Record<string, number>;
  availableChoices: PlayerEncounterChoice[];
  chosen?: PlayerEncounterChoice;
  resolvedAtMinutes?: number;
  startFactId: string;
  resolutionFactId?: string;
}

export type WorldEncounterChange =
  | { type: 'upsert'; encounter: ActiveWorldEncounter }
  | { type: 'remove'; encounterId: string };
