import type {
  BrainState,
  BrainTime,
  NpcRecord,
  PersistentCondition,
} from '@taosim/contracts';

export type NpcBrainCapabilityId = 'cultivate' | 'seclude' | 'breakthrough' | 'wander' | 'revenge_ambush';

export interface NpcBrainNodeContext {
  npc: Readonly<NpcRecord>;
  brain: Readonly<BrainState>;
  now: BrainTime;
  condition?: Readonly<PersistentCondition>;
  activeGoalKind: string;
}

export interface NpcBrainScoreConsiderations {
  goalFit: number;
  opportunity: number;
  urgency: number;
  profileFit: number;
  riskCost: number;
  timeCost: number;
}

export interface NpcBrainNodeEvaluation {
  allowed: boolean;
  reasonCode?: string;
  reason?: string;
  considerations?: NpcBrainScoreConsiderations;
}

export interface NpcBrainNodeDefinition {
  nodeId: string;
  capabilityId: NpcBrainCapabilityId;
  category: 'cultivation' | 'exploration' | 'conflict';
  source: 'core';
  label: string;
  /** 满意选择的稳定考虑顺序；数值越小越先考虑。 */
  considerationOrder: number;
  cooldownMonths: number;
  evaluate(context: NpcBrainNodeContext): NpcBrainNodeEvaluation;
}

interface RegisteredNode {
  definition: NpcBrainNodeDefinition;
  enabled: boolean;
}

export class NpcBrainNodeRegistry {
  private readonly nodes = new Map<string, RegisteredNode>();

  register(definition: NpcBrainNodeDefinition, enabled = true): void {
    if (this.nodes.has(definition.nodeId)) {
      throw new Error(`NpcBrainNodeRegistry: 重复节点 ${definition.nodeId}`);
    }
    this.nodes.set(definition.nodeId, { definition, enabled });
  }

  get(nodeId: string): NpcBrainNodeDefinition | undefined {
    return this.nodes.get(nodeId)?.definition;
  }

  setEnabled(nodeId: string, enabled: boolean): void {
    const entry = this.nodes.get(nodeId);
    if (!entry) throw new Error(`NpcBrainNodeRegistry: 未知节点 ${nodeId}`);
    entry.enabled = enabled;
  }

  isEnabled(nodeId: string): boolean {
    return this.nodes.get(nodeId)?.enabled === true;
  }

  list(): ReadonlyArray<Readonly<RegisteredNode>> {
    return [...this.nodes.values()].sort((a, b) =>
      a.definition.considerationOrder - b.definition.considerationOrder
      || a.definition.nodeId.localeCompare(b.definition.nodeId));
  }
}

function cultivationRatio(npc: Readonly<NpcRecord>): number {
  if (npc.cultivation.maxExp <= 0) return 1;
  return Math.max(0, Math.min(1, npc.cultivation.currentExp / npc.cultivation.maxExp));
}

const cultivateNode: NpcBrainNodeDefinition = {
  nodeId: 'cultivate',
  capabilityId: 'cultivate',
  category: 'cultivation',
  source: 'core',
  label: '日常修炼',
  considerationOrder: 20,
  cooldownMonths: 0,
  evaluate({ npc, brain, activeGoalKind }) {
    const ratio = cultivationRatio(npc);
    if (ratio >= 1) {
      return { allowed: false, reasonCode: 'cultivation_full', reason: '修为已满，应考虑突破' };
    }
    return {
      allowed: true,
      considerations: {
        goalFit: activeGoalKind === 'cultivate_to_breakthrough'
          ? 100
          : activeGoalKind === 'build_reputation' && ratio < 0.6
            ? 90
            : 25,
        opportunity: 100 * (1 - ratio),
        urgency: brain.profile.valueWeights.dao,
        profileFit: brain.profile.behavioralBiases.patience,
        riskCost: 0,
        timeCost: 5,
      },
    };
  },
};

