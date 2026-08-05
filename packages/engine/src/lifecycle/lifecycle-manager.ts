import type { Character, SoulState } from '@taosim/contracts';

export interface DeathResult {
  characterId: string;
  previousSoulState: SoulState;
  newSoulState: SoulState;
  causeOfDeath: string;
}

/**
 * 生死轮回管理器 — 架构规范 §6。
 *
 * 4 阶死亡状态机：
 *   Active → PrimordialSoul（元神出窍）/ RemnantSoul（残魂）/ Oblivion（湮灭）
 */
export class LifecycleManager {
  /**
   * 处理角色死亡。
   * 高阶（金丹及以上）→ 元神出窍；低阶 → 残魂/湮灭。
   */
  public static handleDeath(character: Character, cause: string): DeathResult {
    const previous = character.soulState;
    const tier = LifecycleManager.getRealmTier(character.realm);

    let newState: SoulState;
    if (tier >= 3) {
      // 金丹及以上：元神出窍，可夺舍
      newState = 'PrimordialSoul';
    } else {
      newState = 'RemnantSoul';
    }

    return {
      characterId: character.id,
      previousSoulState: previous,
      newSoulState: newState,
      causeOfDeath: cause,
    };
  }

  /**
   * 寿元耗尽检测（坐化管线）。
   * 高阶 NPC 提前 12 个月挂载预警，低阶直接结算。
   */
  public static checkLifespan(character: Character): { willDie: boolean; monthsRemaining: number } {
    const remaining = character.lifespan.maxLifespan - character.lifespan.age;
    const willDie = remaining <= 0;
    return { willDie, monthsRemaining: remaining };
  }

  private static getRealmTier(realm: string): number {
    if (realm.startsWith('SoulFormation')) return 5;
    if (realm.startsWith('NascentSoul')) return 4;
    if (realm.startsWith('GoldenCore')) return 3;
    if (realm.startsWith('Foundation')) return 2;
    return 1;
  }
}
