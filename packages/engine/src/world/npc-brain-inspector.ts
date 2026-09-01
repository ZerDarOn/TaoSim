import type { BrainState, WorldState } from '@taosim/contracts';
import { createDefaultNpcBrainNodeRegistry } from './npc-brain-node-registry.js';
import {
  DEFAULT_NPC_BRAIN_SATISFACTION_THRESHOLD,
  evaluateNpcBrainShadow,
  type NpcBrainShadowDecision,
} from './npc-brain-shadow-scheduler.js';

export interface NpcBrainInspection {
  npcId: string;
  at: { year: number; month: number };
  decision: NpcBrainShadowDecision;
  disabledNodeIds: string[];
  beliefCount: number;
  memoryCount: number;
}

/** 只读重算当前决策，用于观察器；不提交行动，也不把玩家关注写回 NPC 命运。 */
export function inspectNpcBrain(world: Readonly<WorldState>, npcId: string): NpcBrainInspection | undefined {
  const npc = world.npcs[npcId];
  if (!npc?.brain) return undefined;
  const at = { year: world.currentYear, month: world.currentMonth };
  return {
    npcId,
    at,
    decision: evaluateNpcBrainShadow(npc, npc.brain, {
      now: at,
      registry: createDefaultNpcBrainNodeRegistry(),
      condition: world.conditions?.[npcId],
      satisfactionThreshold: DEFAULT_NPC_BRAIN_SATISFACTION_THRESHOLD,
    }),
    disabledNodeIds: [...(npc.brain.disabledNodeIds ?? [])].sort(),
    beliefCount: Object.keys(npc.brain.beliefs).length,
    memoryCount: npc.brain.memories.length,
  };
}

/** 上帝模式节点开关：只改变可用手段，保留动机、目标、计划、认知和记忆。 */
export function setNpcBrainNodeEnabled(
  world: WorldState,
  npcId: string,
  nodeId: string,
  enabled: boolean,
): BrainState {
  const npc = world.npcs[npcId];
  if (!npc?.brain) throw new Error(`NPC ${npcId} 没有可用的大脑档案`);
  const registry = createDefaultNpcBrainNodeRegistry();
  if (!registry.get(nodeId)) throw new Error(`未知大脑节点 ${nodeId}`);
  const disabled = new Set(npc.brain.disabledNodeIds ?? []);
  if (enabled) disabled.delete(nodeId);
  else disabled.add(nodeId);
  npc.brain = {
    ...npc.brain,
    revision: npc.brain.revision + 1,
    disabledNodeIds: [...disabled].sort(),
  };
  return npc.brain;
}
