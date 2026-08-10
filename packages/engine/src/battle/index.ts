export { BattleEngine } from './battle-engine.js';
export { BattleAI } from './battle-ai.js';
export type { AiDecision, EngineLike } from './battle-ai.js';
export { calculateDamage, skillToDamageSpec } from './damage-calculator.js';
export type { DamageSpec, DamageResult } from './damage-calculator.js';
export { createSeededRng, seededInt } from './seeded-rng.js';
export { skillRange } from './skill-range.js';
export { BATTLE_CONFIG } from './battle-config.js';
export { attemptFlee } from './flee.js';
export type { FleeAttemptInput, FleeResult } from './flee.js';
// S6 新增：内置技能常量
export { BASIC_ATTACK_SKILL } from './basic-skills.js';
// S6 新增：五类原子解释器统一入口
export {
  interpretSkill,
  interpretGeometry,
  interpretNumeric,
  interpretStatusHook,
  interpretTimeAtb,
  interpretTerrainMutate,
  makeAtomicContext,
  maxRange,
} from './atomic/registry.js';
export type {
  AtomicContext,
  AtomicFailure,
  AtomicOutcome,
  AtomicResult,
  AtbApplication,
  NumericApplication,
  StatusApplication,
} from './atomic/types.js';
export { emptyResult, isAtomicFailure } from './atomic/types.js';
export { STATUS_NORMALIZE } from './atomic/status-hook.js';
export { TERRAIN_MAP } from './atomic/terrain-mutate.js';
// P6：效用评分 AI
export { scoreAction, selectBestAction } from './utility-ai.js';
export type { ActionCandidate, ScoreContext } from './utility-ai.js';
