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

/**
 * 战斗结果结算。
 *
 * duel（切磋）：点到为止，玩家 HP 不会真正归零（保底 1）。
 * encounter（遭遇战）：生死搏杀，HP 归零触发 GameOver。
 */
export function resolveBattleOutcome(
  player: Character,
  enemy: Character,
  battleType: BattleType,
): BattleOutcome {
  const playerAlive = player.hp > 0;
  const enemyDead = enemy.hp <= 0;
  const victory = playerAlive && enemyDead;
  const defeat = !playerAlive;

  // 切磋模式：玩家 HP 保底 1，不死亡
  const playerHpAfter = battleType === 'duel' && defeat
    ? Math.max(1, Math.floor(player.maxHp * 0.1))
    : Math.max(0, player.hp);

  // 经验：切磋胜利给 NPC maxExp 的 20%；遭遇战胜利给 30%
  const expGained = victory
    ? Math.round(enemy.cultivation.maxExp * (battleType === 'duel' ? 0.2 : 0.3))
    : 0;

  // 好感度：切磋胜利 +5，失败 +1（输给对方对方也不会太讨厌你）
  // 遭遇战无好感度变化
  const favorabilityChange = battleType === 'duel'
    ? (victory ? 5 : 1)
    : 0;

  // 灵石：仅遭遇战胜利掉落
  const spiritStonesGained = victory && battleType === 'encounter'
    ? Math.round(enemy.spiritStones * 0.5)
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
