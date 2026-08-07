import type { RealmFullPath } from '@taosim/contracts';
import { DamagePipeline } from '../combat/damage-pipeline.js';

export type FleeResult = 'success' | 'escape-hit' | 'hit' | 'caught';

export interface FleeAttemptInput {
  playerRealm: RealmFullPath;
  enemyRealm: RealmFullPath;
  playerAgility: number;
  enemyAgility: number;
  enemyPersonalityId?: string;
  battleType: 'duel' | 'encounter';
  distanceToEdge: number;
  rng: () => number;
}

const HIGH_PURSUIT = new Set([
  'PERSONALITY_HOT_BLOODED',
  'PERSONALITY_SLY',
  'PERSONALITY_ARROGANT',
  'PERSONALITY_ERRATIC',
  'PERSONALITY_CUNNING',
]);
const LOW_PURSUIT = new Set([
  'PERSONALITY_GENEROUS',
  'PERSONALITY_GENTLE',
  'PERSONALITY_RIGHTEOUS',
  'PERSONALITY_RECLUSIVE',
]);

function personalityMod(id?: string): number {
  if (!id) return 0;
  if (HIGH_PURSUIT.has(id)) return 0.3;
  if (LOW_PURSUIT.has(id)) return -0.3;
  return 0; // 冷漠/未知性格按中性
}

function d20(rng: () => number): number {
  return 1 + Math.floor(rng() * 20);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 逃跑判定（DND d20 对抗）：
 * 1. 敌方高 3 大境界 → 直接 caught（碾压，不掷骰）
 * 2. 追击意愿（性格/战斗类型/境界差修正，clamp 到 [0.05, 0.95]）；不追 → success
 * 3. 对抗检定：玩家 d20+身法-距离 vs 敌方 d20+身法+境界差
 *    diff>=1 success / ==0 escape-hit / -4..-1 hit / <=-5 caught
 */
export function attemptFlee(input: FleeAttemptInput): FleeResult {
  const {
    playerRealm, enemyRealm, playerAgility, enemyAgility,
    enemyPersonalityId, battleType, distanceToEdge, rng,
  } = input;

  const realmDiff =
    DamagePipeline.getRealmTier(enemyRealm) - DamagePipeline.getRealmTier(playerRealm);
  if (realmDiff >= 3) return 'caught';

  let pursuit =
    0.5
    + personalityMod(enemyPersonalityId)
    + (battleType === 'encounter' ? 0.2 : -0.2)
    + (realmDiff > 0 ? 0.1 * realmDiff : -0.15 * -realmDiff);
  pursuit = clamp(pursuit, 0.05, 0.95);
  if (rng() >= pursuit) return 'success';

  const playerRoll = d20(rng) + Math.floor(playerAgility / 10) - distanceToEdge;
  const enemyRoll =
    d20(rng) + Math.floor(enemyAgility / 10) + (realmDiff > 0 ? 2 * realmDiff : -2 * -realmDiff);
  const diff = playerRoll - enemyRoll;
  if (diff >= 1) return 'success';
  if (diff === 0) return 'escape-hit';
  if (diff >= -4) return 'hit';
  return 'caught';
}
