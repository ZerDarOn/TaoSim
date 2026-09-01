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

  const validationError = validateOutcome(worldState, outcome);
  if (validationError) return { status: 'validation_failed', reason: validationError };

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

/** 所有可能失败的检查先于首个写入，保证 validation_failed 不留下部分状态。 */
function validateOutcome(worldState: WorldState, outcome: WorldOutcome): string | undefined {
  if (!outcome.outcomeId) return 'missing_outcome_id';
  const entityIds = outcome.entityDeltas.map((delta) => delta.entityId);
  if (new Set(entityIds).size !== entityIds.length) return 'duplicate_entity_delta';
  const factIds = outcome.facts?.map((fact) => fact.factId) ?? [];
  if (new Set(factIds).size !== factIds.length) return 'duplicate_fact_id';
  const existingFactIds = new Set((worldState.facts ?? []).map((fact) => fact.factId));
  if (factIds.some((factId) => !factId || existingFactIds.has(factId))) return 'fact_id_conflict';

  const consumed = new Set<string>();
  const gained = new Set<string>();
  for (const delta of outcome.entityDeltas) {
    const npc = worldState.npcs[delta.entityId];
    if (npc && delta.spiritStonesDelta !== undefined
      && (npc.spiritStones ?? 0) + delta.spiritStonesDelta < 0) {
      return `negative_spirit_stones:${delta.entityId}`;
    }
    for (const assetId of delta.consumedAssetIds ?? []) {
      if (consumed.has(assetId)) return `asset_consumed_twice:${assetId}`;
      consumed.add(assetId);
      const asset = worldState.assets?.[assetId];
      if (!asset) return `consumed_asset_missing:${assetId}`;
      if (asset.ownerId !== delta.entityId) return `consumed_asset_wrong_owner:${assetId}`;
    }
    for (const asset of delta.gainedAssets ?? []) {
      if (!asset.assetId || gained.has(asset.assetId) || worldState.assets?.[asset.assetId]) {
        return `gained_asset_conflict:${asset.assetId}`;
      }
      gained.add(asset.assetId);
    }
    for (const relation of delta.socialChanges ?? []) {
      if (!relation.targetId
        || relation.bond < -100 || relation.bond > 100
        || relation.trust < 0 || relation.trust > 100
        || relation.hatred < 0 || relation.hatred > 100
        || relation.jealousy < 0 || relation.jealousy > 100) {
        return `invalid_social_change:${delta.entityId}`;
      }
    }
    for (const belief of delta.beliefsUpserted ?? []) {
      if (!belief.beliefId || belief.confidence < 0 || belief.confidence > 1) {
        return `invalid_belief:${delta.entityId}`;
      }
    }
  }
  for (const assetId of consumed) {
    if (gained.has(assetId)) return `asset_consumed_and_gained:${assetId}`;
  }
  return undefined;
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
      if (npc) {
        // SocialState 是权威；旧世界规则仍读取 NpcRecord.relations，迁移期保持无损投影同步。
        npc.relations[entry.targetId] = {
          type: entry.type,
          bond: entry.bond,
          trust: entry.trust,
          events: [...entry.events],
          changedAt: { ...entry.changedAt },
          direction: entry.direction,
        };
      }
    }
  }

  // 资产守恒：consumedAssetIds 必须存在且属于该实体
  if (delta.consumedAssetIds && delta.consumedAssetIds.length > 0) {
    if (!worldState.assets) worldState.assets = {};
    for (const assetId of delta.consumedAssetIds) {
      // 所有权已在 validateOutcome 中统一验证，这里只执行不可失败的提交。
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

  if (delta.memoriesAdded && delta.memoriesAdded.length > 0 && npc.brain) {
    const existingIds = new Set(npc.brain.memories.map((memory) => memory.memoryId));
    const additions = delta.memoriesAdded.filter((memory) => !existingIds.has(memory.memoryId));
    if (additions.length > 0) {
      npc.brain = {
        ...npc.brain,
        revision: npc.brain.revision + 1,
        memories: [...npc.brain.memories, ...additions].slice(-32),
      };
    }
  }

  if (delta.beliefsUpserted && delta.beliefsUpserted.length > 0 && npc.brain) {
    const upsertedIds = new Set(delta.beliefsUpserted.map((belief) => belief.beliefId));
    const ranked = Object.entries({
      ...npc.brain.beliefs,
      ...Object.fromEntries(delta.beliefsUpserted.map((belief) => [belief.beliefId, belief])),
    }).sort(([idA, a], [idB, b]) => Number(upsertedIds.has(idB)) - Number(upsertedIds.has(idA))
      || Number(b.status === 'active') - Number(a.status === 'active')
      || b.confidence - a.confidence
      || idA.localeCompare(idB));
    npc.brain = {
      ...npc.brain,
      revision: npc.brain.revision + 1,
      beliefs: Object.fromEntries(ranked.slice(0, 32)),
    };
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
