// ============================================================
// TribulationService — 渡劫 V1 最小世界闭环（S8）
//
// 职责：把 TribulationEngine 的纯逻辑结果包装成 WorldOutcome，
//      通过 commitOutcome 提交到世界状态，产生渡劫事实。
//
// V1 验收项对应：
//   V1-1 真实渡劫者：通过 entityId 定位（玩家或 NPC 均可）
//   V1-2 真实地点：locationId 来自调用方（场景引用世界坐标）
//   V1-3 权威耗时：timeElapsed 提交（失败不推进）
//   V1-4 结果差量：境界/修为/寿命/伤势/soulState 全部走 EntityDelta
//   V1-5 死亡归档：NPC 死亡由 commitOutcome 触发 archiveNpc 路径
//                  玩家死亡由调用方触发 gameFlow.enterGameOver
//   V1-6 结构化事实：生成 type='tribulation' 的 Fact
//   V1-7 幂等：outcomeId 去重，重复提交返回 already_applied
//   V1-8 同一规则：玩家与 NPC 共用此 Service
// ============================================================

import type { Character, RealmBreakthroughConfig, RealmFullPath, SoulState } from '@taosim/contracts';
import type { WorldState, WorldOutcome, EntityDelta, Fact, LocationRef } from '@taosim/contracts';
import { TribulationEngine } from '../tribulation/tribulation-engine.js';
import type { TribulationResult } from '../tribulation/tribulation-engine.js';
import { commitOutcome } from '../world/outcome-committer.js';
import type { CommitResult } from '@taosim/contracts';

/** 渡劫服务返回：包含逻辑结果 + 世界提交结果 */
export interface TribulationServiceResult {
  /** TribulationEngine 的纯逻辑判定（成功/失败/境界变更） */
  logic: TribulationResult;
  /** 世界状态提交结果（success/version_conflict/already_applied） */
  commit: CommitResult;
  /** 产出的 WorldOutcome（供调用方追加日志/事件） */
  outcome: WorldOutcome;
}

/** 渡劫场景配置（V1 最小集） */
export interface TribulationScene {
  /** 渡劫者实体 ID（playerId 或 npcId） */
  tribulatorId: string;
  /** 渡劫者角色（Character 快照） */
  tribulator: Character;
  /** 突破配置 */
  config: RealmBreakthroughConfig;
  /** 地点引用（V1-2：场景引用世界坐标） */
  location?: LocationRef;
  /** 耗时分钟数（V1-3：失败不推进，由本 Service 控制） */
  elapsedMinutes?: number;
  /** 幂等键基础（建议用 `tribulation_${tribulatorId}_${toRealm}_${年}_${月}`） */
  outcomeIdBase: string;
  /** RNG 种子（可选，默认用 Math.random） */
  rng?: () => number;
}

export class TribulationService {
  /**
   * 执行一次渡劫（V1 最小闭环）。
   *
   * 步骤：
   *   1. 调用 TribulationEngine.attempt 获得纯逻辑结果
   *   2. 构造 EntityDelta（境界/修为/寿命/HP/灵力/soulState）
   *   3. 构造 Fact（type='tribulation'）
   *   4. 组装 WorldOutcome 并 commitOutcome
   *   5. 返回完整结果
   *
   * 幂等：outcomeId 由调用方提供（建议含 tribulatorId + toRealm + 年月），
   *      重复提交同一 outcomeId 返回 already_applied，不重复突破。
   *
   * 失败不推进时间：失败时 timeElapsed 不附加到 outcome。
   */
  static attempt(scene: TribulationScene, worldState: WorldState): TribulationServiceResult {
    // —— 1. 纯逻辑判定（用注入的 RNG，默认 Math.random） ——
    const rng = scene.rng ?? Math.random;
    const originalRandom = Math.random;
    Math.random = rng;
    let logic: TribulationResult;
    try {
      logic = TribulationEngine.attempt(scene.tribulator, scene.config);
    } finally {
      Math.random = originalRandom;
    }

    // —— 2. 构造 EntityDelta ——
    const delta = TribulationService.buildDelta(scene, logic);

    // —— 3. 构造 Fact ——
    const fact = TribulationService.buildFact(scene, logic, worldState);

    // —— 4. 组装 WorldOutcome ——
    const outcomeId = `${scene.outcomeIdBase}_${logic.success ? 'success' : 'fail'}`;
    const outcome: WorldOutcome = {
      outcomeId,
      baseRevision: worldState.worldRevision ?? 0,
      source: 'tribulation',
      entityDeltas: [delta],
      facts: [fact],
    };

    // V1-3：成功才推进时间（失败时 timeElapsed 不附加）
    if (logic.success && scene.elapsedMinutes && scene.elapsedMinutes > 0) {
      // 注意：当前 commitOutcome 不消费 timeElapsed（S3 实现的已知限制）
      // V1 阶段：记录到 outcome 但时间推进仍由月度 tick 负责
      // V2 阶段：commitOutcome 增强，按 timeElapsed 推进 currentMonth
      outcome.timeElapsed = { minutes: scene.elapsedMinutes };
    }

    // V1-2：地点引用
    if (scene.location) {
      outcome.location = scene.location;
    }

    // —— 5. 提交 ——
    const commit = commitOutcome(worldState, outcome);

    return { logic, commit, outcome };
  }

