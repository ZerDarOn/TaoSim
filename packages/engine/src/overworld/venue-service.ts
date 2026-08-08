/**
 * VenueService — 城镇内部场所管理
 *
 * 职责：
 * 1. 列出某地标节点的所有可进入场所
 * 2. 校验场所的境界门槛
 * 3. 进入/离开场所
 *
 * 场所是"固定场景列表"，不做六边形探索。
 * 每个场所对应一个玩法面板（酒馆/商铺/传送院/民居/任务榜/宗门大殿/练功场）。
 */

import type { Character, VenueDef, VenueType } from '@taosim/contracts';
import { REALM_ORDER, parseRealm } from '@taosim/contracts';
import { getVenuesByNode, getVenue } from './map-catalog.js';

export interface VenueEnterCheck {
  ok: boolean;
  reason?: string;
}

export const VENUE_TYPE_LABEL: Record<VenueType, string> = {
  tavern: '酒馆',
  shop: '商铺',
  teleport_office: '传送院',
  residential: '民居',
  quest_board: '任务榜',
  sect_hall: '宗门大殿',
  training_ground: '练功场',
};

export const VENUE_TYPE_ICON: Record<VenueType, string> = {
  tavern: '酒',
  shop: '铺',
  teleport_office: '阵',
  residential: '宅',
  quest_board: '榜',
  sect_hall: '殿',
  training_ground: '功',
};

export class VenueService {
  /** 获取某节点的所有场所 */
  static listVenues(nodeId: string): VenueDef[] {
    return getVenuesByNode(nodeId);
  }

  /** 校验是否能进入某场所 */
  static canEnter(player: Character, venueId: string): VenueEnterCheck {
    const venue = getVenue(venueId);
    if (!venue) return { ok: false, reason: '场所不存在' };

    if (venue.requiredRealm) {
      const playerRealmType = parseRealm(player.realm).realmType;
      if (!playerRealmType) {
        return { ok: false, reason: '境界数据异常，无法校验场所门槛' };
      }
      const playerRealmOrder = REALM_ORDER[playerRealmType];
      if (playerRealmOrder < REALM_ORDER[venue.requiredRealm]) {
        return { ok: false, reason: `需要${venue.requiredRealm}以上境界` };
      }
    }
    return { ok: true };
  }

  /**
   * 进入场所。
   * 返回是否成功 + 场所信息。调用方负责更新 mapStore.activeVenueId。
   */
  static enter(player: Character, venueId: string): { success: boolean; venue?: VenueDef; reason?: string } {
    const check = this.canEnter(player, venueId);
    if (!check.ok) return { success: false, reason: check.reason };
    return { success: true, venue: getVenue(venueId) };
  }
}
