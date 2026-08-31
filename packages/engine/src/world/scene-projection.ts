// ============================================================
// 场景投影 — S2：NpcRecord → 临时 Character 的场景感知展开
//
// 包装 npcRecordToCharacter，根据场景类型与长期状态（伤势/经脉损伤）
// 在投影时精算战斗数值上限。纯函数，不修改输入 NpcRecord。
// ============================================================

import type { Character, Item, NpcRecord, PersistentCondition, SocialState } from '@taosim/contracts';
import { npcRecordToCharacter } from './npc-record-mapper.js';
import { EquipmentManager } from '../equipment/equipment-manager.js';
import { realmTier } from './npc-record-mapper.js';

/** 场景类型：决定投影时哪些字段需要精算 */
export type SceneType = 'battle' | 'trade' | 'dialog' | 'display';

/**
 * 场景投影选项
 */
export interface ExpandOptions {
  /** 场景类型 */
  sceneType: SceneType;
  /** NPC 长期状态（伤势/毒素，影响 hp/spiritEnergy 上限） */
  condition?: PersistentCondition;
  /** 统一社交状态（如提供则覆盖默认 relations） */
  socialState?: SocialState;
  /** 当前年份/月份（用于伤势恢复判定） */
  currentTime?: { year: number; month: number };
}

/** 伤势等级 → HP 上限扣减 */
const INJURY_HP_PENALTY: Record<'minor' | 'moderate' | 'severe' | 'critical', number> = {
  minor: 5,
  moderate: 15,
  severe: 30,
  critical: 50,
};

/**
 * 场景投影：从 NpcRecord 展开为临时 Character。
 *
 * 纯函数，不修改 NpcRecord。同一 record + 同一 options 确定性输出。
 *
 * - battle：满状态展开（战斗开始本应满 HP），伤势降低 maxHp 上限
 * - trade：需要 inventory（当前 NPC 无背包，返回空）
 * - dialog/display：展示用，数值精度不重要
 */
export function expandForScene(record: NpcRecord, options: ExpandOptions): Character {
  // 基础投影：复用现有转换器
  const character = npcRecordToCharacter(record);

  // 长期状态修正：伤势影响 hp 上限（仅 battle 场景精算）
  if (options.condition && options.sceneType === 'battle') {
    const injuryPenalty = computeInjuryHpPenalty(options.condition, options.currentTime);
    if (injuryPenalty > 0) {
      const reducedMax = Math.max(1, character.maxHp - injuryPenalty);
      character.maxHp = reducedMax;
      character.hp = Math.min(character.hp, reducedMax);
    }

    // 经脉损伤影响灵力上限
    if (options.condition.meridianDamage > 0) {
      const meridianPenalty = Math.floor(
        (character.spiritEnergy.max * options.condition.meridianDamage) / 100,
      );
      character.spiritEnergy.max = Math.max(1, character.spiritEnergy.max - meridianPenalty);
      character.spiritEnergy.current = character.spiritEnergy.max;
    }
  }

  if (options.sceneType === 'battle' && EquipmentManager.getCombatBonuses(character).attack <= 0) {
    const tier = realmTier(record.realm);
    const weapon: Item = {
      id: `realm_${record.id}_weapon`, name: '本命兵刃', tier, type: 'Equipment',
      attributes: { attack: 10 + tier * 5 + Math.floor(record.attributes.comprehension * 0.5) },
      element: record.weaponElement ?? 'Physical',
    };
    character.equipmentSlots = { ...character.equipmentSlots, weapon };
  }

  return character;
}

/**
 * 计算伤势导致的 HP 上限扣减。
 * 已过期的伤势不再影响（recoversAt 早于 currentTime 则忽略）。
 */
function computeInjuryHpPenalty(
  condition: PersistentCondition,
  currentTime?: { year: number; month: number },
): number {
  let totalPenalty = 0;
  for (const injury of condition.injuries) {
    // 跳过已恢复的伤势：recoversAt 早于或等于 currentTime 视为已恢复
    if (injury.recoversAt && currentTime) {
      const elapsedMonths =
        (currentTime.year - injury.recoversAt.year) * 12 +
        (currentTime.month - injury.recoversAt.month);
      if (elapsedMonths >= 0) continue; // 已恢复
    }

    totalPenalty += INJURY_HP_PENALTY[injury.level];
  }
  return totalPenalty;
}