const secludeNode: NpcBrainNodeDefinition = {
  nodeId: 'seclude',
  capabilityId: 'seclude',
  category: 'cultivation',
  source: 'core',
  label: '闭关苦修',
  considerationOrder: 30,
  cooldownMonths: 0,
  evaluate({ npc, brain, activeGoalKind }) {
    const ratio = cultivationRatio(npc);
    if (ratio >= 1) {
      return { allowed: false, reasonCode: 'cultivation_full', reason: '修为已满，闭关不再积累修为' };
    }
    return {
      allowed: true,
      considerations: {
        goalFit: activeGoalKind === 'cultivate_to_breakthrough'
          ? 100
          : activeGoalKind === 'seek_revenge' && ratio < 0.8
            ? 95
            : 25,
        opportunity: Math.min(100, 50 + ratio * 60),
        urgency: brain.profile.valueWeights.dao,
        profileFit: brain.profile.behavioralBiases.patience,
        riskCost: 2,
        timeCost: 8,
      },
    };
  },
};

const breakthroughNode: NpcBrainNodeDefinition = {
  nodeId: 'breakthrough',
  capabilityId: 'breakthrough',
  category: 'cultivation',
  source: 'core',
  label: '冲击瓶颈',
  considerationOrder: 10,
  cooldownMonths: 1,
  evaluate({ npc, brain, activeGoalKind }) {
    if (npc.cultivation.currentExp < npc.cultivation.maxExp) {
      return { allowed: false, reasonCode: 'cultivation_not_full', reason: '修为尚未圆满' };
    }
    return {
      allowed: true,
      considerations: {
        goalFit: activeGoalKind === 'cultivate_to_breakthrough' ? 100 : 45,
        opportunity: 100,
        urgency: brain.profile.valueWeights.dao,
        profileFit: brain.profile.behavioralBiases.riskTolerance,
        riskCost: 15,
        timeCost: 10,
      },
    };
  },
};

const wanderNode: NpcBrainNodeDefinition = {
  nodeId: 'wander',
  capabilityId: 'wander',
  category: 'exploration',
  source: 'core',
  label: '云游访缘',
  considerationOrder: 40,
  cooldownMonths: 1,
  evaluate({ npc, brain, activeGoalKind }) {
    if (npc.moveState === 'secluded') {
      return { allowed: false, reasonCode: 'currently_secluded', reason: '尚在闭关，不能同时云游' };
    }
    const ratio = cultivationRatio(npc);
    const goalFit = activeGoalKind === 'explore'
      ? 100
      : activeGoalKind === 'extend_lifespan'
        ? 80
        : activeGoalKind === 'build_reputation' && ratio >= 0.6
          ? 80
        : 25;
    return {
      allowed: true,
      considerations: {
        goalFit,
        opportunity: 70,
        urgency: brain.profile.valueWeights.autonomy,
        profileFit: brain.profile.behavioralBiases.curiosity,
        riskCost: 5,
        timeCost: 10,
      },
    };
  },
};

const revengeAmbushNode: NpcBrainNodeDefinition = {
  nodeId: 'revenge_ambush',
  capabilityId: 'revenge_ambush',
  category: 'conflict',
  source: 'core',
  label: '调查并偷袭仇敌',
  considerationOrder: 5,
  cooldownMonths: 0,
  evaluate({ npc, brain, activeGoalKind }) {
    if (activeGoalKind !== 'seek_revenge') {
      return { allowed: false, reasonCode: 'no_revenge_goal', reason: '当前没有复仇目标' };
    }
    const hasGrudge = Object.values(npc.relations)
      .some((relation) => (relation.type === 'enemy' || relation.type === 'rival') && relation.bond < 0);
    if (!hasGrudge) {
      return { allowed: false, reasonCode: 'no_enemy_relation', reason: '没有可执行的仇敌关系' };
    }
    return {
      allowed: true,
      considerations: {
        goalFit: 100,
        opportunity: 90,
        urgency: Math.max(brain.emotion.anger, 65),
        profileFit: (brain.profile.behavioralBiases.aggression + brain.profile.behavioralBiases.patience) / 2,
        riskCost: (100 - brain.profile.behavioralBiases.riskTolerance) * 0.08,
        timeCost: 10,
      },
    };
  },
};

export function createDefaultNpcBrainNodeRegistry(): NpcBrainNodeRegistry {
  const registry = new NpcBrainNodeRegistry();
  registry.register(cultivateNode);
  registry.register(secludeNode);
  registry.register(breakthroughNode);
  registry.register(wanderNode);
  registry.register(revengeAmbushNode);
  return registry;
}