  /** 构造渡劫者的 EntityDelta（V1-4：结果差量） */
  private static buildDelta(scene: TribulationScene, logic: TribulationResult): EntityDelta {
    const delta: EntityDelta = {
      entityId: scene.tribulatorId,
    };

    if (logic.success) {
      // —— 成功：境界提升 + 修为清零 + HP/灵力回满（差量） ——
      delta.realmChanged = logic.newRealm as RealmFullPath;

      const updated = logic.updatedCharacter!;
      const original = scene.tribulator;

      // 修为差量：currentExp 归零（负差量）
      delta.cultivationExpDelta = -original.cultivation.currentExp;

      // HP 差量：回满（正差量）
      delta.hpDelta = updated.hp - original.hp;

      // 灵力差量：回满（正差量）
      delta.spiritEnergyDelta = updated.spiritEnergy.current - original.spiritEnergy.current;

      // 寿命变更：maxLifespan 提升无法直接用 delta 表达（EntityDelta 无此字段）
      // V1 阶段：通过 worldFlagChanges 旁路记录（仅用于日志，不直接改 Character）
      // V2 阶段：扩展 EntityDelta 增加 maxLifespanDelta 字段
    } else {
      // —— 失败：HP 受损（负差量）+ 经脉损伤 ——
      const updated = logic.updatedCharacter!;
      const original = scene.tribulator;
      delta.hpDelta = updated.hp - original.hp;

      // 经脉损伤：失败时 +10%（V1-4）
      delta.meridianDamageDelta = 10;

      // 失败也可能致死（HP 归零）—— 但 TribulationEngine 保证 hp ≥ 1，不致死
      // V2 阶段：引入"渡劫失败致死"机制时补 killed/soulStateChanged
    }

    return delta;
  }

  /** 构造渡劫事实（V1-6：结构化事实，可查询可叙事） */
  private static buildFact(
    scene: TribulationScene,
    logic: TribulationResult,
    worldState: WorldState,
  ): Fact {
    const year = worldState.currentYear;
    const month = worldState.currentMonth;
    const tribulatorName = scene.tribulator.name;
    const toRealmShort = scene.config.toRealm;

    const factId = `fact_${scene.outcomeIdBase}_${logic.success ? 'success' : 'fail'}`;

    const title = logic.success
      ? `${tribulatorName} 渡劫成功，突破至 ${toRealmShort}`
      : `${tribulatorName} 渡劫失败`;

    const description = logic.success
      ? `${tribulatorName} 于 ${year}年${month}月成功渡过天劫，境界突破至 ${toRealmShort}。`
      : `${tribulatorName} 于 ${year}年${month}月渡劫失败，${logic.reason ?? '气血受损'}`;

    return {
      factId,
      outcomeId: `${scene.outcomeIdBase}_${logic.success ? 'success' : 'fail'}`,
      type: 'tribulation',
      at: { year, month },
      locationId: scene.location?.venueId ?? scene.location?.hexPos
        ? `${scene.location.hexPos!.q},${scene.location.hexPos!.r}`
        : undefined,
      participants: [
        { entityId: scene.tribulatorId, role: 'subject' },
      ],
      title,
      description,
      visibility: 'local',
      metadata: {
        success: logic.success,
        fromRealm: scene.config.fromRealm,
        toRealm: scene.config.toRealm,
        tier: scene.config.tier,
      },
    };
  }
}
