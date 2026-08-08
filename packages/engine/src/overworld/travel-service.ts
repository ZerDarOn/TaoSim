/**
 * TravelService — 跨大陆/跨星系传送
 *
 * 职责：
 * 1. 校验境界门槛（引擎层强制，UI 禁用只是辅助）
 * 2. 校验灵石数量
 * 3. 校验玩家是否站在传送阵所在格子
 * 4. 原子提交：扣灵石 + 返回新位置（调用方负责切 mapStore）
 *
 * 原子性保证：
 * - canTeleport 返回 ok=true 时，teleport 必定成功
 * - teleport 内部会再次校验，防止 TOCTOU
 */

import type { Character, RealmType, PlayerMapState } from '@taosim/contracts';
import { REALM_ORDER, parseRealm } from '@taosim/contracts';
import {
  getTeleportNode,
  getTeleportNodeAt,
  getContinent,
} from './map-catalog.js';

export interface TeleportCheckResult {
  ok: boolean;
  reason?: string;
  /** 不满足的具体条件（用于 UI 显示） */
  missingRealm?: RealmType;
  missingStones?: number;
}

export interface TeleportExecResult {
  success: boolean;
  reason?: string;
  /** 扣除灵石后的角色（浅拷贝） */
  updatedPlayer: Character;
  /** 目标大陆 id */
  targetContinentId: string;
  /** 目标传送阵所在 nodeId */
  targetNodeId: string;
}

export class TravelService {
  /**
   * 校验是否可以从当前节点传送到目标传送阵。
   *
   * @param player          玩家角色
   * @param mapState        玩家地图状态
   * @param currentNodeId   玩家当前所在的地标 node id
   * @param targetTpId      目标传送阵 id
   */
  static canTeleport(
    player: Character,
    mapState: PlayerMapState,
    currentNodeId: string,
    targetTpId: string,
  ): TeleportCheckResult {
    const targetTp = getTeleportNode(targetTpId);
    if (!targetTp) {
      return { ok: false, reason: '传送阵不存在' };
    }

    // 检查当前节点是否有传送阵
    const sourceTp = getTeleportNodeAt(mapState.activeContinentId, currentNodeId);
    if (!sourceTp) {
      return { ok: false, reason: '当前位置没有传送阵' };
    }

    // 检查连接性
    if (!sourceTp.connections.includes(targetTpId)) {
      return { ok: false, reason: '该传送阵无法到达目标' };
    }

    // 境界校验（取两端最高门槛）
    const requiredRealm = REALM_ORDER[targetTp.requiredRealm] > REALM_ORDER[sourceTp.requiredRealm]
      ? targetTp.requiredRealm
      : sourceTp.requiredRealm;

    const playerRealmType = parseRealm(player.realm).realmType;
    if (!playerRealmType) {
      return { ok: false, reason: '境界数据异常，无法校验传送门槛' };
    }
    const playerRealmOrder = REALM_ORDER[playerRealmType];

    if (playerRealmOrder < REALM_ORDER[requiredRealm]) {
      return {
        ok: false,
        reason: `需要${requiredRealm}以上境界`,
        missingRealm: requiredRealm,
      };
    }

    // 灵石校验
    if (player.spiritStones < targetTp.spiritStoneCost) {
      return {
        ok: false,
        reason: `灵石不足，需要 ${targetTp.spiritStoneCost}`,
        missingStones: targetTp.spiritStoneCost - player.spiritStones,
      };
    }

    // 目标大陆境界校验
    const targetContinent = getContinent(targetTp.continentId);
    if (targetContinent && playerRealmOrder < REALM_ORDER[targetContinent.requiredRealm]) {
      return {
        ok: false,
        reason: `目标大陆需要${targetContinent.requiredRealm}以上境界`,
        missingRealm: targetContinent.requiredRealm,
      };
    }

    return { ok: true };
  }

  /**
   * 执行传送（原子操作）。
   * canTeleport 返回 ok=true 后调用此方法，或直接调用（内部会再校验）。
   *
   * 返回更新后的角色和目标位置。调用方负责：
   * 1. 将 updatedPlayer 写回 store
   * 2. 调用 mapStore.switchContinent()
   */
  static teleport(
    player: Character,
    mapState: PlayerMapState,
    currentNodeId: string,
    targetTpId: string,
  ): TeleportExecResult {
    // 二次校验（防 TOCTOU）
    const check = this.canTeleport(player, mapState, currentNodeId, targetTpId);
    if (!check.ok) {
      return {
        success: false,
        reason: check.reason,
        updatedPlayer: player,
        targetContinentId: mapState.activeContinentId,
        targetNodeId: currentNodeId,
      };
    }

    const targetTp = getTeleportNode(targetTpId)!;

    // 原子扣费（浅拷贝角色，避免中途失败导致状态不一致）
    const updated: Character = { ...player, spiritStones: player.spiritStones - targetTp.spiritStoneCost };

    return {
      success: true,
      updatedPlayer: updated,
      targetContinentId: targetTp.continentId,
      targetNodeId: targetTp.nodeId,
    };
  }
}
