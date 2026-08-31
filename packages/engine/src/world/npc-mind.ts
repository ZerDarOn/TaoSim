// ============================================================
// NPC Mind — P4 持久化心智与计划调度器 + C1 行动解析器
//
// 每个具名 NPC 持续拥有需求、目标、计划和下一次行动。
// 月度调度根据 NPC 的需求压力和当前状态决定行动。
//
// C1：新增 resolveNpcMindAction（Intent → Validation → Resolution →
// Delta Commit → Fact），让"想做"走到"做成"。
//
// 红线 #5：不得用随机事件模板代替 NPC 的需求/目标/计划/行动。
// ============================================================

import type { NpcRecord, MindState, NpcGoal, NpcAction, NpcAspiration, BigEventLog } from '@taosim/contracts';
import { cultivateNpc, tryBreakthrough, type Rng } from './world-tick-rules.js';
import { spiritQiMultiplier } from './world-engine.js';

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
    actionStatus: 'planned',
    actionPlannedAt: currentTime ?? { year: npc.birthYear, month: npc.birthMonth },
    actionMonthsElapsed: 0,
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

  // C1：如果行动类型变化，重置执行追踪
  const actionChanged = action.type !== currentMind.nextAction.type;

  const mind: MindState = {
    currentGoal: goalChanged ? newGoal : currentMind.currentGoal,
    needs,
    nextAction: action,
    goalStartedAt: goalChanged ? currentTime : currentMind.goalStartedAt,
    actionStatus: actionChanged ? 'planned' : currentMind.actionStatus,
    actionPlannedAt: actionChanged ? currentTime : currentMind.actionPlannedAt,
    actionMonthsElapsed: actionChanged ? 0 : currentMind.actionMonthsElapsed,
    lastResolvedAction: currentMind.lastResolvedAction,
  };

  return { mind, actionDescription, goalChanged };
}

// ============================================================
// C1：NPC Mind 行动解析器
//
// 管道：Intent → Validation → Resolution → Delta Commit → Fact
//
// 首批闭环行动：cultivate、seclude、breakthrough、wander、trade、rest
// 其余行动（challenge、courtship、socialize、teach、prepare）
// 继续使用现有随机规则，明确标为未迁移。
// ============================================================

/** 解析后的 NPC 行动结果 */
export interface NpcActionResolution {
  /** 行动是否完成（单步完成或多步最后一步） */
  completed: boolean;
  /** 成功（true）、失败（false）或仍在进行中（undefined） */
  success?: boolean;
  /** 失败原因（机器可读） */
  failureReason?: string;
  /** 结算事实（用于日志/时间线） */
  fact: string;
  /** 严重性 */
  severity: 'minor' | 'normal' | 'major';
  /** 更新后的 NPC（直接修改传入引用） */
  npc: NpcRecord;
}

// 多步行动所需月数
const ACTION_DURATION: Record<string, number> = {
  cultivate: 1,
  seclude: 3,
  breakthrough: 1,
  wander: 1,
  trade: 1,
  rest: 1,
};

export interface NpcActionResolutionOptions {
  rng?: Rng;
  nodeSpiritQi?: Record<string, number>;
  coupleBonus?: number;
  qi?: number;
  apprentice?: number;
}

export function getNpcActionDuration(actionType: string): number | undefined {
  return ACTION_DURATION[actionType];
}

/**
 * C1：解析 Mind 行动并执行。
 *
 * 对首批闭环行动（cultivate/seclude/breakthrough/wander/trade/rest）
 * 执行 Validation → Resolution → Delta Commit，返回结算事实。
 *
 * 其余行动类型返回 null（调用方继续使用旧随机规则）。
 */
