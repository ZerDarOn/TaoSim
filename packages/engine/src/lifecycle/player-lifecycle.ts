import type { Character, SoulState } from '@taosim/contracts';
import { getSpiritRootMultiplier } from '../data/spirit-root-table.js';

export interface AdvanceTimeResult {
  updatedPlayer: Character;
  died: boolean;
  causeOfDeath?: string;
}

// 悟性系数: 每点悟性每月产出 0.5 修为
const COMPREHENSION_EXP_RATIO = 0.5;

function getRealmTier(realm: string): number {
  if (realm.startsWith('SoulFormation')) return 5;
  if (realm.startsWith('NascentSoul')) return 4;
  if (realm.startsWith('GoldenCore')) return 3;
  if (realm.startsWith('Foundation')) return 2;
  return 1;
}

export class PlayerLifecycleService {
  /**
   * 推进玩家时间 N 个月。
   * 原子性：老化 + 修为增长 + 灵力恢复 + AP 恢复 + 寿命检查 一体完成。
   * 不可变：返回新对象，不修改入参。
   */
  static advanceTime(player: Character, months: number, monthlySpiritStoneIncome?: number): AdvanceTimeResult {
    return this.advanceElapsedTime(player, months, Math.max(0, Math.floor(months)), monthlySpiritStoneIncome);
  }

  /**
   * 按连续时间与真实跨月次数推进玩家。
   * 年龄/修为是连续量；俸禄、灵力和月度行动点只在跨过月界时结算。
   */
  static advanceElapsedTime(
    player: Character,
    elapsedMonths: number,
    completedMonthBoundaries: number,
    monthlySpiritStoneIncome?: number,
  ): AdvanceTimeResult {
    // 使用 JSON 深拷贝代替 structuredClone，避免 Vue reactive proxy 克隆失败
    const updated: Character = JSON.parse(JSON.stringify(player));
    const safeElapsedMonths = Math.max(0, elapsedMonths);
    const safeMonthBoundaries = Math.max(0, Math.floor(completedMonthBoundaries));

    // 1. 老化 (age 按月累加)
    updated.lifespan.age += safeElapsedMonths / 12;

    // 2. 修为自然增长 (悟性 × 灵根倍率)
    const rootMult = getSpiritRootMultiplier(
      updated.spiritRoot.grade,
      updated.spiritRoot.elements.length,
      updated.spiritRoot.isVariant
    );
    const expGain = updated.attributes.comprehension * safeElapsedMonths * COMPREHENSION_EXP_RATIO * rootMult;
    updated.cultivation.currentExp += expGain;

    // 3. 灵石月度产出（境界俸禄水龙头；不传则不发放）
    if (safeMonthBoundaries > 0 && monthlySpiritStoneIncome && monthlySpiritStoneIncome > 0) {
      updated.spiritStones += Math.floor(monthlySpiritStoneIncome * safeMonthBoundaries);
    }

    // 4/5. 离散月度恢复只在真实跨月时发生，实时小步推进不能反复白嫖。
    if (safeMonthBoundaries > 0) {
      updated.spiritEnergy.current = updated.spiritEnergy.max;
      updated.monthlyActionPoints.current = updated.monthlyActionPoints.max;
    }

    // 6. 寿命检查
    if (updated.lifespan.age >= updated.lifespan.maxLifespan) {
      const tier = getRealmTier(updated.realm);
      const newSoulState: SoulState = tier >= 3 ? 'PrimordialSoul' : 'RemnantSoul';
      updated.soulState = newSoulState;
      return {
        updatedPlayer: updated,
        died: true,
        causeOfDeath: `寿元耗尽（享年 ${Math.floor(updated.lifespan.age)} 岁）`,
      };
    }

    return { updatedPlayer: updated, died: false };
  }
}
