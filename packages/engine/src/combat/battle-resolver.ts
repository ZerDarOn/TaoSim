import type { Character } from '@taosim/contracts';

export type BattleType = 'duel' | 'encounter';

export interface BattleOutcome {
  victory: boolean;
  battleType: BattleType;
  expGained: number;
  favorabilityChange: number;
  spiritStonesGained: number;
  playerHpAfter: number;
  shouldGameOver: boolean;
}

export interface ResolveBattleOutcomeOptions {
  /** 逃跑/投降可能在 HP 归零前结束，由 BattleEngine 提供真实胜方。 */
  forcedWinner?: 'Player' | 'Enemy';
  /** 对手逃跑时可判胜，但不能凭空获得其灵石或完整击败经验。 */
  rewardsAllowed?: boolean;
}

/**
 * 战斗结果结算（多参战者聚合）。
 *
 * 支持 N vs N 战斗：enemies 为全部参战敌人，结算时对全部敌人聚合
 * 经验（duel 20% / encounter 30%）与灵石（encounter 胜利 50%）。
 *
 * duel（切磋）：点到为止，玩家 HP 不会真正归零（保底 1）。
 * encounter（遭遇战）：生死搏杀，HP 归零触发 GameOver。
 * 胜利条件：玩家存活 && 全部敌人阵亡。
 */
export function resolveBattleOutcome(
  player: Character,
  enemies: Character[],
  battleType: BattleType,
  options: ResolveBattleOutcomeOptions = {},
): BattleOutcome {
  const playerAlive = player.hp > 0;
  const enemiesDead = enemies.every(e => e.hp <= 0);
  const victory = options.forcedWinner === 'Player'
    || (options.forcedWinner === undefined && playerAlive && enemiesDead);
  const defeat = options.forcedWinner === 'Enemy' || !playerAlive;
  const rewardsAllowed = options.rewardsAllowed !== false;

  // 切磋模式：玩家 HP 保底 1，不死亡
  const playerHpAfter = battleType === 'duel' && defeat
    ? Math.max(1, Math.floor(player.maxHp * 0.1))
    : Math.max(0, player.hp);

  // 经验：按所有敌人 cultivation.maxExp 聚合，切磋胜利给 20%；遭遇战胜利给 30%
  const expGained = victory && rewardsAllowed
    ? Math.round(enemies.reduce((sum, e) => sum + e.cultivation.maxExp, 0) * (battleType === 'duel' ? 0.2 : 0.3))
    : 0;

  // 好感度：切磋胜利 +5，失败 +1（输给对方对方也不会太讨厌你）
  // 遭遇战无好感度变化
  const favorabilityChange = battleType === 'duel'
    ? (victory ? 5 : 1)
    : 0;

  // 灵石：按所有敌人 spiritStones 聚合，仅遭遇战胜利掉落 50%
  const spiritStonesGained = victory && rewardsAllowed && battleType === 'encounter'
    ? Math.round(enemies.reduce((sum, e) => sum + e.spiritStones, 0) * 0.5)
    : 0;

  // GameOver：仅遭遇战失败
  const shouldGameOver = defeat && battleType === 'encounter';

  return {
    victory,
    battleType,
    expGained,
    favorabilityChange,
    spiritStonesGained,
    playerHpAfter,
    shouldGameOver,
  };
}