export function resolveNpcCapabilityAction(
  npc: NpcRecord,
  actionType: string,
  elapsedMonthsBefore: number,
  currentTime: { year: number; month: number },
  options: NpcActionResolutionOptions,
): NpcActionResolution | null {
  // 非首批闭环行动：返回 null，由旧随机规则处理
  if (!(actionType in ACTION_DURATION)) {
    return null;
  }

  const duration = ACTION_DURATION[actionType] ?? 1;

  // —— Validation ——
  // 多步行动：检查是否仍在进行中
  const elapsedThisTick = elapsedMonthsBefore + 1;
  const isLastMonth = elapsedThisTick >= duration;

  // 强制检查：突破需要修为 >= maxExp
  if (actionType === 'breakthrough' && npc.cultivation.currentExp < npc.cultivation.maxExp) {
    return {
      completed: true,
      success: false,
      failureReason: `exp_insufficient(${npc.cultivation.currentExp}/${npc.cultivation.maxExp})`,
      fact: `${npc.name}试图突破，但修为不足`,
      severity: 'minor',
      npc,
    };
  }

  // 中间月份：只累加进度，不结算
  if (!isLastMonth) {
    return {
      completed: false,
      fact: '',
      severity: 'minor',
      npc,
    };
  }

  // —— Resolution ——
  let success = true;
  let failureReason: string | undefined;
  let fact: string;
  let severity: 'minor' | 'normal' | 'major' = 'minor';
  const oldRealm = npc.realm;

  // 灵气乘数：优先用传入的，否则自算
  const qi = options?.qi
    ?? (npc.locationId
      ? spiritQiMultiplier(options?.nodeSpiritQi?.[npc.locationId] ?? 50)
      : 1);
  const coupleBonus = options?.coupleBonus ?? 1;
  const apprenticeMult = options?.apprentice ?? 1;

  switch (actionType) {
    case 'cultivate': {
      const expBefore = npc.cultivation.currentExp;
      cultivateNpc(npc, { qi, focus: 1 * coupleBonus, apprentice: apprenticeMult });
      const expGained = Math.round(npc.cultivation.currentExp - expBefore);
      fact = `${npc.name}修炼一月，修为 +${expGained}`;
      severity = 'minor';
      break;
    }

    case 'seclude': {
      const expBefore = npc.cultivation.currentExp;
      // focus=2 闭关加成，叠加道侣双修效应
      cultivateNpc(npc, { qi, focus: 2 * coupleBonus, apprentice: apprenticeMult });
      const expGained = Math.round(npc.cultivation.currentExp - expBefore);
      fact = `${npc.name}闭关三月，修为大进 +${expGained}`;
      severity = 'normal';
      break;
    }

    case 'breakthrough': {
      const rng = options?.rng ?? Math.random;
      const result = tryBreakthrough(npc, rng);
      if (result.attempted && result.succeeded) {
        fact = `${npc.name}突破成功！进阶 ${result.nextRealm}`;
        severity = result.major ? 'major' : 'normal';
      } else if (result.attempted) {
        success = false;
        failureReason = `breakthrough_failed(from=${oldRealm})`;
        fact = `${npc.name}突破失败，修为清零，折寿三年`;
        severity = 'major';
      } else {
        // 不应该到这里（Validation 已检查），防御性处理
        success = false;
        failureReason = 'breakthrough_not_attempted';
        fact = `${npc.name}突破条件不满足`;
        severity = 'minor';
      }
      break;
    }

    case 'wander': {
      // 云游：清空 locationId，由 WorldEngine 重新分配位置
      const oldLocId = npc.locationId;
      npc.locationId = undefined;
      npc.moveState = 'wandering';
      fact = oldLocId
        ? `${npc.name}离开${oldLocId}，外出云游`
        : `${npc.name}云游四方`;
      severity = 'minor';
      break;
    }

    case 'trade': {
      // 交易：增加少量灵石
      const spiritStones = npc.spiritStones ?? 0;
      const earned = Math.floor(10 + Math.random() * 30);
      npc.spiritStones = spiritStones + earned;
      fact = `${npc.name}坊市交易，灵石 +${earned}`;
      severity = 'minor';
      break;
    }

    case 'rest': {
      fact = `${npc.name}静养调息`;
      severity = 'minor';
      break;
    }

    default: {
      return null;
    }
  }

  // —— Delta Commit ——
  npc.lastUpdate = { year: currentTime.year, month: currentTime.month };
  if (npc.realm !== oldRealm) {
    // 突破成功：标记里程碑
    npc.biography.milestones.push({
      eventId: `mind_${currentTime.year}_${currentTime.month}`,
      year: currentTime.year,
      month: currentTime.month,
      title: `突破 ${npc.realm}`,
      realm: npc.realm,
    });
  }

  return {
    completed: true,
    success,
    failureReason,
    fact,
    severity,
    npc,
  };
}

/** 旧 Mind 适配层；实际效果与新 Brain Action 共用同一个能力执行器。 */
export function resolveNpcMindAction(
  npc: NpcRecord,
  mind: MindState,
  currentTime: { year: number; month: number },
  options: NpcActionResolutionOptions,
): NpcActionResolution | null {
  return resolveNpcCapabilityAction(
    npc,
    mind.nextAction.type,
    mind.actionMonthsElapsed ?? 0,
    currentTime,
    options,
  );
}

/**
 * C1：标记 Mind 行动已结算（无论成功或失败），更新状态追踪。
 * 调用方在获得 resolution 后调用此函数更新 mind 状态。
 */
export function commitMindAction(
  mind: MindState,
  resolution: NpcActionResolution,
  currentTime: { year: number; month: number },
): MindState {
  return {
    ...mind,
    actionStatus: resolution.completed
      ? (resolution.success === false ? 'failed' : 'completed')
      : 'executing',
    actionMonthsElapsed: resolution.completed ? 0 : (mind.actionMonthsElapsed ?? 0) + 1,
    actionFailureReason: resolution.failureReason,
    lastResolvedAction: mind.nextAction.type,
  };
}
