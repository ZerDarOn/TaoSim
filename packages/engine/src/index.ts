// ============================================================
// Engine 索引 — 游戏引擎核心模块
// ============================================================

// World Engine (月度 Tick 驱动)
export { WorldEngine } from './world/world-engine.js';

// Combat Engine (Hex 战棋)
export { CombatEngine } from './combat/combat-engine.js';
export { DamagePipeline } from './combat/damage-pipeline.js';

// Lifecycle Manager (生死轮回)
export { LifecycleManager } from './lifecycle/lifecycle-manager.js';

// AI Service Facade
export { AIServiceFacade } from './ai/ai-service-facade.js';

// Economy Engine (灵石经济)
export { EconomyEngine } from './economy/economy-engine.js';
