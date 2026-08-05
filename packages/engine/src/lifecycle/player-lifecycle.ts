import type { Character, SoulState } from '@taosim/contracts';

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
  static advanceTime(player: Character, months: number): AdvanceTimeResult {
    const updated: Character = structuredClone(player);

    // 1. 老化 (age 按月累加)
    updated.lifespan.age += months / 12;

    // 2. 修为自然增长 (悟性驱动)
    const expGain = Math.floor(updated.attributes.comprehension * months * COMPREHENSION_EXP_RATIO);
    updated.cultivation.currentExp += expGain;

    // 3. 灵力恢复至满
    updated.spiritEnergy.current = updated.spiritEnergy.max;

    // 4. 行动点恢复 (每月恢复 max)
    updated.monthlyActionPoints.current = updated.monthlyActionPoints.max;

    // 5. 寿命检查
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
