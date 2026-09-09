import type {
  BrainState,
  BrainTime,
  NpcRecord,
  PersistentCondition,
} from '@taosim/contracts';

export type NpcBrainCapabilityId =
  | 'cultivate' | 'seclude' | 'breakthrough' | 'wander' | 'revenge_ambush'
  | 'protect_kin' | 'uphold_order';

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
  category: 'cultivation' | 'exploration' | 'conflict' | 'social';
  source: 'core' | 'species' | 'lineage' | 'culture' | 'identity';
  sourceId?: string;
  label: string;
  /** 满意选择的稳定考虑顺序；数值越小越先考虑。 */
  considerationOrder: number;
  cooldownMonths: number;
  /** 只有已装配该来源的 NPC 才会看到和评分此节点。 */
  isEquipped?(npc: Readonly<NpcRecord>): boolean;
  evaluate(context: NpcBrainNodeContext): NpcBrainNodeEvaluation;
}

interface RegisteredNode {
  definition: NpcBrainNodeDefinition;
  enabled: boolean;
}

export class NpcBrainNodeRegistry {
  private readonly nodes = new Map<string, RegisteredNode>();
  private orderedNodes?: ReadonlyArray<Readonly<RegisteredNode>>;

  register(definition: NpcBrainNodeDefinition, enabled = true): void {
    if (this.nodes.has(definition.nodeId)) {
      throw new Error(`NpcBrainNodeRegistry: 重复节点 ${definition.nodeId}`);
    }
    this.nodes.set(definition.nodeId, { definition, enabled });
    this.orderedNodes = undefined;
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
    if (!this.orderedNodes) {
      this.orderedNodes = [...this.nodes.values()].sort((a, b) =>
        a.definition.considerationOrder - b.definition.considerationOrder
        || a.definition.nodeId.localeCompare(b.definition.nodeId));
    }
    return this.orderedNodes;
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

const protectKinNode: NpcBrainNodeDefinition = {
  nodeId: 'protect_kin',
  capabilityId: 'protect_kin',
  category: 'social',
  source: 'lineage',
  sourceId: 'family_lineage',
  label: '照拂血亲',
  considerationOrder: 15,
  cooldownMonths: 1,
  isEquipped: (npc) => (npc.identity?.lineageIds.length ?? 0) > 0 || Object.values(npc.relations).some((relation) => relation.type === 'clan'),
  evaluate({ npc, brain }) {
    const closeKin = Object.values(npc.relations)
      .filter((relation) => relation.type === 'clan' && relation.bond > 0)
      .sort((a, b) => b.bond - a.bond)[0];
    if (!closeKin) {
      return { allowed: false, reasonCode: 'no_close_kin', reason: '当前没有保持往来的亲族' };
    }
    return {
      allowed: true,
      considerations: {
        goalFit: brain.profile.valueWeights.belonging,
        opportunity: Math.max(20, closeKin.bond),
        urgency: Math.max(brain.emotion.fear, brain.emotion.attachment),
        profileFit: brain.profile.behavioralBiases.sociability,
        riskCost: (100 - brain.profile.behavioralBiases.riskTolerance) * 0.12,
        timeCost: 8,
      },
    };
  },
};

const upholdOrderNode: NpcBrainNodeDefinition = {
  nodeId: 'uphold_order',
  capabilityId: 'uphold_order',
  category: 'social',
  source: 'identity',
  sourceId: 'law_enforcer',
  label: '维护辖地秩序',
  considerationOrder: 12,
  cooldownMonths: 0,
  isEquipped: (npc) => npc.socialRank === 'elder' || npc.socialRank === 'sectMaster'
    || npc.identity?.socialIdentityIds.includes('law_enforcer') === true,
  evaluate({ npc, brain }) {
    return {
      allowed: true,
      considerations: {
        goalFit: npc.aspiration === 'seekFame' ? 90 : 55,
        opportunity: 45,
        urgency: brain.profile.valueWeights.reputation,
        profileFit: (brain.profile.behavioralBiases.aggression + brain.profile.behavioralBiases.sociability) / 2,
        riskCost: (100 - brain.profile.behavioralBiases.riskTolerance) * 0.08,
        timeCost: 5,
      },
    };
  },
};

const woodSpiritRootedCultivationNode: NpcBrainNodeDefinition = {
  nodeId: 'wood_spirit_rooted_cultivation',
  capabilityId: 'seclude',
  category: 'cultivation',
  source: 'species',
  sourceId: 'wood-spirit',
  label: '扎根吐纳',
  considerationOrder: 22,
  cooldownMonths: 0,
  isEquipped: (npc) => npc.identity?.bodySpeciesId === 'wood-spirit',
  evaluate({ npc, brain, activeGoalKind }) {
    const ratio = cultivationRatio(npc);
    if (ratio >= 1) return { allowed: false, reasonCode: 'cultivation_full', reason: '修为已经圆满' };
    return {
      allowed: true,
      considerations: {
        goalFit: activeGoalKind === 'cultivate_to_breakthrough' ? 100 : 40,
        opportunity: npc.locationId?.includes('WILD') ? 85 : 45,
        urgency: brain.profile.valueWeights.dao,
        profileFit: brain.profile.behavioralBiases.patience,
        riskCost: 0,
        timeCost: 6,
      },
    };
  },
};

const foxSpiritRoamingNode: NpcBrainNodeDefinition = {
  nodeId: 'fox_spirit_roaming',
  capabilityId: 'wander',
  category: 'exploration',
  source: 'species',
  sourceId: 'fox-spirit',
  label: '循气游猎',
  considerationOrder: 35,
  cooldownMonths: 1,
  isEquipped: (npc) => npc.identity?.bodySpeciesId === 'fox-spirit',
  evaluate({ npc, brain, activeGoalKind }) {
    if (npc.moveState === 'secluded') return { allowed: false, reasonCode: 'currently_secluded', reason: '尚在闭关' };
    return {
      allowed: true,
      considerations: {
        goalFit: activeGoalKind === 'explore' ? 100 : 35,
        opportunity: 75,
        urgency: brain.profile.valueWeights.autonomy,
        profileFit: (brain.profile.behavioralBiases.curiosity + brain.profile.behavioralBiases.sociability) / 2,
        riskCost: 4,
        timeCost: 8,
      },
    };
  },
};

const sectDisciplineNode: NpcBrainNodeDefinition = {
  nodeId: 'sect_discipline',
  capabilityId: 'cultivate',
  category: 'cultivation',
  source: 'culture',
  sourceId: 'sect-cultivator',
  label: '依宗门功课修炼',
  considerationOrder: 18,
  cooldownMonths: 0,
  isEquipped: (npc) => npc.identity?.cultureIds.some((id) => id === 'sect-cultivator' || id.startsWith('faction:')) === true,
  evaluate({ npc, brain, activeGoalKind }) {
    const ratio = cultivationRatio(npc);
    if (ratio >= 1) return { allowed: false, reasonCode: 'cultivation_full', reason: '修为已经圆满' };
    return {
      allowed: true,
      considerations: {
        goalFit: activeGoalKind === 'cultivate_to_breakthrough' ? 95 : 35,
        opportunity: npc.factionId ? 80 : 45,
        urgency: brain.profile.valueWeights.dao,
        profileFit: brain.profile.behavioralBiases.patience,
        riskCost: 0,
        timeCost: 5,
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
  registry.register(protectKinNode);
  registry.register(upholdOrderNode);
  registry.register(woodSpiritRootedCultivationNode);
  registry.register(foxSpiritRoamingNode);
  registry.register(sectDisciplineNode);
  return registry;
}
