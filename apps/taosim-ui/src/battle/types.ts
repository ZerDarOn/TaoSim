import type { Skill } from '@taosim/contracts';

/** 战斗 UI 状态机阶段（设计文档 §5.1） */
export type BattleUIPhase =
  | 'idle'
  | 'command'
  | 'targeting-attack'
  | 'targeting-skill'
  | 'targeting-item'
  | 'moving'
  | 'executing';

/** 飘字事件（设计文档 §6.5） */
export interface FloatingText {
  id: number;
  q: number;
  r: number;
  text: string;
  kind: 'damage' | 'crit' | 'dodge' | 'block' | 'heal' | 'info';
}

/** 移动可达格（cost = 距起点的移动步数） */
export interface ReachableTile {
  q: number;
  r: number;
  cost: number;
}

/** 射程内可攻击目标格 */
export interface AttackTargetTile {
  q: number;
  r: number;
  characterId: string;
}
