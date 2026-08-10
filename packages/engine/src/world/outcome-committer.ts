// ============================================================
// WorldOutcome 原子提交器 — S3
//
// 将 WorldOutcome 原子提交到 WorldState。
// 规则：
// - 幂等：同一 outcomeId 不重复应用
// - 版本校验：baseRevision 必须匹配 worldState.worldRevision ?? 0
// - 资产守恒：consumedAssetIds 必须存在且属于该实体；gainedAssets 添加到资产表
// - NPC 不回写 hp/spiritEnergy/ap（NpcRecord 无这些字段）
// - NPC 死亡只改 soulState，不 delete
// - 关系变化只追加不覆盖
// ============================================================

import type {
  WorldState,
  WorldOutcome,
  EntityDelta,
  CommitResult,
  NpcRecord,
  PersistentCondition,
} from '@taosim/contracts';

/**
 * 将 WorldOutcome 原子提交到 WorldState。
 *
 * 成功提交后 worldRevision +1，并记录 outcomeId 到 appliedOutcomeIds。
 * 玩家（非 NPC）的 hpDelta/spiritEnergyDelta/apDelta 等字段由调用方单独应用到 Character，
 * committer 只负责 WorldState 侧的变更。
 */
export function commitOutcome(worldState: WorldState, outcome: WorldOutcome): CommitResult {
  // ── 幂等检查 ──
  const applied = worldState.appliedOutcomeIds;
  if (applied && applied.includes(outcome.outcomeId)) {
    return { status: 'already_applied', outcomeId: outcome.outcomeId };
  }

  // ── 版本校验 ──
  const currentRevision = worldState.worldRevision ?? 0;
  if (outcome.baseRevision !== currentRevision) {
    return {
      status: 'version_conflict',
      expected: outcome.baseRevision,
      actual: currentRevision,
    };
  }

  // ── 应用所有 EntityDelta ──
  for (const delta of outcome.entityDeltas) {
    applyEntityDelta(worldState, delta);
  }

  // ── 追加 facts ──
  if (outcome.facts && outcome.facts.length > 0) {
    if (!worldState.facts) worldState.facts = [];
    for (const fact of outcome.facts) {
      worldState.facts.push(fact);
    }
  }

  // ── 世界标志变更 ──
  if (outcome.worldFlagChanges) {
    for (const [key, value] of Object.entries(outcome.worldFlagChanges)) {
      worldState.globalFlags[key] = value;
    }
  }

  // ── 版本推进 + 幂等记录 ──
  const newRevision = currentRevision + 1;
  worldState.worldRevision = newRevision;
  if (!worldState.appliedOutcomeIds) worldState.appliedOutcomeIds = [];
  worldState.appliedOutcomeIds.push(outcome.outcomeId);

  return { status: 'success', newRevision };
}

/** 应用单个实体差量到 WorldState（仅 NPC 与共享层；玩家 Character 由调用方处理） */
function applyEntityDelta(worldState: WorldState, delta: EntityDelta): void {
  const npc = worldState.npcs[delta.entityId];

  if (npc) {
    applyNpcDelta(worldState, npc, delta);
  }
  // 玩家 entityId 不在 npcs 字典中：committer 不处理玩家 Character，
  // 玩家侧 hpDelta/spiritEnergyDelta/apDelta 等由调用方单独应用。

  // ── 共享层变更（玩家与 NPC 通用）──

  // 关系变化追加（socialStates）
  if (delta.socialChanges && delta.socialChanges.length > 0) {
    if (!worldState.socialStates) worldState.socialStates = {};
    const state = (worldState.socialStates[delta.entityId] ??= {});
    for (const entry of delta.socialChanges) {
      state[entry.targetId] = entry;
    }
  }

  // 资产守恒：consumedAssetIds 必须存在且属于该实体
  if (delta.consumedAssetIds && delta.consumedAssetIds.length > 0) {
    if (!worldState.assets) worldState.assets = {};
    for (const assetId of delta.consumedAssetIds) {
      const asset = worldState.assets[assetId];
      if (!asset) {
        throw new Error(
          `commitOutcome: consumed asset ${assetId} not found in worldState.assets`,
        );
      }
      if (asset.ownerId !== delta.entityId) {
        throw new Error(
          `commitOutcome: consumed asset ${assetId} does not belong to ${delta.entityId}`,
        );
      }
      delete worldState.assets[assetId];
    }
  }

  // 获得资产：添加到资产表，设定 ownerId
  if (delta.gainedAssets && delta.gainedAssets.length > 0) {
    if (!worldState.assets) worldState.assets = {};
    for (const asset of delta.gainedAssets) {
      worldState.assets[asset.assetId] = { ...asset, ownerId: delta.entityId };
    }
  }
}

/** 应用 NPC 侧差量（不回写 hp/spiritEnergy/ap） */
function applyNpcDelta(worldState: WorldState, npc: NpcRecord, delta: EntityDelta): void {
  // 灵石差量
  if (delta.spiritStonesDelta !== undefined) {
    npc.spiritStones = (npc.spiritStones ?? 0) + delta.spiritStonesDelta;
  }

  // 修为差量
  if (delta.cultivationExpDelta !== undefined) {
    npc.cultivation = {
      ...npc.cultivation,
      currentExp: npc.cultivation.currentExp + delta.cultivationExpDelta,
    };
  }

  // 境界变更
  if (delta.realmChanged !== undefined) {
    npc.realm = delta.realmChanged;
  }

  // 灵魂状态变更
  if (delta.soulStateChanged !== undefined) {
    npc.soulState = delta.soulStateChanged;
  }

  // 位置变更
  if (delta.locationChanged !== undefined) {
    const loc = delta.locationChanged;
    if (loc.nodeId) npc.locationId = loc.nodeId;
    if (loc.hexPos) npc.hexPos = loc.hexPos;
  }

  // 伤势追加（PersistentCondition）
  if (delta.injuriesAdded && delta.injuriesAdded.length > 0) {
    const cond = ensureCondition(worldState, npc.id);
    cond.injuries.push(...delta.injuriesAdded);
  }

  // 毒素追加
  if (delta.poisonsAdded && delta.poisonsAdded.length > 0) {
    const cond = ensureCondition(worldState, npc.id);
    cond.poisons.push(...delta.poisonsAdded);
  }

  // 经脉损伤增量
  if (delta.meridianDamageDelta !== undefined && delta.meridianDamageDelta !== 0) {
    const cond = ensureCondition(worldState, npc.id);
    cond.meridianDamage = Math.min(100, cond.meridianDamage + delta.meridianDamageDelta);
  }

  // 被击杀：soulState → RemnantSoul，记录死亡时间与死因，不 delete
  if (delta.killed) {
    npc.soulState = 'RemnantSoul';
    npc.deathYear = worldState.currentYear;
    npc.deathMonth = worldState.currentMonth;
    npc.causeOfDeath = delta.killedBy
      ? `slain by ${delta.killedBy}`
      : 'slain';
  }
}

/** 确保 worldState.conditions 中存在指定实体的 PersistentCondition，返回该条件 */
function ensureCondition(worldState: WorldState, entityId: string): PersistentCondition {
  if (!worldState.conditions) worldState.conditions = {};
  let cond = worldState.conditions[entityId];
  if (!cond) {
    cond = { injuries: [], poisons: [], meridianDamage: 0 };
    worldState.conditions[entityId] = cond;
  }
  return cond;
}
