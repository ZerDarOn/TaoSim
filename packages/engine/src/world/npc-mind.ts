// ============================================================
// NPC Mind — P4 持久化心智与计划调度器
//
// 每个具名 NPC 持续拥有需求、目标、计划和下一次行动。
// 月度调度根据 NPC 的需求压力和当前状态决定行动。
//
// 红线 #5：不得用随机事件模板代替 NPC 的需求/目标/计划/行动。
// ============================================================

import type { NpcRecord, MindState, NpcGoal, NpcAction, NpcAspiration } from '@taosim/contracts';

// —— 需求计算 ——

export interface NpcNeeds {
  longevity: number;
  social: number;
  dao: number;
  fame: number;
  safety: number;
}

/**
 * 计算 NPC 需求压力（0-100）。
 * 纯函数，同输入同输出。
 */
export function computeNeeds(npc: NpcRecord): NpcNeeds {
  const { age, maxLifespan } = npc.lifespan;
  const ageRatio = age / maxLifespan;

  // 寿元压力：年龄比 > 0.7 时急速上升
  const longevity = ageRatio > 0.7
    ? Math.min(100, Math.round((ageRatio - 0.7) * 333))
    : ageRatio > 0.5
      ? Math.round((ageRatio - 0.5) * 50)
      : 0;

  // 社交压力：无道侣/关系少时上升
  const relationCount = Object.keys(npc.relations).length;
  const hasSpouse = !!npc.spouseId;
  const social = hasSpouse
    ? 0
    : relationCount === 0
      ? 60
      : Math.max(0, 40 - relationCount * 8);

  // 求道压力：修为进度低时上升
  const expRatio = npc.cultivation.currentExp / npc.cultivation.maxExp;
  const dao = Math.round((1 - expRatio) * 70);

  // 求名压力：志向驱动
  const fame = npc.aspiration === 'seekFame' ? 70 : 0;

  // 安全压力：HP 低或受威胁时上升（当前简化）
  const safety = 0;

  return { longevity, social, dao, fame, safety };
}

// —— 志向 → 目标映射 ——

const ASPIRATION_GOAL_MAP: Record<NpcAspiration, NpcGoal['type']> = {
  seekDao: 'cultivate_to_breakthrough',
  seekFame: 'build_reputation',
  seekLongevity: 'extend_lifespan',
  seekRevenge: 'seek_revenge',
  seekPartner: 'find_partner',
  seekSuccessor: 'find_successor',
  wander: 'explore',
};

/**
 * 从志向和需求推导当前目标。
 * 需求可以覆盖志向（如寿元将尽时优先延寿）。
 */
function deriveGoal(npc: NpcRecord, needs: NpcNeeds): NpcGoal {
  // 寿元危急时优先延寿（无论志向）
  if (needs.longevity > 70) {
    return { type: 'extend_lifespan' };
  }

  // 求偶志向且已有道侣 → 转为求道
  if (npc.aspiration === 'seekPartner' && npc.spouseId) {
    return { type: 'cultivate_to_breakthrough' };
  }

  const goalType = ASPIRATION_GOAL_MAP[npc.aspiration ?? 'wander'] ?? 'explore';
  return { type: goalType };
}

// —— 目标 → 行动映射 ——

/**
 * 根据目标和当前状态选择下一步行动。
 */
function chooseAction(npc: NpcRecord, goal: NpcGoal, needs: NpcNeeds): NpcAction {
  const expRatio = npc.cultivation.currentExp / npc.cultivation.maxExp;

  switch (goal.type) {
    case 'cultivate_to_breakthrough':
      // 修为充足时准备突破，否则修炼/闭关
      if (expRatio > 0.9) {
        return { type: 'breakthrough' };
      }
      if (expRatio > 0.5) {
        return { type: 'seclude' };
      }
      return { type: 'cultivate' };

    case 'find_partner':
      return { type: 'courtship' };

    case 'seek_revenge':
      // 修为不足时修炼变强
      if (expRatio < 0.8) {
        return { type: 'seclude' };
      }
      return { type: 'challenge' };

    case 'build_reputation':
      // 需要实力支撑
      if (expRatio < 0.6) {
        return { type: 'cultivate' };
      }
      return { type: 'challenge' };

    case 'find_successor':
      return { type: 'teach' };

    case 'extend_lifespan':
      // 延寿需要资源/机缘
      return { type: 'wander' };

    case 'explore':
      return { type: 'wander' };

    case 'protect_territory':
      return { type: 'rest' };

    default:
      return { type: 'rest' };
  }
}

// —— 行动描述（基于 NPC 状态，非随机模板）——

function describeAction(npc: NpcRecord, action: NpcAction): string {
  const name = npc.name;
  const expPct = Math.round((npc.cultivation.currentExp / npc.cultivation.maxExp) * 100);

  switch (action.type) {
    case 'cultivate':
      return `${name}日常修炼，修为进度 ${expPct}%`;
    case 'seclude':
      return `${name}闭关苦修，修为进度 ${expPct}%`;
    case 'breakthrough':
      return `${name}修为圆满（${expPct}%），冲击瓶颈`;
    case 'socialize':
      return `${name}前往人多的地方结交修士`;
    case 'courtship':
      return `${name}寻觅道侣`;
    case 'wander':
      return `${name}云游四方，寻访机缘`;
    case 'trade':
      return `${name}前往坊市交易`;
    case 'challenge':
      return `${name}修为精进，外出挑战`;
    case 'teach':
      return `${name}传授弟子道统`;
    case 'rest':
      return `${name}静养调息`;
    case 'prepare':
      return `${name}收集资源，为突破做准备`;
    default:
      return `${name}休整`;
  }
}

// —— 初始化 ——

/**
 * 为 NPC 创建初始心智状态。
 * 旧 NPC（无 mind 字段）在迁移时调用此函数。
 */
export function generateInitialMind(npc: NpcRecord, currentTime?: { year: number; month: number }): MindState {
  const needs = computeNeeds(npc);
  const goal = deriveGoal(npc, needs);
  const action = chooseAction(npc, goal, needs);

  return {
    currentGoal: goal,
    needs,
    nextAction: action,
    goalStartedAt: currentTime ?? { year: npc.birthYear, month: npc.birthMonth },
  };
}

// —— 月度 tick ——

export interface MindTickResult {
  /** 更新后的心智状态 */
  mind: MindState;
  /** 行动描述（用于日志/事实） */
  actionDescription: string;
  /** 目标是否变更 */
  goalChanged: boolean;
}

/**
 * 月度心智调度。
 * 1. 重新计算需求
 * 2. 检查目标是否需要更新
 * 3. 选择下一步行动
 * 4. 产出行动描述
 */
export function tickNpcMind(
  npc: NpcRecord,
  currentMind: MindState,
  currentTime: { year: number; month: number },
): MindTickResult {
  // 1. 重新计算需求
  const needs = computeNeeds(npc);

  // 2. 推导新目标
  const newGoal = deriveGoal(npc, needs);
  const goalChanged = newGoal.type !== currentMind.currentGoal.type;

  // 3. 选择行动
  const action = chooseAction(npc, newGoal, needs);

  // 4. 描述
  const actionDescription = describeAction(npc, action);

  const mind: MindState = {
    currentGoal: goalChanged ? newGoal : currentMind.currentGoal,
    needs,
    nextAction: action,
    goalStartedAt: goalChanged ? currentTime : currentMind.goalStartedAt,
  };

  return { mind, actionDescription, goalChanged };
}
